import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BASELINE, checkFiles } from "./check";
import { loadContentFiles } from "./files";
import { CONTENT_USER } from "./operations";
import { paintingsToFetch, planFile, type ContentState, type Fetched } from "./plan";

// Every content file in prisma/content, as CI sees it (ADR 0026).

/** A made-up download for a painting: its hashes come from its key, so no two look alike. */
function fakeDownload(key: string): NonNullable<Fetched> {
  const digest = createHash("sha256").update(key).digest();
  return {
    width: 2000,
    height: 1500,
    sha256: digest.toString("hex"),
    phash: digest.readBigInt64BE(0),
  };
}

describe("the content files in prisma/content", () => {
  it("load in order, starting with the baseline", async () => {
    const files = await loadContentFiles();
    expect(files[0].name).toBe(BASELINE);
    expect(files.map((f) => f.name)).toEqual([...files.map((f) => f.name)].sort());
    for (const f of files) expect(f.operations.length).toBeGreaterThan(0);
  });

  it("pass every check", async () => {
    expect(checkFiles(await loadContentFiles())).toEqual([]);
  });

  it("plan on an empty database with nothing skipped or unmatched", async () => {
    let state: ContentState = { contentUserId: CONTENT_USER.id, images: [], regions: [], collections: [] };
    for (const file of await loadContentFiles()) {
      const fetched = new Map(paintingsToFetch(state, file.operations).map((o) => [o.key, fakeDownload(o.key)]));
      const plan = planFile(state, file.operations, fetched);
      expect(plan.skipped, file.name).toEqual([]);
      expect(plan.unmatched, file.name).toEqual([]);
      state = plan.after;
    }
  });

  it("make the baseline add every painting, box and collection it lists", async () => {
    const [baseline] = await loadContentFiles();
    const state: ContentState = { contentUserId: CONTENT_USER.id, images: [], regions: [], collections: [] };
    const fetched = new Map(paintingsToFetch(state, baseline.operations).map((o) => [o.key, fakeDownload(o.key)]));
    const plan = planFile(state, baseline.operations, fetched);
    const count = (op: string) => baseline.operations.filter((o) => o.op === op).length;
    const made = (kind: string) => plan.changes.filter((c) => c.kind === kind).length;
    expect(made("addPainting")).toBe(count("addPainting"));
    expect(made("addRegion")).toBe(count("annotate"));
    expect(made("addCollection")).toBe(count("addCollection"));
    expect(plan.unchanged).toEqual([]);
  });
});
