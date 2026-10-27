import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { defaults, Pool } from "pg";
import { r2ClientConfig } from "../../src/lib/r2-config";

// The database and R2 bucket the test app server uses: the R2 mock unless E2E_REAL_R2 is set
// (playwright.config.ts, ADR 0024), and the database from .env.local or .env. The app's own modules for these are
// "server-only", and the generated Prisma client is an ES module, which Playwright can't load from
// this CommonJS project, so the tests use plain SQL.

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

// The timestamp columns hold UTC without a time zone, as Prisma writes them. pg would otherwise send
// a Date in local time, an hour out under BST, so a test annotation made "an hour ago" was dated now.
defaults.parseInputDatesAsUTC = true;

// One connection, for the same reason the tests run one at a time (playwright.config.ts).
const pool = new Pool({ connectionString: env("DATABASE_URL"), max: 1 });

/** Run a query and return its rows. */
export async function sql<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  return (await pool.query(text, values)).rows as T[];
}

const r2 = new S3Client(r2ClientConfig());

export function publicUrl(key: string) {
  return `${env("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await r2.send(new PutObjectCommand({ Bucket: env("R2_BUCKET"), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
}

/** Whether an object is in the bucket. */
export async function objectExists(key: string) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "NotFound") return false;
    throw err;
  }
}
