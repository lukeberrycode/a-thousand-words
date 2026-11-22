// Make the build fail if this file is imported from client code.
import "server-only";

// Import the S3 client and the commands we use.
import {
  // Command to delete an object.
  DeleteObjectCommand,
  // Command to download an object.
  GetObjectCommand,
  // Command to read an object's metadata.
  HeadObjectCommand,
  // Command to upload an object.
  PutObjectCommand,
  // The client itself.
  S3Client,
} from "@aws-sdk/client-s3";

// Import the function that signs URLs.
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Import the function that builds the client settings.
import { r2ClientConfig } from "./r2-config";

// Cloudflare R2 via its S3-compatible API. See docs/adr/0002. R2_ENDPOINT points it at the local
// mock instead (ADR 0024).

// Read a required environment variable, or throw an error that names it.
function env(name: string): string {
  // Look the variable up.
  const value = process.env[name];

  // Fail loudly if it's missing or empty.
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);

  // Return the value.
  return value;
}

// The shared client, created on first use.
let client: S3Client | undefined;

// Get the shared client, creating it if needed.
function r2() {
  // Create the client only if it doesn't exist yet.
  client ??= new S3Client(r2ClientConfig());

  // Return it.
  return client;
}

/** Public URL for a stored object. */
export function publicUrl(key: string) {
  // Join the public base URL (without a trailing slash) and the key.
  return `${env("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

/**
 * A short-lived URL the browser can PUT one file to. Content type and length are signed,
 * so the upload must match what the server validated.
 */
export function signedUploadUrl(key: string, contentType: string, contentLength: number) {
  // Return a signed URL.
  return getSignedUrl(
    // Sign with the shared client.
    r2(),
    // The request being allowed: a PUT of one object.
    new PutObjectCommand({
      // The bucket to write to.
      Bucket: env("R2_BUCKET"),

      // The object's key.
      Key: key,

      // The type the upload must declare.
      ContentType: contentType,

      // The exact size the upload must have.
      ContentLength: contentLength,
    }),
    // The URL stops working after 300 seconds.
    { expiresIn: 300 },
  );
}

/** Size and type of a stored object, or null if it doesn't exist. */
export async function headObject(key: string) {
  // Sending can throw, so guard it.
  try {
    // Ask R2 for the object's metadata.
    const res = await r2().send(new HeadObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));

    // Return its size and type, with safe defaults.
    return { contentLength: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
  } catch (err) {
    // A "NotFound" error means the object doesn't exist.
    if ((err as { name?: string }).name === "NotFound") return null;

    // Anything else is a real problem, so pass it on.
    throw err;
  }
}

/** A stored object's bytes. Only for files already checked to be within the upload size limit. */
export async function readObject(key: string) {
  // Download the object.
  const res = await r2().send(new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));

  // Read its body into a byte array.
  return res.Body!.transformToByteArray();
}

/** Delete a stored object. Succeeds if it's already gone. */
export async function deleteObject(key: string) {
  // Ask R2 to delete the object.
  await r2().send(new DeleteObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
}
