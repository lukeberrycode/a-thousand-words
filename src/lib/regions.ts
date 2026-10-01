import { ShapeType, type ImageAnnotation } from "@annotorious/react";

/** A rectangle stored as fractions (0–1) of the image's intrinsic size. See ADR 0005. */
export type Region = { x: number; y: number; w: number; h: number };

/** Intrinsic pixel size of an image, as recorded at upload. */
export type ImageSize = { width: number; height: number };

/** Convert a stored fractional region to Annotorious's natural-image pixel coordinates. */
export function toPixels(r: Region, size: ImageSize) {
  const x = r.x * size.width;
  const y = r.y * size.height;
  const w = r.w * size.width;
  const h = r.h * size.height;
  return { x, y, w, h, bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h } };
}

/** Convert natural-image pixel coordinates back to a fractional region, clamped to the image. */
export function toFraction(px: { x: number; y: number; w: number; h: number }, size: ImageSize): Region {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const x = clamp(px.x / size.width);
  const y = clamp(px.y / size.height);
  return {
    x,
    y,
    w: clamp((px.x + px.w) / size.width) - x,
    h: clamp((px.y + px.h) / size.height) - y,
  };
}

/** Build an Annotorious rectangle annotation for a stored region. */
export function toImageAnnotation(id: string, region: Region, size: ImageSize): ImageAnnotation {
  return {
    id,
    bodies: [],
    target: {
      annotation: id,
      selector: { type: ShapeType.RECTANGLE, geometry: toPixels(region, size) },
    },
  };
}
