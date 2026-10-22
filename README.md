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

1. **AI-assisted development.** Claude Code (Opus 5.5) wrote most of the code. It works from a [one-pager](docs/one-pager.md), [decision records](docs/adr/README.md) and [system tests](docs/system-tests.md); I set the scope and make the decisions. It went from idea to a deployed alpha within a week. No code is used in anger without a full human review ([milestone 9](docs/one-pager.md#milestones)). The agent now works inside a checked-in permission envelope and a sandbox, hooks stop it finishing a task while checks fail, and CI checks every pull request ([ADR 0015](docs/adr/0015-agent-guardrails-and-ci.md)). Repeated work has skills (writing ADRs, releasing), and two subagents with narrow permissions review code and write tests ([ADR 0017](docs/adr/0017-skills-and-subagents.md)). Next: parallel agents in git worktrees.
2. **Technologies.** I've learned Next.js (App Router) and React, and designed and migrated a relational schema with Prisma on Postgres. Some of it builds directly on my production work: Cloudflare R2 speaks the S3 API, through the same AWS SDK I used with S3. Vercel's push-to-deploy fills the role that GitLab, ArgoCD and Helm filled at my last job.
3. **Finding work.** No new role yet. I'm still looking, so if you're hiring, [get in touch on LinkedIn](https://www.linkedin.com/in/luke-berry-software-engineer).
4. **The product.** It's live with 12 annotated paintings, and early feedback has been good. I'll keep improving it release by release.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · Postgres + Prisma · Cloudflare R2 · Annotorious · Auth.js

Why each was chosen: [docs/adr](docs/adr/README.md). How it fits together: [docs/architecture.md](docs/architecture.md).

## Services

- [Vercel](https://vercel.com/lukeberrycode) hosts the app and holds the production environment variables.
- [Neon](https://console.neon.tech) runs the Postgres database.
- [Cloudflare R2](https://dash.cloudflare.com) stores uploaded images.
- [GitHub OAuth apps](https://github.com/settings/developers) handle sign-in.
- [AWS](https://console.aws.amazon.com) runs the nightly orphan cleanup (see [infra/README.md](infra/README.md)).

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
| `npm run dev` | Start the dev server: port 3000 in the main checkout, a fixed port per worktree ([below](#working-in-git-worktrees)) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, without building (generates Next.js's route types first) |
| `npm test` | The unit tests (Vitest, `src/**/*.test.ts`); `npm run test:watch` reruns them on change |
| `npm run format` | Format the code with Prettier; `npm run format:check` only checks |
| `npm run test:system` | The automated system tests ([docs/system-tests.md](docs/system-tests.md#running-the-automated-tests)): Playwright against the local database, with its own dev server and R2 mock ([ADR 0024](docs/adr/0024-r2-mock-for-system-tests.md)). `E2E_REAL_R2=1` uses the R2 bucket from `.env` instead. Run `npx playwright install chromium` once first. |
| `npm run test:perf` | Lighthouse CI against a production build of the home page (`npm run build` first, with the local database running). Warns below the performance budgets. Set `CHROME_PATH` to a Chrome or Chromium binary, e.g. Playwright's under `~/.cache/ms-playwright/`. |
| `npm run db:migrate` | Create and apply migrations (`prisma migrate dev`). Restart `npm run dev` afterwards: it keeps one Prisma client across hot reloads, so it won't know about new columns until restarted. |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:seed` | Load the seed paintings into the database and R2 from `.env` (dry run unless `-- --yes`) |
| `npm run db:users` | List accounts waiting for approval; `-- approve <github-login>` approves one |
| `npm run worktree:setup` | In a git worktree: give it its own local database, migrated and seeded ([below](#working-in-git-worktrees)) |
| `npm run worktree:teardown` | In a git worktree, before removing it: delete its local database |
| `npm run agent:implement -- <branch>` | Have an agent carry out a plan or ADR from `main` in a new worktree, unattended, through to a pull request ([below](#unattended-agents)) |
| `npm run prod:migrate` | Apply migrations to production, with settings from KeePassXC (see [Deploying](#deploying)) |
| `npm run prod:seed` | Seed production, with settings from KeePassXC (dry run unless `-- --yes`) |
| `npm run preview:migrate` | Apply migrations to the preview database, with settings from KeePassXC |
| `npm run preview:seed` | Seed the preview database, with settings from KeePassXC (dry run unless `-- --yes`) |
| `npm run prod:users` | List or approve accounts on production, with settings from KeePassXC |

After pulling a change to `prisma/schema.prisma`, run `npx prisma generate` (or `npm install`) before any of the `db:*`, `prod:*` or `preview:*` scripts. The generated client in `src/generated/prisma` is git-ignored and isn't rebuilt when you pull, so a script run with the old one fails on the new models (for example, `Cannot read properties of undefined (reading 'upsert')`). Vercel regenerates it on every deploy.

## Working in git worktrees

Parallel Claude Code sessions each work in a git worktree under `.claude/worktrees/`. Each worktree gets its own local database and its own dev server port, so one branch's migrations and system tests don't touch another's ([ADR 0020](docs/adr/0020-worktree-database-and-port.md)).

```bash
npm install                  # in the worktree
npm run worktree:setup       # copies .env if missing, starts its database, migrates and seeds it
                             # (-- --mock: no .env; uses a local R2 mock instead, ADR 0024)
npm run dev                  # prints the worktree's port, between 20000 and 20999
npm run worktree:teardown    # before removing the worktree
```

The setup writes the worktree's `DATABASE_URL` to `.env.local`, which wins over `.env`. The port comes from the folder name, so it's the same every time. GitHub sign-in only returns to port 3000, so check it by hand in the main checkout.

## Unattended agents

With a plan or ADR on `main`, one command has an agent carry it out ([ADR 0025](docs/adr/0025-headless-agent-implements-plans.md)):

```bash
npm run agent:implement -- adr/0022-no-links-in-annotations
```

It makes the worktree and sets it up with the R2 mock, so no secrets are copied. Then it runs Claude Code headless, in auto mode, on the `implement-plan` skill. The agent carries out the plan, has the tests written, runs every check including the system tests, gets a code review, and opens a pull request. The pull request is a draft, with a "Needs the owner" section, when something is left for you. A desktop notification says which. The log is in `.claude/agent-runs/`. `AGENT_BUDGET_USD` caps the spend (default 25).

## Deploying

The site runs at https://a-thousand-words-pi.vercel.app/ on Vercel, with Neon Postgres and a production R2 bucket ([ADR 0009](docs/adr/0009-deploy-vercel-neon.md)). Pushing to `main` deploys.

- **Vercel environment variables:**
  - `DATABASE_URL`: Neon's pooled connection string
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`: the production bucket and its token
  - `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`: the production OAuth app
  - `REPORT_EMAIL`: where "Report it" links send email
- **New accounts:** a first GitHub sign-in creates a pending account that can browse but not upload or annotate. Approve it with `npm run prod:users -- approve <github-login>` (run `npm run prod:users` to see who's waiting).
- **Schema changes:** migrations don't run during the build. Run `npm run prod:migrate` from the PR's branch **before** merging a PR that adds a migration. The live code ignores new columns and tables, but new code deployed before its migration fails. (A migration that removes or renames something the live code still uses needs the reverse order: first deploy code that no longer uses it.) `prod:migrate` uses Neon's direct connection string, from KeePassXC (below).
- **Production and preview settings for the `prod:*` and `preview:*` scripts** come from KeePassXC, not from files in the project ([ADR 0019](docs/adr/0019-prod-secrets-from-keepassxc.md)). See [KeePassXC entries](#keepassxc-entries) below. Each run asks for the database's password, so run these scripts in your own terminal.
- **Orphaned uploads:** a small AWS stack in [`infra/`](infra/README.md) deletes R2 files with no `Image` row once a day ([ADR 0018](docs/adr/0018-orphan-cleanup-on-aws.md)). It deploys from `main` through GitHub Actions after a one-time setup.
- **Before sharing the URL:** run the production checks (PROD-01 to PROD-05) and the touch checks (MAN-07, MAN-09, MAN-10) in [docs/system-tests.md](docs/system-tests.md) on a real phone.

### KeePassXC entries

`scripts/with-keepass-env.sh` reads two entries from your KeePassXC database: `a-thousand-words-prod` for the `prod:*` scripts and `a-thousand-words-preview` for the `preview:*` ones.

**Settings,** in your shell profile (for example `~/.bashrc`):

```bash
export KEEPASS_DB="$HOME/path/to/your.kdbx"   # required
export KEEPASS_GROUP="Projects"                # only if the entries are in a group; a path like Work/Projects works too
export KEEPASS_KEY_FILE="$HOME/path/to/keyfile" # only if the database uses a key file
```

The script finds an entry by its path from the root of the database. If the entries are in a group and `KEEPASS_GROUP` isn't set, it fails with "Could not find entry with path".

**Each entry's Notes field** holds one line per variable. The title must match exactly. The Password field and any custom attributes aren't read.

```
# Production:
# DATABASE_URL must be Neon's direct connection string
# R2 values must refer to the production bucket
DATABASE_URL="postgresql://neondb_owner:<password>@<host>.neon.tech/neondb?sslmode=verify-full&channel_binding=require"
R2_ACCOUNT_ID="<account id>"
R2_ACCESS_KEY_ID="<access key id>"
R2_SECRET_ACCESS_KEY="<secret access key>"
R2_BUCKET="a-thousand-words-prod"
R2_PUBLIC_URL="https://pub-<id>.r2.dev"
```

- `DATABASE_URL` is required: the script stops without it. Use Neon's **direct** string (not the `-pooler` one), with `sslmode=verify-full`. The preview entry uses the preview branch's direct string.
- `prod:seed` and `preview:seed` also need `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`. A missing `R2_BUCKET` stops even the dry run; the other three are only read when the seed runs with `--yes`. `R2_PUBLIC_URL` isn't used by these scripts; keep it there so the entry holds the whole of production's storage settings.
- **Format:** `KEY=value`, `KEY="value"` or `KEY='value'`, with no spaces around `=`. Lines starting with `#`, and blank lines, are skipped. Windows line endings are fine.
- **Not supported:** an `export ` prefix, a comment after a value on the same line (it becomes part of the value), escapes inside quotes, and values over more than one line.

## Working with Claude Code

The project is set up for an AI coding agent to work on it safely ([ADR 0015](docs/adr/0015-agent-guardrails-and-ci.md)):

- `CLAUDE.md`: the agent's rules, commands and definition of done.
- `.claude/settings.json`: what the agent may do without asking, what it may never do (read secrets, touch production, merge, force push), and the Bash sandbox. Personal additions go in `.claude/settings.local.json`, which isn't committed.
- `.claude/hooks/`: block edits to secrets and pushes of code to `main`, format each edited file, and stop the agent finishing a task while lint, typecheck or unit tests fail. The rules are strictest in git worktrees, where agents work unattended. In the main checkout, where the owner is at hand, docs (but not `CLAUDE.md` or `AGENTS.md`) can go straight to `main`, and failing checks are shown without holding the turn open ([ADR 0021](docs/adr/0021-agent-rules-by-checkout.md)).
- Branches: `plan/<slug>` carries out `docs/plans/<slug>.md`, and `adr/<number>-<slug>` carries out an ADR. Either must already be on `main`. `fix/`, `docs/` and `dependabot/` branches need neither. CI checks every pull request's branch.
- `.claude/skills/`: `write-adr` records a decision in the house format; `/release <PR>` takes a pull request to production in the right order (migrate, merge, deploy, production checks), with the owner running the production steps ([ADR 0017](docs/adr/0017-skills-and-subagents.md)).
- `.claude/agents/`: a `code-reviewer` that can only read, and a `test-writer` that can only edit test files. A hook enforces both.
- `.github/workflows/ci.yml`: branch name, format check, lint, typecheck, unit tests, build and dependency audit on every pull request. The repository ruleset requires it to pass before a merge.

## Project docs

- [One-pager & MVP scope](docs/one-pager.md)
- [Product background](docs/product-background.md): audience, prior art and the name
- [Risks](docs/discovery/risks.md): what could go wrong, and how each risk was handled
- [Architecture](docs/architecture.md)
- [Architecture Decision Records](docs/adr/README.md)
- [System tests](docs/system-tests.md): checks of the running app, with how each is run (manual or automated)
- [Orphan cleanup on AWS](infra/README.md): the CDK stack, its one-time setup and its cost
