"use client";

import { useEffect, useState } from "react";

/**
 * How much of the bottom of the screen an on-screen keyboard covers, and how tall the visible
 * area above it is, in CSS pixels. No browser reports the keyboard directly, so this compares
 * the visual viewport (what's visible) with the layout viewport.
 *
 * - iOS Safari, and Android without `interactive-widget=resizes-content`: the keyboard shrinks
 *   only the visual viewport, so `position: fixed; bottom: 0` ends up behind it. `inset` is the
 *   height to lift fixed content by.
 * - Android with `resizes-content` (set in the root layout): the layout viewport shrinks too,
 *   so `inset` stays 0 and fixed content already sits above the keyboard.
 *
 * Pinch-zoom also shrinks the visual viewport, so a shrink only counts while the page isn't
 * zoomed. `visibleHeight` is null until measured (and on the server).
 */
export function useKeyboardInset() {
  const [state, setState] = useState<{ inset: number; visibleHeight: number | null }>({
    inset: 0,
    visibleHeight: null,
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const zoomed = Math.abs(vv.scale - 1) > 0.01;
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setState({
        inset: zoomed ? 0 : Math.max(0, Math.round(covered)),
        visibleHeight: Math.round(vv.height),
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return state;
}
