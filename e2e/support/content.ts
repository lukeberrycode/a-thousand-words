import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { ContentFile } from "@/lib/content/operations";
import { deleteObject, sql } from "./services";

// Content migrations in system tests (docs/system-tests.md, CON-*). The runner needs a Prisma
// client, and the generated client is an ES module that Playwright can't load from this CommonJS
// project (see services.ts), so `runContent` starts content-run.ts in its own tsx process, sends it
// a request as JSON on stdin, and reads the result from the last line it prints.
//
// Every key, slug and file name the tests use contains `e2e-`, so `removeTestContent` can find
// them. The content account ("seed-user") and anything without an e2e- key are never touched: the
// development database may hold real content.

export type ContentRequest =
  { mode: "apply"; file: ContentFile; yes: boolean } | { mode: "status"; files: ContentFile[] };

export type ApplyResult = {
  changes: string[];
  skipped: string[];
  unchanged: string[];
  unmatched: string[];
  /** R2 keys written and deleted through the store. */
  puts: string[];
  removes: string[];
  /** Sources the runner asked to download. */
  downloads: string[];
  log: string[];
};

export type StatusResult = { applied: string[]; pending: string[]; problems: string[] };

export const RESULT_PREFIX = "RESULT ";

/** The Commons address content-run.ts's fake download turns into picture(seed). Others give null. */
export const sourceFor = (seed: number) => `https://commons.wikimedia.org/wiki/File:e2e-${seed}.jpg`;

/** A fresh prefix for one test's keys and file names, such as "e2e-1a2b3c4d". */
export const newTag = () => `e2e-${randomBytes(4).toString("hex")}`;

function run(request: ContentRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--no-install", "tsx", "e2e/support/content-run.ts"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const line = out.split("\n").find((l) => l.startsWith(RESULT_PREFIX));
      if (code !== 0 || !line) reject(new Error(`content-run.ts exited with ${code}:\n${err}\n${out}`));
      else resolve(JSON.parse(line.slice(RESULT_PREFIX.length)));
    });
    child.stdin.end(JSON.stringify(request));
  });
}

/** applyFile on the test database and the R2 mock, planning from the database's current state. */
export const applyTestFile = (file: ContentFile, { yes = true } = {}) =>
  run({ mode: "apply", file, yes }) as Promise<ApplyResult>;

/** contentStatus on the test database. */
export const testStatus = (files: ContentFile[]) => run({ mode: "status", files }) as Promise<StatusResult>;

/** Remove every image, box, collection and ContentMigration row with an e2e- key, and their files. */
export async function removeTestContent() {
  // Seed-style images a test made for the baseline to claim have no content key yet, but their
  // storage key is images/seed/e2e-….
  const ours = `"contentKey" LIKE 'e2e-%' OR "storageKey" LIKE 'images/seed/e2e-%'`;
  const images = await sql<{ storageKey: string }>(`SELECT "storageKey" FROM "Image" WHERE ${ours}`);
  await sql(`DELETE FROM "Region" WHERE "contentKey" LIKE 'e2e-%'`);
  await sql(`DELETE FROM "Image" WHERE ${ours}`);
  await sql(`DELETE FROM "Collection" WHERE slug LIKE 'e2e-%'`);
  await sql(`DELETE FROM "ContentMigration" WHERE name ~ '^[0-9]{4}-e2e-'`);
  // Files a dry run or a failed run might have left, as well as the deleted images'.
  await Promise.all(images.map((i) => deleteObject(i.storageKey)));
}
