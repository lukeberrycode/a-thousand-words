// Mark every export of this file as a server action, callable from the browser.
"use server";

// Import a function that makes random UUIDs.
import { randomUUID } from "node:crypto";

// Import the function that sends the browser to another page.
import { redirect } from "next/navigation";

// Import the function that refreshes a cached page.
import { revalidatePath } from "next/cache";

// Import the shared database client.
import { db } from "@/lib/db";

// Import the pending-approval message and the current-user lookup.
import { PENDING_APPROVAL, getCurrentUser } from "@/lib/current-user";

// Import the duplicate search and its result type.
import { findSimilarImages, type SimilarImage } from "@/lib/duplicates";

// Import the function that fingerprints an image.
import { fingerprint } from "@/lib/image-hash";

// Import the storage helpers.
import { deleteObject, headObject, readObject, signedUploadUrl } from "@/lib/storage";

// Import the upload rules.
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, checkDetails, checkFile, isAllowedType } from "@/lib/uploads";

// Either success with some data, or failure with a message.
type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** createImage's result when the upload matches an image already on the site (ADR 0010). */
export type CreateImageResult = Result<object> | { ok: false; error: "duplicate"; duplicates: SimilarImage[] };

// The message for visitors who aren't signed in.
const SIGNED_OUT = "Sign in to upload images.";

// The shape an upload key must have: `images/<uuid>.<ext>`.
const KEY_PATTERN = /^images\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Step 1: validate the file's type and size, and hand back a signed URL to upload it to. */
export async function requestUpload(contentType: string, size: number): Promise<Result<{ key: string; url: string }>> {
  // Find out who is signed in.
  const user = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!user) return { ok: false, error: SIGNED_OUT };

  // Refuse users who aren't approved.
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  // Check the file's type and size.
  const error = checkFile(contentType, size);

  // Refuse files that fail the check (the second test also narrows the type for TypeScript).
  if (error || !isAllowedType(contentType)) return { ok: false, error: error ?? "Unsupported file." };

  // Make a random storage key, with the extension for this type.
  const key = `images/${randomUUID()}.${ALLOWED_TYPES[contentType]}`;

  // Sign a short-lived upload URL for exactly this file.
  const url = await signedUploadUrl(key, contentType, size);

  // Hand back the key and the URL.
  return { ok: true, key, url };
}

/** Step 2: once the browser has uploaded the file, check it and create the Image row. */
export async function createImage(input: {
  // The storage key from step 1.
  key: string;

  // The title the user typed.
  title: string;

  // The description the user typed.
  description: string;

  /** Set after the user has seen the duplicate warning and chosen to upload anyway. */
  allowDuplicate?: boolean;
}): Promise<CreateImageResult> {
  // Find out who is signed in.
  const owner = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!owner) return { ok: false, error: SIGNED_OUT };

  // Refuse users who aren't approved.
  if (!owner.approved) return { ok: false, error: PENDING_APPROVAL };

  // Trim and check the title and description.
  const { title, description, error } = checkDetails(input);

  // Refuse unacceptable details.
  if (error) return { ok: false, error };

  // Refuse keys that don't look like ones we made.
  if (!KEY_PATTERN.test(input.key)) return { ok: false, error: "Invalid upload." };

  // Ask storage about the uploaded file.
  const object = await headObject(input.key);

  // Refuse if nothing arrived.
  if (!object) return { ok: false, error: "The upload didn't arrive. Please try again." };

  // Refuse files that are too big or the wrong type.
  if (object.contentLength > MAX_UPLOAD_BYTES || !isAllowedType(object.contentType))
    // Report an invalid upload.
    return { ok: false, error: "Invalid upload." };

  // Read the real pixel size from the file rather than trusting the browser (annotation regions
  // are fractions of it, ADR 0005), and fingerprint it to spot duplicates (ADR 0010).
  let fp;

  // Reading and decoding can fail, so guard it.
  try {
    // Download the file and fingerprint it.
    fp = await fingerprint(await readObject(input.key));
  } catch {
    // The file couldn't be decoded as an image.
    return { ok: false, error: "That file doesn't look like a valid image." };
  }

  // A double submit finds its own row by key; only warn about other images.
  const existing = await db.image.findUnique({ where: { storageKey: input.key }, select: { id: true } });

  // Look for duplicates unless this is a resubmit or the user already chose to go ahead.
  if (!existing && !input.allowDuplicate) {
    // Find existing images that match or look alike.
    const duplicates = await findSimilarImages(fp);

    // If there are any, hand them back so the form can warn the user.
    if (duplicates.length > 0) return { ok: false, error: "duplicate", duplicates };
  }

  // Create the image row, or find it if it exists already.
  const image = await db.image.upsert({
    // Upsert keeps a double submit from creating a second row for the same file.
    where: { storageKey: input.key },

    // If the row exists, change nothing.
    update: {},

    // Otherwise create it with these values.
    create: {
      // The uploader owns it.
      ownerId: owner.id,

      // The cleaned title.
      title,

      // The cleaned description, or null if empty.
      description: description || null,

      // Where the file is stored.
      storageKey: input.key,

      // The pixel width read from the file.
      width: fp.width,

      // The pixel height read from the file.
      height: fp.height,

      // The exact-file hash.
      sha256: fp.sha256,

      // The look-alike hash.
      phash: fp.phash,
    },
  });

  // Refresh the home page so the new image appears.
  revalidatePath("/");

  // Send the browser to the new image's page.
  redirect(`/images/${image.id}`);
}

/**
 * Throw away an upload the user decided not to keep after the duplicate warning. Only removes
 * a file under the upload key pattern that no image uses. Upload keys are random UUIDs known
 * only to the browser that requested them.
 */
export async function discardUpload(key: string): Promise<Result<object>> {
  // Find out who is signed in.
  const user = await getCurrentUser();

  // Refuse visitors who aren't signed in.
  if (!user) return { ok: false, error: SIGNED_OUT };

  // Refuse users who aren't approved.
  if (!user.approved) return { ok: false, error: PENDING_APPROVAL };

  // Refuse keys that don't look like ones we made.
  if (!KEY_PATTERN.test(key)) return { ok: false, error: "Invalid upload." };

  // Refuse to delete a file that an image row uses.
  if (await db.image.findUnique({ where: { storageKey: key }, select: { id: true } }))
    // Report that it's in use.
    return { ok: false, error: "That upload is in use." };

  // Delete the file from storage.
  await deleteObject(key);

  // Report success.
  return { ok: true };
}
