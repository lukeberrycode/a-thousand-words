// Mark this file as client code, since it uses browser APIs.
"use client";

// Import the React hooks used below.
import { useLayoutEffect, useRef, useState } from "react";

// Import the orientation helper and the geometry types.
import { orientationOf, type Orientation, type Rect, type Size } from "./view-geometry";

// Everything the image page needs to know about the screen.
export type ScreenLayout = {
  /** The layout viewport. */
  screen: Size;
  /**
   * The visible area (docs/enrich-UI.md, Rules 7 and 8): the safe area, minus whatever an
   * on-screen keyboard covers. Fitting, zoom and pan limits, the UI panel and cards use this.
   */
  area: Rect;
  // Whether the screen is portrait or landscape.
  orientation: Orientation;
  /** Whether an on-screen keyboard is probably open. */
  keyboard: boolean;
};

/**
 * Measures the screen for the image page's view.
 *
 * - **Safe area:** read from `env(safe-area-inset-*)` on a hidden element. They're 0 unless the
 *   page sets `viewport-fit=cover` and the screen has a notch, cut-out or rounded corners.
 * - **Keyboard:** no browser reports it directly. On iOS Safari (and Android without
 *   `interactive-widget=resizes-content`), it shrinks only the visual viewport, so the visible
 *   part is `visualViewport.offsetTop` to `offsetTop + height`. With `resizes-content` (set on the
 *   image page), Android shrinks the layout viewport instead, so `innerHeight` already excludes it.
 *   Pinch-zoom also shrinks the visual viewport, so a shrink only counts as a keyboard at scale 1.
 * - **Browser pinch-zoom:** the image page owns zoom, so the browser's should stay at 1. If it
 *   doesn't, the area is the part of the layout viewport still visible, so the panel stays on screen.
 * - **Orientation** only changes when the width does, so a keyboard shrinking the height of a
 *   portrait phone doesn't turn it into landscape.
 *
 * Null until measured, and on the server.
 */
export function useScreenLayout(): ScreenLayout | null {
  // The latest measurement, or null before the first one.
  const [layout, setLayout] = useState<ScreenLayout | null>(null);

  // The tallest layout viewport seen at each width, to spot Android's keyboard shrinking it.
  const tallest = useRef(new Map<number, number>());

  // Before paint, so the first frame already shows the image at the fit size.
  useLayoutEffect(() => {
    // Make an invisible element to read the safe-area insets from.
    const probe = document.createElement("div");

    // Hide it from screen readers.
    probe.setAttribute("aria-hidden", "true");

    // Fill the screen, stay invisible, and use the safe-area insets as padding.
    probe.style.cssText =
      // Fix it to the whole screen, invisible and untouchable...
      "position:fixed;inset:0;visibility:hidden;pointer-events:none;" +
      // ...and pad it by each safe-area inset, so we can read the numbers back.
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";

    // Add it to the page.
    document.body.appendChild(probe);

    // Take one measurement and store it.
    const measure = () => {
      // The layout viewport's width.
      const W = window.innerWidth;

      // The layout viewport's height.
      const H = window.innerHeight;

      // The probe's computed style.
      const cs = getComputedStyle(probe);

      // The top safe-area inset.
      const top = parseFloat(cs.paddingTop) || 0;

      // The right safe-area inset.
      const right = parseFloat(cs.paddingRight) || 0;

      // The bottom safe-area inset.
      const bottom = parseFloat(cs.paddingBottom) || 0;

      // The left safe-area inset.
      const left = parseFloat(cs.paddingLeft) || 0;

      // The visible part of the layout viewport: start with all of it.
      let visibleLeft = 0;

      // The right edge of the visible part.
      let visibleRight = W;

      // The top edge of the visible part.
      let visibleTop = 0;

      // The bottom edge of the visible part.
      let visibleBottom = H;

      // The visual viewport, if the browser has one.
      const vv = window.visualViewport;

      // If it exists, use it to narrow the visible part.
      if (vv) {
        // The visible part starts at the visual viewport's top.
        visibleTop = Math.max(0, vv.offsetTop);

        // And ends at its bottom.
        visibleBottom = Math.min(H, vv.offsetTop + vv.height);

        // The browser's own pinch-zoom should stay at 1, but can slip through (say, a touchscreen
        // pinch before hydration), and Chrome restores it on reload. Keep to the part still visible.
        if (Math.abs(vv.scale - 1) >= 0.01) {
          // Narrow the left edge.
          visibleLeft = Math.max(0, vv.offsetLeft);

          // Narrow the right edge.
          visibleRight = Math.min(W, vv.offsetLeft + vv.width);
        }
      }

      // The area's left edge: the safe area or the visible part, whichever is further in.
      const x = Math.max(left, visibleLeft);

      // The area's right edge.
      const xEnd = Math.min(W - right, visibleRight);

      // The area's top edge.
      const y = Math.max(top, visibleTop);

      // The area's bottom edge.
      const yEnd = Math.min(H - bottom, visibleBottom);

      // The area as a rectangle, at least 1 pixel in each direction.
      const area = { x, y, w: Math.max(1, xEnd - x), h: Math.max(1, yEnd - y) };

      // The tallest viewport seen at this width.
      const tallestHere = Math.max(tallest.current.get(W) ?? 0, H);

      // Remember it.
      tallest.current.set(W, tallestHere);

      // Whether a text field has focus.
      const typing = isTextField(document.activeElement);

      // Whether the browser's pinch-zoom is at 1.
      const unzoomed = !vv || Math.abs(vv.scale - 1) < 0.01;

      // A keyboard is probably open if a field has focus and the viewport has shrunk.
      const keyboard = typing && ((unzoomed && visibleBottom < H - 40) || H < tallestHere - 80);

      // Store the measurement.
      setLayout((prev) => {
        // Keep the old orientation unless the width changed.
        const orientation = prev && prev.screen.w === W ? prev.orientation : orientationOf({ w: W, h: H });

        // The new layout.
        const next = { screen: { w: W, h: H }, area, orientation, keyboard };

        // If nothing changed, keep the old object so React doesn't re-render.
        return prev && sameLayout(prev, next) ? prev : next;
      });
    };

    // Measure once now.
    measure();

    // The visual viewport, if there is one.
    const vv = window.visualViewport;

    // Measure when the window resizes.
    window.addEventListener("resize", measure);

    // Measure when the visual viewport resizes.
    vv?.addEventListener("resize", measure);

    // Measure when the visual viewport scrolls.
    vv?.addEventListener("scroll", measure);

    // A field gaining or losing focus is when a keyboard opens or closes; its resize may come later.
    document.addEventListener("focusin", measure);

    // Measure when focus leaves a field.
    document.addEventListener("focusout", measure);

    // Return the cleanup function.
    return () => {
      // Remove the probe element.
      probe.remove();

      // Stop listening for window resizes.
      window.removeEventListener("resize", measure);

      // Stop listening for visual viewport resizes.
      vv?.removeEventListener("resize", measure);

      // Stop listening for visual viewport scrolls.
      vv?.removeEventListener("scroll", measure);

      // Stop listening for focus changes.
      document.removeEventListener("focusin", measure);

      // Stop listening for focus leaving.
      document.removeEventListener("focusout", measure);
    };
  }, []);

  // Return the latest measurement.
  return layout;
}

// Whether an element is somewhere the user can type text.
export function isTextField(el: Element | null) {
  // No element means no.
  if (!el) return false;

  // A textarea is a text field.
  if (el instanceof HTMLTextAreaElement) return true;

  // An input is, unless it's a button, checkbox or radio.
  if (el instanceof HTMLInputElement) return !["button", "submit", "checkbox", "radio"].includes(el.type);

  // Otherwise, only if it's editable content.
  return el instanceof HTMLElement && el.isContentEditable;
}

// Whether two layouts are the same in every respect.
function sameLayout(a: ScreenLayout, b: ScreenLayout) {
  // Compare every field.
  return (
    // Same screen width.
    a.screen.w === b.screen.w &&
    // Same screen height.
    a.screen.h === b.screen.h &&
    // Same area left edge.
    a.area.x === b.area.x &&
    // Same area top edge.
    a.area.y === b.area.y &&
    // Same area width.
    a.area.w === b.area.w &&
    // Same area height.
    a.area.h === b.area.h &&
    // Same orientation.
    a.orientation === b.orientation &&
    // Same keyboard state.
    a.keyboard === b.keyboard
  );
}
