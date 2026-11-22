// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the limits and checks under test.
import { BODY_MAX, MIN_REGION_SIDE, checkBody, checkRegion } from "./annotations";

// Group the tests for the text check.
describe("checkBody", () => {
  // Check the accepted and refused lengths.
  it("needs some text, up to the limit", () => {
    // Normal text passes.
    expect(checkBody("A skull")).toBeNull();

    // Whitespace alone is refused.
    expect(checkBody("  \n ")).toMatch(/Write something/);

    // Text exactly at the limit passes.
    expect(checkBody("x".repeat(BODY_MAX))).toBeNull();

    // Text one character over the limit is refused.
    expect(checkBody("x".repeat(BODY_MAX + 1))).toMatch(/up to/);
  });
});

// Group the tests for the region check.
describe("checkRegion", () => {
  // Check regions that fit.
  it("accepts a region inside the image, allowing for rounding at the edges", () => {
    // A region well inside the image passes.
    expect(checkRegion({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toBeNull();

    // A region that overshoots the edge by a rounding error passes.
    expect(checkRegion({ x: 0.7, y: 0.7, w: 0.3 + 1e-12, h: 0.3 })).toBeNull();
  });

  // Check regions that don't fit.
  it("refuses regions outside the image, or that aren't numbers", () => {
    // A negative position is refused.
    expect(checkRegion({ x: -0.1, y: 0, w: 0.2, h: 0.2 })).toBe("Invalid region.");

    // A region running past the right edge is refused.
    expect(checkRegion({ x: 0.9, y: 0, w: 0.2, h: 0.2 })).toBe("Invalid region.");

    // NaN is refused.
    expect(checkRegion({ x: NaN, y: 0, w: 0.2, h: 0.2 })).toBe("Invalid region.");
  });

  // Check the minimum size.
  it("refuses a region thinner than the smallest side", () => {
    // A region half the minimum width is refused.
    expect(checkRegion({ x: 0, y: 0, w: MIN_REGION_SIDE / 2, h: 0.5 })).toMatch(/too small/);
  });
});
