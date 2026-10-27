# 20. Give each git worktree its own local database and dev server port

Date: 2026-10-22 · Status: Accepted

## Context

The next step for the agent workflow is several Claude Code sessions in parallel, each in its own git worktree under `.claude/worktrees/`. Worktrees keep each branch's files apart, but two things were still shared:

- **The database.** Every checkout's `.env` pointed at the same `prisma dev` server. A migration run from one branch changed the schema under every other branch.
- **The dev server.** Playwright always tested `http://localhost:3000` and reused a server already running there (ADR 0013). `npm run test:system` in one worktree tested whichever checkout's server held port 3000. Next moves a second `next dev` to another port, so nothing warned about it.

Agents don't take turns the way a person would, so "one worktree migrates or tests at a time" isn't a rule they can follow.

Options for the database:

- **One `prisma dev` server, a database per branch.** `prisma dev` runs PGlite, built for one database per server.
- **One `prisma dev` server per worktree.** `prisma dev --name <name>` keeps each server's data and ports apart, and remembers its ports across restarts.

Options for the port:

- **Pick a free port at setup and store it.** Always free when chosen, but it lives in a file, and goes stale if the worktree is set up again.
- **Work it out from the worktree's folder name.** Nothing to store or keep in sync. The same name always gives the same port.

## Decision

- **The main checkout doesn't change:** port 3000 and the `a-thousand-words` database.
- **A worktree's port** is 20000 plus an FNV-1a hash of its folder name, modulo 1000: always the same for a given name. `src/lib/worktree.ts` holds the rule, and `scripts/checkout.ts` asks git whether the checkout is a worktree. `npm run dev` (`scripts/dev.ts`) passes the port to `next dev`, because Next reads `PORT` before it loads `.env` files. `playwright.config.ts` uses the same port.
- **A worktree's database** is its own `prisma dev` server, `a-thousand-words-<name>`. `npm run worktree:setup` starts it, writes its URL to `.env.local`, applies the migrations and seeds it. It also copies `.env` from the main checkout if there isn't one, and refuses to continue if another worktree's name gives the same port. `npm run worktree:teardown` deletes the database.
- **`.env.local` wins over `.env`** everywhere, as it already did in Next. `scripts/load-env.ts` gives the same order to Prisma's config, Playwright, the seed script and `db:users`.

## Consequences

- Parallel worktrees can each migrate, seed and run the system tests without affecting the others.
- With an explicit port, `next dev` stops if the port is taken instead of moving to another one. A clash shows up as an error, not as tests run against the wrong code.
- Two folder names can hash to the same port. Setup refuses to continue when that happens between worktrees, and the fix is renaming a folder. A program outside the repository holding the port still has to be noticed by hand.
- Each worktree needs `npm install` and `npm run worktree:setup` before it runs, and `npm run worktree:teardown` before it's removed. A forgotten teardown leaves a stopped `prisma dev` server behind; `npx prisma dev ls` lists them.
- Manual GitHub sign-in only works on port 3000, the callback URL registered with GitHub, so manual sign-in checks stay in the main checkout. The automated tests don't use GitHub.
- A worktree set up with a copy of `.env` shares the R2 development bucket. Every upload uses its own keys, so that's safe for now. The seed paintings share theirs across every such checkout, so don't delete a seed painting there. System tests and `--mock` worktrees use an R2 mock instead ([ADR 0024](0024-r2-mock-for-system-tests.md)).
- Cookies aren't tied to a port, so one browser holds one session cookie for every checkout on `localhost`. Signing in on one checkout signs the browser out of another. The automated tests are unaffected: each test has a fresh browser context.
- Browsers upload straight to R2, so in a worktree set up with a copy of `.env`, the development bucket's CORS rule must allow its origin (`http://localhost:<port>`), or uploads fail there. Setup prints the origin to add.
- Two checkouts running the system tests at once share the machine's CPU. Each run takes about three times as long, and a test near its 60-second limit can time out.
- Lighthouse (`npm run test:perf`) still runs only in the main checkout, on port 3000.
