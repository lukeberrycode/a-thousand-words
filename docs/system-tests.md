# System tests

Checks that exercise the whole running app (browser, Next.js server, Postgres, R2 and GitHub) and confirm it behaves as a user would expect. They were first written as manual steps in the setup and milestone guides. This file collects them in one place.

**This list is permanent.** A test stays here after it's automated. Its **Automation** line then points to the automated test instead of saying "Manual". That way the list remains the reference for what the app must do, however each check is run. A later milestone adds the automation.

Each test has a stable ID (e.g. `AUTH-03`). Use it when referring to the test from code, commits or an automated suite. Don't renumber: add new tests at the end of their section, and mark retired ones **Retired** with the reason, rather than deleting them.


## Before you start

Unless a test says otherwise:

- The local database is running (`npx prisma dev start a-thousand-words`), and all migrations are applied (see ENV-02).
- `.env` has `DATABASE_URL`, the five `R2_*` values and the three `AUTH_*` values.
- The app is running with `npm run dev` and opened at **http://localhost:3000**. Use `localhost`, not `127.0.0.1`: GitHub returns to the exact registered redirect URI, and switching host loses the sign-in cookies.
- "Studio" means Prisma Studio (`npm run db:studio`), refreshed before each check.

**Needs** lists anything beyond that: a real GitHub account, a second browser tab, and so on. It also shows what an automated version would have to provide or fake.


## Environment

### ENV-01: Local database is reachable

- **Needs:** nothing extra
- **Steps:**
  1. Run `npx prisma dev ls`.
- **Expected:** the `a-thousand-words` server is listed as running. If it's `not_running`, `npx prisma dev start a-thousand-words` starts it.
- **Proves:** the app and Prisma have a database to connect to.
- **Automation:** Manual

### ENV-02: Migrations are applied and the schema matches

- **Needs:** nothing extra
- **Steps:**
  1. Run `npx prisma migrate status`.
  2. Run `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
- **Expected:**
  - Step 1 reports `Database schema is up to date!` and lists every folder in `prisma/migrations`.
  - Step 2 prints `-- This is an empty migration.`
- **Proves:** the database has exactly the tables and columns `schema.prisma` describes, so there's no drift between the migrations and the schema.
- **Automation:** Manual

### ENV-03: Database tables exist

- **Needs:** nothing extra
- **Steps:**
  1. Open Studio.
- **Expected:** the `User`, `Account`, `Session`, `VerificationToken`, `Image` and `Annotation` tables are listed.
- **Proves:** the migrations created every model.
- **Automation:** Manual

### ENV-04: R2 bucket is publicly readable

- **Needs:** Cloudflare dashboard access
- **Steps:**
  1. In the Cloudflare dashboard, upload a small image (e.g. `test.jpg`) to the bucket named in `R2_BUCKET`.
  2. Open `<R2_PUBLIC_URL>/test.jpg` in a browser.
  3. Delete the test file.
- **Expected:** the image shows in step 2.
- **Proves:** public read access is on and `R2_PUBLIC_URL` is correct, so image pages can show uploaded files.
- **Automation:** Manual

### ENV-05: Build and lint pass

- **Needs:** nothing extra
- **Steps:**
  1. Run `npm run lint`.
  2. Run `npm run build`.
- **Expected:** both finish without errors. The build type-checks the whole app, including the Auth.js adapter types.
- **Proves:** the code compiles and type-checks, and passes the lint rules.
- **Automation:** Manual


## Sign-in

### AUTH-01: Signed-out header

- **Needs:** signed out
- **Steps:**
  1. Open http://localhost:3000.
- **Expected:** the header shows **Sign in with GitHub**. There's no Upload link.
- **Proves:** signed-out visitors are offered sign-in, and aren't shown actions they can't use.
- **Automation:** Manual

### AUTH-02: First sign-in with GitHub

- **Needs:** a real GitHub account that hasn't signed in to this app before (or see AUTH-05 to reset)
- **Steps:**
  1. Click **Sign in with GitHub**.
  2. On GitHub, check the consent page, then click **Authorize**.
- **Expected:**
  - GitHub asks you to authorise **A Thousand Words (dev)**, for read access to your profile and email address only.
  - You come back to the home page signed in. The header shows **Upload**, your GitHub avatar, your name (hidden on narrow screens) and **Sign out**.
- **Proves:** the full OAuth flow works end to end: client ID and secret, redirect URI, `state` and PKCE checks, and session creation.
- **Automation:** Manual

### AUTH-03: Sign-in creates the right database rows

- **Needs:** just completed AUTH-02
- **Steps:**
  1. Open Studio and check `User`, `Account` and `Session`.
- **Expected:**
  - `User`: one row for you, with your GitHub name, email and `image` (avatar URL). Any old "Demo user" row is unrelated.
  - `Account`: one row with `provider` = `github`, linked to your user.
  - `Session`: one row for your current sign-in.
- **Proves:** the Prisma adapter stores users, linked accounts and database sessions as designed (ADR 0007).
- **Automation:** Manual

### AUTH-04: Sign out, then sign in again

- **Needs:** signed in
- **Steps:**
  1. Click **Sign out**.
  2. Check Studio.
  3. Sign in again.
  4. Check Studio again.
- **Expected:**
  - After step 1, you're on the home page and the header shows **Sign in with GitHub**.
  - After step 2, your `Session` row is gone.
  - In step 3, GitHub normally doesn't ask for consent again.
  - After step 4, there's a new `Session` row, but still exactly **one** `User` and one `Account` for you.
- **Proves:** signing out really ends the session on the server, and signing in again reuses the same user instead of creating a duplicate.
- **Automation:** Manual

### AUTH-05: Sign in again after revoking the app on GitHub

- **Needs:** signed in at least once before
- **Steps:**
  1. Sign out.
  2. On GitHub, go to **Settings → Applications → Authorized OAuth Apps**, and revoke **A Thousand Words (dev)**.
  3. Sign in again.
  4. Check Studio.
- **Expected:** GitHub asks for consent again. Afterwards, Studio still shows the **same** `User` row (same `id`) and no extra `Account`.
- **Proves:** users are identified by their stable GitHub account ID (`providerAccountId`), not by the access token, so revoking and re-granting access doesn't split someone into two users.
- **Automation:** Manual


## Upload

### UPL-01: Upload an image while signed in

- **Needs:** signed in; a JPEG, PNG or WebP file up to 10 MB
- **Steps:**
  1. Click **Upload**.
  2. Choose the file and enter a title.
  3. Tick the rights checkbox and click **Upload**.
- **Expected:** you land on the new image page, which shows the image, the title and **Uploaded by** followed by your GitHub name.
- **Proves:** the signed upload URL, the direct browser-to-R2 upload (including the bucket's CORS rule), the server-side checks, the reading of image dimensions, and the creation of the `Image` row all work together.
- **Automation:** Manual

### UPL-02: Uploaded image belongs to the uploader

- **Needs:** just completed UPL-01
- **Steps:**
  1. In Studio, open `Image` and find the new row.
- **Expected:** its `ownerId` is your user's `id`.
- **Proves:** ownership comes from the session, not from anything the browser sends.
- **Automation:** Manual


## Access control

### SEC-01: Upload page asks signed-out visitors to sign in

- **Needs:** signed out; a real GitHub account
- **Steps:**
  1. Go to http://localhost:3000/upload directly.
  2. Click **Sign in with GitHub** on the page, and complete sign-in.
- **Expected:**
  - Step 1 shows "You need an account to upload images." and a **Sign in with GitHub** button, instead of the form.
  - After step 2, you're back on `/upload` (not the home page) with the form showing.
- **Proves:** the page hides the form from signed-out visitors, and sign-in returns you to where you started.
- **Automation:** Manual

### SEC-02: Upload actions reject requests that aren't signed in

- **Needs:** signed in; a second tab
- **Steps:**
  1. Open `/upload` while signed in.
  2. In a second tab, sign out.
  3. Back in the first tab (whose form is still showing), choose a file, fill in the form and submit.
  4. Check Studio.
- **Expected:**
  - Step 3 shows "Sign in to upload images."
  - In step 4, there's no new `Image` row. No file is uploaded to R2, because no signed URL was issued.
- **Proves:** the server actions check the session themselves rather than relying on the page. Server actions can be called by direct POST, so this is the check that actually protects uploads.
- **Automation:** Manual


## Sources

These tests were collected on 2026-10-02 from the setup guides kept outside this repo (`lukeberrycode-help/a-thousand-words-help`):

| Guide | Tests |
| --- | --- |
| 01 Postgres setup, Step 1.5 | ENV-01, ENV-03 |
| 02 Cloudflare R2 setup, Step 7 | ENV-04 |
| 03 GitHub sign-in setup, Step 4 | AUTH-02, AUTH-05 |
| 04 Milestone 3 explained, section 12 | AUTH-01 to AUTH-05, UPL-01, UPL-02, SEC-01, SEC-02, ENV-05 |
| 05 Trying out sign-in, Steps 4 to 10 | ENV-01, ENV-02, AUTH-01 to AUTH-04, UPL-01, UPL-02, SEC-01, SEC-02 |
