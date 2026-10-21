import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SIMILAR_MAX_DISTANCE, fingerprint, hashDistance } from "./image-hash";

/** A picture of random coloured blocks, like the system tests' (e2e/support/pictures.ts). */
async function blocks(seed: number, width: number, height: number, format: "png" | "jpeg") {
  const pixels = Buffer.alloc(9 * 8 * 3);
  let state = seed;
  for (let i = 0; i < pixels.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[i] = state & 0xff;
  }
  return sharp(pixels, { raw: { width: 9, height: 8, channels: 3 } })
    .resize(width, height, { kernel: "nearest", fit: "fill" })
    .toFormat(format)
    .toBuffer();
}

describe("hashDistance", () => {
  it("counts the bits that differ", () => {
    expect(hashDistance(BigInt(0), BigInt(0))).toBe(0);
    expect(hashDistance(BigInt(1), BigInt(3))).toBe(1);
    expect(hashDistance(BigInt(-1), BigInt(0))).toBe(64);
  });
});

describe("fingerprint", () => {
  it("records the size, and tells identical files from look-alikes", async () => {
    const original = await fingerprint(await blocks(1, 900, 800, "png"));
    const smaller = await fingerprint(await blocks(1, 450, 400, "jpeg"));
    const other = await fingerprint(await blocks(2, 900, 800, "png"));

    expect(original).toMatchObject({ width: 900, height: 800 });
    expect(smaller.sha256).not.toBe(original.sha256);
    expect(hashDistance(original.phash, smaller.phash)).toBeLessThanOrEqual(SIMILAR_MAX_DISTANCE);
    expect(hashDistance(original.phash, other.phash)).toBeGreaterThan(SIMILAR_MAX_DISTANCE);
  });
});
