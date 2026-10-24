import { describe, expect, it } from "vitest";
import { checksum } from "./checksum";
import type { ContentFile, Operation } from "./operations";
import { contentStatus } from "./runner";

// contentStatus only reads ContentMigration, so a stand-in for the database is enough here. The
// writes are covered by the system tests (e2e/content.spec.ts).

type Row = { name: string; checksum: string; appliedAt: Date };
const dbWith = (rows: Row[]) => ({ contentMigration: { findMany: async () => rows } }) as never;

const ops = (key: string): Operation[] => [
  {
    op: "addPainting",
    key,
    title: "T",
    description: "D",
    source: `https://commons.wikimedia.org/wiki/File:${key}.jpg`,
  },
];
const file = (name: string, key: string): ContentFile => ({ name, operations: ops(key) });
const at = new Date("2026-10-24T00:00:00Z");

describe("contentStatus", () => {
  it("lists applied and pending files", async () => {
    const files = [file("0001-baseline", "a"), file("0002-next", "b")];
    const status = await contentStatus(
      dbWith([{ name: "0001-baseline", checksum: checksum(files[0].operations), appliedAt: at }]),
      files,
    );
    expect(status.problems).toEqual([]);
    expect(status.applied).toEqual([{ name: "0001-baseline", appliedAt: at }]);
    expect(status.pending.map((f) => f.name)).toEqual(["0002-next"]);
  });

  it("refuses an applied file whose operations have changed", async () => {
    const status = await contentStatus(dbWith([{ name: "0002-next", checksum: checksum(ops("old")), appliedAt: at }]), [
      file("0002-next", "new"),
    ]);
    expect(status.problems).toEqual([expect.stringContaining("0002-next has changed since it was applied")]);
  });

  it("accepts an applied file whose fields have only been reordered", async () => {
    const [o] = ops("a");
    const reordered = {
      source: o.op === "addPainting" ? o.source : "",
      description: "D",
      title: "T",
      key: "a",
      op: "addPainting",
    };
    const status = await contentStatus(dbWith([{ name: "0002-next", checksum: checksum(ops("a")), appliedAt: at }]), [
      { name: "0002-next", operations: [reordered as Operation] },
    ]);
    expect(status.problems).toEqual([]);
  });

  it("refuses when an applied file is missing", async () => {
    const status = await contentStatus(dbWith([{ name: "0003-gone", checksum: "x", appliedAt: at }]), [
      file("0002-next", "a"),
    ]);
    expect(status.problems).toContainEqual(expect.stringContaining("0003-gone was applied"));
  });

  describe("files numbered before the last applied one", () => {
    const applied = (...names: string[]) =>
      dbWith(names.map((name) => ({ name, checksum: checksum(ops(name.slice(5))), appliedAt: at })));

    it("refuses a pending file that comes before an applied one, naming both", async () => {
      const files = [file("0001-a", "a"), file("0002-b", "b"), file("0003-c", "c")];
      const status = await contentStatus(applied("0001-a", "0003-c"), files);
      expect(status.problems).toEqual([expect.stringMatching(/^0002-b comes before 0003-c, which is already applied/)]);
      expect(status.pending.map((f) => f.name)).toEqual(["0002-b"]);
    });

    it("accepts pending files numbered after the last applied one", async () => {
      const files = [file("0001-a", "a"), file("0002-b", "b"), file("0003-c", "c")];
      const status = await contentStatus(applied("0001-a"), files);
      expect(status.problems).toEqual([]);
      expect(status.pending.map((f) => f.name)).toEqual(["0002-b", "0003-c"]);
    });

    it("accepts any files on a database with nothing applied", async () => {
      const status = await contentStatus(applied(), [file("0001-a", "a"), file("0002-b", "b")]);
      expect(status.problems).toEqual([]);
    });

    it("reports each early file", async () => {
      const files = [file("0001-a", "a"), file("0002-b", "b"), file("0005-e", "e")];
      const status = await contentStatus(applied("0005-e"), files);
      expect(status.problems).toEqual([
        expect.stringContaining("0001-a comes before 0005-e"),
        expect.stringContaining("0002-b comes before 0005-e"),
      ]);
    });
  });

  it("reports problems in the files themselves", async () => {
    const status = await contentStatus(dbWith([]), [file("0002-Bad-Name", "a")]);
    expect(status.problems).toEqual([expect.stringContaining("0002-Bad-Name")]);
  });
});
