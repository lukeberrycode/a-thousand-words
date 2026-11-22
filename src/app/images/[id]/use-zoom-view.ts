// Mark this file as client code, since it uses browser APIs.
"use client";

// Import the React hooks used below.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Import the image size and region types.
import type { ImageSize, Region } from "@/lib/regions";

// Import the text-field check and the screen layout type.
import { isTextField, type ScreenLayout } from "@/lib/use-screen-layout";

// Import the view geometry functions and types.
import {
  // Keeps a view within its limits.
  clampView,
  // The view that fits the whole image.
  fitView,
  // Keeps the same part of the image in view when the area changes.
  keepView,
  // Decides which edge the panel sits on after a pan.
  panelEdgeAfterPan,
  // Zooms around a point.
  zoomAround,
  // The minimum and maximum zoom.
  zoomLimits,
  // The view that shows a region and its card.
  zoomToRegion,
  // The panel edge type.
  type Edge,
  // The view type.
  type View,
} from "@/lib/view-geometry";

/** The current view, for components that follow it (cards) without re-rendering the whole page. */
export type ViewStore = { get: () => View; subscribe: (listener: () => void) => () => void };

// What the hook is given.
type Options = {
  // The image's pixel size.
  size: ImageSize;

  // The measured screen, or null before it's measured.
  layout: ScreenLayout | null;

  // Which edge the UI panel is on.
  panel: Edge;

  /** Called when a pan should move the UI panel to the other edge (Rule 3.4). */
  onPanelEdge: (edge: Edge) => void;

  /** Whether the user can zoom and pan. Off in annotate mode, and while a box is being moved (Rule 2.5). */
  gestures: boolean;
};

/** A drag must move this far before it pans, so a tap still reaches the box under it. */
const DRAG_SLOP = 6;

// Two taps within this many milliseconds make a double-tap.
const DOUBLE_TAP_MS = 300;

// Two taps within this many pixels make a double-tap.
const DOUBLE_TAP_DISTANCE = 30;

// How long a zoom animation lasts, in milliseconds.
const ANIMATION_MS = 350;

/** How long after the last scroll or arrow key a pan counts as finished, for moving the panel. */
const PAN_SETTLE_MS = 200;

// How far one arrow-key press pans, in pixels.
const KEY_PAN = 80;

// How much one zoom key press multiplies the zoom by.
const KEY_ZOOM = 1.5;

/**
 * The app owns zoom (docs/enrich-UI.md, Rule 2; ADR 0012). The image's on-screen size and position
 * live outside React state, so a pan or pinch only restyles the stage: `rootRef` is the full-screen
 * element that receives gestures, and `stageRef` the element sized and positioned as the image.
 *
 * Gestures: one-finger or mouse drag pans; pinch, Ctrl + wheel (trackpad pinch) and the mouse wheel
 * zoom around the pointer; trackpad scrolling pans; double-tap zooms 2×, or back to the fit size at
 * the maximum; arrow keys pan, and `+`, `-` and Ctrl + `+` / `-` / `0` zoom. The browser's own zoom
 * gestures are blocked on the whole page, so the UI panel and cards keep their size.
 */
export function useZoomView({ size, layout, panel, onPanelEdge, gestures }: Options) {
  // The full-screen element that receives gestures.
  const rootRef = useRef<HTMLDivElement>(null);

  // The element sized and positioned as the image.
  const stageRef = useRef<HTMLDivElement>(null);

  // The store that holds the current view, created once.
  const [store] = useState(createStore);

  // Read by event handlers and animations, which outlive a render.
  const latest = useRef({ size, layout, panel, onPanelEdge, gestures });

  // After every render, update what handlers see.
  useLayoutEffect(() => {
    // Store the latest values.
    latest.current = { size, layout, panel, onPanelEdge, gestures };
  });

  // The id of the running animation frame, if any.
  const animation = useRef<number | null>(null);

  // Show a view: restyle the stage and tell the store.
  const apply = useCallback(
    (view: View) => {
      // The stage element.
      const stage = stageRef.current;

      // If it exists, restyle it.
      if (stage) {
        // The image's pixel size.
        const { width, height } = latest.current.size;

        // Move it to the view's position.
        stage.style.transform = `translate(${view.x}px, ${view.y}px)`;

        // Set its on-screen width.
        stage.style.width = `${width * view.scale}px`;

        // Set its on-screen height.
        stage.style.height = `${height * view.scale}px`;

        // Show it, now that it's in place.
        stage.style.visibility = "visible";
      }

      // Tell followers of the store.
      store.set(view);
    },
    [store],
  );

  // Keep a view within the limits, if the screen has been measured.
  const clamp = useCallback((view: View) => {
    // The latest values.
    const { size, layout, panel } = latest.current;

    // Clamp when we can, otherwise leave it as it is.
    return layout ? clampView(view, size, layout.area, layout.orientation, panel) : view;
  }, []);

  // Cancel the running animation, if any.
  const stopAnimation = useCallback(() => {
    // Cancel the pending frame.
    if (animation.current !== null) cancelAnimationFrame(animation.current);

    // Note that nothing is running.
    animation.current = null;
  }, []);

  /** Move to a view: animated, unless the user's system asks for reduced motion (Rule 5.9). */
  const animateTo = useCallback(
    (target: View) => {
      // Stop any earlier animation.
      stopAnimation();

      // Where the animation starts.
      const from = store.get();

      // With reduced motion, or no view yet, jump straight there.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || from.scale === 0) return apply(target);

      // When the animation began.
      const start = performance.now();

      // One frame of the animation.
      const step = (now: number) => {
        // How far through we are, from 0 to 1.
        const t = Math.min(1, (now - start) / ANIMATION_MS);

        // Ease the progress: fast at first, slowing at the end.
        const e = 1 - (1 - t) ** 3;

        // Show the in-between view.
        apply({
          // Interpolate the scale geometrically, so zooming in and out feel equally fast.
          scale: from.scale * (target.scale / from.scale) ** e,

          // Move the left edge part of the way.
          x: from.x + (target.x - from.x) * e,

          // Move the top edge part of the way.
          y: from.y + (target.y - from.y) * e,
        });

        // Ask for the next frame, unless we've finished.
        animation.current = t < 1 ? requestAnimationFrame(step) : null;
      };

      // Ask for the first frame.
      animation.current = requestAnimationFrame(step);
    },
    [apply, store, stopAnimation],
  );

  // Fit on first measure. After a resize or rotation, keep the same point of the image centred at
  // the same zoom relative to the fit size. If only the height changed (an on-screen keyboard),
  // keep the view, within the new limits (Rule 8.4).
  const previous = useRef<ScreenLayout | null>(null);

  // Run when the layout or image size changes, before paint.
  useLayoutEffect(() => {
    // Wait until the screen has been measured.
    if (!layout) return;

    // The layout we had last time.
    const prev = previous.current;

    // Remember this one for next time.
    previous.current = layout;

    // Stop any animation, since the target has changed.
    stopAnimation();

    // The first time, show the whole image.
    if (!prev) return apply(fitView(size, layout.area, layout.orientation, latest.current.panel));

    // Whether the width or orientation changed, as opposed to just the height.
    const resized = prev.screen.w !== layout.screen.w || prev.orientation !== layout.orientation;

    // After a resize, keep the same part in view; otherwise keep the view, within the new limits.
    apply(clamp(resized ? keepView(store.get(), size, prev.area, layout.area) : store.get()));
  }, [layout, size, apply, clamp, store, stopAnimation]);

  // When the panel changes edge, an image smaller than the area moves to the opposite edge (Rule 3.6).
  const firstPanel = useRef(true);

  // Run when the panel's edge changes.
  useEffect(() => {
    // Skip the first run, which isn't a change.
    if (firstPanel.current) {
      // Note that the first run is over.
      firstPanel.current = false;

      // Do nothing else.
      return;
    }

    // Slide the image to its new place.
    animateTo(clamp(store.get()));
  }, [panel, animateTo, clamp, store]);

  /** Auto-zoom to a box and its card (Rule 5.6). */
  const zoomTo = useCallback(
    (region: Region) => {
      // The latest values.
      const { size, layout, panel } = latest.current;

      // Animate to the view that shows the box and its card.
      if (layout) animateTo(zoomToRegion(region, size, layout.area, layout.orientation, panel));
    },
    [animateTo],
  );

  // The current zoom limits.
  const limits = useCallback(() => {
    // The latest values.
    const { size, layout } = latest.current;

    // Real limits once measured, otherwise no limits.
    return layout ? zoomLimits(size, layout.area) : { min: 0, max: Infinity };
  }, []);

  /** Zoom by a factor around a screen point, within the zoom limits. */
  const zoomBy = useCallback(
    (factor: number, at: { x: number; y: number }, animate = false) => {
      // The current view.
      const view = store.get();

      // The zoom limits.
      const { min, max } = limits();

      // The new zoom, kept within the limits.
      const scale = Math.min(max, Math.max(min, view.scale * factor));

      // The new view, with the point under `at` kept still, and clamped.
      const next = clamp(zoomAround(view, scale, at));

      // Animate if asked to...
      if (animate) animateTo(next);
      // ...otherwise jump there.
      else apply(next);
    },
    [store, limits, clamp, animateTo, apply],
  );

  /** One step in or out around the centre of the visible area: the + and − keys and buttons. */
  const zoomStep = useCallback(
    (direction: "in" | "out") => {
      // Do nothing if gestures are off.
      if (!latest.current.gestures) return;

      // Zoom by one step around the centre of the area, animated.
      zoomBy(direction === "in" ? KEY_ZOOM : 1 / KEY_ZOOM, areaCentre(latest.current.layout), true);
    },
    [zoomBy],
  );

  // Set up all the event listeners, once the elements exist.
  useEffect(() => {
    // The gesture element.
    const root = rootRef.current;

    // Do nothing if it isn't there yet.
    if (!root) return;

    // Animate back to the fit size.
    const fit = () => {
      // The latest values.
      const { size, layout, panel } = latest.current;

      // Animate to the fit view.
      if (layout) animateTo(fitView(size, layout.area, layout.orientation, panel));
    };

    // Movement from scrolling and arrow keys, totalled until they pause, for moving the panel.
    let settled = { x: 0, y: 0 };

    // The timer that notices the pause.
    let settleTimer: number | undefined;

    // Pan by a distance, and return how far the image really moved.
    const panBy = (dx: number, dy: number, settle: boolean) => {
      // The view before.
      const before = store.get();

      // The view after, within the limits.
      const after = clamp({ ...before, x: before.x + dx, y: before.y + dy });

      // Show it.
      apply(after);

      // How far it really moved, after clamping.
      const moved = { x: after.x - before.x, y: after.y - before.y };

      // If this movement isn't one to settle, report it now.
      if (!settle) return moved;

      // Add it to the running total.
      settled = { x: settled.x + moved.x, y: settled.y + moved.y };

      // Restart the pause timer.
      window.clearTimeout(settleTimer);

      // When movement pauses...
      settleTimer = window.setTimeout(() => {
        // ...consider moving the panel...
        movePanel(settled);

        // ...and reset the total.
        settled = { x: 0, y: 0 };
      }, PAN_SETTLE_MS);

      // Report how far it moved.
      return moved;
    };

    // Move the UI panel to the other edge if the pan calls for it.
    const movePanel = (moved: { x: number; y: number }) => {
      // The latest values.
      const { layout, panel, onPanelEdge } = latest.current;

      // Do nothing before the screen is measured.
      if (!layout) return;

      // The edge the panel should be on.
      const edge = panelEdgeAfterPan(layout.orientation, moved, panel);

      // Tell the page if it has changed.
      if (edge !== panel) onPanelEdge(edge);
    };

    // Pointers: drag to pan, pinch to zoom, double-tap.
    const pointers = new Map<number, { x: number; y: number }>();

    // What the current gesture is.
    let mode: "idle" | "pending" | "pan" | "pinch" = "idle";

    // Where and when the gesture began, and whether it began on a box.
    let downAt = { x: 0, y: 0, time: 0, onBox: false };

    // The pointer's previous position.
    let last = { x: 0, y: 0 };

    // The total the image has moved during this drag.
    let dragMoved = { x: 0, y: 0 };

    // Whether this gesture has included a pinch.
    let pinched = false;

    // The state when a pinch began.
    let pinchStart = { distance: 1, mid: { x: 0, y: 0 }, view: store.get() };

    // The previous tap, for spotting a double-tap.
    let lastTap: { x: number; y: number; time: number; onBox: boolean } | null = null;

    // Make the root keep receiving a pointer's events, even outside it.
    const capture = (id: number) => {
      // Capturing can throw, so guard it.
      try {
        // Capture the pointer.
        root.setPointerCapture(id);
      } catch {
        // The pointer may already be gone.
      }
    };

    // Begin a pinch with the two pointers now down.
    const startPinch = () => {
      // The two pointers.
      const [a, b] = [...pointers.values()];

      // Record the starting distance, midpoint and view.
      pinchStart = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: midpoint(a, b), view: store.get() };

      // We're pinching now.
      mode = "pinch";

      // Note that this gesture included a pinch.
      pinched = true;

      // Capture every pointer involved.
      for (const id of pointers.keys()) capture(id);
    };

    // A finger or mouse button goes down.
    const onPointerDown = (e: PointerEvent) => {
      // Ignore it if gestures are off.
      if (!latest.current.gestures) return;

      // Ignore mouse buttons other than the main one.
      if (e.pointerType === "mouse" && e.button !== 0) return;

      // A new gesture cancels any animation.
      stopAnimation();

      // Remember where this pointer is.
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // One pointer: a possible drag or tap.
      if (pointers.size === 1) {
        // Wait to see whether it moves.
        mode = "pending";

        // Whether it landed on an annotation box.
        const onBox = e.target instanceof Element && e.target.closest(".a9s-annotation") !== null;

        // Record where and when.
        downAt = { x: e.clientX, y: e.clientY, time: performance.now(), onBox };

        // It's also the latest position.
        last = { x: e.clientX, y: e.clientY };

        // Nothing has been dragged yet.
        dragMoved = { x: 0, y: 0 };

        // No pinch yet.
        pinched = false;
        // Two pointers: a pinch.
      } else if (pointers.size === 2) {
        // Begin the pinch.
        startPinch();
      }
    };

    // A pointer moves.
    const onPointerMove = (e: PointerEvent) => {
      // Find our record of it.
      const p = pointers.get(e.pointerId);

      // Ignore pointers we aren't tracking.
      if (!p) return;

      // Update its position.
      p.x = e.clientX;

      // Update its position.
      p.y = e.clientY;

      // If we were waiting to see whether it's a drag...
      if (mode === "pending") {
        // ...ignore tiny movements, so taps still work.
        if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < DRAG_SLOP) return;

        // Capturing the pointer also keeps its pointerup from Annotorious, so the drag doesn't
        // count as a click on a box.
        mode = "pan";

        // Capture the pointer.
        capture(e.pointerId);

        // Mark the root as being dragged, for styling.
        root.dataset.dragging = "";
      }

      // Panning: move the image with the pointer.
      if (mode === "pan") {
        // Pan by how far the pointer moved.
        const moved = panBy(p.x - last.x, p.y - last.y, false);

        // Add to the drag's total.
        dragMoved = { x: dragMoved.x + moved.x, y: dragMoved.y + moved.y };

        // Remember the position for next time.
        last = { x: p.x, y: p.y };
        // Pinching: zoom with the fingers.
      } else if (mode === "pinch") {
        // The two pointers.
        const [a, b] = [...pointers.values()];

        // The zoom limits.
        const { min, max } = limits();

        // The state when the pinch began.
        const { view, mid, distance } = pinchStart;

        // The new zoom: the starting zoom times how much the fingers moved apart, within the limits.
        const scale = Math.min(max, Math.max(min, (view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / distance));

        // The image point under the starting midpoint follows the fingers' midpoint, so a pinch can also pan.
        const now = midpoint(a, b);

        // That image point's horizontal position, in image pixels.
        const ix = (mid.x - view.x) / view.scale;

        // That image point's vertical position, in image pixels.
        const iy = (mid.y - view.y) / view.scale;

        // Show the new view.
        apply(clamp({ scale, x: now.x - ix * scale, y: now.y - iy * scale }));
      }
    };

    // A pointer lifts or is cancelled.
    const onPointerUp = (e: PointerEvent) => {
      // Ignore pointers we weren't tracking.
      if (!pointers.delete(e.pointerId)) return;

      // If a pinch is down to one finger...
      if (mode === "pinch" && pointers.size === 1) {
        // One finger left: carry on as a pan from where it is.
        mode = "pan";

        // The remaining pointer.
        const [p] = [...pointers.values()];

        // Start the pan from its position.
        last = { x: p.x, y: p.y };

        // Nothing more to do.
        return;
      }

      // Wait until every pointer is up.
      if (pointers.size > 0) return;

      // The drag is over.
      delete root.dataset.dragging;

      // Only a one-finger drag moves the panel, decided when the finger lifts (Rule 3.4).
      if (mode === "pan" && !pinched) movePanel(dragMoved);

      // A quick lift without movement is a tap.
      if (mode === "pending" && e.type === "pointerup" && performance.now() - downAt.time < DOUBLE_TAP_MS) {
        // Handle the tap.
        onTap();
      }

      // Ready for the next gesture.
      mode = "idle";
    };

    // Double-tap zooms in 2× around the tap, or back to the fit size at the maximum zoom. Not on
    // a box: a tap there opens it.
    const onTap = () => {
      // This tap's details.
      const tap = { x: downAt.x, y: downAt.y, time: downAt.time, onBox: downAt.onBox };

      // The previous tap.
      const prev = lastTap;

      // Remember this one for next time.
      lastTap = tap;

      // Not a double-tap if there was no earlier tap, it was too long ago or far away, or either was on a box.
      if (
        !prev ||
        tap.time - prev.time > DOUBLE_TAP_MS ||
        Math.hypot(tap.x - prev.x, tap.y - prev.y) > DOUBLE_TAP_DISTANCE ||
        tap.onBox ||
        prev.onBox
      ) {
        // Nothing to do.
        return;
      }

      // Used up: the next tap starts afresh.
      lastTap = null;

      // At maximum zoom, go back to the fit size...
      if (store.get().scale >= limits().max * 0.99) fit();
      // ...otherwise zoom in 2× around the tap.
      else zoomBy(2, tap, true);
    };

    // Safari's own pinch events (desktop trackpad). On iOS, touch pointers handle pinch instead.
    let gestureStart = 0;

    // When the last gesture event arrived.
    let lastGesture = 0;

    // The shape of Safari's gesture events.
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };

    // A Safari pinch begins.
    const onGestureStart = (e: Event) => {
      // Stop the browser zooming the page.
      e.preventDefault();

      // Remember the zoom we started from.
      gestureStart = store.get().scale;
    };

    // A Safari pinch changes.
    const onGestureChange = (e: Event) => {
      // Stop the browser zooming the page.
      e.preventDefault();

      // Note when this happened.
      lastGesture = performance.now();

      // Ignore it if gestures are off, or touch pointers are handling a pinch.
      if (!latest.current.gestures || pointers.size > 0) return;

      // Treat it as a gesture event.
      const g = e as GestureEvent;

      // Zoom to the starting zoom times the gesture's scale, around the pinch point.
      zoomBy((gestureStart * g.scale) / store.get().scale, { x: g.clientX, y: g.clientY });
    };

    // The mouse wheel or a trackpad scrolls.
    const onWheel = (e: WheelEvent) => {
      // Never let the page scroll or the browser zoom.
      e.preventDefault();

      // Ignore it if gestures are off.
      if (!latest.current.gestures) return;

      // A new gesture cancels any animation.
      stopAnimation();

      // Convert lines or pages to pixels.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;

      // Horizontal movement in pixels.
      const dx = e.deltaX * unit;

      // Vertical movement in pixels.
      const dy = e.deltaY * unit;

      // With Ctrl held...
      if (e.ctrlKey) {
        // A trackpad pinch, or Ctrl + wheel. Safari may also send gesture events for the same pinch.
        if (performance.now() - lastGesture < 100) return;

        // Zoom around the pointer.
        zoomBy(Math.exp(-dy * 0.01), { x: e.clientX, y: e.clientY });
        // A mouse wheel zooms.
      } else if (isMouseWheel(e)) {
        // Zoom around the pointer.
        zoomBy(Math.exp(-dy * 0.002), { x: e.clientX, y: e.clientY });
      } else {
        // Trackpad two-finger scrolling pans.
        panBy(-dx, -dy, true);
      }
    };

    // Ctrl + wheel and Safari's pinch over the UI panel or a card would zoom the page.
    const onWindowWheel = (e: WheelEvent) => {
      // Block the browser's zoom.
      if (e.ctrlKey) e.preventDefault();
    };

    // A key is pressed.
    const onKeyDown = (e: KeyboardEvent) => {
      // Whether gestures are on.
      const { gestures } = latest.current;

      // With Ctrl or Cmd held...
      if (e.ctrlKey || e.metaKey) {
        // Only the zoom keys matter, and not with Alt.
        if (e.altKey || !["+", "=", "-", "_", "0"].includes(e.key)) return;

        // The browser's zoom shortcuts zoom the image instead.
        e.preventDefault();

        // Do nothing more if gestures are off.
        if (!gestures) return;

        // Ctrl + 0 goes back to the fit size...
        if (e.key === "0") fit();
        // ...Ctrl + minus zooms out and Ctrl + plus zooms in.
        else zoomStep(e.key === "-" || e.key === "_" ? "out" : "in");

        // Handled.
        return;
      }

      // Ignore keys when gestures are off, with Alt held, already handled, or while typing in a field.
      if (!gestures || e.altKey || e.defaultPrevented || isTextField(document.activeElement)) return;

      // Plus zooms in...
      if (e.key === "+" || e.key === "=") zoomStep("in");
      // ...minus zooms out...
      else if (e.key === "-" || e.key === "_") zoomStep("out");
      // ...left arrow pans the image right...
      else if (e.key === "ArrowLeft") panBy(KEY_PAN, 0, true);
      // ...right arrow pans it left...
      else if (e.key === "ArrowRight") panBy(-KEY_PAN, 0, true);
      // ...up arrow pans it down...
      else if (e.key === "ArrowUp") panBy(0, KEY_PAN, true);
      // ...down arrow pans it up...
      else if (e.key === "ArrowDown") panBy(0, -KEY_PAN, true);
      // ...and any other key is left alone.
      else return;

      // We handled it, so stop the browser scrolling.
      e.preventDefault();
    };

    // Listen for pointer presses on the root.
    root.addEventListener("pointerdown", onPointerDown);

    // Listen for pointer movement on the root.
    root.addEventListener("pointermove", onPointerMove);

    // Listen for pointer releases on the root.
    root.addEventListener("pointerup", onPointerUp);

    // Treat a cancelled pointer like a release.
    root.addEventListener("pointercancel", onPointerUp);

    // Listen for wheel events on the root; not passive, so we can prevent the default.
    root.addEventListener("wheel", onWheel, { passive: false });

    // Listen for wheel events anywhere, to block browser zoom.
    window.addEventListener("wheel", onWindowWheel, { passive: false });

    // Listen for keys anywhere.
    window.addEventListener("keydown", onKeyDown);

    // Listen for the start of a Safari pinch.
    document.addEventListener("gesturestart", onGestureStart);

    // Listen for changes in a Safari pinch.
    document.addEventListener("gesturechange", onGestureChange);

    // Block the browser's end-of-pinch handling.
    document.addEventListener("gestureend", preventDefault);

    // Return the cleanup function.
    return () => {
      // Cancel the pause timer.
      window.clearTimeout(settleTimer);

      // Stop listening for pointer presses.
      root.removeEventListener("pointerdown", onPointerDown);

      // Stop listening for pointer movement.
      root.removeEventListener("pointermove", onPointerMove);

      // Stop listening for pointer releases.
      root.removeEventListener("pointerup", onPointerUp);

      // Stop listening for cancelled pointers.
      root.removeEventListener("pointercancel", onPointerUp);

      // Stop listening for wheel events on the root.
      root.removeEventListener("wheel", onWheel);

      // Stop listening for wheel events anywhere.
      window.removeEventListener("wheel", onWindowWheel);

      // Stop listening for keys.
      window.removeEventListener("keydown", onKeyDown);

      // Stop listening for the start of a Safari pinch.
      document.removeEventListener("gesturestart", onGestureStart);

      // Stop listening for changes in a Safari pinch.
      document.removeEventListener("gesturechange", onGestureChange);

      // Stop blocking the end of a Safari pinch.
      document.removeEventListener("gestureend", preventDefault);
    };
  }, [store, apply, clamp, animateTo, stopAnimation, limits, zoomBy, zoomStep]);

  // Stop any animation when the component goes away.
  useEffect(() => stopAnimation, [stopAnimation]);

  // Hand back the refs, the store and the actions.
  return { rootRef, stageRef, store: store as ViewStore, zoomTo, zoomStep };
}

// Make the store that holds the current view.
function createStore() {
  // The current view, starting at zero scale (not yet shown).
  let view: View = { scale: 0, x: 0, y: 0 };

  // The functions to call when the view changes.
  const listeners = new Set<() => void>();

  // Return the store's functions.
  return {
    // Read the current view.
    get: () => view,

    // Replace the view and tell the listeners.
    set: (next: View) => {
      // Store it.
      view = next;

      // Tell each listener.
      for (const l of listeners) l();
    },

    // Add a listener, and return a function that removes it.
    subscribe: (listener: () => void) => {
      // Add it.
      listeners.add(listener);

      // Return the remover.
      return () => void listeners.delete(listener);
    },
  };
}

// The centre of the visible area, or of the window before it's measured.
function areaCentre(layout: ScreenLayout | null) {
  // The area, if measured.
  const a = layout?.area;

  // Its centre, or the window's centre.
  return a ? { x: a.x + a.w / 2, y: a.y + a.h / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
}

// The point halfway between two points.
const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  // Halfway across.
  x: (a.x + b.x) / 2,

  // Halfway down.
  y: (a.y + b.y) / 2,
});

// An event handler that just stops the browser's default action.
const preventDefault = (e: Event) => e.preventDefault();

/**
 * A mouse wheel zooms, while trackpad scrolling pans (Rule 2.1). Browsers don't say which device
 * sent a wheel event, so guess: mouse wheels scroll in lines, or in large whole steps on one axis;
 * trackpads in small, often fractional, pixel steps on both.
 */
function isMouseWheel(e: WheelEvent) {
  // Line or page scrolling comes from a mouse wheel.
  if (e.deltaMode !== 0) return true;

  // Large whole steps on one axis also look like a mouse wheel.
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
}
