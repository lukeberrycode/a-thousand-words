# 24. System tests use a local R2 mock and their own servers, locally and in CI

Date: 2026-10-22 · Status: Accepted

## Context

The plan in `docs/plans/agent-implement.md` has an agent run every test in a worktree with no one watching. The system tests (ADR 0013) stood in the way:

- **They used the real R2 dev bucket.** Every checkout needed the five `R2_*` values, so `npm run worktree:setup` copied the main checkout's `.env`, secrets and all, into each worktree.
- **They reused any dev server already on the port.** A run could test whatever was running there, which might not be this checkout's code.
- **CI didn't run them**, for want of a database and storage (risk R12).

Options for R2:

- **MinIO in Docker.** A real S3 server, but Docker on every machine and in CI, and a container to manage.
- **An npm S3 mock.** The maintained options are thin, and it adds a dependency.
- **A small mock of our own.** The app uses four S3 calls on single objects. A plain `node:http` server can answer them in about a hundred lines, with no dependencies.

## Decision

- **`scripts/r2-mock.ts`** answers `PUT`, `GET`, `HEAD` and `DELETE` on `/<bucket>/<key>`. It doesn't check signatures, it allows any origin, and it unwraps the SDK's `aws-chunked` uploads. It keeps objects in memory, or in a folder with `--dir`. Its pure parts are in `src/lib/r2-mock.ts`, with unit tests.
- **`R2_ENDPOINT`** points the S3 client at the mock, with path-style URLs. `src/lib/r2-config.ts` builds the client settings for the app, the seed script and the test helpers alike. With `R2_ENDPOINT` unset, nothing changes.
- **Each test run starts its own servers** on the checkout's test ports (`checkoutPort` in `src/lib/worktree.ts`):
  - an R2 mock in memory;
  - `next dev` building into `.next-test`, because Next allows one dev server per build folder.

  Nothing is reused. The run sets mock R2 values and dummy auth values (`src/lib/mock-env.ts`), so all it needs from `.env` is `DATABASE_URL`.
- **`E2E_REAL_R2=1`** runs the tests against the real bucket from `.env` instead, for an occasional check that R2 itself still behaves. That runs as the tests did before: in the main checkout, on port 3000, reusing its dev server. The dev bucket's CORS rule only accepts uploads from `http://localhost:3000`, so worktrees never could upload to it. Before this ADR, upload tests in a worktree failed for that reason.
- **`npm run worktree:setup -- --mock`** gives a worktree mock values instead of a copy of `.env`, and seeds the mock (folder `.r2-mock/`). `npm run dev` then starts the mock alongside Next.
- **CI's `system` job** runs the system tests with a Postgres service container and the mock.

## Consequences

- System tests need no secrets, so they run in CI and in worktrees an agent works in. R12 now covers what users see, not only lint, types and unit tests.
- A run always tests its own checkout's code, even with a dev server running there.
- The mock is more lenient than R2. It accepts unsigned or expired URLs, and any content type or length. The app's own checks are still tested, because they run on the server, but a mistake in signing would only show against real R2. `E2E_REAL_R2=1` covers that, by hand.
- Each run starts a fresh `next dev`, which adds a few seconds to compile.
- A `--mock` worktree can't sign in with GitHub. That only ever worked on port 3000.
- `tsconfig.json` lists `.next-test` type folders, or Next would add them itself on the first run.
