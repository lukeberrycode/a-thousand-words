import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { publicUrl } from "@/lib/storage";
import { SignInButton } from "../../user-menu";
import { AnnotatedImage } from "./annotated-image";
import { ImageHeader } from "./image-header";

const getImage = cache((id: string) =>
  db.image.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      annotations: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  }),
);

export async function generateMetadata({ params }: PageProps<"/images/[id]">): Promise<Metadata> {
  const image = await getImage((await params).id);
  return { title: image ? `${image.title} · A Thousand Words` : "Not found" };
}

export default async function ImagePage({ params }: PageProps<"/images/[id]">) {
  const { id } = await params;
  const [image, user] = await Promise.all([getImage(id), getCurrentUser()]);
  if (!image) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <ImageHeader
        id={image.id}
        title={image.title}
        description={image.description}
        byline={`Uploaded by ${image.owner.name ?? "someone"} on ${image.createdAt.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`}
        mine={user?.id === image.ownerId}
        annotationCount={image.annotations.length}
      />
      <div className="mt-6">
        <AnnotatedImage
          image={{
            id: image.id,
            src: publicUrl(image.storageKey),
            title: image.title,
            size: { width: image.width, height: image.height },
          }}
          // Only what the browser needs: no emails or other user fields.
          annotations={image.annotations.map((a) => ({
            id: a.id,
            region: { x: a.x, y: a.y, w: a.w, h: a.h },
            body: a.bodyMarkdown,
            authorName: a.author.name,
            mine: user?.id === a.authorId,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
          }))}
          canAnnotate={!!user}
          signInPrompt={
            user ? null : (
              <SignInButton redirectTo={`/images/${image.id}`} label="Sign in with GitHub to annotate" />
            )
          }
        />
      </div>
    </main>
  );
}
