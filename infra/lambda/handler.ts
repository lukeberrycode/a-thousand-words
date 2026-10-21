// Daily cleanup of orphaned uploads in R2 (docs/adr/0018). Lists every object under the key
// prefix, asks Postgres which keys have an Image row, and deletes the rest once they're over a day
// old. In dry-run mode it only logs what it would delete.

import { DeleteObjectsCommand, paginateListObjectsV2, S3Client } from "@aws-sdk/client-s3";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";
import { chunk, DEFAULT_MIN_AGE_MS, findOrphans, type StoredObject } from "./orphans";

/** The secret's JSON. Same names as the app's environment variables (.env.example). */
interface Config {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  DATABASE_URL: string;
}

const CONFIG_KEYS: (keyof Config)[] = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "DATABASE_URL",
];

export interface Result {
  dryRun: boolean;
  listed: number;
  orphans: number;
  deleted: number;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function log(message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ message, ...fields }));
}

let config: Config | undefined;

async function loadConfig(): Promise<Config> {
  if (config) return config;
  const res = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: env("SECRET_ARN") }));
  let parsed: Partial<Config>;
  try {
    parsed = JSON.parse(res.SecretString ?? "");
  } catch {
    throw new Error("The secret isn't JSON yet. Fill it in as infra/README.md describes.");
  }
  const missing = CONFIG_KEYS.filter((k) => typeof parsed[k] !== "string" || parsed[k] === "");
  if (missing.length) throw new Error(`The secret is missing ${missing.join(", ")}`);
  config = parsed as Config;
  return config;
}

function r2(c: Config) {
  // Cloudflare R2 via its S3-compatible API, configured as in the app's src/lib/storage.ts.
  return new S3Client({
    region: "auto",
    endpoint: `https://${c.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.R2_ACCESS_KEY_ID, secretAccessKey: c.R2_SECRET_ACCESS_KEY },
  });
}

async function listObjects(s3: S3Client, bucket: string, prefix: string): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket: bucket, Prefix: prefix })) {
    for (const o of page.Contents ?? []) {
      if (o.Key) objects.push({ key: o.Key, lastModified: o.LastModified });
    }
  }
  return objects;
}

/** The subset of `keys` that an Image row's storageKey points at. */
async function knownKeys(databaseUrl: string, keys: string[]): Promise<Set<string>> {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const known = new Set<string>();
    for (const batch of chunk(keys, 1000)) {
      const res = await db.query<{ storageKey: string }>(
        'SELECT "storageKey" FROM "Image" WHERE "storageKey" = ANY($1::text[])',
        [batch],
      );
      for (const row of res.rows) known.add(row.storageKey);
    }
    return known;
  } finally {
    await db.end();
  }
}

async function deleteObjects(s3: S3Client, bucket: string, keys: string[]) {
  let deleted = 0;
  const failed: { key?: string; code?: string }[] = [];
  for (const batch of chunk(keys, 1000)) {
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    const errors = res.Errors ?? [];
    failed.push(...errors.map((e) => ({ key: e.Key, code: e.Code })));
    deleted += batch.length - errors.length;
  }
  return { deleted, failed };
}

export async function handler(): Promise<Result> {
  const dryRun = env("DRY_RUN", "true") !== "false";
  const prefix = env("KEY_PREFIX", "images/");
  const maxDeletes = Number(env("MAX_DELETES", "100"));
  const minAgeMs = Number(env("MIN_AGE_HOURS", "24")) * 60 * 60 * 1000 || DEFAULT_MIN_AGE_MS;

  const c = await loadConfig();
  const s3 = r2(c);

  // List first, then query: an Image row created while listing is still seen.
  const objects = await listObjects(s3, c.R2_BUCKET, prefix);
  const known = await knownKeys(
    c.DATABASE_URL,
    objects.map((o) => o.key),
  );
  const orphans = findOrphans(objects, known, new Date(), minAgeMs);
  log("Found orphans", { dryRun, prefix, listed: objects.length, withRow: known.size, orphans: orphans.length });

  // A wrong DATABASE_URL (an empty database) would make every object look orphaned. Refuse to
  // delete more than a normal day's worth; the error alarm says to look.
  if (orphans.length > maxDeletes) {
    log("Orphans", { keys: orphans });
    throw new Error(
      `${orphans.length} orphans is more than MAX_DELETES (${maxDeletes}). Nothing deleted. Check the keys above, then raise maxDeletes for one run if they're right.`,
    );
  }

  if (dryRun) {
    for (const key of orphans) log("Would delete", { key });
    return { dryRun, listed: objects.length, orphans: orphans.length, deleted: 0 };
  }

  const { deleted, failed } = await deleteObjects(s3, c.R2_BUCKET, orphans);
  const failedKeys = new Set(failed.map((f) => f.key));
  for (const key of orphans) if (!failedKeys.has(key)) log("Deleted", { key });
  if (failed.length) {
    log("Delete failed", { failed });
    throw new Error(`${failed.length} of ${orphans.length} deletes failed`);
  }
  return { dryRun, listed: objects.length, orphans: orphans.length, deleted };
}
