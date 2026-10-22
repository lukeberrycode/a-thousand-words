# 16. Unit tests with Vitest, formatting with Prettier, performance checks with Lighthouse CI

Date: 2026-10-12 · Status: Accepted

## Context

Testing was all system tests (ADR 0013): thorough, but two minutes per run and dependent on a database and storage. That's too slow to run after every change an agent makes, and the pure logic (upload and annotation checks, overlap, image fingerprints, the image page's geometry) had no fast tests of its own. There was no formatter, so formatting depended on whoever wrote the code, and no measure of page performance.

## Decision

- **Vitest** for unit tests, next to the code as `src/**/*.test.ts`, run with `npm test`. It works with TypeScript and the `@/` paths without a build step, and its API matches Jest's. **Version 4**, not 5: Vitest 5 needs Node 22, and the project supports Node 20. Modules that import Annotorious mock it, because OpenSeadragon doesn't load in Node.
- **Prettier** with a 120-character line, the width the code was already written to, so the one-off reformat changed 26 files lightly. The reformat is its own commit, listed in `.git-blame-ignore-revs`. Markdown is left alone, so Prettier doesn't rewrap the docs.
- **Lighthouse CI** (`npm run test:perf`) runs Lighthouse three times against a production build of the home page. Its budgets only warn, for now: the first run scored 0.86 to 0.88 for performance against a 0.9 budget.

## Consequences

- Lint, typecheck and unit tests take about 10 seconds together, so the `Stop` hook and CI can run them on every change (ADR 0015).
- Unit tests cover pure functions only. Server actions, the database and the browser stay with the system tests.
- Lighthouse needs a running database, so it runs locally and not in CI yet. Its first report gives a baseline to improve on. The image page, the heaviest one, isn't measured yet, because its URL needs an image id.
- Running Lighthouse needs Chrome; Playwright's Chromium works (`CHROME_PATH`, see the README).
