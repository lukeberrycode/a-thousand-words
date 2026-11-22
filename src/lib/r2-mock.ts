// The pure parts of the local R2 mock (scripts/r2-mock.ts, ADR 0024): reading a path-style S3 URL,
// naming the file an object is stored in, and unwrapping the AWS SDK's chunked upload encoding.

/** A bucket name as S3 allows it: 3 to 63 lower-case letters, digits, dots and hyphens. */
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/** The bucket and key in a path-style URL path (`/<bucket>/<key>`), or null if it names neither. */
export function parseObjectPath(pathname: string): { bucket: string; key: string } | null {
  // Split the path into the bucket part and the key part.
  const match = /^\/([^/]+)\/(.+)$/.exec(pathname);

  // If the path doesn't have both, it isn't an object path.
  if (!match) return null;

  // Decoding can throw on bad percent-encoding, so guard it.
  try {
    // Decode the bucket name.
    const bucket = decodeURIComponent(match[1]);

    // Decode each segment of the key, keeping the slashes.
    const key = match[2].split("/").map(decodeURIComponent).join("/");

    // Accept only valid bucket names.
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
  // Percent-encode the key (which removes slashes), then encode any dots too.
  return encodeURIComponent(key).replace(/\./g, "%2E");
}

/** Whether a PUT's body uses the SDK's `aws-chunked` encoding, which wraps each chunk with its size. */
export function isAwsChunked(headers: Readonly<Record<string, string | string[] | undefined>>) {
  // The Content-Encoding header, as a string.
  const encoding = String(headers["content-encoding"] ?? "");

  // The payload hash header, as a string.
  const sha = String(headers["x-amz-content-sha256"] ?? "");

  // Chunked if the encoding lists aws-chunked, or the payload hash says it's streamed.
  return encoding.split(",").some((part) => part.trim() === "aws-chunked") || sha.startsWith("STREAMING-");
}

/**
 * The payload inside an `aws-chunked` body: chunks of `<hex size>[;extensions]\r\n<data>\r\n`, ending
 * with a zero-size chunk and optional trailing headers. Throws if the body is malformed.
 */
export function decodeAwsChunked(body: Uint8Array): Uint8Array {
  // The data pieces found so far.
  const parts: Uint8Array[] = [];

  // Our position in the body.
  let at = 0;

  // Read chunks until the zero-size one.
  for (;;) {
    // Find the end of this chunk's header line.
    const lineEnd = indexOfCrlf(body, at);

    // No line ending means the body is cut short.
    if (lineEnd < 0) throw new Error("aws-chunked body: missing chunk header");

    // Read the header line as text.
    const header = new TextDecoder().decode(body.subarray(at, lineEnd));

    // The size is the hex number before any `;extensions`.
    const size = Number.parseInt(header.split(";")[0], 16);

    // Reject sizes that aren't whole, non-negative numbers.
    if (!Number.isInteger(size) || size < 0) throw new Error(`aws-chunked body: bad chunk size "${header}"`);

    // Move past the header line and its CRLF.
    at = lineEnd + 2;

    // A zero-size chunk is the last one.
    if (size === 0) break;

    // Make sure the data and its trailing CRLF fit inside the body.
    if (at + size + 2 > body.length) throw new Error("aws-chunked body: chunk runs past the end");

    // Keep this chunk's data.
    parts.push(body.subarray(at, at + size));

    // Move past the data and its trailing CRLF.
    at += size + 2;
  }

  // Make a buffer big enough for all the pieces.
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));

  // Where the next piece goes in the buffer.
  let offset = 0;

  // Copy each piece into place, in order.
  for (const part of parts) {
    // Write the piece at the current offset.
    out.set(part, offset);

    // Advance by the piece's length.
    offset += part.length;
  }

  // Return the joined payload.
  return out;
}

// Find the position of the next CRLF (bytes 13, 10) at or after `from`, or -1 if there is none.
function indexOfCrlf(bytes: Uint8Array, from: number) {
  // Check each position that still has a following byte, and return the first match.
  for (let i = from; i < bytes.length - 1; i++) if (bytes[i] === 13 && bytes[i + 1] === 10) return i;

  // Not found.
  return -1;
}
