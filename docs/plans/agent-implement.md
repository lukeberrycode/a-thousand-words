# Plan: agents carry out plans in worktrees, through to a pull request

Status: agreed, 22 October 2026. Its decisions get ADRs 0024 and 0025 when the work starts.

## Why

The goal is one command that takes a plan or ADR already on `main` and, with no one watching:

1. makes a worktree on a correctly named branch (ADR 0021);
2. carries out the plan and writes the tests it needs;
3. runs every test, the system tests included;
4. pushes the branch and opens a pull request.

Three things stop that today:

- **The system tests need the real R2 dev bucket.** `npm run worktree:setup` copies the main checkout's `.env`, secrets and all, into each worktree.
- **They reuse any dev server already on the port** (`reuseExistingServer: true`). A test run can check another checkout's code.
- **CI doesn't run them** (risk R12). So nothing stops a pull request whose system tests weren't run.

## Design

### A local R2 mock

- `src/lib/r2-config.ts`: one place that builds the S3 client settings. With `R2_ENDPOINT` set, it uses that endpoint with path-style URLs. Otherwise it uses Cloudflare as now. `src/lib/storage.ts`, `prisma/seed.ts` and `e2e/support/services.ts` all use it.
- `scripts/r2-mock.ts`: a small `node:http` server. It handles `PUT`, `GET`, `HEAD` and `DELETE` on `/<bucket>/<key>`, sends CORS headers for the browser's presigned uploads, and doesn't check signatures. Objects are stored in a folder, so they survive a restart. It has no dependencies.
- `src/lib/worktree.ts` gains the mock's port and a port for the test app server. They sit in bands apart from `devPort`.
- `npm run dev` starts the mock alongside Next when `R2_ENDPOINT` points at localhost.

### System tests use the mock by default

- Playwright starts the mock and its own `next dev` on the test port, with `reuseExistingServer: false` and a separate `distDir`. A run always tests this checkout's code.
- The test server gets mock R2 values and dummy auth values. A run needs no secrets, only `DATABASE_URL`.
- `E2E_REAL_R2=1` tests against the real bucket from `.env`, as now. ENV-04 runs only in that mode.
- `npm run worktree:setup -- --mock` writes the mock values to `.env.local` instead of copying `.env`.

### System tests in CI

A new `system` job: Postgres as a service container, migrations applied, Chromium installed, then `npm run test:system`. The owner makes it a required check.

### The agent workflow

- **Skill `implement-plan`** takes a branch name, finds its plan or ADR, and carries it out:
  - It implements the plan and searches the UI for every place a visible change is mentioned.
  - The `test-writer` subagent writes the tests.
  - It runs every check, the system tests included, fixing each failure up to three times.
  - The `code-reviewer` subagent reviews, for up to two rounds.
  - It brings the docs up to date, commits, pushes and opens a pull request.
  - The pull request is a draft, with a "Needs the owner" section, if anything is left unresolved. Unclear choices in the plan go there, not into guesses.
- **`npm run agent:implement -- <branch>`**, run by the owner:
  - It checks the branch name against `origin/main` and makes the worktree, then installs and sets up with the mock.
  - It runs `claude -p "/implement-plan <branch>"` in auto mode, with a spending cap, and logs to `.claude/agent-runs/`.
  - When the run ends, it sends a desktop notification with the pull request's link.
- **The guardrails stay as they are:** the guard hook, deny rules, sandbox, Stop hook and scoped subagents all apply inside the run.

## Done when

- `npm run test:system` passes in a worktree against the mock while another dev server holds port 3000.
- CI's `system` job passes.
- `npm run agent:implement -- adr/0022-no-links-in-annotations` opens a pull request that carries out ADR 0022, with no help.
