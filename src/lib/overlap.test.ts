// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the two functions under test.
import { clickableShare, findClash } from "./overlap";

// Group the tests for the clickable-share calculation.
describe("clickableShare", () => {
  // A 0.2 by 0.2 box at the top-left corner.
  const box = { x: 0, y: 0, w: 0.2, h: 0.2 };

  // Check the share with and without smaller boxes on top.
  it("is the part of a box that no smaller box covers", () => {
    // With no other boxes, all of it is clickable.
    expect(clickableShare(box, [])).toBe(1);

    // A smaller box covering the left half leaves half clickable.
    expect(clickableShare(box, [{ x: 0, y: 0, w: 0.1, h: 0.2 }])).toBeCloseTo(0.5);
  });

  // Check that bigger boxes don't count.
  it("ignores larger boxes, which lose the click to this one", () => {
    // A larger box over this one leaves all of it clickable.
    expect(clickableShare(box, [{ x: 0, y: 0, w: 0.5, h: 0.5 }])).toBe(1);
  });
});

// Group the tests for the clash check.
describe("findClash", () => {
  // A larger existing box.
  const big = { id: "big", x: 0, y: 0, w: 0.2, h: 0.2 };

  // A smaller existing box inside the larger one's corner.
  const small = { id: "small", x: 0, y: 0, w: 0.1, h: 0.1 };

  // Check separate boxes.
  it("allows boxes that don't overlap", () => {
    // A new box far from the existing one has no clash.
    expect(findClash({ id: "new", x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, [big])).toBeNull();
  });

  // Check a new box that would hide an existing one.
  it("returns the existing box a new box would hide", () => {
    // A new box almost the same size on top of the existing one hides it.
    expect(findClash({ id: "new", x: 0, y: 0, w: 0.2, h: 0.19 }, [big])).toBe(big);
  });

  // Check a new box that an existing smaller box would hide.
  it("returns the smaller box that would hide a new box", () => {
    // A new box just bigger than the small one is covered by it.
    expect(findClash({ id: "new", x: 0, y: 0, w: 0.11, h: 0.11 }, [small])).toBe(small);
  });

  // Check that a box moved on its own doesn't clash with itself.
  it("doesn't compare a moved box with its old position", () => {
    // The same id, slightly moved, has no clash with its old position.
    expect(findClash({ ...big, x: 0.01 }, [big])).toBeNull();
  });
});
