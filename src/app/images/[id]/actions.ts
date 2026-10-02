"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { checkBody, checkRegion } from "@/lib/annotations";
import type { Region } from "@/lib/regions";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Save a new annotation on an image. Any signed-in user can annotate any image (ADR 0006). */
export async function createAnnotation(input: {
  imageId: string;
  region: Region;
  body: string;
}): Promise<Result<{ id: string }>> {
  const author = await getCurrentUser();
  if (!author) return { ok: false, error: "Sign in to annotate." };

  // Copy only the fields we expect: the browser could send anything.
  const region: Region = {
    x: Number(input.region?.x),
    y: Number(input.region?.y),
    w: Number(input.region?.w),
    h: Number(input.region?.h),
  };
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
