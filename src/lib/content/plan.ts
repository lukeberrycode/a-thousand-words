import { checkBody, checkRegion } from "@/lib/annotations";
import { SIMILAR_MAX_DISTANCE, hashDistance, type ImageFingerprint } from "@/lib/image-hash";
import { findClash } from "@/lib/overlap";
import type { Region } from "@/lib/regions";
import { contentStorageKey, type Operation } from "./operations";

// The content planner (ADR 0026): the database's current state plus a content file gives the
// changes to make, and the steps skipped because they'd affect someone else's content. It's pure,
// so the dry run prints exactly what the run will do, and the runner plans again inside its
// transaction to take in anything users changed since.

export type StateImage = {
  id: string;
  contentKey: string | null;
  ownerId: string;
  title: string;
  storageKey: string;
  sha256: string | null;
  phash: bigint | null;
};

export type StateAnnotation = { id: string; authorId: string; body: string };

export type StateRegion = Region & {
  id: string;
  imageId: string;
  contentKey: string | null;
  authorId: string;
  annotations: StateAnnotation[];
};

export type StateCollection = {
  id: string;
  slug: string;
  sortOrder: number;
  members: { imageId: string; position: number }[];
};

/** Every image, box and collection on the site, as the planner needs them. */
export type ContentState = {
  /** The content account's user id. */
  contentUserId: string;
  images: StateImage[];
  regions: StateRegion[];
  collections: StateCollection[];
};

/** A painting downloaded from Commons, or null if Commons has no such file. */
export type Fetched = Pick<ImageFingerprint, "width" | "height" | "sha256" | "phash"> | null;

/**
 * One write to make. Ids starting `new:` stand for rows an earlier change in the same plan
 * creates; the runner swaps in the real ids as it goes.
 */
export type Change = { text: string } & (
  | {
      kind: "addPainting";
      id: string;
      key: string;
      title: string;
      description: string;
      storageKey: string;
      width: number;
      height: number;
      sha256: string;
      phash: bigint;
    }
  | { kind: "adoptPainting"; key: string; imageId: string }
  | { kind: "addRegion"; id: string; key: string; imageId: string; region: Region; body: string }
  | { kind: "adoptRegion"; key: string; regionId: string }
  | { kind: "editAnnotation"; key: string; regionId: string; annotationId: string; body: string; region?: Region }
  | { kind: "removeAnnotation"; key: string; regionId: string; annotationId: string }
  | { kind: "removePainting"; key: string; imageId: string; storageKey: string }
  | { kind: "addCollection"; id: string; slug: string; name: string; blurb: string; sortOrder: number }
  | { kind: "addToCollection"; collectionId: string; imageId: string; position: number }
  | { kind: "removeFromCollection"; collectionId: string; imageId: string }
);

export type Plan = {
  changes: Change[];
  /** Steps refused because they'd affect someone else's content, or couldn't be done. */
  skipped: string[];
  /** Steps with nothing to do: already done, or already undone. */
  unchanged: string[];
  /** The content account's images and boxes with no content key: rows no file has claimed. */
  unmatched: string[];
  /** The state once the changes are made, for planning the next file. */
  after: ContentState;
};

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const sameBox = (a: Region, b: Region) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * The `addPainting` steps that need the file from Commons: those whose painting isn't on the site
 * yet. The runner downloads these before planning.
 */
export function paintingsToFetch(state: ContentState, operations: Operation[]) {
  const keys = new Set(state.images.map((i) => i.contentKey));
  const storageKeys = new Set(state.images.map((i) => i.storageKey));
  return operations.flatMap((o) =>
    o.op === "addPainting" && !keys.has(o.key) && !storageKeys.has(contentStorageKey(o.key)) ? [o] : [],
  );
}

/**
 * Plan one content file against the state. `fetched` holds a download for each painting that
 * `paintingsToFetch` named. Nothing in the plan updates or removes a row belonging to anyone but
 * the content account, apart from collection memberships of content paintings.
 */
export function planFile(state: ContentState, operations: Operation[], fetched: Map<string, Fetched>): Plan {
  const s: ContentState = structuredClone(state);
  const me = s.contentUserId;
  const changes: Change[] = [];
  const skipped: string[] = [];
  const unchanged: string[] = [];

  const image = (key: string) => s.images.find((i) => i.contentKey === key);
  const region = (key: string) => s.regions.find((r) => r.contentKey === key);
  const collection = (slug: string) => s.collections.find((c) => c.slug === slug);
  const regionsOn = (imageId: string) => s.regions.filter((r) => r.imageId === imageId);
  const othersOn = (r: StateRegion) => r.annotations.filter((a) => a.authorId !== me);

  /** Describes the box a new or moved box clashes with. */
  const clashText = (clash: StateRegion) =>
    clash.authorId === me && clash.contentKey
      ? `content box ${clash.contentKey}`
      : clash.authorId === me
        ? "a content box no file has claimed"
        : "another user's box";

  for (const o of operations) {
    switch (o.op) {
      case "addPainting": {
        const label = `add painting ${o.key}`;
        if (image(o.key)) {
          unchanged.push(`${label}: already on the site`);
          break;
        }
        const storageKey = contentStorageKey(o.key);
        const existing = s.images.find((i) => i.storageKey === storageKey);
        if (existing) {
          if (existing.ownerId === me && existing.contentKey === null) {
            existing.contentKey = o.key;
            changes.push({ kind: "adoptPainting", key: o.key, imageId: existing.id, text: `match painting ${o.key}` });
          } else {
            skipped.push(`${label}: its file ${storageKey} belongs to another image`);
          }
          break;
        }
        const file = fetched.get(o.key);
        if (file === undefined) throw new Error(`${o.key} wasn't downloaded before planning.`);
        if (file === null) {
          skipped.push(`${label}: not found on Wikimedia Commons (${o.source})`);
          break;
        }
        // ADR 0010: refuse a copy of any image on the site, so a user's upload isn't split in two.
        const duplicate = s.images.find(
          (i) =>
            i.sha256 === file.sha256 || (i.phash !== null && hashDistance(i.phash, file.phash) <= SIMILAR_MAX_DISTANCE),
        );
        if (duplicate) {
          skipped.push(`${label}: looks the same as "${duplicate.title}", already on the site`);
          break;
        }
        const id = `new:image:${o.key}`;
        s.images.push({ id, contentKey: o.key, ownerId: me, title: o.title, storageKey, ...file });
        changes.push({
          kind: "addPainting",
          id,
          key: o.key,
          title: o.title,
          description: o.description,
          storageKey,
          ...file,
          text: `add painting ${o.key} (${file.width}×${file.height})`,
        });
        break;
      }

      case "annotate": {
        const label = `annotate ${o.key}`;
        if (region(o.key)) {
          unchanged.push(`${label}: already on the site`);
          break;
        }
        const painting = image(o.painting);
        if (!painting) {
          skipped.push(`${label}: painting ${o.painting} isn't on the site`);
          break;
        }
        // A box the old seed made with this exact text: give it the key rather than add another.
        const match = regionsOn(painting.id).find(
          (r) =>
            r.contentKey === null &&
            r.authorId === me &&
            r.annotations.length === 1 &&
            r.annotations[0].authorId === me &&
            r.annotations[0].body === o.body,
        );
        if (match) {
          match.contentKey = o.key;
          changes.push({ kind: "adoptRegion", key: o.key, regionId: match.id, text: `match annotation ${o.key}` });
          break;
        }
        const problem = checkRegion(o.region) ?? checkBody(o.body);
        if (problem) {
          skipped.push(`${label}: ${problem}`);
          break;
        }
        const id = `new:region:${o.key}`;
        const clash = findClash({ id, ...o.region }, regionsOn(painting.id));
        if (clash) {
          skipped.push(`${label}: the box would hide, or be hidden by, ${clashText(clash as StateRegion)}`);
          break;
        }
        s.regions.push({
          id,
          imageId: painting.id,
          contentKey: o.key,
          authorId: me,
          ...o.region,
          annotations: [{ id: `new:annotation:${o.key}`, authorId: me, body: o.body }],
        });
        changes.push({
          kind: "addRegion",
          id,
          key: o.key,
          imageId: painting.id,
          region: o.region,
          body: o.body,
          text: `annotate ${o.key}: ${short(o.body)}`,
        });
        break;
      }

      case "editAnnotation": {
        const label = `edit ${o.key}`;
        const r = region(o.key);
        const mine = r?.authorId === me ? r.annotations.find((a) => a.authorId === me) : undefined;
        if (!r || !mine) {
          skipped.push(`${label}: no content annotation with this key is on the site`);
          break;
        }
        const problem = (o.region && checkRegion(o.region)) || checkBody(o.body);
        if (problem) {
          skipped.push(`${label}: ${problem}`);
          break;
        }
        const move = o.region && !sameBox(o.region, r) ? o.region : undefined;
        if (move) {
          if (othersOn(r).length > 0) {
            skipped.push(`${label}: the box holds other people's annotations, so it can't move`);
            break;
          }
          const clash = findClash({ id: r.id, ...move }, regionsOn(r.imageId));
          if (clash) {
            skipped.push(`${label}: the moved box would hide, or be hidden by, ${clashText(clash as StateRegion)}`);
            break;
          }
        }
        if (!move && mine.body === o.body) {
          unchanged.push(`${label}: already says this`);
          break;
        }
        mine.body = o.body;
        if (move) Object.assign(r, move);
        changes.push({
          kind: "editAnnotation",
          key: o.key,
          regionId: r.id,
          annotationId: mine.id,
          body: o.body,
          region: move,
          text: `edit ${o.key}${move ? " and move its box" : ""}: ${short(o.body)}`,
        });
        break;
      }

      case "removeAnnotation": {
        const label = `remove ${o.key}`;
        const r = region(o.key);
        const mine = r?.authorId === me ? r.annotations.find((a) => a.authorId === me) : undefined;
        if (!r || !mine) {
          unchanged.push(`${label}: not on the site`);
          break;
        }
        r.annotations = r.annotations.filter((a) => a !== mine);
        if (r.annotations.length === 0) s.regions = s.regions.filter((x) => x !== r);
        changes.push({
          kind: "removeAnnotation",
          key: o.key,
          regionId: r.id,
          annotationId: mine.id,
          text: `remove ${o.key}${r.annotations.length > 0 ? " (its box stays: it holds other annotations)" : ""}`,
        });
        break;
      }

      case "removePainting": {
        const label = `remove painting ${o.key}`;
        const painting = image(o.key);
        if (!painting) {
          unchanged.push(`${label}: not on the site`);
          break;
        }
        if (painting.ownerId !== me) {
          skipped.push(`${label}: it belongs to another user`);
          break;
        }
        const regions = regionsOn(painting.id);
        if (regions.some((r) => othersOn(r).length > 0)) {
          skipped.push(`${label}: someone else has annotated it`);
          break;
        }
        s.images = s.images.filter((i) => i !== painting);
        s.regions = s.regions.filter((r) => r.imageId !== painting.id);
        for (const c of s.collections) c.members = c.members.filter((m) => m.imageId !== painting.id);
        changes.push({
          kind: "removePainting",
          key: o.key,
          imageId: painting.id,
          storageKey: painting.storageKey,
          text: label,
        });
        break;
      }

      case "addCollection": {
        if (collection(o.slug)) {
          unchanged.push(`add collection ${o.slug}: already on the site`);
          break;
        }
        const id = `new:collection:${o.slug}`;
        const sortOrder = Math.max(-1, ...s.collections.map((c) => c.sortOrder)) + 1;
        s.collections.push({ id, slug: o.slug, sortOrder, members: [] });
        changes.push({
          kind: "addCollection",
          id,
          slug: o.slug,
          name: o.name,
          blurb: o.blurb,
          sortOrder,
          text: `add collection ${o.slug}`,
        });
        break;
      }

      case "addToCollection": {
        const c = collection(o.collection);
        if (!c) {
          skipped.push(`add to collection ${o.collection}: no such collection on the site`);
          break;
        }
        for (const key of o.paintings) {
          const label = `add ${key} to ${o.collection}`;
          const painting = image(key);
          if (!painting) skipped.push(`${label}: painting ${key} isn't on the site`);
          else if (c.members.some((m) => m.imageId === painting.id)) unchanged.push(`${label}: already in it`);
          else {
            const position = Math.max(-1, ...c.members.map((m) => m.position)) + 1;
            c.members.push({ imageId: painting.id, position });
            changes.push({ kind: "addToCollection", collectionId: c.id, imageId: painting.id, position, text: label });
          }
        }
        break;
      }

      case "removeFromCollection": {
        const c = collection(o.collection);
        for (const key of o.paintings) {
          const label = `remove ${key} from ${o.collection}`;
          const painting = image(key);
          if (!c || !painting || !c.members.some((m) => m.imageId === painting.id)) {
            unchanged.push(`${label}: not in it`);
          } else {
            c.members = c.members.filter((m) => m.imageId !== painting.id);
            changes.push({ kind: "removeFromCollection", collectionId: c.id, imageId: painting.id, text: label });
          }
        }
        break;
      }
    }
  }

  const titles = new Map(s.images.map((i) => [i.id, i.title]));
  const unmatched = [
    ...s.images.filter((i) => i.ownerId === me && i.contentKey === null).map((i) => `painting "${i.title}"`),
    ...s.regions
      .filter((r) => r.authorId === me && r.contentKey === null)
      .map((r) => {
        const body = r.annotations.find((a) => a.authorId === me)?.body;
        return `annotation on "${titles.get(r.imageId)}": ${body ? short(body) : "(only other people's annotations)"}`;
      }),
  ];

  return { changes, skipped, unchanged, unmatched, after: s };
}
