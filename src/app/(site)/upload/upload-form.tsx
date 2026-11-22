// Mark this file as client code, since it uses state and event handlers.
"use client";

// Import the React hooks used below.
import { useEffect, useState, useTransition } from "react";

// Import the router hook, used to move to another page.
import { useRouter } from "next/navigation";

// Import the type for an existing look-alike image.
import type { SimilarImage } from "@/lib/duplicates";

// Import the upload rules.
import { ALLOWED_TYPES, DESCRIPTION_MAX, TITLE_MAX, checkFile } from "@/lib/uploads";

// Import the server actions.
import { createImage, discardUpload, requestUpload } from "./actions";

// What the form is doing right now.
type Status =
  // Nothing is happening.
  | { kind: "idle" }
  // An upload is in progress, at the named step.
  | { kind: "working"; step: string }
  // Something went wrong.
  | { kind: "error"; message: string }
  /** The uploaded file matches images already on the site (ADR 0010). It's in R2 but not saved yet. */
  | { kind: "duplicate"; key: string; title: string; description: string; duplicates: SimilarImage[] };

// The upload form.
export function UploadForm() {
  // The file the user chose.
  const [file, setFile] = useState<File | null>(null);

  // A temporary URL for previewing it.
  const [preview, setPreview] = useState<string | null>(null);

  // What the form is doing.
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Whether a server action is running.
  const [isPending, startTransition] = useTransition();

  // The router, for moving to another page.
  const router = useRouter();

  // Release the preview's object URL when it changes or the form unmounts.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  // Runs when the user picks a file.
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    // The chosen file, or null if they cleared it.
    const chosen = e.target.files?.[0] ?? null;

    // Remember it.
    setFile(chosen);

    // Make a preview URL for it, or clear the preview.
    setPreview(chosen ? URL.createObjectURL(chosen) : null);

    // Check the file's type and size.
    const error = chosen && checkFile(chosen.type, chosen.size);

    // Show the problem, or reset to idle.
    setStatus(error ? { kind: "error", message: error } : { kind: "idle" });
  }

  // Runs when the user submits the form.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Stop the browser's own form submission.
    e.preventDefault();

    // Do nothing without a file.
    if (!file) return;

    // Read the form's fields.
    const form = new FormData(e.currentTarget);

    // The typed title.
    const title = String(form.get("title") ?? "");

    // The typed description.
    const description = String(form.get("description") ?? "");

    // Check the file again, in case the earlier check was skipped.
    const error = checkFile(file.type, file.size);

    // Stop with the problem, if there is one.
    if (error) return setStatus({ kind: "error", message: error });

    // Run the upload as a transition, so `isPending` is set while it works.
    startTransition(async () => {
      // Any step can throw, so guard them all.
      try {
        // Show the first step.
        setStatus({ kind: "working", step: "Preparing upload…" });

        // Ask the server for a signed upload URL.
        const upload = await requestUpload(file.type, file.size);

        // Stop if the server refused.
        if (!upload.ok) return setStatus({ kind: "error", message: upload.error });

        // Show the second step.
        setStatus({ kind: "working", step: "Uploading…" });

        // Send the file straight to storage.
        const put = await fetch(upload.url, {
          // Upload with PUT.
          method: "PUT",

          // Declare the type that was signed.
          headers: { "Content-Type": file.type },

          // The file itself.
          body: file,
        });

        // Stop if the upload failed.
        if (!put.ok) return setStatus({ kind: "error", message: "Upload failed. Please try again." });

        // Show the third step.
        setStatus({ kind: "working", step: "Saving…" });

        // Ask the server to create the image.
        await save(upload.key, title, description, false);
      } catch {
        // Show a general error.
        setStatus({ kind: "error", message: "Something went wrong. Please try again." });
      }
    });
  }

  /** Create the image. Redirects to its page on success. */
  async function save(key: string, title: string, description: string, allowDuplicate: boolean) {
    // Ask the server to create it.
    const saved = await createImage({ key, title, description, allowDuplicate });

    // On success the server redirects, so there's nothing more to do.
    if (saved.ok) return;

    // If it found look-alikes, show the warning.
    if ("duplicates" in saved) setStatus({ kind: "duplicate", key, title, description, duplicates: saved.duplicates });
    // Otherwise show the error.
    else setStatus({ kind: "error", message: saved.error });
  }

  /** After the duplicate warning: delete the unsaved upload, then go to `href` or back to the form. */
  function discard(key: string, href?: string) {
    // Run as a transition, so `isPending` is set while it works.
    startTransition(async () => {
      // Deleting can throw, so guard it.
      try {
        // Delete the unsaved file.
        await discardUpload(key);
      } catch {
        // Leaving an unused file behind is the orphan case in docs/architecture.md; carry on.
      }

      // Go to the other page, if there is one...
      if (href) router.push(href);
      // ...otherwise return to the form.
      else setStatus({ kind: "idle" });
    });
  }

  // Whether the form's fields should be locked.
  const busy = isPending || status.kind === "working" || status.kind === "duplicate";

  // Return the form's markup.
  return (
    // The form.
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* The file field and its label. */}
      <label className="flex flex-col gap-2">
        {/* The label text. */}
        <span className="text-sm font-medium">Image</span>
        {/* The file picker. */}
        <input
          // A file chooser.
          type="file"
          // Its name in the form data.
          name="file"
          // A file is required.
          required
          // Offer only the accepted types.
          accept={Object.keys(ALLOWED_TYPES).join(",")}
          // Check the file when one is chosen.
          onChange={onFileChange}
          // Lock it while busy.
          disabled={busy}
          // Style the "Choose file" button.
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm dark:file:bg-zinc-800"
        />
        {/* A reminder of the limits. */}
        <span className="text-xs text-zinc-500">JPEG, PNG or WebP, up to 10 MB.</span>
      </label>

      {/* Show the preview once a file is chosen. */}
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={preview} alt="Preview" className="max-h-80 w-fit max-w-full rounded-md object-contain" />
      )}

      {/* The title field and its label. */}
      <label className="flex flex-col gap-2">
        {/* The label text. */}
        <span className="text-sm font-medium">Title</span>
        {/* The title input. */}
        <input
          // Its name in the form data.
          name="title"
          // A title is required.
          required
          // Limit its length.
          maxLength={TITLE_MAX}
          // Lock it while busy.
          disabled={busy}
          // Border and colours, for light and dark.
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {/* The description field and its label. */}
      <label className="flex flex-col gap-2">
        {/* The label text. */}
        <span className="text-sm font-medium">
          Description <span className="font-normal text-zinc-500">(optional)</span>
        </span>
        {/* The description input. */}
        <textarea
          // Its name in the form data.
          name="description"
          // Three lines tall.
          rows={3}
          // Limit its length.
          maxLength={DESCRIPTION_MAX}
          // Lock it while busy.
          disabled={busy}
          // Border and colours, for light and dark.
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {/* The rights checkbox and its label. */}
      <label className="flex items-start gap-2 text-sm">
        {/* The checkbox; it must be ticked to submit. */}
        <input type="checkbox" name="rights" required disabled={busy} className="mt-1" />
        {/* The statement being agreed to. */}
        <span>I have the right to share this image publicly.</span>
      </label>

      {/* The submit button and the status text. */}
      <div className="flex items-center gap-4">
        {/* The submit button. */}
        <button
          // It submits the form.
          type="submit"
          // Lock it while busy or with no file.
          disabled={busy || !file}
          // Dark button with light text, reversed in dark mode.
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {/* The button text. */}
          Upload
        </button>
        {/* The status line, announced to screen readers; red for errors. */}
        <p role="status" className={`text-sm ${status.kind === "error" ? "text-red-600" : "text-zinc-500"}`}>
          {/* The current step, while working. */}
          {status.kind === "working" && status.step}
          {/* The error message, if there is one. */}
          {status.kind === "error" && status.message}
        </p>
      </div>

      {/* Show the duplicate warning when look-alikes were found. */}
      {status.kind === "duplicate" && (
        // The warning box.
        <DuplicateWarning
          // The existing images found.
          duplicates={status.duplicates}
          // Whether an action is running.
          pending={isPending}
          // Delete the new upload and go to an existing image.
          onOpen={(id) => discard(status.key, `/images/${id}`)}
          // Delete the new upload and return to the form.
          onCancel={() => discard(status.key)}
          // Save the upload anyway.
          onUploadAnyway={() =>
            // Run as a transition, so `pending` is set while it works.
            startTransition(async () => {
              // Saving can throw, so guard it.
              try {
                // Save, telling the server duplicates are fine this time.
                await save(status.key, status.title, status.description, true);
              } catch {
                // Show a general error.
                setStatus({ kind: "error", message: "Something went wrong. Please try again." });
              }
            })
          }
        />
      )}
    </form>
  );
}

// The warning shown when an upload looks like an image already on the site.
function DuplicateWarning({
  // The existing images found.
  duplicates,
  // Whether an action is running.
  pending,
  // Called with an image's id to go to it.
  onOpen,
  // Called to cancel the upload.
  onCancel,
  // Called to save the upload anyway.
  onUploadAnyway,
}: {
  // The existing images found.
  duplicates: SimilarImage[];
  // Whether an action is running.
  pending: boolean;
  // Called with an image's id to go to it.
  onOpen: (id: string) => void;
  // Called to cancel the upload.
  onCancel: () => void;
  // Called to save the upload anyway.
  onUploadAnyway: () => void;
}) {
  // Whether any match is the very same file.
  const exact = duplicates.some((d) => d.exact);

  // Return the warning's markup.
  return (
    // An amber box, announced to screen readers.
    <div
      // Mark it as an alert.
      role="alert"
      // Amber border and background, for light and dark.
      className="flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
    >
      {/* The message block. */}
      <div>
        {/* The headline: exact match or look-alike. */}
        <p className="font-medium">
          {exact ? "This exact image is already here." : "This looks like an image that's already here."}
        </p>
        {/* The advice. */}
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Annotations work best in one place. Add yours to the existing page, or upload anyway if this is a different
          image.
        </p>
      </div>
      {/* The list of matches. */}
      <ul className="flex flex-col gap-3">
        {/* One row per match. */}
        {duplicates.map((d) => (
          // A row with a thumbnail, details and a button.
          <li key={d.id} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- R2 thumbnail, as on the home page */}
            <img src={d.thumbnail} alt="" className="size-16 shrink-0 rounded object-cover" />
            {/* The title and annotation count. */}
            <div className="min-w-0 flex-1">
              {/* The title, cut off if long. */}
              <p className="truncate text-sm font-medium">{d.title}</p>
              {/* How many annotations it has. */}
              <p className="text-xs text-zinc-500">
                {d.annotationCount === 1 ? "1 annotation" : `${d.annotationCount} annotations`}
              </p>
            </div>
            {/* The button that goes to this image. */}
            <button
              // It doesn't submit the form.
              type="button"
              // Go to this image.
              onClick={() => onOpen(d.id)}
              // Lock it while an action runs.
              disabled={pending}
              // Dark button with light text, reversed in dark mode.
              className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {/* The button text. */}
              Go to it
            </button>
          </li>
        ))}
      </ul>
      {/* The two other choices. */}
      <div className="flex flex-wrap gap-4 text-sm">
        {/* Save the upload anyway. */}
        <button type="button" onClick={onUploadAnyway} disabled={pending} className="hover:underline">
          {pending ? "Working…" : "Upload anyway"}
        </button>
        {/* Cancel the upload. */}
        <button type="button" onClick={onCancel} disabled={pending} className="hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
