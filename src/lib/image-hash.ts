import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

// Fingerprints for spotting duplicate uploads (ADR 0010). Used by createImage and the seed
// script, so this module avoids "server-only".

/**
 * Two images whose perceptual hashes differ in at most this many of 64 bits count as the same.
 * Calibrated on the seed paintings (ADR 0010): edits of one image differed by 0–10 bits, different
 * paintings by 20–43.
 */
export const SIMILAR_MAX_DISTANCE = 12;

export type ImageFingerprint = {
  /** Pixel size as displayed, after EXIF rotation. */
  width: number;
  height: number;
  /** Hex SHA-256 of the file's bytes: identical files only. */
  sha256: string;
  /**
   * 64-bit difference hash (dHash) of what the image looks like, stored as a signed bigint to
   * fit Postgres's bigint. Survives resizing, recompression and small colour changes.
   */
  phash: bigint;
};

// BigInt(…) rather than 0n literals: the project's TypeScript target is ES2017.
const ZERO = BigInt(0);
const ONE = BigInt(1);

export async function fingerprint(bytes: Uint8Array): Promise<ImageFingerprint> {
  // rotate() with no arguments applies the EXIF orientation, so a sideways phone photo and its
  // upright copy hash alike, and width/height match what browsers display.
  const image = sharp(bytes, { failOn: "error" }).rotate();
  const { width, height } = await image.clone().metadata().then((m) => orientedSize(m));

  // dHash: shrink to 9×8 greyscale and record, for each row, whether each pixel is brighter
  // than its right-hand neighbour. 8 rows × 8 comparisons = 64 bits.
  const pixels = await image.greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hash = ZERO;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = pixels[row * 9 + col];
      const right = pixels[row * 9 + col + 1];
      hash = (hash << ONE) | (left > right ? ONE : ZERO);
    }
  }

  return {
    width,
    height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    phash: BigInt.asIntN(64, hash),
  };
}

/** Number of differing bits between two perceptual hashes. */
export function hashDistance(a: bigint, b: bigint) {
  let x = BigInt.asUintN(64, a ^ b);
  let count = 0;
  while (x) {
    count += Number(x & ONE);
    x >>= ONE;
  }
  return count;
}

function orientedSize(m: Metadata) {
  if (!m.width || !m.height) throw new Error("Couldn't read the image's size.");
  // EXIF orientations 5–8 are rotated 90°: browsers display them with width and height swapped.
  return m.orientation && m.orientation >= 5 ? { width: m.height, height: m.width } : { width: m.width, height: m.height };
}
