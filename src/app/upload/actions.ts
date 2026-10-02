"use server";

import { randomUUID } from "node:crypto";
import { imageSize } from "image-size";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { headObject, readObjectStart, signedUploadUrl } from "@/lib/storage";
import {
  ALLOWED_TYPES,
  DESCRIPTION_MAX,
  MAX_UPLOAD_BYTES,
  TITLE_MAX,
  checkFile,
  isAllowedType,
} from "@/lib/uploads";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

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
}): Promise<Result<object>> {
  const owner = await getCurrentUser();
  if (!owner) return { ok: false, error: SIGNED_OUT };

  const title = input.title.trim();
  const description = input.description.trim();
  if (!title) return { ok: false, error: "Give the image a title." };
  if (title.length > TITLE_MAX) return { ok: false, error: `Titles can be up to ${TITLE_MAX} characters.` };
  if (description.length > DESCRIPTION_MAX)
    return { ok: false, error: `Descriptions can be up to ${DESCRIPTION_MAX} characters.` };
  if (!KEY_PATTERN.test(input.key)) return { ok: false, error: "Invalid upload." };

  const object = await headObject(input.key);
  if (!object) return { ok: false, error: "The upload didn't arrive. Please try again." };
  if (object.contentLength > MAX_UPLOAD_BYTES || !isAllowedType(object.contentType))
    return { ok: false, error: "Invalid upload." };

  // Read the real pixel size from the file rather than trusting the browser:
  // annotation regions are fractions of it (ADR 0005).
  const size = await readImageSize(input.key, object.contentLength);
  if (!size) return { ok: false, error: "That file doesn't look like a valid image." };

  const image = await db.image.upsert({
    // Upsert keeps a double submit from creating a second row for the same file.
    where: { storageKey: input.key },
    update: {},
    create: {
      ownerId: owner.id,
      title,
      description: description || null,
      storageKey: input.key,
      width: size.width,
      height: size.height,
    },
  });

  revalidatePath("/");
  redirect(`/images/${image.id}`);
}

async function readImageSize(key: string, contentLength: number) {
  // Dimensions live in the header, so the first 256 KB is almost always enough.
  // Fall back to the whole file (at most 10 MB) if it isn't.
  for (const bytes of [256 * 1024, contentLength]) {
    try {
      const { width, height, orientation } = imageSize(await readObjectStart(key, bytes));
      if (!width || !height) return null;
      // EXIF orientations 5–8 are rotated 90°; browsers display them with width and height swapped.
      return orientation && orientation >= 5 ? { width: height, height: width } : { width, height };
    } catch {
      if (bytes >= contentLength) return null;
    }
  }
  return null;
}
