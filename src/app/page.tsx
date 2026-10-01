import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { publicUrl } from "@/lib/storage";

export default async function Home() {
  // Read the database on every request rather than once at build time.
  await connection();
  const images = await db.image.findMany({ orderBy: { createdAt: "desc" }, take: 24 });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">A Thousand Words</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Upload an image, mark a region, and explain what&apos;s there.
      </p>

      <h2 className="mb-4 mt-10 text-lg font-semibold">Recent images</h2>
      {images.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing here yet.{" "}
          <Link href="/upload" className="underline">
            Upload the first image
          </Link>
          .
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <li key={image.id}>
              <Link href={`/images/${image.id}`} className="group block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicUrl(image.storageKey)}
                  alt={image.title}
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                  className="aspect-square w-full rounded-md bg-zinc-100 object-cover dark:bg-zinc-900"
                />
                <span className="mt-2 block truncate text-sm group-hover:underline">{image.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
