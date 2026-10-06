"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import {
  Annotorious,
  ImageAnnotator,
  ShapeType,
  UserSelectAction,
  useAnnotator,
  type AnnotoriousImageAnnotator,
  type DrawingStyle,
  type ImageAnnotation,
  type RectangleGeometry,
  type StoreChangeEvent,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";
import { BODY_MAX, checkBody, checkRegion } from "@/lib/annotations";
import { findClash } from "@/lib/overlap";
import { toFraction, toImageAnnotation, type ImageSize, type Region } from "@/lib/regions";
import { isTextField, useScreenLayout, type ScreenLayout } from "@/lib/use-screen-layout";
import { cardMaxSize, cardSide, placeCard, regionOnScreen, type Edge, type Size } from "@/lib/view-geometry";
import { addAnnotation, createAnnotation, deleteAnnotation, updateAnnotation } from "./actions";
import { Markdown } from "./markdown";
import { UiPanel } from "./ui-panel";
import { useZoomView, type ViewStore } from "./use-zoom-view";

export type ImageData = { id: string; src: string; title: string; size: ImageSize };

export type AnnotationData = {
  id: string;
  body: string;
  authorName: string | null;
  /** Whether the signed-in user wrote it, and so can edit and delete it. */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};

/** A box on the image, with its annotations, oldest first (ADR 0011). */
export type RegionData = {
  id: string;
  region: Region;
  /** Whether the signed-in user can move the box: they drew it, and it holds only their annotations. */
  movable: boolean;
  updatedAt: string;
  annotations: AnnotationData[];
};

type Props = {
  image: ImageData;
  regions: RegionData[];
  canAnnotate: boolean;
  /** Shown instead of the Annotate button to visitors who can't annotate: signed out, or awaiting approval. */
  signInPrompt: ReactNode;
  /** The UI panel's About section: byline, description, image actions, account and report link. */
  about: ReactNode;
};

/**
 * An annotation being edited. `since` is its updatedAt before saving, to tell when fresh data
 * arrives. `movable` says whether its box can be moved too.
 */
type Editing = { regionId: string; annotationId: string; since: string; movable: boolean; saved: boolean };

/** Adding your annotation to an existing box. `saved` once the action succeeds. */
type Adding = { regionId: string; saved: boolean };

// Box styles: the open box stands out; the others stay visible but recede while one is open.
const OPEN_STYLE: DrawingStyle = { stroke: "#facc15", strokeWidth: 3, fill: "#facc15", fillOpacity: 0.15 };
const IDLE_STYLE: DrawingStyle = { stroke: "#ffffff", strokeWidth: 1.5, fillOpacity: 0 };
const RECEDED_STYLE: DrawingStyle = { stroke: "#ffffff", strokeOpacity: 0.45, strokeWidth: 1, fillOpacity: 0 };

const noopSubscribe = () => () => {};

export function AnnotatedImage(props: Props) {
  return (
    <Annotorious>
      <AnnotatedImageInner {...props} />
    </Annotorious>
  );
}

/**
 * The image page's view (docs/enrich-UI.md): the artwork fills the screen and the app owns zoom and
 * pan. Annotations open as cards beside their boxes, and everything else is in the UI panel.
 */
function AnnotatedImageInner({ image, regions, canAnnotate, signInPrompt, about }: Props) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>();
  const [annotating, setAnnotating] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  // The region just saved from the current draft.
  const [savedId, setSavedId] = useState<string | null>(null);
  // An existing box the draft overlaps too much (ADR 0011), checked whenever the draft changes.
  const [draftClash, setDraftClash] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  // The box whose card is open (Rule 4.3). Opened by clicking a box or picking it from the list.
  const [openId, setOpenId] = useState<string | null>(null);
  // Where the draft, or the box being edited, is now: the user may be moving it.
  const [live, setLive] = useState<{ id: string; region: Region } | null>(null);
  const [boxesVisible, setBoxesVisible] = useState(true);
  const [panelEdge, setPanelEdge] = useState<Edge>("end");
  // Bumped to auto-zoom to the box whose card is open (Rule 5.6).
  const [focusRequest, setFocusRequest] = useState(0);
  const requestFocus = () => setFocusRequest((n) => n + 1);

  const layout = useScreenLayout();
  const byId = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  // Read by Annotorious event handlers, which outlive a single render.
  const savedIds = useRef(new Set<string>());
  const draftRef = useRef<string | null>(null);
  const regionsRef = useRef(regions);
  // A region to open once the refreshed page data includes it.
  const selectAfterSave = useRef<string | null>(null);
  // The box whose position to follow as it's moved, and whether a form in the card is open.
  const trackedRef = useRef<string | null>(null);
  const writingRef = useRef(false);
  const openIdRef = useRef<string | null>(null);

  // ImageAnnotator attaches in the <img> onLoad handler, which never fires if the
  // server-rendered image finishes loading before hydration. Mount it client-only (ADR 0004).
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const open = openId ? byId.get(openId) : undefined;

  // After saving, keep the editor until the refreshed page data includes the change, so
  // nothing blinks out or shows stale text.
  const awaitingSaved = savedId !== null && !byId.has(savedId);
  const showDraft = draftId !== null && (savedId === null || awaitingSaved);
  const editedAnnotation = editing
    ? byId.get(editing.regionId)?.annotations.find((a) => a.id === editing.annotationId)
    : undefined;
  const awaitingEdit = editing?.saved === true && editedAnnotation?.updatedAt === editing.since;
  const editingNow = editing && editedAnnotation && (!editing.saved || awaitingEdit) ? editing : null;
  const addingTo = adding ? byId.get(adding.regionId) : undefined;
  const awaitingAdd = adding?.saved === true && !addingTo?.annotations.some((a) => a.mine);
  const addingNow = adding && addingTo && (!adding.saved || awaitingAdd) ? adding : null;

  // While a box can be drawn or moved, dragging on the image does that, so zoom and pan are off
  // (Rules 2.5 and 6.1).
  const boxActive = annotating || showDraft || (editingNow?.movable ?? false);
  const writing = showDraft || editingNow !== null || addingNow !== null;
  const cardOpen = showDraft || editingNow !== null || open !== undefined;

  // The box the open card belongs to, where it is now.
  const anchorId = showDraft ? draftId : (editingNow?.regionId ?? open?.id ?? null);
  const anchorRegion =
    anchorId === null ? null : live?.id === anchorId ? live.region : (byId.get(anchorId)?.region ?? null);

  const { rootRef, stageRef, store, zoomTo } = useZoomView({
    size: image.size,
    layout,
    panel: panelEdge,
    onPanelEdge: setPanelEdge,
    gestures: !boxActive,
  });

  useLayoutEffect(() => {
    trackedRef.current = showDraft ? draftId : editingNow?.movable ? editingNow.regionId : null;
    writingRef.current = writing;
    openIdRef.current = openId;
  });

  // Show the saved regions. Larger regions go first, so smaller ones render on top; clicks go to
  // the smallest box under the pointer anyway (Annotorious's hit-testing, ADR 0011).
  useEffect(() => {
    regionsRef.current = regions;
    if (!anno) return;
    const shapes = [...regions]
      .sort((a, b) => b.region.w * b.region.h - a.region.w * a.region.h)
      .map((r) => toImageAnnotation(r.id, r.region, image.size));
    anno.setAnnotations(shapes, true);
    savedIds.current = new Set(byId.keys());
    // Replacing the annotations removed any draft box.
    draftRef.current = null;
    selectSavedIfReady();
    // selectSavedIfReady only reads refs and anno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno, regions, byId, image.size]);

  useEffect(() => {
    anno?.setVisible(boxesVisible);
  }, [anno, boxesVisible]);

  /** Check the draft box against the saved ones, as it's drawn and whenever it's moved. */
  const checkDraft = useCallback(
    (id: string) => {
      const box = currentRegion(anno, id, image.size);
      const existing = regionsRef.current.map((r) => ({ id: r.id, ...r.region }));
      setDraftClash(box ? (findClash({ id, ...box }, existing)?.id ?? null) : null);
    },
    [anno, image.size],
  );

  useEffect(() => {
    if (!anno) return;
    const onSelectionChanged = (selection: ImageAnnotation[]) => {
      const id = selection[0]?.id;
      if (!id) {
        // A tap on empty image closes the card (Rule 5.10), unless the user is writing in it.
        if (!writingRef.current) setOpenId(null);
        return;
      }
      if (id === draftRef.current) return;
      if (savedIds.current.has(id)) {
        // Auto-zoom to a newly opened box. Selecting the open box again (to edit it) doesn't.
        if (id !== openIdRef.current) requestFocus();
        setOpenId(id);
        // Opening another box closes the add form. This event can arrive after addToExisting
        // opened the form for this same box, so keep it then.
        setAdding((a) => (a?.regionId === id ? a : null));
        return;
      }
      // A selected shape that isn't a saved region is the box the user just drew.
      // Replacing the annotations can report a removed draft as selected; ignore shapes that are gone.
      if (!anno.getAnnotationById(id)) return;
      if (draftRef.current) anno.removeAnnotation(draftRef.current);
      draftRef.current = id;
      setDraftId(id);
      setSavedId(null);
      // Drawing a new box closes the previous card (Rule 6.6), and zooms to the new one (Rule 6.3).
      setOpenId(null);
      setAdding(null);
      const region = currentRegion(anno, id, image.size);
      setLive(region ? { id, region } : null);
      requestFocus();
      checkDraft(id);
    };
    // Follow the draft, or the box being edited, as it's moved or resized. The store reports every
    // change as it happens; Annotorious's updateAnnotation event only fires once it's deselected.
    const store = anno.state.store;
    const onStoreChange = (event: StoreChangeEvent<ImageAnnotation>) => {
      const tracked = trackedRef.current;
      if (!tracked || !event.changes.updated?.some((u) => u.newValue.id === tracked)) return;
      const region = currentRegion(anno, tracked, image.size);
      if (region) setLive({ id: tracked, region });
      if (tracked === draftRef.current) checkDraft(tracked);
    };
    anno.on("selectionChanged", onSelectionChanged);
    store.observe(onStoreChange);
    return () => {
      anno.off("selectionChanged", onSelectionChanged);
      store.unobserve(onStoreChange);
    };
  }, [anno, checkDraft, image.size]);

  // Auto-zoom to the box whose card just opened (Rule 5.6).
  const anchorRef = useRef(anchorRegion);
  useLayoutEffect(() => {
    anchorRef.current = anchorRegion;
  });
  useEffect(() => {
    if (focusRequest > 0 && anchorRef.current) zoomTo(anchorRef.current);
  }, [focusRequest, zoomTo]);

  // When the on-screen keyboard opens over a card being typed into, zoom again within the space
  // left, so the box and the card both stay above it (Rule 8.2).
  const keyboard = layout?.keyboard ?? false;
  useEffect(() => {
    if (keyboard && writing && anchorRef.current) zoomTo(anchorRef.current);
  }, [keyboard, writing, zoomTo]);

  function selectSavedIfReady() {
    const id = selectAfterSave.current;
    if (anno && id && savedIds.current.has(id)) {
      anno.setSelected(id);
      setOpenId(id);
      selectAfterSave.current = null;
    }
  }

  /** Open a box's card, as a click on it would, and zoom to it. */
  function openRegion(id: string) {
    anno?.setSelected(id);
    setOpenId(id);
    setAdding(null);
    setBoxesVisible(true);
    requestFocus();
  }

  function discardDraft() {
    if (anno && draftRef.current) anno.removeAnnotation(draftRef.current);
    draftRef.current = null;
    setDraftId(null);
    setSavedId(null);
    setDraftClash(null);
  }

  /** Put a region's box back where it's stored, undoing unsaved moves. */
  function restoreShape(id: string) {
    const r = byId.get(id);
    if (anno && r) anno.updateAnnotation(toImageAnnotation(r.id, r.region, image.size));
  }

  function stopEditing() {
    if (editingNow) restoreShape(editingNow.regionId);
    setEditing(null);
    setLive(null);
  }

  /** Close the card (its close button, Escape, or a tap on empty image), leaving the view as it is (Rule 5.10). */
  const closeCard = useCallback(() => {
    discardDraft();
    stopEditing();
    setAdding(null);
    setOpenId(null);
    anno?.cancelSelected();
    // discardDraft and stopEditing only use refs, state setters and the current render's data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno, editingNow, byId]);

  useEffect(() => {
    if (!cardOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTextField(document.activeElement)) closeCard();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cardOpen, closeCard]);

  function toggleAnnotating() {
    // Also clears a draft left over from the last save.
    discardDraft();
    stopEditing();
    setAdding(null);
    anno?.cancelSelected();
    // Entering annotate mode shows the boxes (Rule 6.2).
    if (!annotating) setBoxesVisible(true);
    setAnnotating(!annotating);
  }

  function startEditing(region: RegionData, annotation: AnnotationData) {
    if (!anno) return;
    discardDraft();
    setAdding(null);
    setAnnotating(false);
    setEditing({
      regionId: region.id,
      annotationId: annotation.id,
      since: annotation.updatedAt,
      movable: region.movable,
      saved: false,
    });
    // Selected, and editable if movable: the box gets handles to move and resize it.
    anno.setSelected(region.id, region.movable);
  }

  /** Give up on a new box that overlaps an existing one, and add to that one instead. */
  function addToExisting(regionId: string) {
    discardDraft();
    setAnnotating(false);
    openRegion(regionId);
    setAdding({ regionId, saved: false });
  }

  // The box being drawn or edited, or else the open one, stands out. Annotorious re-applies
  // this whenever it changes.
  const highlighted = showDraft ? draftId : (editingNow?.regionId ?? open?.id ?? null);
  const style = useCallback(
    (a: ImageAnnotation) => (a.id === highlighted ? OPEN_STYLE : highlighted ? RECEDED_STYLE : IDLE_STYLE),
    [highlighted],
  );

  const plainImage = (
    // eslint-disable-next-line @next/next/no-img-element -- Annotorious needs a plain <img>
    <img
      src={image.src}
      alt={image.title}
      width={image.size.width}
      height={image.size.height}
      draggable={false}
      className="block size-full max-w-none"
    />
  );

  let card: ReactNode = null;
  if (showDraft) {
    card = (
      <>
        {draftClash && byId.has(draftClash) && (
          <ClashNotice
            onAdd={() => addToExisting(draftClash)}
            onAdjust={() => draftId && anno?.setSelected(draftId, true)}
          />
        )}
        <AnnotationEditor
          key={draftId}
          label="What's in this region?"
          initialBody=""
          saving={awaitingSaved}
          blocked={draftClash !== null}
          onCancel={discardDraft}
          onSave={async (body) => {
            const region = currentRegion(anno, draftId, image.size);
            if (!region) return { ok: false, error: "Draw a box on the image first." };
            const problem = checkRegion(region);
            if (problem) return { ok: false, error: problem };
            const result = await createAnnotation({ imageId: image.id, region, body });
            if (!result.ok) {
              // Someone else's box may have arrived since the page loaded.
              if ("clashWith" in result) setDraftClash(result.clashWith);
              return result;
            }
            // Stay in annotate mode, to draw another box nearby (Rule 6.6).
            setSavedId(result.regionId);
            // The refreshed page data may arrive before or after this point. When it does,
            // replacing the annotations removes the draft box and opens the saved one.
            selectAfterSave.current = result.regionId;
            selectSavedIfReady();
            return result;
          }}
        />
      </>
    );
  } else if (editingNow && editedAnnotation) {
    card = (
      <>
        {editingNow.movable && <p className="text-sm text-zinc-500">Drag the box or its corners to adjust it.</p>}
        <AnnotationEditor
          key={editingNow.annotationId}
          label="Edit annotation"
          initialBody={editedAnnotation.body}
          saving={awaitingEdit}
          onCancel={() => {
            stopEditing();
            openRegion(editingNow.regionId);
          }}
          onSave={async (body) => {
            let region: Region | undefined;
            if (editingNow.movable) {
              const box = currentRegion(anno, editingNow.regionId, image.size);
              if (!box) return { ok: false, error: "Select the box on the image first." };
              const problem = checkRegion(box);
              if (problem) return { ok: false, error: problem };
              region = box;
            }
            const result = await updateAnnotation({ id: editingNow.annotationId, region, body });
            if (result.ok) {
              setEditing({ ...editingNow, saved: true });
              selectAfterSave.current = editingNow.regionId;
            }
            return result;
          }}
        />
      </>
    );
  } else if (open) {
    card = (
      <RegionCard
        key={open.id}
        region={open}
        canAdd={canAnnotate && !open.annotations.some((a) => a.mine)}
        adding={addingNow !== null && addingNow.regionId === open.id}
        addSaving={awaitingAdd}
        onStartAdd={() => setAdding({ regionId: open.id, saved: false })}
        onCancelAdd={() => setAdding(null)}
        onAdd={async (body) => {
          const result = await addAnnotation({ regionId: open.id, body });
          if (result.ok) setAdding({ regionId: open.id, saved: true });
          return result;
        }}
        onEdit={(a) => startEditing(open, a)}
      />
    );
  }

  return (
    <>
      <div
        ref={rootRef}
        className={`fixed inset-0 touch-none select-none overflow-hidden bg-neutral-900 ${
          boxActive ? "cursor-crosshair" : "cursor-grab data-dragging:cursor-grabbing"
        }`}
      >
        {/* Sized and positioned as the image by useZoomView; hidden until it's measured the screen. */}
        <div ref={stageRef} className="invisible absolute left-0 top-0">
          {isClient ? (
            <ImageAnnotator
              containerClassName="size-full"
              drawingEnabled={annotating && !showDraft}
              style={style}
              userSelectAction={(a: ImageAnnotation) =>
                a.id === draftId || (a.id === editingNow?.regionId && editingNow.movable)
                  ? UserSelectAction.EDIT
                  : UserSelectAction.SELECT
              }
            >
              {plainImage}
            </ImageAnnotator>
          ) : (
            plainImage
          )}
          {/* Keyboard access to the boxes, in list order: Tab moves through them, Enter opens one. */}
          {boxesVisible &&
            regions.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openRegion(r.id)}
                aria-label={`Annotation: ${summary(r.annotations[0]?.body ?? "")}`}
                style={{
                  left: `${r.region.x * 100}%`,
                  top: `${r.region.y * 100}%`,
                  width: `${r.region.w * 100}%`,
                  height: `${r.region.h * 100}%`,
                }}
                className="pointer-events-none absolute opacity-0 outline-2 outline-offset-2 outline-sky-400 focus-visible:opacity-100 focus-visible:outline"
              />
            ))}
        </div>
      </div>

      {layout && (
        <UiPanel
          layout={layout}
          edge={panelEdge}
          hidden={cardOpen}
          onFlip={() => setPanelEdge(panelEdge === "start" ? "end" : "start")}
          title={image.title}
          annotate={
            canAnnotate ? (
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
            ) : (
              signInPrompt
            )
          }
          hint={annotating ? "Drag a box over the part of the image you want to explain." : null}
          entries={regions.map((r) => ({
            id: r.id,
            label: summary(r.annotations[0]?.body ?? ""),
            more: r.annotations.length - 1,
          }))}
          onPick={openRegion}
          boxesVisible={boxesVisible}
          onToggleBoxes={() => setBoxesVisible(!boxesVisible)}
          about={about}
        />
      )}

      {layout && card && anchorRegion && (
        <FloatingCard store={store} layout={layout} region={anchorRegion} size={image.size} onClose={closeCard}>
          {card}
        </FloatingCard>
      )}
    </>
  );
}

/** The stored-format region of a box as it is now: the user may have moved or resized it. */
function currentRegion(anno: AnnotoriousImageAnnotator | undefined, id: string | null, size: ImageSize) {
  const selector = id ? anno?.getAnnotationById(id)?.target.selector : undefined;
  if (selector?.type !== ShapeType.RECTANGLE) return null;
  return toFraction(selector.geometry as RectangleGeometry, size);
}

/**
 * A card floating beside its box (Rule 5): a constant size on screen, inside the visible area, and
 * following the box as the view moves. If it has to cover the box, its background turns
 * translucent so both stay readable (Rule 5.7).
 */
function FloatingCard({
  store,
  layout,
  region,
  size,
  onClose,
  children,
}: {
  store: ViewStore;
  layout: ScreenLayout;
  region: Region;
  size: ImageSize;
  onClose: () => void;
  children: ReactNode;
}) {
  const view = useSyncExternalStore(store.subscribe, store.get, store.get);
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setMeasured({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { area, orientation, keyboard } = layout;
  const max = cardMaxSize(area, orientation);
  const place = measured
    ? placeCard(regionOnScreen(region, size, view), measured, area, orientation, cardSide(region, orientation), keyboard)
    : null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Annotation"
      style={{
        left: place?.x ?? 0,
        top: place?.y ?? 0,
        width: max.w,
        maxHeight: max.h,
        visibility: place ? "visible" : "hidden",
      }}
      className={`fixed z-30 flex touch-pan-y flex-col overflow-hidden rounded-xl text-zinc-900 shadow-xl dark:text-zinc-100 ${
        place?.overlap ? "bg-white/80 backdrop-blur-md dark:bg-zinc-900/80" : "bg-white dark:bg-zinc-900"
      }`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-1.5 top-1.5 z-10 grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-4 pr-10">{children}</div>
    </div>
  );
}

/** Shown while a new box overlaps an existing one too much (ADR 0011). */
function ClashNotice({ onAdd, onAdjust }: { onAdd: () => void; onAdjust: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
      <p>
        This box overlaps an existing one too much: one of them would be hard to click. Add to that annotation instead,
        or adjust your box.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add to that annotation
        </button>
        <button type="button" onClick={onAdjust} className="hover:underline">
          Adjust my box
        </button>
      </div>
    </div>
  );
}

/** A box's annotations, oldest first, with a form to add yours. */
function RegionCard({
  region,
  canAdd,
  adding,
  addSaving,
  onStartAdd,
  onCancelAdd,
  onAdd,
  onEdit,
}: {
  region: RegionData;
  /** Whether the user can annotate, and hasn't annotated this box yet. */
  canAdd: boolean;
  adding: boolean;
  addSaving: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onAdd: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onEdit: (annotation: AnnotationData) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {region.annotations.map((a) => (
        <AnnotationItem key={a.id} annotation={a} onEdit={() => onEdit(a)} />
      ))}
      {adding ? (
        <AnnotationEditor
          label="Add your annotation"
          initialBody=""
          saving={addSaving}
          onCancel={onCancelAdd}
          onSave={onAdd}
        />
      ) : (
        canAdd && (
          <button type="button" onClick={onStartAdd} className="self-start text-sm font-medium hover:underline">
            + Add your annotation
          </button>
        )
      )}
    </div>
  );
}

function AnnotationItem({ annotation: a, onEdit }: { annotation: AnnotationData; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const edited = Date.parse(a.updatedAt) - Date.parse(a.createdAt) > 1000;

  function remove() {
    startTransition(async () => {
      try {
        // On success the refreshed page data no longer has this annotation, so it goes.
        const result = await deleteAnnotation(a.id);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="border-zinc-200 pt-4 first:pt-0 dark:border-zinc-800 [&:not(:first-child)]:border-t">
      <Markdown>{a.body}</Markdown>
      <p className="mt-3 text-xs text-zinc-500">
        By {a.authorName ?? "someone"} · {formatDate(a.createdAt)}
        {edited && " · edited"}
      </p>
      {a.mine &&
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
  blocked = false,
  onCancel,
  onSave,
}: {
  label: string;
  initialBody: string;
  /** Saved, and waiting for the refreshed page data. */
  saving: boolean;
  /** Saving isn't allowed yet, e.g. while the box overlaps another. */
  blocked?: boolean;
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
        setError(result.ok ? null : result.error);
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
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{label}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={BODY_MAX}
          ref={textarea}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <span className="text-xs text-zinc-500">
          Markdown works: **bold**, _italic_, [links](https://example.com), lists.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || blocked || !body.trim()}
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

/** First line of an annotation as plain-ish text, for the list and box labels. */
function summary(body: string) {
  const firstLine = body.split("\n").find((line) => line.trim()) ?? "";
  return firstLine.replace(/[#*_`>\[\]]/g, "").replace(/\(https?:[^)]*\)/g, "").trim() || "Annotation";
}
