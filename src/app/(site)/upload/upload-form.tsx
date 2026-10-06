"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SimilarImage } from "@/lib/duplicates";
import { ALLOWED_TYPES, DESCRIPTION_MAX, TITLE_MAX, checkFile } from "@/lib/uploads";
import { createImage, discardUpload, requestUpload } from "./actions";

type Status =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "error"; message: string }
  /** The uploaded file matches images already on the site (ADR 0010). It's in R2 but not saved yet. */
  | { kind: "duplicate"; key: string; title: string; description: string; duplicates: SimilarImage[] };

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Release the preview's object URL when it changes or the form unmounts.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setFile(chosen);
    setPreview(chosen ? URL.createObjectURL(chosen) : null);
    const error = chosen && checkFile(chosen.type, chosen.size);
    setStatus(error ? { kind: "error", message: error } : { kind: "idle" });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "");
    const description = String(form.get("description") ?? "");

    const error = checkFile(file.type, file.size);
    if (error) return setStatus({ kind: "error", message: error });

    startTransition(async () => {
      try {
        setStatus({ kind: "working", step: "Preparing upload…" });
        const upload = await requestUpload(file.type, file.size);
        if (!upload.ok) return setStatus({ kind: "error", message: upload.error });

        setStatus({ kind: "working", step: "Uploading…" });
        const put = await fetch(upload.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) return setStatus({ kind: "error", message: "Upload failed. Please try again." });

        setStatus({ kind: "working", step: "Saving…" });
        await save(upload.key, title, description, false);
      } catch {
        setStatus({ kind: "error", message: "Something went wrong. Please try again." });
      }
    });
  }

  /** Create the image. Redirects to its page on success. */
  async function save(key: string, title: string, description: string, allowDuplicate: boolean) {
    const saved = await createImage({ key, title, description, allowDuplicate });
    if (saved.ok) return;
    if ("duplicates" in saved) setStatus({ kind: "duplicate", key, title, description, duplicates: saved.duplicates });
    else setStatus({ kind: "error", message: saved.error });
  }

  /** After the duplicate warning: delete the unsaved upload, then go to `href` or back to the form. */
  function discard(key: string, href?: string) {
    startTransition(async () => {
      try {
        await discardUpload(key);
      } catch {
        // Leaving an unused file behind is the orphan case in docs/architecture.md; carry on.
      }
      if (href) router.push(href);
      else setStatus({ kind: "idle" });
    });
  }

  const busy = isPending || status.kind === "working" || status.kind === "duplicate";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Image</span>
        <input
          type="file"
          name="file"
          required
          accept={Object.keys(ALLOWED_TYPES).join(",")}
          onChange={onFileChange}
          disabled={busy}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm dark:file:bg-zinc-800"
        />
        <span className="text-xs text-zinc-500">JPEG, PNG or WebP, up to 10 MB.</span>
      </label>

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={preview} alt="Preview" className="max-h-80 w-fit max-w-full rounded-md object-contain" />
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Title</span>
        <input
          name="title"
          required
          maxLength={TITLE_MAX}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Description <span className="font-normal text-zinc-500">(optional)</span>
        </span>
        <textarea
          name="description"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="rights" required disabled={busy} className="mt-1" />
        <span>I have the right to share this image publicly.</span>
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy || !file}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Upload
        </button>
        <p role="status" className={`text-sm ${status.kind === "error" ? "text-red-600" : "text-zinc-500"}`}>
          {status.kind === "working" && status.step}
          {status.kind === "error" && status.message}
        </p>
      </div>

      {status.kind === "duplicate" && (
        <DuplicateWarning
          duplicates={status.duplicates}
          pending={isPending}
          onOpen={(id) => discard(status.key, `/images/${id}`)}
          onCancel={() => discard(status.key)}
          onUploadAnyway={() =>
            startTransition(async () => {
              try {
                await save(status.key, status.title, status.description, true);
              } catch {
                setStatus({ kind: "error", message: "Something went wrong. Please try again." });
              }
            })
          }
        />
      )}
    </form>
  );
}

function DuplicateWarning({
  duplicates,
  pending,
  onOpen,
  onCancel,
  onUploadAnyway,
}: {
  duplicates: SimilarImage[];
  pending: boolean;
  onOpen: (id: string) => void;
  onCancel: () => void;
  onUploadAnyway: () => void;
}) {
  const exact = duplicates.some((d) => d.exact);
  return (
    <div role="alert" className="flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
      <div>
        <p className="font-medium">
          {exact ? "This exact image is already here." : "This looks like an image that's already here."}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Annotations work best in one place. Add yours to the existing page, or upload anyway if this is a different
          image.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {duplicates.map((d) => (
          <li key={d.id} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- R2 thumbnail, as on the home page */}
            <img src={d.thumbnail} alt="" className="size-16 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.title}</p>
              <p className="text-xs text-zinc-500">
                {d.annotationCount === 1 ? "1 annotation" : `${d.annotationCount} annotations`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpen(d.id)}
              disabled={pending}
              className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Go to it
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-4 text-sm">
        <button type="button" onClick={onUploadAnyway} disabled={pending} className="hover:underline">
          {pending ? "Working…" : "Upload anyway"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className="hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
