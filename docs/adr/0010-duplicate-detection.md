# 10. Warn about duplicate uploads using a perceptual hash

Date: 2026-10-02 · Status: Accepted

## Context

Annotations are most useful gathered on one page per image, as on Genius. Testing showed how easily the same picture ends up uploaded twice: the same painting, downloaded at a different size. Options considered:

- **SHA-256 of the file:** catches only byte-identical files.
- **Perceptual hash:** a small fingerprint of how the image looks. Catches resized, recompressed and lightly edited copies, with no external service.
- **Image embeddings with pgvector:** also catches different photos and crops of the same artwork, but adds a model provider, a cost per upload, and thresholds to tune.
- **A vision model such as Claude, as a judge:** good at "same artwork?" between a few candidates, but it can't search the library, and it's slower and costs more per upload.

## Decision

- Store a **SHA-256** and a **64-bit difference hash (dHash)** for every image (`Image.sha256`, `Image.phash`), computed with `sharp` in `src/lib/image-hash.ts`.
- `createImage` fingerprints the uploaded file on the server. An existing image **matches** if it has the same SHA-256, or a perceptual hash within **12 bits** (`bit_count` of the XOR, in Postgres).
- On a match, the upload is **not saved yet**. The form shows the matching images, with **Go to it** and **Cancel** (both delete the uploaded file) and **Upload anyway**. It's a warning, not a block: a false match never stops a legitimate upload.
- The seed script stores the same fingerprints.

The threshold comes from the 12 seed paintings:
- Resized, recompressed, WebP and brightened copies of one image differed by **0–10 bits**.
- Different paintings differed by **20–43 bits**.
- A 5% crop from each edge differed by **2–18 bits**, so crops are caught only sometimes.

## Consequences

- No new service or cost. The check is deterministic, so it can be automated (milestone 7).
- Uploads now read the whole file (up to 10 MB) on the server, where they used to read only its header.
- Missed: mirrored copies, larger crops, and different photographs of the same artwork. If they turn out to matter, embeddings with pgvector (Neon supports it), and possibly a vision model as a judge, can be added on top without changing this design.
- Each upload is compared against every image. That's fine at demo scale; a large library would need an index structure (for example a BK-tree, or pgvector's bit-vector Hamming search).
- Images uploaded before this change have no fingerprints and are never matched until they're backfilled.
- If the user leaves the page while the warning is showing, the uploaded file stays in R2: the orphan case in the architecture doc's Known gaps.
