// Import the Region type.
import type { Region } from "@/lib/regions";

// Overlapping boxes (ADR 0011). Where boxes overlap, a click goes to the smallest box under the
// pointer (Annotorious's hit-testing sorts by area). So a box can only be clicked on the part of
// it that no smaller box covers. A new or moved box is refused if, with it in place, any box
// would keep less than this share of its area clickable.

/** The least share of a box's area that must stay clickable. */
export const MIN_CLICKABLE = 0.25;

// A region with an id, so we can tell boxes apart.
export type PlacedRegion = Region & { id: string };

// The area of a region, as a fraction of the image's area.
const area = (r: Region) => r.w * r.h;

// The rectangle where two regions overlap, or null if they don't.
function intersection(a: Region, b: Region): Region | null {
  // The left edge of the overlap.
  const x = Math.max(a.x, b.x);

  // The top edge of the overlap.
  const y = Math.max(a.y, b.y);

  // The overlap's width: the nearer right edge minus the left edge.
  const w = Math.min(a.x + a.w, b.x + b.w) - x;

  // The overlap's height: the nearer bottom edge minus the top edge.
  const h = Math.min(a.y + a.h, b.y + b.h) - y;

  // If both are positive the boxes overlap; otherwise they don't.
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Area covered by the union of some rectangles, by splitting the plane on their edges. */
function unionArea(rects: Region[]) {
  // No rectangles cover nothing.
  if (rects.length === 0) return 0;

  // Every distinct vertical edge position, sorted.
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);

  // Every distinct horizontal edge position, sorted.
  const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);

  // The covered area so far.
  let total = 0;

  // Go through each column between neighbouring vertical edges.
  for (let i = 0; i < xs.length - 1; i++) {
    // Go through each row between neighbouring horizontal edges.
    for (let j = 0; j < ys.length - 1; j++) {
      // The horizontal centre of this cell.
      const cx = (xs[i] + xs[i + 1]) / 2;

      // The vertical centre of this cell.
      const cy = (ys[j] + ys[j + 1]) / 2;

      // If any rectangle contains the cell's centre, the whole cell is covered.
      if (rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) {
        // Add the cell's area.
        total += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
    }
  }

  // Return the covered area.
  return total;
}

/**
 * The share of `box`'s area that a click reaches: the part not covered by a smaller box.
 * Boxes of equal area count as covering each other, since either could win the click.
 */
export function clickableShare(box: Region, others: Region[]) {
  // Find the parts of `box` covered by boxes no bigger than it.
  const covering = others
    // Keep only boxes that would win a click over this one.
    .filter((o) => area(o) <= area(box))
    // Take the overlap of each with this box.
    .map((o) => intersection(box, o))
    // Drop the ones that don't overlap at all.
    .filter((r): r is Region => r !== null);

  // The clickable share is one minus the covered share.
  return 1 - unionArea(covering) / area(box);
}

/**
 * Check a new or moved box against the image's other boxes. Returns null if every box would
 * stay clickable enough, or the existing box it clashes with: the one it would hide, or else
 * the one that hides it most. `candidate.id` is the box being moved, or any new id.
 */
export function findClash(candidate: PlacedRegion, existing: PlacedRegion[]): PlacedRegion | null {
  // The existing boxes, leaving out the candidate's old position.
  const others = existing.filter((r) => r.id !== candidate.id);

  // Every box once the candidate is in place.
  const all = [...others, candidate];

  // Every box except `r`.
  const without = (r: PlacedRegion) => all.filter((o) => o !== r);

  // An existing box the candidate would make too hard to click. Only a box whose clickable share
  // the candidate actually reduces counts, so boxes that were already crowded don't block others.
  const hidden = others
    // Work out each box's share before and after the candidate arrives.
    .map((r) => ({
      // The box itself.
      r,

      // Its clickable share with the candidate in place.
      after: clickableShare(r, without(r)),

      // Its clickable share without the candidate.
      before: clickableShare(
        r,
        others.filter((o) => o !== r),
      ),
    }))
    // Keep boxes that fall below the minimum because of the candidate.
    .filter(({ after, before }) => after < MIN_CLICKABLE && after < before - 1e-9)
    // Put the most-hidden box first.
    .sort((a, b) => a.after - b.after)[0]?.r;

  // If the candidate would hide a box, report that box.
  if (hidden) return hidden;

  // Otherwise, check whether the candidate itself would be mostly hidden.
  if (clickableShare(candidate, others) < MIN_CLICKABLE) {
    // The candidate itself is hidden: offer the existing box covering most of it.
    const overlap = (r: Region) => {
      // The part of the candidate under this box.
      const i = intersection(candidate, r);

      // Its area, or zero if they don't overlap.
      return i ? area(i) : 0;
    };

    // Of the boxes that could cover it, return the one covering the most.
    return others.filter((r) => area(r) <= area(candidate)).sort((a, b) => overlap(b) - overlap(a))[0] ?? null;
  }

  // No clash.
  return null;
}
