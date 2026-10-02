// Seeds the demo content in prisma/seed-data.ts: downloads each painting from Wikimedia Commons,
// uploads it to R2, and creates its Image and Annotation rows.
//
//   npm run db:seed -- --yes
//
// Uses DATABASE_URL and the R2_* values from the environment (.env locally). Safe to re-run:
// paintings already seeded (same R2 key) are skipped. Run it against production deliberately,
// with production values in the environment; see the deploy guide.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@/generated/prisma/client";
import { fingerprint } from "@/lib/image-hash";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { artworks } from "./seed-data";

// Wikimedia asks API clients to identify themselves.
const USER_AGENT = "a-thousand-words-seed/1.0 (https://github.com/lukeberrycode/a-thousand-words)";
// A standard Commons thumbnail width: other widths are rounded up to the next step (3840).
const WIDTH = 1920;
const SEED_USER = { id: "seed-user", name: "A Thousand Words" };

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

async function main() {
  const databaseUrl = env("DATABASE_URL");
  const bucket = env("R2_BUCKET");
  console.log(`Database: ${new URL(databaseUrl).host}`);
  console.log(`R2 bucket: ${bucket}`);
  console.log(`Paintings: ${artworks.length}`);
  if (!process.argv.includes("--yes")) {
    console.log("\nDry run. Check the database and bucket above, then re-run with --yes to seed.");
    return;
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  });

  try {
    const owner = await db.user.upsert({ where: { id: SEED_USER.id }, update: {}, create: SEED_USER });

    for (const art of artworks) {
      const storageKey = `images/seed/${art.slug}.jpg`;
      if (await db.image.findUnique({ where: { storageKey }, select: { id: true } })) {
        console.log(`skip  ${art.title} (already seeded)`);
        continue;
      }

      const bytes = await download(art.source);
      if (bytes.length > MAX_UPLOAD_BYTES) throw new Error(`${art.title} is over the upload size limit.`);
      // Size and duplicate-detection hashes, exactly as createImage computes them.
      const { width, height, sha256, phash } = await fingerprint(bytes);

      await r2.send(
        new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body: bytes, ContentType: "image/jpeg" }),
      );
      await db.image.create({
        data: {
          ownerId: owner.id,
          title: art.title,
          description: art.description,
          storageKey,
          width,
          height,
          sha256,
          phash,
          annotations: {
            // Pages list annotations oldest first; space the timestamps so they keep this order.
            create: art.annotations.map((a, i) => ({
              authorId: owner.id,
              ...a.region,
              bodyMarkdown: a.body,
              createdAt: new Date(Date.now() + i * 1000),
            })),
          },
        },
      });
      console.log(`added ${art.title} (${width}×${height}, ${art.annotations.length} annotations)`);
      // Be gentle with Wikimedia.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    await db.$disconnect();
  }
}

/** Downloads a Commons file at WIDTH pixels wide, via the API's thumbnail URL. */
async function download(sourcePage: string) {
  const file = decodeURIComponent(new URL(sourcePage).pathname.replace(/^\/wiki\//, ""));
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(WIDTH),
    titles: file,
  }).toString();
  const info = await (await fetch(api, { headers: { "User-Agent": USER_AGENT } })).json();
  const url: string | undefined = info.query?.pages?.[0]?.imageinfo?.[0]?.thumburl;
  if (!url) throw new Error(`Couldn't find ${file} on Wikimedia Commons.`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Downloading ${file} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
