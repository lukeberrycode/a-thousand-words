# System tests

Checks that exercise the whole running app (browser, Next.js server, Postgres, R2 and GitHub) and confirm it behaves as a user would expect. They were first written as manual steps in the setup and milestone guides. This file collects them in one place.

**This list is permanent.** A test stays here after it's automated. Its **Automation** line then points to the automated test instead of saying "Manual". That way the list remains the reference for what the app must do, however each check is run. Milestone 7 added the automation ([ADR 0013](adr/0013-playwright-system-tests.md)).

**System tests aren't user experience docs.** These tests assume an operator with access to both the development environment (terminal, Prisma Studio, the Cloudflare dashboard) and the browser, and they're tied to the current implementation: table names, commands, error messages. Milestone 8 adds separate user experience documentation. It describes what a user sees and does, independent of how the app is built, so it stays valid through a refactor or full rebuild.

Each test has a stable ID (e.g. `AUTH-03`). Use it when referring to the test from code, commits or an automated suite. Don't renumber: add new tests at the end of their section, and mark retired ones **Retired** with the reason, rather than deleting them.


## Before you start

Unless a test says otherwise:

- The local database is running (`npx prisma dev start a-thousand-words`), and all migrations are applied (see ENV-02).
- `.env` has `DATABASE_URL`, the five `R2_*` values and the three `AUTH_*` values.
- The app is running with `npm run dev` and opened at **http://localhost:3000**. Use `localhost`, not `127.0.0.1`: GitHub returns to the exact registered redirect URI, and switching host loses the sign-in cookies.
- "Studio" means Prisma Studio (`npm run db:studio`), refreshed before each check.

**Needs** lists anything beyond that: a real GitHub account, a second browser tab, and so on. It also shows what an automated version would have to provide or fake.


## Running the automated tests

```bash
npx playwright install chromium   # once
npm run test:system               # every automated test, about two minutes
npm run test:system -- -g ANN-0   # only the tests whose names match, e.g. ANN-01 to ANN-08
```

- **Setup:** the local database running with migrations applied. Nothing else: each run starts its own R2 mock (`scripts/r2-mock.ts`, objects in memory) and its own `next dev`, building into `.next-test`, on the checkout's test ports (3100 and 3101 in the main checkout). They never reuse a dev server already running, so a run always tests this checkout's code, and needs no R2 or GitHub values from `.env` ([ADR 0024](adr/0024-r2-mock-for-system-tests.md)).
- **Against real R2:** `E2E_REAL_R2=1 npm run test:system` uses the bucket from `.env` instead of the mock, as the tests did before it. Run it now and then, since the mock doesn't check signatures. It runs only in the main checkout, on port 3000, using the dev server there if one is running: the dev bucket's CORS rule accepts uploads from `http://localhost:3000` only.
- **In CI:** the `system` job runs them on every pull request, with Postgres as a service container.
- **In a git worktree:** run `npm run worktree:setup` (or `npm run worktree:setup -- --mock`, which needs no `.env`) first. The tests then use the worktree's own database and port, so several worktrees can run them at once ([ADR 0020](adr/0020-worktree-database-and-port.md)). SEC-01 checks the GitHub callback for the worktree's port, which GitHub itself would refuse: manual sign-in checks stay in the main checkout.
- **Sign-in:** the tests don't use GitHub. Each signs in by creating a `Session` row for a test user and setting the session cookie, which is what a real sign-in leaves behind (ADR 0013). The OAuth flow itself stays a manual test.
- **Data:** each test creates its own users (ids starting `e2e-`), images and annotations in the development database and the R2 mock, and deletes them afterwards. The content tests (CON-*) also use content keys, collection slugs and content file names containing `e2e-`, and delete those rows and their files afterwards. The content account (`seed-user`), the paintings content files added and your own content are never touched.
- **One at a time:** the local database from `npx prisma dev` fails at random when several connections query it at once, so tests run serially.
- **A failure** leaves a trace in `test-results/`. Open it with `npx playwright show-trace <path>/trace.zip` to step through the page as it was.
- **Each test's name starts with its ID,** and its **Automation** line below says which file it's in and which steps, if any, stay manual.


## Environment

### ENV-01: Local database is reachable

- **Needs:** nothing extra
- **Steps:**
  1. Run `npx prisma dev ls`.
- **Expected:** the `a-thousand-words` server is listed as running. If it's `not_running`, `npx prisma dev start a-thousand-words` starts it.
- **Proves:** the app and Prisma have a database to connect to.
- **Automation:** Automated: [`e2e/env.spec.ts`](../e2e/env.spec.ts) runs a query instead of `prisma dev ls`.

### ENV-02: Migrations are applied and the schema matches

- **Needs:** nothing extra
- **Steps:**
  1. Run `npx prisma migrate status`.
  2. Run `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
- **Expected:**
  - Step 1 reports `Database schema is up to date!`, and its count of migrations found matches the folders in `prisma/migrations`.
  - Step 2 prints `-- This is an empty migration.`
- **Proves:** the database has exactly the tables and columns `schema.prisma` describes, so there's no drift between the migrations and the schema.
- **Automation:** Automated: [`e2e/env.spec.ts`](../e2e/env.spec.ts).

### ENV-03: Database tables exist

- **Needs:** nothing extra
- **Steps:**
  1. Open Studio.
- **Expected:** the `User`, `Account`, `Session`, `VerificationToken`, `Image`, `Region` and `Annotation` tables are listed.
- **Proves:** the migrations created every model.
- **Automation:** Automated: [`e2e/env.spec.ts`](../e2e/env.spec.ts) lists the tables with SQL instead of Studio.

### ENV-04: R2 bucket is publicly readable

- **Needs:** Cloudflare dashboard access
- **Steps:**
  1. In the Cloudflare dashboard, upload a small image (e.g. `test.jpg`) to the bucket named in `R2_BUCKET`.
  2. Open `<R2_PUBLIC_URL>/test.jpg` in a browser.
  3. Delete the test file.
- **Expected:** the image shows in step 2.
- **Proves:** public read access is on and `R2_PUBLIC_URL` is correct, so image pages can show uploaded files.
- **Automation:** Automated: [`e2e/env.spec.ts`](../e2e/env.spec.ts) uploads the test file with the R2 API instead of the dashboard. By default that checks the R2 mock; run it with `E2E_REAL_R2=1` to check the real bucket.

### ENV-05: Build and lint pass

- **Needs:** nothing extra
- **Steps:**
  1. Run `npm run lint`.
  2. Run `npm run build`.
- **Expected:** both finish without errors. The build type-checks the whole app, including the Auth.js adapter types.
- **Proves:** the code compiles and type-checks, and passes the lint rules.
- **Automation:** Manual: run the two commands before merging.


## Sign-in

### AUTH-01: Signed-out header

- **Needs:** signed out
- **Steps:**
  1. Open http://localhost:3000.
- **Expected:** the header shows **Sign in with GitHub**. There's no Upload link.
- **Proves:** signed-out visitors are offered sign-in, and aren't shown actions they can't use.
- **Automation:** Automated: [`e2e/auth.spec.ts`](../e2e/auth.spec.ts).

### AUTH-02: First sign-in with GitHub

- **Needs:** a real GitHub account that hasn't signed in to this app before (or see AUTH-05 to reset)
- **Steps:**
  1. Click **Sign in with GitHub**.
  2. On GitHub, check the consent page, then click **Authorize**.
- **Expected:**
  - GitHub asks you to authorise **A Thousand Words (dev)**, for read access to your profile and email address only.
  - You come back to the home page signed in. The header shows your GitHub avatar, your name (hidden on narrow screens) and **Sign out**. A brand-new account also shows **Awaiting approval** where **Upload** would be, until it's approved (SEC-03, SEC-04).
- **Proves:** the full OAuth flow works end to end: client ID and secret, redirect URI, `state` and PKCE checks, and session creation.
- **Automation:** Manual. Needs a real GitHub account.

### AUTH-03: Sign-in creates the right database rows

- **Needs:** just completed AUTH-02
- **Steps:**
  1. Open Studio and check `User`, `Account` and `Session`.
- **Expected:**
  - `User`: one row for you, with your GitHub name, email and `image` (avatar URL). `approvedAt` is empty for a brand-new account (it's pending). Any old "Demo user" row is unrelated.
  - `Account`: one row with `provider` = `github`, linked to your user.
  - `Session`: one row for your current sign-in.
- **Proves:** the Prisma adapter stores users, linked accounts and database sessions as designed (ADR 0007).
- **Automation:** Manual. Needs a real GitHub sign-in.

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
- **Automation:** Partly automated: [`e2e/auth.spec.ts`](../e2e/auth.spec.ts) covers steps 1 and 2. Signing in again needs GitHub, so steps 3 and 4 are manual.

### AUTH-05: Sign in again after revoking the app on GitHub

- **Needs:** signed in at least once before
- **Steps:**
  1. Sign out.
  2. On GitHub, go to **Settings → Applications → Authorized OAuth Apps**, and revoke **A Thousand Words (dev)**.
  3. Sign in again.
  4. Check Studio.
- **Expected:** GitHub asks for consent again. Afterwards, Studio still shows the **same** `User` row (same `id`) and no extra `Account`.
- **Proves:** users are identified by their stable GitHub account ID (`providerAccountId`), not by the access token, so revoking and re-granting access doesn't split someone into two users.
- **Automation:** Manual. Needs a real GitHub account.


## Upload

### UPL-01: Upload an image while signed in

- **Needs:** signed in; a JPEG, PNG or WebP file up to 10 MB
- **Steps:**
  1. Click **Upload**.
  2. Choose the file and enter a title.
  3. Tick the rights checkbox and click **Upload**.
- **Expected:** you land on the new image page, which shows the image, the title and **Uploaded by** followed by your GitHub name.
- **Proves:** the signed upload URL, the direct browser-to-R2 upload (including the bucket's CORS rule), the server-side checks, the reading of image dimensions, and the creation of the `Image` row all work together.
- **Automation:** Automated: [`e2e/upload.spec.ts`](../e2e/upload.spec.ts), with UPL-02.

### UPL-02: Uploaded image belongs to the uploader

- **Needs:** just completed UPL-01
- **Steps:**
  1. In Studio, open `Image` and find the new row.
- **Expected:** its `ownerId` is your user's `id`.
- **Proves:** ownership comes from the session, not from anything the browser sends.
- **Automation:** Automated: [`e2e/upload.spec.ts`](../e2e/upload.spec.ts), with UPL-01.


### UPL-03: Duplicate warning

- **Needs:** signed in; a copy of an image already on the site, at a different size or format (e.g. a seed painting downloaded from Wikimedia at another width, or the same file re-saved as WebP)
- **Steps:**
  1. Upload it.
  2. Click **Cancel**.
  3. Upload it again, and click **Go to it**.
- **Expected:**
  - Step 1 shows "This looks like an image that's already here." (or "This exact image is already here." for the identical file), with the existing image's thumbnail, title and annotation count. Nothing new appears on the home page.
  - Step 2 clears the warning, and the form can be used again.
  - Step 3 opens the existing image's page.
  - After steps 2 and 3, the uploaded file is gone from the R2 bucket, and no new `Image` row exists.
- **Proves:** look-alike uploads are caught before they're saved, and backing out leaves nothing behind (ADR 0010).
- **Automation:** Automated: [`e2e/upload.spec.ts`](../e2e/upload.spec.ts), including the exact-copy message.

### UPL-04: Upload anyway

- **Needs:** as UPL-03
- **Steps:**
  1. Upload the look-alike, and click **Upload anyway** on the warning.
  2. Delete the new image afterwards (MAN-05).
- **Expected:** step 1 opens the new image's page. In Studio, its row has `sha256` and `phash` filled in.
- **Proves:** the warning never blocks a deliberate upload.
- **Automation:** Automated: [`e2e/upload.spec.ts`](../e2e/upload.spec.ts).

### UPL-05: Different images aren't flagged

- **Needs:** signed in; an image not on the site
- **Steps:**
  1. Upload it.
- **Expected:** no warning. It saves and opens its page as in UPL-01.
- **Proves:** the duplicate check doesn't get in the way of ordinary uploads.
- **Automation:** Automated: [`e2e/upload.spec.ts`](../e2e/upload.spec.ts).


## Access control

### SEC-01: Upload page asks signed-out visitors to sign in

- **Needs:** signed out; a real GitHub account whose account here is approved
- **Steps:**
  1. Go to http://localhost:3000/upload directly.
  2. Click **Sign in with GitHub** on the page, and complete sign-in.
- **Expected:**
  - Step 1 shows "You need an account to upload images." and a **Sign in with GitHub** button, instead of the form.
  - After step 2, you're back on `/upload` (not the home page) with the form showing.
- **Proves:** the page hides the form from signed-out visitors, and sign-in returns you to where you started.
- **Automation:** Partly automated: [`e2e/access.spec.ts`](../e2e/access.spec.ts) covers step 1, and checks step 2 up to GitHub: the button goes to GitHub's authorize page, set to come back to `/upload`. Completing sign-in is manual.

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
- **Automation:** Automated: [`e2e/access.spec.ts`](../e2e/access.spec.ts).

### SEC-03: A pending account can browse but not contribute

- **Needs:** signed in with an account whose `approvedAt` is empty: a new GitHub account, or your own with `approvedAt` cleared in Studio
- **Steps:**
  1. Look at the header.
  2. Go to `/upload`.
  3. Open any image page.
- **Expected:**
  - Step 1 shows **Awaiting approval** instead of **Upload**.
  - Step 2 shows "Your account is waiting for approval. You can upload and annotate once it's approved." instead of the form.
  - Step 3 shows the same message instead of the **Annotate** button. Existing annotations still show and can be read.
- **Proves:** new accounts can't contribute until approved. Every upload, annotation and image action also returns that message to a pending account, so a direct POST is refused too.
- **Automation:** Automated: [`e2e/access.spec.ts`](../e2e/access.spec.ts).

### SEC-04: Approve a pending account

- **Needs:** a pending account, as in SEC-03
- **Steps:**
  1. Run `npm run db:users`.
  2. Run `npm run db:users -- approve <github-login>`, using the login listed in step 1.
  3. Reload any page in the browser where the pending account is signed in.
  4. Run step 2 again, then `npm run db:users -- approve nobody-xyz` (a login that hasn't signed in).
- **Expected:**
  - Step 1 lists the account with its GitHub login, name, email, sign-up date and a link to its GitHub profile.
  - Step 2 prints "Approved …".
  - After step 3, the header shows **Upload**, and the upload form and **Annotate** button are back. No sign-out is needed.
  - Step 4 prints "… was already approved …", then "No account found …" (exit code 1).
- **Proves:** the approval script finds accounts by GitHub login and approves them, and approval takes effect on the next page load. `prod:users` runs the same script against production.
- **Automation:** Automated: [`e2e/access.spec.ts`](../e2e/access.spec.ts), approving the test account by email, as it has no GitHub login. Approving by GitHub login is manual.


## Annotations

### ANN-01: Create an annotation

- **Needs:** signed in; an image page
- **Steps:**
  1. Click **Annotate**.
  2. Drag a box over part of the image.
  3. Optionally move or resize the box.
  4. Type some Markdown, e.g. `**Bold** and _italic_`, and click **Save**.
- **Expected:**
  - After step 1, the button reads **Done annotating**, with a hint to drag a box.
  - After step 2, the view zooms so the box and an editor card sit side by side, and the UI panel hides. The editor's help text lists bold, italic and lists, and says links show as plain text (ADR 0022).
  - After step 4, the editor closes and you're still in annotate mode. The new region is open: drawn with a thick amber outline while the others recede, and its card shows the formatted text, your name, and **Edit** and **Delete**. The region sits where the box was when you clicked Save.
- **Proves:** drawing, the pixels-to-fractions conversion, the server action and the page refresh work together.
- **Automation:** Automated: [`e2e/annotations.spec.ts`](../e2e/annotations.spec.ts).

### ANN-02: Annotations are visible to everyone and stay aligned

- **Needs:** just completed ANN-01; a second browser or a private window, signed out
- **Steps:**
  1. Open the same image page signed out.
  2. Click the region, or its entry in the UI panel's annotation list.
  3. Close the card, zoom in and out, and resize the window, or use a phone-sized view.
- **Expected:**
  - Step 1 shows the region. The UI panel has no **Annotate** button, but has a **Sign in with GitHub to annotate** button.
  - Step 2 shows the annotation's text and author.
  - In step 3, the region stays over the same part of the image at every size.
- **Proves:** annotations are public, and fractional coordinates keep them aligned (ADR 0005).
- **Automation:** Automated: [`e2e/annotations.spec.ts`](../e2e/annotations.spec.ts), at 1280 × 800 and 400 × 820, zoomed in and out.

### ANN-03: Cancelling and leaving annotate mode discard the draft

- **Needs:** signed in; an image page
- **Steps:**
  1. Click **Annotate**, draw a box, then click **Cancel**.
  2. Draw another box, close its card with ✕ (the UI panel is hidden while the editor is open), then click **Done annotating**.
  3. Check Studio.
- **Expected:** after each of steps 1 and 2, the box disappears. In step 3, no new `Annotation` row exists.
- **Proves:** drafts only exist in the browser until saved.
- **Automation:** Automated: [`e2e/annotations.spec.ts`](../e2e/annotations.spec.ts).

### ANN-04: Annotation text is rendered safely

- **Needs:** signed in; an image page
- **Steps:**
  1. Save an annotation whose text is:

     ```
     <b onclick="alert(1)">html</b> [bad](javascript:alert(1)) ![pic](https://example.com/x.png) [good](https://example.com) <https://example.com/auto> https://example.com/bare
     ```

  2. Select it, and inspect the card with the browser's dev tools.
  3. Check the new `Annotation` row in Studio.
- **Expected:**
  - Step 1 saves with no error, even though the text has link syntax.
  - The HTML shows as plain text.
  - No image loads, and neither `pic` nor the image's URL shows.
  - The card has no links at all. `bad` and `good` show as plain text, without their URLs.
  - The autolink shows as the plain text `https://example.com/auto`, without its angle brackets. The bare URL shows as plain text.
  - In step 3, `bodyMarkdown` is exactly the text typed, links included.
- **Proves:** untrusted annotation text can't run scripts, load images (ADR 0008) or link anywhere (ADR 0022). Links are removed when the text is shown, not when it's saved.
- **Automation:** Automated: [`e2e/annotations.spec.ts`](../e2e/annotations.spec.ts).

### ANN-05: The annotation action rejects requests that aren't signed in

- **Needs:** signed in; a second tab
- **Steps:**
  1. On an image page, click **Annotate**, draw a box and type some text.
  2. In a second tab, sign out.
  3. Back in the first tab, click **Save**.
  4. Check Studio.
- **Expected:** step 3 shows "Sign in to annotate." In step 4, there's no new `Annotation` row.
- **Proves:** the server action checks the session itself.
- **Automation:** Automated: [`e2e/annotations.spec.ts`](../e2e/annotations.spec.ts).

### ANN-06: Annotate again straight after saving

- **Needs:** signed in; an image page
- **Steps:**
  1. Create an annotation (ANN-01), without reloading the page afterwards.
  2. Click **Annotate** again and drag a new box.
  3. On a phone, draw another box.
- **Expected:**
  - After step 1, while saving, the box stays in place and the editor shows **Saving…** until the new region appears. There's no empty editor afterwards.
  - Step 2 draws a new box, closes the previous card and opens the editor beside the new box.
  - In step 3, the view doesn't jump away from the box when the editor opens.
- **Proves:** draft state is cleared after a save, the save hands over smoothly to the refreshed data, and focusing the editor doesn't move the page. Each was a bug found while testing milestone 4.
- **Automation:** Partly automated: [`e2e/annotations.spec.ts`](../e2e/annotations.spec.ts) covers steps 1 and 2. Step 3 needs a phone.


### ANN-07: A click on nested boxes goes to the smaller one

- **Needs:** The School of Athens (seeded): Raphael's small box overlaps the larger Ptolemy box at the far right
- **Steps:**
  1. Click inside the Ptolemy box, away from Raphael's box.
  2. Click where Raphael's box overlaps the Ptolemy box.
- **Expected:**
  - Step 1 opens Ptolemy's annotation.
  - Step 2 opens Raphael's, not Ptolemy's.
- **Proves:** Annotorious gives a click to the smallest box under the pointer, so nested boxes stay reachable (ADR 0011). Checked on 2026-10-04 with Annotorious 3.9.3; re-run after upgrading Annotorious.
- **Automation:** Automated: [`e2e/annotations.spec.ts`](../e2e/annotations.spec.ts), with two boxes nested the same way rather than the seed painting. Checked on 2026-10-04 with Annotorious 3.9.3; the automated test re-checks it after an upgrade.

### ANN-08: An overlapping box is refused, and you can add to the existing one instead

- **Needs:** signed in and approved; an image with a box you haven't annotated
- **Steps:**
  1. Click **Annotate** and draw a box almost exactly over the existing one.
  2. Resize the new box to be clearly larger than the existing one, then shrink it back over it.
  3. Click **Add to that annotation**.
  4. Write some text and click **Save**.
  5. Click **Edit** on your new annotation, change the text and save.
- **Expected:**
  - Step 1: as soon as the box is drawn, the editor says "This box overlaps an existing one too much…", with **Add to that annotation** and **Adjust my box**, and **Save** is disabled.
  - Step 2: the warning disappears while the box is larger, and comes back when it's shrunk back.
  - Step 3: the new box goes, annotate mode ends, and the existing box's card opens with an "Add your annotation" form.
  - Step 4: the card shows both annotations, oldest first. Yours has **Edit** and **Delete**, the other doesn't, and "+ Add your annotation" is gone. The list entry shows "+1".
  - Step 5: only the text is editable (no box handles), because someone else drew the box.
- **Proves:** the overlap rule is checked live in the browser, the user is steered to add to the existing box, and a box holds several annotations (ADR 0011). The server checks the rule too, so a direct POST can't get round it.
- **Automation:** Automated: [`e2e/annotations.spec.ts`](../e2e/annotations.spec.ts).

## Reading and managing

### MAN-01: Hover previews, click pins

**Retired** (2026-10-04): hovering no longer shows annotation text; reading needs an explicit click (ADR 0011). Replaced by MAN-08.

### MAN-02: Only your own content shows Edit and Delete

- **Needs:** signed in; an image you uploaded, with an annotation by you and one by someone else; an image someone else uploaded
- **Steps:**
  1. Select your annotation, then the other person's.
  2. Open your image, then the other person's.
- **Expected:**
  - Step 1: your annotation has **Edit** and **Delete**, and the other person's has neither.
  - Step 2: your image has **Edit details** and **Delete image**, and the other person's has neither.
- **Proves:** the page only offers changes the user is allowed to make.
- **Automation:** Automated: [`e2e/manage.spec.ts`](../e2e/manage.spec.ts).

### MAN-03: Edit an annotation's box and text

- **Needs:** signed in; an annotation of yours
- **Steps:**
  1. Select it and click **Edit**.
  2. Drag the box somewhere else, change the text and click **Save**.
  3. Click **Edit** again, drag the box, then click **Cancel**.
- **Expected:**
  - Step 1: the box gets handles, and the editor opens with the current text.
  - Step 2: the editor shows **Saving…**, then the card shows the new text and "· edited". The box stays where you left it, and old text never reappears.
  - Step 3: the box jumps back to its saved position.
- **Proves:** region and text edits save together, and unsaved moves can be undone. Only for a box you drew that holds only your annotations; see ANN-08 for the text-only case.
- **Automation:** Automated: [`e2e/manage.spec.ts`](../e2e/manage.spec.ts).

### MAN-04: Delete an annotation

- **Needs:** signed in; an annotation of yours
- **Steps:**
  1. Select it, click **Delete**, then **Keep**.
  2. Click **Delete**, then the red **Delete**.
- **Expected:**
  - Step 1 changes nothing.
  - Step 2 removes the annotation. If it was the box's only annotation, the region and its list entry go too, and in Studio both the `Annotation` and its `Region` row are gone. If others remain, the box stays with theirs.
- **Proves:** deletion asks first and then removes the annotation everywhere, and doesn't leave empty boxes.
- **Automation:** Automated: [`e2e/manage.spec.ts`](../e2e/manage.spec.ts), both for a box's only annotation and for one on a box shared with someone else.

### MAN-05: Edit and delete your own image

- **Needs:** signed in; an image of yours that you don't mind losing, ideally with an annotation by someone else
- **Steps:**
  1. Click **Edit details**, change the title and description and click **Save**.
  2. Click **Delete image**, read the message, then confirm.
  3. Check Studio and the R2 bucket.
- **Expected:**
  - Step 1 updates the heading, the description and the browser tab title.
  - Step 2's message counts the annotations and warns that other people's go too. Confirming takes you to the home page, where the image is no longer listed.
  - Step 3: the `Image` row and its `Annotation` rows are gone, and so is the file in R2.
- **Proves:** owners control their images, and deleting one cleans up the database and storage.
- **Automation:** Automated: [`e2e/manage.spec.ts`](../e2e/manage.spec.ts).

### MAN-06: The server refuses changes to other people's content

- **Needs:** signed in; an annotation of yours; Studio
- **Steps:**
  1. Select your annotation and click **Edit**.
  2. In Studio, change that annotation's `authorId` to another user's.
  3. Click **Save**.
  4. Change `authorId` back.
- **Expected:** step 3 shows "That annotation doesn't exist, or isn't yours." and nothing changes.
- **Proves:** the server actions check ownership themselves rather than trusting the page.
- **Automation:** Automated: [`e2e/manage.spec.ts`](../e2e/manage.spec.ts).

### MAN-07: Mobile annotate mode

- **Needs:** signed in and approved; a phone
- **Steps:**
  1. Outside annotate mode, drag and pinch on the image.
  2. Tap **Annotate**, then drag and pinch on the image.
  3. Edit an existing annotation of yours (one whose box you drew).
- **Expected:**
  - Step 1 pans and zooms the image. The page itself never scrolls or zooms, and the UI panel and cards stay the same size.
  - In step 2, dragging draws a box instead of panning, and pinching does nothing. The view zooms to the new box, with the editor card beside it.
  - In step 3, dragging the box moves it instead of panning.
- **Proves:** touch drawing doesn't fight with zooming and panning, and the editor doesn't hide the box.
- **Automation:** Manual. Rewritten for the artwork-led image page (ADR 0012); not yet run on a real phone. The previous version passed on real phones on 2026-10-03 (PROD-05).


### MAN-08: Click to read; the open box stands out

- **Needs:** an image with at least three annotations; a mouse
- **Steps:**
  1. Hover over a region without clicking.
  2. Click a region.
  3. Click an empty part of the image.
  4. Click a different region, or pick one from the UI panel's annotation list.
- **Expected:**
  - Step 1 opens nothing.
  - Step 2 opens a card beside that box, and the view zooms so the box (with some space round it) and the card fill the screen. The UI panel hides. The box gets a thick amber outline and a light fill; the other boxes become thin and faint.
  - Step 3 closes the card, leaves the view where it is, and brings the UI panel back.
  - Step 4 opens the new box's card and zooms to it.
- **Proves:** reading needs an explicit click, and it's always clear which box the text belongs to.
- **Automation:** Automated: [`e2e/manage.spec.ts`](../e2e/manage.spec.ts). Step 3 changed with the artwork-led image page: clicking empty image used to leave the box open.

### MAN-09: The editor stays above the on-screen keyboard

- **Needs:** signed in and approved; a real phone (an iPhone and an Android phone if possible). Emulators and DevTools' device mode don't reproduce the keyboard.
- **Steps:**
  1. On an image page, in portrait, turn on **Annotate** and draw a box in the lower half of the image.
  2. Tap the editor's text box, and type a few lines.
  3. Tap **Cancel**, open one of your own annotations, and tap **Edit**, then the text box.
  4. Close the keyboard (the keyboard's own close or done key).
- **Expected:**
  - In step 1, the editor card opens above the box.
  - In steps 2 and 3, the view zooms again so the box and the card both sit above the keyboard, with the text box and **Save** visible. The card takes at most about 40% of the space above the keyboard, scrolling inside if needed.
  - In step 4, the box stays where it is, and the extra space appears round it.
- **Proves:** the view and cards use the visible area, not the full screen, on both iOS (visual viewport) and Android (`interactive-widget=resizes-content`).
- **Automation:** Manual. Needs a real device. Rewritten for the artwork-led image page; not yet run. The previous version passed on Android on 2026-10-04.

### MAN-10: Zoom, pan and the UI panel

- **Needs:** an image page; a laptop with a mouse or trackpad, and a phone
- **Steps:**
  1. Open the page in a landscape window, then in portrait on the phone.
  2. Zoom in with the mouse wheel, a trackpad pinch, Ctrl + `+`, the panel's **Zoom in** button, and on the phone a pinch and a double-tap. Zoom out the same ways as far as it goes.
  3. Zoomed in, drag the image left (landscape) or up (portrait), then the other way. Then tap the panel's flip button.
  4. Zoomed in, pan with a trackpad two-finger scroll and with the arrow keys.
  5. Tap the boxes button, then **Annotate**.
  6. On a phone with a notch or camera cut-out, in landscape, zoom in and pan to the image's edges.
- **Expected:**
  - Step 1: the whole image is visible at first. The panel is on the right in landscape and at the bottom in portrait, with the image at the opposite edge.
  - Step 2: each zooms around the pointer, fingers or centre; the page itself never zooms, and the panel stays the same size. Zooming out stops when the whole image is visible. The zoom buttons show next to the flip button on the laptop, not on the phone, and are disabled in annotate mode.
  - Step 3: dragging the image left puts the panel on the left (portrait: up puts it at the top), and the other way moves it back. The flip button swaps edges, and at the fit size the image moves to the opposite edge.
  - Step 4: both pan, and move the panel like a drag.
  - Step 5: the boxes disappear, then come back when annotate mode starts.
  - Step 6: zoomed in, the image runs under the cut-out to the screen's edge, but panning stops with its edge clear of the cut-out. The panel and cards never go under it.
- **Proves:** the app owns zoom and pan (ADR 0012), the panel keeps out of the way (Rule 3), and the safe area is respected (Rule 7).
- **Automation:** Partly automated: [`e2e/zoom.spec.ts`](../e2e/zoom.spec.ts) covers steps 1 to 5 in desktop Chrome with a mouse: the zoom buttons, mouse wheel and keys, dragging, the flip button, arrow keys, scrolling and the boxes button. The trackpad pinch, touch gestures and step 6 need a laptop trackpad and a phone. Checked by hand on 2026-10-06 in desktop Chrome; not yet on a phone or with a trackpad.


## Content

Content files in `prisma/content` add and correct paintings, annotations and collections, each applied once per database (ADR 0026). The unit tests check every file and the planner's guards (`src/lib/content/*.test.ts`). These tests check the runner's writes against a real database. Each applies small content files of its own, with `e2e-` keys and file names such as `9901-e2e-1a2b3c4d`, through `applyFile` in `src/lib/content/runner.ts`. Downloads from Commons are faked with test pictures, and paintings go to the R2 mock.

The runner needs the generated Prisma client, which Playwright can't load (`e2e/support/services.ts`), so the tests run it in a separate `tsx` process (`e2e/support/content-run.ts`). By hand, the same checks are made with your own content file in `prisma/content`, `npm run content:apply` and Studio. Delete the file and its `ContentMigration` row afterwards.

### CON-01: A content file is applied and recorded

- **Needs:** a content file that adds a painting, a painting Commons doesn't have, a box with an annotation, and a new collection holding the painting
- **Steps:**
  1. Apply it.
  2. Check Studio and the R2 bucket.
  3. Open the painting's page and click its box.
- **Expected:**
  - Step 1 lists four changes, and one skip: the painting Commons doesn't have.
  - In step 2, the `Image` row has the painting's `contentKey`, belongs to the content account (`seed-user`), and its file is in R2 at `images/seed/<key>.jpg`. The `Region` has the box's `contentKey`, with one annotation by the content account. The new `Collection` comes after every other row, and holds the painting. The `ContentMigration` row has the file's name, the checksum of its operations, and a summary listing the changes and the skip.
  - In step 3, the card shows the annotation, by "A Thousand Words".
- **Proves:** the runner makes every write a file asks for, in one transaction with its record, and a step that can't be done doesn't stop the rest.
- **Automation:** Automated: [`e2e/content.spec.ts`](../e2e/content.spec.ts).

### CON-02: A user's box blocks a content box

- **Needs:** a content painting with a box a user drew on it
- **Steps:**
  1. Apply a file that adds one box almost covering the user's box, and one clear of it.
  2. Check Studio.
- **Expected:** step 1 skips the first box, saying it would hide, or be hidden by, another user's box, and adds the second. In step 2, the first box doesn't exist, and the user's box and annotation are exactly as they were. The skip is in the `ContentMigration` summary.
- **Proves:** content follows the overlap rule (ADR 0011) against users' boxes, and never moves them.
- **Automation:** Automated: [`e2e/content.spec.ts`](../e2e/content.spec.ts).

### CON-03: removePainting is refused when a user has annotated the painting

- **Needs:** two content paintings, one with a user's annotation on a content box
- **Steps:**
  1. Apply a file that removes both.
  2. Check Studio and the R2 bucket.
- **Expected:** step 1 skips the annotated painting ("someone else has annotated it") and removes the other. In step 2, the annotated painting, its file and the user's annotation are all still there; the other painting's row and file are gone.
- **Proves:** a content file can't delete users' annotations along with a painting.
- **Automation:** Automated: [`e2e/content.spec.ts`](../e2e/content.spec.ts). The guard is also part of the `DELETE` itself, for an annotation added during the run; that race isn't tested.

### CON-04: removeAnnotation keeps a box that holds a user's annotation

- **Needs:** a content painting with two content boxes, one of them also holding a user's annotation
- **Steps:**
  1. Apply a file that removes both content annotations.
  2. Check Studio.
- **Expected:** both content annotations are gone. The shared box stays where it was, with only the user's annotation. The other box, left empty, is gone.
- **Proves:** removing content never removes a user's annotation, or the box it's on.
- **Automation:** Automated: [`e2e/content.spec.ts`](../e2e/content.spec.ts).

### CON-05: editAnnotation never changes a user's annotation

- **Needs:** a content painting with two content boxes, one of them also holding a user's annotation
- **Steps:**
  1. Apply a file that changes the shared box's content annotation, text only.
  2. Apply a file that moves the shared box, and moves the other box.
  3. Check Studio after each.
- **Expected:**
  - Step 1 changes the content annotation's text. The user's annotation and the box don't change.
  - Step 2 skips the shared box, which doesn't move, and moves the other box and changes its text.
- **Proves:** an edit only reaches the content account's own annotation, and a box moves only while it holds no one else's annotations.
- **Automation:** Automated: [`e2e/content.spec.ts`](../e2e/content.spec.ts).

### CON-06: A dry run writes nothing

- **Needs:** a content painting with a box
- **Steps:**
  1. Do a dry run (`npm run content:apply`, without `--yes`) of a file that adds a painting and a box, edits the existing box, adds a collection, adds both paintings to it, and removes the existing painting.
  2. Check Studio and the R2 bucket.
- **Expected:** step 1 lists all seven changes. In step 2, nothing has changed: no new image, box, collection or file in R2, the existing painting, its file and its annotation are as they were, and there's no `ContentMigration` row for the file.
- **Proves:** a dry run shows what a run would do without doing any of it, so it's safe to run against production first.
- **Automation:** Automated: [`e2e/content.spec.ts`](../e2e/content.spec.ts).

### CON-07: An applied file can't be changed or removed

- **Needs:** an applied content file
- **Steps:**
  1. Reorder the fields of its operations, and run `npm run content:status`.
  2. Change an annotation's text in it, and run `content:status` again.
  3. Remove the file, and run `content:status` again.
- **Expected:** step 1 reports no problem with the file. Step 2 reports that it "has changed since it was applied", and step 3 that it "isn't in prisma/content". `content:apply` refuses to run while either problem stands.
- **Proves:** a correction has to be a new file, and Prettier reformatting a file doesn't count as a change.
- **Automation:** Automated: [`e2e/content.spec.ts`](../e2e/content.spec.ts) checks steps 1 to 3 with `contentStatus`. That `applyContent` refuses to run is checked by hand.


## Production

Run these on the deployed site before sharing its URL. "Production" means the Vercel URL (https://a-thousand-words-pi.vercel.app/), signed in with the production GitHub OAuth app.

### PROD-01: Content is live

- **Needs:** `npm run prod:content -- --yes` has applied every file in `prisma/content` to production (PROD-06 for the baseline)
- **Steps:**
  1. Open the home page.
  2. Open three paintings from content files, and click several regions on each.
- **Expected:**
  - Step 1 shows a **Recently added** row, then a row for each collection the content files add, each with its blurb and thumbnails. Rows swipe sideways on a phone; on a wider screen, arrow buttons appear on hover and page through the row.
  - In step 2, each region sits over what its annotation describes, and the text renders formatted, with "By A Thousand Words".
- **Proves:** production has the database, the R2 bucket and its public URL wired up, and the content files placed regions correctly.
- **Automation:** Manual

### PROD-02: Sign in on production

- **Needs:** a GitHub account
- **Steps:**
  1. Click **Sign in with GitHub** on the production site.
- **Expected:** GitHub asks you to authorise the **production** OAuth app (not "(dev)"), then returns you to the site signed in.
- **Proves:** the production OAuth app, its redirect URI, `AUTH_SECRET` and the database sessions work on the real domain.
- **Automation:** Manual

### PROD-03: Upload and annotate on production

- **Needs:** signed in on production; a small image of your own
- **Steps:**
  1. Upload the image (UPL-01).
  2. Add an annotation (ANN-01).
  3. Delete the image (MAN-05).
- **Expected:** all three work as in development. In step 3, the file is removed from the production bucket.
- **Proves:** the production bucket's CORS rule allows the site's origin, and the API token can write and delete.
- **Automation:** Manual

### PROD-04: The report link

- **Needs:** `REPORT_EMAIL` set in Vercel
- **Steps:**
  1. On any image page, click **Report it**.
- **Expected:** your email app opens a message to `REPORT_EMAIL`, with the image title in the subject and the production page URL in the body.
- **Proves:** every image has a working report/takedown path (ADR 0006).
- **Automation:** Manual

### PROD-05: Real phones

- **Needs:** an iPhone and an Android phone, if available
- **Steps:**
  1. Run MAN-07 (mobile annotate mode), MAN-09 (the on-screen keyboard) and MAN-10 (zoom, pan and the panel) on each phone.
  2. Read annotations by tapping regions (ANN-02).
- **Expected:** as described in those tests. Drawing doesn't fight with scrolling, and the editor's bottom sheet keeps the box visible.
- **Proves:** the site works on the touch screens most visitors will use.
- **Automation:** Manual

### PROD-06: The baseline is recorded on production without changing content

- **Needs:** the owner's KeePassXC password; the `ContentMigration` table and content keys migrated to production (`npm run prod:migrate`); production filled by the old seed, with no content files applied yet
- **Steps:**
  1. Run `npm run prod:content` (a dry run).
  2. If step 1 is as expected, run `npm run prod:content -- --yes`.
  3. Run `npm run prod:content` again, and open the home page and a few paintings.
- **Expected:**
  - Step 1 prints the production database's host and bucket, then a plan for `0001-baseline`: a "match painting" for every painting and a "match annotation" for every annotation, with no "skipped" and no "no file claims" lines. Any painting or annotation in the file but not on production shows as an add; any production row the file doesn't match shows under "no file claims", and is left as it is. Check each before going on.
  - Step 2 prints "Applied 0001-baseline." The `ContentMigration` table has a row for `0001-baseline`.
  - Step 3 says there's nothing to apply. The home page, the paintings and their annotations look exactly as before.
- **Proves:** moving from the seed to content files gives production's existing content its keys, without adding, changing or removing any of it (ADR 0026).
- **Automation:** Manual. Production settings come from the owner's KeePassXC database (ADR 0019), which only the owner can unlock, and agents and CI never touch production. CON-01 to CON-07 and the unit tests check the same runner against the development database, and `src/lib/content/plan.test.ts` checks the matching on a database the seed filled.


## Sources

These tests were collected on 2026-10-02 from the setup guides kept outside this repo (`lukeberrycode-help/a-thousand-words-help`):

| Guide | Tests |
| --- | --- |
| 01 Postgres setup, Step 1.5 | ENV-01, ENV-03 |
| 02 Cloudflare R2 setup, Step 7 | ENV-04 |
| 03 GitHub sign-in setup, Step 4 | AUTH-02, AUTH-05 |
| 04 Milestone 3 explained, section 12 | AUTH-01 to AUTH-05, UPL-01, UPL-02, SEC-01, SEC-02, ENV-05 |
| 05 Trying out sign-in, Steps 4 to 10 | ENV-01, ENV-02, AUTH-01 to AUTH-04, UPL-01, UPL-02, SEC-01, SEC-02 |
| Milestone 4 (written with the code) | ANN-01 to ANN-06 |
| Milestone 5 (written with the code) | MAN-01 to MAN-07 |
| Milestone 6 (written with the code) | PROD-01 to PROD-05 |
| User approval (written with the code) | SEC-03, SEC-04 |
| Boxes and overlap, ADR 0011 (written with the code) | ANN-07, ANN-08, MAN-08 |
| Artwork-led image page, ADR 0012 (written with the code) | MAN-10; MAN-07, MAN-08 and MAN-09 rewritten |
| On-screen keyboard (written with the code) | MAN-09 |
| Content migrations, ADR 0026 (written with the code) | CON-01 to CON-07, PROD-06; PROD-01 rewritten |
