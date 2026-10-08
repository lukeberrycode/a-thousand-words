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
| User | id, name, email, image, approvedAt, createdAt |
| Image | id, ownerId, title, description, storageKey, width, height, sha256, phash, createdAt |
| Region | id, imageId, authorId, x, y, w, h (all 0–1), createdAt, updatedAt |
| Annotation | id, regionId, authorId, bodyMarkdown, createdAt, updatedAt; at most one per user per region |
| Collection | id, slug, name, blurb, sortOrder, createdAt; a themed row on the home page |
| CollectionImage | collectionId, imageId, position; links collections and images many-to-many |

A region is a box on the image, holding one or more annotations by any users ([ADR 0011](adr/0011-regions-and-overlap.md)). Regions are stored as **fractions of the image's width and height**, not pixels, so they stay aligned at any display size ([ADR 0005](adr/0005-fractional-region-coordinates.md)). Annotorious works in pixel coordinates of the natural image, so the client converts using the stored `width` and `height`.

`Account`, `Session` and `VerificationToken` are Auth.js's tables, in the shape its Prisma adapter expects.

## Sign-in

- GitHub OAuth via Auth.js v5 (`src/auth.ts`), routes under `/api/auth/*`.
- Database sessions: the cookie holds a random token, and `auth()` looks it up in the `Session` table. Signing out deletes the row.
- `getCurrentUser()` (`src/lib/current-user.ts`) returns the signed-in user or null. Pages use it to decide what to show; every server action checks it too, because server actions can be called by direct POST.
- No proxy (middleware) check: database sessions can't be verified there without a database call, and only `/upload` is restricted.
- **Approval:** a first sign-in creates a **pending** account (`User.approvedAt` is null). Pending users can browse and read annotations like visitors, but every upload, annotation and image action refuses them, and the pages show "waiting for approval" instead of the upload form and Annotate button. The site owner approves accounts with `npm run prod:users` (`scripts/users.ts`), which lists pending accounts with their GitHub logins and approves one by login, email or id. The session callback copies approval into the session, so it takes effect on the user's next page load. Accounts that existed before approval was added were approved by its migration, and the seed user is created approved.

## Key risks

- **Region alignment on resize and zoom:** fractional coordinates plus an overlay over the rendered image. Milestone 1 proves this.
- **Mobile interaction:** dragging a box conflicts with panning, so drawing only happens in an explicit "annotate mode", where zoom and pan are off.
- **Overlapping regions:** smaller regions render on top so they stay clickable.
- **Image storage and abuse:** size limits on signed uploads; a report/takedown path.

## Directory layout

```
docs/                 One-pager, architecture, ADRs, wireframes
prisma/               Schema and migrations
src/app/              Routes (App Router); see "Routes and views" below
src/auth.ts           Auth.js config (GitHub provider, Prisma adapter)
src/lib/              Shared code: db client, storage, current user, validation, regions, duplicate check
src/generated/prisma  Generated Prisma Client (gitignored)
```

## Routes and views

Each URL is a separate page rendered on the server. Next.js then navigates between pages in the browser without full reloads, so the site behaves like a single-page app. Folders under `src/app` are URL paths, and `[id]` is a dynamic segment (any image ID). Only `page.tsx`, `layout.tsx` and `route.ts` create routes; other files in a folder belong to that page. Paths below are relative to `src/app/`.

```
layout.tsx  root: <html>, fonts, globals.css, viewport              server
├─ user-menu.tsx  UserMenu / SignInButton                            server
│
├─ (site)/layout.tsx  the site header, on every page but the image page
│  ├─ /              (site)/page.tsx                                 server
│  │    home: rows of recent images and of each collection (ADR 0014)
│  │  └─ ImageRow  (site)/image-row.tsx                             client
│  ├─ /upload        (site)/upload/page.tsx                          server
│  │  │  signed out → SignInButton (user-menu.tsx)
│  │  └─ UploadForm  (site)/upload/upload-form.tsx                   client
│  │       └─ DuplicateWarning (same file)
│  │       actions: (site)/upload/actions.ts
│  │                requestUpload, createImage, discardUpload
│  └─ /spike         (site)/spike/page.tsx, annotated-image.tsx, data.ts
│       milestone 1 prototype; not linked from the site
│
├─ /images/[id]      images/[id]/page.tsx                            server
│  │  loads the image and its annotations; 404 if the ID is unknown.
│  │  Full screen, no site header (docs/enrich-UI.md, ADR 0012)
│  ├─ AnnotatedImage images/[id]/annotated-image.tsx                 client
│  │    ├─ useZoomView  images/[id]/use-zoom-view.ts: zoom, pan, gestures
│  │    ├─ Annotorious ImageAnnotator: the image and its regions
│  │    ├─ FloatingCard: RegionCard, AnnotationItem, AnnotationEditor, ClashNotice
│  │    ├─ UiPanel   images/[id]/ui-panel.tsx: title, Annotate, list, About
│  │    └─ Markdown  images/[id]/markdown.tsx
│  ├─ ImageDetails   images/[id]/image-details.tsx (the panel's About)  client
│  │    byline, description, Edit details, Delete image
│  ├─ UserMenu, ReportLink (the panel's About; ReportLink in page.tsx)  server
│  └─ actions: images/[id]/actions.ts
│              createAnnotation, addAnnotation, updateAnnotation,
│              deleteAnnotation, updateImage, deleteImage
│
└─ /api/auth/*       api/auth/[...nextauth]/route.ts → src/auth.ts
      GitHub sign-in and sign-out; no view of its own
```

**Server** components run only on the server: they query the database and send rendered output, not code. **Client** components (files starting with `"use client"`) are also sent to the browser as JavaScript, which makes them interactive. Server actions are called from client components but run on the server.

## Upload flow

Uploading requires sign-in; both server actions reject anonymous calls.

1. The browser checks type (JPEG, PNG, WebP) and size (10 MB) and calls the `requestUpload` server action.
2. The server validates again and returns a 5-minute signed `PUT` URL for a random key under `images/`. Content type and length are part of the signature.
3. The browser uploads the file straight to R2.
4. `createImage` checks the object exists and is valid. It reads the whole file with `sharp` to get its pixel size (correcting for EXIF rotation) and its fingerprints: a SHA-256 and a perceptual hash ([ADR 0010](adr/0010-duplicate-detection.md)).
5. If an existing image is the same file, or looks the same (perceptual hashes within 12 bits), nothing is saved yet. The form shows the matches with **Go to it**, **Cancel** (both delete the uploaded file through `discardUpload`) or **Upload anyway**.
6. Otherwise, or after **Upload anyway**, it creates the `Image` row with its fingerprints.

## Annotation flow

1. The image page (`src/app/images/[id]/page.tsx`) loads the image with its regions, each region's annotations and each author's name, and passes them to a client component, `annotated-image.tsx`. It sends only the fields the browser needs.
2. Annotorious draws each saved region, converting fractions to pixels with the image's stored size. Where boxes overlap, a click goes to the smallest box under the pointer (Annotorious sorts its hits by area; [ADR 0011](adr/0011-regions-and-overlap.md)). Larger regions are added first, so smaller ones also look on top.
3. **Clicking** a box, or its entry in the UI panel's list, opens its annotations in a card beside it, and the view zooms so the box and card fill the screen side by side ([enrich-UI.md](enrich-UI.md), Rule 5). Hovering does nothing. Clicking empty image, Escape or the card's close button closes it, leaving the view where it is. The open box is drawn prominently (thick amber outline, light fill), and the others recede (thin, faint outlines).
4. Approved users click **Annotate** to turn on drawing (zoom and pan are off meanwhile), then drag a box. The editor opens as a card beside it. That box is a draft: it isn't saved yet, and it can be moved or resized. Only one draft exists at a time.
5. While the draft is drawn or adjusted, the browser checks it against the other boxes (`src/lib/overlap.ts`). If any box would keep less than 25% of its area clickable, the editor says so, disables Save, and offers **Add to that annotation** or **Adjust my box**.
6. **Save** reads the box as it is now, converts it to fractions, and calls the `createAnnotation` server action with the text.
7. The action checks the session, the region (inside the image and not tiny), the overlap rule and the text (not empty, at most 5,000 characters), then creates the `Region` with its first `Annotation`. It calls `refresh()`, so the page re-renders with the new region, which is then opened. The user stays in annotate mode, to draw another box.
8. An open box's card lists all its annotations, oldest first, with **+ Add your annotation** for approved users who haven't annotated it yet. That calls `addAnnotation`.

Annotation text is untrusted, so it's rendered without HTML or images ([ADR 0008](adr/0008-markdown-rendering.md)).

## Editing and deleting

Authors can edit or delete their own annotations, and owners their own images ([ADR 0006](adr/0006-open-annotation-and-public-domain-seed.md)).

- The page tells the browser which annotations and which image are the signed-in user's (a `mine` flag), so it can show Edit and Delete. That's only for display. Each server action checks again, with ownership in the write's `where` (for example `{ id, authorId }`), so checking and writing happen in one query.
- **Edit annotation** opens the editor with the text. If you drew the box and it holds only your annotations, the box also becomes movable and resizable, and Save sends the new region too, checked against the overlap rule. Cancel puts the box back.
- **Delete annotation** and **Delete image** ask for confirmation inside the page, not with a browser dialog. Deleting a box's last annotation deletes the box too.
- **Deleting an image** deletes the row, and with it every annotation on the image, including other people's, through `onDelete: Cascade`. Then it deletes the file from R2. If that fails, the error is logged and the file is left behind; see Known gaps.
- **Mobile annotate mode:** the whole image page has `touch-action: none` and the app owns zoom ([ADR 0012](adr/0012-app-owned-zoom.md)). While a box can be drawn or moved, dragging edits the box instead of panning. When the on-screen keyboard opens over a card, the view zooms again within the space left above it.
- **On-screen keyboard and safe area:** browsers don't report the keyboard, so `useScreenLayout` (`src/lib/use-screen-layout.ts`) compares the visual viewport with the layout viewport, and reads the safe area from `env(safe-area-inset-*)` (the image page sets `viewport-fit=cover`). The view, the UI panel and cards use the resulting visible area. On iOS, the keyboard only shrinks the visual viewport; on Android, the root layout's `interactiveWidget: "resizes-content"` shrinks the layout viewport. Pinch-zoom also shrinks the visual viewport, but the image page owns zoom, so the browser's stays at 1.

## Deployment

Vercel hosts the app at https://a-thousand-words-pi.vercel.app/, with Neon Postgres and a production R2 bucket ([ADR 0009](adr/0009-deploy-vercel-neon.md)). Migrations are applied by hand with `npm run prod:migrate`, not during the build. Seed content (`prisma/seed-data.ts`, loaded by `prisma/seed.ts`) is public-domain paintings from Wikimedia Commons, and the collections that group them on the home page ([ADR 0014](adr/0014-home-page-collections.md)). They're stored under `images/seed/<slug>.jpg` and owned by an "A Thousand Words" user. Every image page has a "Report it" link that emails `REPORT_EMAIL`.

## Known gaps

- An upload abandoned between steps 3 and 4, or an R2 delete that fails after an image is deleted, leaves an orphaned object in R2. A periodic cleanup of keys with no `Image` row would fix both.
- The home grid loads full-size images as thumbnails; resized variants would cut bandwidth.
- The image page zooms the full-size original up to 4× native pixels; tiled images would cut bandwidth on large paintings (ADR 0012).
