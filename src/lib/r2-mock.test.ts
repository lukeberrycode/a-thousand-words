// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the functions under test.
import { decodeAwsChunked, fileNameFor, isAwsChunked, parseObjectPath } from "./r2-mock";

// Turn a string into bytes.
const bytes = (text: string) => new TextEncoder().encode(text);

// Turn bytes into a string.
const text = (data: Uint8Array) => new TextDecoder().decode(data);

// Group the tests for path parsing.
describe("parseObjectPath", () => {
  // Check a normal path.
  it("reads the bucket and a key with slashes", () => {
    // The bucket is the first segment and the key is the rest.
    expect(parseObjectPath("/dev-bucket/images/seed/mona-lisa.jpg")).toEqual({
      // The bucket name.
      bucket: "dev-bucket",

      // The key, slashes intact.
      key: "images/seed/mona-lisa.jpg",
    });
  });

  // Check percent-decoding.
  it("decodes each part of the key", () => {
    // An encoded space and an encoded slash are decoded.
    expect(parseObjectPath("/bucket/images/a%20b%2Fc.png")).toEqual({ bucket: "bucket", key: "images/a b/c.png" });
  });

  // Check invalid input.
  it("refuses paths without a key, bad bucket names and bad encoding", () => {
    // Try each bad path in turn.
    for (const path of ["/", "/bucket", "/bucket/", "/Bucket/key", "/b/key", "/bucket/%E0%A4%A"]) {
      // Each one is refused.
      expect(parseObjectPath(path)).toBeNull();
    }
  });
});

// Group the tests for file naming.
describe("fileNameFor", () => {
  // Check that names are safe.
  it("gives a flat name that can't leave the bucket's folder", () => {
    // Try some awkward keys, including path-traversal ones.
    for (const key of ["../../etc/passwd", "..", ".", "images/a.png", "a/../../b"]) {
      // Work out the file name.
      const name = fileNameFor(key);

      // It has no slashes or dots.
      expect(name).not.toMatch(/[/.]/);

      // It still decodes back to the original key.
      expect(decodeURIComponent(name)).toBe(key);
    }
  });

  // Check names don't collide.
  it("gives different keys different names", () => {
    // A real slash and a literal "%2F" must map to different names.
    expect(fileNameFor("a/b")).not.toBe(fileNameFor("a%2Fb"));
  });
});

// Group the tests for chunk detection.
describe("isAwsChunked", () => {
  // Check each way a body can be marked chunked.
  it("spots the content encoding or a streaming payload hash", () => {
    // The encoding alone.
    expect(isAwsChunked({ "content-encoding": "aws-chunked" })).toBe(true);

    // The encoding in a list.
    expect(isAwsChunked({ "content-encoding": "gzip, aws-chunked" })).toBe(true);

    // A streaming payload hash.
    expect(isAwsChunked({ "x-amz-content-sha256": "STREAMING-UNSIGNED-PAYLOAD-TRAILER" })).toBe(true);

    // An ordinary upload is not chunked.
    expect(isAwsChunked({ "content-type": "image/png", "x-amz-content-sha256": "UNSIGNED-PAYLOAD" })).toBe(false);
  });
});

// Group the tests for decoding.
describe("decodeAwsChunked", () => {
  // Check a normal body.
  it("joins the chunks and drops sizes, signatures and trailers", () => {
    // Two chunks, a final empty chunk and a trailer.
    const body = bytes("5;chunk-signature=abc\r\nhello\r\n6\r\n world\r\n0\r\nx-amz-checksum-crc32:AAAAAA==\r\n\r\n");

    // Only the data is left.
    expect(text(decodeAwsChunked(body))).toBe("hello world");
  });

  // Check binary safety.
  it("keeps binary data exactly, including CR and LF bytes", () => {
    // Data that contains CR and LF bytes.
    const data = new Uint8Array([0, 13, 10, 255, 13, 10]);

    // Wrap it in one chunk.
    const body = new Uint8Array([...bytes("6\r\n"), ...data, ...bytes("\r\n0\r\n\r\n")]);

    // It comes out unchanged.
    expect(decodeAwsChunked(body)).toEqual(data);
  });

  // Check the empty case.
  it("gives an empty payload for a lone zero-size chunk", () => {
    // Nothing but the end marker means no data.
    expect(decodeAwsChunked(bytes("0\r\n\r\n")).length).toBe(0);
  });

  // Check the error cases.
  it("throws on a malformed body", () => {
    // A size that isn't hex.
    expect(() => decodeAwsChunked(bytes("zz\r\nhello\r\n"))).toThrow(/chunk size/);

    // A chunk longer than the data left.
    expect(() => decodeAwsChunked(bytes("a\r\nshort\r\n"))).toThrow(/past the end/);

    // A header with no line ending.
    expect(() => decodeAwsChunked(bytes("5"))).toThrow(/chunk header/);
  });
});
