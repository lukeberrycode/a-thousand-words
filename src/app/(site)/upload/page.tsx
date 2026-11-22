// Import the type for page metadata.
import type { Metadata } from "next";

// Import the pending-approval message and the current-user lookup.
import { PENDING_APPROVAL, getCurrentUser } from "@/lib/current-user";

// Import the sign-in button.
import { SignInButton } from "../../user-menu";

// Import the upload form.
import { UploadForm } from "./upload-form";

// Set the browser tab title for this page.
export const metadata: Metadata = { title: "Upload · A Thousand Words" };

// The upload page: shows the form, a waiting message, or a sign-in prompt.
export default async function UploadPage() {
  // Find out who is signed in, if anyone.
  const user = await getCurrentUser();

  // Return the page markup.
  return (
    // The main content area, centred and narrow.
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      {/* The page heading. */}
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Upload an image</h1>
      {/* Approved users get the form. */}
      {user?.approved ? (
        // The upload form.
        <UploadForm />
      ) : // Signed-in users who aren't approved yet see a waiting message.
      user ? (
        // A bordered box holding the message.
        <p className="rounded-md border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {/* The waiting-for-approval text. */}
          {PENDING_APPROVAL}
        </p>
      ) : (
        // Visitors who aren't signed in are asked to sign in.
        <div className="flex flex-col items-start gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          {/* Explain why sign-in is needed. */}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">You need an account to upload images.</p>
          {/* The sign-in button, returning here afterwards. */}
          <SignInButton redirectTo="/upload" />
        </div>
      )}
    </main>
  );
}
