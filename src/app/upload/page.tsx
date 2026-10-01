import type { Metadata } from "next";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Upload · A Thousand Words" };

export default function UploadPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Upload an image</h1>
      <UploadForm />
    </main>
  );
}
