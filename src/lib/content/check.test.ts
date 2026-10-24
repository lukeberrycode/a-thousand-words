import { describe, expect, it } from "vitest";
import { BASELINE, checkFiles } from "./check";
import { MAX_PAINTINGS_PER_FILE, type ContentFile, type Operation } from "./operations";

const SOURCE = "https://en.wikipedia.org/wiki/Example";

const painting = (key: string): Operation => ({
  op: "addPainting",
  key,
  title: `Title of ${key}`,
  description: "A painting.",
  source: `https://commons.wikimedia.org/wiki/File:${key}.jpg`,
});

const annotate = (paintingKey: string, key: string, extra: Partial<Operation> = {}): Operation =>
  ({
    op: "annotate",
    painting: paintingKey,
    key,
    region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    body: "A note.",
    sources: [SOURCE],
    ...extra,
  }) as Operation;

const file = (name: string, operations: Operation[]): ContentFile => ({ name, operations });

/** A file with one of every operation, all valid. */
const valid = file("0002-dutch-golden-age", [
  painting("milkmaid"),
  painting("night-watch"),
  annotate("milkmaid", "milkmaid-1"),
  {
    op: "editAnnotation",
    key: "milkmaid-1",
    body: "A better note.",
    region: { x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
    sources: [SOURCE],
  },
  { op: "addCollection", slug: "dutch", name: "Dutch Golden Age", blurb: "Seventeenth-century Holland." },
  { op: "addToCollection", collection: "dutch", paintings: ["milkmaid", "night-watch"] },
  { op: "removeFromCollection", collection: "dutch", paintings: ["night-watch"] },
  { op: "removeAnnotation", key: "milkmaid-1" },
  { op: "removePainting", key: "night-watch" },
]);

const many = (n: number) => Array.from({ length: n }, (_, i) => painting(`p-${i}`));

describe("checkFiles", () => {
  it("reports nothing for valid files", () => {
    expect(checkFiles([valid])).toEqual([]);
    expect(checkFiles([])).toEqual([]);
  });

  describe("file names", () => {
    it.each(["0002-dutch-golden-age", "0010-a", "9999-batch-2"])("accepts %s", (name) => {
      expect(checkFiles([file(name, [painting("x")])])).toEqual([]);
    });

    it.each(["2-dutch", "00002-dutch", "0002", "0002-", "0002-Dutch", "0002_dutch", "0002-dutch--age", "dutch-0002"])(
      "refuses %s, naming the file",
      (name) => {
        const errors = checkFiles([file(name, [painting("x")])]);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain(name);
        expect(errors[0]).toContain("four digits");
      },
    );

    it("refuses two files with the same number", () => {
      const errors = checkFiles([file("0002-a", [painting("x")]), file("0002-b", [painting("y")])]);
      expect(errors).toEqual([expect.stringContaining("0002-b")]);
      expect(errors[0]).toContain("0002");
    });
  });

  it("refuses a file with no operations", () => {
    expect(checkFiles([file("0002-empty", [])])).toEqual([expect.stringContaining("0002-empty")]);
  });

  describe("paintings per file", () => {
    it(`allows ${MAX_PAINTINGS_PER_FILE}`, () => {
      expect(checkFiles([file("0002-full", many(MAX_PAINTINGS_PER_FILE))])).toEqual([]);
    });

    it(`refuses ${MAX_PAINTINGS_PER_FILE + 1}`, () => {
      const errors = checkFiles([file("0002-too-many", many(MAX_PAINTINGS_PER_FILE + 1))]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("0002-too-many");
      expect(errors[0]).toContain(String(MAX_PAINTINGS_PER_FILE));
    });

    it("counts each file on its own", () => {
      const a = file("0002-a", many(MAX_PAINTINGS_PER_FILE));
      const b = file("0003-b", [painting("another")]);
      expect(checkFiles([a, b])).toEqual([]);
    });

    it("exempts the baseline", () => {
      expect(BASELINE).toBe("0001-baseline");
      expect(checkFiles([file(BASELINE, many(MAX_PAINTINGS_PER_FILE + 12))])).toEqual([]);
    });
  });

  describe("sources", () => {
    it("refuses an annotation with no sources", () => {
      const errors = checkFiles([file("0002-x", [painting("p"), annotate("p", "p-1", { sources: [] })])]);
      expect(errors).toEqual([expect.stringContaining("source")]);
      expect(errors[0]).toContain("0002-x, operation 2");
    });

    it("refuses an edit with no sources", () => {
      const errors = checkFiles([
        file("0002-x", [
          painting("p"),
          annotate("p", "p-1"),
          { op: "editAnnotation", key: "p-1", body: "New.", sources: [] },
        ]),
      ]);
      expect(errors).toEqual([expect.stringContaining("operation 3")]);
    });

    it.each(["Wikipedia", "en.wikipedia.org/wiki/X", "ftp://example.com/x", "javascript:alert(1)", ""])(
      "refuses the source %j, which isn't a web address",
      (source) => {
        const errors = checkFiles([file("0002-x", [painting("p"), annotate("p", "p-1", { sources: [source] })])]);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("web address");
      },
    );

    it("accepts several sources", () => {
      const sources = [SOURCE, "http://museum.example/collection/123"];
      expect(checkFiles([file("0002-x", [painting("p"), annotate("p", "p-1", { sources })])])).toEqual([]);
    });

    it("exempts the baseline from needing a source", () => {
      expect(checkFiles([file(BASELINE, [painting("p"), annotate("p", "p-1", { sources: [] })])])).toEqual([]);
    });
  });

  describe("regions and text", () => {
    it.each([
      [{ x: -0.1, y: 0.1, w: 0.2, h: 0.2 }],
      [{ x: 0.9, y: 0.1, w: 0.2, h: 0.2 }],
      [{ x: 0.1, y: 0.9, w: 0.2, h: 0.2 }],
      [{ x: Number.NaN, y: 0.1, w: 0.2, h: 0.2 }],
    ])("refuses a region outside the image, %j", (region) => {
      const errors = checkFiles([file("0002-x", [painting("p"), annotate("p", "p-1", { region })])]);
      expect(errors).toEqual([expect.stringContaining("Invalid region.")]);
    });

    it("accepts a region reaching exactly to the image's edges", () => {
      const region = { x: 0, y: 0, w: 1, h: 1 };
      expect(checkFiles([file("0002-x", [painting("p"), annotate("p", "p-1", { region })])])).toEqual([]);
    });

    it("refuses a region too small to click", () => {
      const region = { x: 0.1, y: 0.1, w: 0.001, h: 0.2 };
      const errors = checkFiles([file("0002-x", [painting("p"), annotate("p", "p-1", { region })])]);
      expect(errors).toEqual([expect.stringContaining("too small")]);
    });

    it("refuses an edit that moves a box outside the image", () => {
      const errors = checkFiles([
        file("0002-x", [
          painting("p"),
          annotate("p", "p-1"),
          {
            op: "editAnnotation",
            key: "p-1",
            body: "New.",
            region: { x: 0.5, y: 0.5, w: 0.6, h: 0.1 },
            sources: [SOURCE],
          },
        ]),
      ]);
      expect(errors).toEqual([expect.stringContaining("Invalid region.")]);
    });

    it.each(["", "   \n"])("refuses empty text %j", (body) => {
      const errors = checkFiles([file("0002-x", [painting("p"), annotate("p", "p-1", { body })])]);
      expect(errors).toEqual([expect.stringContaining("Write something")]);
    });

    it("refuses text over 5000 characters, and accepts exactly 5000", () => {
      const at = (n: number) =>
        checkFiles([file("0002-x", [painting("p"), annotate("p", "p-1", { body: "a".repeat(n) })])]);
      expect(at(5000)).toEqual([]);
      expect(at(5001)).toEqual([expect.stringContaining("5000")]);
    });
  });

  describe("keys", () => {
    it("refuses a painting key used twice, even in different files", () => {
      const errors = checkFiles([file("0002-a", [painting("p")]), file("0003-b", [painting("p")])]);
      expect(errors).toEqual([expect.stringContaining("0003-b")]);
      expect(errors[0]).toContain("p");
    });

    it("refuses an annotation key used twice, even in different files", () => {
      const errors = checkFiles([
        file("0002-a", [painting("p"), annotate("p", "p-1")]),
        file("0003-b", [annotate("p", "p-1", { region: { x: 0.6, y: 0.6, w: 0.2, h: 0.2 } })]),
      ]);
      expect(errors).toEqual([expect.stringContaining("0003-b")]);
    });

    it("lets a later file refer to an earlier file's keys", () => {
      const errors = checkFiles([
        file("0002-a", [painting("p"), annotate("p", "p-1")]),
        file("0003-b", [
          { op: "editAnnotation", key: "p-1", body: "Fixed.", sources: [SOURCE] },
          { op: "removeAnnotation", key: "p-1" },
          { op: "removePainting", key: "p" },
        ]),
      ]);
      expect(errors).toEqual([]);
    });

    it.each(["Milkmaid", "milk_maid", "milk maid", "-milkmaid", "milkmaid-", ""])(
      "refuses the painting key %j",
      (key) => {
        expect(checkFiles([file("0002-x", [painting(key)])])).not.toEqual([]);
      },
    );

    it("refuses an annotation key that isn't lower-case words", () => {
      expect(checkFiles([file("0002-x", [painting("p"), annotate("p", "P 1")])])).toHaveLength(1);
    });

    it("refuses annotating a painting no file has added", () => {
      const errors = checkFiles([file("0002-x", [annotate("nowhere", "nowhere-1")])]);
      expect(errors).toEqual([expect.stringContaining('"nowhere"')]);
    });

    it("refuses annotating a painting before the operation that adds it", () => {
      expect(checkFiles([file("0002-x", [annotate("p", "p-1"), painting("p")])])).toHaveLength(1);
    });

    it.each<Operation>([
      { op: "editAnnotation", key: "ghost", body: "x", sources: [SOURCE] },
      { op: "removeAnnotation", key: "ghost" },
      { op: "removePainting", key: "ghost" },
    ])("refuses $op of an unknown key", (operation) => {
      const errors = checkFiles([file("0002-x", [operation])]);
      expect(errors).toEqual([expect.stringContaining('"ghost"')]);
    });
  });

  describe("paintings", () => {
    it("refuses a painting with no title", () => {
      const errors = checkFiles([file("0002-x", [{ ...painting("p"), title: "  " } as Operation])]);
      expect(errors).toEqual([expect.stringContaining("title")]);
    });

    it.each(["https://en.wikipedia.org/wiki/File:x.jpg", "https://upload.wikimedia.org/x.jpg", "not a url"])(
      "refuses the source %s, which isn't a Commons file page",
      (source) => {
        const errors = checkFiles([file("0002-x", [{ ...painting("p"), source } as Operation])]);
        expect(errors).toEqual([expect.stringContaining("Commons")]);
      },
    );
  });

  describe("collections", () => {
    it("refuses a collection that names a painting no file has added", () => {
      const errors = checkFiles([
        file("0002-x", [
          painting("p"),
          { op: "addCollection", slug: "c", name: "C", blurb: "" },
          { op: "addToCollection", collection: "c", paintings: ["p", "ghost"] },
        ]),
      ]);
      expect(errors).toEqual([expect.stringContaining('"ghost"')]);
    });

    it("refuses adding to, or removing from, a collection no file has added", () => {
      const errors = checkFiles([
        file("0002-x", [
          painting("p"),
          { op: "addToCollection", collection: "nowhere", paintings: ["p"] },
          { op: "removeFromCollection", collection: "nowhere", paintings: ["p"] },
        ]),
      ]);
      expect(errors).toHaveLength(2);
      for (const e of errors) expect(e).toContain('"nowhere"');
    });

    it("refuses adding the same collection twice", () => {
      const add: Operation = { op: "addCollection", slug: "c", name: "C", blurb: "" };
      expect(checkFiles([file("0002-a", [add]), file("0003-b", [add])])).toEqual([expect.stringContaining("0003-b")]);
    });

    it("refuses a collection with no name, or a slug that isn't lower-case words", () => {
      expect(checkFiles([file("0002-x", [{ op: "addCollection", slug: "c", name: " ", blurb: "" }])])).toHaveLength(1);
      expect(
        checkFiles([file("0002-x", [{ op: "addCollection", slug: "Big Row", name: "B", blurb: "" }])]),
      ).toHaveLength(1);
    });
  });

  it("refuses an operation the runner doesn't know", () => {
    const errors = checkFiles([file("0002-x", [{ op: "renamePainting", key: "p" } as unknown as Operation])]);
    expect(errors).toEqual([expect.stringContaining("isn't an operation")]);
  });

  it("reports every problem, each naming its file and operation", () => {
    const errors = checkFiles([
      file("0002-x", [painting("p"), annotate("p", "p-1", { sources: [] }), annotate("ghost", "g-1")]),
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^0002-x, operation 2 \(annotate\): /);
    expect(errors[1]).toMatch(/^0002-x, operation 3 \(annotate\): /);
  });
});
