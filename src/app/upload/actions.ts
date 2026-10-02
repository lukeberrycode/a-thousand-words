"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { findSimilarImages, type SimilarImage } from "@/lib/duplicates";
import { fingerprint } from "@/lib/image-hash";
import { deleteObject, headObject, readObject, signedUploadUrl } from "@/lib/storage";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, checkDetails, checkFile, isAllowedType } from "@/lib/uploads";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** createImage's result when the upload matches an image already on the site (ADR 0010). */
export type CreateImageResult = Result<object> | { ok: false; error: "duplicate"; duplicates: SimilarImage[] };

const SIGNED_OUT = "Sign in to upload images.";

const KEY_PATTERN = /^images\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Step 1: validate the file's type and size, and hand back a signed URL to upload it to. */
export async function requestUpload(
  contentType: string,
  size: number,
): Promise<Result<{ key: string; url: string }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT };
  const error = checkFile(contentType, size);
  if (error || !isAllowedType(contentType)) return { ok: false, error: error ?? "Unsupported file." };

  const key = `images/${randomUUID()}.${ALLOWED_TYPES[contentType]}`;
  const url = await signedUploadUrl(key, contentType, size);
  return { ok: true, key, url };
}

/** Step 2: once the browser has uploaded the file, check it and create the Image row. */
export async function createImage(input: {
  key: string;
  title: string;
  description: string;
  /** Set after the user has seen the duplicate warning and chosen to upload anyway. */
  allowDuplicate?: boolean;
}): Promise<CreateImageResult> {
  const owner = await getCurrentUser();
  if (!owner) return { ok: false, error: SIGNED_OUT };

  const { title, description, error } = checkDetails(input);
  if (error) return { ok: false, error };
  if (!KEY_PATTERN.test(input.key)) return { ok: false, error: "Invalid upload." };

  const object = await headObject(input.key);
  if (!object) return { ok: false, error: "The upload didn't arrive. Please try again." };
  if (object.contentLength > MAX_UPLOAD_BYTES || !isAllowedType(object.contentType))
    return { ok: false, error: "Invalid upload." };

  // Read the real pixel size from the file rather than trusting the browser (annotation regions
  // are fractions of it, ADR 0005), and fingerprint it to spot duplicates (ADR 0010).
  let fp;
  try {
    fp = await fingerprint(await readObject(input.key));
  } catch {
    return { ok: false, error: "That file doesn't look like a valid image." };
  }

  // A double submit finds its own row by key; only warn about other images.
  const existing = await db.image.findUnique({ where: { storageKey: input.key }, select: { id: true } });
  if (!existing && !input.allowDuplicate) {
    const duplicates = await findSimilarImages(fp);
    if (duplicates.length > 0) return { ok: false, error: "duplicate", duplicates };
  }

  const image = await db.image.upsert({
    // Upsert keeps a double submit from creating a second row for the same file.
    where: { storageKey: input.key },
    update: {},
    create: {
      ownerId: owner.id,
      title,
      description: description || null,
      storageKey: input.key,
      width: fp.width,
      height: fp.height,
      sha256: fp.sha256,
      phash: fp.phash,
    },
  });

  revalidatePath("/");
  redirect(`/images/${image.id}`);
}

/**
 * Throw away an upload the user decided not to keep after the duplicate warning. Only removes
 * a file under the upload key pattern that no image uses. Upload keys are random UUIDs known
 * only to the browser that requested them.
 */
export async function discardUpload(key: string): Promise<Result<object>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT };
  if (!KEY_PATTERN.test(key)) return { ok: false, error: "Invalid upload." };
  if (await db.image.findUnique({ where: { storageKey: key }, select: { id: true } }))
    return { ok: false, error: "That upload is in use." };
  await deleteObject(key);
  return { ok: true };
}
