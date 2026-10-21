import { describe, expect, it, vi } from "vitest";
import { toFraction, toPixels } from "./regions";

// Annotorious loads OpenSeadragon, which doesn't run in Node. These tests only need ShapeType.
vi.mock("@annotorious/react", () => ({ ShapeType: { RECTANGLE: "RECTANGLE" } }));

const size = { width: 2000, height: 1000 };

describe("toPixels and toFraction", () => {
  it("convert between fractions and image pixels", () => {
    const region = { x: 0.25, y: 0.5, w: 0.1, h: 0.2 };
    const px = toPixels(region, size);
    expect(px).toMatchObject({ x: 500, y: 500, w: 200, h: 200 });
    expect(px.bounds).toEqual({ minX: 500, minY: 500, maxX: 700, maxY: 700 });
    const back = toFraction(px, size);
    for (const k of ["x", "y", "w", "h"] as const) expect(back[k]).toBeCloseTo(region[k]);
  });

  it("clamps a box dragged past the image's edge", () => {
    const clamped = toFraction({ x: -200, y: 900, w: 600, h: 200 }, size);
    const expected = { x: 0, y: 0.9, w: 0.2, h: 0.1 };
    for (const k of ["x", "y", "w", "h"] as const) expect(clamped[k]).toBeCloseTo(expected[k]);
  });
});
