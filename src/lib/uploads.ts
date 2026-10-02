// Upload rules shared by the browser form and the server actions.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedType = keyof typeof ALLOWED_TYPES;

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 1000;

export function isAllowedType(type: string): type is AllowedType {
  return type in ALLOWED_TYPES;
}

/** Returns an error message, or null if the file is acceptable. */
export function checkFile(type: string, size: number): string | null {
  if (!isAllowedType(type)) return "Images must be JPEG, PNG or WebP.";
  if (size <= 0) return "That file is empty.";
  if (size > MAX_UPLOAD_BYTES) return "Images must be 10 MB or smaller.";
  return null;
}

/** Trims an image's title and description, and returns an error message if either is unacceptable. */
export function checkDetails(input: { title: string; description: string }) {
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  let error: string | null = null;
  if (!title) error = "Give the image a title.";
  else if (title.length > TITLE_MAX) error = `Titles can be up to ${TITLE_MAX} characters.`;
  else if (description.length > DESCRIPTION_MAX) error = `Descriptions can be up to ${DESCRIPTION_MAX} characters.`;
  return { title, description, error };
}
