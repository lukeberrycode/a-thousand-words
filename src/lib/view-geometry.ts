import type { ImageSize, Region } from "./regions";

/**
 * Geometry for the image page's zoomable view (docs/enrich-UI.md, ADR 0012). Pure functions.
 * Screen positions and sizes are in CSS pixels; regions are fractions of the image (ADR 0005).
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

/** The image's on-screen scale (screen pixels per image pixel) and its top-left corner on screen. */
export type View = { scale: number; x: number; y: number };

export type Orientation = "portrait" | "landscape";

/**
 * Which short edge the UI panel is on. `start` is the top in portrait and the left in landscape;
 * `end` is the bottom or the right. Keeping it relative maps bottom ↔ right and top ↔ left when
 * the device rotates.
 */
export type Edge = "start" | "end";

/** Which side of its box a card goes: `before` is above (portrait) or left (landscape), `after` below or right. */
export type Side = "before" | "after";

/** Maximum zoom in screen pixels per image pixel, unless 4× the fit size is more (Rule 2.3). */
export const MAX_NATIVE_ZOOM = 4;
/** Drags shorter than this, along the panel's axis, don't move the UI panel. */
export const PANEL_MOVE_THRESHOLD = 24;
/** Space between a box and its card, and between a card and the edge of the visible area. */
export const CARD_GAP = 12;
/** A box within this fraction of the image's centre counts as centred, for choosing its card's side (Rule 5.4). */
const CENTRED = 0.03;
/** Padding around a box when zooming to it, as a fraction of its longer side (Rule 5.6). */
const BOX_PADDING = 0.15;
/** Largest card width: in landscape (Rule 5.5), and in portrait on wide screens such as tablets. */
const CARD_WIDTH_LANDSCAPE = 360;
const CARD_WIDTH_PORTRAIT = 560;

export const orientationOf = (screen: Size): Orientation => (screen.h > screen.w ? "portrait" : "landscape");

/** The scale at which the whole image fits in the area (Rule 1.1). */
export function fitScale(size: ImageSize, area: Rect) {
  return Math.min(area.w / size.width, area.h / size.height);
}

/** Rule 2.3: from the fit size up to 4× native pixels, or 4× the fit size if that's more. */
export function zoomLimits(size: ImageSize, area: Rect) {
  const min = fitScale(size, area);
  return { min, max: Math.max(MAX_NATIVE_ZOOM, 4 * min) };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * One axis of the image's position. Larger than the area: it can't pan past its edges (Rule 2.4).
 * Smaller: it sits at `align`.
 */
function placeAxis(pos: number, len: number, start: number, avail: number, align: "start" | "centre" | "end") {
  if (len >= avail) return clamp(pos, start + avail - len, start);
  if (align === "start") return start;
  if (align === "end") return start + avail - len;
  return start + (avail - len) / 2;
}

/**
 * Keep a view within the zoom and pan limits. Along the panel's axis, an image smaller than the
 * area sits at the edge opposite the panel (Rules 1.2 and 3.6); along the other axis, it's centred.
 */
export function clampView(view: View, size: ImageSize, area: Rect, orientation: Orientation, panel: Edge): View {
  const { min, max } = zoomLimits(size, area);
  const scale = clamp(view.scale, min, max);
  const awayFromPanel = panel === "end" ? "start" : "end";
  return {
    scale,
    x: placeAxis(view.x, size.width * scale, area.x, area.w, orientation === "landscape" ? awayFromPanel : "centre"),
    y: placeAxis(view.y, size.height * scale, area.y, area.h, orientation === "portrait" ? awayFromPanel : "centre"),
  };
}

/** The whole image, at the fit size (Rule 1). */
export function fitView(size: ImageSize, area: Rect, orientation: Orientation, panel: Edge): View {
  return clampView({ scale: 0, x: 0, y: 0 }, size, area, orientation, panel);
}

/** Zoom to `scale`, keeping the image point under `at` (a screen point) where it is. Not clamped. */
export function zoomAround(view: View, scale: number, at: { x: number; y: number }): View {
  const k = scale / view.scale;
  return { scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k };
}

/**
 * After a drag, the panel moves to the short edge the image moved away from (Rule 3.4): only the
 * movement along the panel's axis counts, and small drags are ignored.
 */
export function panelEdgeAfterPan(orientation: Orientation, moved: { x: number; y: number }, current: Edge): Edge {
  const d = orientation === "portrait" ? moved.y : moved.x;
  if (Math.abs(d) < PANEL_MOVE_THRESHOLD) return current;
  // The image moved up (or left), revealing its lower (or right) part: the panel goes to the top (or left).
  return d < 0 ? "start" : "end";
}

/**
 * After a resize or rotation: keep the same image point at the centre of the area, and the same
 * zoom relative to the fit size.
 */
export function keepView(view: View, size: ImageSize, from: Rect, to: Rect): View {
  const relative = view.scale / fitScale(size, from);
  const scale = relative * fitScale(size, to);
  const ix = (from.x + from.w / 2 - view.x) / view.scale;
  const iy = (from.y + from.h / 2 - view.y) / view.scale;
  return { scale, x: to.x + to.w / 2 - ix * scale, y: to.y + to.h / 2 - iy * scale };
}

/** Where a region is on screen in a view. */
export function regionOnScreen(region: Region, size: ImageSize, view: View): Rect {
  const w = size.width * view.scale;
  const h = size.height * view.scale;
  return { x: view.x + region.x * w, y: view.y + region.y * h, w: region.w * w, h: region.h * h };
}

/**
 * Which side of its box a card goes (Rules 5.2–5.4): above or below in portrait, left or right in
 * landscape, on the side nearer the image's centre. A centred box gets the side with more image
 * between it and the image's edge, or else below or right.
 */
export function cardSide(region: Region, orientation: Orientation): Side {
  const [start, len] = orientation === "portrait" ? [region.y, region.h] : [region.x, region.w];
  const centre = start + len / 2;
  if (Math.abs(centre - 0.5) <= CENTRED) {
    const before = start;
    const after = 1 - (start + len);
    return before - after > 1e-9 ? "before" : "after";
  }
  return centre < 0.5 ? "after" : "before";
}

/** A card's largest on-screen size (Rule 5.5), measured against the visible area (Rule 8.3). */
export function cardMaxSize(area: Rect, orientation: Orientation): Size {
  return orientation === "portrait"
    ? { w: Math.min(area.w - 2 * CARD_GAP, CARD_WIDTH_PORTRAIT), h: area.h * 0.4 }
    : { w: Math.min(CARD_WIDTH_LANDSCAPE, area.w * 0.5), h: area.h - 2 * CARD_GAP };
}

/** A region with padding round it, in image pixels, never past the image's edge (Rule 5.6). */
function paddedBox(region: Region, size: ImageSize): Rect {
  const x = region.x * size.width;
  const y = region.y * size.height;
  const w = region.w * size.width;
  const h = region.h * size.height;
  const pad = BOX_PADDING * Math.max(w, h);
  const left = Math.max(0, x - pad);
  const top = Math.max(0, y - pad);
  const right = Math.min(size.width, x + w + pad);
  const bottom = Math.min(size.height, y + h + pad);
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

/**
 * Auto-zoom (Rule 5.6): the view that shows the box, with padding, beside its card, filling the
 * area. If they can't sit side by side even at the fit size, it's the fit size (Rule 5.7).
 */
export function zoomToRegion(
  region: Region,
  size: ImageSize,
  area: Rect,
  orientation: Orientation,
  panel: Edge,
): View {
  const side = cardSide(region, orientation);
  const card = cardMaxSize(area, orientation);
  // The part of the area left for the box once the card's space is set aside.
  const room: Rect =
    orientation === "portrait"
      ? {
          x: area.x,
          w: area.w,
          h: area.h - card.h - 2 * CARD_GAP,
          y: side === "after" ? area.y : area.y + card.h + 2 * CARD_GAP,
        }
      : {
          y: area.y,
          h: area.h,
          w: area.w - card.w - 2 * CARD_GAP,
          x: side === "after" ? area.x : area.x + card.w + 2 * CARD_GAP,
        };
  const box = paddedBox(region, size);
  const { min, max } = zoomLimits(size, area);
  const scale = room.w > 0 && room.h > 0 ? Math.min(room.w / box.w, room.h / box.h) : 0;
  if (scale < min) return fitView(size, area, orientation, panel);
  const s = Math.min(scale, max);
  const view = { scale: s, x: room.x + room.w / 2 - (box.x + box.w / 2) * s, y: room.y + room.h / 2 - (box.y + box.h / 2) * s };
  return clampView(view, size, area, orientation, panel);
}

/**
 * Where a card goes, given its box on screen and the card's measured size. Normally beside the
 * box, on `side`, and centred on it along the other axis. If there's no room there, it floats over
 * the part of the box nearest the image's centre (`overlap`, Rule 5.7), or with `keyboard`,
 * directly above the on-screen keyboard (Rule 8.2). It always stays inside the area.
 */
export function placeCard(
  box: Rect,
  card: Size,
  area: Rect,
  orientation: Orientation,
  side: Side,
  keyboard: boolean,
): { x: number; y: number; overlap: boolean } {
  const portrait = orientation === "portrait";
  // Work along the stacking axis (`a`, the axis the card and box share) and the cross axis (`b`).
  const [aStart, aLen, aBox, aBoxLen, aCard] = portrait
    ? [area.y, area.h, box.y, box.h, card.h]
    : [area.x, area.w, box.x, box.w, card.w];
  const [bStart, bLen, bBox, bBoxLen, bCard] = portrait
    ? [area.x, area.w, box.x, box.w, card.w]
    : [area.y, area.h, box.y, box.h, card.h];
  const aEnd = aStart + aLen;
  const lo = aStart + CARD_GAP;
  const hi = Math.max(lo, aEnd - CARD_GAP - aCard);

  let a = side === "after" ? aBox + aBoxLen + CARD_GAP : aBox - CARD_GAP - aCard;
  const overlap = a < lo - 0.5 || a > hi + 0.5;
  if (overlap) {
    if (keyboard && portrait) a = hi;
    else if (side === "after") a = Math.min(aBox + aBoxLen, aEnd) - CARD_GAP - aCard;
    else a = Math.max(aBox, aStart) + CARD_GAP;
  }
  a = clamp(a, lo, hi);
  const b = clamp(bBox + bBoxLen / 2 - bCard / 2, bStart + CARD_GAP, Math.max(bStart + CARD_GAP, bStart + bLen - CARD_GAP - bCard));
  return portrait ? { x: b, y: a, overlap } : { x: a, y: b, overlap };
}
