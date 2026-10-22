# Plan: serve content paintings from Wikimedia Commons

Status: draft, 22 October 2026. Milestone 11 in the [one-pager](../one-pager.md). When the work starts, its decisions get an ADR.

## Why

Every seed painting is downloaded from Wikimedia Commons and copied into R2 at up to 1920 pixels wide (`images/seed/<slug>.jpg`). The idea is to load content paintings straight from Commons instead, and to watch Commons for changes that would spoil them on the site.

What it would gain:

- **Smaller images where they're small.** Commons serves each file at a set of standard widths: 120, 250, 330, 500, 960, 1280, 1920 and 3840 pixels. Home page rows could load 330 or 500 pixel versions instead of the full 1920 pixel file. That fixes the first item under "Known gaps" in the architecture doc for content paintings.
- **Sharper zoom.** The image page could load 3840 pixel versions of large paintings, where the original is that big. Commons doesn't enlarge files, so the app never asks for more than the original's width.
- **A simpler content pipeline.** Adding a painting writes rows only; nothing is uploaded.
- **No growth in storage** as content scales.

What it wouldn't gain: money. A thousand paintings at 1920 pixels is around a gigabyte, inside R2's free 10 GB, and R2 doesn't charge for downloads.

User uploads don't change. They stay in R2.

## Risks

Commons says hotlinking is "allowed" but "not generally recommended", because someone can change or remove the file ([Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/technical)). For this site, each kind of change has a different effect.

| Change on Commons | Effect on the site, if nothing is done |
| --- | --- |
| A new version of the file is uploaded, for example a better scan with the same framing | Harmless if the framing is exactly the same: regions are fractions of the image (ADR 0005). But it can't be told apart cheaply from the next row |
| A new version with a different crop, frame or border | Every box drifts off its subject. This is the worst case, because it breaks silently. A crop of the same amount from every side keeps the aspect ratio, and a small one barely changes the perceptual hash |
| The file is renamed | Commons leaves a redirect. Thumbnail URLs built from the old name stop working |
| The file is deleted, for example as a duplicate or after a copyright review | The image is broken, and its annotations describe nothing |
| Wikimedia is slow or down | Content paintings don't load |

There are also limits on how the files are used:

- Since early 2026, Wikimedia rejects or strictly rate-limits direct thumbnail requests that don't use a standard width ([Common thumbnail sizes](https://www.mediawiki.org/wiki/Common_thumbnail_sizes)). The app must only ask for standard widths.
- Wikimedia doesn't allow "hot spider" services, which mirror Commons wholesale. Hand-curated content is fine.
- Each visitor's browser requests the image from Wikimedia, which sees their IP address. The privacy note planned for milestone 9 should say so. Images should be loaded with `referrerpolicy="no-referrer"`.

## Design

### Data

- A new table, `CommonsFile`, one row per Commons-hosted image:
  - `imageId`, `title`: the file name on Commons.
  - `sha1`, `timestamp`, `width`, `height`: the exact version the boxes were placed on, and the original's full pixel size. The Commons API returns all four for each version.
  - `archiveName`: the name Commons gives that version once a newer one replaces it (`<timestamp>!<name>`, from `iiprop=archivename`). Pinning needs it to build the archived file's URL.
  - `status`: `ok`, `pinned` (see below) or `missing`.
  - `checkedAt`.
- With the recommended fallback (below), every image keeps its `storageKey`. Without it, `storageKey` becomes optional, and a check that each image has a `storageKey` or a `CommonsFile` row needs raw SQL in the migration, because Prisma's schema can't express it.

### Showing images

`publicUrl(storageKey)` becomes `imageSrc(image, width)`. It returns the URL **and the pixel size of the file it serves**:

- R2 image: the public URL and the stored size, as now.
- Commons image: the thumbnail URL at the smallest standard width that's at least `width`, capped at the original's width, and that file's size, worked out from the original's aspect ratio. Home rows use a `srcset` of 330, 500 and 960.

The image page must use the served size. Today it turns each region's fractions into pixels with the stored `Image.width` and `height` (`toImageAnnotation` in `annotated-image.tsx`), and Annotorious works in the loaded file's own pixels. If the page loaded a 3840 pixel file but converted with a stored width of 1920, every box would be drawn at half scale. So the page passes the served size to `toImageAnnotation` and `useZoomView`, and the stored size is only used for the original.

Fingerprints for duplicate detection (ADR 0010) are still worked out once, when the painting is added, from the 1920 pixel file. They describe the version the boxes were placed on, so they stay right while the painting is pinned to it.

### Watching Commons

A scheduled job checks every `CommonsFile` against Commons once a day. It asks the Commons API about 50 files per request, follows redirects, and compares each file's current version with the one stored.

| What it finds | What it does |
| --- | --- |
| Same version | Updates `checkedAt` |
| Renamed | Stores the new title |
| Any new version | **Pins** the image: `status` becomes `pinned`, and the app shows Commons' archived copy of the version the boxes were placed on, which stays at a fixed URL (to confirm in the first step of the work). The owner is told. They can accept the new version, if the boxes still fit, or place the boxes again, in a [content migration](content-migrations.md) |
| Deleted | `status` becomes `missing`. What happens next depends on the fallback (below). The owner is told |

The job doesn't try to decide whether a new version still fits the boxes. ADR 0010's perceptual hash answers a different question, "is this the same painting?", and its 12-bit threshold lets through crops of 5% from each edge. Here a wrong "yes" moves every box with no warning, so the job pins on any change and leaves the judgement to the owner. New versions of old public-domain files are rare, so this costs little. If they turn out to be common, a stricter test made for alignment can be added later, calibrated and recorded in an ADR as ADR 0010's was.

It has the same safety features as the orphan cleanup (ADR 0018). It starts in dry run. If more than 10 images change status in one run, it changes none, fails and raises the alarm, because that most likely means a problem at Commons or in the job. It sends a User-Agent that identifies the site, as the Wikimedia User-Agent policy requires.

### Where the job runs: a second CDK stack

The job fits a second stack in `infra/`, next to the orphan cleanup:

- It runs on a schedule, makes slow outbound calls, and nothing waits for it, like the orphan cleanup.
- It needs the same monitoring: logs, an alarm on failure, and the account budget.
- It reuses what's already there: the CDK app, the deploy role, the workflow, and the dry-run and limit patterns.

It would be a new stack, `AThousandWordsCommonsWatch`, with its own Lambda, schedule and secret. The secret holds only a database connection string, for a Postgres role that can read `Image` and update `CommonsFile`, and nothing else. It needs no R2 access, even with the fallback: switching to the R2 copy is a status the app reads. Expected extra cost is about $0.40 a month, for the secret.

Setting it up also means:

- changing `.github/workflows/infra.yml`, which deploys the orphan cleanup stack by name, to deploy this one too;
- the owner creating the restricted Postgres role in Neon, and filling in the new secret. Both go in the PR's list of owner steps.

The alternatives are the same as in ADR 0018: a Vercel cron, or a scheduled GitHub Actions workflow. The workflow would need a production database credential stored in GitHub, which ADR 0019 avoids.

### Moving existing paintings

For each of the 37 seed paintings, ask Commons for the current version of its file. If that version was uploaded before the painting was seeded (its `createdAt`), it's the file the R2 copy came from: add a `CommonsFile` row for it. Otherwise, leave the painting in R2 and list it for the owner. Comparing timestamps avoids judging pictures by eye or by hash. This would be a content migration.

## Recommendation: keep a fallback copy in R2

Deletion is the one change pinning can't handle: the boxes and annotations stay, with nothing to show them on. A deleted public-domain painting is rare, but when it happens it's the worst outcome for users.

The recommendation is to **serve from Commons, but keep the 1920 pixel copy in R2 as a fallback that isn't normally served**. When the watcher finds a file missing, the image switches to its R2 copy and the site carries on. The copies fit inside R2's free storage, and the existing ones don't need to move.

The other option is to drop the R2 copy altogether. Then a missing painting is hidden from the home page, its page explains that the image was removed from Commons, and its annotations are kept in case a replacement file is found. That's simpler, but leaves those pages without an image. It also means the existing seed images lose their `storageKey`, so the nightly orphan cleanup deletes their 37 files after 24 hours. That's under its limit of 100 a run, so it's expected and safe, but it can't be undone.

## Done when

- Content paintings load from Commons at standard widths, and home rows use small versions.
- The watcher stack is deployed, has run in dry run, and its logs have been reviewed before it makes changes.
- A test copy of a painting can be pinned and marked missing on the preview database, and the app shows each state correctly.
- ADRs record the hosting decision and the watcher. The README, architecture doc, `infra/README.md` and risks register describe the change.

## Open questions

- Fallback copy in R2, or none? The recommendation is to keep one.
- Should the watcher email the owner directly, or only raise the CloudWatch alarm with a log entry?
- Should a pinned painting say on its page that a newer version exists on Commons?
- Order with [content migrations](content-migrations.md): the plan assumes that milestone comes first, so moving the existing paintings is itself a content migration.
