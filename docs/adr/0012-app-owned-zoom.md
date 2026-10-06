# 12. The image page owns zoom, with a custom view around Annotorious

Date: 2026-10-06 · Status: Accepted

## Context

The artwork-led image page ([enrich-UI.md](../enrich-UI.md)) fills the screen with the image, lets the user zoom and pan it, and keeps the UI panel and annotation cards a constant size on screen. So the app must zoom the image itself instead of letting the browser zoom the page. It also has precise rules about where the image sits: against the safe area and the on-screen keyboard, at the edge opposite the UI panel, and auto-zoomed so a box and its card fill the screen side by side.

Two ways to do it:

- **OpenSeadragon** with `@annotorious/openseadragon`. Mature, with inertia and tiled deep zoom, but its own viewport model, constraints and canvas rendering. Fitting it to the safe area, the keyboard and the panel rules would mean working against its constraints, and it would replace the `ImageAnnotator` setup ([ADR 0004](0004-annotorious.md)).
- **A custom view** around the current `ImageAnnotator`. Annotorious 3.9 maps pointer positions through the SVG's bounding box and viewBox, deliberately so it works inside a pan-zoom wrapper (see `Transform.ts` in `@annotorious/annotorious`), and draws strokes with `vector-effect: non-scaling-stroke`.

## Decision

Use a custom view (`src/app/images/[id]/use-zoom-view.ts`), keeping `ImageAnnotator`.

- **Sizing, not scaling.** The image and Annotorious's overlay sit in a "stage" element whose width and height are set to the image's on-screen size, and which is moved with `translate`. Resizing (rather than a CSS `scale`) keeps the image sharp and lets Annotorious's ResizeObserver keep its handles a constant size.
- **The view lives outside React state.** A pan or pinch restyles the stage directly; cards follow it through a small store (`useSyncExternalStore`), so the page doesn't re-render on every frame.
- **The geometry is pure functions** (`src/lib/view-geometry.ts`): fit, zoom and pan limits, where the panel and cards go, and the auto-zoom.
- **Measuring the screen** (`src/lib/use-screen-layout.ts`): the safe area from `env(safe-area-inset-*)` (the image page sets `viewport-fit=cover`), and the keyboard from `visualViewport`, as before.
- **Taking over the browser's zoom:** `touch-action: none` on the viewer, non-passive `wheel` listeners that cancel Ctrl + wheel, Ctrl + `+` / `-` / `0` handled as image zoom, and Safari's `gesture*` events cancelled. iOS ignores `user-scalable=no`, so this is what stops page zoom. Text fields are 16 px on phones so iOS doesn't zoom into them.
- **Taps vs drags:** a drag captures the pointer once it moves a few pixels, so Annotorious never sees its `pointerup` and doesn't treat it as a click on a box.
- **The site header** moved into a `(site)` route group layout, so the image page can use the whole screen; its links are in the UI panel.

## Consequences

- No new dependency, and the Annotorious setup, styles and hit-testing (ADR 0011) are unchanged.
- No inertia ("fling") after a pan, and no tiled images: zooming to 4× native pixels shows the full-size original, scaled up. Tiles can come later, and would argue for revisiting OpenSeadragon.
- A mouse wheel and trackpad scrolling can't be told apart reliably. The page guesses (`isMouseWheel` in `use-zoom-view.ts`): line-based or large whole-number steps on one axis zoom, everything else pans.
- Gestures need checking on real phones (MAN-07, MAN-09 and MAN-10 in [system-tests.md](../system-tests.md)); emulators don't reproduce touch or keyboards faithfully.
