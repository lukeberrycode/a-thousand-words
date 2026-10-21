import { describe, expect, it } from "vitest";
import { clickableShare, findClash } from "./overlap";

describe("clickableShare", () => {
  const box = { x: 0, y: 0, w: 0.2, h: 0.2 };

  it("is the part of a box that no smaller box covers", () => {
    expect(clickableShare(box, [])).toBe(1);
    expect(clickableShare(box, [{ x: 0, y: 0, w: 0.1, h: 0.2 }])).toBeCloseTo(0.5);
  });

  it("ignores larger boxes, which lose the click to this one", () => {
    expect(clickableShare(box, [{ x: 0, y: 0, w: 0.5, h: 0.5 }])).toBe(1);
  });
});

describe("findClash", () => {
  const big = { id: "big", x: 0, y: 0, w: 0.2, h: 0.2 };
  const small = { id: "small", x: 0, y: 0, w: 0.1, h: 0.1 };

  it("allows boxes that don't overlap", () => {
    expect(findClash({ id: "new", x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, [big])).toBeNull();
  });

  it("returns the existing box a new box would hide", () => {
    expect(findClash({ id: "new", x: 0, y: 0, w: 0.2, h: 0.19 }, [big])).toBe(big);
  });

  it("returns the smaller box that would hide a new box", () => {
    expect(findClash({ id: "new", x: 0, y: 0, w: 0.11, h: 0.11 }, [small])).toBe(small);
  });

  it("doesn't compare a moved box with its old position", () => {
    expect(findClash({ ...big, x: 0.01 }, [big])).toBeNull();
  });
});
