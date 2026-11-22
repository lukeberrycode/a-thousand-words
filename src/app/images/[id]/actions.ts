// Mark every export of this file as a server action, callable from the browser.
"use server";

// Import the function that refreshes the current page.
import { refresh } from "next/cache";

// Import the function that sends the browser to another page.
import { redirect } from "next/navigation";

// Import the shared database client.
import { db } from "@/lib/db";

// Import the pending-approval message and the current-user lookup.
import { PENDING_APPROVAL, getCurrentUser } from "@/lib/current-user";

// Import the annotation checks.
import { checkBody, checkRegion } from "@/lib/annotations";

// Import the overlap check.
import { findClash } from "@/lib/overlap";

// Import the function that deletes a stored file.
import { deleteObject } from "@/lib/storage";

// Import the title and description check.
import { checkDetails } from "@/lib/uploads";

// Import the Region type.
import type { Region } from "@/lib/regions";

// Every action checks the session itself: server actions can be called by direct POST.
// Ownership is part of each lookup's `where`, so other people's content is never found.

// Either success with some data, or failure with a message.
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** A save refused because the box overlaps `clashWith`, an existing region (ADR 0011). */
export type Clash = { ok: false; error: string; clashWith: string };

// The message for visitors who aren't signed in.
const SIGNED_OUT = "Sign in to annotate.";

// The message when an annotation is missing or belongs to someone else.
const NOT_YOURS = "That annotation doesn't exist, or isn't yours.";

// The message when a box overlaps another too much.
const OVERLAPS =
  "This box overlaps an existing one too much: one of them would be hard to click. Add to that annotation instead, or adjust your box.";

/** Copy only the fields we expect: the browser could send anything. */
function parseRegion(input: Partial<Region> | undefined): Region {
  // Turn each field into a number, so strings and other types can't slip through.
  return { x: Number(input?.x), y: Number(input?.y), w: Number(input?.w), h: Number(input?.h) };
}

/** The image's region the box would clash with, if any. `id` is the region being moved, if any. */
async function clashFor(imageId: string, box: Region, id = "new"): Promise<string | null> {
  // Load the image's existing regions.
  const existing = await db.region.findMany({
    // Only this image's.
    where: { imageId },

    // Only the columns the overlap check needs.
    select: { id: true, x: true, y: true, w: true, h: true },
  });

  // Return the id of the clashing region, or null.
  return findClash({ id, ...box }, existing)?.id ?? null;
}

/** Draw a new box on an image, with your annotation. Any approved user can annotate any image (ADR 0006). */
export async function createAnnotation(input: {
  // The image to annotate.
  imageId: string;

  // The box's position and size.
  region: Region;

  // The annotation text.
  body: string;
}): Promise<Result<{ regionId: string }> | Clash> {
  // Find out who is signed in.
  const author = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!author) return { ok: false, error: SIGNED_OUT };

  // Refuse users who aren't approved.
  if (!author.approved) return { ok: false, error: PENDING_APPROVAL };

  // Clean the region the browser sent.
  const box = parseRegion(input.region);

  // Clean the text.
  const body = String(input.body ?? "").trim();

  // Check the region and the text, reporting the first problem.
  const error = checkRegion(box) ?? checkBody(body);

  // Refuse if there's a problem.
  if (error) return { ok: false, error };

  // Check that the image still exists.
  const image = await db.image.findUnique({ where: { id: String(input.imageId) }, select: { id: true } });

  // Refuse if it doesn't.
  if (!image) return { ok: false, error: "That image no longer exists." };

  // Check the box against the image's other boxes.
  const clashWith = await clashFor(image.id, box);

  // Refuse if it would hide, or be hidden by, another box.
  if (clashWith) return { ok: false, error: OVERLAPS, clashWith };

  // Create the region with its first annotation.
  const region = await db.region.create({
    // The new rows' values.
    data: {
      // The image the box is on.
      imageId: image.id,

      // The box's creator.
      authorId: author.id,

      // The box's x, y, w and h.
      ...box,

      // The first annotation in the box.
      annotations: { create: { authorId: author.id, bodyMarkdown: body } },
    },

    // Only the region's id is needed back.
    select: { id: true },
  });

  // Re-render the image page so the new region shows straight away.
  refresh();

  // Report success with the new region's id.
  return { ok: true, regionId: region.id };
}

/** Add your annotation to an existing box. Each user has at most one annotation per box. */
export async function addAnnotation(input: { regionId: string; body: string }): Promise<Result> {
  // Find out who is signed in.
  const author = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!author) return { ok: false, error: SIGNED_OUT };

  // Refuse users who aren't approved.
  if (!author.approved) return { ok: false, error: PENDING_APPROVAL };

  // Clean the text.
  const body = String(input.body ?? "").trim();

  // Check it.
  const error = checkBody(body);

  // Refuse if it's unacceptable.
  if (error) return { ok: false, error };

  // Check that the box still exists.
  const region = await db.region.findUnique({ where: { id: String(input.regionId) }, select: { id: true } });

  // Refuse if it doesn't.
  if (!region) return { ok: false, error: "That box no longer exists." };

  // Look for an annotation by this user in this box already.
  const mine = await db.annotation.findUnique({
    // The unique pair of region and author.
    where: { regionId_authorId: { regionId: region.id, authorId: author.id } },

    // Only its id is needed.
    select: { id: true },
  });

  // Refuse a second annotation by the same user.
  if (mine) return { ok: false, error: "You've already annotated this box. Edit your annotation instead." };

  // Save the new annotation.
  await db.annotation.create({ data: { regionId: region.id, authorId: author.id, bodyMarkdown: body } });

  // Re-render the page so it shows.
  refresh();

  // Report success.
  return { ok: true };
}

/**
 * Change the text of one of your own annotations, and optionally move its box. Only the box's
 * creator can move it, and only while it holds no one else's annotations.
 */
export async function updateAnnotation(input: { id: string; region?: Region; body: string }): Promise<Result | Clash> {
  // Find out who is signed in.
  const user = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!user) return { ok: false, error: SIGNED_OUT };

  // Refuse users who aren't approved.
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  // Clean the text.
  const body = String(input.body ?? "").trim();

  // Check it.
  const error = checkBody(body);

  // Refuse if it's unacceptable.
  if (error) return { ok: false, error };

  // Find the annotation, but only if this user wrote it.
  const annotation = await db.annotation.findFirst({
    // Match the id and the author.
    where: { id: String(input.id), authorId: user.id },

    // Read its id and a few facts about its box.
    select: { id: true, region: { select: { id: true, imageId: true, authorId: true } } },
  });

  // Refuse if it's missing or someone else's.
  if (!annotation) return { ok: false, error: NOT_YOURS };

  // If the box is to be moved too:
  if (input.region) {
    // Clean the new region.
    const box = parseRegion(input.region);

    // Check it.
    const problem = checkRegion(box);

    // Refuse if it's invalid.
    if (problem) return { ok: false, error: problem };

    // The box being moved.
    const { region } = annotation;

    // Count other people's annotations in the box.
    const others = await db.annotation.count({ where: { regionId: region.id, authorId: { not: user.id } } });

    // Only the box's creator may move it, and only if nobody else has annotated it.
    if (region.authorId !== user.id || others > 0) {
      // Refuse, and explain.
      return {
        // It failed.
        ok: false,
        // Why.
        error: "Only the person who drew this box can move it, while it holds only their annotations.",
      };
    }

    // Check the new position against the other boxes.
    const clashWith = await clashFor(region.imageId, box, region.id);

    // Refuse if it clashes.
    if (clashWith) return { ok: false, error: OVERLAPS, clashWith };

    // Save the new position.
    await db.region.update({ where: { id: region.id }, data: box });
  }

  // Save the new text.
  await db.annotation.update({ where: { id: annotation.id }, data: { bodyMarkdown: body } });

  // Re-render the page so it shows.
  refresh();

  // Report success.
  return { ok: true };
}

/** Delete one of your own annotations. A box left with no annotations goes too. */
export async function deleteAnnotation(id: string): Promise<Result> {
  // Find out who is signed in.
  const user = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!user) return { ok: false, error: SIGNED_OUT };

  // Refuse users who aren't approved.
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  // Find the annotation, but only if this user wrote it.
  const annotation = await db.annotation.findFirst({
    // Match the id and the author.
    where: { id: String(id), authorId: user.id },

    // Read its id and its box's id.
    select: { id: true, regionId: true },
  });

  // Refuse if it's missing or someone else's.
  if (!annotation) return { ok: false, error: NOT_YOURS };

  // Do both deletions together, so either both happen or neither does.
  await db.$transaction([
    // Delete the annotation.
    db.annotation.delete({ where: { id: annotation.id } }),

    // Delete its box if that left it with no annotations.
    db.region.deleteMany({ where: { id: annotation.regionId, annotations: { none: {} } } }),
  ]);

  // Re-render the page so it shows.
  refresh();

  // Report success.
  return { ok: true };
}

/** Change the title and description of one of your own images. */
export async function updateImage(input: { id: string; title: string; description: string }): Promise<Result> {
  // Find out who is signed in.
  const user = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!user) return { ok: false, error: "Sign in to edit images." };

  // Refuse users who aren't approved.
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  // Trim and check the title and description.
  const { title, description, error } = checkDetails(input);

  // Refuse unacceptable details.
  if (error) return { ok: false, error };

  // Update the image, but only if this user owns it.
  const { count } = await db.image.updateMany({
    // Match the id and the owner.
    where: { id: String(input.id), ownerId: user.id },

    // The new values; an empty description is stored as null.
    data: { title, description: description || null },
  });

  // Nothing matched: the image is missing or someone else's.
  if (count === 0) return { ok: false, error: "That image doesn't exist, or isn't yours." };

  // Re-render the page so it shows.
  refresh();

  // Report success.
  return { ok: true };
}

/**
 * Delete one of your own images. Its annotations go with it (including other people's),
 * through the database's cascade. Then the file is removed from R2.
 */
export async function deleteImage(id: string): Promise<Result> {
  // Find out who is signed in.
  const user = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!user) return { ok: false, error: "Sign in to delete images." };

  // Refuse users who aren't approved.
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  // Find the image, but only if this user owns it.
  const image = await db.image.findFirst({
    // Match the id and the owner.
    where: { id: String(id), ownerId: user.id },

    // Read its id and where its file is.
    select: { id: true, storageKey: true },
  });

  // Refuse if it's missing or someone else's.
  if (!image) return { ok: false, error: "That image doesn't exist, or isn't yours." };

  // Delete the row; the database cascades to its regions and annotations.
  await db.image.delete({ where: { id: image.id } });

  // Removing the file can fail, so guard it.
  try {
    // Delete the file from storage.
    await deleteObject(image.storageKey);
  } catch (err) {
    // The row is already gone, so the page is too. A leftover file is the orphan case in
    // docs/architecture.md: log it rather than tell the user the delete failed.
    console.error(`Deleted image ${image.id} but not its file ${image.storageKey}`, err);
  }

  // Send the user to the home page.
  redirect("/");
}
