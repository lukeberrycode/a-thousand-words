// Mark this file as client code, since it uses state and event handlers.
"use client";

// Import the React hooks used below.
import { useState, useTransition } from "react";

// Import the length limits.
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/uploads";

// Import the server actions.
import { deleteImage, updateImage } from "./actions";

// What this component is given.
type Props = {
  // The image's id.
  id: string;

  // Its title.
  title: string;

  // Its description, if any.
  description: string | null;

  /** "Uploaded by … on …", formatted on the server. */
  byline: string;

  /** Whether the signed-in user uploaded it, and so can edit and delete it. */
  mine: boolean;

  // How many annotations it has, for the delete warning.
  annotationCount: number;
};

/**
 * The image's byline and description, with edit and delete for its owner, for the UI panel. The
 * title is in the panel's header, but edited here.
 */
export function ImageDetails({ id, title, description, byline, mine, annotationCount }: Props) {
  // Which screen we're on: reading, editing, or confirming a delete.
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");

  // The latest error message, if any.
  const [error, setError] = useState<string | null>(null);

  // Whether a server action is running.
  const [isPending, startTransition] = useTransition();

  // Run a server action, showing any error and calling `then` on success.
  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, then?: () => void) {
    // Clear the old error.
    setError(null);

    // Run the action as a transition, so `isPending` is set while it works.
    startTransition(async () => {
      // The action can throw, so guard it.
      try {
        // Wait for the result.
        const result = await action();

        // On success, do the follow-up, if there is one.
        if (result.ok) then?.();
        // Otherwise show the error.
        else setError(result.error);
      } catch (err) {
        // deleteImage redirects on success, which surfaces here as a navigation, not an error.
        if (isRedirect(err)) throw err;

        // Anything else is a real failure.
        setError("Something went wrong. Please try again.");
      }
    });
  }

  // In edit mode, show the form.
  if (mode === "edit") {
    // Return the form.
    return (
      // The edit form.
      <form
        // Handle submission in the browser.
        onSubmit={(e) => {
          // Stop the browser's own form submission.
          e.preventDefault();

          // Read the form's fields.
          const form = new FormData(e.currentTarget);

          // Save the changes.
          run(
            // The action to run.
            () =>
              // Call the server action with the typed values.
              updateImage({
                // Which image.
                id,
                // The new title.
                title: String(form.get("title") ?? ""),
                // The new description.
                description: String(form.get("description") ?? ""),
              }),
            // On success, go back to reading.
            () => setMode("view"),
          );
        }}
        // Stack the fields.
        className="flex flex-col gap-3"
      >
        {/* The title field and its label. */}
        <label className="flex flex-col gap-1">
          {/* The label text. */}
          <span className="text-sm font-medium">Title</span>
          {/* The title input. */}
          <input
            // Its name in the form data.
            name="title"
            // Start with the current title.
            defaultValue={title}
            // A title is required.
            required
            // Limit its length.
            maxLength={TITLE_MAX}
            // Lock it while saving.
            disabled={isPending}
            // Border and colours, for light and dark.
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {/* The description field and its label. */}
        <label className="flex flex-col gap-1">
          {/* The label text. */}
          <span className="text-sm font-medium">
            Description <span className="font-normal text-zinc-500">(optional)</span>
          </span>
          {/* The description input. */}
          <textarea
            // Its name in the form data.
            name="description"
            // Start with the current description.
            defaultValue={description ?? ""}
            // Three lines tall.
            rows={3}
            // Limit its length.
            maxLength={DESCRIPTION_MAX}
            // Lock it while saving.
            disabled={isPending}
            // Border and colours, for light and dark.
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {/* The buttons. */}
        <div className="flex items-center gap-3">
          {/* The save button. */}
          <button
            // It submits the form.
            type="submit"
            // Lock it while saving.
            disabled={isPending}
            // Dark button with light text, reversed in dark mode.
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {/* Show progress while saving. */}
            {isPending ? "Saving…" : "Save"}
          </button>
          {/* The cancel button. */}
          <button
            // It doesn't submit.
            type="button"
            // Go back to reading.
            onClick={() => setMode("view")}
            // Lock it while saving.
            disabled={isPending}
            // Plain text that underlines on hover.
            className="text-sm hover:underline"
          >
            {/* The button text. */}
            Cancel
          </button>
        </div>
        {/* Show any error. */}
        {error && (
          // The error message, announced to screen readers.
          <p role="alert" className="text-sm text-red-600">
            {/* The error text. */}
            {error}
          </p>
        )}
      </form>
    );
  }

  // Otherwise show the details.
  return (
    // The details block.
    <div>
      {/* The "Uploaded by …" line. */}
      <p className="text-sm text-zinc-500">{byline}</p>
      {/* The description, if there is one. */}
      {description && <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{description}</p>}

      {/* Owner controls, for the owner only. */}
      {mine &&
        // Either the delete confirmation or the two buttons.
        (mode === "confirm-delete" ? (
          // The confirmation box, with a red border.
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-red-200 p-3 text-sm dark:border-red-900">
            {/* The warning text. */}
            <span>
              Delete this image
              {annotationCount > 0 &&
                ` and its ${annotationCount === 1 ? "annotation" : `${annotationCount} annotations`}, including any written by other people`}
              ? This can&apos;t be undone.
            </span>
            {/* The confirm button. */}
            <button
              // It doesn't submit a form.
              type="button"
              // Run the delete.
              onClick={() => run(() => deleteImage(id))}
              // Lock it while deleting.
              disabled={isPending}
              // Red button with white text.
              className="rounded-md bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
            >
              {/* Show progress while deleting. */}
              {isPending ? "Deleting…" : "Delete image"}
            </button>
            {/* The back-out button. */}
            <button type="button" onClick={() => setMode("view")} disabled={isPending} className="hover:underline">
              Keep it
            </button>
          </div>
        ) : (
          // The normal owner buttons.
          <div className="mt-3 flex gap-4 text-sm">
            {/* Switch to the edit form. */}
            <button type="button" onClick={() => setMode("edit")} className="hover:underline">
              Edit details
            </button>
            {/* Ask for delete confirmation. */}
            <button type="button" onClick={() => setMode("confirm-delete")} className="text-red-600 hover:underline">
              Delete image
            </button>
          </div>
        ))}
      {/* Show any error. */}
      {error && (
        // The error message, announced to screen readers.
        <p role="alert" className="mt-2 text-sm text-red-600">
          {/* The error text. */}
          {error}
        </p>
      )}
    </div>
  );
}

/** Next.js signals redirect() by throwing; let it through. */
function isRedirect(err: unknown) {
  // A redirect is an object whose `digest` starts with NEXT_REDIRECT.
  return typeof err === "object" && err !== null && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT");
}
