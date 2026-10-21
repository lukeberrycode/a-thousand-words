@AGENTS.md

# A Thousand Words

Community annotation for images: Next.js (App Router, TypeScript), Postgres via Prisma, Cloudflare R2, Annotorious, Auth.js. Live at https://a-thousand-words-pi.vercel.app/; pushing to `main` deploys.

Model in use: Claude Opus 5.5 (October 2026). When the model changes, ask what in this file is no longer needed.

## Where things are

- Scope, non-goals and milestones: `docs/one-pager.md`. Risks: `docs/discovery/risks.md`.
- How it fits together: `docs/architecture.md`. Decisions: `docs/adr/` (index in its README).
- System tests, with their IDs and how each is run: `docs/system-tests.md`. Page behaviour rules: `docs/enrich-UI.md`.

## Commands

- `npm run lint`, `npm run typecheck`, `npm test` (Vitest unit tests, `src/**/*.test.ts`), `npm run format`.
- `npm run test:system`: Playwright system tests in `e2e/`. They need the local database (`npx prisma dev start a-thousand-words`) and R2 values in `.env`.
- `npm run test:perf`: Lighthouse CI against a production build (`npm run build` first).
- `npm run db:migrate` after a schema change, then restart `npm run dev`.

## Rules

- **Decisions get an ADR.** Any choice of library, service, data shape or approach that someone might later ask "why?" about: a new file in `docs/adr/` with the next number, *Date · Status*, then *Context*, *Decision* and *Consequences*, plus a row in `docs/adr/README.md`. Supersede old ADRs; don't delete them.
- **Never touch production.** Don't read `.env` or `.env.prod`, and don't run `npm run prod:*`. If a change needs a production migration, say so in the PR description: `npm run prod:migrate` runs **before** the merge.
- **Branches and PRs.** Work on a branch, one PR per milestone or change. The owner merges and pushes to `main`.
- **Only run installed tools.** Use `npm run <script>` or `npx --no-install <tool>`. A bare `npx <name>` downloads and runs any package with that name.
- Write docs in British English, in plain, short sentences.

## Definition of done

A task isn't finished until all of these hold. The `Stop` hook checks the first one.

- **Any code change:** `npm run lint`, `npm run typecheck` and `npm test` pass. Prettier has formatted every changed file (a hook does this on each edit).
- **New or changed logic:** pure functions have unit tests next to them. A change users can see has a system test, or its entry in `docs/system-tests.md` says why it's manual. Run `npm run test:system` for changes to the image page, uploads, sign-in or server actions.
- **Schema change:** a migration from `npm run db:migrate`, and the PR says to run `prod:migrate` before merging.
- **Docs:** the README, `docs/architecture.md` and the one-pager still describe what the code does. New decisions have an ADR; new risks go in `docs/discovery/risks.md`.
- **PR:** CI passes. The description lists anything the owner must do (migrations, settings, manual tests).
