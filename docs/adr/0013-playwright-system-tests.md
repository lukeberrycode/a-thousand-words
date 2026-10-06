# 13. Automate the system tests with Playwright, signing in with a test session

Date: 2026-10-06 · Status: Accepted

## Context

Milestone 7 automates the checks in `docs/system-tests.md`. They exercise the whole running app: browser, Next.js server, Postgres and R2, and for sign-in, GitHub. Most of them happen on the image page, where the user draws, moves and clicks boxes on an Annotorious layer inside a view the app zooms and pans itself (ADR 0012). Options considered:

- **Playwright:** drives real Chromium, Firefox or WebKit with real mouse, keyboard and wheel input, and is what the Next.js docs recommend for end-to-end tests. Tests are TypeScript, and run in Node, so they can also check the database and bucket.
- **Cypress:** similar reach, but runs tests inside the browser, which makes direct database and R2 checks, and several tabs (SEC-02, ANN-05), awkward.
- **Component tests (Vitest with Testing Library):** fast, but they mock the server actions, the session and Annotorious's geometry, which are exactly what these tests are meant to prove.

GitHub sign-in can't be automated reliably: it needs a real account, consent screens and possibly two-factor prompts, and GitHub discourages scripted logins.

## Decision

- **Playwright** (`@playwright/test`), Chromium only, with tests in `e2e/`. `npm run test:system` runs them against the dev server and local database that the manual tests use, starting `npm run dev` if it isn't running. Each test's name starts with its test ID, and the test's **Automation** line in `docs/system-tests.md` points to it.
- **Sign-in is a test double.** The test creates a `Session` row for a test user and sets Auth.js's session cookie to its token: what a real GitHub sign-in leaves behind with database sessions (ADR 0007). The app's own code runs unchanged from there on, including `auth()` and every server action's checks. The OAuth flow itself (AUTH-02, AUTH-03, AUTH-05, PROD-02) stays manual. SEC-01 checks the app sends the visitor to GitHub, set to come back to `/upload`.
- **Real R2.** Uploads go from the browser to the bucket in `.env`, so the signed URLs, the bucket's CORS rule and the server's checks of the stored file are all exercised.
- **Each test makes and removes its own data.** Test users' ids start with `e2e-`; after each test, they're deleted with everything of theirs (the database's cascades), and their images' files are removed from R2. The setup also removes anything an interrupted run left behind. Test images are random blocks of colour, generated per test, so they never look like each other or the seed paintings to the duplicate check (ADR 0010).
- **One test at a time.** The local database that `npx prisma dev` runs mixed up queries arriving on several connections at once, failing page loads at random with "bind message supplies 3 parameters, but prepared statement requires 0". The whole run takes about two minutes.
- **The geometry is read from the page.** Tests find the image's position on screen and convert fractions of it to mouse positions, so drawing and clicking work at any zoom. The image page's animations are turned off with `prefers-reduced-motion`.

## Consequences

- 29 tests now run automatically, covering all or part of 30 of the 41 system tests in use. What stays manual needs a real GitHub account, a phone, a trackpad, the Cloudflare dashboard or the production site; the system tests list says so test by test.
- The tests need the same setup as the manual ones: the local database running, and `.env` with working R2 credentials. They don't run in CI yet; that would need a database and a test bucket there.
- The tests write to the development database and bucket. They only touch rows and files they created, but an interrupted run can leave files in R2 until the next run's cleanup (which finds rows, not files: a file from an upload that was never saved stays, the orphan case in `docs/architecture.md`).
- Tests use the page's accessible names and text ("Annotate", "Edit details", the card's `dialog` role), plus Annotorious's SVG class names for boxes and handles. An Annotorious upgrade that renames those breaks the helpers in `e2e/support/image-page.ts`, not every test.
- Running them caught a real bug on the first run: since the boxes change (ADR 0011), the duplicate check counted annotations by a column that no longer exists, so every upload failed.
