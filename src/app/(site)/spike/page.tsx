// Import the type for page metadata.
import type { Metadata } from "next";

// Import the image component with its hard-coded regions.
import { AnnotatedImage } from "./annotated-image";

// Set the browser tab title for this page.
export const metadata: Metadata = { title: "Spike: region alignment · A Thousand Words" };

// Milestone 1: hard-coded fractional regions that must stay aligned at any size.
export default function SpikePage() {
  // Return the page markup.
  return (
    // The main content area, centred and limited in width.
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* The page heading. */}
      <h1 className="text-2xl font-semibold tracking-tight">The Ambassadors</h1>
      {/* A short explanation of what the spike shows. */}
      <p className="mb-6 mt-1 text-sm text-zinc-500">
        Spike: regions are stored as fractions of the image size. Resize the window or use the slider; the highlights
        should stay on their subjects.
      </p>
      {/* The annotated image itself. */}
      <AnnotatedImage />
    </main>
  );
}
