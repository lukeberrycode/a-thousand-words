"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import {
  Annotorious,
  ImageAnnotator,
  ShapeType,
  UserSelectAction,
  useAnnotator,
  useHover,
  useSelection,
  type AnnotoriousImageAnnotator,
  type ImageAnnotation,
  type RectangleGeometry,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";
import { BODY_MAX, checkBody, checkRegion } from "@/lib/annotations";
import { toFraction, toImageAnnotation, type ImageSize, type Region } from "@/lib/regions";
import { createAnnotation, deleteAnnotation, updateAnnotation } from "./actions";
import { Markdown } from "./markdown";

export type ImageData = { id: string; src: string; title: string; size: ImageSize };

export type AnnotationData = {
  id: string;
  region: Region;
  body: string;
  authorName: string | null;
  /** Whether the signed-in user wrote it, and so can edit and delete it. */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  image: ImageData;
  annotations: AnnotationData[];
  canAnnotate: boolean;
  /** Shown instead of the Annotate button to visitors who can't annotate: signed out, or awaiting approval. */
  signInPrompt: ReactNode;
};

/** An annotation being edited. `since` is its updatedAt before saving, to tell when fresh data arrives. */
type Editing = { id: string; since: string; saved: boolean };

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
  const hovered = useHover();
  const [annotating, setAnnotating] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  // The annotation just saved from the current draft.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const byId = useMemo(() => new Map(annotations.map((a) => [a.id, a])), [annotations]);

  // Read by Annotorious event handlers, which outlive a single render.
  const savedIds = useRef(new Set<string>());
  const draftRef = useRef<string | null>(null);
  // An annotation to select once the refreshed page data includes it.
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

  /** Put an annotation's box back where it's stored, undoing unsaved moves. */
  function restoreShape(id: string) {
    const a = byId.get(id);
    if (anno && a) anno.updateAnnotation(toImageAnnotation(a.id, a.region, image.size));
  }

  function stopEditing() {
    if (editingNow) restoreShape(editingNow.id);
    setEditing(null);
  }

  function toggleAnnotating() {
    // Also clears a draft left over from the last save.
    discardDraft();
    stopEditing();
    anno?.cancelSelected();
    setAnnotating(!annotating);
  }

  function startEditing(id: string) {
    const a = byId.get(id);
    if (!anno || !a) return;
    discardDraft();
    setAnnotating(false);
    setEditing({ id, since: a.updatedAt, saved: false });
    // Selected and editable: the box gets handles to move and resize it.
    anno.setSelected(id, true);
  }

  const selectedId = selected[0]?.annotation.id;
  const current = selectedId ? byId.get(selectedId) : undefined;
  // Hovering previews an annotation; clicking pins it.
  const shown = (hovered && byId.get(hovered.id)) || current;

  // After saving, keep the box and editor until the refreshed page data includes the
  // change, so nothing blinks out or shows stale text.
  const awaitingSaved = savedId !== null && !byId.has(savedId);
  const showDraft = draftId !== null && (savedId === null || awaitingSaved);
  const awaitingEdit = editing?.saved === true && byId.get(editing.id)?.updatedAt === editing.since;
  const editingNow = editing && byId.has(editing.id) && (!editing.saved || awaitingEdit) ? editing : null;

  // While a box can be drawn or moved, dragging on the image must do that rather than
  // scroll the page. Matters on touch screens (mobile annotate mode).
  const boxActive = annotating || showDraft || editingNow !== null;

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
              {editingNow && <span className="text-sm text-zinc-500">Drag the box or its corners to adjust it.</span>}
            </>
          ) : (
            signInPrompt
          )}
        </div>
        <div style={boxActive ? { touchAction: "none" } : undefined}>
          {isClient ? (
            <ImageAnnotator
              drawingEnabled={annotating && !showDraft}
              userSelectAction={(a: ImageAnnotation) =>
                a.id === draftId || a.id === editingNow?.id ? UserSelectAction.EDIT : UserSelectAction.SELECT
              }
            >
              {plainImage}
            </ImageAnnotator>
          ) : (
            plainImage
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
        {showDraft ? (
          <EditorSheet>
            <AnnotationEditor
              key={draftId}
              label="What's in this region?"
              initialBody=""
              saving={awaitingSaved}
              onCancel={discardDraft}
              onSave={async (body) => {
                const region = currentRegion(anno, draftId, image.size);
                if (!region) return { ok: false, error: "Draw a box on the image first." };
                const problem = checkRegion(region);
                if (problem) return { ok: false, error: problem };
                const result = await createAnnotation({ imageId: image.id, region, body });
                if (result.ok) {
                  setAnnotating(false);
                  setSavedId(result.id);
                  // The refreshed page data may arrive before or after this point. When it does,
                  // replacing the annotations removes the draft box and selects the saved one.
                  selectAfterSave.current = result.id;
                  selectSavedIfReady();
                }
                return result;
              }}
            />
          </EditorSheet>
        ) : editingNow ? (
          <EditorSheet>
            <AnnotationEditor
              key={editingNow.id}
              label="Edit annotation"
              initialBody={byId.get(editingNow.id)?.body ?? ""}
              saving={awaitingEdit}
              onCancel={() => {
                stopEditing();
                anno?.setSelected(editingNow.id);
              }}
              onSave={async (body) => {
                const region = currentRegion(anno, editingNow.id, image.size);
                if (!region) return { ok: false, error: "Select the box on the image first." };
                const problem = checkRegion(region);
                if (problem) return { ok: false, error: problem };
                const result = await updateAnnotation({ id: editingNow.id, region, body });
                if (result.ok) {
                  setEditing({ ...editingNow, saved: true });
                  selectAfterSave.current = editingNow.id;
                }
                return result;
              }}
            />
          </EditorSheet>
        ) : shown ? (
          <AnnotationCard
            key={shown.id}
            annotation={shown}
            // Edit and Delete only for a pinned annotation, not a hover preview.
            actions={shown.id === current?.id && shown.mine}
            onEdit={() => startEditing(shown.id)}
          />
        ) : (
          <p className="text-sm text-zinc-500">
            {annotations.length > 0
              ? "Hover over or tap a highlighted region, or pick one below."
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

/** The stored-format region of a box as it is now: the user may have moved or resized it. */
function currentRegion(anno: AnnotoriousImageAnnotator | undefined, id: string, size: ImageSize) {
  const selector = anno?.getAnnotationById(id)?.target.selector;
  if (selector?.type !== ShapeType.RECTANGLE) return null;
  return toFraction(selector.geometry as RectangleGeometry, size);
}

/**
 * On narrow screens the editor sits fixed at the bottom of the screen, so the box being
 * drawn stays in view above it. From the lg breakpoint it sits in the side panel.
 */
function EditorSheet({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 max-h-[55vh] overflow-y-auto border-t border-zinc-200 bg-white p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-zinc-950 lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:lg:bg-transparent">
      {children}
    </div>
  );
}

function AnnotationCard({
  annotation: a,
  actions,
  onEdit,
}: {
  annotation: AnnotationData;
  actions: boolean;
  onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const edited = Date.parse(a.updatedAt) - Date.parse(a.createdAt) > 1000;

  function remove() {
    startTransition(async () => {
      try {
        // On success the refreshed page data no longer has this annotation, so the card goes.
        const result = await deleteAnnotation(a.id);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <Markdown>{a.body}</Markdown>
      <p className="mt-3 text-xs text-zinc-500">
        By {a.authorName ?? "someone"} · {formatDate(a.createdAt)}
        {edited && " · edited"}
      </p>
      {actions &&
        (confirming ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span>Delete this annotation?</span>
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="rounded-md bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
            >
              {isPending ? "Deleting…" : "Delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={isPending} className="hover:underline">
              Keep
            </button>
          </div>
        ) : (
          <div className="mt-3 flex gap-4 text-sm">
            <button type="button" onClick={onEdit} className="hover:underline">
              Edit
            </button>
            <button type="button" onClick={() => setConfirming(true)} className="text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function AnnotationEditor({
  label,
  initialBody,
  saving,
  onCancel,
  onSave,
}: {
  label: string;
  initialBody: string;
  /** Saved, and waiting for the refreshed page data. */
  saving: boolean;
  onCancel: () => void;
  onSave: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = isPending || saving;
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Focus without scrolling, so the box being drawn or edited stays in view.
  useEffect(() => textarea.current?.focus({ preventScroll: true }), []);

  function save() {
    const problem = checkBody(body);
    if (problem) return setError(problem);
    startTransition(async () => {
      try {
        const result = await onSave(body);
        if (!result.ok) setError(result.error);
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
        <span className="text-sm font-medium">{label}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** First line of an annotation as plain-ish text, for the list. */
function summary(body: string) {
  const firstLine = body.split("\n").find((line) => line.trim()) ?? "";
  return firstLine.replace(/[#*_`>\[\]]/g, "").replace(/\(https?:[^)]*\)/g, "").trim() || "Annotation";
}
