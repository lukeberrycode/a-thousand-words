import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { fingerprint } from "@/lib/image-hash";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { checkFiles } from "./check";
import { checksum } from "./checksum";
import { CONTENT_USER, type ContentFile } from "./operations";
import { paintingsToFetch, planFile, type Change, type ContentState, type Fetched, type Plan } from "./plan";

// Applies content files to a database (ADR 0026), as `prisma migrate` applies schema migrations:
// each file once, in order, recorded in ContentMigration. The planner (plan.ts) decides what to do;
// this file reads the state it needs and makes the writes, one transaction per file.

type Db = PrismaClient | Prisma.TransactionClient;

/** Where content paintings' files go: R2, or the mock in tests. */
export type ImageStore = {
  put(key: string, bytes: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
};

export type RunOptions = {
  /** Apply the files. Without it, only print what each would do. */
  yes: boolean;
  /** Fetch a painting from its `source`. Null if there's no such file. */
  download: (source: string) => Promise<Uint8Array | null>;
  store: ImageStore;
  log?: (line: string) => void;
  /** Pause between downloads, to be gentle with Wikimedia. */
  delayMs?: number;
};

/** A file of 25 paintings needs far longer than Prisma's default of 5 seconds. */
const TRANSACTION = { timeout: 120_000, maxWait: 30_000 };

/** Every image, box and collection, for the planner. */
export async function loadState(db: Db): Promise<ContentState> {
  const [images, regions, collections] = await Promise.all([
    db.image.findMany({
      select: { id: true, contentKey: true, ownerId: true, title: true, storageKey: true, sha256: true, phash: true },
    }),
    db.region.findMany({
      select: {
        id: true,
        imageId: true,
        contentKey: true,
        authorId: true,
        x: true,
        y: true,
        w: true,
        h: true,
        annotations: { select: { id: true, authorId: true, bodyMarkdown: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.collection.findMany({
      select: { id: true, slug: true, sortOrder: true, images: { select: { imageId: true, position: true } } },
    }),
  ]);
  return {
    contentUserId: CONTENT_USER.id,
    images,
    regions: regions.map(({ annotations, ...r }) => ({
      ...r,
      annotations: annotations.map((a) => ({ id: a.id, authorId: a.authorId, body: a.bodyMarkdown })),
    })),
    collections: collections.map(({ images: members, ...c }) => ({ ...c, members })),
  };
}

export type Status = {
  applied: { name: string; appliedAt: Date }[];
  pending: ContentFile[];
  /**
   * Reasons to apply nothing: a bad file, a changed applied file, an applied file that's gone, or a
   * pending file numbered before one already applied.
   */
  problems: string[];
};

/** Which files this database has applied, which are pending, and anything wrong. */
export async function contentStatus(db: Db, files: ContentFile[]): Promise<Status> {
  const problems = checkFiles(files);
  const rows = await db.contentMigration.findMany({ orderBy: { name: "asc" } });
  const byName = new Map(files.map((f) => [f.name, f]));
  for (const row of rows) {
    const file = byName.get(row.name);
    if (!file) problems.push(`${row.name} was applied to this database, but isn't in prisma/content.`);
    else if (checksum(file.operations) !== row.checksum) {
      problems.push(`${row.name} has changed since it was applied. Put it back, and make the change in a new file.`);
    }
  }
  const done = new Set(rows.map((r) => r.name));
  const last = rows.at(-1)?.name;
  for (const f of files) {
    if (last && !done.has(f.name) && f.name < last) {
      problems.push(`${f.name} comes before ${last}, which is already applied. Renumber it to come last.`);
    }
  }
  return {
    applied: rows.map(({ name, appliedAt }) => ({ name, appliedAt })),
    pending: files.filter((f) => !done.has(f.name)),
    problems,
  };
}

/**
 * Plan every pending file and print what it would do; with `yes`, apply each in its own
 * transaction. Refuses to start if `contentStatus` finds a problem. Returns the files applied.
 */
export async function applyContent(db: PrismaClient, files: ContentFile[], options: RunOptions): Promise<string[]> {
  const log = options.log ?? console.log;
  const status = await contentStatus(db, files);
  if (status.problems.length > 0) {
    throw new Error(`Nothing applied:\n${status.problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  if (status.pending.length === 0) {
    log("Nothing to apply: every content file has been applied.");
    return [];
  }

  const applied: string[] = [];
  // A dry run plans each file against the state the files before it would leave.
  let state = await loadState(db);
  for (const file of status.pending) {
    const plan = await applyFile(db, file, state, options);
    if (options.yes) {
      applied.push(file.name);
      state = await loadState(db);
    } else {
      state = plan.after;
    }
  }
  if (!options.yes) log("\nDry run. Check the database and bucket above, then re-run with --yes to apply.");
  return applied;
}

/**
 * Plan one file against `state` and print the plan. With `yes`, apply it in one transaction,
 * together with its ContentMigration row, planning again inside the transaction. Returns the plan
 * applied, or for a dry run the plan printed. `applyContent` calls this for each pending file,
 * after checking them all.
 */
export async function applyFile(db: PrismaClient, file: ContentFile, state: ContentState, options: RunOptions) {
  const log = options.log ?? console.log;
  const downloads = await fetchPaintings(state, file, options);
  const fetched = new Map([...downloads].map(([key, d]) => [key, d && d.fingerprint]));
  const plan = planFile(state, file.operations, fetched);
  printPlan(file.name, plan, log);
  if (!options.yes) return plan;

  // Upload first: R2 isn't part of the transaction. If it then fails, the files are orphans,
  // which the nightly cleanup removes (ADR 0018).
  const uploaded = new Set<string>();
  for (const change of plan.changes) {
    if (change.kind === "addPainting") {
      await options.store.put(change.storageKey, downloads.get(change.key)!.bytes);
      uploaded.add(change.key);
    }
  }

  const { fresh, removed } = await db.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: CONTENT_USER.id },
      update: {},
      create: { ...CONTENT_USER, approvedAt: new Date() },
    });
    // Plan again: a user may have added a box since the plan above.
    const fresh = planFile(await loadState(tx), file.operations, fetched);
    for (const c of fresh.changes) {
      if (c.kind === "addPainting" && !uploaded.has(c.key)) {
        throw new Error(`${c.key} wasn't uploaded: the site changed during the run. Run it again.`);
      }
    }
    const result = await applyPlan(tx, fresh);
    await tx.contentMigration.create({
      data: {
        name: file.name,
        checksum: checksum(file.operations),
        summary: {
          changes: fresh.changes.map((c) => c.text),
          skipped: [...fresh.skipped, ...result.skipped],
          unmatched: fresh.unmatched,
        },
      },
    });
    return { fresh, removed: result.storageKeys };
  }, TRANSACTION);

  for (const key of removed) {
    try {
      await options.store.remove(key);
    } catch (err) {
      // The rows are gone. A leftover file is an orphan, which the nightly cleanup removes.
      log(`  Couldn't delete ${key} from R2: ${(err as Error).message}`);
    }
  }
  const texts = (p: Plan) => JSON.stringify([p.changes.map((c) => c.text), p.skipped]);
  if (texts(fresh) !== texts(plan)) {
    log("  Users changed the site during the run, so the file was planned again:");
    printPlan(file.name, fresh, log);
  }
  log(`  Applied ${file.name}.`);
  return fresh;
}

type Download = { bytes: Uint8Array; fingerprint: NonNullable<Fetched> } | null;

/** Downloads and fingerprints each painting the file adds that isn't on the site yet. */
async function fetchPaintings(state: ContentState, file: ContentFile, options: RunOptions) {
  const downloads = new Map<string, Download>();
  for (const [i, op] of paintingsToFetch(state, file.operations).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, options.delayMs ?? 1000));
    const bytes = await options.download(op.source);
    if (bytes && bytes.length > MAX_UPLOAD_BYTES) throw new Error(`${op.key} is over the upload size limit.`);
    // Size and duplicate-detection hashes, exactly as createImage computes them.
    downloads.set(op.key, bytes && { bytes, fingerprint: await fingerprint(bytes) });
  }
  return downloads;
}

function printPlan(name: string, plan: Plan, log: (line: string) => void) {
  log(
    `\n${name}: ${plan.changes.length} changes, ${plan.skipped.length} skipped, ${plan.unchanged.length} already done`,
  );
  for (const c of plan.changes) log(`  + ${c.text}`);
  for (const s of plan.skipped) log(`  ! skipped: ${s}`);
  for (const u of plan.unmatched) log(`  ? no file claims ${u}`);
}

/**
 * Makes a plan's writes. Each `where` names the content account and repeats the planner's guards,
 * so even a wrong plan can't change a user's row: the query wouldn't match it. A write that
 * unexpectedly matches nothing means the data changed during the run, and throws, which rolls the
 * whole file back. Returns the R2 files to delete once the transaction commits.
 */
async function applyPlan(tx: Prisma.TransactionClient, plan: Plan) {
  const me = CONTENT_USER.id;
  const ids = new Map<string, string>();
  const id = (planned: string) => ids.get(planned) ?? planned;
  const storageKeys: string[] = [];
  const skipped: string[] = [];
  // Pages list boxes oldest first; space the timestamps a millisecond apart so they keep the file's order.
  const start = Date.now();
  let boxes = 0;

  const one = (count: number, change: Change) => {
    if (count !== 1) throw new Error(`"${change.text}" matched ${count} rows: the data changed during the run.`);
  };
  // Under READ COMMITTED, a guard in a statement's WHERE can't see a user's insert that's still
  // uncommitted, and a cascade would then remove it. Locking the rows first makes such an insert
  // finish, or wait for this transaction; the guarded statement that follows then sees it.
  const lockImage = (imageId: string) =>
    tx.$queryRaw`SELECT 1 FROM "Image" WHERE id = ${imageId} AND "ownerId" = ${me} FOR UPDATE`;
  const lockRegions = (where: { imageId: string } | { id: string }) =>
    "id" in where
      ? tx.$queryRaw`SELECT 1 FROM "Region" WHERE id = ${where.id} FOR UPDATE`
      : tx.$queryRaw`SELECT 1 FROM "Region" WHERE "imageId" = ${where.imageId} FOR UPDATE`;

  for (const c of plan.changes) {
    switch (c.kind) {
      case "addPainting": {
        const { title, description, storageKey, width, height, sha256, phash } = c;
        const row = await tx.image.create({
          data: { title, description, storageKey, width, height, sha256, phash, contentKey: c.key, ownerId: me },
          select: { id: true },
        });
        ids.set(c.id, row.id);
        break;
      }
      case "adoptPainting":
        one(
          (
            await tx.image.updateMany({
              where: { id: c.imageId, ownerId: me, contentKey: null },
              data: { contentKey: c.key },
            })
          ).count,
          c,
        );
        break;
      case "addRegion": {
        const row = await tx.region.create({
          data: {
            imageId: id(c.imageId),
            authorId: me,
            contentKey: c.key,
            ...c.region,
            createdAt: new Date(start + boxes++),
            annotations: { create: { authorId: me, bodyMarkdown: c.body } },
          },
          select: { id: true, annotations: { select: { id: true } } },
        });
        ids.set(c.id, row.id);
        ids.set(`new:annotation:${c.key}`, row.annotations[0].id);
        break;
      }
      case "adoptRegion":
        one(
          (
            await tx.region.updateMany({
              where: { id: c.regionId, authorId: me, contentKey: null },
              data: { contentKey: c.key },
            })
          ).count,
          c,
        );
        break;
      case "editAnnotation":
        one(
          (
            await tx.annotation.updateMany({
              where: { id: id(c.annotationId), authorId: me, region: { contentKey: c.key } },
              data: { bodyMarkdown: c.body },
            })
          ).count,
          c,
        );
        if (c.region) {
          // Only the content account's box, and only while every annotation on it is the content account's.
          await lockRegions({ id: id(c.regionId) });
          one(
            (
              await tx.region.updateMany({
                where: { id: id(c.regionId), authorId: me, annotations: { every: { authorId: me } } },
                data: c.region,
              })
            ).count,
            c,
          );
        }
        break;
      case "removeAnnotation":
        one((await tx.annotation.deleteMany({ where: { id: id(c.annotationId), authorId: me } })).count, c);
        await lockRegions({ id: id(c.regionId) });
        await tx.region.deleteMany({ where: { id: id(c.regionId), authorId: me, annotations: { none: {} } } });
        break;
      case "removePainting": {
        // The guard is part of the delete itself, after locking the image and its boxes, so an
        // annotation added a moment ago can't be lost to the cascade.
        const imageId = id(c.imageId);
        await lockImage(imageId);
        await lockRegions({ imageId });
        const rows = await tx.$queryRaw<{ storageKey: string }[]>`
          DELETE FROM "Image" i
          WHERE i.id = ${imageId} AND i."ownerId" = ${me}
            AND NOT EXISTS (
              SELECT 1 FROM "Annotation" a JOIN "Region" r ON r.id = a."regionId"
              WHERE r."imageId" = i.id AND a."authorId" <> ${me})
          RETURNING i."storageKey"`;
        if (rows.length === 0) skipped.push(`${c.text}: someone else annotated it during the run`);
        else storageKeys.push(rows[0].storageKey);
        break;
      }
      case "addCollection": {
        const { id: planned, slug, name, blurb, sortOrder } = c;
        const row = await tx.collection.create({ data: { slug, name, blurb, sortOrder }, select: { id: true } });
        ids.set(planned, row.id);
        break;
      }
      case "addToCollection":
        await tx.collectionImage.create({
          data: { collectionId: id(c.collectionId), imageId: id(c.imageId), position: c.position },
        });
        break;
      case "removeFromCollection":
        one(
          (
            await tx.collectionImage.deleteMany({
              where: { collectionId: id(c.collectionId), imageId: id(c.imageId), image: { ownerId: me } },
            })
          ).count,
          c,
        );
        break;
    }
  }
  return { storageKeys, skipped };
}
