---
name: add-paintings
description: Writes the next content file in prisma/content, adding up to 25 public-domain paintings from Wikimedia Commons with sourced annotations, then applies it locally and opens a pull request. Use when asked to add paintings, annotations or collections to the site's own content, or to correct content.
---

Write the next content file (ADR 0026). Read `src/lib/content/operations.ts` for the operations, and the latest file in `prisma/content/` for the style.

## 0. Branch

Content files go through a pull request, on a `content/<slug>` branch, such as `content/dutch-golden-age`. Like `fix/` branches, these need no plan or ADR (ADRs 0021 and 0026).

## 1. Choose the paintings

- At most **25 paintings** in one file. A correction to existing content is its own small file.
- Find public-domain works on Wikimedia Commons. Check that each file is the **whole work**: not a detail, not cropped, not a photo of the frame or the gallery wall.
- The file page URL is the `source` (`https://commons.wikimedia.org/wiki/File:...`). It must be a JPEG: the runner refuses PNG thumbnails.
- Check the painting isn't on the site already: search earlier content files for its title and Commons file. The runner refuses a duplicate of any image on the site, but a dry run is a slow way to find out.

## 2. Read off coordinates

- Download each at 1920 pixels wide, the width the runner uses (Commons API `iiurlwidth=1920`). Keep the downloads in `$TMPDIR`, in their own folder.
- Draw a labelled grid over each image (every 0.05 of width and height) and look at it, to read off coordinates as fractions of the image (ADR 0005).

## 3. Place the boxes and write the annotations

- One `annotate` per box, with a key unique across every file: the painting's key and a word for the subject, such as `arnolfini-mirror`.
- Boxes must not hide each other: where boxes overlap, at least a quarter of each must stay clickable (ADR 0011).
- **Every claim comes from a source.** Wikipedia is fine; the museum's own page is better where there is one. If the painting shows a historical event, read sources on the event too, and say where the painting departs from it. List every source used in that annotation's `sources`. Say where a point is disputed. Never write a claim you have no source for.
- Annotation text is Markdown, without links or images (ADRs 0008, 0022). Write in British English, in plain, short sentences, like the existing annotations: three to five per painting, each under about 60 words.
- Add the paintings to collections with `addToCollection`, or add a new row with `addCollection` first.

## 4. Check the boxes by eye

Draw every box onto its image, with its key, and look at each one. Fix any that miss their subject. Do this for every painting, not a sample.

## 5. Write the file and apply it

- Name it with the next number: `prisma/content/NNNN-<slug>.ts`, exporting `operations: Operation[]`.
- Never edit a file that's on `main`: it may have been applied. Corrections use `editAnnotation` or `removeAnnotation` in a new file.
- `npm test` checks the file: keys, the 25-painting cap, sources, boxes and collections.
- Run `npm run content:apply` (the dry run) and read it: every step should be a `+` change. Then `npm run content:apply -- --yes`, and look at a few of the paintings in `npm run dev`.
- Open a pull request. Its description lists the paintings, and tells the owner to run `npm run prod:content` after merging. Content isn't reviewed by a person (ADR 0026), so the checks above are the review.
