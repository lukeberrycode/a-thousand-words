// Import sharp, used to build test pictures.
import sharp from "sharp";

// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the threshold and functions under test.
import { SIMILAR_MAX_DISTANCE, fingerprint, hashDistance } from "./image-hash";

/** A picture of random coloured blocks, like the system tests' (e2e/support/pictures.ts). */
async function blocks(seed: number, width: number, height: number, format: "png" | "jpeg") {
  // Make a buffer for a 9 by 8 grid of RGB pixels.
  const pixels = Buffer.alloc(9 * 8 * 3);

  // Start the random sequence from the seed.
  let state = seed;

  // Fill every byte with a pseudo-random value.
  for (let i = 0; i < pixels.length; i++) {
    // Mix the state (xorshift step one).
    state ^= state << 13;

    // Mix the state (xorshift step two).
    state ^= state >>> 17;

    // Mix the state (xorshift step three).
    state ^= state << 5;

    // Store the lowest byte as the colour value.
    pixels[i] = state & 0xff;
  }

  // Build an image from the raw pixels...
  return (
    sharp(pixels, { raw: { width: 9, height: 8, channels: 3 } })
      // ...scale it up to the wanted size with hard-edged blocks...
      .resize(width, height, { kernel: "nearest", fit: "fill" })
      // ...encode it in the wanted format...
      .toFormat(format)
      // ...and return the file bytes.
      .toBuffer()
  );
}

// Group the tests for the bit-difference count.
describe("hashDistance", () => {
  // Check some simple cases.
  it("counts the bits that differ", () => {
    // Identical values differ by nothing.
    expect(hashDistance(BigInt(0), BigInt(0))).toBe(0);

    // 1 and 3 differ in one bit.
    expect(hashDistance(BigInt(1), BigInt(3))).toBe(1);

    // All ones against all zeros differ in all 64 bits.
    expect(hashDistance(BigInt(-1), BigInt(0))).toBe(64);
  });
});

// Group the tests for fingerprinting.
describe("fingerprint", () => {
  // Check sizes, exact matches and look-alikes together.
  it("records the size, and tells identical files from look-alikes", async () => {
    // A large PNG.
    const original = await fingerprint(await blocks(1, 900, 800, "png"));

    // The same picture, smaller and as a JPEG.
    const smaller = await fingerprint(await blocks(1, 450, 400, "jpeg"));

    // A different picture.
    const other = await fingerprint(await blocks(2, 900, 800, "png"));

    // The original's size is recorded.
    expect(original).toMatchObject({ width: 900, height: 800 });

    // The resized JPEG isn't the same file.
    expect(smaller.sha256).not.toBe(original.sha256);

    // But it looks the same, so its hash is close.
    expect(hashDistance(original.phash, smaller.phash)).toBeLessThanOrEqual(SIMILAR_MAX_DISTANCE);

    // A different picture's hash is far away.
    expect(hashDistance(original.phash, other.phash)).toBeGreaterThan(SIMILAR_MAX_DISTANCE);
  });
});
