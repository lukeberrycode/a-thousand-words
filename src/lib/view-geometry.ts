// Import the image size and region types.
import type { ImageSize, Region } from "./regions";

/**
 * Geometry for the image page's zoomable view (docs/enrich-UI.md, ADR 0012). Pure functions.
 * Screen positions and sizes are in CSS pixels; regions are fractions of the image (ADR 0005).
 */

// A rectangle: top-left corner, width and height.
export type Rect = { x: number; y: number; w: number; h: number };

// A width and a height.
export type Size = { w: number; h: number };

/** The image's on-screen scale (screen pixels per image pixel) and its top-left corner on screen. */
export type View = { scale: number; x: number; y: number };

// Whether the screen is taller than it is wide, or not.
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

// The widest a card may be in portrait.
const CARD_WIDTH_PORTRAIT = 560;

// Portrait if the screen is taller than it is wide, otherwise landscape.
export const orientationOf = (screen: Size): Orientation => (screen.h > screen.w ? "portrait" : "landscape");

/** The scale at which the whole image fits in the area (Rule 1.1). */
export function fitScale(size: ImageSize, area: Rect) {
  // Take the smaller of the two ratios, so neither side overflows.
  return Math.min(area.w / size.width, area.h / size.height);
}

/** Rule 2.3: from the fit size up to 4× native pixels, or 4× the fit size if that's more. */
export function zoomLimits(size: ImageSize, area: Rect) {
  // The smallest zoom is the fit size.
  const min = fitScale(size, area);

  // The largest is 4× native pixels, or 4× the fit size if that's bigger.
  return { min, max: Math.max(MAX_NATIVE_ZOOM, 4 * min) };
}

// Keep a number between a low and a high value.
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * One axis of the image's position. Larger than the area: it can't pan past its edges (Rule 2.4).
 * Smaller: it sits at `align`.
 */
function placeAxis(pos: number, len: number, start: number, avail: number, align: "start" | "centre" | "end") {
  // If the image is at least as big as the area, keep it covering the area.
  if (len >= avail) return clamp(pos, start + avail - len, start);

  // A smaller image goes at the start...
  if (align === "start") return start;

  // ...or at the end...
  if (align === "end") return start + avail - len;

  // ...or in the middle.
  return start + (avail - len) / 2;
}

/**
 * Keep a view within the zoom and pan limits. Along the panel's axis, an image smaller than the
 * area sits at the edge opposite the panel (Rules 1.2 and 3.6); along the other axis, it's centred.
 */
export function clampView(view: View, size: ImageSize, area: Rect, orientation: Orientation, panel: Edge): View {
  // The zoom limits for this image and area.
  const { min, max } = zoomLimits(size, area);

  // The zoom, kept within them.
  const scale = clamp(view.scale, min, max);

  // The edge opposite the panel.
  const awayFromPanel = panel === "end" ? "start" : "end";

  // Return the corrected view.
  return {
    // The clamped zoom.
    scale,

    // Horizontal position: away from the panel in landscape, otherwise centred.
    x: placeAxis(view.x, size.width * scale, area.x, area.w, orientation === "landscape" ? awayFromPanel : "centre"),

    // Vertical position: away from the panel in portrait, otherwise centred.
    y: placeAxis(view.y, size.height * scale, area.y, area.h, orientation === "portrait" ? awayFromPanel : "centre"),
  };
}

/** The whole image, at the fit size (Rule 1). */
export function fitView(size: ImageSize, area: Rect, orientation: Orientation, panel: Edge): View {
  // Clamping a zero zoom raises it to the fit size.
  return clampView({ scale: 0, x: 0, y: 0 }, size, area, orientation, panel);
}

/** Zoom to `scale`, keeping the image point under `at` (a screen point) where it is. Not clamped. */
export function zoomAround(view: View, scale: number, at: { x: number; y: number }): View {
  // How much bigger or smaller the image becomes.
  const k = scale / view.scale;

  // Move the offset so the point under `at` stays put.
  return { scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k };
}

/**
 * After a drag, the panel moves to the short edge the image moved away from (Rule 3.4): only the
 * movement along the panel's axis counts, and small drags are ignored.
 */
export function panelEdgeAfterPan(orientation: Orientation, moved: { x: number; y: number }, current: Edge): Edge {
  // Only the movement along the panel's axis counts.
  const d = orientation === "portrait" ? moved.y : moved.x;

  // Ignore small drags.
  if (Math.abs(d) < PANEL_MOVE_THRESHOLD) return current;

  // The image moved up (or left), revealing its lower (or right) part: the panel goes to the top (or left).
  return d < 0 ? "start" : "end";
}

/**
 * After a resize or rotation: keep the same image point at the centre of the area, and the same
 * zoom relative to the fit size.
 */
export function keepView(view: View, size: ImageSize, from: Rect, to: Rect): View {
  // The zoom as a multiple of the old fit size.
  const relative = view.scale / fitScale(size, from);

  // The same multiple of the new fit size.
  const scale = relative * fitScale(size, to);

  // The image point at the old area's centre, horizontally.
  const ix = (from.x + from.w / 2 - view.x) / view.scale;

  // The image point at the old area's centre, vertically.
  const iy = (from.y + from.h / 2 - view.y) / view.scale;

  // Put that point at the new area's centre.
  return { scale, x: to.x + to.w / 2 - ix * scale, y: to.y + to.h / 2 - iy * scale };
}

/** Where a region is on screen in a view. */
export function regionOnScreen(region: Region, size: ImageSize, view: View): Rect {
  // The image's on-screen width.
  const w = size.width * view.scale;

  // The image's on-screen height.
  const h = size.height * view.scale;

  // Scale the region's fractions to the on-screen image, and add the image's offset.
  return { x: view.x + region.x * w, y: view.y + region.y * h, w: region.w * w, h: region.h * h };
}

/**
 * Which side of its box a card goes (Rules 5.2–5.4): above or below in portrait, left or right in
 * landscape, on the side nearer the image's centre. A centred box gets the side with more image
 * between it and the image's edge, or else below or right.
 */
export function cardSide(region: Region, orientation: Orientation): Side {
  // The box's start position and length along the stacking axis.
  const [start, len] = orientation === "portrait" ? [region.y, region.h] : [region.x, region.w];

  // Its centre along that axis.
  const centre = start + len / 2;

  // If the box is near the image's centre...
  if (Math.abs(centre - 0.5) <= CENTRED) {
    // The image left before the box.
    const before = start;

    // The image left after the box.
    const after = 1 - (start + len);

    // Choose the side with more image, or "after" if they're equal.
    return before - after > 1e-9 ? "before" : "after";
  }

  // Otherwise choose the side nearer the image's centre.
  return centre < 0.5 ? "after" : "before";
}

/** A card's largest on-screen size (Rule 5.5), measured against the visible area (Rule 8.3). */
export function cardMaxSize(area: Rect, orientation: Orientation): Size {
  // Return the size for this orientation.
  return orientation === "portrait"
    ? // Portrait: wide, but short.
      { w: Math.min(area.w - 2 * CARD_GAP, CARD_WIDTH_PORTRAIT), h: area.h * 0.4 }
    : // Landscape: narrow, but tall.
      { w: Math.min(CARD_WIDTH_LANDSCAPE, area.w * 0.5), h: area.h - 2 * CARD_GAP };
}

/** A region with padding round it, in image pixels, never past the image's edge (Rule 5.6). */
function paddedBox(region: Region, size: ImageSize): Rect {
  // The region's left edge in pixels.
  const x = region.x * size.width;

  // Its top edge in pixels.
  const y = region.y * size.height;

  // Its width in pixels.
  const w = region.w * size.width;

  // Its height in pixels.
  const h = region.h * size.height;

  // The padding: a share of the longer side.
  const pad = BOX_PADDING * Math.max(w, h);

  // The padded left edge, kept inside the image.
  const left = Math.max(0, x - pad);

  // The padded top edge, kept inside the image.
  const top = Math.max(0, y - pad);

  // The padded right edge, kept inside the image.
  const right = Math.min(size.width, x + w + pad);

  // The padded bottom edge, kept inside the image.
  const bottom = Math.min(size.height, y + h + pad);

  // Return the padded rectangle, at least 1 pixel in each direction.
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

/**
 * Auto-zoom (Rule 5.6): the view that shows the box, with padding, beside its card, filling the
 * area. If they can't sit side by side even at the fit size, it's the fit size (Rule 5.7).
 */
export function zoomToRegion(region: Region, size: ImageSize, area: Rect, orientation: Orientation, panel: Edge): View {
  // Which side of the box the card goes.
  const side = cardSide(region, orientation);

  // The card's largest size.
  const card = cardMaxSize(area, orientation);

  // The part of the area left for the box once the card's space is set aside.
  const room: Rect =
    // In portrait the card takes a strip at the top or bottom.
    orientation === "portrait"
      ? {
          // The full width.
          x: area.x,

          // The full width, again as a size.
          w: area.w,

          // The height minus the card and its gaps.
          h: area.h - card.h - 2 * CARD_GAP,

          // Start at the top if the card is below, otherwise after the card.
          y: side === "after" ? area.y : area.y + card.h + 2 * CARD_GAP,
        }
      : // In landscape the card takes a strip at the left or right.
        {
          // The full height.
          y: area.y,

          // The full height, again as a size.
          h: area.h,

          // The width minus the card and its gaps.
          w: area.w - card.w - 2 * CARD_GAP,

          // Start at the left if the card is to the right, otherwise after the card.
          x: side === "after" ? area.x : area.x + card.w + 2 * CARD_GAP,
        };

  // The box with padding round it.
  const box = paddedBox(region, size);

  // The zoom limits.
  const { min, max } = zoomLimits(size, area);

  // The zoom that fits the padded box into the room, or 0 if there's no room.
  const scale = room.w > 0 && room.h > 0 ? Math.min(room.w / box.w, room.h / box.h) : 0;

  // If that's below the fit size, show the whole image instead.
  if (scale < min) return fitView(size, area, orientation, panel);

  // Otherwise zoom as far as wanted, up to the maximum.
  const s = Math.min(scale, max);

  // Centre the padded box in the room.
  const view = {
    // The zoom.
    scale: s,

    // The horizontal offset.
    x: room.x + room.w / 2 - (box.x + box.w / 2) * s,

    // The vertical offset.
    y: room.y + room.h / 2 - (box.y + box.h / 2) * s,
  };

  // Keep the result within the limits.
  return clampView(view, size, area, orientation, panel);
}

/**
 * Where a card goes, given its box on screen and the card's measured size. Normally beside the
 * box, on `side`, and centred on it along the other axis. If there's no room there, it floats over
 * the part of the box nearest the image's centre (`overlap`, Rule 5.7), or with `keyboard`,
 * directly above the on-screen keyboard (Rule 8.2). It always stays inside the area.
 */
export function placeCard(
  // The box on screen.
  box: Rect,
  // The card's measured size.
  card: Size,
  // The visible area.
  area: Rect,
  // Portrait or landscape.
  orientation: Orientation,
  // Which side of the box the card goes.
  side: Side,
  // Whether an on-screen keyboard is open.
  keyboard: boolean,
): { x: number; y: number; overlap: boolean } {
  // Whether we're in portrait.
  const portrait = orientation === "portrait";

  // Work along the stacking axis (`a`, the axis the card and box share) and the cross axis (`b`).
  const [aStart, aLen, aBox, aBoxLen, aCard] = portrait
    ? // In portrait the stacking axis is vertical.
      [area.y, area.h, box.y, box.h, card.h]
    : // In landscape it's horizontal.
      [area.x, area.w, box.x, box.w, card.w];

  // The cross axis, the other way round.
  const [bStart, bLen, bBox, bBoxLen, bCard] = portrait
    ? // In portrait it's horizontal.
      [area.x, area.w, box.x, box.w, card.w]
    : // In landscape it's vertical.
      [area.y, area.h, box.y, box.h, card.h];

  // Where the area ends along the stacking axis.
  const aEnd = aStart + aLen;

  // The lowest position the card may take.
  const lo = aStart + CARD_GAP;

  // The highest position the card may take.
  const hi = Math.max(lo, aEnd - CARD_GAP - aCard);

  // The card's ideal position: just after the box, or just before it.
  let a = side === "after" ? aBox + aBoxLen + CARD_GAP : aBox - CARD_GAP - aCard;

  // It overlaps the box if the ideal position is outside the allowed range.
  const overlap = a < lo - 0.5 || a > hi + 0.5;

  // If there's no room beside the box...
  if (overlap) {
    // ...with a keyboard in portrait, sit as low as allowed, above the keyboard...
    if (keyboard && portrait) a = hi;
    // ...if the card goes after, float it over the box's far end...
    else if (side === "after") a = Math.min(aBox + aBoxLen, aEnd) - CARD_GAP - aCard;
    // ...otherwise float it over the box's near end.
    else a = Math.max(aBox, aStart) + CARD_GAP;
  }

  // Keep the position within the allowed range.
  a = clamp(a, lo, hi);

  // Centre the card on the box along the cross axis, kept inside the area.
  const b = clamp(
    // The centred position.
    bBox + bBoxLen / 2 - bCard / 2,
    // The lowest allowed.
    bStart + CARD_GAP,
    // The highest allowed.
    Math.max(bStart + CARD_GAP, bStart + bLen - CARD_GAP - bCard),
  );

  // Turn the two axes back into x and y.
  return portrait ? { x: b, y: a, overlap } : { x: a, y: b, overlap };
}
