import type { Metadata } from "next";
import { AnnotatedImage } from "./annotated-image";

export const metadata: Metadata = { title: "Spike: region alignment · A Thousand Words" };

// Milestone 1: hard-coded fractional regions that must stay aligned at any size.
export default function SpikePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">The Ambassadors</h1>
      <p className="mb-6 mt-1 text-sm text-zinc-500">
        Spike: regions are stored as fractions of the image size. Resize the window or use the slider; the
        highlights should stay on their subjects.
      </p>
      <AnnotatedImage />
    </main>
  );
}
