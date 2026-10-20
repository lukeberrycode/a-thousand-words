# A Thousand Words

> A picture is worth a thousand words. Here's where you write them.

Community annotation for images: upload an image, draw a region on it, and attach an annotation that explains what's there.

**Live site:** https://a-thousand-words-pi.vercel.app/

**Status:** milestone 7 (automated system tests) done. Live at https://a-thousand-words-pi.vercel.app/, with 12 annotated public-domain paintings. Signed-in users upload and annotate any image; everyone can read annotations by hovering or tapping a region; authors edit and delete their own annotations and images; every image has a "Report it" link. Sign in with GitHub to upload and annotate. Most system tests now run automatically with Playwright (`npm run test:system`). Next: user experience documentation (milestone 8). See [the one-pager](docs/one-pager.md) for scope and milestones.

## Why I built this

I'm a senior software engineer with seventeen years' experience, most of it shipping front ends in regulated markets. I started this project on 1 October 2026 with four aims, and I'll keep this section updated as they progress.

1. **Build with AI under engineering control.** Find out how far an AI agent (Claude Code) can go when it works from written specs, a roadmap and tests.
2. **Use technologies I hadn't yet used in production:** Next.js, React, Prisma and PostgreSQL.
3. **Show my work in public**, to help me find my next role.
4. **Ship a product I want to exist.** If only one aim succeeds, I'd like it to be this one.

### Progress (October 2026)

1. **AI-assisted development.** Claude Code (Opus 5.5) wrote most of the code. It works from a [one-pager](docs/one-pager.md), [decision records](docs/adr/README.md) and [system tests](docs/system-tests.md); I set the scope and make the decisions. It went from idea to a deployed alpha within a week. No code is used in anger without a full human review ([milestone 9](docs/one-pager.md#milestones)). The agent now works inside a checked-in permission envelope and a sandbox, hooks stop it finishing a task while checks fail, and CI checks every pull request ([ADR 0015](docs/adr/0015-agent-guardrails-and-ci.md)). Next: custom skills and subagents for repeated workflows, and parallel agents in git worktrees.
2. **Technologies.** I've learned Next.js (App Router) and React, and designed and migrated a relational schema with Prisma on Postgres. Some of it builds directly on my production work: Cloudflare R2 speaks the S3 API, through the same AWS SDK I used with S3. Vercel's push-to-deploy fills the role that GitLab, ArgoCD and Helm filled at my last job.
3. **Finding work.** No new role yet. I'm still looking, so if you're hiring, [get in touch on LinkedIn](https://www.linkedin.com/in/luke-berry-software-engineer).
4. **The product.** It's live with 12 annotated paintings, and early feedback has been good. I'll keep improving it release by release.

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
npm run db:seed -- --yes   # optional: public-domain paintings and home page collections
npm run dev                # http://localhost:3000
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, without building (generates Next.js's route types first) |
| `npm test` | The unit tests (Vitest, `src/**/*.test.ts`); `npm run test:watch` reruns them on change |
| `npm run format` | Format the code with Prettier; `npm run format:check` only checks |
| `npm run test:system` | The automated system tests ([docs/system-tests.md](docs/system-tests.md#running-the-automated-tests)): Playwright against the dev server, local database and R2 bucket from `.env`. Run `npx playwright install chromium` once first. |
| `npm run test:perf` | Lighthouse CI against a production build of the home page (`npm run build` first, with the local database running). Warns below the performance budgets. Set `CHROME_PATH` to a Chrome or Chromium binary, e.g. Playwright's under `~/.cache/ms-playwright/`. |
| `npm run db:migrate` | Create and apply migrations (`prisma migrate dev`). Restart `npm run dev` afterwards: it keeps one Prisma client across hot reloads, so it won't know about new columns until restarted. |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:seed` | Load the seed paintings into the database and R2 from `.env` (dry run unless `-- --yes`) |
| `npm run db:users` | List accounts waiting for approval; `-- approve <github-login>` approves one |
| `npm run prod:migrate` | Apply migrations to production, using `.env.prod` |
| `npm run prod:seed` | Seed production, using `.env.prod` (dry run unless `-- --yes`) |
| `npm run preview:migrate` | Apply migrations to the preview database, using `.env.preview` |
| `npm run preview:seed` | Seed the preview database, using `.env.preview` (dry run unless `-- --yes`) |
| `npm run prod:users` | List or approve accounts on production, using `.env.prod` |

After pulling a change to `prisma/schema.prisma`, run `npx prisma generate` (or `npm install`) before any of the `db:*`, `prod:*` or `preview:*` scripts. The generated client in `src/generated/prisma` is git-ignored and isn't rebuilt when you pull, so a script run with the old one fails on the new models (for example, `Cannot read properties of undefined (reading 'upsert')`). Vercel regenerates it on every deploy.

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

## Working with Claude Code

The project is set up for an AI coding agent to work on it safely ([ADR 0015](docs/adr/0015-agent-guardrails-and-ci.md)):

- `CLAUDE.md`: the agent's rules, commands and definition of done.
- `.claude/settings.json`: what the agent may do without asking, what it may never do (read secrets, touch production, merge, push to `main`), and the Bash sandbox. Personal additions go in `.claude/settings.local.json`, which isn't committed.
- `.claude/hooks/`: block edits to secrets and pushes to `main`, format each edited file, and stop the agent finishing a task while lint, typecheck or unit tests fail.
- `.github/workflows/ci.yml`: format check, lint, typecheck, unit tests, build and dependency audit on every pull request. The repository ruleset requires it to pass before a merge.

## Project docs

- [One-pager & MVP scope](docs/one-pager.md)
- [Product background](docs/product-background.md): audience, prior art and the name
- [Risks](docs/discovery/risks.md): what could go wrong, and how each risk was handled
- [Architecture](docs/architecture.md)
- [Architecture Decision Records](docs/adr/README.md)
- [System tests](docs/system-tests.md): checks of the running app, with how each is run (manual or automated)
