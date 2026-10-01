# 4. Annotorious for the annotation layer

Date: 2026-10-01 · Status: Accepted

## Context

Drawing, selecting and rendering regions on an image is the core interaction, and it's fiddly: pointer and touch events, hit-testing overlapping shapes, scaling with the image. We could build an SVG overlay ourselves or use a library.

## Decision

Use **Annotorious** (`@annotorious/react`) for drawing and rendering regions, with our own UI around it (side panel, annotate mode, Markdown editor).

## Consequences

- Time goes into the product rather than the geometry code.
- Polygon regions (post-MVP) become a small change rather than a rewrite.
- Annotorious uses the W3C Web Annotation model in natural-image pixels; we map it to our fractional storage format ([ADR 0005](0005-fractional-region-coordinates.md)).
- If the library limits the UX, we can swap in a custom overlay later, since storage is independent of the library.
