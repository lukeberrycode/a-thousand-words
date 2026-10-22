import { describe, expect, it } from "vitest";
import { BODY_MAX, MIN_REGION_SIDE, checkBody, checkRegion } from "./annotations";

describe("checkBody", () => {
  it("needs some text, up to the limit", () => {
    expect(checkBody("A skull")).toBeNull();
    expect(checkBody("  \n ")).toMatch(/Write something/);
    expect(checkBody("x".repeat(BODY_MAX))).toBeNull();
    expect(checkBody("x".repeat(BODY_MAX + 1))).toMatch(/up to/);
  });
});

describe("checkRegion", () => {
  it("accepts a region inside the image, allowing for rounding at the edges", () => {
    expect(checkRegion({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toBeNull();
    expect(checkRegion({ x: 0.7, y: 0.7, w: 0.3 + 1e-12, h: 0.3 })).toBeNull();
  });

  it("refuses regions outside the image, or that aren't numbers", () => {
    expect(checkRegion({ x: -0.1, y: 0, w: 0.2, h: 0.2 })).toBe("Invalid region.");
    expect(checkRegion({ x: 0.9, y: 0, w: 0.2, h: 0.2 })).toBe("Invalid region.");
    expect(checkRegion({ x: NaN, y: 0, w: 0.2, h: 0.2 })).toBe("Invalid region.");
  });

  it("refuses a region thinner than the smallest side", () => {
    expect(checkRegion({ x: 0, y: 0, w: MIN_REGION_SIDE / 2, h: 0.5 })).toMatch(/too small/);
  });
});
