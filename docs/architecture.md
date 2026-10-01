# Architecture

## Overview

A single Next.js (App Router, TypeScript) app serves pages and handles writes through server actions and route handlers. Postgres stores users, images and annotations via Prisma. Image files live in Cloudflare R2 and are served from its public URL. Annotorious draws and renders regions in the browser.

```
Browser ── Next.js app ──┬── Postgres (Prisma)
   │                     └── R2 (signed upload URLs)
   └── image bytes ◄──────── R2 public URL
```

Uploads go straight from the browser to R2 with a short-lived signed URL, so large files never pass through the app server.

## Data model

See `prisma/schema.prisma`.

| Entity | Key fields |
| --- | --- |
| User | id, name, email, avatarUrl, createdAt |
| Image | id, ownerId, title, description, storageKey, width, height, createdAt |
| Annotation | id, imageId, authorId, x, y, w, h (all 0–1), bodyMarkdown, createdAt, updatedAt |

Regions are stored as **fractions of the image's width and height**, not pixels, so they stay aligned at any display size ([ADR 0005](adr/0005-fractional-region-coordinates.md)). Annotorious works in pixel coordinates of the natural image, so the client converts using the stored `width` and `height`.

## Key risks

- **Region alignment on resize and zoom:** fractional coordinates plus an overlay over the rendered image. Milestone 1 proves this.
- **Mobile interaction:** dragging a box conflicts with scrolling, so drawing only happens in an explicit "annotate mode".
- **Overlapping regions:** smaller regions render on top so they stay clickable.
- **Image storage and abuse:** size limits on signed uploads; a report/takedown path.

## Directory layout

```
docs/                 One-pager, architecture, ADRs, wireframes
prisma/               Schema and migrations
src/app/              Routes (App Router)
src/lib/              Server utilities (db client, storage)
src/generated/prisma  Generated Prisma Client (gitignored)
```
