import { describe, expect, it } from "vitest";
import { decodeAwsChunked, fileNameFor, isAwsChunked, parseObjectPath } from "./r2-mock";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe("parseObjectPath", () => {
  it("reads the bucket and a key with slashes", () => {
    expect(parseObjectPath("/dev-bucket/images/seed/mona-lisa.jpg")).toEqual({
      bucket: "dev-bucket",
      key: "images/seed/mona-lisa.jpg",
    });
  });

  it("decodes each part of the key", () => {
    expect(parseObjectPath("/bucket/images/a%20b%2Fc.png")).toEqual({ bucket: "bucket", key: "images/a b/c.png" });
  });

  it("refuses paths without a key, bad bucket names and bad encoding", () => {
    for (const path of ["/", "/bucket", "/bucket/", "/Bucket/key", "/b/key", "/bucket/%E0%A4%A"]) {
      expect(parseObjectPath(path)).toBeNull();
    }
  });
});

describe("fileNameFor", () => {
  it("gives a flat name that can't leave the bucket's folder", () => {
    for (const key of ["../../etc/passwd", "..", ".", "images/a.png", "a/../../b"]) {
      const name = fileNameFor(key);
      expect(name).not.toMatch(/[/.]/);
      expect(decodeURIComponent(name)).toBe(key);
    }
  });

  it("gives different keys different names", () => {
    expect(fileNameFor("a/b")).not.toBe(fileNameFor("a%2Fb"));
  });
});

describe("isAwsChunked", () => {
  it("spots the content encoding or a streaming payload hash", () => {
    expect(isAwsChunked({ "content-encoding": "aws-chunked" })).toBe(true);
    expect(isAwsChunked({ "content-encoding": "gzip, aws-chunked" })).toBe(true);
    expect(isAwsChunked({ "x-amz-content-sha256": "STREAMING-UNSIGNED-PAYLOAD-TRAILER" })).toBe(true);
    expect(isAwsChunked({ "content-type": "image/png", "x-amz-content-sha256": "UNSIGNED-PAYLOAD" })).toBe(false);
  });
});

describe("decodeAwsChunked", () => {
  it("joins the chunks and drops sizes, signatures and trailers", () => {
    const body = bytes("5;chunk-signature=abc\r\nhello\r\n6\r\n world\r\n0\r\nx-amz-checksum-crc32:AAAAAA==\r\n\r\n");
    expect(text(decodeAwsChunked(body))).toBe("hello world");
  });

  it("keeps binary data exactly, including CR and LF bytes", () => {
    const data = new Uint8Array([0, 13, 10, 255, 13, 10]);
    const body = new Uint8Array([...bytes("6\r\n"), ...data, ...bytes("\r\n0\r\n\r\n")]);
    expect(decodeAwsChunked(body)).toEqual(data);
  });

  it("gives an empty payload for a lone zero-size chunk", () => {
    expect(decodeAwsChunked(bytes("0\r\n\r\n")).length).toBe(0);
  });

  it("throws on a malformed body", () => {
    expect(() => decodeAwsChunked(bytes("zz\r\nhello\r\n"))).toThrow(/chunk size/);
    expect(() => decodeAwsChunked(bytes("a\r\nshort\r\n"))).toThrow(/past the end/);
    expect(() => decodeAwsChunked(bytes("5"))).toThrow(/chunk header/);
  });
});
