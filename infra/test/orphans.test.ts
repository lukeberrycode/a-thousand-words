import { describe, expect, it } from "vitest";
import { chunk, DEFAULT_MIN_AGE_MS, findOrphans } from "../lambda/orphans";

const now = new Date("2026-10-20T03:17:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe("findOrphans", () => {
  it("keeps an object with an Image row, however old", () => {
    const objects = [{ key: "images/a.jpg", lastModified: hoursAgo(24 * 30) }];
    expect(findOrphans(objects, new Set(["images/a.jpg"]), now)).toEqual([]);
  });

  it("keeps an object with no row that is under 24 hours old", () => {
    const objects = [{ key: "images/new.jpg", lastModified: hoursAgo(23) }];
    expect(findOrphans(objects, new Set(), now)).toEqual([]);
  });

  it("deletes an object with no row that is over 24 hours old", () => {
    const objects = [{ key: "images/old.jpg", lastModified: hoursAgo(25) }];
    expect(findOrphans(objects, new Set(), now)).toEqual(["images/old.jpg"]);
  });

  it("keeps an object exactly 24 hours old, and deletes it a millisecond later", () => {
    const exactly = new Date(now.getTime() - DEFAULT_MIN_AGE_MS);
    const objects = [{ key: "images/edge.jpg", lastModified: exactly }];
    expect(findOrphans(objects, new Set(), now)).toEqual([]);
    expect(findOrphans(objects, new Set(), new Date(now.getTime() + 1))).toEqual(["images/edge.jpg"]);
  });

  it("keeps an object whose age is unknown", () => {
    expect(findOrphans([{ key: "images/x.jpg", lastModified: undefined }], new Set(), now)).toEqual([]);
  });

  it("picks only the orphans from a mixed list, in order", () => {
    const objects = [
      { key: "images/seed/the-third-of-may.jpg", lastModified: hoursAgo(500) },
      { key: "images/abandoned-1.png", lastModified: hoursAgo(48) },
      { key: "images/uploading.webp", lastModified: hoursAgo(0.1) },
      { key: "images/kept.jpg", lastModified: hoursAgo(72) },
      { key: "images/abandoned-2.jpg", lastModified: hoursAgo(30) },
    ];
    const known = new Set(["images/seed/the-third-of-may.jpg", "images/kept.jpg"]);
    expect(findOrphans(objects, known, now)).toEqual(["images/abandoned-1.png", "images/abandoned-2.jpg"]);
  });

  it("honours a different minimum age", () => {
    const objects = [{ key: "images/a.jpg", lastModified: hoursAgo(2) }];
    expect(findOrphans(objects, new Set(), now, 60 * 60 * 1000)).toEqual(["images/a.jpg"]);
  });
});

describe("chunk", () => {
  it("splits into batches of at most the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 1000)).toEqual([]);
  });
});
