import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { publicUrl } from "@/lib/storage";

const getImage = cache((id: string) =>
  db.image.findUnique({ where: { id }, include: { owner: { select: { name: true } } } }),
);

export async function generateMetadata({ params }: PageProps<"/images/[id]">): Promise<Metadata> {
  const image = await getImage((await params).id);
  return { title: image ? `${image.title} · A Thousand Words` : "Not found" };
}

export default async function ImagePage({ params }: PageProps<"/images/[id]">) {
  const image = await getImage((await params).id);
  if (!image) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{image.title}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Uploaded by {image.owner.name ?? "someone"} on{" "}
        {image.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      {image.description && (
        <p className="mt-4 max-w-2xl leading-7 text-zinc-700 dark:text-zinc-300">{image.description}</p>
      )}
      {/* Plain <img>: Annotorious attaches to it in milestone 4. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={publicUrl(image.storageKey)}
        alt={image.title}
        width={image.width}
        height={image.height}
        className="mt-6 h-auto max-w-full"
      />
    </main>
  );
}
