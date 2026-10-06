"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { orientationOf, type Orientation, type Rect, type Size } from "./view-geometry";

export type ScreenLayout = {
  /** The layout viewport. */
  screen: Size;
  /**
   * The visible area (docs/enrich-UI.md, Rules 7 and 8): the safe area, minus whatever an
   * on-screen keyboard covers. Fitting, zoom and pan limits, the UI panel and cards use this.
   */
  area: Rect;
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
 *   Pinch-zoom also shrinks the visual viewport, but the image page owns zoom, so the browser's
 *   stays at 1; a shrink only counts while it is.
 * - **Orientation** only changes when the width does, so a keyboard shrinking the height of a
 *   portrait phone doesn't turn it into landscape.
 *
 * Null until measured, and on the server.
 */
export function useScreenLayout(): ScreenLayout | null {
  const [layout, setLayout] = useState<ScreenLayout | null>(null);
  // The tallest layout viewport seen at each width, to spot Android's keyboard shrinking it.
  const tallest = useRef(new Map<number, number>());

  // Before paint, so the first frame already shows the image at the fit size.
  useLayoutEffect(() => {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;inset:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);

    const measure = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const cs = getComputedStyle(probe);
      const top = parseFloat(cs.paddingTop) || 0;
      const right = parseFloat(cs.paddingRight) || 0;
      const bottom = parseFloat(cs.paddingBottom) || 0;
      const left = parseFloat(cs.paddingLeft) || 0;

      let visibleTop = 0;
      let visibleBottom = H;
      const vv = window.visualViewport;
      if (vv && Math.abs(vv.scale - 1) < 0.01) {
        visibleTop = Math.max(0, vv.offsetTop);
        visibleBottom = Math.min(H, vv.offsetTop + vv.height);
      }
      const y = Math.max(top, visibleTop);
      const yEnd = Math.min(H - bottom, visibleBottom);
      const area = { x: left, y, w: Math.max(1, W - left - right), h: Math.max(1, yEnd - y) };

      const tallestHere = Math.max(tallest.current.get(W) ?? 0, H);
      tallest.current.set(W, tallestHere);
      const typing = isTextField(document.activeElement);
      const keyboard = typing && (visibleBottom < H - 40 || H < tallestHere - 80);

      setLayout((prev) => {
        const orientation =
          prev && prev.screen.w === W ? prev.orientation : orientationOf({ w: W, h: H });
        const next = { screen: { w: W, h: H }, area, orientation, keyboard };
        return prev && sameLayout(prev, next) ? prev : next;
      });
    };

    measure();
    const vv = window.visualViewport;
    window.addEventListener("resize", measure);
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    // A field gaining or losing focus is when a keyboard opens or closes; its resize may come later.
    document.addEventListener("focusin", measure);
    document.addEventListener("focusout", measure);
    return () => {
      probe.remove();
      window.removeEventListener("resize", measure);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      document.removeEventListener("focusin", measure);
      document.removeEventListener("focusout", measure);
    };
  }, []);

  return layout;
}

export function isTextField(el: Element | null) {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !["button", "submit", "checkbox", "radio"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

function sameLayout(a: ScreenLayout, b: ScreenLayout) {
  return (
    a.screen.w === b.screen.w &&
    a.screen.h === b.screen.h &&
    a.area.x === b.area.x &&
    a.area.y === b.area.y &&
    a.area.w === b.area.w &&
    a.area.h === b.area.h &&
    a.orientation === b.orientation &&
    a.keyboard === b.keyboard
  );
}
