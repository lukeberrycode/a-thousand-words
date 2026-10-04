"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PENDING_APPROVAL, getCurrentUser } from "@/lib/current-user";
import { checkBody, checkRegion } from "@/lib/annotations";
import { findClash } from "@/lib/overlap";
import { deleteObject } from "@/lib/storage";
import { checkDetails } from "@/lib/uploads";
import type { Region } from "@/lib/regions";

// Every action checks the session itself: server actions can be called by direct POST.
// Ownership is part of each lookup's `where`, so other people's content is never found.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** A save refused because the box overlaps `clashWith`, an existing region (ADR 0011). */
export type Clash = { ok: false; error: string; clashWith: string };

const SIGNED_OUT = "Sign in to annotate.";
const NOT_YOURS = "That annotation doesn't exist, or isn't yours.";
const OVERLAPS =
  "This box overlaps an existing one too much: one of them would be hard to click. Add to that annotation instead, or adjust your box.";

/** Copy only the fields we expect: the browser could send anything. */
function parseRegion(input: Partial<Region> | undefined): Region {
  return { x: Number(input?.x), y: Number(input?.y), w: Number(input?.w), h: Number(input?.h) };
}

/** The image's region the box would clash with, if any. `id` is the region being moved, if any. */
async function clashFor(imageId: string, box: Region, id = "new"): Promise<string | null> {
  const existing = await db.region.findMany({
    where: { imageId },
    select: { id: true, x: true, y: true, w: true, h: true },
  });
  return findClash({ id, ...box }, existing)?.id ?? null;
}

/** Draw a new box on an image, with your annotation. Any approved user can annotate any image (ADR 0006). */
export async function createAnnotation(input: {
  imageId: string;
  region: Region;
  body: string;
}): Promise<Result<{ regionId: string }> | Clash> {
  const author = await getCurrentUser();
  if (!author) return { ok: false, error: SIGNED_OUT };
  if (!author.approved) return { ok: false, error: PENDING_APPROVAL };

  const box = parseRegion(input.region);
  const body = String(input.body ?? "").trim();
  const error = checkRegion(box) ?? checkBody(body);
  if (error) return { ok: false, error };

  const image = await db.image.findUnique({ where: { id: String(input.imageId) }, select: { id: true } });
  if (!image) return { ok: false, error: "That image no longer exists." };

  const clashWith = await clashFor(image.id, box);
  if (clashWith) return { ok: false, error: OVERLAPS, clashWith };

  const region = await db.region.create({
    data: {
      imageId: image.id,
      authorId: author.id,
      ...box,
      annotations: { create: { authorId: author.id, bodyMarkdown: body } },
    },
    select: { id: true },
  });

  // Re-render the image page so the new region shows straight away.
  refresh();
  return { ok: true, regionId: region.id };
}

/** Add your annotation to an existing box. Each user has at most one annotation per box. */
export async function addAnnotation(input: { regionId: string; body: string }): Promise<Result> {
  const author = await getCurrentUser();
  if (!author) return { ok: false, error: SIGNED_OUT };
  if (!author.approved) return { ok: false, error: PENDING_APPROVAL };

  const body = String(input.body ?? "").trim();
  const error = checkBody(body);
  if (error) return { ok: false, error };

  const region = await db.region.findUnique({ where: { id: String(input.regionId) }, select: { id: true } });
  if (!region) return { ok: false, error: "That box no longer exists." };

  const mine = await db.annotation.findUnique({
    where: { regionId_authorId: { regionId: region.id, authorId: author.id } },
    select: { id: true },
  });
  if (mine) return { ok: false, error: "You've already annotated this box. Edit your annotation instead." };

  await db.annotation.create({ data: { regionId: region.id, authorId: author.id, bodyMarkdown: body } });
  refresh();
  return { ok: true };
}

/**
 * Change the text of one of your own annotations, and optionally move its box. Only the box's
 * creator can move it, and only while it holds no one else's annotations.
 */
export async function updateAnnotation(input: { id: string; region?: Region; body: string }): Promise<Result | Clash> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  const body = String(input.body ?? "").trim();
  const error = checkBody(body);
  if (error) return { ok: false, error };

  const annotation = await db.annotation.findFirst({
    where: { id: String(input.id), authorId: user.id },
    select: { id: true, region: { select: { id: true, imageId: true, authorId: true } } },
  });
  if (!annotation) return { ok: false, error: NOT_YOURS };

  if (input.region) {
    const box = parseRegion(input.region);
    const problem = checkRegion(box);
    if (problem) return { ok: false, error: problem };
    const { region } = annotation;
    const others = await db.annotation.count({ where: { regionId: region.id, authorId: { not: user.id } } });
    if (region.authorId !== user.id || others > 0) {
      return { ok: false, error: "Only the person who drew this box can move it, while it holds only their annotations." };
    }
    const clashWith = await clashFor(region.imageId, box, region.id);
    if (clashWith) return { ok: false, error: OVERLAPS, clashWith };
    await db.region.update({ where: { id: region.id }, data: box });
  }

  await db.annotation.update({ where: { id: annotation.id }, data: { bodyMarkdown: body } });
  refresh();
  return { ok: true };
}

/** Delete one of your own annotations. A box left with no annotations goes too. */
export async function deleteAnnotation(id: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  const annotation = await db.annotation.findFirst({
    where: { id: String(id), authorId: user.id },
    select: { id: true, regionId: true },
  });
  if (!annotation) return { ok: false, error: NOT_YOURS };

  await db.$transaction([
    db.annotation.delete({ where: { id: annotation.id } }),
    db.region.deleteMany({ where: { id: annotation.regionId, annotations: { none: {} } } }),
  ]);

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
