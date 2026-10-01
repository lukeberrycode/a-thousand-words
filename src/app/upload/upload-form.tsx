"use client";

import { useEffect, useState, useTransition } from "react";
import { ALLOWED_TYPES, DESCRIPTION_MAX, TITLE_MAX, checkFile } from "@/lib/uploads";
import { createImage, requestUpload } from "./actions";

type Status = { kind: "idle" } | { kind: "working"; step: string } | { kind: "error"; message: string };

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

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
        // Redirects to the new image page on success.
        const saved = await createImage({ key: upload.key, title, description });
        if (!saved.ok) setStatus({ kind: "error", message: saved.error });
      } catch {
        setStatus({ kind: "error", message: "Something went wrong. Please try again." });
      }
    });
  }

  const busy = isPending || status.kind === "working";

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
    </form>
  );
}
