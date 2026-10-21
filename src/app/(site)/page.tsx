import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { publicUrl } from "@/lib/storage";
import { ImageRow, type RowImage } from "./image-row";

// How many of the newest images the "Recently added" row shows.
const RECENT_COUNT = 20;

type ImageFields = { id: string; title: string; storageKey: string; width: number; height: number };

function toRowImage({ id, title, storageKey, width, height }: ImageFields): RowImage {
  return { id, title, src: publicUrl(storageKey), width, height };
}

const imageSelect = { id: true, title: true, storageKey: true, width: true, height: true } as const;

export default async function Home() {
  // Read the database on every request rather than once at build time.
  await connection();
  const [recent, collections] = await Promise.all([
    db.image.findMany({ orderBy: { createdAt: "desc" }, take: RECENT_COUNT, select: imageSelect }),
    // Themed rows (ADR 0014), in their set order, each with its images in row order.
    db.collection.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        blurb: true,
        images: { orderBy: { position: "asc" }, select: { image: { select: imageSelect } } },
      },
    }),
  ]);

  return (
    <main className="w-full pb-16 pt-10">
      <div className="mx-auto w-full max-w-6xl px-4">
        <h1 className="text-3xl font-semibold tracking-tight">A Thousand Words</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Upload an image, mark a region, and explain what&apos;s there.
        </p>
      </div>

      {recent.length === 0 ? (
        <section className="mx-auto mt-10 w-full max-w-6xl px-4">
          <h2 className="text-lg font-semibold">Recently added</h2>
          <p className="mt-3 text-sm text-zinc-500">
            Nothing here yet.{" "}
            <Link href="/upload" className="underline">
              Upload the first image
            </Link>
            .
          </p>
        </section>
      ) : (
        <>
          <ImageRow heading="Recently added" images={recent.map(toRowImage)} />
          {collections
            .filter((collection) => collection.images.length > 0)
            .map((collection) => (
              <ImageRow
                key={collection.id}
                heading={collection.name}
                blurb={collection.blurb}
                images={collection.images.map(({ image }) => toRowImage(image))}
              />
            ))}
        </>
      )}
    </main>
  );
}
