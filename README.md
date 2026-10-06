# A Thousand Words

> A picture is worth a thousand words. Here's where you write them.

Community annotation for images: upload an image, draw a region on it, and attach an annotation that explains what's there.

**Live site:** https://a-thousand-words-pi.vercel.app/

**Status:** milestone 7 (automated system tests) done. Live at https://a-thousand-words-pi.vercel.app/, with 12 annotated public-domain paintings. Signed-in users upload and annotate any image; everyone can read annotations by hovering or tapping a region; authors edit and delete their own annotations and images; every image has a "Report it" link. Sign in with GitHub to upload and annotate. Most system tests now run automatically with Playwright (`npm run test:system`). Next: user experience documentation (milestone 8). See [the one-pager](docs/one-pager.md) for scope and milestones.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · Postgres + Prisma · Cloudflare R2 · Annotorious · Auth.js

Why each was chosen: [docs/adr](docs/adr/README.md). How it fits together: [docs/architecture.md](docs/architecture.md).

## Getting started

Requires Node 20+ and a Postgres database.

```bash
npm install                # also generates the Prisma client
cp .env.example .env       # then set DATABASE_URL, the R2_* values and the AUTH_* values
npx prisma dev             # optional: starts a local Postgres and prints its URL
npm run db:migrate         # apply the schema
npm run db:seed -- --yes   # optional: 12 annotated public-domain paintings
npm run dev                # http://localhost:3000
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test:system` | The automated system tests ([docs/system-tests.md](docs/system-tests.md#running-the-automated-tests)): Playwright against the dev server, local database and R2 bucket from `.env`. Run `npx playwright install chromium` once first. |
| `npm run db:migrate` | Create and apply migrations (`prisma migrate dev`). Restart `npm run dev` afterwards: it keeps one Prisma client across hot reloads, so it won't know about new columns until restarted. |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:seed` | Load the seed paintings into the database and R2 from `.env` (dry run unless `-- --yes`) |
| `npm run db:users` | List accounts waiting for approval; `-- approve <github-login>` approves one |
| `npm run prod:migrate` | Apply migrations to production, using `.env.prod` |
| `npm run prod:seed` | Seed production, using `.env.prod` (dry run unless `-- --yes`) |
| `npm run prod:users` | List or approve accounts on production, using `.env.prod` |

## Deploying

The site runs at https://a-thousand-words-pi.vercel.app/ on Vercel, with Neon Postgres and a production R2 bucket ([ADR 0009](docs/adr/0009-deploy-vercel-neon.md)). Pushing to `main` deploys.

- **Vercel environment variables:**
  - `DATABASE_URL`: Neon's pooled connection string
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`: the production bucket and its token
  - `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`: the production OAuth app
  - `REPORT_EMAIL`: where "Report it" links send email
- **New accounts:** a first GitHub sign-in creates a pending account that can browse but not upload or annotate. Approve it with `npm run prod:users -- approve <github-login>` (run `npm run prod:users` to see who's waiting).
- **Schema changes:** migrations don't run during the build. Run `npm run prod:migrate` from the PR's branch **before** merging a PR that adds a migration. The live code ignores new columns and tables, but new code deployed before its migration fails. (A migration that removes or renames something the live code still uses needs the reverse order: first deploy code that no longer uses it.) `prod:migrate` reads `.env.prod`, which is git-ignored and holds Neon's direct connection string plus the production R2 values.
- **Before sharing the URL:** run the production checks (PROD-01 to PROD-05) and the touch checks (MAN-07, MAN-09, MAN-10) in [docs/system-tests.md](docs/system-tests.md) on a real phone.

## Project docs

- [One-pager & MVP scope](docs/one-pager.md)
- [Product background](docs/product-background.md): audience, prior art and the name
- [Architecture](docs/architecture.md)
- [Architecture Decision Records](docs/adr/README.md)
- [System tests](docs/system-tests.md): checks of the running app, with how each is run (manual or automated)
