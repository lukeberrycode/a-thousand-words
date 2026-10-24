# 26. Content migrations: numbered content files, each applied once per database

Date: 2026-10-24 · Status: Accepted

## Context

The site needs far more paintings, annotations and collections than users will add at first. Claude can write them quickly, in frequent batches. The content lived in `prisma/seed-data.ts`, loaded by `prisma/seed.ts`, which was written for a one-off demo load. It skipped any painting already in the database, so it couldn't correct anything. Its annotations had no stable identity. It replaced each collection's membership with its list (ADR 0014). And nothing recorded what had been applied where. Once users are on the site, every run must leave their images, boxes and annotations exactly as they are. The plan is [docs/plans/content-migrations.md](../plans/content-migrations.md).

Options considered:

- **Keep the seed and make it idempotent:** compare the file with the database on every run. Simple to write, but a deletion or correction has to be inferred from what's missing, and the whole file is re-checked on every run.
- **An admin UI for content:** a lot of new code and permissions, for work that is mostly done by Claude from a terminal.
- **Numbered content files, as `prisma/migrations` handles schema:** each applied once, in order, and recorded.

## Decision

- **Content files** live in `prisma/content/`, named `NNNN-slug.ts`. Each exports `operations`, a list from a closed set (`src/lib/content/operations.ts`): `addPainting`, `annotate`, `editAnnotation`, `removeAnnotation`, `removePainting`, `addCollection`, `addToCollection` and `removeFromCollection`. Paintings and boxes have stable **content keys** (`Image.contentKey`, `Region.contentKey`, null for users' rows), so later files can refer to them.
- **The runner** (`scripts/content.ts`, `src/lib/content/runner.ts`) applies each pending file in one transaction, with a `ContentMigration` row holding its name, a checksum of its operations as stable JSON, and a summary of what it did and skipped. An applied file whose checksum changes is refused: a correction is a new file. The checksum is of the operations, not the bytes, so Prettier can reformat the file.
- **The planner** (`src/lib/content/plan.ts`) is a pure function from the current state and a file to a list of changes and skips. The dry run prints it. The runner plans again inside the transaction. Text, boxes, overlap and duplicates are checked with the functions the server actions and uploads use (`checkBody`, `checkRegion`, `findClash`, ADR 0010's hash distance).
- **User content is never touched.** Everything the runner makes belongs to one content account, the old seed's "A Thousand Words" user. Every update and delete names that account in its `where`, as the server actions name the author. A step that would affect someone else's content is skipped and reported, never forced. `removePainting` puts its guard in the `DELETE` itself, after locking the image and its boxes `FOR UPDATE`, so a user's annotation still being written can't be lost to the cascade; box moves and deletes lock the box first in the same way.
- **Collections change only by explicit operations.** This supersedes ADR 0014's rule that the seed replaces each collection's membership on every run. Images added to a row some other way stay.
- **The baseline**, `0001-baseline.ts`, is the old seed data with a key for every box. On a database the seed already filled, it claims existing rows by storage key and exact annotation text, and lists any it can't match. `prisma/seed.ts` and the `*:seed` scripts are gone.
- **Batches of at most 25 paintings**, and **every annotation names at least one source** in `sources`. The unit tests check every file in CI. The baseline is exempt from both, since it predates them.
- **Content isn't reviewed by a person before it goes up.** Notes on paintings are low risk and largely subjective. Requiring a source for every claim does more for accuracy at this volume than a reviewer would. Readers report mistakes with the "Report it" link, and the fix is a new file. The byline stays "A Thousand Words". **The runner's code is reviewed** like any other code, because its guards are the only protection for other users' content.
- **Content files are plain data.** Importing a TypeScript file runs it, and `prod:content` runs with production settings. So every file after the baseline may hold only `import type` lines and one `export const operations = [...]` of literals. `src/lib/content/source.ts` checks the source text before the file is imported, and the unit tests check every file in CI.
- **Content branches** are named `content/<slug>`, and, like `fix/` branches, need no plan or ADR (ADR 0021). Such a branch may only add new files in `prisma/content`: `npm run check:branch` fails it in CI if it changes anything else, so code or an applied file can't reach `main` under the no-review rule. The `add-paintings` skill writes the files.
- **Production runs by hand:** the owner runs `npm run prod:content` after merging a content PR, with settings from KeePassXC (ADR 0019). Running it from GitHub Actions would put a production database credential in GitHub.

## Consequences

- Content can be added and corrected often, by a data-only PR, without risk to users' work.
- `content:status` shows what each database has applied. The summaries record what was skipped and why.
- Files are fetched from Commons before the transaction. If it then fails, they're left in R2: in production the nightly cleanup removes them (ADR 0018); the preview bucket has none, so they stay until deleted by hand.
- A box a user draws in the moment between the runner's re-plan and its insert isn't seen. The server actions have the same gap.
- Content painting files keep the old `images/seed/<key>.jpg` path, so the baseline's files stay where they are.
- Sources are kept in the files only. Showing them on the site would need a column and a change to the page.
- Unreviewed content means a wrong claim can be live until a reader reports it.
