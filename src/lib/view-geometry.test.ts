// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the functions and constants under test.
import {
  // The gap between a card and its box.
  CARD_GAP,
  // Which side of its box a card sits.
  cardSide,
  // Keeps a view within its limits.
  clampView,
  // The zoom that fits the whole image.
  fitScale,
  // Keeps the same part of the image in view when the area changes.
  keepView,
  // Decides which edge the panel sits on after a pan.
  panelEdgeAfterPan,
  // Positions a card.
  placeCard,
  // Converts a region to screen coordinates.
  regionOnScreen,
  // Zooms around a point.
  zoomAround,
  // The minimum and maximum zoom.
  zoomLimits,
} from "./view-geometry";

// Rule numbers are from docs/enrich-UI.md.

// Group the tests for zoom limits.
describe("zoom limits (Rules 1.1 and 2.3)", () => {
  // Check the minimum and maximum.
  it("fit the whole image, and zoom to 4× native pixels or 4× the fit size", () => {
    // A 2000×1000 image in a 1000×1000 area fits at half size.
    expect(fitScale({ width: 2000, height: 1000 }, { x: 0, y: 0, w: 1000, h: 1000 })).toBe(0.5);

    // The limits run from the fit size to 4× native pixels.
    expect(zoomLimits({ width: 2000, height: 1000 }, { x: 0, y: 0, w: 1000, h: 1000 })).toEqual({ min: 0.5, max: 4 });

    // A small image fits at 10×, so the maximum is 4× the fit size.
    expect(zoomLimits({ width: 100, height: 100 }, { x: 0, y: 0, w: 1000, h: 1000 })).toEqual({ min: 10, max: 40 });
  });
});

// Group the tests for view clamping.
describe("clampView (Rules 1.2, 2.4 and 3.6)", () => {
  // A square 1000×1000 image.
  const size = { width: 1000, height: 1000 };

  // A wide area, 2000×1000.
  const area = { x: 0, y: 0, w: 2000, h: 1000 };

  // Check where a narrow image sits.
  it("puts an image narrower than the area at the edge away from the panel", () => {
    // With the panel at the start, the image goes to the far side.
    expect(clampView({ scale: 1, x: 0, y: 0 }, size, area, "landscape", "start")).toEqual({ scale: 1, x: 1000, y: 0 });

    // With the panel at the end, the image goes to the near side.
    expect(clampView({ scale: 1, x: 500, y: 0 }, size, area, "landscape", "end")).toEqual({ scale: 1, x: 0, y: 0 });
  });

  // Check the zoom and pan limits.
  it("raises the zoom to the fit size, and stops panning past the image's edges", () => {
    // A zoom below the fit size is raised to it.
    expect(clampView({ scale: 0.1, x: 0, y: 0 }, size, area, "landscape", "start").scale).toBe(1);

    // A pan that would show past the image's edge is pulled back.
    expect(clampView({ scale: 2, x: 0, y: 50 }, size, area, "landscape", "start")).toEqual({ scale: 2, x: 0, y: 0 });
  });
});

// Group the tests for zooming.
describe("zoomAround", () => {
  // Check the fixed point.
  it("keeps the point under the pointer still", () => {
    // Doubling the zoom around (100, 100) shifts the offset by -100 on each axis.
    expect(zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 100 })).toEqual({ scale: 2, x: -100, y: -100 });
  });
});

// Group the tests for keeping a view.
describe("keepView", () => {
  // Check the unchanged case.
  it("leaves the view alone when the area hasn't changed", () => {
    // An area.
    const area = { x: 0, y: 0, w: 800, h: 600 };

    // A view inside it.
    const view = { scale: 0.8, x: -40, y: 10 };

    // Keep the view when the old and new areas are the same.
    const kept = keepView(view, { width: 1000, height: 1000 }, area, area);

    // Each number is unchanged, allowing for floating-point error.
    for (const k of ["scale", "x", "y"] as const) expect(kept[k]).toBeCloseTo(view[k]);
  });
});

// Group the tests for the panel edge.
describe("panelEdgeAfterPan (Rule 3.4)", () => {
  // Check the cases that change nothing.
  it("ignores small drags and movement across the panel's axis", () => {
    // A drag of 10 is too small.
    expect(panelEdgeAfterPan("portrait", { x: 0, y: -10 }, "end")).toBe("end");

    // A big drag on the wrong axis is ignored.
    expect(panelEdgeAfterPan("portrait", { x: -300, y: 0 }, "end")).toBe("end");
  });

  // Check the cases that move the panel.
  it("moves the panel to the edge the image moved away from", () => {
    // Dragging up in portrait moves the panel to the start.
    expect(panelEdgeAfterPan("portrait", { x: 0, y: -30 }, "end")).toBe("start");

    // Dragging right in landscape moves the panel to the end.
    expect(panelEdgeAfterPan("landscape", { x: 30, y: 0 }, "start")).toBe("end");
  });
});

// Group the tests for screen placement.
describe("regionOnScreen", () => {
  // Check the arithmetic.
  it("places a region using the view's scale and offset", () => {
    // Work out where the region lands on screen.
    expect(
      regionOnScreen({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, { width: 1000, height: 500 }, { scale: 2, x: 10, y: 20 }),
      // At 2× zoom with an offset of (10, 20).
    ).toEqual({ x: 1010, y: 520, w: 200, h: 100 });
  });
});

// Group the tests for card sides.
describe("cardSide (Rules 5.2 to 5.4)", () => {
  // Check the clear-cut cases.
  it("puts the card on the side nearer the image's centre", () => {
    // A box near the top puts its card after (below) it.
    expect(cardSide({ x: 0, y: 0.1, w: 0.1, h: 0.1 }, "portrait")).toBe("after");

    // A box near the bottom puts its card before (above) it.
    expect(cardSide({ x: 0, y: 0.8, w: 0.1, h: 0.1 }, "portrait")).toBe("before");

    // In landscape, a box on the right puts its card before (left of) it.
    expect(cardSide({ x: 0.8, y: 0, w: 0.1, h: 0.1 }, "landscape")).toBe("before");
  });

  // Check the near-centre cases.
  it("gives a centred box the side with more image, or else below", () => {
    // Just below the middle: more image above, so before.
    expect(cardSide({ x: 0, y: 0.46, w: 0.1, h: 0.1 }, "portrait")).toBe("before");

    // Just above the middle: more image below, so after.
    expect(cardSide({ x: 0, y: 0.44, w: 0.1, h: 0.1 }, "portrait")).toBe("after");

    // Exactly centred: after (below).
    expect(cardSide({ x: 0, y: 0.45, w: 0.1, h: 0.1 }, "portrait")).toBe("after");
  });
});

// Group the tests for card placement.
describe("placeCard (Rules 5.7 and 8.2)", () => {
  // A 400×800 visible area.
  const area = { x: 0, y: 0, w: 400, h: 800 };

  // A 200×100 card.
  const card = { w: 200, h: 100 };

  // Check the normal case.
  it("puts the card beside its box, centred on it", () => {
    // A box in the upper part of the area.
    const box = { x: 100, y: 100, w: 100, h: 100 };

    // The card sits below the box, centred, with a gap.
    expect(placeCard(box, card, area, "portrait", "after", false)).toEqual({
      // Centred on the box's middle.
      x: 50,

      // Just below the box.
      y: 200 + CARD_GAP,

      // It doesn't cover the box.
      overlap: false,
    });
  });

  // Check the crowded cases.
  it("floats the card over the box when there's no room beside it, or above the keyboard", () => {
    // A box near the bottom edge.
    const box = { x: 100, y: 700, w: 100, h: 90 };

    // No room below, so the card overlaps the box.
    expect(placeCard(box, card, area, "portrait", "after", false)).toEqual({ x: 50, y: 678, overlap: true });

    // With a keyboard open, the card is also kept clear of it.
    expect(placeCard(box, card, area, "portrait", "after", true)).toEqual({ x: 50, y: 688, overlap: true });
  });
});
