import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { promisify } from "node:util";
import { picture, newSeed } from "./support/pictures";
import { deleteObject, publicUrl, putObject, sql } from "./support/services";
import { expect, test } from "./support/world";

// Environment checks (docs/system-tests.md). These don't need the browser. ENV-05 (lint and build)
// stays a pair of commands to run before merging.

const run = promisify(execFile);

test("ENV-01: Local database is reachable", async () => {
  expect(await sql(`SELECT 1 AS ok`)).toEqual([{ ok: 1 }]);
});

test("ENV-02: Migrations are applied and the schema matches", async () => {
  const status = await run("npx", ["prisma", "migrate", "status"]);
  expect(status.stdout).toContain("Database schema is up to date!");
  const migrations = readdirSync("prisma/migrations").filter((f) => /^\d/.test(f));
  expect(status.stdout).toContain(`${migrations.length} migrations found in prisma/migrations`);

  const diff = await run("npx", [
    "prisma",
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
  ]);
  expect(diff.stdout.trim()).toBe("-- This is an empty migration.");
});

test("ENV-03: Database tables exist", async () => {
  const tables = await sql<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`,
  );
  expect(tables.map((t) => t.table_name)).toEqual(
    expect.arrayContaining(["User", "Account", "Session", "VerificationToken", "Image", "Region", "Annotation"]),
  );
});

test("ENV-04: R2 bucket is publicly readable", async ({ request }) => {
  const file = await picture(newSeed(), { width: 60, height: 40 });
  const key = `images/e2e-env-04-${newSeed()}.png`;
  await putObject(key, file.buffer, file.mimeType);
  try {
    const res = await request.get(publicUrl(key));
    expect(res.status()).toBe(200);
    expect(Buffer.from(await res.body()).equals(file.buffer)).toBe(true);
  } finally {
    await deleteObject(key);
  }
});
