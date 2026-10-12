import { describe, expect, it } from "vitest";
import {
  CARD_GAP,
  cardSide,
  clampView,
  fitScale,
  keepView,
  panelEdgeAfterPan,
  placeCard,
  regionOnScreen,
  zoomAround,
  zoomLimits,
} from "./view-geometry";

// Rule numbers are from docs/enrich-UI.md.

describe("zoom limits (Rules 1.1 and 2.3)", () => {
  it("fit the whole image, and zoom to 4× native pixels or 4× the fit size", () => {
    expect(fitScale({ width: 2000, height: 1000 }, { x: 0, y: 0, w: 1000, h: 1000 })).toBe(0.5);
    expect(zoomLimits({ width: 2000, height: 1000 }, { x: 0, y: 0, w: 1000, h: 1000 })).toEqual({ min: 0.5, max: 4 });
    expect(zoomLimits({ width: 100, height: 100 }, { x: 0, y: 0, w: 1000, h: 1000 })).toEqual({ min: 10, max: 40 });
  });
});

describe("clampView (Rules 1.2, 2.4 and 3.6)", () => {
  const size = { width: 1000, height: 1000 };
  const area = { x: 0, y: 0, w: 2000, h: 1000 };

  it("puts an image narrower than the area at the edge away from the panel", () => {
    expect(clampView({ scale: 1, x: 0, y: 0 }, size, area, "landscape", "start")).toEqual({ scale: 1, x: 1000, y: 0 });
    expect(clampView({ scale: 1, x: 500, y: 0 }, size, area, "landscape", "end")).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("raises the zoom to the fit size, and stops panning past the image's edges", () => {
    expect(clampView({ scale: 0.1, x: 0, y: 0 }, size, area, "landscape", "start").scale).toBe(1);
    expect(clampView({ scale: 2, x: 0, y: 50 }, size, area, "landscape", "start")).toEqual({ scale: 2, x: 0, y: 0 });
  });
});

describe("zoomAround", () => {
  it("keeps the point under the pointer still", () => {
    expect(zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 100 })).toEqual({ scale: 2, x: -100, y: -100 });
  });
});

describe("keepView", () => {
  it("leaves the view alone when the area hasn't changed", () => {
    const area = { x: 0, y: 0, w: 800, h: 600 };
    const view = { scale: 0.8, x: -40, y: 10 };
    const kept = keepView(view, { width: 1000, height: 1000 }, area, area);
    for (const k of ["scale", "x", "y"] as const) expect(kept[k]).toBeCloseTo(view[k]);
  });
});

describe("panelEdgeAfterPan (Rule 3.4)", () => {
  it("ignores small drags and movement across the panel's axis", () => {
    expect(panelEdgeAfterPan("portrait", { x: 0, y: -10 }, "end")).toBe("end");
    expect(panelEdgeAfterPan("portrait", { x: -300, y: 0 }, "end")).toBe("end");
  });

  it("moves the panel to the edge the image moved away from", () => {
    expect(panelEdgeAfterPan("portrait", { x: 0, y: -30 }, "end")).toBe("start");
    expect(panelEdgeAfterPan("landscape", { x: 30, y: 0 }, "start")).toBe("end");
  });
});

describe("regionOnScreen", () => {
  it("places a region using the view's scale and offset", () => {
    expect(
      regionOnScreen({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, { width: 1000, height: 500 }, { scale: 2, x: 10, y: 20 }),
    ).toEqual({ x: 1010, y: 520, w: 200, h: 100 });
  });
});

describe("cardSide (Rules 5.2 to 5.4)", () => {
  it("puts the card on the side nearer the image's centre", () => {
    expect(cardSide({ x: 0, y: 0.1, w: 0.1, h: 0.1 }, "portrait")).toBe("after");
    expect(cardSide({ x: 0, y: 0.8, w: 0.1, h: 0.1 }, "portrait")).toBe("before");
    expect(cardSide({ x: 0.8, y: 0, w: 0.1, h: 0.1 }, "landscape")).toBe("before");
  });

  it("gives a centred box the side with more image, or else below", () => {
    expect(cardSide({ x: 0, y: 0.46, w: 0.1, h: 0.1 }, "portrait")).toBe("before");
    expect(cardSide({ x: 0, y: 0.44, w: 0.1, h: 0.1 }, "portrait")).toBe("after");
    expect(cardSide({ x: 0, y: 0.45, w: 0.1, h: 0.1 }, "portrait")).toBe("after");
  });
});

describe("placeCard (Rules 5.7 and 8.2)", () => {
  const area = { x: 0, y: 0, w: 400, h: 800 };
  const card = { w: 200, h: 100 };

  it("puts the card beside its box, centred on it", () => {
    const box = { x: 100, y: 100, w: 100, h: 100 };
    expect(placeCard(box, card, area, "portrait", "after", false)).toEqual({
      x: 50,
      y: 200 + CARD_GAP,
      overlap: false,
    });
  });

  it("floats the card over the box when there's no room beside it, or above the keyboard", () => {
    const box = { x: 100, y: 700, w: 100, h: 90 };
    expect(placeCard(box, card, area, "portrait", "after", false)).toEqual({ x: 50, y: 678, overlap: true });
    expect(placeCard(box, card, area, "portrait", "after", true)).toEqual({ x: 50, y: 688, overlap: true });
  });
});
