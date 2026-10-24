import { describe, expect, it } from "vitest";
import { checksum, stableJson } from "./checksum";
import type { Operation } from "./operations";

const annotate: Operation = {
  op: "annotate",
  painting: "great-wave",
  key: "great-wave-1",
  region: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  body: "Mount Fuji",
  sources: ["https://en.wikipedia.org/wiki/The_Great_Wave_off_Kanagawa"],
};

describe("stableJson", () => {
  it("gives the same text whatever order an object's keys are in, at any depth", () => {
    const a = { b: 1, a: { d: [1, 2], c: "x" } };
    const b = { a: { c: "x", d: [1, 2] }, b: 1 };
    expect(stableJson(a)).toBe(stableJson(b));
    expect(stableJson(a)).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
  });

  it("keeps the order of arrays", () => {
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]));
  });

  it("leaves out fields set to undefined, as JSON.stringify does", () => {
    expect(stableJson({ a: 1, b: undefined })).toBe(stableJson({ a: 1 }));
  });

  it("matches JSON.stringify for plain values", () => {
    for (const v of ["text", 1.5, true, null, 'quote " and \n newline']) expect(stableJson(v)).toBe(JSON.stringify(v));
  });
});

describe("checksum", () => {
  it("is a hex SHA-256", () => {
    expect(checksum([annotate])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("doesn't change when the fields are written in another order", () => {
    const reordered = {
      sources: [...annotate.sources],
      body: "Mount Fuji",
      region: { h: 0.4, w: 0.3, y: 0.2, x: 0.1 },
      key: "great-wave-1",
      painting: "great-wave",
      op: "annotate",
    } as Operation;
    expect(checksum([reordered])).toBe(checksum([annotate]));
  });

  it("changes when any value changes", () => {
    const base = checksum([annotate]);
    expect(checksum([{ ...annotate, body: "Mount Fuji." }])).not.toBe(base);
    expect(checksum([{ ...annotate, region: { ...annotate.region, x: 0.11 } } as Operation])).not.toBe(base);
    expect(checksum([{ ...annotate, sources: [...annotate.sources, "https://example.com"] }])).not.toBe(base);
  });

  it("changes when operations are added, removed or reordered", () => {
    const remove: Operation = { op: "removeAnnotation", key: "great-wave-1" };
    expect(checksum([annotate, remove])).not.toBe(checksum([annotate]));
    expect(checksum([annotate, remove])).not.toBe(checksum([remove, annotate]));
    expect(checksum([])).not.toBe(checksum([annotate]));
  });
});
