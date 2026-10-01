"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Annotorious,
  ImageAnnotator,
  UserSelectAction,
  useAnnotator,
  useSelection,
  type AnnotoriousImageAnnotator,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";
import { toImageAnnotation } from "@/lib/regions";
import { annotations, image } from "./data";

const noopSubscribe = () => () => {};

const byId =new Map(annotations.map((a) => [a.id, a]));

// Larger regions first, so smaller ones render on top and stay clickable.
const shapes = [...annotations]
  .sort((a, b) => b.region.w * b.region.h - a.region.w * a.region.h)
  .map((a) => toImageAnnotation(a.id, a.region, image.size));

function LoadAnnotations() {
  const anno = useAnnotator<AnnotoriousImageAnnotator>();
  useEffect(() => {
    anno?.setAnnotations(shapes, true);
  }, [anno]);
  return null;
}

function AnnotationPanel() {
  const anno = useAnnotator<AnnotoriousImageAnnotator>();
  const { selected } = useSelection();
  const current = selected[0] && byId.get(selected[0].annotation.id);

  return (
    <aside className="flex flex-col gap-3 lg:w-80 lg:shrink-0">
      {current ? (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-semibold">{current.title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{current.body}</p>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Tap a highlighted region, or pick one below.</p>
      )}
      <ul className="flex flex-wrap gap-2 lg:flex-col">
        {annotations.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => anno?.setSelected(a.id)}
              className={`rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                current?.id === a.id ? "font-semibold" : ""
              }`}
            >
              {a.title}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function AnnotatedImage() {
  // Lets you shrink the image in place to check that regions stay aligned.
  const [widthPct, setWidthPct] = useState(100);
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const plainImage = (
    // eslint-disable-next-line @next/next/no-img-element -- Annotorious needs a plain <img>
    <img
      src={image.src}
      alt={image.title}
      width={image.size.width}
      height={image.size.height}
      className="h-auto w-full"
    />
  );

  return (
    <Annotorious>
      <LoadAnnotations />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <label className="mb-3 flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            Image width
            <input
              type="range"
              min={20}
              max={100}
              value={widthPct}
              onChange={(e) => setWidthPct(Number(e.target.value))}
            />
            {widthPct}%
          </label>
          <div style={{ width: `${widthPct}%` }}>
            {/* ImageAnnotator attaches in the <img> onLoad handler, which never fires if the
                server-rendered image finishes loading before hydration. Mount it client-only. */}
            {isClient ? (
              <ImageAnnotator drawingEnabled={false} userSelectAction={UserSelectAction.SELECT}>
                {plainImage}
              </ImageAnnotator>
            ) : (
              plainImage
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">{image.credit}</p>
        </div>
        <AnnotationPanel />
      </div>
    </Annotorious>
  );
}
