// Import the Vitest functions for grouping, asserting and mocking.
import { describe, expect, it, vi } from "vitest";

// Import the two conversion functions under test.
import { toFraction, toPixels } from "./regions";

// Annotorious loads OpenSeadragon, which doesn't run in Node. These tests only need ShapeType.
vi.mock("@annotorious/react", () => ({ ShapeType: { RECTANGLE: "RECTANGLE" } }));

// A 2000 by 1000 pixel image, used by every test below.
const size = { width: 2000, height: 1000 };

// Group the tests for the two conversion functions.
describe("toPixels and toFraction", () => {
  // Check that a round trip returns the original region.
  it("convert between fractions and image pixels", () => {
    // A region stored as fractions of the image.
    const region = { x: 0.25, y: 0.5, w: 0.1, h: 0.2 };

    // Convert it to pixels.
    const px = toPixels(region, size);

    // Check the pixel position and size.
    expect(px).toMatchObject({ x: 500, y: 500, w: 200, h: 200 });

    // Check the bounding box the pixel region carries.
    expect(px.bounds).toEqual({ minX: 500, minY: 500, maxX: 700, maxY: 700 });

    // Convert back to fractions.
    const back = toFraction(px, size);

    // Check each value matches the original, allowing for floating-point error.
    for (const k of ["x", "y", "w", "h"] as const) expect(back[k]).toBeCloseTo(region[k]);
  });

  // Check that a box dragged outside the image is cut back to the image.
  it("clamps a box dragged past the image's edge", () => {
    // Convert a box that starts left of the image and runs past the right edge.
    const clamped = toFraction({ x: -200, y: 900, w: 600, h: 200 }, size);

    // The result we expect after clamping.
    const expected = { x: 0, y: 0.9, w: 0.2, h: 0.1 };

    // Check each value, allowing for floating-point error.
    for (const k of ["x", "y", "w", "h"] as const) expect(clamped[k]).toBeCloseTo(expected[k]);
  });
});
