# Architecture

## Overview

A single Next.js (App Router, TypeScript) app serves pages and handles writes through server actions and route handlers. Postgres stores users, images and annotations via Prisma. Auth.js handles GitHub sign-in, with sessions stored in Postgres ([ADR 0007](adr/0007-authjs-v5-beta.md)). Image files live in Cloudflare R2 and are served from its public URL. Annotorious draws and renders regions in the browser.

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
| User | id, name, email, image, createdAt |
| Image | id, ownerId, title, description, storageKey, width, height, createdAt |
| Annotation | id, imageId, authorId, x, y, w, h (all 0–1), bodyMarkdown, createdAt, updatedAt |

Regions are stored as **fractions of the image's width and height**, not pixels, so they stay aligned at any display size ([ADR 0005](adr/0005-fractional-region-coordinates.md)). Annotorious works in pixel coordinates of the natural image, so the client converts using the stored `width` and `height`.

`Account`, `Session` and `VerificationToken` are Auth.js's tables, in the shape its Prisma adapter expects.

## Sign-in

- GitHub OAuth via Auth.js v5 (`src/auth.ts`), routes under `/api/auth/*`.
- Database sessions: the cookie holds a random token, and `auth()` looks it up in the `Session` table. Signing out deletes the row.
- `getCurrentUser()` (`src/lib/current-user.ts`) returns the signed-in user or null. Pages use it to decide what to show; every server action checks it too, because server actions can be called by direct POST.
- No proxy (middleware) check: database sessions can't be verified there without a database call, and only `/upload` is restricted.

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
src/auth.ts           Auth.js config (GitHub provider, Prisma adapter)
src/lib/              Server utilities (db client, storage, current user)
src/generated/prisma  Generated Prisma Client (gitignored)
```

## Upload flow

Uploading requires sign-in; both server actions reject anonymous calls.

1. The browser checks type (JPEG, PNG, WebP) and size (10 MB) and calls the `requestUpload` server action.
2. The server validates again and returns a 5-minute signed `PUT` URL for a random key under `images/`. Content type and length are part of the signature.
3. The browser uploads the file straight to R2.
4. `createImage` checks the object exists and is valid, reads the pixel size from the file's header (correcting for EXIF rotation), and creates the `Image` row.

## Annotation flow

1. The image page (`src/app/images/[id]/page.tsx`) loads the image with its annotations and each author's name, and passes them to a client component, `annotated-image.tsx`. It sends only the fields the browser needs.
2. Annotorious draws each saved region, converting fractions to pixels with the image's stored size. Larger regions are added first, so smaller ones sit on top and stay clickable. Clicking a region, or its entry in the list beside the image, shows its Markdown.
3. Signed-in users click **Annotate** to turn on drawing, then drag a box. That box is a draft: it isn't saved yet, and it can be moved or resized. Only one draft exists at a time.
4. **Save** reads the box as it is now, converts it to fractions, and calls the `createAnnotation` server action with the text.
5. The action checks the session, the region (inside the image and not tiny) and the text (not empty, at most 5,000 characters), then creates the `Annotation` row. It calls `refresh()`, so the page re-renders with the new region, which is then selected.

Annotation text is untrusted, so it's rendered without HTML or images ([ADR 0008](adr/0008-markdown-rendering.md)).

## Known gaps

- An upload abandoned between steps 3 and 4 leaves an orphaned object in R2. A periodic cleanup of keys with no `Image` row would fix this.
- The home grid loads full-size images as thumbnails; resized variants would cut bandwidth.
