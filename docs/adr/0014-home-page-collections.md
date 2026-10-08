# 14. Home page rows of themed collections

Date: 2026-10-08 · Status: Accepted

## Context

The home page was one grid of the 24 newest images. With more seed paintings, a single grid gives no way in apart from recency. Paintings group naturally by period (Northern Renaissance), movement (Japanese woodblock prints) or subject (battle paintings), and one painting often fits more than one group: *The Third of May 1808* is both a battle painting and art of the Napoleonic era.

## Decision

- The home page shows a **Recently added** row, then one horizontally scrolling row per **collection**, in the style of a streaming service's catalogue.
- A `Collection` has a slug, a name, a one-line blurb and a sort order. `CollectionImage` links collections and images **many-to-many**, with a position for each image's place in its row.
- Collections are curated in `prisma/seed-data.ts` and written by the seed. Re-running the seed updates each collection and replaces its membership with the list in the file. There is no UI for editing collections yet.
- Rows scroll with native overflow and CSS scroll snap, so touch and trackpad swiping work without a library. On screens `sm` and wider, arrow buttons page through a row by most of its width.
- Cards share a height and keep each image's aspect ratio, clamped between 0.6 and 2, so very tall or very wide paintings are cropped rather than dominating a row.

## Consequences

- Deleting an image removes it from its collections (cascade). Deleting a collection leaves its images.
- Collections with no images are not shown, so a painting missing from Commons doesn't leave an empty row.
- User uploads appear only in **Recently added** until a collection editor exists.
- The seed is the source of truth for collection membership: membership changed directly in the database is overwritten on the next seed run.
