# Proposal: an artwork-led image page

Date: 2026-10-03 · Status: Implemented (2026-10-06, see [ADR 0012](adr/0012-app-owned-zoom.md))

## Aim

Today's image page is functional: a header, a title and description, the image at a fixed width, and a side panel of annotations. This proposal replaces it with a view driven by the artwork itself. The image fills the screen, the user explores it by zooming and dragging, and the controls stay out of the way of wherever they're heading. Annotations appear on the artwork, next to the part they describe, instead of in a separate panel.

The aim is immersion: the experience should feel like looking closely at a painting, with the commentary appearing beside the detail you're looking at.

## Terms

| Term | Meaning |
| --- | --- |
| **Viewport** | The browser window's visible area. It's **portrait** if taller than wide, otherwise **landscape**. |
| **Visible area** | The safe area minus anything an on-screen keyboard covers. Without a keyboard, it's the safe area. See Rule 8. |
| **Safe area** | The part of the viewport not covered by a phone's notch, camera cut-out, rounded corners or home indicator. On screens without these, it's the whole viewport. See Rule 7. |
| **Short edges** | The two edges along the viewport's shorter dimension: top and bottom in portrait, left and right in landscape. |
| **Fit size** | The zoom at which the whole image is visible (see Rule 1). |
| **UI panel** | Everything that isn't the artwork or an annotation: site name, title, description, the Annotate button, sign-in, Upload, Edit details, Delete image, the annotation list, the hide-boxes toggle, the zoom buttons (mouse and trackpad only), the UI flip button and the Report link. |
| **Box** | An annotation's region, drawn as an outline on the image. |
| **Card** | An annotation's text, shown floating next to its box. Also the form for writing or editing an annotation. |
| **Selected** | The annotation whose card is open. At most one at a time. |

## Scope

This covers the image page (`/images/[id]`). The home page and upload page are unchanged for now, though they'd later need a visual style to match (see Open questions).

## Rules

### 1. Initial view

1.1. The image is scaled so the whole of it is visible: it fills the viewport edge to edge in whichever dimension runs out of room first, keeping its proportions. This is the **fit size**.

1.2. If there's spare space along one dimension, the image sits at the edge **opposite the UI panel**, so the spare space is under the panel. With the panel in its default position, that means the image is at the top in portrait and on the left in landscape.

> **Example:** a 100 × 200 (portrait) viewport and a 400 × 500 image. Width is the limiting dimension (400 → 100, a scale of 0.25), so the image is shown at 100 × 125, at the top of the viewport. The UI panel defaults to the bottom edge, in the 75 px of spare space below it.

### 2. Zoom and pan

2.1. **The app owns zoom.** It zooms and pans the image itself instead of using the browser's page zoom, so the UI panel and cards can stay a constant size on screen. On the image page, the app takes over:

| Input | Action |
| --- | --- |
| Pinch (touch) | Zoom around the pinch point |
| One-finger drag (touch) | Pan |
| Mouse drag | Pan |
| Mouse wheel | Zoom around the cursor |
| Trackpad pinch | Zoom around the cursor |
| Trackpad two-finger scroll | Pan |
| Ctrl + `+` / Ctrl + `-` | Zoom around the viewport centre |

2.2. The browser's own zoom slider can't be intercepted. It acts as accessibility zoom: it makes the UI panel and cards larger, and the image refits to the new viewport.

2.3. **Zoom limits:** the minimum is the fit size. The maximum is 4× native pixels (one image pixel covers 4 screen pixels), but always at least 4× the fit size, so small images can still be zoomed.

2.4. **Pan limits:** along a dimension where the image is larger than the viewport, the user can't pan past the image's edge, so no background shows on that axis. Along a dimension where it's smaller, Rule 1.2 positions it.

2.5. In annotate mode, the user can't zoom or pan (see Rule 6.1).

### 3. The UI panel

3.1. The UI panel stays a constant on-screen size, whatever the image's zoom, and is fixed to one edge of the viewport.

3.2. It's always on a **short edge**: top or bottom in portrait, left or right in landscape.

3.3. **Default position:** the bottom in portrait, the right in landscape.

3.4. **It moves away from where the user is heading.** After a drag, the panel moves to the short edge the user is moving away from, so it never covers the part of the image coming into view:

- In **portrait**, only the vertical part of the drag counts. A drag that moves the image up (revealing more of its lower part) puts the panel at the top; a drag that moves the image down puts it at the bottom.
- In **landscape**, only the horizontal part counts. A drag that moves the image left (revealing more of its right side) puts the panel on the left; a drag that moves the image right puts it on the right.

3.5. The panel has a **flip button** that moves it to the opposite short edge in one tap.

3.6. When the panel changes edge, by dragging or the flip button, Rule 1.2 applies again: an image smaller than the viewport moves to the opposite edge, keeping the spare space under the panel.

3.7. The panel is **hidden while a card is open** (Rule 5.8), and comes back when it closes.

3.8. On devices with a mouse or trackpad, the panel has **zoom in and zoom out buttons** next to the flip button. They zoom one step around the centre of the visible area, like `+` and `-`, and are disabled in annotate mode. They're a fallback for browsers that don't pass trackpad pinches to the page, such as some on Linux under X11. Touch screens don't show them: pinch works there.

### 4. Annotation boxes

4.1. By default, every annotation's box is outlined on the image.

4.2. A small button in the UI panel **hides all boxes**, for an unobstructed view of the artwork. Entering annotate mode turns boxes back on.

4.3. Tapping or clicking a box selects it: its card opens, with the auto-zoom in Rule 5. Selecting another box replaces it.

4.4. Hovering over a box doesn't show its text: reading always needs an explicit tap or click ([ADR 0011](adr/0011-regions-and-overlap.md)). The open box is drawn prominently and the others recede, so it's always clear which box the card belongs to.

4.5. The UI panel has an **annotation list** (a collapsible "N annotations" button). Picking an annotation from it selects it, as in Rule 4.3. This replaces today's side panel.

### 5. Cards and auto-zoom

5.1. A card floats next to its box, not in a panel beside or below the image. It may cover other parts of the image.

5.2. **Which side of the box:** in portrait, the card is always **above or below** the box. In landscape, it's always **to the left or right**.

5.3. The card goes on the side **nearer the centre of the image** (comparing the box's centre with the image's centre along that axis), so it covers artwork rather than empty background.

5.4. **Tie-break:** if the box is centred on that axis, within a few percent, the card goes on whichever side has more image between the box and the image's edge. If they're equal, it goes below (portrait) or to the right (landscape).

5.5. **Card size:** the card stays a constant on-screen size, like the UI panel: at most about 360 px wide in landscape, or 40% of the viewport height in portrait. Long text scrolls inside the card.

5.6. **Auto-zoom:** when a box is selected or a new box is drawn, the view zooms and pans so the box and its card sit side by side and fill the viewport. The box is shown with **padding** around it, not as large as possible:

- The padding never extends past the image's edge. A box along the image's edge has no padding on that side.
- The padding never forces the zoom outside its limits (Rule 2.3).

5.7. **Box too big:** if the box and card can't fit side by side even at the fit size, the view stays at the fit size. The card then floats over the part of the box nearest the image centre, with a translucent backdrop so its text stays readable.

5.8. While a card is open, the UI panel is hidden, so the box and card can use the whole viewport.

5.9. The auto-zoom is animated, but instant if the user's system asks for reduced motion.

5.10. **Closing a card** (tapping empty image, pressing Escape, or the card's close button) leaves the zoom and position as they are. The user has just been brought to an interesting detail and may want to explore from there.

### 6. Annotate mode

6.1. In annotate mode, a one-finger or mouse drag draws a box, so **zooming and panning are off**. Users position the view before turning on annotate mode.

6.2. Turning on annotate mode shows all boxes (Rule 4.2).

6.3. Drawing a box opens the **annotation form as a card** beside it, placed and auto-zoomed as in Rule 5. The auto-zoom is the one view change allowed in annotate mode.

6.4. After saving, the new annotation stays visible with its card open, like any selected annotation. Because it's the user's own, the card has **Edit** and **Delete** buttons.

6.5. **Delete** asks "Are you sure?" in the page, not with a browser dialog, as today.

6.6. The user **stays in annotate mode** after saving, so they can draw another box nearby. Drawing a new box closes the previous card.

### 7. Safe areas

Phones with notches, camera cut-outs, rounded corners or a home indicator have a **safe area**: the part of the screen where content is never obscured. The image page uses the whole screen, but treats the safe area as the space that matters.

7.1. **The UI panel and cards always stay inside the safe area**, so no control or text is ever cut off or hidden behind a notch.

7.2. **Fitting and limits are measured against the safe area, not the full screen.** Wherever Rules 1–5 say "viewport" for fitting the image, zoom limits, pan limits, the short edges, or the space the auto-zoom fills, read "safe area":

- At the fit size (Rule 1.1), the whole image is inside the safe area.
- The pan limits (Rule 2.4) stop the image's edge at the edge of the safe area, not the screen. The user can always bring any part of the image into the safe area.
- The auto-zoom (Rule 5.6) fits the box and its card inside the safe area.

7.3. **Zoomed in, the image can extend beyond the safe area**, under the notch and into the rounded corners, to the very edge of the screen. This serves the immersion goal: the artwork fills the device, not just a rectangle inside it. Only the image does this: the UI panel and cards never do (Rule 7.1).

> **Example:** a phone in landscape with a camera cut-out on the left. At the fit size, the image sits inside the safe area, clear of the cut-out. The user zooms in, and the painting now runs all the way to the left edge of the screen, around the cut-out. When they pan to the painting's left edge, it stops at the safe area's edge, so its last strip is fully visible, not hidden under the cut-out.

### 8. The on-screen keyboard

On phones and tablets, writing or editing an annotation opens an on-screen keyboard that covers the bottom of the screen, often a third to a half of it. Content the layout puts there is hidden, though the page doesn't know it.

8.1. **While the keyboard is open, the visible area is what counts.** Rule 7.2 measures fitting and limits against the safe area; while the keyboard is open, those same calculations use the **visible area**: the safe area minus the part the keyboard covers.

8.2. **The card being typed into and its box both stay in the visible area.** When the keyboard opens, the view re-runs the auto-zoom (Rule 5.6) within the visible area, so the box and its card sit side by side above the keyboard. If they can't both fit even at the fit size, the card goes directly above the keyboard and the box as close above it as possible (Rule 5.7's overlap applies). The card's text field must never be behind the keyboard.

8.3. **The card shrinks before the box disappears.** In the smaller visible area, the card's maximum size (Rule 5.5) is measured against the visible area, and long text scrolls inside it.

8.4. **When the keyboard closes,** the view expands back to the safe area without moving the box: the extra space appears around it, and no new auto-zoom runs.

8.5. **The UI panel** is hidden while a card is open (Rule 5.8), so the keyboard never pushes it around.

> **Example:** a phone in portrait. The user draws a box in the lower half of a painting, and the card opens above it (closer to the image centre, Rule 5.3). They tap the text field and the keyboard covers the bottom 45% of the screen, including the box. The view re-zooms within the upper 55%: box and card now both sit above the keyboard. They save, the keyboard closes, and the box stays where it is with the extra space below it.

## Worked examples

**Drag on a phone.** Portrait viewport, image zoomed in, panel at the bottom (default). The user drags up and slightly left, so the image moves up and they see more of its lower part. Only the vertical part counts (Rule 3.4), so the panel moves to the top, away from where they're heading.

**Card placement on a laptop.** Landscape viewport. The user clicks a box in the left third of a painting. Cards go left or right in landscape (Rule 5.2), and the image's centre is to the box's right, so the card goes on the right (Rule 5.3). The UI panel hides, and the view zooms so the box (with padding) and the card fill the screen side by side.

**Box at the image's edge.** A box runs along the image's top edge. When it's selected, its padding is left off on the top side (Rule 5.6), so the view doesn't show background above the image.

## Implementation notes

These aren't decisions. They're things the implementation will need to settle, some in a new ADR.

- **Taking over zoom:** browsers zoom pages natively on pinch and Ctrl+scroll. The image page will need `touch-action: none` on the viewer, `preventDefault` on wheel events with `ctrlKey` (registered as non-passive), handling for Ctrl + `+` / `-` key presses, and on iOS Safari, the `gesturestart` events. iOS ignores `user-scalable=no`, so the CSS and event handling must do the work.
- **A zoom library:** OpenSeadragon is a mature zoom-and-pan viewer for large images. It handles pinch, wheel, inertia and zoom limits, and Annotorious has an official OpenSeadragon plugin (`@annotorious/openseadragon`). Adopting it would replace the current `ImageAnnotator` setup ([ADR 0004](adr/0004-annotorious.md)) and should get its own ADR. The alternative is a lighter custom transform around the current `ImageAnnotator`.
- **Deep zoom:** zooming to 4× native pixels on large paintings means downloading full-size originals. Tiled images (generated at upload and stored in R2) would cut bandwidth, but can come later.
- **Detecting the keyboard:** no browser reports the keyboard directly. `window.visualViewport` (iOS Safari and Android Chrome) shrinks when it opens, while the layout viewport doesn't, so the covered height is `innerHeight − visualViewport.height − visualViewport.offsetTop`, counted only while `visualViewport.scale` is about 1 (pinch-zoom shrinks it too). With app-owned zoom (Rule 2.1), the browser's own zoom stays at 1, so this is reliable. The image page uses this in `src/lib/use-screen-layout.ts`, and sets `interactiveWidget: "resizes-content"` so Android shrinks the layout viewport instead. Hardware keyboards and iPad floating keyboards cover nothing, and correctly change nothing. Emulators don't reproduce mobile keyboards faithfully, so this needs real phones.
- **Safe areas:** by default, mobile browsers keep the page inside the safe area, so the image could never reach the screen's edge. Setting `viewportFit: "cover"` in the root layout's `viewport` export lets the page draw edge to edge. The CSS values `env(safe-area-inset-top)`, `-right`, `-bottom` and `-left` then give the insets, for positioning the UI panel and cards and for the fit and pan calculations. They're 0 on screens without cut-outs.
- **Stored regions are unaffected:** regions are fractions of the image ([ADR 0005](adr/0005-fractional-region-coordinates.md)), so they don't depend on zoom.
- **System tests:** MAN-07, ANN-02 and other image page tests in [system-tests.md](system-tests.md) would need rewriting, and real-phone testing (as in PROD-05) matters even more for gestures.

## Open questions

Defaults proposed for points the rules above don't settle yet:

| Question | Proposed default |
| --- | --- |
| When does the UI panel move: as soon as a drag crosses a small threshold, or when the finger lifts? | When the finger lifts, using the drag's overall direction, ignoring drags under about 24 px. This avoids the panel jumping around mid-drag. |
| Do trackpad two-finger scrolling and keyboard panning move the UI panel, like a drag? | Yes. They're the same intent. |
| When the device rotates or the window is resized, where do the panel and view go? | Keep the same point of the image centred and the same zoom relative to the fit size. Map the panel to the matching edge: bottom ↔ right, top ↔ left. |
| After leaving annotate mode, do boxes stay visible if the user had hidden them before? | Stay visible. The user can hide them again with one tap. |
| Keyboard and screen reader access? | Arrow keys pan, `+` and `-` zoom, Tab moves through the boxes in list order and Enter selects. Each box has a label from the start of its text. The annotation list in the UI panel gives an alternative to finding boxes visually. |
| Double-tap to zoom? | Double-tap zooms in 2× around the tap point; at the maximum zoom, it returns to the fit size. |
| Signed-out visitors? | The Annotate button is replaced by Sign in, as today. Everything else is the same. |
| The home and upload pages? | Out of scope here. A follow-up proposal should restyle them to match (e.g. a full-bleed grid on the home page). |
