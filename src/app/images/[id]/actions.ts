"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PENDING_APPROVAL, getCurrentUser } from "@/lib/current-user";
import { checkBody, checkRegion } from "@/lib/annotations";
import { deleteObject } from "@/lib/storage";
import { checkDetails } from "@/lib/uploads";
import type { Region } from "@/lib/regions";

// Every action checks the session itself: server actions can be called by direct POST.
// Ownership is part of each write's `where`, so checking and writing are one query.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SIGNED_OUT = "Sign in to annotate.";
const NOT_YOURS = "That annotation doesn't exist, or isn't yours.";

/** Copy only the fields we expect: the browser could send anything. */
function parseRegion(input: Partial<Region> | undefined): Region {
  return { x: Number(input?.x), y: Number(input?.y), w: Number(input?.w), h: Number(input?.h) };
}

/** Save a new annotation on an image. Any signed-in user can annotate any image (ADR 0006). */
export async function createAnnotation(input: {
  imageId: string;
  region: Region;
  body: string;
}): Promise<Result<{ id: string }>> {
  const author = await getCurrentUser();
  if (!author) return { ok: false, error: SIGNED_OUT };
  if (!author.approved) return { ok: false, error: PENDING_APPROVAL };

  const region = parseRegion(input.region);
  const body = String(input.body ?? "").trim();
  const error = checkRegion(region) ?? checkBody(body);
  if (error) return { ok: false, error };

  const image = await db.image.findUnique({ where: { id: String(input.imageId) }, select: { id: true } });
  if (!image) return { ok: false, error: "That image no longer exists." };

  const annotation = await db.annotation.create({
    data: { imageId: image.id, authorId: author.id, ...region, bodyMarkdown: body },
    select: { id: true },
  });

  // Re-render the image page so the new region shows straight away.
  refresh();
  return { ok: true, id: annotation.id };
}

/** Change the region and text of one of your own annotations. */
export async function updateAnnotation(input: { id: string; region: Region; body: string }): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  const region = parseRegion(input.region);
  const body = String(input.body ?? "").trim();
  const error = checkRegion(region) ?? checkBody(body);
  if (error) return { ok: false, error };

  const { count } = await db.annotation.updateMany({
    where: { id: String(input.id), authorId: user.id },
    data: { ...region, bodyMarkdown: body },
  });
  if (count === 0) return { ok: false, error: NOT_YOURS };

  refresh();
  return { ok: true };
}

/** Delete one of your own annotations. */
export async function deleteAnnotation(id: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  const { count } = await db.annotation.deleteMany({ where: { id: String(id), authorId: user.id } });
  if (count === 0) return { ok: false, error: NOT_YOURS };

  refresh();
  return { ok: true };
}

/** Change the title and description of one of your own images. */
export async function updateImage(input: { id: string; title: string; description: string }): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to edit images." };
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  const { title, description, error } = checkDetails(input);
  if (error) return { ok: false, error };

  const { count } = await db.image.updateMany({
    where: { id: String(input.id), ownerId: user.id },
    data: { title, description: description || null },
  });
  if (count === 0) return { ok: false, error: "That image doesn't exist, or isn't yours." };

  refresh();
  return { ok: true };
}

/**
 * Delete one of your own images. Its annotations go with it (including other people's),
 * through the database's cascade. Then the file is removed from R2.
 */
export async function deleteImage(id: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to delete images." };
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  const image = await db.image.findFirst({
    where: { id: String(id), ownerId: user.id },
    select: { id: true, storageKey: true },
  });
  if (!image) return { ok: false, error: "That image doesn't exist, or isn't yours." };

  await db.image.delete({ where: { id: image.id } });
  try {
    await deleteObject(image.storageKey);
  } catch (err) {
    // The row is already gone, so the page is too. A leftover file is the orphan case in
    // docs/architecture.md: log it rather than tell the user the delete failed.
    console.error(`Deleted image ${image.id} but not its file ${image.storageKey}`, err);
  }

  redirect("/");
}
