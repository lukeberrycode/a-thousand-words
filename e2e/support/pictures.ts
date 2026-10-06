import { randomInt } from "node:crypto";
import sharp from "sharp";

// Test images: a grid of random coloured blocks. Two pictures with different seeds look nothing
// alike to the duplicate check (ADR 0010); the same seed at another size or format looks the same.
// The grid matches the check's 9×8 hash, so each of its 64 bits is random: two pictures share
// all but 12 of them less than once in a million tries.

export type Picture = { name: string; mimeType: string; buffer: Buffer };

/** A new seed for a picture no other test uses. */
export const newSeed = () => randomInt(2 ** 31);

export async function picture(
  seed: number,
  { width = 1200, height = 800, format = "png" }: { width?: number; height?: number; format?: "png" | "jpeg" | "webp" } = {},
): Promise<Picture> {
  const cols = 9;
  const rows = 8;
  const pixels = Buffer.alloc(cols * rows * 3);
  let state = seed || 1;
  for (let i = 0; i < pixels.length; i++) {
    // xorshift32: deterministic per seed.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[i] = state & 0xff;
  }
  const image = sharp(pixels, { raw: { width: cols, height: rows, channels: 3 } }).resize(width, height, {
    kernel: "nearest",
    fit: "fill",
  });
  const buffer = await image.toFormat(format).toBuffer();
  const ext = format === "jpeg" ? "jpg" : format;
  return { name: `test-${seed}.${ext}`, mimeType: `image/${format}`, buffer };
}
