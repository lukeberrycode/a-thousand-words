// Content migrations (ADR 0026): the numbered files in prisma/content, each applied once to each
// database and recorded in ContentMigration.
//
//   npm run content:status          which files this database has applied, and which are pending
//   npm run content:apply           dry run: prints what each pending file would do
//   npm run content:apply -- --yes  applies them
//
// Uses DATABASE_URL and the R2_* values from the environment (.env.local, then .env; R2_ENDPOINT
// uses the local R2 mock instead, ADR 0024). prod:content and preview:content run `apply` with
// settings from KeePassXC (ADR 0019).

import "./load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@/generated/prisma/client";
import { downloadFromCommons } from "@/lib/content/commons";
import { loadContentFiles } from "@/lib/content/files";
import { applyContent, contentStatus } from "@/lib/content/runner";
import { r2ClientConfig } from "@/lib/r2-config";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

async function main() {
  const command = process.argv[2];
  if (command !== "status" && command !== "apply") {
    throw new Error("Usage: tsx scripts/content.ts status | apply [--yes]");
  }
  const databaseUrl = env("DATABASE_URL");
  const files = await loadContentFiles();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  console.log(`Database: ${new URL(databaseUrl).host}`);

  try {
    if (command === "status") {
      const { applied, pending, problems } = await contentStatus(db, files);
      for (const a of applied) console.log(`applied  ${a.name}  (${a.appliedAt.toISOString()})`);
      for (const p of pending) console.log(`pending  ${p.name}`);
      for (const p of problems) console.log(`PROBLEM  ${p}`);
      if (problems.length > 0) process.exitCode = 1;
      return;
    }

    const bucket = env("R2_BUCKET");
    console.log(`R2 bucket: ${bucket}${process.env.R2_ENDPOINT ? ` at ${process.env.R2_ENDPOINT}` : ""}`);
    const yes = process.argv.includes("--yes");
    // The S3 client reads its keys only when it's needed, so a dry run works without them.
    let r2: S3Client | undefined;
    const client = () => (r2 ??= new S3Client(r2ClientConfig()));
    await applyContent(db, files, {
      yes,
      download: downloadFromCommons,
      store: {
        put: async (key, bytes) => {
          await client().send(
            new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "image/jpeg" }),
          );
        },
        remove: async (key) => {
          await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
