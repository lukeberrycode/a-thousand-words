// Import Next.js's client-side navigation link.
import Link from "next/link";

// Import `connection`, which makes a page render per request.
import { connection } from "next/server";

// Import the shared database client.
import { db } from "@/lib/db";

// Import the helper that turns a storage key into a public URL.
import { publicUrl } from "@/lib/storage";

// Import the image row component and its image type.
import { ImageRow, type RowImage } from "./image-row";

// How many of the newest images the "Recently added" row shows.
const RECENT_COUNT = 20;

// The image columns the home page reads.
type ImageFields = { id: string; title: string; storageKey: string; width: number; height: number };

// Turn a database image into what an image row needs.
function toRowImage({ id, title, storageKey, width, height }: ImageFields): RowImage {
  // Swap the storage key for a public URL.
  return { id, title, src: publicUrl(storageKey), width, height };
}

// The columns to fetch for each image.
const imageSelect = { id: true, title: true, storageKey: true, width: true, height: true } as const;

// The home page.
export default async function Home() {
  // Read the database on every request rather than once at build time.
  await connection();

  // Fetch the newest images and the themed rows at the same time.
  const [recent, collections] = await Promise.all([
    // The newest images, newest first.
    db.image.findMany({ orderBy: { createdAt: "desc" }, take: RECENT_COUNT, select: imageSelect }),
    // Themed rows (ADR 0014), in their set order, each with its images in row order.
    db.collection.findMany({
      // Order the rows by their set order.
      orderBy: { sortOrder: "asc" },

      // Choose the columns to read.
      select: {
        // The row's id.
        id: true,

        // The row's heading.
        name: true,

        // The row's short description.
        blurb: true,

        // Its images, in row order.
        images: { orderBy: { position: "asc" }, select: { image: { select: imageSelect } } },
      },
    }),
  ]);

  // Return the page markup.
  return (
    // The main content area, full width.
    <main className="w-full pb-16 pt-10">
      {/* The intro block, centred and limited in width. */}
      <div className="mx-auto w-full max-w-6xl px-4">
        {/* The page heading. */}
        <h1 className="text-3xl font-semibold tracking-tight">A Thousand Words</h1>
        {/* A one-line description of the site. */}
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Upload an image, mark a region, and explain what&apos;s there.
        </p>
      </div>

      {/* If there are no images, show an empty state. */}
      {recent.length === 0 ? (
        // The empty-state section.
        <section className="mx-auto mt-10 w-full max-w-6xl px-4">
          {/* The section heading. */}
          <h2 className="text-lg font-semibold">Recently added</h2>
          {/* The empty-state message. */}
          <p className="mt-3 text-sm text-zinc-500">
            Nothing here yet. {/* A link to the upload page. */}
            <Link href="/upload" className="underline">
              Upload the first image
            </Link>
            .
          </p>
        </section>
      ) : (
        // Otherwise show the rows.
        <>
          {/* The row of newest images. */}
          <ImageRow heading="Recently added" images={recent.map(toRowImage)} />
          {/* Then the themed rows, skipping any that are empty. */}
          {collections
            // Keep only rows that have images.
            .filter((collection) => collection.images.length > 0)
            // Turn each row into a component.
            .map((collection) => (
              // One themed row.
              <ImageRow
                // React's list key.
                key={collection.id}
                // The row's heading.
                heading={collection.name}
                // The row's short description.
                blurb={collection.blurb}
                // The row's images, in order.
                images={collection.images.map(({ image }) => toRowImage(image))}
              />
            ))}
        </>
      )}
    </main>
  );
}
