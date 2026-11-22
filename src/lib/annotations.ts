// Import the Region type, which holds a region's fractional position and size.
import type { Region } from "@/lib/regions";

// Annotation rules shared by the browser editor and the server action.

// The longest annotation text allowed, in characters.
export const BODY_MAX = 5000;

/** Smallest region side, as a fraction of the image. Stops accidental clicks saving a dot. */
export const MIN_REGION_SIDE = 0.005;

/** Returns an error message, or null if the text is acceptable. */
export function checkBody(body: string): string | null {
  // Reject text that is empty or only whitespace.
  if (!body.trim()) return "Write something about this region.";

  // Reject text over the length limit.
  if (body.length > BODY_MAX) return `Annotations can be up to ${BODY_MAX} characters.`;

  // The text is fine.
  return null;
}

/** Returns an error message, or null if the region lies within the image and isn't too small. */
export function checkRegion(r: Region): string | null {
  // Gather the four numbers that describe the region.
  const values = [r.x, r.y, r.w, r.h];

  // Reject NaN and infinite values.
  if (!values.every(Number.isFinite)) return "Invalid region.";

  // Allow for floating-point rounding at the image edges.
  const inside = (n: number) => n >= 0 && n <= 1 + 1e-9;

  // Reject a region whose corner, or far edges, fall outside the image.
  if (!values.every(inside) || !inside(r.x + r.w) || !inside(r.y + r.h)) return "Invalid region.";

  // Reject a region too thin or too short to be deliberate.
  if (r.w < MIN_REGION_SIDE || r.h < MIN_REGION_SIDE) return "That region is too small. Drag out a larger box.";

  // The region is fine.
  return null;
}
