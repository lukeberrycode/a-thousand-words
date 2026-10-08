// Seeds the demo content in prisma/seed-data.ts: downloads each painting from Wikimedia Commons,
// uploads it to R2, and creates its Image and Annotation rows. Then it creates or updates the home
// page collections and their memberships (ADR 0014).
//
//   npm run db:seed -- --yes
//
// Uses DATABASE_URL and the R2_* values from the environment (.env locally). Safe to re-run:
// paintings already seeded (same R2 key) are skipped, a painting whose Commons file can't be found
// is skipped with a warning, and each collection's membership is replaced with the one listed. Run it against production deliberately,
// with production values in the environment; see the deploy guide.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@/generated/prisma/client";
import { fingerprint } from "@/lib/image-hash";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { artworks, collections } from "./seed-data";

// Wikimedia asks API clients to identify themselves.
const USER_AGENT = "a-thousand-words-seed/1.0 (https://github.com/lukeberrycode/a-thousand-words)";
// A standard Commons thumbnail width: other widths are rounded up to the next step (3840).
const WIDTH = 1920;
const SEED_USER = { id: "seed-user", name: "A Thousand Words", approvedAt: new Date() };

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
  console.log(`Collections: ${collections.length}`);
  checkCollections();
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

    const notFound: string[] = [];
    for (const art of artworks) {
      const storageKey = storageKeyFor(art.slug);
      if (await db.image.findUnique({ where: { storageKey }, select: { id: true } })) {
        console.log(`skip  ${art.title} (already seeded)`);
        continue;
      }

      const bytes = await download(art.source);
      if (!bytes) {
        console.warn(`WARN  ${art.title}: file not found on Wikimedia Commons (${art.source}). Skipped.`);
        notFound.push(art.title);
        continue;
      }
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
          regions: {
            // Pages list boxes oldest first; space the timestamps so they keep this order.
            // Each seed box holds one annotation.
            create: art.annotations.map((a, i) => ({
              authorId: owner.id,
              ...a.region,
              createdAt: new Date(Date.now() + i * 1000),
              annotations: { create: { authorId: owner.id, bodyMarkdown: a.body } },
            })),
          },
        },
      });
      console.log(`added ${art.title} (${width}×${height}, ${art.annotations.length} annotations)`);
      // Be gentle with Wikimedia.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await seedCollections(db);
    if (notFound.length > 0) {
      console.warn(`\n${notFound.length} painting(s) skipped; fix their source in prisma/seed-data.ts:`);
      for (const title of notFound) console.warn(`  - ${title}`);
    }
  } finally {
    await db.$disconnect();
  }
}

function storageKeyFor(slug: string) {
  return `images/seed/${slug}.jpg`;
}

/** Fails early if a collection lists a painting that isn't in the seed data. */
function checkCollections() {
  const slugs = new Set(artworks.map((art) => art.slug));
  for (const collection of collections) {
    const unknown = collection.artworks.filter((slug) => !slugs.has(slug));
    if (unknown.length > 0) throw new Error(`Collection ${collection.slug} lists unknown paintings: ${unknown}`);
  }
}

/**
 * Creates or updates each collection, and replaces its membership with the paintings listed, in
 * order. Paintings that weren't seeded (for example, not found on Commons) are left out.
 */
async function seedCollections(db: PrismaClient) {
  for (const [sortOrder, { slug, name, blurb, artworks: members }] of collections.entries()) {
    const images = await db.image.findMany({
      where: { storageKey: { in: members.map(storageKeyFor) } },
      select: { id: true, storageKey: true },
    });
    const idByKey = new Map(images.map((image) => [image.storageKey, image.id]));
    const imageIds = members.map((m) => idByKey.get(storageKeyFor(m))).filter((id) => id !== undefined);

    await db.$transaction(async (tx) => {
      const collection = await tx.collection.upsert({
        where: { slug },
        update: { name, blurb, sortOrder },
        create: { slug, name, blurb, sortOrder },
      });
      await tx.collectionImage.deleteMany({ where: { collectionId: collection.id } });
      await tx.collectionImage.createMany({
        data: imageIds.map((imageId, position) => ({ collectionId: collection.id, imageId, position })),
      });
    });
    console.log(`collection ${name} (${imageIds.length} of ${members.length} paintings)`);
  }
}

/**
 * Downloads a Commons file at WIDTH pixels wide, via the API's thumbnail URL. Returns null if
 * Commons has no file by that name.
 */
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
    // Follow file redirects, so a renamed Commons file still resolves.
    redirects: "1",
  }).toString();
  const info = await (await fetch(api, { headers: { "User-Agent": USER_AGENT } })).json();
  const url: string | undefined = info.query?.pages?.[0]?.imageinfo?.[0]?.thumburl;
  if (!url) return null;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Downloading ${file} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
