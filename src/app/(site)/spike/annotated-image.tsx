// Mark this file as client code, since it uses state and browser APIs.
"use client";

// Import the React hooks used below.
import { useEffect, useState, useSyncExternalStore } from "react";

// Import the Annotorious pieces.
import {
  // The provider that holds the annotator.
  Annotorious,
  // The component that wraps an image and adds annotations to it.
  ImageAnnotator,
  // The options for what happens when the user selects an annotation.
  UserSelectAction,
  // The hook that returns the annotator.
  useAnnotator,
  // The hook that returns the current selection.
  useSelection,
  // The annotator's type.
  type AnnotoriousImageAnnotator,
} from "@annotorious/react";

// Import Annotorious's styles.
import "@annotorious/react/annotorious-react.css";

// Import the helper that builds an Annotorious shape from a region.
import { toImageAnnotation } from "@/lib/regions";

// Import the hard-coded annotations and image.
import { annotations, image } from "./data";

// A subscribe function that never fires and does nothing on cleanup.
const noopSubscribe = () => () => {};

// The annotations by id, for quick lookup.
const byId = new Map(annotations.map((a) => [a.id, a]));

// Larger regions first, so smaller ones render on top and stay clickable.
const shapes = [...annotations]
  // Sort by area, largest first.
  .sort((a, b) => b.region.w * b.region.h - a.region.w * a.region.h)
  // Turn each into an Annotorious shape.
  .map((a) => toImageAnnotation(a.id, a.region, image.size));

// Loads the shapes into the annotator. Draws nothing itself.
function LoadAnnotations() {
  // Get the annotator.
  const anno = useAnnotator<AnnotoriousImageAnnotator>();

  // Once the annotator is ready, give it the shapes.
  useEffect(() => {
    // Set the shapes, replacing any that are there.
    anno?.setAnnotations(shapes, true);
  }, [anno]);

  // Nothing to draw.
  return null;
}

// The side panel: the selected annotation's text, and a list of all of them.
function AnnotationPanel() {
  // Get the annotator.
  const anno = useAnnotator<AnnotoriousImageAnnotator>();

  // Get the current selection.
  const { selected } = useSelection();

  // Find the selected annotation's data, if any.
  const current = selected[0] && byId.get(selected[0].annotation.id);

  // Return the panel's markup.
  return (
    // The side panel, beside the image on wide screens.
    <aside className="flex flex-col gap-3 lg:w-80 lg:shrink-0">
      {/* Show the selected annotation, or a hint if none is selected. */}
      {current ? (
        // A bordered card with the annotation.
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          {/* The annotation's title. */}
          <h2 className="font-semibold">{current.title}</h2>
          {/* The annotation's text. */}
          <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{current.body}</p>
        </div>
      ) : (
        // The hint.
        <p className="text-sm text-zinc-500">Tap a highlighted region, or pick one below.</p>
      )}
      {/* The list of all annotations. */}
      <ul className="flex flex-wrap gap-2 lg:flex-col">
        {/* One item per annotation. */}
        {annotations.map((a) => (
          // A list item, keyed by id.
          <li key={a.id}>
            {/* A button that selects this annotation. */}
            <button
              // It doesn't submit a form.
              type="button"
              // Select this annotation when pressed.
              onClick={() => anno?.setSelected(a.id)}
              // Style it, in bold when it's the selected one.
              className={`rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                current?.id === a.id ? "font-semibold" : ""
              }`}
            >
              {/* The annotation's title. */}
              {a.title}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// The spike's image with its regions and side panel.
export function AnnotatedImage() {
  // Lets you shrink the image in place to check that regions stay aligned.
  const [widthPct, setWidthPct] = useState(100);

  // True in the browser, false while rendering on the server.
  const isClient = useSyncExternalStore(
    // Nothing to subscribe to.
    noopSubscribe,
    // In the browser, the answer is true.
    () => true,
    // On the server, the answer is false.
    () => false,
  );

  // The plain image element, used with and without Annotorious.
  const plainImage = (
    // eslint-disable-next-line @next/next/no-img-element -- Annotorious needs a plain <img>
    <img
      // The picture's address.
      src={image.src}
      // Its description for screen readers.
      alt={image.title}
      // Its natural width.
      width={image.size.width}
      // Its natural height.
      height={image.size.height}
      // Scale to the container's width, keeping its shape.
      className="h-auto w-full"
    />
  );

  // Return the markup.
  return (
    // Provide the annotator to everything inside.
    <Annotorious>
      {/* Load the shapes into it. */}
      <LoadAnnotations />
      {/* Image on one side, panel on the other (stacked on small screens). */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* The image column. */}
        <div className="min-w-0 flex-1">
          {/* The width slider and its label. */}
          <label className="mb-3 flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            {/* The label text. */}
            Image width
            {/* The slider. */}
            <input
              // A range slider.
              type="range"
              // Smallest value: 20%.
              min={20}
              // Largest value: 100%.
              max={100}
              // The current value.
              value={widthPct}
              // Store the new value when it moves.
              onChange={(e) => setWidthPct(Number(e.target.value))}
            />
            {/* The current value, as text. */}
            {widthPct}%
          </label>
          {/* The box the image sits in, sized by the slider. */}
          <div style={{ width: `${widthPct}%` }}>
            {/* ImageAnnotator attaches in the <img> onLoad handler, which never fires if the
                server-rendered image finishes loading before hydration. Mount it client-only. */}
            {isClient ? (
              // In the browser, wrap the image in the annotator.
              <ImageAnnotator drawingEnabled={false} userSelectAction={UserSelectAction.SELECT}>
                {/* The image to annotate. */}
                {plainImage}
              </ImageAnnotator>
            ) : (
              // On the server, show the plain image.
              plainImage
            )}
          </div>
          {/* The credit line. */}
          <p className="mt-2 text-xs text-zinc-500">{image.credit}</p>
        </div>
        {/* The side panel. */}
        <AnnotationPanel />
      </div>
    </Annotorious>
  );
}
