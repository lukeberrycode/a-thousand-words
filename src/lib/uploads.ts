// Upload rules shared by the browser form and the server actions.

// The largest file accepted: 10 MB.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// The accepted file types, each with the extension used when storing it.
export const ALLOWED_TYPES = {
  // JPEG files are stored as .jpg.
  "image/jpeg": "jpg",

  // PNG files are stored as .png.
  "image/png": "png",

  // WebP files are stored as .webp.
  "image/webp": "webp",
} as const;

// The union of accepted type strings.
export type AllowedType = keyof typeof ALLOWED_TYPES;

// The longest title, in characters.
export const TITLE_MAX = 120;

// The longest description, in characters.
export const DESCRIPTION_MAX = 1000;

// Narrow a string to an accepted type.
export function isAllowedType(type: string): type is AllowedType {
  // It's accepted if it's one of the keys above.
  return type in ALLOWED_TYPES;
}

/** Returns an error message, or null if the file is acceptable. */
export function checkFile(type: string, size: number): string | null {
  // Refuse types we don't accept.
  if (!isAllowedType(type)) return "Images must be JPEG, PNG or WebP.";

  // Refuse empty files.
  if (size <= 0) return "That file is empty.";

  // Refuse files over the limit.
  if (size > MAX_UPLOAD_BYTES) return "Images must be 10 MB or smaller.";

  // The file is fine.
  return null;
}

/** Trims an image's title and description, and returns an error message if either is unacceptable. */
export function checkDetails(input: { title: string; description: string }) {
  // Turn the title into a trimmed string, treating missing as empty.
  const title = String(input.title ?? "").trim();

  // Do the same for the description.
  const description = String(input.description ?? "").trim();

  // Start with no error.
  let error: string | null = null;

  // A title is required.
  if (!title) error = "Give the image a title.";
  // The title must not be too long.
  else if (title.length > TITLE_MAX) error = `Titles can be up to ${TITLE_MAX} characters.`;
  // The description must not be too long.
  else if (description.length > DESCRIPTION_MAX) error = `Descriptions can be up to ${DESCRIPTION_MAX} characters.`;

  // Return the cleaned values and any error.
  return { title, description, error };
}
