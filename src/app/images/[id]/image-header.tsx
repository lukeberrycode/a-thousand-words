"use client";

import { useState, useTransition } from "react";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/uploads";
import { deleteImage, updateImage } from "./actions";

type Props = {
  id: string;
  title: string;
  description: string | null;
  /** "Uploaded by … on …", formatted on the server. */
  byline: string;
  /** Whether the signed-in user uploaded it, and so can edit and delete it. */
  mine: boolean;
  annotationCount: number;
};

/** The image's title, byline and description, with edit and delete for its owner. */
export function ImageHeader({ id, title, description, byline, mine, annotationCount }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, then?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) then?.();
        else setError(result.error);
      } catch (err) {
        // deleteImage redirects on success, which surfaces here as a navigation, not an error.
        if (isRedirect(err)) throw err;
        setError("Something went wrong. Please try again.");
      }
    });
  }

  if (mode === "edit") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          run(
            () =>
              updateImage({
                id,
                title: String(form.get("title") ?? ""),
                description: String(form.get("description") ?? ""),
              }),
            () => setMode("view"),
          );
        }}
        className="flex max-w-2xl flex-col gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Title</span>
          <input
            name="title"
            defaultValue={title}
            required
            maxLength={TITLE_MAX}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Description <span className="font-normal text-zinc-500">(optional)</span>
          </span>
          <textarea
            name="description"
            defaultValue={description ?? ""}
            rows={3}
            maxLength={DESCRIPTION_MAX}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setMode("view")} disabled={isPending} className="text-sm hover:underline">
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-zinc-500">{byline}</p>
      {description && <p className="mt-4 max-w-2xl leading-7 text-zinc-700 dark:text-zinc-300">{description}</p>}

      {mine &&
        (mode === "confirm-delete" ? (
          <div className="mt-3 flex max-w-2xl flex-wrap items-center gap-3 rounded-md border border-red-200 p-3 text-sm dark:border-red-900">
            <span>
              Delete this image
              {annotationCount > 0 &&
                ` and its ${annotationCount === 1 ? "annotation" : `${annotationCount} annotations`}, including any written by other people`}
              ? This can&apos;t be undone.
            </span>
            <button
              type="button"
              onClick={() => run(() => deleteImage(id))}
              disabled={isPending}
              className="rounded-md bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
            >
              {isPending ? "Deleting…" : "Delete image"}
            </button>
            <button type="button" onClick={() => setMode("view")} disabled={isPending} className="hover:underline">
              Keep it
            </button>
          </div>
        ) : (
          <div className="mt-3 flex gap-4 text-sm">
            <button type="button" onClick={() => setMode("edit")} className="hover:underline">
              Edit details
            </button>
            <button type="button" onClick={() => setMode("confirm-delete")} className="text-red-600 hover:underline">
              Delete image
            </button>
          </div>
        ))}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Next.js signals redirect() by throwing; let it through. */
function isRedirect(err: unknown) {
  return typeof err === "object" && err !== null && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT");
}
