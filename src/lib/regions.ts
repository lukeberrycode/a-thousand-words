// Import Annotorious's shape type and its annotation type.
import { ShapeType, type ImageAnnotation } from "@annotorious/react";

/** A rectangle stored as fractions (0–1) of the image's intrinsic size. See ADR 0005. */
export type Region = { x: number; y: number; w: number; h: number };

/** Intrinsic pixel size of an image, as recorded at upload. */
export type ImageSize = { width: number; height: number };

/** Convert a stored fractional region to Annotorious's natural-image pixel coordinates. */
export function toPixels(r: Region, size: ImageSize) {
  // Scale the left edge to pixels.
  const x = r.x * size.width;

  // Scale the top edge to pixels.
  const y = r.y * size.height;

  // Scale the width to pixels.
  const w = r.w * size.width;

  // Scale the height to pixels.
  const h = r.h * size.height;

  // Return the pixel box, plus the bounding box Annotorious expects.
  return { x, y, w, h, bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h } };
}

/** Convert natural-image pixel coordinates back to a fractional region, clamped to the image. */
export function toFraction(px: { x: number; y: number; w: number; h: number }, size: ImageSize): Region {
  // Keep a number between 0 and 1.
  const clamp = (n: number) => Math.min(1, Math.max(0, n));

  // The left edge as a clamped fraction.
  const x = clamp(px.x / size.width);

  // The top edge as a clamped fraction.
  const y = clamp(px.y / size.height);

  // Return the region.
  return {
    // The left edge.
    x,

    // The top edge.
    y,

    // The width: clamped right edge minus the clamped left edge.
    w: clamp((px.x + px.w) / size.width) - x,

    // The height: clamped bottom edge minus the clamped top edge.
    h: clamp((px.y + px.h) / size.height) - y,
  };
}

/** Build an Annotorious rectangle annotation for a stored region. */
export function toImageAnnotation(id: string, region: Region, size: ImageSize): ImageAnnotation {
  // Return the annotation object.
  return {
    // Its id.
    id,

    // No bodies: the text lives in our own database.
    bodies: [],

    // What the annotation points at.
    target: {
      // Link the target back to the annotation.
      annotation: id,

      // A rectangle in image pixels.
      selector: { type: ShapeType.RECTANGLE, geometry: toPixels(region, size) },
    },
  };
}
