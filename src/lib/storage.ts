import "server-only";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 via its S3-compatible API. See docs/adr/0002.

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

let client: S3Client | undefined;

function r2() {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

/** Public URL for a stored object. */
export function publicUrl(key: string) {
  return `${env("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

/**
 * A short-lived URL the browser can PUT one file to. Content type and length are signed,
 * so the upload must match what the server validated.
 */
export function signedUploadUrl(key: string, contentType: string, contentLength: number) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: env("R2_BUCKET"),
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: 300 },
  );
}

/** Size and type of a stored object, or null if it doesn't exist. */
export async function headObject(key: string) {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
    return { contentLength: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
  } catch (err) {
    if ((err as { name?: string }).name === "NotFound") return null;
    throw err;
  }
}

/** The first `bytes` bytes of a stored object (or all of it, if smaller). */
export async function readObjectStart(key: string, bytes: number) {
  const res = await r2().send(
    new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: key, Range: `bytes=0-${bytes - 1}` }),
  );
  return res.Body!.transformToByteArray();
}
