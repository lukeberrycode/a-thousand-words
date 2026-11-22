// Mark this file as client code, since it uses state and event handlers.
"use client";

// Import the React hooks and types used below.
import {
  // Memoises a function.
  useCallback,
  // Runs code after render.
  useEffect,
  // Runs code after render, before paint.
  useLayoutEffect,
  // Memoises a value.
  useMemo,
  // Holds a value that survives renders.
  useRef,
  // Holds state.
  useState,
  // Reads an external store.
  useSyncExternalStore,
  // Runs an update as a transition.
  useTransition,
  // The type for anything React can render.
  type ReactNode,
} from "react";

// Import the Annotorious pieces.
import {
  // The provider that holds the annotator.
  Annotorious,
  // The component that wraps an image and adds annotations to it.
  ImageAnnotator,
  // The names of shape types.
  ShapeType,
  // The options for what happens when the user selects an annotation.
  UserSelectAction,
  // The hook that returns the annotator.
  useAnnotator,
  // The annotator's type.
  type AnnotoriousImageAnnotator,
  // The type for a box's style.
  type DrawingStyle,
  // The type for one annotation.
  type ImageAnnotation,
  // The type for a rectangle's geometry.
  type RectangleGeometry,
  // The type for a store change event.
  type StoreChangeEvent,
} from "@annotorious/react";

// Import Annotorious's styles.
import "@annotorious/react/annotorious-react.css";

// Import the annotation text and region checks.
import { BODY_MAX, checkBody, checkRegion } from "@/lib/annotations";

// Import the overlap check.
import { findClash } from "@/lib/overlap";

// Import the region conversion helpers and types.
import { toFraction, toImageAnnotation, type ImageSize, type Region } from "@/lib/regions";

// Import the text-field check, the screen layout hook and its type.
import { isTextField, useScreenLayout, type ScreenLayout } from "@/lib/use-screen-layout";

// Import the card geometry helpers and types.
import { cardMaxSize, cardSide, placeCard, regionOnScreen, type Edge, type Size } from "@/lib/view-geometry";

// Import the server actions.
import { addAnnotation, createAnnotation, deleteAnnotation, updateAnnotation } from "./actions";

// Import the safe Markdown renderer.
import { Markdown } from "./markdown";

// Import the UI panel.
import { UiPanel } from "./ui-panel";

// Import the zoom hook and its store type.
import { useZoomView, type ViewStore } from "./use-zoom-view";

// What the page knows about the image.
export type ImageData = { id: string; src: string; title: string; size: ImageSize };

// What the page knows about one annotation.
export type AnnotationData = {
  // The annotation's id.
  id: string;

  // Its Markdown text.
  body: string;

  // Its author's display name, if any.
  authorName: string | null;

  /** Whether the signed-in user wrote it, and so can edit and delete it. */
  mine: boolean;

  // When it was created.
  createdAt: string;

  // When it last changed.
  updatedAt: string;
};

/** A box on the image, with its annotations, oldest first (ADR 0011). */
export type RegionData = {
  // The box's id.
  id: string;

  // Its position and size.
  region: Region;

  /** Whether the signed-in user can move the box: they drew it, and it holds only their annotations. */
  movable: boolean;

  // When it last changed.
  updatedAt: string;

  // Its annotations.
  annotations: AnnotationData[];
};

// What the component is given.
type Props = {
  // The image.
  image: ImageData;

  // Its boxes.
  regions: RegionData[];

  // Whether the user may annotate.
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

// The style for a box when none is open.
const IDLE_STYLE: DrawingStyle = { stroke: "#ffffff", strokeWidth: 1.5, fillOpacity: 0 };

// The style for the other boxes while one is open.
const RECEDED_STYLE: DrawingStyle = { stroke: "#ffffff", strokeOpacity: 0.45, strokeWidth: 1, fillOpacity: 0 };

// A subscribe function that never fires and does nothing on cleanup.
const noopSubscribe = () => () => {};

// The page's top-level component: it provides the annotator to everything inside.
export function AnnotatedImage(props: Props) {
  // Return the markup.
  return (
    // Provide the annotator.
    <Annotorious>
      {/* The real component, which needs the annotator. */}
      <AnnotatedImageInner {...props} />
    </Annotorious>
  );
}

/**
 * The image page's view (docs/enrich-UI.md): the artwork fills the screen and the app owns zoom and
 * pan. Annotations open as cards beside their boxes, and everything else is in the UI panel.
 */
function AnnotatedImageInner({ image, regions, canAnnotate, signInPrompt, about }: Props) {
  // The annotator.
  const anno = useAnnotator<AnnotoriousImageAnnotator>();

  // Whether the user is in annotate mode.
  const [annotating, setAnnotating] = useState(false);

  // The id of the box being drawn, if any.
  const [draftId, setDraftId] = useState<string | null>(null);

  // The region just saved from the current draft.
  const [savedId, setSavedId] = useState<string | null>(null);

  // An existing box the draft overlaps too much (ADR 0011), checked whenever the draft changes.
  const [draftClash, setDraftClash] = useState<string | null>(null);

  // The annotation being edited, if any.
  const [editing, setEditing] = useState<Editing | null>(null);

  // The box the user is adding an annotation to, if any.
  const [adding, setAdding] = useState<Adding | null>(null);

  // The box whose card is open (Rule 4.3). Opened by clicking a box or picking it from the list.
  const [openId, setOpenId] = useState<string | null>(null);

  // Where the draft, or the box being edited, is now: the user may be moving it.
  const [live, setLive] = useState<{ id: string; region: Region } | null>(null);

  // Whether the boxes are shown.
  const [boxesVisible, setBoxesVisible] = useState(true);

  // Which edge the UI panel is on.
  const [panelEdge, setPanelEdge] = useState<Edge>("end");

  // Bumped to auto-zoom to the box whose card is open (Rule 5.6).
  const [focusRequest, setFocusRequest] = useState(0);

  // Ask for an auto-zoom.
  const requestFocus = () => setFocusRequest((n) => n + 1);

  // The measured screen.
  const layout = useScreenLayout();

  // The boxes by id, for quick lookup.
  const byId = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  // Read by Annotorious event handlers, which outlive a single render.
  const savedIds = useRef(new Set<string>());

  // The id of the draft box.
  const draftRef = useRef<string | null>(null);

  // The latest boxes.
  const regionsRef = useRef(regions);

  // A region to open once the refreshed page data includes it.
  const selectAfterSave = useRef<string | null>(null);

  // The box whose position to follow as it's moved, and whether a form in the card is open.
  const trackedRef = useRef<string | null>(null);

  // Whether the user is writing in a card.
  const writingRef = useRef(false);

  // The id of the open box.
  const openIdRef = useRef<string | null>(null);

  // ImageAnnotator attaches in the <img> onLoad handler, which never fires if the
  // server-rendered image finishes loading before hydration. Mount it client-only (ADR 0004).
  const isClient = useSyncExternalStore(
    // Nothing to subscribe to.
    noopSubscribe,
    // In the browser, the answer is true.
    () => true,
    // On the server, the answer is false.
    () => false,
  );

  // The open box's data, if any.
  const open = openId ? byId.get(openId) : undefined;

  // After saving, keep the editor until the refreshed page data includes the change, so
  // nothing blinks out or shows stale text.
  const awaitingSaved = savedId !== null && !byId.has(savedId);

  // Whether to show the draft's editor.
  const showDraft = draftId !== null && (savedId === null || awaitingSaved);

  // The annotation being edited, as it is in the page data.
  const editedAnnotation = editing
    ? byId.get(editing.regionId)?.annotations.find((a) => a.id === editing.annotationId)
    : undefined;

  // Whether an edit has been saved but the page data hasn't caught up.
  const awaitingEdit = editing?.saved === true && editedAnnotation?.updatedAt === editing.since;

  // The edit to show, if any.
  const editingNow = editing && editedAnnotation && (!editing.saved || awaitingEdit) ? editing : null;

  // The box being added to, as it is in the page data.
  const addingTo = adding ? byId.get(adding.regionId) : undefined;

  // Whether an addition has been saved but the page data hasn't caught up.
  const awaitingAdd = adding?.saved === true && !addingTo?.annotations.some((a) => a.mine);

  // The addition to show, if any.
  const addingNow = adding && addingTo && (!adding.saved || awaitingAdd) ? adding : null;

  // While a box can be drawn or moved, dragging on the image does that, so zoom and pan are off
  // (Rules 2.5 and 6.1).
  const boxActive = annotating || showDraft || (editingNow?.movable ?? false);

  // Whether the user is writing in a form.
  const writing = showDraft || editingNow !== null || addingNow !== null;

  // Whether any card is open.
  const cardOpen = showDraft || editingNow !== null || open !== undefined;

  // The box the open card belongs to, where it is now.
  const anchorId = showDraft ? draftId : (editingNow?.regionId ?? open?.id ?? null);

  // That box's position, using its live position while it's being moved.
  const anchorRegion =
    anchorId === null ? null : live?.id === anchorId ? live.region : (byId.get(anchorId)?.region ?? null);

  // Set up zoom and pan.
  const { rootRef, stageRef, store, zoomTo, zoomStep } = useZoomView({
    // The image's size.
    size: image.size,
    // The measured screen.
    layout,
    // Which edge the panel is on.
    panel: panelEdge,
    // Let a pan move the panel.
    onPanelEdge: setPanelEdge,
    // Zoom and pan only when no box is being drawn or moved.
    gestures: !boxActive,
  });

  // After every render, copy the latest state into the refs that event handlers read.
  useLayoutEffect(() => {
    // Track the draft, or the box being moved.
    trackedRef.current = showDraft ? draftId : editingNow?.movable ? editingNow.regionId : null;

    // Note whether a form is open.
    writingRef.current = writing;

    // Note which box is open.
    openIdRef.current = openId;
  });

  // Show the saved regions. Larger regions go first, so smaller ones render on top; clicks go to
  // the smallest box under the pointer anyway (Annotorious's hit-testing, ADR 0011).
  useEffect(() => {
    // Remember the latest boxes.
    regionsRef.current = regions;

    // Wait for the annotator.
    if (!anno) return;

    // Build the shapes, largest first.
    const shapes = [...regions]
      // Sort by area, largest first.
      .sort((a, b) => b.region.w * b.region.h - a.region.w * a.region.h)
      // Turn each into an Annotorious shape.
      .map((r) => toImageAnnotation(r.id, r.region, image.size));

    // Replace what the annotator shows.
    anno.setAnnotations(shapes, true);

    // Remember which ids are saved.
    savedIds.current = new Set(byId.keys());

    // Replacing the annotations removed any draft box.
    draftRef.current = null;

    // Open a box that was waiting for the data, if it's here now.
    selectSavedIfReady();
    // selectSavedIfReady only reads refs and anno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno, regions, byId, image.size]);

  // Show or hide the boxes.
  useEffect(() => {
    // Tell the annotator.
    anno?.setVisible(boxesVisible);
  }, [anno, boxesVisible]);

  /** Check the draft box against the saved ones, as it's drawn and whenever it's moved. */
  const checkDraft = useCallback(
    (id: string) => {
      // The draft's current position.
      const box = currentRegion(anno, id, image.size);

      // The saved boxes, with ids.
      const existing = regionsRef.current.map((r) => ({ id: r.id, ...r.region }));

      // Record which box it clashes with, if any.
      setDraftClash(box ? (findClash({ id, ...box }, existing)?.id ?? null) : null);
    },
    [anno, image.size],
  );

  // Listen to the annotator's events.
  useEffect(() => {
    // Wait for the annotator.
    if (!anno) return;

    // Runs when the selection changes.
    const onSelectionChanged = (selection: ImageAnnotation[]) => {
      // The selected box's id, if any.
      const id = selection[0]?.id;

      // Nothing selected.
      if (!id) {
        // A tap on empty image closes the card (Rule 5.10), unless the user is writing in it.
        if (!writingRef.current) setOpenId(null);

        // Nothing more to do.
        return;
      }

      // The draft itself was selected: nothing changes.
      if (id === draftRef.current) return;

      // A saved box was selected.
      if (savedIds.current.has(id)) {
        // Auto-zoom to a newly opened box. Selecting the open box again (to edit it) doesn't.
        if (id !== openIdRef.current) requestFocus();

        // Open its card.
        setOpenId(id);

        // Opening another box closes the add form. This event can arrive after addToExisting
        // opened the form for this same box, so keep it then.
        setAdding((a) => (a?.regionId === id ? a : null));

        // Nothing more to do.
        return;
      }

      // A selected shape that isn't a saved region is the box the user just drew.
      // Replacing the annotations can report a removed draft as selected; ignore shapes that are gone.
      if (!anno.getAnnotationById(id)) return;

      // Remove any earlier draft.
      if (draftRef.current) anno.removeAnnotation(draftRef.current);

      // Remember the new draft.
      draftRef.current = id;

      // Show its editor.
      setDraftId(id);

      // It isn't saved yet.
      setSavedId(null);

      // Drawing a new box closes the previous card (Rule 6.6), and zooms to the new one (Rule 6.3).
      setOpenId(null);

      // Close any add form.
      setAdding(null);

      // The draft's position.
      const region = currentRegion(anno, id, image.size);

      // Track it as the user adjusts it.
      setLive(region ? { id, region } : null);

      // Zoom to it.
      requestFocus();

      // Check it against the saved boxes.
      checkDraft(id);
    };

    // Follow the draft, or the box being edited, as it's moved or resized. The store reports every
    // change as it happens; Annotorious's updateAnnotation event only fires once it's deselected.
    const store = anno.state.store;

    // Runs when the store changes.
    const onStoreChange = (event: StoreChangeEvent<ImageAnnotation>) => {
      // The box being followed.
      const tracked = trackedRef.current;

      // Ignore changes to other boxes.
      if (!tracked || !event.changes.updated?.some((u) => u.newValue.id === tracked)) return;

      // The box's new position.
      const region = currentRegion(anno, tracked, image.size);

      // Record it.
      if (region) setLive({ id: tracked, region });

      // If it's the draft, check for clashes again.
      if (tracked === draftRef.current) checkDraft(tracked);
    };

    // Listen for selection changes.
    anno.on("selectionChanged", onSelectionChanged);

    // Listen for store changes.
    store.observe(onStoreChange);

    // Return the cleanup function.
    return () => {
      // Stop listening for selection changes.
      anno.off("selectionChanged", onSelectionChanged);

      // Stop listening for store changes.
      store.unobserve(onStoreChange);
    };
  }, [anno, checkDraft, image.size]);

  // Auto-zoom to the box whose card just opened (Rule 5.6).
  const anchorRef = useRef(anchorRegion);

  // Keep the ref up to date.
  useLayoutEffect(() => {
    // Store the latest anchor.
    anchorRef.current = anchorRegion;
  });

  // When a focus is requested, zoom to the anchor.
  useEffect(() => {
    // Zoom if there's a request and an anchor.
    if (focusRequest > 0 && anchorRef.current) zoomTo(anchorRef.current);
  }, [focusRequest, zoomTo]);

  // When the on-screen keyboard opens over a card being typed into, zoom again within the space
  // left, so the box and the card both stay above it (Rule 8.2).
  const keyboard = layout?.keyboard ?? false;

  // Zoom again when the keyboard appears while writing.
  useEffect(() => {
    // Zoom to the anchor.
    if (keyboard && writing && anchorRef.current) zoomTo(anchorRef.current);
  }, [keyboard, writing, zoomTo]);

  // Open the box that was waiting to be shown, once the page data has it.
  function selectSavedIfReady() {
    // The id waiting to be opened.
    const id = selectAfterSave.current;

    // If there is one and the data now has it...
    if (anno && id && savedIds.current.has(id)) {
      // ...select it in the annotator...
      anno.setSelected(id);

      // ...open its card...
      setOpenId(id);

      // ...and stop waiting.
      selectAfterSave.current = null;
    }
  }

  /** Open a box's card, as a click on it would, and zoom to it. */
  function openRegion(id: string) {
    // Select the box in the annotator.
    anno?.setSelected(id);

    // Open its card.
    setOpenId(id);

    // Close any add form.
    setAdding(null);

    // Make sure the boxes are visible.
    setBoxesVisible(true);

    // Zoom to it.
    requestFocus();
  }

  // Throw away the draft box.
  function discardDraft() {
    // Remove it from the annotator.
    if (anno && draftRef.current) anno.removeAnnotation(draftRef.current);

    // Forget it.
    draftRef.current = null;

    // Clear the draft state.
    setDraftId(null);

    // Clear the saved marker.
    setSavedId(null);

    // Clear any clash.
    setDraftClash(null);
  }

  /** Put a region's box back where it's stored, undoing unsaved moves. */
  function restoreShape(id: string) {
    // The stored box.
    const r = byId.get(id);

    // Replace the shape with the stored one.
    if (anno && r) anno.updateAnnotation(toImageAnnotation(r.id, r.region, image.size));
  }

  // Stop editing, undoing any unsaved move.
  function stopEditing() {
    // Put the box back.
    if (editingNow) restoreShape(editingNow.regionId);

    // Clear the edit.
    setEditing(null);

    // Stop following the box.
    setLive(null);
  }

  /** Close the card (its close button, Escape, or a tap on empty image), leaving the view as it is (Rule 5.10). */
  const closeCard = useCallback(() => {
    // Throw away any draft.
    discardDraft();

    // Stop any edit.
    stopEditing();

    // Close any add form.
    setAdding(null);

    // Close the card.
    setOpenId(null);

    // Clear the selection.
    anno?.cancelSelected();
    // discardDraft and stopEditing only use refs, state setters and the current render's data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno, editingNow, byId]);

  // Close the card when Escape is pressed.
  useEffect(() => {
    // Only while a card is open.
    if (!cardOpen) return;

    // Runs when a key is pressed.
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape closes the card, unless the user is typing in a field.
      if (e.key === "Escape" && !isTextField(document.activeElement)) closeCard();
    };

    // Listen for keys.
    window.addEventListener("keydown", onKeyDown);

    // Stop listening on cleanup.
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cardOpen, closeCard]);

  // Turn annotate mode on or off.
  function toggleAnnotating() {
    // Also clears a draft left over from the last save.
    discardDraft();

    // Stop any edit.
    stopEditing();

    // Close any add form.
    setAdding(null);

    // Clear the selection.
    anno?.cancelSelected();

    // Entering annotate mode shows the boxes (Rule 6.2).
    if (!annotating) setBoxesVisible(true);

    // Flip the mode.
    setAnnotating(!annotating);
  }

  // Start editing one of the user's annotations.
  function startEditing(region: RegionData, annotation: AnnotationData) {
    // Wait for the annotator.
    if (!anno) return;

    // Throw away any draft.
    discardDraft();

    // Close any add form.
    setAdding(null);

    // Leave annotate mode.
    setAnnotating(false);

    // Record the edit.
    setEditing({
      // The box.
      regionId: region.id,
      // The annotation.
      annotationId: annotation.id,
      // Its update time before saving.
      since: annotation.updatedAt,
      // Whether the box can be moved too.
      movable: region.movable,
      // Not saved yet.
      saved: false,
    });

    // Selected, and editable if movable: the box gets handles to move and resize it.
    anno.setSelected(region.id, region.movable);
  }

  /** Give up on a new box that overlaps an existing one, and add to that one instead. */
  function addToExisting(regionId: string) {
    // Throw away the draft.
    discardDraft();

    // Leave annotate mode.
    setAnnotating(false);

    // Open the existing box.
    openRegion(regionId);

    // Show the add form in it.
    setAdding({ regionId, saved: false });
  }

  // The box being drawn or edited, or else the open one, stands out. Annotorious re-applies
  // this whenever it changes.
  const highlighted = showDraft ? draftId : (editingNow?.regionId ?? open?.id ?? null);

  // The style function Annotorious uses for each box.
  const style = useCallback(
    // The highlighted box stands out; the rest recede if there is one, and are normal if not.
    (a: ImageAnnotation) => (a.id === highlighted ? OPEN_STYLE : highlighted ? RECEDED_STYLE : IDLE_STYLE),
    [highlighted],
  );

  // The plain image element.
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
      // Don't let the browser start dragging the image.
      draggable={false}
      // Fill the stage.
      className="block size-full max-w-none"
    />
  );

  // The card to show, if any.
  let card: ReactNode = null;

  // While a box is being drawn...
  if (showDraft) {
    // ...show the draft's editor.
    card = (
      // A fragment, so the notice and editor sit together.
      <>
        {/* If the draft clashes with a saved box, say so. */}
        {draftClash && byId.has(draftClash) && (
          // The notice.
          <ClashNotice
            // Add to the other box instead.
            onAdd={() => addToExisting(draftClash)}
            // Go back to adjusting the draft.
            onAdjust={() => draftId && anno?.setSelected(draftId, true)}
          />
        )}
        {/* The text editor. */}
        <AnnotationEditor
          // Start afresh for each draft.
          key={draftId}
          // The label above the text box.
          label="What's in this region?"
          // Start empty.
          initialBody=""
          // Show "Saving…" while waiting for the page data.
          saving={awaitingSaved}
          // Block saving while the box clashes.
          blocked={draftClash !== null}
          // Cancelling throws the draft away.
          onCancel={discardDraft}
          // Save the annotation.
          onSave={async (body) => {
            // The draft's position.
            const region = currentRegion(anno, draftId, image.size);

            // There must be a box.
            if (!region) return { ok: false, error: "Draw a box on the image first." };

            // Check the box.
            const problem = checkRegion(region);

            // Refuse a bad box.
            if (problem) return { ok: false, error: problem };

            // Ask the server to save it.
            const result = await createAnnotation({ imageId: image.id, region, body });

            // If it failed...
            if (!result.ok) {
              // Someone else's box may have arrived since the page loaded.
              if ("clashWith" in result) setDraftClash(result.clashWith);

              // Report the failure.
              return result;
            }

            // Stay in annotate mode, to draw another box nearby (Rule 6.6).
            setSavedId(result.regionId);

            // The refreshed page data may arrive before or after this point. When it does,
            // replacing the annotations removes the draft box and opens the saved one.
            selectAfterSave.current = result.regionId;

            // Open it now if the data is already here.
            selectSavedIfReady();

            // Report success.
            return result;
          }}
        />
      </>
    );
    // While an annotation is being edited...
  } else if (editingNow && editedAnnotation) {
    // ...show its editor.
    card = (
      // A fragment, so the hint and editor sit together.
      <>
        {/* Tell the user how to move the box, if they can. */}
        {editingNow.movable && <p className="text-sm text-zinc-500">Drag the box or its corners to adjust it.</p>}
        {/* The text editor. */}
        <AnnotationEditor
          // Start afresh for each annotation.
          key={editingNow.annotationId}
          // The label above the text box.
          label="Edit annotation"
          // Start with the existing text.
          initialBody={editedAnnotation.body}
          // Show "Saving…" while waiting for the page data.
          saving={awaitingEdit}
          // Cancelling goes back to reading the box.
          onCancel={() => {
            // Stop editing, undoing any move.
            stopEditing();

            // Show the box's card again.
            openRegion(editingNow.regionId);
          }}
          // Save the change.
          onSave={async (body) => {
            // The new position, if the box moved.
            let region: Region | undefined;

            // Only a movable box can have moved.
            if (editingNow.movable) {
              // The box's position now.
              const box = currentRegion(anno, editingNow.regionId, image.size);

              // There must be a box.
              if (!box) return { ok: false, error: "Select the box on the image first." };

              // Check the box.
              const problem = checkRegion(box);

              // Refuse a bad box.
              if (problem) return { ok: false, error: problem };

              // Send the new position too.
              region = box;
            }

            // Ask the server to save it.
            const result = await updateAnnotation({ id: editingNow.annotationId, region, body });

            // On success...
            if (result.ok) {
              // ...mark the edit as saved...
              setEditing({ ...editingNow, saved: true });

              // ...and reopen the box once the data arrives.
              selectAfterSave.current = editingNow.regionId;
            }

            // Report the result.
            return result;
          }}
        />
      </>
    );
    // Otherwise, if a box is open...
  } else if (open) {
    // ...show its annotations.
    card = (
      // The box's card.
      <RegionCard
        // Start afresh for each box.
        key={open.id}
        // The box.
        region={open}
        // The user may add if they can annotate and haven't yet.
        canAdd={canAnnotate && !open.annotations.some((a) => a.mine)}
        // Whether the add form is open.
        adding={addingNow !== null && addingNow.regionId === open.id}
        // Whether the addition is waiting for the page data.
        addSaving={awaitingAdd}
        // Open the add form.
        onStartAdd={() => setAdding({ regionId: open.id, saved: false })}
        // Close the add form.
        onCancelAdd={() => setAdding(null)}
        // Save the new annotation.
        onAdd={async (body) => {
          // Ask the server to save it.
          const result = await addAnnotation({ regionId: open.id, body });

          // On success, mark it as saved.
          if (result.ok) setAdding({ regionId: open.id, saved: true });

          // Report the result.
          return result;
        }}
        // Start editing one of the user's annotations.
        onEdit={(a) => startEditing(open, a)}
      />
    );
  }

  // Return the page's markup.
  return (
    // A fragment, so the layers sit side by side.
    <>
      {/* The full-screen layer that receives gestures. */}
      <div
        // Let the zoom hook attach to it.
        ref={rootRef}
        // Fill the screen, ignore the browser's touch handling, and show the right cursor.
        className={`fixed inset-0 touch-none select-none overflow-hidden bg-neutral-900 ${
          boxActive ? "cursor-crosshair" : "cursor-grab data-dragging:cursor-grabbing"
        }`}
      >
        {/* Sized and positioned as the image by useZoomView; hidden until it's measured the screen. */}
        <div ref={stageRef} className="invisible absolute left-0 top-0">
          {/* In the browser, wrap the image in the annotator; on the server, show it plain. */}
          {isClient ? (
            // The annotator.
            <ImageAnnotator
              // Fill the stage.
              containerClassName="size-full"
              // Drawing is on in annotate mode, until a box has been drawn.
              drawingEnabled={annotating && !showDraft}
              // The box styles.
              style={style}
              // Decide what selecting a box does.
              userSelectAction={(a: ImageAnnotation) =>
                // The draft, and a movable box being edited, can be edited...
                a.id === draftId || (a.id === editingNow?.regionId && editingNow.movable)
                  ? UserSelectAction.EDIT
                  : // ...everything else can only be selected.
                    UserSelectAction.SELECT
              }
            >
              {/* The image to annotate. */}
              {plainImage}
            </ImageAnnotator>
          ) : (
            // The plain image.
            plainImage
          )}
          {/* Keyboard access to the boxes, in list order: Tab moves through them, Enter opens one. */}
          {boxesVisible &&
            // One invisible button per box.
            regions.map((r) => (
              // The button.
              <button
                // React's list key.
                key={r.id}
                // It doesn't submit a form.
                type="button"
                // Open this box.
                onClick={() => openRegion(r.id)}
                // Its name for screen readers.
                aria-label={`Annotation: ${summary(r.annotations[0]?.body ?? "")}`}
                // Sit exactly over the box.
                style={{
                  // The left edge.
                  left: `${r.region.x * 100}%`,
                  // The top edge.
                  top: `${r.region.y * 100}%`,
                  // The width.
                  width: `${r.region.w * 100}%`,
                  // The height.
                  height: `${r.region.h * 100}%`,
                }}
                // Invisible, unless focused by keyboard, when it shows an outline.
                className="pointer-events-none absolute opacity-0 outline-2 outline-offset-2 outline-sky-400 focus-visible:opacity-100 focus-visible:outline"
              />
            ))}
        </div>
      </div>

      {/* Show the UI panel once the screen is measured. */}
      {layout && (
        // The UI panel.
        <UiPanel
          // The measured screen.
          layout={layout}
          // Which edge it's on.
          edge={panelEdge}
          // Hide it while a card is open.
          hidden={cardOpen}
          // Move it to the other edge.
          onFlip={() => setPanelEdge(panelEdge === "start" ? "end" : "start")}
          // Zoom one step.
          onZoom={zoomStep}
          // Zoom is off while a box is active.
          zoomDisabled={boxActive}
          // The image's title.
          title={image.title}
          // The Annotate button, or the sign-in prompt.
          annotate={
            // Users who can annotate get the button.
            canAnnotate ? (
              // The Annotate button.
              <button
                // It doesn't submit a form.
                type="button"
                // Turn annotate mode on or off.
                onClick={toggleAnnotating}
                // Tell screen readers whether it's on.
                aria-pressed={annotating}
                // Filled when on, outlined when off.
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  annotating
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {/* The button text. */}
                {annotating ? "Done annotating" : "Annotate"}
              </button>
            ) : (
              // Everyone else sees the prompt.
              signInPrompt
            )
          }
          // A hint, in annotate mode.
          hint={annotating ? "Drag a box over the part of the image you want to explain." : null}
          // The list of boxes.
          entries={regions.map((r) => ({
            // The box's id.
            id: r.id,
            // The first annotation, shortened.
            label: summary(r.annotations[0]?.body ?? ""),
            // How many more annotations there are.
            more: r.annotations.length - 1,
          }))}
          // Open a box picked from the list.
          onPick={openRegion}
          // Whether the boxes are shown.
          boxesVisible={boxesVisible}
          // Show or hide the boxes.
          onToggleBoxes={() => setBoxesVisible(!boxesVisible)}
          // The "about" content.
          about={about}
        />
      )}

      {/* Show the card once there's a screen, a card and a box to attach it to. */}
      {layout && card && anchorRegion && (
        // The floating card.
        <FloatingCard store={store} layout={layout} region={anchorRegion} size={image.size} onClose={closeCard}>
          {/* The card's contents. */}
          {card}
        </FloatingCard>
      )}
    </>
  );
}

/** The stored-format region of a box as it is now: the user may have moved or resized it. */
function currentRegion(anno: AnnotoriousImageAnnotator | undefined, id: string | null, size: ImageSize) {
  // The box's selector, if the box exists.
  const selector = id ? anno?.getAnnotationById(id)?.target.selector : undefined;

  // Only rectangles are supported.
  if (selector?.type !== ShapeType.RECTANGLE) return null;

  // Convert from image pixels to fractions.
  return toFraction(selector.geometry as RectangleGeometry, size);
}

/**
 * A card floating beside its box (Rule 5): a constant size on screen, inside the visible area, and
 * following the box as the view moves. If it has to cover the box, its background turns
 * translucent so both stay readable (Rule 5.7).
 */
function FloatingCard({
  // The current view.
  store,
  // The measured screen.
  layout,
  // The box the card belongs to.
  region,
  // The image's size.
  size,
  // Called to close the card.
  onClose,
  // The card's contents.
  children,
}: {
  // The current view.
  store: ViewStore;
  // The measured screen.
  layout: ScreenLayout;
  // The box the card belongs to.
  region: Region;
  // The image's size.
  size: ImageSize;
  // Called to close the card.
  onClose: () => void;
  // The card's contents.
  children: ReactNode;
}) {
  // The current view, re-read whenever it changes.
  const view = useSyncExternalStore(store.subscribe, store.get, store.get);

  // A handle on the card element.
  const ref = useRef<HTMLDivElement>(null);

  // The card's measured size.
  const [measured, setMeasured] = useState<Size | null>(null);

  // Measure the card, and keep measuring as its size changes.
  useLayoutEffect(() => {
    // The card element.
    const el = ref.current;

    // Do nothing if it doesn't exist.
    if (!el) return;

    // Record its size.
    const measure = () => setMeasured({ w: el.offsetWidth, h: el.offsetHeight });

    // Measure now.
    measure();

    // Watch for size changes.
    const observer = new ResizeObserver(measure);

    // Start watching the card.
    observer.observe(el);

    // Stop watching on cleanup.
    return () => observer.disconnect();
  }, []);

  // Pull out the parts of the layout we use.
  const { area, orientation, keyboard } = layout;

  // The card's largest size.
  const max = cardMaxSize(area, orientation);

  // Where to put the card, once we know its size.
  const place = measured
    ? placeCard(
        // The box on screen.
        regionOnScreen(region, size, view),
        // The card's size.
        measured,
        // The visible area.
        area,
        // Portrait or landscape.
        orientation,
        // Which side of the box.
        cardSide(region, orientation),
        // Whether the keyboard is open.
        keyboard,
      )
    : null;

  // Return the card's markup.
  return (
    // The card, as a dialog.
    <div
      // Let us measure it.
      ref={ref}
      // Mark it as a dialog for screen readers.
      role="dialog"
      // Its name for screen readers.
      aria-label="Annotation"
      // Its position and size; hidden until it's measured.
      style={{
        // Its left edge.
        left: place?.x ?? 0,
        // Its top edge.
        top: place?.y ?? 0,
        // Its width.
        width: max.w,
        // Its largest height.
        maxHeight: max.h,
        // Hidden until placed.
        visibility: place ? "visible" : "hidden",
      }}
      // Fixed above the image, rounded, and translucent when it covers its box.
      className={`fixed z-30 flex touch-pan-y flex-col overflow-hidden rounded-xl text-zinc-900 shadow-xl dark:text-zinc-100 ${
        place?.overlap ? "bg-white/80 backdrop-blur-md dark:bg-zinc-900/80" : "bg-white dark:bg-zinc-900"
      }`}
    >
      {/* The close button. */}
      <button
        // It doesn't submit a form.
        type="button"
        // Close the card.
        onClick={onClose}
        // Its name for screen readers.
        aria-label="Close"
        // In the top-right corner.
        className="absolute right-1.5 top-1.5 z-10 grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        {/* The "x" icon. */}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          {/* The two crossing lines. */}
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      {/* The scrolling contents. */}
      <div className="flex min-h-0 touch-pan-y flex-col gap-3 overflow-y-auto overscroll-contain p-4 pr-10">
        {/* Whatever the card holds. */}
        {children}
      </div>
    </div>
  );
}

/** Shown while a new box overlaps an existing one too much (ADR 0011). */
function ClashNotice({ onAdd, onAdjust }: { onAdd: () => void; onAdjust: () => void }) {
  // Return the notice's markup.
  return (
    // An amber box, announced to screen readers.
    <div
      // Mark it as an alert.
      role="alert"
      // Amber border and background, for light and dark.
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950"
    >
      {/* The explanation. */}
      <p>
        This box overlaps an existing one too much: one of them would be hard to click. Add to that annotation instead,
        or adjust your box.
      </p>
      {/* The two choices. */}
      <div className="mt-3 flex flex-wrap gap-3">
        {/* Add to the existing box. */}
        <button
          // It doesn't submit a form.
          type="button"
          // Run the add handler.
          onClick={onAdd}
          // Dark button with light text, reversed in dark mode.
          className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {/* The button text. */}
          Add to that annotation
        </button>
        {/* Go back to adjusting the box. */}
        <button type="button" onClick={onAdjust} className="hover:underline">
          Adjust my box
        </button>
      </div>
    </div>
  );
}

/** A box's annotations, oldest first, with a form to add yours. */
function RegionCard({
  // The box.
  region,
  // Whether the user may add an annotation.
  canAdd,
  // Whether the add form is open.
  adding,
  // Whether the addition is waiting for the page data.
  addSaving,
  // Called to open the add form.
  onStartAdd,
  // Called to close the add form.
  onCancelAdd,
  // Called to save a new annotation.
  onAdd,
  // Called to edit an annotation.
  onEdit,
}: {
  // The box.
  region: RegionData;
  /** Whether the user can annotate, and hasn't annotated this box yet. */
  canAdd: boolean;
  // Whether the add form is open.
  adding: boolean;
  // Whether the addition is waiting for the page data.
  addSaving: boolean;
  // Called to open the add form.
  onStartAdd: () => void;
  // Called to close the add form.
  onCancelAdd: () => void;
  // Called to save a new annotation.
  onAdd: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  // Called to edit an annotation.
  onEdit: (annotation: AnnotationData) => void;
}) {
  // Return the card's markup.
  return (
    // A column of annotations.
    <div className="flex flex-col gap-4">
      {/* One item per annotation. */}
      {region.annotations.map((a) => (
        // The annotation.
        <AnnotationItem key={a.id} annotation={a} onEdit={() => onEdit(a)} />
      ))}
      {/* Show the form, the add button, or nothing. */}
      {adding ? (
        // The form for a new annotation.
        <AnnotationEditor
          // The label above the text box.
          label="Add your annotation"
          // Start empty.
          initialBody=""
          // Show "Saving…" while waiting for the page data.
          saving={addSaving}
          // Close the form.
          onCancel={onCancelAdd}
          // Save the annotation.
          onSave={onAdd}
        />
      ) : (
        // The add button, if the user may add.
        canAdd && (
          // The button.
          <button type="button" onClick={onStartAdd} className="self-start text-sm font-medium hover:underline">
            + Add your annotation
          </button>
        )
      )}
    </div>
  );
}

// One annotation in a card, with edit and delete for its author.
function AnnotationItem({ annotation: a, onEdit }: { annotation: AnnotationData; onEdit: () => void }) {
  // Whether the delete confirmation is showing.
  const [confirming, setConfirming] = useState(false);

  // The latest error message, if any.
  const [error, setError] = useState<string | null>(null);

  // Whether a server action is running.
  const [isPending, startTransition] = useTransition();

  // Whether it was changed after it was written (allowing a second for rounding).
  const edited = Date.parse(a.updatedAt) - Date.parse(a.createdAt) > 1000;

  // Delete this annotation.
  function remove() {
    // Run as a transition, so `isPending` is set while it works.
    startTransition(async () => {
      // The action can throw, so guard it.
      try {
        // On success the refreshed page data no longer has this annotation, so it goes.
        const result = await deleteAnnotation(a.id);

        // Show any error.
        if (!result.ok) setError(result.error);
      } catch {
        // Show a general error.
        setError("Something went wrong. Please try again.");
      }
    });
  }

  // Return the annotation's markup.
  return (
    // A block, with a line above it unless it's the first.
    <div className="border-zinc-200 pt-4 first:pt-0 dark:border-zinc-800 [&:not(:first-child)]:border-t">
      {/* The text, rendered safely. */}
      <Markdown>{a.body}</Markdown>
      {/* The byline. */}
      <p className="mt-3 text-xs text-zinc-500">
        By {a.authorName ?? "someone"} · {formatDate(a.createdAt)}
        {edited && " · edited"}
      </p>
      {/* Controls for the author only. */}
      {a.mine &&
        // Either the delete confirmation or the two buttons.
        (confirming ? (
          // The confirmation row.
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {/* The question. */}
            <span>Delete this annotation?</span>
            {/* The confirm button. */}
            <button
              // It doesn't submit a form.
              type="button"
              // Delete it.
              onClick={remove}
              // Lock it while deleting.
              disabled={isPending}
              // Red button with white text.
              className="rounded-md bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
            >
              {/* Show progress while deleting. */}
              {isPending ? "Deleting…" : "Delete"}
            </button>
            {/* The back-out button. */}
            <button type="button" onClick={() => setConfirming(false)} disabled={isPending} className="hover:underline">
              Keep
            </button>
          </div>
        ) : (
          // The normal row.
          <div className="mt-3 flex gap-4 text-sm">
            {/* Edit it. */}
            <button type="button" onClick={onEdit} className="hover:underline">
              Edit
            </button>
            {/* Ask for delete confirmation. */}
            <button type="button" onClick={() => setConfirming(true)} className="text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
      {/* Show any error. */}
      {error && (
        // The error message, announced to screen readers.
        <p role="alert" className="mt-2 text-sm text-red-600">
          {/* The error text. */}
          {error}
        </p>
      )}
    </div>
  );
}

// A form for writing or editing an annotation.
function AnnotationEditor({
  // The label above the text box.
  label,
  // The text to start with.
  initialBody,
  // Whether it's saved and waiting for the page data.
  saving,
  // Whether saving is blocked.
  blocked = false,
  // Called to cancel.
  onCancel,
  // Called to save.
  onSave,
}: {
  // The label above the text box.
  label: string;
  // The text to start with.
  initialBody: string;
  /** Saved, and waiting for the refreshed page data. */
  saving: boolean;
  /** Saving isn't allowed yet, e.g. while the box overlaps another. */
  blocked?: boolean;
  // Called to cancel.
  onCancel: () => void;
  // Called to save.
  onSave: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  // The text typed so far.
  const [body, setBody] = useState(initialBody);

  // The latest error message, if any.
  const [error, setError] = useState<string | null>(null);

  // Whether a server action is running.
  const [isPending, startTransition] = useTransition();

  // Whether to lock the form.
  const busy = isPending || saving;

  // A handle on the text box.
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Focus without scrolling, so the box being drawn or edited stays in view.
  useEffect(() => textarea.current?.focus({ preventScroll: true }), []);

  // Check and save the text.
  function save() {
    // Check the text.
    const problem = checkBody(body);

    // Show any problem and stop.
    if (problem) return setError(problem);

    // Run as a transition, so `isPending` is set while it works.
    startTransition(async () => {
      // The action can throw, so guard it.
      try {
        // Save it.
        const result = await onSave(body);

        // Show any error, or clear the old one.
        setError(result.ok ? null : result.error);
      } catch {
        // Show a general error.
        setError("Something went wrong. Please try again.");
      }
    });
  }

  // Return the form's markup.
  return (
    // The form.
    <form
      // Handle submission in the browser.
      onSubmit={(e) => {
        // Stop the browser's own form submission.
        e.preventDefault();

        // Check and save.
        save();
      }}
      // Stack the fields.
      className="flex flex-col gap-3"
    >
      {/* The text box and its label. */}
      <label className="flex flex-col gap-2">
        {/* The label text. */}
        <span className="text-sm font-medium">{label}</span>
        {/* The text box. */}
        <textarea
          // Show what's typed.
          value={body}
          // Store each change.
          onChange={(e) => setBody(e.target.value)}
          // Four lines tall.
          rows={4}
          // Limit its length.
          maxLength={BODY_MAX}
          // Let us focus it.
          ref={textarea}
          // Lock it while saving.
          disabled={busy}
          // Border and colours, with a size that stops iOS zooming in.
          className="rounded-md border border-zinc-300 px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        {/* A reminder about Markdown. */}
        <span className="text-xs text-zinc-500">
          Markdown works: **bold**, _italic_, lists. Links show as plain text.
        </span>
      </label>
      {/* The buttons. */}
      <div className="flex items-center gap-3">
        {/* The save button. */}
        <button
          // It submits the form.
          type="submit"
          // Lock it while busy, blocked or empty.
          disabled={busy || blocked || !body.trim()}
          // Dark button with light text, reversed in dark mode.
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {/* Show progress while saving. */}
          {busy ? "Saving…" : "Save"}
        </button>
        {/* The cancel button. */}
        <button type="button" onClick={onCancel} disabled={busy} className="text-sm hover:underline">
          Cancel
        </button>
      </div>
      {/* Show any error. */}
      {error && (
        // The error message, announced to screen readers.
        <p role="alert" className="text-sm text-red-600">
          {/* The error text. */}
          {error}
        </p>
      )}
    </form>
  );
}

// Format a date as, for example, "3 November 2026".
function formatDate(iso: string) {
  // Use British English, with the month written out.
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** First line of an annotation as plain-ish text, for the list and box labels. */
function summary(body: string) {
  // The first line that has any text.
  const firstLine = body.split("\n").find((line) => line.trim()) ?? "";

  // Clean it up.
  return (
    firstLine
      // Remove Markdown and HTML punctuation.
      .replace(/[#*_`<>\[\]]/g, "")
      // Remove link addresses.
      .replace(/\(https?:[^)]*\)/g, "")
      // Trim spaces, and use "Annotation" if nothing is left.
      .trim() || "Annotation"
  );
}
