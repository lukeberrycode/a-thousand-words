# Plan: content migrations

Status: being carried out, 24 October 2026, under [ADR 0026](../adr/0026-content-migrations.md). Milestone 10 in the [one-pager](../one-pager.md).

## Why

The site needs far more paintings, annotations and collections than human users will add before the first of them arrive. Claude can research a painting, place regions on it and write annotations quickly, so the plan is to add content in frequent batches of up to 25 paintings.

Today that content lives in one file, `prisma/seed-data.ts`, loaded by `prisma/seed.ts`. The seed was written for a one-off demo load:

- It skips a painting already in the database, so it can't correct or extend anything except a painting with no annotations at all.
- Annotations have no stable identity, so a later run can't tell which row a corrected text belongs to.
- It replaces each collection's membership with the list in the file.
- Nothing records what has been applied to which database.

Once real users are on the site, every run must leave their images, boxes and annotations exactly as they are.

## Idea

Treat content like schema: a series of numbered files in the repository, each applied once to each database, in order, and recorded when applied. This is how `prisma/migrations` works.

```
prisma/content/
  0001-baseline.ts                 today's seed-data.ts: 37 paintings, 7 collections
  0002-dutch-golden-age.ts         a later batch: 8 paintings, a new collection
  0003-fix-arnolfini-mirror.ts     a correction to one annotation
```

```
npm run content:status        which files this database has applied, and which are pending
npm run content:apply         dry run: prints what each pending file would do
npm run content:apply -- --yes
npm run prod:content          the same against production, with settings from KeePassXC (ADR 0019)
```

## Design

### Files

Each file is a TypeScript module that exports a list of **operations** from a small, closed set. TypeScript gives type checking and editor help, as `seed-data.ts` does now.

| Operation | What it does | Guard |
| --- | --- | --- |
| `addPainting` | Adds an image from Wikimedia Commons, with a stable `key` | Skipped if the key exists. Refused if it duplicates any image on the site (ADR 0010), so a user's upload of the same painting isn't split |
| `annotate` | Adds a box with one annotation, with a stable `key` and a list of `sources` | Refused if the box would hide or be hidden by an existing box, including users' boxes and boxes added earlier in the same file (ADR 0011). Never moves anyone else's box |
| `editAnnotation` | Changes the text, and optionally the box, of a content annotation | Only the content account's own annotation. The box moves only if it holds no one else's annotations, and only if the moved box passes the overlap rule: the same checks `updateAnnotation` makes for users |
| `removeAnnotation` | Removes a content annotation | Only the content account's own. The box goes only if it's left empty |
| `removePainting` | Removes a content painting, then its file in R2 once the transaction has committed | Refused if anyone else has annotated it. The check is part of the delete itself (`WHERE` the owner is the content account `AND NOT EXISTS` an annotation by anyone else), so an annotation added a moment before can't be lost to the cascade |
| `addCollection`, `addToCollection`, `removeFromCollection` | Curate home page rows | Membership changes are explicit, so images added to a collection some other way stay |

A file that's been applied is never edited. A correction is a new file. The runner stores a checksum of each applied file's **operations**, as stable JSON, and refuses to run if they've changed, as Prisma does for SQL. A checksum of the file's bytes would break whenever Prettier reformats it, which a hook does on every edit.

### Data

- `ContentMigration`: name, checksum, appliedAt, and a summary of what was done and skipped.
- `Image.contentKey` and `Region.contentKey`: optional and unique. Null for anything a user made. They let later files refer to earlier content.
- One **content account**, the existing "A Thousand Words" seed user, owns every image, box and annotation the runner creates.

### Rules that protect user content

1. Every update and delete includes the content account, and any other guard, in its `where`, as the server actions include the author. A bug in a file can't reach a user's row, because the query can't match it.
2. A step that would affect a user's content is **skipped and reported**, never forced. The run carries on with the rest.
3. Each file is applied in one transaction, together with its `ContentMigration` row, so a failure leaves nothing half applied. A file of 25 paintings needs a longer transaction timeout than Prisma's default of 5 seconds.
4. The planner is a pure function: current state plus a file gives a list of changes and skips. The dry run prints it, and unit tests cover it. The runner plans again inside the transaction, so a box a user added since the dry run is taken into account.
5. The planner and CI check text and boxes with the functions the server actions use, `checkBody` and `checkRegion` in `src/lib/annotations.ts`, and the overlap rule in `src/lib/overlap.ts`. They don't get their own copies.
6. Image files are fetched before the transaction. If the transaction then fails, a file left in the production bucket is deleted by the nightly orphan cleanup (ADR 0018), once it has dry run turned off, and after 24 hours. The preview bucket has no cleanup, so a failed `preview:content` leaves files there until they're deleted by hand.

### Moving from the seed

- `0001-baseline.ts` is today's `seed-data.ts`, with a key added to every annotation.
- On a database that the old seed has already filled, the baseline step matches existing rows to keys by painting and exact annotation text, and fills in `contentKey`. Prisma has `migrate resolve` for a baseline in the same way.
- Production may not match the file exactly. The seed never updated existing rows, so a text corrected in `seed-data.ts` after production was seeded is still the old one there. A painting may have been skipped because Commons couldn't find it. And the seed left alone any painting someone else had annotated. So the baseline's dry run lists every painting and annotation it can't match. Unmatched rows keep a null `contentKey` and are left as they are. Paintings in the file but missing from the database are created, as in any other run. Only then is `0001` recorded as applied.
- `prisma/seed.ts`, `db:seed`, `prod:seed` and `preview:seed` go, and the README's getting-started steps and scripts table change to match. A fresh local database runs `content:apply` instead.

### Writing content with Claude

A project skill, `add-paintings`, writes the next content file. It follows the steps used to annotate the 25 collection paintings (PR #17):

1. Find public-domain works on Commons and check that each file is the whole work.
2. Download each at a standard width, then draw a labelled grid over it to read off coordinates.
3. Place the boxes and write the annotations. Every claim comes from a source: Wikipedia is fine, and the museum's own page is better where there is one. If the painting shows a historical event, the skill also reads sources on the event, and can say where the painting departs from it. Each annotation names its sources in `sources`. The skill notes where a point is disputed, and never writes a claim it has no source for.
4. Draw the boxes onto the images, look at every one, and fix any that are off.
5. Write the file, of at most 25 paintings, run `content:apply` locally, and open a pull request.

### Review and release

Content isn't reviewed by a human before it goes up. Notes on paintings are low risk and largely subjective, and grounding every claim in a source does more for accuracy than a reviewer could at this volume. Mistakes are put right afterwards: a reader uses the "Report it" link, and the fix is a new content file.

- **CI** checks every content file: types, unique keys, at most 25 paintings, at least one source for each annotation, regions inside the image, and collections that only name known paintings.
- **The runner's code is reviewed by the owner when it changes**, as other code is. It stays the same from batch to batch: a batch is a data file, and the runner changes only when a new kind of operation is added. Its guards are the only protection for other users' content, so if any other account is ever approved, they're part of that review (milestone 9).
- **Preview** is optional: `preview:content` can be used as a smoke test of a file before it reaches production.
- **Production:** the owner merges the PR and runs `prod:content`. It asks for the KeePassXC password, as the other `prod:*` scripts do. "Run often" means once per content PR.

Running it from GitHub Actions on merge would remove that manual step. It would also put a production database credential in GitHub, which ADR 0019 deliberately avoids. If that's wanted later, it should use a Postgres role that can only write the content tables, in a protected GitHub environment that needs approval.

## Done when

- Content files, the runner, `content:status` and `content:apply` exist, with unit tests for the planner and its guards.
- The baseline is recorded in production without changing any content.
- At least one new batch of paintings has gone from a Claude-written file, through a PR, to production.
- `add-paintings` is a project skill, and the README and architecture doc describe the new flow.
- A new ADR records content migrations, the 25-painting cap, required sources and the exception to human review of content, and supersedes ADR 0014's rule that the seed replaces each collection's membership on every run.

## Decided

- **Byline.** Content annotations keep the byline "A Thousand Words", with no note that AI wrote them. A later change may explain that the byline marks AI-written content. Nothing on the site says the content was reviewed.
- **Accuracy.** No one reviews it. Every annotation is based on a source, named in its `sources`, and readers report mistakes with the "Report it" link.
- **Size of a batch.** At most 25 paintings per file.
- **Human review.** Content files are an exception to human review. The runner's code isn't.
