// Import the types for page metadata and viewport settings.
import type { Metadata, Viewport } from "next";

// Import the function that reads the request's headers.
import { headers } from "next/headers";

// Import the function that shows the 404 page.
import { notFound } from "next/navigation";

// Import Suspense and React's per-request cache.
import { Suspense, cache } from "react";

// Import the shared database client.
import { db } from "@/lib/db";

// Import the pending-approval message and the current-user lookup.
import { PENDING_APPROVAL, getCurrentUser } from "@/lib/current-user";

// Import the helper that turns a storage key into a public URL.
import { publicUrl } from "@/lib/storage";

// Import the sign-in button and the user menu.
import { SignInButton, UserMenu } from "../../user-menu";

// Import the image-and-annotations component.
import { AnnotatedImage } from "./annotated-image";

// Import the title-and-description component.
import { ImageDetails } from "./image-details";

// Load an image with its regions and annotations, once per request even if called twice.
const getImage = cache((id: string) =>
  // Look the image up by id.
  db.image.findUnique({
    // Match this id.
    where: { id },

    // Also load related rows.
    include: {
      // The uploader's name only.
      owner: { select: { name: true } },

      // The image's regions.
      regions: {
        // Oldest first.
        orderBy: { createdAt: "asc" },

        // Each region's annotations.
        include: {
          // The annotations on the region.
          annotations: {
            // Oldest first.
            orderBy: { createdAt: "asc" },

            // Each annotation's author name only.
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
  // Match the device's screen width.
  width: "device-width",

  // Start at normal zoom.
  initialScale: 1,

  // Let the on-screen keyboard resize the layout viewport.
  interactiveWidget: "resizes-content",

  // Extend under notches and rounded corners.
  viewportFit: "cover",
};

// Set the page's title from the image.
export async function generateMetadata({ params }: PageProps<"/images/[id]">): Promise<Metadata> {
  // Load the image named in the URL.
  const image = await getImage((await params).id);

  // Use its title, or "Not found" if there's no such image.
  return { title: image ? `${image.title} · A Thousand Words` : "Not found" };
}

// The image page.
export default async function ImagePage({ params }: PageProps<"/images/[id]">) {
  // Read the id from the URL.
  const { id } = await params;

  // Load the image and the current user at the same time.
  const [image, user] = await Promise.all([getImage(id), getCurrentUser()]);

  // Show the 404 page if there's no such image.
  if (!image) notFound();

  // Return the page markup.
  return (
    // The main content area.
    <main>
      {/* The image, its regions and its panel. */}
      <AnnotatedImage
        // The image's details.
        image={{
          // Its id.
          id: image.id,

          // Its public URL.
          src: publicUrl(image.storageKey),

          // Its title.
          title: image.title,

          // Its pixel size.
          size: { width: image.width, height: image.height },
        }}
        // Only what the browser needs: no emails or other user fields.
        regions={image.regions.map((r) => ({
          // The region's id.
          id: r.id,

          // Its position and size, as fractions of the image.
          region: { x: r.x, y: r.y, w: r.w, h: r.h },

          // Only the box's creator can move it, while it holds only their annotations.
          movable: !!user && r.authorId === user.id && r.annotations.every((a) => a.authorId === user.id),

          // When it last changed, as text.
          updatedAt: r.updatedAt.toISOString(),

          // Its annotations.
          annotations: r.annotations.map((a) => ({
            // The annotation's id.
            id: a.id,

            // Its Markdown text.
            body: a.bodyMarkdown,

            // The author's display name.
            authorName: a.author.name,

            // Whether the current user wrote it.
            mine: user?.id === a.authorId,

            // When it was created, as text.
            createdAt: a.createdAt.toISOString(),

            // When it last changed, as text.
            updatedAt: a.updatedAt.toISOString(),
          })),
        }))}
        // Only approved users may annotate.
        canAnnotate={!!user?.approved}
        // What to show people who can't annotate.
        signInPrompt={
          // Signed in?
          user ? (
            // Approved users need no prompt; others see the waiting message.
            user.approved ? null : (
              <p className="text-sm text-zinc-500">{PENDING_APPROVAL}</p>
            )
          ) : (
            // Visitors get a sign-in button that returns here.
            <SignInButton redirectTo={`/images/${image.id}`} label="Sign in with GitHub to annotate" />
          )
        }
        // The content for the panel's "about" section.
        about={
          // A column of blocks.
          <div className="flex flex-col gap-4">
            {/* The title, description and owner controls. */}
            <ImageDetails
              // The image's id.
              id={image.id}
              // Its title.
              title={image.title}
              // Its description.
              description={image.description}
              // The "Uploaded by … on …" line, with a British date.
              byline={`Uploaded by ${image.owner.name ?? "someone"} on ${image.createdAt.toLocaleDateString("en-GB", {
                // The day number.
                day: "numeric",
                // The month name in full.
                month: "long",
                // The four-digit year.
                year: "numeric",
              })}`}
              // Whether the current user uploaded it.
              mine={user?.id === image.ownerId}
              // The total number of annotations on it.
              annotationCount={image.regions.reduce((n, r) => n + r.annotations.length, 0)}
            />
            {/* Load the user menu without blocking the rest. */}
            <Suspense fallback={null}>
              {/* The sign-in or user menu. */}
              <UserMenu />
            </Suspense>
            {/* The report link. */}
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
  // The address reports go to.
  const to = process.env.REPORT_EMAIL;

  // Show nothing if it isn't set.
  if (!to) return null;

  // Read the request's headers.
  const h = await headers();

  // The site's hostname, preferring the one a proxy forwarded.
  const host = h.get("x-forwarded-host") ?? h.get("host");

  // The protocol, preferring the one a proxy forwarded.
  const proto = h.get("x-forwarded-proto") ?? "http";

  // This page's full address.
  const page = `${proto}://${host}/images/${imageId}`;

  // Build the mailto link, with a subject and a starter message.
  const href = `mailto:${to}?${new URLSearchParams({
    // The subject line.
    subject: `Report: ${title}`,

    // The message body, with the page address.
    body: `Image: ${page}\n\nWhat's wrong with this image or its annotations?\n`,
  })
    // Turn the parameters into text.
    .toString()
    // Use %20 for spaces, which mail programs read better than "+".
    .replace(/\+/g, "%20")}`;

  // Return the link's markup.
  return (
    // A small line of text.
    <p className="text-xs text-zinc-500">
      Something wrong with this image or an annotation? {/* The email link. */}
      <a href={href} className="underline">
        Report it
      </a>
      .
    </p>
  );
}
