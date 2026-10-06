import type { Region } from "@/lib/regions";

// Overlapping boxes (ADR 0011). Where boxes overlap, a click goes to the smallest box under the
// pointer (Annotorious's hit-testing sorts by area). So a box can only be clicked on the part of
// it that no smaller box covers. A new or moved box is refused if, with it in place, any box
// would keep less than this share of its area clickable.

/** The least share of a box's area that must stay clickable. */
export const MIN_CLICKABLE = 0.25;

export type PlacedRegion = Region & { id: string };

const area = (r: Region) => r.w * r.h;

function intersection(a: Region, b: Region): Region | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Area covered by the union of some rectangles, by splitting the plane on their edges. */
function unionArea(rects: Region[]) {
  if (rects.length === 0) return 0;
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) {
        total += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
    }
  }
  return total;
}

/**
 * The share of `box`'s area that a click reaches: the part not covered by a smaller box.
 * Boxes of equal area count as covering each other, since either could win the click.
 */
export function clickableShare(box: Region, others: Region[]) {
  const covering = others
    .filter((o) => area(o) <= area(box))
    .map((o) => intersection(box, o))
    .filter((r): r is Region => r !== null);
  return 1 - unionArea(covering) / area(box);
}

/**
 * Check a new or moved box against the image's other boxes. Returns null if every box would
 * stay clickable enough, or the existing box it clashes with: the one it would hide, or else
 * the one that hides it most. `candidate.id` is the box being moved, or any new id.
 */
export function findClash(candidate: PlacedRegion, existing: PlacedRegion[]): PlacedRegion | null {
  const others = existing.filter((r) => r.id !== candidate.id);
  const all = [...others, candidate];
  const without = (r: PlacedRegion) => all.filter((o) => o !== r);

  // An existing box the candidate would make too hard to click. Only a box whose clickable share
  // the candidate actually reduces counts, so boxes that were already crowded don't block others.
  const hidden = others
    .map((r) => ({
      r,
      after: clickableShare(r, without(r)),
      before: clickableShare(
        r,
        others.filter((o) => o !== r),
      ),
    }))
    .filter(({ after, before }) => after < MIN_CLICKABLE && after < before - 1e-9)
    .sort((a, b) => a.after - b.after)[0]?.r;
  if (hidden) return hidden;

  if (clickableShare(candidate, others) < MIN_CLICKABLE) {
    // The candidate itself is hidden: offer the existing box covering most of it.
    const overlap = (r: Region) => {
      const i = intersection(candidate, r);
      return i ? area(i) : 0;
    };
    return others.filter((r) => area(r) <= area(candidate)).sort((a, b) => overlap(b) - overlap(a))[0] ?? null;
  }
  return null;
}
