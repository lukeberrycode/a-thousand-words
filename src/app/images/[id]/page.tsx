import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { db } from "@/lib/db";
import { PENDING_APPROVAL, getCurrentUser } from "@/lib/current-user";
import { publicUrl } from "@/lib/storage";
import { SignInButton, UserMenu } from "../../user-menu";
import { AnnotatedImage } from "./annotated-image";
import { ImageDetails } from "./image-details";

const getImage = cache((id: string) =>
  db.image.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      regions: {
        orderBy: { createdAt: "asc" },
        include: {
          annotations: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { name: true } } },
          },
        },
      },
    },
  }),
);

// The image can use the whole screen, under a notch or camera cut-out and into rounded corners;
// the UI panel and cards keep to the safe area (docs/enrich-UI.md, Rule 7). The other fields
// repeat the root layout's, as a segment's viewport replaces it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
};

export async function generateMetadata({ params }: PageProps<"/images/[id]">): Promise<Metadata> {
  const image = await getImage((await params).id);
  return { title: image ? `${image.title} · A Thousand Words` : "Not found" };
}

export default async function ImagePage({ params }: PageProps<"/images/[id]">) {
  const { id } = await params;
  const [image, user] = await Promise.all([getImage(id), getCurrentUser()]);
  if (!image) notFound();

  return (
    <main>
      <AnnotatedImage
        image={{
          id: image.id,
          src: publicUrl(image.storageKey),
          title: image.title,
          size: { width: image.width, height: image.height },
        }}
        // Only what the browser needs: no emails or other user fields.
        regions={image.regions.map((r) => ({
          id: r.id,
          region: { x: r.x, y: r.y, w: r.w, h: r.h },
          // Only the box's creator can move it, while it holds only their annotations.
          movable: !!user && r.authorId === user.id && r.annotations.every((a) => a.authorId === user.id),
          updatedAt: r.updatedAt.toISOString(),
          annotations: r.annotations.map((a) => ({
            id: a.id,
            body: a.bodyMarkdown,
            authorName: a.author.name,
            mine: user?.id === a.authorId,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
          })),
        }))}
        canAnnotate={!!user?.approved}
        signInPrompt={
          user ? (
            user.approved ? null : <p className="text-sm text-zinc-500">{PENDING_APPROVAL}</p>
          ) : (
            <SignInButton redirectTo={`/images/${image.id}`} label="Sign in with GitHub to annotate" />
          )
        }
        about={
          <div className="flex flex-col gap-4">
            <ImageDetails
              id={image.id}
              title={image.title}
              description={image.description}
              byline={`Uploaded by ${image.owner.name ?? "someone"} on ${image.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}`}
              mine={user?.id === image.ownerId}
              annotationCount={image.regions.reduce((n, r) => n + r.annotations.length, 0)}
            />
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
            <ReportLink imageId={image.id} title={image.title} />
          </div>
        }
      />
    </main>
  );
}

/**
 * Report/takedown link (ADR 0006): an email to REPORT_EMAIL with the page address filled in.
 * Hidden if REPORT_EMAIL isn't set, which production must not allow (see .env.example).
 */
async function ReportLink({ imageId, title }: { imageId: string; title: string }) {
  const to = process.env.REPORT_EMAIL;
  if (!to) return null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const page = `${proto}://${host}/images/${imageId}`;
  const href = `mailto:${to}?${new URLSearchParams({
    subject: `Report: ${title}`,
    body: `Image: ${page}\n\nWhat's wrong with this image or its annotations?\n`,
  })
    .toString()
    .replace(/\+/g, "%20")}`;
  return (
    <p className="text-xs text-zinc-500">
      Something wrong with this image or an annotation?{" "}
      <a href={href} className="underline">
        Report it
      </a>
      .
    </p>
  );
}
