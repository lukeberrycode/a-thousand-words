"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import {
  Annotorious,
  ImageAnnotator,
  ShapeType,
  UserSelectAction,
  useAnnotator,
  useSelection,
  type AnnotoriousImageAnnotator,
  type ImageAnnotation,
  type RectangleGeometry,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";
import { BODY_MAX, checkBody, checkRegion } from "@/lib/annotations";
import { toFraction, toImageAnnotation, type ImageSize, type Region } from "@/lib/regions";
import { createAnnotation } from "./actions";
import { Markdown } from "./markdown";

export type ImageData = { id: string; src: string; title: string; size: ImageSize };

export type AnnotationData = {
  id: string;
  region: Region;
  body: string;
  authorName: string | null;
};

type Props = {
  image: ImageData;
  annotations: AnnotationData[];
  canAnnotate: boolean;
  /** Shown instead of the Annotate button to signed-out visitors. */
  signInPrompt: ReactNode;
};

const noopSubscribe = () => () => {};

export function AnnotatedImage(props: Props) {
  return (
    <Annotorious>
      <AnnotatedImageInner {...props} />
    </Annotorious>
  );
}

function AnnotatedImageInner({ image, annotations, canAnnotate, signInPrompt }: Props) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>();
  const { selected } = useSelection();
  const [annotating, setAnnotating] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  // The annotation just saved from the current draft.
  const [savedId, setSavedId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(annotations.map((a) => [a.id, a])), [annotations]);

  // Read by Annotorious event handlers, which outlive a single render.
  const savedIds = useRef(new Set<string>());
  const draftRef = useRef<string | null>(null);
  // A just-saved annotation to select once the refreshed page data includes it.
  const selectAfterSave = useRef<string | null>(null);

  // ImageAnnotator attaches in the <img> onLoad handler, which never fires if the
  // server-rendered image finishes loading before hydration. Mount it client-only (ADR 0004).
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  // Show the saved regions. Larger regions go first, so smaller ones render on top and stay clickable.
  useEffect(() => {
    if (!anno) return;
    const shapes = [...annotations]
      .sort((a, b) => b.region.w * b.region.h - a.region.w * a.region.h)
      .map((a) => toImageAnnotation(a.id, a.region, image.size));
    anno.setAnnotations(shapes, true);
    savedIds.current = new Set(byId.keys());
    // Replacing the annotations removed any draft box.
    draftRef.current = null;
    selectSavedIfReady();
    // selectSavedIfReady only reads refs and anno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno, annotations, byId, image.size]);

  // A selected shape that isn't a saved annotation is the box the user just drew.
  // Keep only one draft at a time.
  useEffect(() => {
    if (!anno) return;
    const onSelectionChanged = (selection: ImageAnnotation[]) => {
      const id = selection[0]?.id;
      if (!id || savedIds.current.has(id) || id === draftRef.current) return;
      // Replacing the annotations can report a removed draft as selected; ignore shapes that are gone.
      if (!anno.getAnnotationById(id)) return;
      if (draftRef.current) anno.removeAnnotation(draftRef.current);
      draftRef.current = id;
      setDraftId(id);
      setSavedId(null);
    };
    anno.on("selectionChanged", onSelectionChanged);
    return () => anno.off("selectionChanged", onSelectionChanged);
  }, [anno]);

  function selectSavedIfReady() {
    const id = selectAfterSave.current;
    if (anno && id && savedIds.current.has(id)) {
      anno.setSelected(id);
      selectAfterSave.current = null;
    }
  }

  function discardDraft() {
    if (anno && draftRef.current) anno.removeAnnotation(draftRef.current);
    draftRef.current = null;
    setDraftId(null);
    setSavedId(null);
  }

  function toggleAnnotating() {
    // Also clears a draft left over from the last save.
    discardDraft();
    anno?.cancelSelected();
    setAnnotating(!annotating);
  }

  const selectedId = selected[0]?.annotation.id;
  const current = selectedId ? byId.get(selectedId) : undefined;
  // After saving, keep the draft box and editor until the refreshed page data
  // includes the new annotation, so the region never blinks out.
  const awaitingSaved = savedId !== null && !byId.has(savedId);
  const showDraft = draftId !== null && (savedId === null || awaitingSaved);

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
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex min-h-9 flex-wrap items-center gap-3">
          {canAnnotate ? (
            <>
              <button
                type="button"
                onClick={toggleAnnotating}
                aria-pressed={annotating}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  annotating
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {annotating ? "Done annotating" : "Annotate"}
              </button>
              {annotating && !showDraft && (
                <span className="text-sm text-zinc-500">Drag a box over the part of the image you want to explain.</span>
              )}
            </>
          ) : (
            signInPrompt
          )}
        </div>
        {isClient ? (
          <ImageAnnotator
            drawingEnabled={annotating && !showDraft}
            userSelectAction={(a: ImageAnnotation) =>
              a.id === draftId ? UserSelectAction.EDIT : UserSelectAction.SELECT
            }
          >
            {plainImage}
          </ImageAnnotator>
        ) : (
          plainImage
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
        {showDraft ? (
          <DraftEditor
            key={draftId}
            image={image}
            draftId={draftId}
            saving={awaitingSaved}
            onCancel={discardDraft}
            onSaved={(id) => {
              setAnnotating(false);
              setSavedId(id);
              // The refreshed page data may arrive before or after this point. When it does,
              // replacing the annotations removes the draft box and selects the saved one.
              selectAfterSave.current = id;
              selectSavedIfReady();
            }}
          />
        ) : current ? (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <Markdown>{current.body}</Markdown>
            <p className="mt-3 text-xs text-zinc-500">By {current.authorName ?? "someone"}</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            {annotations.length > 0
              ? "Tap a highlighted region, or pick one below."
              : "No annotations yet."}
          </p>
        )}

        {annotations.length > 0 && (
          <ul className="flex flex-col gap-1">
            {annotations.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => anno?.setSelected(a.id)}
                  className={`w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                    current?.id === a.id ? "font-semibold" : ""
                  }`}
                >
                  {summary(a.body)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function DraftEditor({
  image,
  draftId,
  saving,
  onCancel,
  onSaved,
}: {
  image: ImageData;
  draftId: string;
  saving: boolean;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = isPending || saving;
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Focus without scrolling: on narrow screens the editor sits below the image,
  // and jumping to it would move the box the user just drew out of view.
  useEffect(() => textarea.current?.focus({ preventScroll: true }), []);

  function save() {
    // Read the box as it is now: the user may have moved or resized it since drawing.
    const selector = anno?.getAnnotationById(draftId)?.target.selector;
    if (selector?.type !== ShapeType.RECTANGLE) return setError("Draw a box on the image first.");
    const region = toFraction(selector.geometry as RectangleGeometry, image.size);

    const problem = checkRegion(region) ?? checkBody(body);
    if (problem) return setError(problem);

    startTransition(async () => {
      try {
        const result = await createAnnotation({ imageId: image.id, region, body });
        if (result.ok) onSaved(result.id);
        else setError(result.error);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">What&apos;s in this region?</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={BODY_MAX}
          ref={textarea}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="text-xs text-zinc-500">
          Markdown works: **bold**, _italic_, [links](https://example.com), lists.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-sm hover:underline">
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

/** First line of an annotation as plain-ish text, for the list. */
function summary(body: string) {
  const firstLine = body.split("\n").find((line) => line.trim()) ?? "";
  return firstLine.replace(/[#*_`>\[\]]/g, "").replace(/\(https?:[^)]*\)/g, "").trim() || "Annotation";
}
