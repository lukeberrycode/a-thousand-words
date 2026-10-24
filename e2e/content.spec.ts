import { randomBytes } from "node:crypto";
import { checksum } from "@/lib/content/checksum";
import { CONTENT_USER, type ContentFile, type Operation } from "@/lib/content/operations";
import type { Region } from "@/lib/regions";
import { applyTestFile, newTag, removeTestContent, sourceFor, testStatus } from "./support/content";
import { ImagePage } from "./support/image-page";
import { newSeed } from "./support/pictures";
import { objectExists, sql } from "./support/services";
import { expect, test, type TestImage } from "./support/world";

// Content migrations (docs/system-tests.md, ADR 0026). Each test applies small content files of
// its own, with e2e- keys, to the development database through the runner's applyFile, and checks
// what changed. The content account and any real content are left alone (support/content.ts).

const SOURCES = ["https://en.wikipedia.org/wiki/Example"];

test.beforeAll(removeTestContent);
test.afterEach(removeTestContent);

/** Names for one test's content: a painting key, box keys and file names, all starting e2e-. */
function names() {
  const tag = newTag();
  let files = 0;
  return {
    tag,
    painting: (n = 1) => `${tag}-p${n}`,
    box: (n: number, painting = 1) => `${tag}-p${painting}-${n}`,
    file: (operations: Operation[]): ContentFile => ({
      name: `99${String(++files).padStart(2, "0")}-${tag}`,
      operations,
    }),
  };
}

const addPainting = (key: string, seed = newSeed()): Operation => ({
  op: "addPainting",
  key,
  title: `Painting ${key}`,
  description: "A test painting.",
  source: sourceFor(seed),
});

const annotate = (painting: string, key: string, region: Region, body = `Note ${key}`): Operation => ({
  op: "annotate",
  painting,
  key,
  region,
  body,
  sources: SOURCES,
});

type ImageRow = TestImage & { ownerId: string; sha256: string | null };
type RegionRow = Region & { id: string; authorId: string };
type AnnotationRow = { id: string; authorId: string; bodyMarkdown: string };

const imageByKey = async (key: string) =>
  (
    await sql<ImageRow>(
      `SELECT id, title, "storageKey", width, height, "ownerId", sha256 FROM "Image" WHERE "contentKey" = $1`,
      [key],
    )
  )[0];

const regionByKey = async (key: string) =>
  (await sql<RegionRow>(`SELECT id, "authorId", x, y, w, h FROM "Region" WHERE "contentKey" = $1`, [key]))[0];

const regionById = async (id: string) =>
  (await sql<RegionRow>(`SELECT id, "authorId", x, y, w, h FROM "Region" WHERE id = $1`, [id]))[0];

/** A box's annotations, the content account's first. */
const annotationsOn = (regionId: string) =>
  sql<AnnotationRow>(
    `SELECT id, "authorId", "bodyMarkdown" FROM "Annotation" WHERE "regionId" = $1
     ORDER BY ("authorId" = $2) DESC, "createdAt"`,
    [regionId, CONTENT_USER.id],
  );

const migration = async (name: string) =>
  (
    await sql<{ name: string; checksum: string; summary: { changes: string[]; skipped: string[] } }>(
      `SELECT name, checksum, summary FROM "ContentMigration" WHERE name = $1`,
      [name],
    )
  )[0];

test("CON-01: A content file is applied and recorded", async ({ page }) => {
  const n = names();
  const key = n.painting();
  const missing: Operation = {
    op: "addPainting",
    key: n.painting(2),
    title: "Not on Commons",
    description: "",
    source: "https://commons.wikimedia.org/wiki/File:No_such_file.jpg",
  };
  const box = { x: 0.2, y: 0.3, w: 0.25, h: 0.2 };
  const body = `Content note ${n.tag}`;
  const file = n.file([
    addPainting(key),
    missing,
    annotate(key, n.box(1), box, body),
    { op: "addCollection", slug: `${n.tag}-row`, name: `Row ${n.tag}`, blurb: "A test row." },
    { op: "addToCollection", collection: `${n.tag}-row`, paintings: [key] },
  ]);

  const result = await applyTestFile(file);

  // A painting Commons doesn't have is skipped and reported, and the rest still applies.
  expect(result.skipped).toEqual([expect.stringContaining(`add painting ${n.painting(2)}`)]);
  expect(result.changes).toHaveLength(4);
  expect(result.puts).toEqual([`images/seed/${key}.jpg`]);

  const image = await imageByKey(key);
  expect(image).toMatchObject({
    ownerId: CONTENT_USER.id,
    title: `Painting ${key}`,
    storageKey: `images/seed/${key}.jpg`,
    width: 1200,
    height: 800,
  });
  expect(image.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(await objectExists(image.storageKey)).toBe(true);
  expect(await imageByKey(n.painting(2))).toBeUndefined();

  const region = await regionByKey(n.box(1));
  expect(region).toMatchObject({ authorId: CONTENT_USER.id, ...box });
  expect(await annotationsOn(region.id)).toEqual([
    expect.objectContaining({ authorId: CONTENT_USER.id, bodyMarkdown: body }),
  ]);

  // The new row goes below every existing one, holding the painting.
  const rows = await sql<{ slug: string; sortOrder: number }>(`SELECT slug, "sortOrder" FROM "Collection"`);
  const row = rows.find((r) => r.slug === `${n.tag}-row`)!;
  expect(row.sortOrder).toBe(Math.max(...rows.map((r) => r.sortOrder)));
  expect(rows.filter((r) => r.sortOrder === row.sortOrder)).toHaveLength(1);
  const members = await sql<{ imageId: string }>(
    `SELECT ci."imageId" FROM "CollectionImage" ci JOIN "Collection" c ON c.id = ci."collectionId" WHERE c.slug = $1`,
    [`${n.tag}-row`],
  );
  expect(members).toEqual([{ imageId: image.id }]);

  // Recorded, with a checksum of its operations and a summary that includes the skip.
  const recorded = await migration(file.name);
  expect(recorded.checksum).toBe(checksum(file.operations));
  expect(recorded.summary.changes).toEqual(result.changes);
  expect(recorded.summary.skipped).toEqual(result.skipped);

  // A visitor sees the painting and its annotation, by the content account.
  const [author] = await sql<{ name: string }>(`SELECT name FROM "User" WHERE id = $1`, [CONTENT_USER.id]);
  const view = new ImagePage(page, image);
  await view.goto();
  await view.pickFromList(body);
  await expect(view.card.getByText(body)).toBeVisible();
  await expect(view.card.getByText(author.name)).toBeVisible();
});

test("CON-02: A user's box blocks a content box, and isn't moved", async ({ world }) => {
  const n = names();
  const key = n.painting();
  await applyTestFile(n.file([addPainting(key), annotate(key, n.box(1), { x: 0.05, y: 0.05, w: 0.2, h: 0.2 })]));
  const image = await imageByKey(key);
  const user = await world.user();
  const theirBox = { x: 0.5, y: 0.5, w: 0.3, h: 0.3 };
  const theirs = await world.region(image, user, theirBox, "My box");

  // The first box would sit inside theirs and take its clicks; the second is clear of it.
  const file = n.file([
    annotate(key, n.box(2), { x: 0.52, y: 0.52, w: 0.26, h: 0.26 }),
    annotate(key, n.box(3), { x: 0.05, y: 0.6, w: 0.2, h: 0.2 }),
  ]);
  const result = await applyTestFile(file);

  expect(result.skipped).toEqual([expect.stringMatching(new RegExp(`annotate ${n.box(2)}.*another user's box`))]);
  expect(result.changes).toEqual([expect.stringContaining(`annotate ${n.box(3)}`)]);
  expect(await regionByKey(n.box(2))).toBeUndefined();
  expect(await regionByKey(n.box(3))).toBeDefined();
  expect(await regionById(theirs)).toMatchObject({ authorId: user.id, ...theirBox });
  expect(await annotationsOn(theirs)).toEqual([expect.objectContaining({ authorId: user.id, bodyMarkdown: "My box" })]);
  expect((await migration(file.name)).summary.skipped).toEqual(result.skipped);
});

test("CON-03: removePainting is refused when a user has annotated the painting", async ({ world }) => {
  const n = names();
  const kept = n.painting(1);
  const removed = n.painting(2);
  await applyTestFile(
    n.file([
      addPainting(kept),
      annotate(kept, n.box(1, 1), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
      addPainting(removed),
      annotate(removed, n.box(1, 2), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
    ]),
  );
  const keptImage = await imageByKey(kept);
  const removedImage = await imageByKey(removed);
  const user = await world.user();
  const contentBox = await regionByKey(n.box(1, 1));
  const theirs = await world.addAnnotation(contentBox.id, user, "My annotation on a content box");

  const result = await applyTestFile(
    n.file([
      { op: "removePainting", key: kept },
      { op: "removePainting", key: removed },
    ]),
  );

  expect(result.skipped).toEqual([expect.stringMatching(new RegExp(`remove painting ${kept}.*someone else`))]);
  expect(await imageByKey(kept)).toMatchObject({ id: keptImage.id, ownerId: CONTENT_USER.id });
  expect(await objectExists(keptImage.storageKey)).toBe(true);
  expect(await annotationsOn(contentBox.id)).toEqual([
    expect.objectContaining({ authorId: CONTENT_USER.id }),
    expect.objectContaining({ id: theirs, authorId: user.id, bodyMarkdown: "My annotation on a content box" }),
  ]);

  // The painting no one else annotated goes, with its file.
  expect(await imageByKey(removed)).toBeUndefined();
  expect(result.removes).toEqual([removedImage.storageKey]);
  expect(await objectExists(removedImage.storageKey)).toBe(false);
});

test("CON-04: removeAnnotation keeps a box that holds a user's annotation", async ({ world }) => {
  const n = names();
  const key = n.painting();
  await applyTestFile(
    n.file([
      addPainting(key),
      annotate(key, n.box(1), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
      annotate(key, n.box(2), { x: 0.6, y: 0.6, w: 0.2, h: 0.2 }),
    ]),
  );
  const shared = await regionByKey(n.box(1));
  const alone = await regionByKey(n.box(2));
  const user = await world.user();
  const theirs = await world.addAnnotation(shared.id, user, "Mine stays");

  const result = await applyTestFile(
    n.file([
      { op: "removeAnnotation", key: n.box(1) },
      { op: "removeAnnotation", key: n.box(2) },
    ]),
  );

  expect(result.skipped).toEqual([]);
  // The shared box stays where it was, with only the user's annotation.
  expect(await regionById(shared.id)).toEqual(shared);
  expect(await annotationsOn(shared.id)).toEqual([{ id: theirs, authorId: user.id, bodyMarkdown: "Mine stays" }]);
  // The box left empty goes.
  expect(await regionById(alone.id)).toBeUndefined();
  expect(await annotationsOn(alone.id)).toEqual([]);
});

test("CON-05: editAnnotation never changes a user's annotation or moves their box", async ({ world }) => {
  const n = names();
  const key = n.painting();
  const sharedBox = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
  const aloneBox = { x: 0.6, y: 0.1, w: 0.2, h: 0.2 };
  await applyTestFile(
    n.file([
      addPainting(key),
      annotate(key, n.box(1), sharedBox, "Old shared"),
      annotate(key, n.box(2), aloneBox, "Old alone"),
    ]),
  );
  const shared = await regionByKey(n.box(1));
  const alone = await regionByKey(n.box(2));
  const user = await world.user();
  const theirs = await world.addAnnotation(shared.id, user, "Mine, unchanged");

  // Text only on the shared box: the content annotation changes, the user's doesn't.
  const textOnly = await applyTestFile(
    n.file([{ op: "editAnnotation", key: n.box(1), body: "New shared", sources: SOURCES }]),
  );
  expect(textOnly.skipped).toEqual([]);
  expect(await annotationsOn(shared.id)).toEqual([
    expect.objectContaining({ authorId: CONTENT_USER.id, bodyMarkdown: "New shared" }),
    { id: theirs, authorId: user.id, bodyMarkdown: "Mine, unchanged" },
  ]);
  expect(await regionById(shared.id)).toEqual(shared);

  // Moving the shared box is refused. A content-only box moves.
  const moved = { x: 0.6, y: 0.6, w: 0.2, h: 0.2 };
  const result = await applyTestFile(
    n.file([
      {
        op: "editAnnotation",
        key: n.box(1),
        body: "Moved shared",
        region: { x: 0.1, y: 0.6, w: 0.2, h: 0.2 },
        sources: SOURCES,
      },
      { op: "editAnnotation", key: n.box(2), body: "Moved alone", region: moved, sources: SOURCES },
    ]),
  );
  expect(result.skipped).toEqual([expect.stringContaining(`edit ${n.box(1)}`)]);
  expect(await regionById(shared.id)).toEqual(shared);
  expect(await annotationsOn(shared.id)).toContainEqual({
    id: theirs,
    authorId: user.id,
    bodyMarkdown: "Mine, unchanged",
  });
  expect(await regionById(alone.id)).toMatchObject(moved);
  expect(await annotationsOn(alone.id)).toEqual([expect.objectContaining({ bodyMarkdown: "Moved alone" })]);
});

test("CON-06: A dry run writes nothing to the database or R2", async () => {
  const n = names();
  const existing = n.painting(1);
  await applyTestFile(
    n.file([addPainting(existing), annotate(existing, n.box(1, 1), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 })]),
  );
  const before = await imageByKey(existing);
  const contentUsers = async () => (await sql(`SELECT 1 FROM "User" WHERE id = $1`, [CONTENT_USER.id])).length;
  const users = await contentUsers();

  const fresh = n.painting(2);
  const file = n.file([
    addPainting(fresh),
    annotate(fresh, n.box(1, 2), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
    { op: "editAnnotation", key: n.box(1, 1), body: "Changed", sources: SOURCES },
    { op: "addCollection", slug: `${n.tag}-row`, name: "Row", blurb: "" },
    { op: "addToCollection", collection: `${n.tag}-row`, paintings: [fresh, existing] },
    { op: "removePainting", key: existing },
  ]);
  const result = await applyTestFile(file, { yes: false });

  // It plans every step...
  expect(result.skipped).toEqual([]);
  expect(result.changes).toHaveLength(7);
  // ...and writes none of them.
  expect(result.puts).toEqual([]);
  expect(result.removes).toEqual([]);
  expect(await objectExists(`images/seed/${fresh}.jpg`)).toBe(false);
  expect(await imageByKey(fresh)).toBeUndefined();
  expect(await regionByKey(n.box(1, 2))).toBeUndefined();
  expect(await imageByKey(existing)).toEqual(before);
  expect(await objectExists(before.storageKey)).toBe(true);
  const box = await regionByKey(n.box(1, 1));
  expect(await annotationsOn(box.id)).toEqual([expect.objectContaining({ bodyMarkdown: `Note ${n.box(1, 1)}` })]);
  expect(await sql(`SELECT 1 FROM "Collection" WHERE slug = $1`, [`${n.tag}-row`])).toEqual([]);
  expect(await migration(file.name)).toBeUndefined();
  expect(await contentUsers()).toBe(users);
});

test("CON-07: An applied file can't be changed or removed", async () => {
  const n = names();
  const key = n.painting();
  const file = n.file([addPainting(key), annotate(key, n.box(1), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 })]);
  await applyTestFile(file);
  // Problems with other files the database has applied (such as 0001-baseline) aren't this test's.
  const mine = (problems: string[]) => problems.filter((p) => p.includes(file.name));

  // The same operations, written in another order, are the same file.
  const reordered: ContentFile = {
    name: file.name,
    operations: file.operations.map((o) => Object.fromEntries(Object.entries(o).reverse()) as Operation),
  };
  const same = await testStatus([reordered]);
  expect(mine(same.problems)).toEqual([]);
  expect(same.applied).toContain(file.name);
  expect(same.pending).not.toContain(file.name);

  const edited: ContentFile = {
    name: file.name,
    operations: [file.operations[0], annotate(key, n.box(1), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, "Corrected")],
  };
  expect(mine((await testStatus([edited])).problems)).toEqual([
    expect.stringContaining("has changed since it was applied"),
  ]);
  expect(mine((await testStatus([])).problems)).toEqual([expect.stringContaining("isn't in prisma/content")]);
});

test("CON-08: A file can change or remove what it added earlier in the same file", async () => {
  const n = names();
  const kept = n.painting(1);
  const removed = n.painting(2);
  const moved = { x: 0.5, y: 0.5, w: 0.25, h: 0.25 };
  const file = n.file([
    addPainting(kept),
    annotate(kept, n.box(1), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, "First draft"),
    { op: "editAnnotation", key: n.box(1), body: "Second draft", region: moved, sources: SOURCES },
    annotate(kept, n.box(2), { x: 0.1, y: 0.6, w: 0.2, h: 0.2 }),
    { op: "removeAnnotation", key: n.box(2) },
    addPainting(removed),
    annotate(removed, n.box(1, 2), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
    { op: "removePainting", key: removed },
  ]);

  const result = await applyTestFile(file);

  expect(result.skipped).toEqual([]);
  expect(result.changes).toHaveLength(8);
  // The edit reached the box made a moment before: new text, new place.
  const edited = await regionByKey(n.box(1));
  expect(edited).toMatchObject({ authorId: CONTENT_USER.id, ...moved });
  expect(await annotationsOn(edited.id)).toEqual([
    expect.objectContaining({ authorId: CONTENT_USER.id, bodyMarkdown: "Second draft" }),
  ]);
  // The box added and removed is gone.
  expect(await regionByKey(n.box(2))).toBeUndefined();
  // The painting added and removed is gone, with its file.
  expect(await imageByKey(kept)).toBeDefined();
  expect(await imageByKey(removed)).toBeUndefined();
  expect(await regionByKey(n.box(1, 2))).toBeUndefined();
  expect(result.removes).toEqual([`images/seed/${removed}.jpg`]);
  expect(await objectExists(`images/seed/${removed}.jpg`)).toBe(false);
  expect(await migration(file.name)).toBeDefined();
});

test("CON-09: The baseline claims the old seed's rows, and only those", async ({ world }) => {
  const n = names();
  const key = n.painting();
  const text = `The seed's text ${n.tag}`;
  const rowId = () => `e2e${randomBytes(10).toString("hex")}`;

  // As the old seed left a painting: the content account's, under images/seed/, with no key yet.
  await sql(
    `INSERT INTO "User" (id, name, "approvedAt", "updatedAt") VALUES ($1, $2, now(), now()) ON CONFLICT (id) DO NOTHING`,
    [CONTENT_USER.id, CONTENT_USER.name],
  );
  const seedImage = {
    id: rowId(),
    title: `Seeded ${n.tag}`,
    storageKey: `images/seed/${key}.jpg`,
    width: 1200,
    height: 800,
  };
  await sql(`INSERT INTO "Image" (id, "ownerId", title, "storageKey", width, height) VALUES ($1, $2, $3, $4, $5, $6)`, [
    seedImage.id,
    CONTENT_USER.id,
    seedImage.title,
    seedImage.storageKey,
    seedImage.width,
    seedImage.height,
  ]);
  const seedBox = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
  const seedRegion = rowId();
  await sql(
    `INSERT INTO "Region" (id, "imageId", "authorId", x, y, w, h, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [seedRegion, seedImage.id, CONTENT_USER.id, seedBox.x, seedBox.y, seedBox.w, seedBox.h],
  );
  await sql(
    `INSERT INTO "Annotation" (id, "regionId", "authorId", "bodyMarkdown", "updatedAt") VALUES ($1, $2, $3, $4, now())`,
    [rowId(), seedRegion, CONTENT_USER.id, text],
  );

  // A user's boxes with the same text: one on the seeded painting, one on their own image.
  const user = await world.user();
  const theirsOnSeed = await world.region(seedImage, user, { x: 0.6, y: 0.6, w: 0.2, h: 0.2 }, text);
  const theirImage = await world.image(user);
  const theirsOnOwn = await world.region(theirImage, user, seedBox, text);
  const annotationsBefore = async () =>
    sql(
      `SELECT id, "regionId", "authorId", "bodyMarkdown", "updatedAt" FROM "Annotation" WHERE "bodyMarkdown" = $1 ORDER BY id`,
      [text],
    );
  const before = await annotationsBefore();

  // The file places the box elsewhere: the claim is by painting and text, not by where the box is.
  const result = await applyTestFile(
    n.file([addPainting(key), annotate(key, n.box(1), { x: 0.4, y: 0.1, w: 0.1, h: 0.1 }, text)]),
  );

  expect(result.skipped).toEqual([]);
  expect(result.changes).toEqual([
    expect.stringContaining(`match painting ${key}`),
    expect.stringContaining(`match annotation ${n.box(1)}`),
  ]);
  expect(result.downloads).toEqual([]);
  expect(result.puts).toEqual([]);

  // The seed's rows get their keys, and nothing else about them changes.
  expect(await imageByKey(key)).toMatchObject({ ...seedImage, ownerId: CONTENT_USER.id });
  const claimed = await regionByKey(n.box(1));
  expect(claimed).toEqual({ id: seedRegion, authorId: CONTENT_USER.id, ...seedBox });
  expect(await sql(`SELECT 1 FROM "Region" WHERE "imageId" = $1`, [seedImage.id])).toHaveLength(2);

  // The user's rows are as they were.
  const keys = await sql<{ id: string; contentKey: string | null }>(
    `SELECT id, "contentKey" FROM "Region" WHERE id = ANY($1)`,
    [[theirsOnSeed, theirsOnOwn]],
  );
  expect(keys).toHaveLength(2);
  for (const k of keys) expect(k.contentKey).toBeNull();
  const [own] = await sql<{ contentKey: string | null }>(`SELECT "contentKey" FROM "Image" WHERE id = $1`, [
    theirImage.id,
  ]);
  expect(own.contentKey).toBeNull();
  expect(await regionById(theirsOnOwn)).toEqual({ id: theirsOnOwn, authorId: user.id, ...seedBox });
  expect(await annotationsBefore()).toEqual(before);
});
