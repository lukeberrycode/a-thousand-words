import { describe, expect, it } from "vitest";
import { SIMILAR_MAX_DISTANCE } from "@/lib/image-hash";
import type { Region } from "@/lib/regions";
import { CONTENT_USER, contentStorageKey, type Operation } from "./operations";
import { paintingsToFetch, planFile, type ContentState, type Fetched, type StateImage, type StateRegion } from "./plan";

const ME = CONTENT_USER.id;
const USER = "user-1";
const SOURCES = ["https://en.wikipedia.org/wiki/Example"];

// A hash with the lowest `bits` bits flipped from `base`.
const flip = (base: bigint, bits: number) => base ^ ((BigInt(1) << BigInt(bits)) - BigInt(1));
const PHASH = BigInt("0x0123456789abcdef");

let n = 0;
const fetchedFile = (over: Partial<NonNullable<Fetched>> = {}): NonNullable<Fetched> => ({
  width: 1200,
  height: 800,
  sha256: `sha-${n++}`,
  // Far from PHASH and from every other file here.
  phash: BigInt.asIntN(64, BigInt(n) * BigInt("0x9e3779b97f4a7c15")),
  ...over,
});

const image = (over: Partial<StateImage> & { id: string }): StateImage => ({
  contentKey: null,
  ownerId: USER,
  title: `Image ${over.id}`,
  storageKey: `images/${over.id}.png`,
  sha256: `sha-of-${over.id}`,
  phash: null,
  ...over,
});

const region = (
  over: Partial<StateRegion> & { id: string; imageId: string },
  box: Region = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
): StateRegion => ({
  contentKey: null,
  authorId: USER,
  annotations: [{ id: `${over.id}-a`, authorId: over.authorId ?? USER, body: "A note" }],
  ...box,
  ...over,
});

const state = (over: Partial<ContentState> = {}): ContentState => ({
  contentUserId: ME,
  images: [],
  regions: [],
  collections: [],
  ...over,
});

const addPainting = (key: string): Operation => ({
  op: "addPainting",
  key,
  title: `Title ${key}`,
  description: "A painting.",
  source: `https://commons.wikimedia.org/wiki/File:${key}.jpg`,
});

const annotate = (painting: string, key: string, box: Region, body = `Note ${key}`): Operation => ({
  op: "annotate",
  painting,
  key,
  region: box,
  body,
  sources: SOURCES,
});

/** A content painting with key `key`, as an earlier file left it. */
const contentImage = (key: string) =>
  image({ id: `img-${key}`, contentKey: key, ownerId: ME, title: `Title ${key}`, storageKey: contentStorageKey(key) });

/** A content box with its one content annotation. */
const contentRegion = (key: string, imageId: string, box: Region, body = `Note ${key}`) =>
  region(
    {
      id: `reg-${key}`,
      imageId,
      contentKey: key,
      authorId: ME,
      annotations: [{ id: `ann-${key}`, authorId: ME, body }],
    },
    box,
  );

const kinds = (changes: { kind: string }[]) => changes.map((c) => c.kind);

describe("planFile", () => {
  it("doesn't change the state it's given", () => {
    const s = state({
      images: [contentImage("p")],
      regions: [contentRegion("p-1", "img-p", { x: 0, y: 0, w: 0.2, h: 0.2 })],
    });
    const before = structuredClone(s);
    planFile(
      s,
      [
        annotate("p", "p-2", { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }),
        { op: "editAnnotation", key: "p-1", body: "Changed", sources: SOURCES },
        { op: "removePainting", key: "p" },
      ],
      new Map(),
    );
    expect(s).toEqual(before);
  });

  it("plans nothing on a second pass over the state the first leaves", () => {
    const ops: Operation[] = [
      addPainting("p"),
      annotate("p", "p-1", { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
      { op: "addCollection", slug: "c", name: "C", blurb: "" },
      { op: "addToCollection", collection: "c", paintings: ["p"] },
    ];
    const first = planFile(state(), ops, new Map([["p", fetchedFile()]]));
    expect(first.skipped).toEqual([]);
    const second = planFile(first.after, ops, new Map());
    expect(second.changes).toEqual([]);
    expect(second.skipped).toEqual([]);
    expect(second.unchanged).toHaveLength(4);
  });

  describe("addPainting", () => {
    it("adds a painting owned by the content account, under images/seed/<key>.jpg", () => {
      const file = fetchedFile();
      const plan = planFile(state(), [addPainting("milkmaid")], new Map([["milkmaid", file]]));
      expect(plan.skipped).toEqual([]);
      expect(plan.changes).toEqual([
        expect.objectContaining({
          kind: "addPainting",
          key: "milkmaid",
          title: "Title milkmaid",
          storageKey: "images/seed/milkmaid.jpg",
          width: 1200,
          height: 800,
          sha256: file.sha256,
          phash: file.phash,
        }),
      ]);
      expect(plan.after.images).toEqual([
        expect.objectContaining({ contentKey: "milkmaid", ownerId: ME, storageKey: "images/seed/milkmaid.jpg" }),
      ]);
    });

    it("skips a painting whose key is already on the site", () => {
      const plan = planFile(state({ images: [contentImage("p")] }), [addPainting("p")], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([]);
      expect(plan.unchanged).toEqual([expect.stringContaining("add painting p")]);
    });

    it("refuses an exact copy of a user's image", () => {
      const theirs = image({ id: "u1", sha256: "same-bytes", title: "My holiday snap" });
      const plan = planFile(
        state({ images: [theirs] }),
        [addPainting("p")],
        new Map([["p", fetchedFile({ sha256: "same-bytes" })]]),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("My holiday snap")]);
      expect(plan.after.images).toEqual([theirs]);
    });

    it(`refuses a look-alike within ${SIMILAR_MAX_DISTANCE} bits of a user's image`, () => {
      const theirs = image({ id: "u1", phash: PHASH, title: "Their upload" });
      const plan = planFile(
        state({ images: [theirs] }),
        [addPainting("p")],
        new Map([["p", fetchedFile({ phash: flip(PHASH, SIMILAR_MAX_DISTANCE) })]]),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("Their upload")]);
    });

    it(`adds a painting ${SIMILAR_MAX_DISTANCE + 1} bits from every image on the site`, () => {
      const theirs = image({ id: "u1", phash: PHASH });
      const plan = planFile(
        state({ images: [theirs] }),
        [addPainting("p")],
        new Map([["p", fetchedFile({ phash: flip(PHASH, SIMILAR_MAX_DISTANCE + 1) })]]),
      );
      expect(plan.skipped).toEqual([]);
      expect(kinds(plan.changes)).toEqual(["addPainting"]);
    });

    it("refuses a copy of a painting added earlier in the same file", () => {
      const plan = planFile(
        state(),
        [addPainting("first"), addPainting("second")],
        new Map([
          ["first", fetchedFile({ phash: PHASH })],
          ["second", fetchedFile({ phash: flip(PHASH, 3) })],
        ]),
      );
      expect(plan.changes.map((c) => ("key" in c ? c.key : null))).toEqual(["first"]);
      expect(plan.skipped).toEqual([expect.stringMatching(/add painting second.*Title first/)]);
    });

    it("refuses an exact copy of a painting added earlier in the same file", () => {
      const plan = planFile(
        state(),
        [addPainting("first"), addPainting("second")],
        new Map([
          ["first", fetchedFile({ sha256: "same" })],
          ["second", fetchedFile({ sha256: "same" })],
        ]),
      );
      expect(kinds(plan.changes)).toEqual(["addPainting"]);
      expect(plan.skipped).toHaveLength(1);
    });

    it("skips and reports a painting Commons doesn't have, and carries on with the rest", () => {
      const plan = planFile(
        state(),
        [addPainting("gone"), addPainting("here"), annotate("gone", "gone-1", { x: 0.1, y: 0.1, w: 0.2, h: 0.2 })],
        new Map<string, Fetched>([
          ["gone", null],
          ["here", fetchedFile()],
        ]),
      );
      expect(plan.skipped[0]).toContain("add painting gone");
      expect(plan.skipped[0]).toContain("Commons");
      expect(plan.skipped[0]).toContain("https://commons.wikimedia.org/wiki/File:gone.jpg");
      expect(plan.skipped[1]).toContain("annotate gone-1");
      expect(kinds(plan.changes)).toEqual(["addPainting"]);
    });

    it("refuses a painting whose file in R2 belongs to a user's image", () => {
      const theirs = image({ id: "u1", storageKey: contentStorageKey("p") });
      const plan = planFile(state({ images: [theirs] }), [addPainting("p")], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("images/seed/p.jpg")]);
    });
  });

  describe("annotate", () => {
    const box = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };

    it("adds a box with one annotation by the content account", () => {
      const plan = planFile(state({ images: [contentImage("p")] }), [annotate("p", "p-1", box, "**Fuji**")], new Map());
      expect(plan.skipped).toEqual([]);
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: "addRegion", key: "p-1", imageId: "img-p", region: box, body: "**Fuji**" }),
      ]);
      expect(plan.after.regions).toEqual([
        expect.objectContaining({
          contentKey: "p-1",
          authorId: ME,
          ...box,
          annotations: [expect.objectContaining({ authorId: ME, body: "**Fuji**" })],
        }),
      ]);
    });

    it("annotates a painting added earlier in the same file", () => {
      const plan = planFile(state(), [addPainting("p"), annotate("p", "p-1", box)], new Map([["p", fetchedFile()]]));
      expect(kinds(plan.changes)).toEqual(["addPainting", "addRegion"]);
      const [painting, box1] = plan.changes;
      expect(box1).toMatchObject({ imageId: (painting as { id: string }).id });
    });

    it("refuses a box that would hide a user's box, and leaves theirs where it is", () => {
      const theirs = region({ id: "r-user", imageId: "img-p" }, { x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
      const s = state({ images: [contentImage("p")], regions: [theirs] });
      // A smaller box inside theirs takes the clicks on most of it.
      const plan = planFile(s, [annotate("p", "p-1", { x: 0.41, y: 0.41, w: 0.18, h: 0.18 })], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("another user's box")]);
      expect(plan.after.regions).toEqual([theirs]);
    });

    it("refuses a box that a user's box would hide", () => {
      const theirs = region({ id: "r-user", imageId: "img-p" }, { x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
      const s = state({ images: [contentImage("p")], regions: [theirs] });
      // A larger box almost entirely covered by the user's smaller one.
      const plan = planFile(s, [annotate("p", "p-1", { x: 0.39, y: 0.39, w: 0.22, h: 0.22 })], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("another user's box")]);
    });

    it("adds a box clear of a user's box", () => {
      const theirs = region({ id: "r-user", imageId: "img-p" }, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
      const s = state({ images: [contentImage("p")], regions: [theirs] });
      const plan = planFile(s, [annotate("p", "p-1", { x: 0.6, y: 0.6, w: 0.2, h: 0.2 })], new Map());
      expect(kinds(plan.changes)).toEqual(["addRegion"]);
      expect(plan.after.regions).toContainEqual(theirs);
    });

    it("refuses a box that would hide one added earlier in the same file", () => {
      const plan = planFile(
        state({ images: [contentImage("p")] }),
        [
          annotate("p", "p-1", { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }),
          annotate("p", "p-2", { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }),
        ],
        new Map(),
      );
      expect(plan.changes.map((c) => ("key" in c ? c.key : null))).toEqual(["p-1"]);
      expect(plan.skipped).toEqual([expect.stringMatching(/annotate p-2.*p-1/)]);
    });

    it("only checks boxes on the same painting", () => {
      const other = region({ id: "r-user", imageId: "img-q" }, box);
      const s = state({ images: [contentImage("p"), contentImage("q")], regions: [other] });
      expect(kinds(planFile(s, [annotate("p", "p-1", box)], new Map()).changes)).toEqual(["addRegion"]);
    });

    it("skips a box whose key is already on the site", () => {
      const s = state({ images: [contentImage("p")], regions: [contentRegion("p-1", "img-p", box)] });
      const plan = planFile(s, [annotate("p", "p-1", box)], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.unchanged).toEqual([expect.stringContaining("annotate p-1")]);
    });

    it("skips a box on a painting that isn't on the site", () => {
      const plan = planFile(state(), [annotate("ghost", "ghost-1", box)], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("ghost")]);
    });

    it("skips a box outside the image, or empty text", () => {
      const plan = planFile(
        state({ images: [contentImage("p")] }),
        [annotate("p", "p-1", { x: 0.9, y: 0.9, w: 0.2, h: 0.2 }), annotate("p", "p-2", box, "  ")],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([
        expect.stringContaining("Invalid region."),
        expect.stringContaining("Write something"),
      ]);
    });
  });

  describe("editAnnotation", () => {
    const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const moved = { x: 0.6, y: 0.6, w: 0.2, h: 0.2 };

    it("changes the text of a content annotation", () => {
      const s = state({ images: [contentImage("p")], regions: [contentRegion("p-1", "img-p", box, "Old")] });
      const plan = planFile(s, [{ op: "editAnnotation", key: "p-1", body: "New", sources: SOURCES }], new Map());
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: "editAnnotation", annotationId: "ann-p-1", body: "New", region: undefined }),
      ]);
      expect(plan.after.regions[0]).toMatchObject({ ...box, annotations: [{ body: "New" }] });
    });

    it("moves the box too, when it holds only the content annotation and the new place is clear", () => {
      const s = state({ images: [contentImage("p")], regions: [contentRegion("p-1", "img-p", box, "Old")] });
      const plan = planFile(
        s,
        [{ op: "editAnnotation", key: "p-1", body: "New", region: moved, sources: SOURCES }],
        new Map(),
      );
      expect(plan.changes).toEqual([expect.objectContaining({ kind: "editAnnotation", region: moved })]);
      expect(plan.after.regions[0]).toMatchObject(moved);
    });

    it("changes only the content annotation on a box that also holds a user's", () => {
      const shared = contentRegion("p-1", "img-p", box, "Old");
      shared.annotations.push({ id: "ann-user", authorId: USER, body: "Mine" });
      const plan = planFile(
        state({ images: [contentImage("p")], regions: [shared] }),
        [{ op: "editAnnotation", key: "p-1", body: "New", sources: SOURCES }],
        new Map(),
      );
      expect(plan.changes).toEqual([expect.objectContaining({ kind: "editAnnotation", annotationId: "ann-p-1" })]);
      expect(plan.after.regions[0].annotations).toEqual([
        expect.objectContaining({ id: "ann-p-1", body: "New" }),
        { id: "ann-user", authorId: USER, body: "Mine" },
      ]);
    });

    it("never moves a box that holds a user's annotation", () => {
      const shared = contentRegion("p-1", "img-p", box, "Old");
      shared.annotations.push({ id: "ann-user", authorId: USER, body: "Mine" });
      const plan = planFile(
        state({ images: [contentImage("p")], regions: [shared] }),
        [{ op: "editAnnotation", key: "p-1", body: "New", region: moved, sources: SOURCES }],
        new Map(),
      );
      expect(plan.changes.some((c) => c.kind === "editAnnotation" && c.region)).toBe(false);
      expect(plan.skipped).toEqual([expect.stringContaining("edit p-1")]);
      expect(plan.after.regions[0]).toMatchObject(box);
      expect(plan.after.regions[0].annotations).toContainEqual({ id: "ann-user", authorId: USER, body: "Mine" });
    });

    it("doesn't move a box onto a user's box", () => {
      const theirs = region({ id: "r-user", imageId: "img-p" }, moved);
      const s = state({ images: [contentImage("p")], regions: [contentRegion("p-1", "img-p", box), theirs] });
      const plan = planFile(
        s,
        [{ op: "editAnnotation", key: "p-1", body: "New", region: moved, sources: SOURCES }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("another user's box")]);
      expect(plan.after.regions).toEqual(s.regions);
    });

    it("doesn't move a box onto one added earlier in the same file", () => {
      const s = state({ images: [contentImage("p")], regions: [contentRegion("p-1", "img-p", box)] });
      const plan = planFile(
        s,
        [
          annotate("p", "p-2", moved),
          { op: "editAnnotation", key: "p-1", body: "New", region: moved, sources: SOURCES },
        ],
        new Map(),
      );
      expect(kinds(plan.changes)).toEqual(["addRegion"]);
      expect(plan.skipped).toEqual([expect.stringMatching(/edit p-1.*p-2/)]);
    });

    it("doesn't touch a box with the key whose annotations are all someone else's", () => {
      const r = region({ id: "r-x", imageId: "img-p", contentKey: "p-1", authorId: ME });
      r.annotations = [{ id: "ann-user", authorId: USER, body: "Mine" }];
      const plan = planFile(
        state({ images: [contentImage("p")], regions: [r] }),
        [{ op: "editAnnotation", key: "p-1", body: "New", sources: SOURCES }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("edit p-1")]);
    });

    it("doesn't touch a box with the key that a user drew", () => {
      const r = region({ id: "r-x", imageId: "img-p", contentKey: "p-1", authorId: USER });
      r.annotations.push({ id: "ann-me", authorId: ME, body: "Content" });
      const plan = planFile(
        state({ images: [contentImage("p")], regions: [r] }),
        [{ op: "editAnnotation", key: "p-1", body: "New", sources: SOURCES }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toHaveLength(1);
    });

    it("skips an edit of a key that isn't on the site", () => {
      const plan = planFile(
        state(),
        [{ op: "editAnnotation", key: "ghost", body: "New", sources: SOURCES }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("edit ghost")]);
    });

    it("has nothing to do when the text is already the same", () => {
      const s = state({ images: [contentImage("p")], regions: [contentRegion("p-1", "img-p", box, "Same")] });
      const plan = planFile(s, [{ op: "editAnnotation", key: "p-1", body: "Same", sources: SOURCES }], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.unchanged).toHaveLength(1);
    });

    it("refuses empty text, or a box outside the image", () => {
      const s = state({ images: [contentImage("p")], regions: [contentRegion("p-1", "img-p", box, "Old")] });
      const plan = planFile(
        s,
        [
          { op: "editAnnotation", key: "p-1", body: " ", sources: SOURCES },
          { op: "editAnnotation", key: "p-1", body: "New", region: { x: 0.9, y: 0, w: 0.2, h: 0.1 }, sources: SOURCES },
        ],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toHaveLength(2);
    });
  });

  describe("removeAnnotation", () => {
    const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };

    it("removes the content annotation and its box when the box is left empty", () => {
      const s = state({ images: [contentImage("p")], regions: [contentRegion("p-1", "img-p", box)] });
      const plan = planFile(s, [{ op: "removeAnnotation", key: "p-1" }], new Map());
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: "removeAnnotation", regionId: "reg-p-1", annotationId: "ann-p-1" }),
      ]);
      expect(plan.after.regions).toEqual([]);
    });

    it("keeps a box that also holds a user's annotation, with theirs on it", () => {
      const shared = contentRegion("p-1", "img-p", box);
      shared.annotations.push({ id: "ann-user", authorId: USER, body: "Mine" });
      const plan = planFile(
        state({ images: [contentImage("p")], regions: [shared] }),
        [{ op: "removeAnnotation", key: "p-1" }],
        new Map(),
      );
      expect(plan.changes).toEqual([expect.objectContaining({ kind: "removeAnnotation", annotationId: "ann-p-1" })]);
      expect(plan.after.regions).toEqual([
        expect.objectContaining({
          id: "reg-p-1",
          ...box,
          annotations: [{ id: "ann-user", authorId: USER, body: "Mine" }],
        }),
      ]);
    });

    it("never removes a user's annotation from a box with the key", () => {
      const r = region({ id: "r-x", imageId: "img-p", contentKey: "p-1", authorId: ME });
      r.annotations = [{ id: "ann-user", authorId: USER, body: "Mine" }];
      const plan = planFile(
        state({ images: [contentImage("p")], regions: [r] }),
        [{ op: "removeAnnotation", key: "p-1" }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.after.regions).toEqual([r]);
    });

    it("has nothing to do for a key that isn't on the site", () => {
      const plan = planFile(state(), [{ op: "removeAnnotation", key: "ghost" }], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([]);
      expect(plan.unchanged).toHaveLength(1);
    });
  });

  describe("removePainting", () => {
    const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };

    it("removes a content painting with only content annotations, and its boxes and memberships", () => {
      const s = state({
        images: [contentImage("p")],
        regions: [contentRegion("p-1", "img-p", box)],
        collections: [{ id: "c1", slug: "c", sortOrder: 0, members: [{ imageId: "img-p", position: 0 }] }],
      });
      const plan = planFile(s, [{ op: "removePainting", key: "p" }], new Map());
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: "removePainting", imageId: "img-p", storageKey: "images/seed/p.jpg" }),
      ]);
      expect(plan.after.images).toEqual([]);
      expect(plan.after.regions).toEqual([]);
      expect(plan.after.collections[0].members).toEqual([]);
    });

    it("refuses when a user has added an annotation to a content box", () => {
      const shared = contentRegion("p-1", "img-p", box);
      shared.annotations.push({ id: "ann-user", authorId: USER, body: "Mine" });
      const s = state({ images: [contentImage("p")], regions: [shared] });
      const plan = planFile(s, [{ op: "removePainting", key: "p" }], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("someone else has annotated it")]);
      expect(plan.after.images).toEqual(s.images);
      expect(plan.after.regions).toEqual(s.regions);
    });

    it("refuses when a user has drawn their own box on it", () => {
      const theirs = region({ id: "r-user", imageId: "img-p" }, { x: 0.6, y: 0.6, w: 0.2, h: 0.2 });
      const plan = planFile(
        state({ images: [contentImage("p")], regions: [theirs] }),
        [{ op: "removePainting", key: "p" }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toHaveLength(1);
    });

    it("refuses an image with the key that belongs to a user", () => {
      const theirs = image({ id: "u1", contentKey: "p" });
      const plan = planFile(state({ images: [theirs] }), [{ op: "removePainting", key: "p" }], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toHaveLength(1);
      expect(plan.after.images).toEqual([theirs]);
    });

    it("has nothing to do for a painting that isn't on the site", () => {
      const plan = planFile(state(), [{ op: "removePainting", key: "ghost" }], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([]);
      expect(plan.unchanged).toHaveLength(1);
    });
  });

  describe("collections", () => {
    const existing = () =>
      state({
        images: [contentImage("p"), contentImage("q"), image({ id: "u1" })],
        collections: [
          { id: "c1", slug: "first", sortOrder: 0, members: [] },
          {
            id: "c2",
            slug: "second",
            sortOrder: 5,
            members: [
              { imageId: "img-p", position: 0 },
              { imageId: "u1", position: 3 },
            ],
          },
        ],
      });

    it("adds a new collection below the existing ones", () => {
      const plan = planFile(existing(), [{ op: "addCollection", slug: "third", name: "Third", blurb: "B" }], new Map());
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: "addCollection", slug: "third", name: "Third", blurb: "B", sortOrder: 6 }),
      ]);
    });

    it("adds the first collection at the top", () => {
      const plan = planFile(state(), [{ op: "addCollection", slug: "c", name: "C", blurb: "" }], new Map());
      expect(plan.changes).toEqual([expect.objectContaining({ sortOrder: 0 })]);
    });

    it("leaves an existing collection alone", () => {
      const plan = planFile(
        existing(),
        [{ op: "addCollection", slug: "first", name: "Renamed", blurb: "" }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.unchanged).toHaveLength(1);
    });

    it("adds paintings to the end of a row, in order, keeping what's there", () => {
      const plan = planFile(existing(), [{ op: "addToCollection", collection: "second", paintings: ["q"] }], new Map());
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: "addToCollection", collectionId: "c2", imageId: "img-q", position: 4 }),
      ]);
      expect(plan.after.collections[1].members.map((m) => m.imageId)).toEqual(["img-p", "u1", "img-q"]);
    });

    it("adds paintings and a collection created earlier in the same file", () => {
      const plan = planFile(
        state(),
        [
          addPainting("a"),
          addPainting("b"),
          { op: "addCollection", slug: "new", name: "New", blurb: "" },
          { op: "addToCollection", collection: "new", paintings: ["b", "a"] },
        ],
        new Map([
          ["a", fetchedFile()],
          ["b", fetchedFile()],
        ]),
      );
      const adds = plan.changes.filter((c) => c.kind === "addToCollection");
      expect(adds).toEqual([
        expect.objectContaining({ imageId: "new:image:b", collectionId: "new:collection:new", position: 0 }),
        expect.objectContaining({ imageId: "new:image:a", collectionId: "new:collection:new", position: 1 }),
      ]);
    });

    it("skips a painting already in the row, or not on the site", () => {
      const plan = planFile(
        existing(),
        [{ op: "addToCollection", collection: "second", paintings: ["p", "ghost"] }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.unchanged).toEqual([expect.stringContaining("add p to second")]);
      expect(plan.skipped).toEqual([expect.stringContaining("ghost")]);
    });

    it("skips adding to a collection that isn't on the site", () => {
      const plan = planFile(
        existing(),
        [{ op: "addToCollection", collection: "nowhere", paintings: ["p"] }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.skipped).toEqual([expect.stringContaining("nowhere")]);
    });

    it("removes only the paintings named, so an image added some other way stays", () => {
      const plan = planFile(
        existing(),
        [{ op: "removeFromCollection", collection: "second", paintings: ["p"] }],
        new Map(),
      );
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: "removeFromCollection", collectionId: "c2", imageId: "img-p" }),
      ]);
      expect(plan.after.collections[1].members).toEqual([{ imageId: "u1", position: 3 }]);
    });

    it("has nothing to do removing a painting that isn't in the row", () => {
      const plan = planFile(
        existing(),
        [{ op: "removeFromCollection", collection: "first", paintings: ["p", "ghost"] }],
        new Map(),
      );
      expect(plan.changes).toEqual([]);
      expect(plan.unchanged).toHaveLength(2);
    });
  });

  describe("the baseline on a database the old seed filled", () => {
    const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const seeded = () =>
      state({
        images: [
          image({ id: "s1", ownerId: ME, title: "Seeded", storageKey: contentStorageKey("p") }),
          image({ id: "s2", ownerId: ME, title: "Not in the file", storageKey: contentStorageKey("old") }),
          image({ id: "u1", title: "A user's" }),
        ],
        regions: [
          region(
            { id: "r1", imageId: "s1", authorId: ME, annotations: [{ id: "a1", authorId: ME, body: "Exact text" }] },
            box,
          ),
          region(
            { id: "r2", imageId: "s1", authorId: ME, annotations: [{ id: "a2", authorId: ME, body: "Old wording" }] },
            { x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
          ),
          region({ id: "r3", imageId: "u1" }, box),
        ],
      });

    it("needs no download for a painting already in R2 under its key", () => {
      expect(paintingsToFetch(seeded(), [addPainting("p"), addPainting("fresh")]).map((o) => o.key)).toEqual(["fresh"]);
    });

    it("claims the painting by its storage key, and the box by its exact text, changing nothing else", () => {
      const s = seeded();
      const plan = planFile(
        s,
        [addPainting("p"), annotate("p", "p-1", { x: 0.3, y: 0.3, w: 0.1, h: 0.1 }, "Exact text")],
        new Map(),
      );
      expect(plan.skipped).toEqual([]);
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: "adoptPainting", key: "p", imageId: "s1" }),
        expect.objectContaining({ kind: "adoptRegion", key: "p-1", regionId: "r1" }),
      ]);
      const after = plan.after;
      expect(after.images.find((i) => i.id === "s1")).toEqual({ ...s.images[0], contentKey: "p" });
      expect(after.regions.find((r) => r.id === "r1")).toEqual({ ...s.regions[0], contentKey: "p-1" });
      expect(after.regions.find((r) => r.id === "r3")).toEqual(s.regions[2]);
    });

    it("lists the content account's rows it can't match, and leaves them as they are", () => {
      const s = seeded();
      const plan = planFile(s, [addPainting("p"), annotate("p", "p-1", box, "Exact text")], new Map());
      expect(plan.unmatched).toEqual([
        expect.stringContaining("Not in the file"),
        expect.stringContaining("Old wording"),
      ]);
      expect(plan.after.images.find((i) => i.id === "s2")).toEqual(s.images[1]);
      expect(plan.after.regions.find((r) => r.id === "r2")).toEqual(s.regions[1]);
      // A user's rows are never listed.
      expect(plan.unmatched.join(" ")).not.toContain("A user's");
    });

    it("doesn't claim a box whose text differs", () => {
      const plan = planFile(seeded(), [addPainting("p"), annotate("p", "p-2", box, "New wording")], new Map());
      expect(plan.changes.some((c) => c.kind === "adoptRegion")).toBe(false);
    });

    it("doesn't claim a box that also holds a user's annotation", () => {
      const s = seeded();
      s.regions[0].annotations.push({ id: "a-user", authorId: USER, body: "Mine" });
      const plan = planFile(s, [addPainting("p"), annotate("p", "p-1", box, "Exact text")], new Map());
      expect(plan.changes.some((c) => c.kind === "adoptRegion")).toBe(false);
      expect(plan.after.regions.find((r) => r.id === "r1")?.contentKey).toBeNull();
    });

    it("doesn't claim a user's box with the same text", () => {
      const s = seeded();
      s.regions[2].annotations[0].body = "Exact text";
      s.regions[2].imageId = "s1";
      s.regions[0].annotations[0].body = "Something else";
      const plan = planFile(
        s,
        [addPainting("p"), annotate("p", "p-1", { x: 0.4, y: 0.05, w: 0.1, h: 0.1 }, "Exact text")],
        new Map(),
      );
      expect(plan.changes.some((c) => c.kind === "adoptRegion")).toBe(false);
      expect(plan.after.regions.find((r) => r.id === "r3")?.contentKey).toBeNull();
    });

    it("doesn't claim a user's image stored under the painting's key", () => {
      const s = state({ images: [image({ id: "u1", storageKey: contentStorageKey("p") })] });
      const plan = planFile(s, [addPainting("p")], new Map());
      expect(plan.changes).toEqual([]);
      expect(plan.after.images[0].contentKey).toBeNull();
    });
  });
});

describe("paintingsToFetch", () => {
  it("names only the paintings not on the site by key or by file", () => {
    const s = state({
      images: [contentImage("have-key"), image({ id: "x", ownerId: ME, storageKey: contentStorageKey("have-file") })],
    });
    const ops = [
      addPainting("have-key"),
      addPainting("have-file"),
      addPainting("new-one"),
      annotate("new-one", "n-1", { x: 0, y: 0, w: 0.1, h: 0.1 }),
    ];
    expect(paintingsToFetch(s, ops).map((o) => o.key)).toEqual(["new-one"]);
  });

  it("names nothing for a file with no paintings", () => {
    expect(paintingsToFetch(state(), [{ op: "removeAnnotation", key: "x" }])).toEqual([]);
  });
});
