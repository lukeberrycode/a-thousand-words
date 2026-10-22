// The pure parts of the local R2 mock (scripts/r2-mock.ts, ADR 0024): reading a path-style S3 URL,
// naming the file an object is stored in, and unwrapping the AWS SDK's chunked upload encoding.

/** A bucket name as S3 allows it: 3 to 63 lower-case letters, digits, dots and hyphens. */
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/** The bucket and key in a path-style URL path (`/<bucket>/<key>`), or null if it names neither. */
export function parseObjectPath(pathname: string): { bucket: string; key: string } | null {
  const match = /^\/([^/]+)\/(.+)$/.exec(pathname);
  if (!match) return null;
  try {
    const bucket = decodeURIComponent(match[1]);
    const key = match[2].split("/").map(decodeURIComponent).join("/");
    return BUCKET.test(bucket) ? { bucket, key } : null;
  } catch {
    // Malformed percent-encoding.
    return null;
  }
}

/**
 * A safe file name for a key: one flat name with no slashes or dots, so no key can reach outside
 * its bucket's folder (`../x`) or clash with the `.meta` file stored beside it.
 */
export function fileNameFor(key: string) {
  return encodeURIComponent(key).replace(/\./g, "%2E");
}

/** Whether a PUT's body uses the SDK's `aws-chunked` encoding, which wraps each chunk with its size. */
export function isAwsChunked(headers: Readonly<Record<string, string | string[] | undefined>>) {
  const encoding = String(headers["content-encoding"] ?? "");
  const sha = String(headers["x-amz-content-sha256"] ?? "");
  return encoding.split(",").some((part) => part.trim() === "aws-chunked") || sha.startsWith("STREAMING-");
}

/**
 * The payload inside an `aws-chunked` body: chunks of `<hex size>[;extensions]\r\n<data>\r\n`, ending
 * with a zero-size chunk and optional trailing headers. Throws if the body is malformed.
 */
export function decodeAwsChunked(body: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let at = 0;
  for (;;) {
    const lineEnd = indexOfCrlf(body, at);
    if (lineEnd < 0) throw new Error("aws-chunked body: missing chunk header");
    const header = new TextDecoder().decode(body.subarray(at, lineEnd));
    const size = Number.parseInt(header.split(";")[0], 16);
    if (!Number.isInteger(size) || size < 0) throw new Error(`aws-chunked body: bad chunk size "${header}"`);
    at = lineEnd + 2;
    if (size === 0) break;
    if (at + size + 2 > body.length) throw new Error("aws-chunked body: chunk runs past the end");
    parts.push(body.subarray(at, at + size));
    at += size + 2;
  }
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function indexOfCrlf(bytes: Uint8Array, from: number) {
  for (let i = from; i < bytes.length - 1; i++) if (bytes[i] === 13 && bytes[i + 1] === 10) return i;
  return -1;
}
