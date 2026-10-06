"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ImageSize, Region } from "@/lib/regions";
import { isTextField, type ScreenLayout } from "@/lib/use-screen-layout";
import {
  clampView,
  fitView,
  keepView,
  panelEdgeAfterPan,
  zoomAround,
  zoomLimits,
  zoomToRegion,
  type Edge,
  type View,
} from "@/lib/view-geometry";

/** The current view, for components that follow it (cards) without re-rendering the whole page. */
export type ViewStore = { get: () => View; subscribe: (listener: () => void) => () => void };

type Options = {
  size: ImageSize;
  layout: ScreenLayout | null;
  panel: Edge;
  /** Called when a pan should move the UI panel to the other edge (Rule 3.4). */
  onPanelEdge: (edge: Edge) => void;
  /** Whether the user can zoom and pan. Off in annotate mode, and while a box is being moved (Rule 2.5). */
  gestures: boolean;
};

/** A drag must move this far before it pans, so a tap still reaches the box under it. */
const DRAG_SLOP = 6;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 30;
const ANIMATION_MS = 350;
/** How long after the last scroll or arrow key a pan counts as finished, for moving the panel. */
const PAN_SETTLE_MS = 200;
const KEY_PAN = 80;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [store] = useState(createStore);

  // Read by event handlers and animations, which outlive a render.
  const latest = useRef({ size, layout, panel, onPanelEdge, gestures });
  useLayoutEffect(() => {
    latest.current = { size, layout, panel, onPanelEdge, gestures };
  });
  const animation = useRef<number | null>(null);

  const apply = useCallback(
    (view: View) => {
      const stage = stageRef.current;
      if (stage) {
        const { width, height } = latest.current.size;
        stage.style.transform = `translate(${view.x}px, ${view.y}px)`;
        stage.style.width = `${width * view.scale}px`;
        stage.style.height = `${height * view.scale}px`;
        stage.style.visibility = "visible";
      }
      store.set(view);
    },
    [store],
  );

  const clamp = useCallback((view: View) => {
    const { size, layout, panel } = latest.current;
    return layout ? clampView(view, size, layout.area, layout.orientation, panel) : view;
  }, []);

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);

  /** Move to a view: animated, unless the user's system asks for reduced motion (Rule 5.9). */
  const animateTo = useCallback(
    (target: View) => {
      stopAnimation();
      const from = store.get();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || from.scale === 0) return apply(target);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ANIMATION_MS);
        const e = 1 - (1 - t) ** 3;
        apply({
          // Interpolate the scale geometrically, so zooming in and out feel equally fast.
          scale: from.scale * (target.scale / from.scale) ** e,
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
        });
        animation.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      animation.current = requestAnimationFrame(step);
    },
    [apply, store, stopAnimation],
  );

  // Fit on first measure. After a resize or rotation, keep the same point of the image centred at
  // the same zoom relative to the fit size. If only the height changed (an on-screen keyboard),
  // keep the view, within the new limits (Rule 8.4).
  const previous = useRef<ScreenLayout | null>(null);
  useLayoutEffect(() => {
    if (!layout) return;
    const prev = previous.current;
    previous.current = layout;
    stopAnimation();
    if (!prev) return apply(fitView(size, layout.area, layout.orientation, latest.current.panel));
    const resized = prev.screen.w !== layout.screen.w || prev.orientation !== layout.orientation;
    apply(clamp(resized ? keepView(store.get(), size, prev.area, layout.area) : store.get()));
  }, [layout, size, apply, clamp, store, stopAnimation]);

  // When the panel changes edge, an image smaller than the area moves to the opposite edge (Rule 3.6).
  const firstPanel = useRef(true);
  useEffect(() => {
    if (firstPanel.current) {
      firstPanel.current = false;
      return;
    }
    animateTo(clamp(store.get()));
  }, [panel, animateTo, clamp, store]);

  /** Auto-zoom to a box and its card (Rule 5.6). */
  const zoomTo = useCallback(
    (region: Region) => {
      const { size, layout, panel } = latest.current;
      if (layout) animateTo(zoomToRegion(region, size, layout.area, layout.orientation, panel));
    },
    [animateTo],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const limits = () => {
      const { size, layout } = latest.current;
      return layout ? zoomLimits(size, layout.area) : { min: 0, max: Infinity };
    };
    const areaCentre = () => {
      const a = latest.current.layout?.area;
      return a ? { x: a.x + a.w / 2, y: a.y + a.h / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
    };
    const zoomBy = (factor: number, at: { x: number; y: number }, animate = false) => {
      const view = store.get();
      const { min, max } = limits();
      const scale = Math.min(max, Math.max(min, view.scale * factor));
      const next = clamp(zoomAround(view, scale, at));
      if (animate) animateTo(next);
      else apply(next);
    };
    const fit = () => {
      const { size, layout, panel } = latest.current;
      if (layout) animateTo(fitView(size, layout.area, layout.orientation, panel));
    };

    // Movement from scrolling and arrow keys, totalled until they pause, for moving the panel.
    let settled = { x: 0, y: 0 };
    let settleTimer: number | undefined;
    const panBy = (dx: number, dy: number, settle: boolean) => {
      const before = store.get();
      const after = clamp({ ...before, x: before.x + dx, y: before.y + dy });
      apply(after);
      const moved = { x: after.x - before.x, y: after.y - before.y };
      if (!settle) return moved;
      settled = { x: settled.x + moved.x, y: settled.y + moved.y };
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        movePanel(settled);
        settled = { x: 0, y: 0 };
      }, PAN_SETTLE_MS);
      return moved;
    };
    const movePanel = (moved: { x: number; y: number }) => {
      const { layout, panel, onPanelEdge } = latest.current;
      if (!layout) return;
      const edge = panelEdgeAfterPan(layout.orientation, moved, panel);
      if (edge !== panel) onPanelEdge(edge);
    };

    // Pointers: drag to pan, pinch to zoom, double-tap.
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: "idle" | "pending" | "pan" | "pinch" = "idle";
    let downAt = { x: 0, y: 0, time: 0, onBox: false };
    let last = { x: 0, y: 0 };
    let dragMoved = { x: 0, y: 0 };
    let pinched = false;
    let pinchStart = { distance: 1, mid: { x: 0, y: 0 }, view: store.get() };
    let lastTap: { x: number; y: number; time: number; onBox: boolean } | null = null;

    const capture = (id: number) => {
      try {
        root.setPointerCapture(id);
      } catch {
        // The pointer may already be gone.
      }
    };
    const startPinch = () => {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: midpoint(a, b), view: store.get() };
      mode = "pinch";
      pinched = true;
      for (const id of pointers.keys()) capture(id);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!latest.current.gestures) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stopAnimation();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        mode = "pending";
        const onBox = e.target instanceof Element && e.target.closest(".a9s-annotation") !== null;
        downAt = { x: e.clientX, y: e.clientY, time: performance.now(), onBox };
        last = { x: e.clientX, y: e.clientY };
        dragMoved = { x: 0, y: 0 };
        pinched = false;
      } else if (pointers.size === 2) {
        startPinch();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (mode === "pending") {
        if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < DRAG_SLOP) return;
        // Capturing the pointer also keeps its pointerup from Annotorious, so the drag doesn't
        // count as a click on a box.
        mode = "pan";
        capture(e.pointerId);
        root.dataset.dragging = "";
      }
      if (mode === "pan") {
        const moved = panBy(p.x - last.x, p.y - last.y, false);
        dragMoved = { x: dragMoved.x + moved.x, y: dragMoved.y + moved.y };
        last = { x: p.x, y: p.y };
      } else if (mode === "pinch") {
        const [a, b] = [...pointers.values()];
        const { min, max } = limits();
        const { view, mid, distance } = pinchStart;
        const scale = Math.min(max, Math.max(min, (view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / distance));
        // The image point under the starting midpoint follows the fingers' midpoint, so a pinch can also pan.
        const now = midpoint(a, b);
        const ix = (mid.x - view.x) / view.scale;
        const iy = (mid.y - view.y) / view.scale;
        apply(clamp({ scale, x: now.x - ix * scale, y: now.y - iy * scale }));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (mode === "pinch" && pointers.size === 1) {
        // One finger left: carry on as a pan from where it is.
        mode = "pan";
        const [p] = [...pointers.values()];
        last = { x: p.x, y: p.y };
        return;
      }
      if (pointers.size > 0) return;
      delete root.dataset.dragging;
      // Only a one-finger drag moves the panel, decided when the finger lifts (Rule 3.4).
      if (mode === "pan" && !pinched) movePanel(dragMoved);
      if (mode === "pending" && e.type === "pointerup" && performance.now() - downAt.time < DOUBLE_TAP_MS) {
        onTap();
      }
      mode = "idle";
    };

    // Double-tap zooms in 2× around the tap, or back to the fit size at the maximum zoom. Not on
    // a box: a tap there opens it.
    const onTap = () => {
      const tap = { x: downAt.x, y: downAt.y, time: downAt.time, onBox: downAt.onBox };
      const prev = lastTap;
      lastTap = tap;
      if (
        !prev ||
        tap.time - prev.time > DOUBLE_TAP_MS ||
        Math.hypot(tap.x - prev.x, tap.y - prev.y) > DOUBLE_TAP_DISTANCE ||
        tap.onBox ||
        prev.onBox
      ) {
        return;
      }
      lastTap = null;
      if (store.get().scale >= limits().max * 0.99) fit();
      else zoomBy(2, tap, true);
    };

    // Safari's own pinch events (desktop trackpad). On iOS, touch pointers handle pinch instead.
    let gestureStart = 0;
    let lastGesture = 0;
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = store.get().scale;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      lastGesture = performance.now();
      if (!latest.current.gestures || pointers.size > 0) return;
      const g = e as GestureEvent;
      zoomBy((gestureStart * g.scale) / store.get().scale, { x: g.clientX, y: g.clientY });
    };

    const onWheel = (e: WheelEvent) => {
      // Never let the page scroll or the browser zoom.
      e.preventDefault();
      if (!latest.current.gestures) return;
      stopAnimation();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey) {
        // A trackpad pinch, or Ctrl + wheel. Safari may also send gesture events for the same pinch.
        if (performance.now() - lastGesture < 100) return;
        zoomBy(Math.exp(-dy * 0.01), { x: e.clientX, y: e.clientY });
      } else if (isMouseWheel(e)) {
        zoomBy(Math.exp(-dy * 0.002), { x: e.clientX, y: e.clientY });
      } else {
        // Trackpad two-finger scrolling pans.
        panBy(-dx, -dy, true);
      }
    };

    // Ctrl + wheel and Safari's pinch over the UI panel or a card would zoom the page.
    const onWindowWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const { gestures } = latest.current;
      if (e.ctrlKey || e.metaKey) {
        if (e.altKey || !["+", "=", "-", "_", "0"].includes(e.key)) return;
        // The browser's zoom shortcuts zoom the image instead.
        e.preventDefault();
        if (!gestures) return;
        if (e.key === "0") fit();
        else zoomBy(e.key === "-" || e.key === "_" ? 1 / KEY_ZOOM : KEY_ZOOM, areaCentre(), true);
        return;
      }
      if (!gestures || e.altKey || e.defaultPrevented || isTextField(document.activeElement)) return;
      if (e.key === "+" || e.key === "=") zoomBy(KEY_ZOOM, areaCentre(), true);
      else if (e.key === "-" || e.key === "_") zoomBy(1 / KEY_ZOOM, areaCentre(), true);
      else if (e.key === "ArrowLeft") panBy(KEY_PAN, 0, true);
      else if (e.key === "ArrowRight") panBy(-KEY_PAN, 0, true);
      else if (e.key === "ArrowUp") panBy(0, KEY_PAN, true);
      else if (e.key === "ArrowDown") panBy(0, -KEY_PAN, true);
      else return;
      e.preventDefault();
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    root.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("wheel", onWindowWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("gesturestart", onGestureStart);
    document.addEventListener("gesturechange", onGestureChange);
    document.addEventListener("gestureend", preventDefault);
    return () => {
      window.clearTimeout(settleTimer);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      root.removeEventListener("wheel", onWheel);
      window.removeEventListener("wheel", onWindowWheel);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("gesturestart", onGestureStart);
      document.removeEventListener("gesturechange", onGestureChange);
      document.removeEventListener("gestureend", preventDefault);
    };
  }, [store, apply, clamp, animateTo, stopAnimation]);

  useEffect(() => stopAnimation, [stopAnimation]);

  return { rootRef, stageRef, store: store as ViewStore, zoomTo };
}

function createStore() {
  let view: View = { scale: 0, x: 0, y: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => view,
    set: (next: View) => {
      view = next;
      for (const l of listeners) l();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const preventDefault = (e: Event) => e.preventDefault();

/**
 * A mouse wheel zooms, while trackpad scrolling pans (Rule 2.1). Browsers don't say which device
 * sent a wheel event, so guess: mouse wheels scroll in lines, or in large whole steps on one axis;
 * trackpads in small, often fractional, pixel steps on both.
 */
function isMouseWheel(e: WheelEvent) {
  if (e.deltaMode !== 0) return true;
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
}
