import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/current-user";
import { SignInButton } from "../user-menu";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Upload · A Thousand Words" };

export default async function UploadPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Upload an image</h1>
      {user ? (
        <UploadForm />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">You need an account to upload images.</p>
          <SignInButton redirectTo="/upload" />
        </div>
      )}
    </main>
  );
}
