# 5. Fractional, rectangle-only region coordinates

Date: 2026-10-01 · Status: Accepted

## Context

An image is displayed at many sizes (phone, desktop, zoomed). Regions stored in display pixels would drift.

## Decision

- Store each region as `x, y, w, h`: fractions (0–1) of the image's intrinsic width and height.
- Support **rectangles only** in v1.

## Consequences

- Regions stay aligned at any display size and don't depend on any rendering library.
- Converting to and from Annotorious pixel coordinates needs the image's intrinsic size, so `Image.width` and `Image.height` are recorded at upload.
- Polygons would need a new representation (e.g. a JSON list of fractional points), handled with a migration and a new ADR.
