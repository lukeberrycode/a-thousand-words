# System tests

Checks that exercise the whole running app (browser, Next.js server, Postgres, R2 and GitHub) and confirm it behaves as a user would expect. They were first written as manual steps in the setup and milestone guides. This file collects them in one place.

**This list is permanent.** A test stays here after it's automated. Its **Automation** line then points to the automated test instead of saying "Manual". That way the list remains the reference for what the app must do, however each check is run. A later milestone adds the automation.

**System tests aren't user experience docs.** These tests assume an operator with access to both the development environment (terminal, Prisma Studio, the Cloudflare dashboard) and the browser, and they're tied to the current implementation: table names, commands, error messages. Milestone 8 adds separate user experience documentation. It describes what a user sees and does, independent of how the app is built, so it stays valid through a refactor or full rebuild.

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
  - You come back to the home page signed in. The header shows your GitHub avatar, your name (hidden on narrow screens) and **Sign out**. A brand-new account also shows **Awaiting approval** where **Upload** would be, until it's approved (SEC-03, SEC-04).
- **Proves:** the full OAuth flow works end to end: client ID and secret, redirect URI, `state` and PKCE checks, and session creation.
- **Automation:** Manual

### AUTH-03: Sign-in creates the right database rows

- **Needs:** just completed AUTH-02
- **Steps:**
  1. Open Studio and check `User`, `Account` and `Session`.
- **Expected:**
  - `User`: one row for you, with your GitHub name, email and `image` (avatar URL). `approvedAt` is empty for a brand-new account (it's pending). Any old "Demo user" row is unrelated.
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
- **Automation:** Manual

### UPL-04: Upload anyway

- **Needs:** as UPL-03
- **Steps:**
  1. Upload the look-alike, and click **Upload anyway** on the warning.
  2. Delete the new image afterwards (MAN-05).
- **Expected:** step 1 opens the new image's page. In Studio, its row has `sha256` and `phash` filled in.
- **Proves:** the warning never blocks a deliberate upload.
- **Automation:** Manual

### UPL-05: Different images aren't flagged

- **Needs:** signed in; an image not on the site
- **Steps:**
  1. Upload it.
- **Expected:** no warning. It saves and opens its page as in UPL-01.
- **Proves:** the duplicate check doesn't get in the way of ordinary uploads.
- **Automation:** Manual


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
- **Automation:** Manual

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
- **Automation:** Manual


## Annotations

### ANN-01: Create an annotation

- **Needs:** signed in; an image page
- **Steps:**
  1. Click **Annotate**.
  2. Drag a box over part of the image.
  3. Optionally move or resize the box.
  4. Type some Markdown, e.g. `**Bold** and a [link](https://example.com)`, and click **Save**.
- **Expected:**
  - After step 1, the button reads **Done annotating**, with a hint to drag a box.
  - After step 2, an editor appears beside the image.
  - After step 4, the editor closes and annotate mode ends. The new region is open: drawn with a thick amber outline while the others recede, and the panel shows the formatted text and your name. The region sits where the box was when you clicked Save.
- **Proves:** drawing, the pixels-to-fractions conversion, the server action and the page refresh work together.
- **Automation:** Manual

### ANN-02: Annotations are visible to everyone and stay aligned

- **Needs:** just completed ANN-01; a second browser or a private window, signed out
- **Steps:**
  1. Open the same image page signed out.
  2. Click the region, or its entry in the list.
  3. Resize the window, or use a phone-sized view.
- **Expected:**
  - Step 1 shows the region. There's no **Annotate** button, but there is a **Sign in with GitHub to annotate** button.
  - Step 2 shows the annotation's text and author.
  - In step 3, the region stays over the same part of the image at every size.
- **Proves:** annotations are public, and fractional coordinates keep them aligned (ADR 0005).
- **Automation:** Manual

### ANN-03: Cancelling and leaving annotate mode discard the draft

- **Needs:** signed in; an image page
- **Steps:**
  1. Click **Annotate**, draw a box, then click **Cancel**.
  2. Draw another box, then click **Done annotating**.
  3. Check Studio.
- **Expected:** after each of steps 1 and 2, the box disappears. In step 3, no new `Annotation` row exists.
- **Proves:** drafts only exist in the browser until saved.
- **Automation:** Manual

### ANN-04: Annotation text is rendered safely

- **Needs:** signed in; an image page
- **Steps:**
  1. Save an annotation whose text is:

     ```
     <b onclick="alert(1)">html</b> [bad](javascript:alert(1)) ![pic](https://example.com/x.png) [good](https://example.com)
     ```

  2. Select it, and inspect the panel with the browser's dev tools.
- **Expected:**
  - The HTML shows as plain text.
  - The `bad` link has an empty `href`, and no image loads.
  - The `good` link opens in a new tab and has `rel="nofollow ugc noopener noreferrer"`.
- **Proves:** untrusted annotation text can't run scripts, use unsafe links or load images (ADR 0008).
- **Automation:** Manual

### ANN-05: The annotation action rejects requests that aren't signed in

- **Needs:** signed in; a second tab
- **Steps:**
  1. On an image page, click **Annotate**, draw a box and type some text.
  2. In a second tab, sign out.
  3. Back in the first tab, click **Save**.
  4. Check Studio.
- **Expected:** step 3 shows "Sign in to annotate." In step 4, there's no new `Annotation` row.
- **Proves:** the server action checks the session itself.
- **Automation:** Manual

### ANN-06: Annotate again straight after saving

- **Needs:** signed in; an image page
- **Steps:**
  1. Create an annotation (ANN-01), without reloading the page afterwards.
  2. Click **Annotate** again and drag a new box.
  3. On a narrow window (where the editor sits below the image), draw another box.
- **Expected:**
  - After step 1, while saving, the box stays in place and the editor shows **Saving…** until the new region appears. There's no moment where the page says "No annotations yet", and no empty editor afterwards.
  - Step 2 draws a new box and opens the editor.
  - In step 3, the page doesn't scroll away from the box when the editor opens.
- **Proves:** draft state is cleared after a save, the save hands over smoothly to the refreshed data, and focusing the editor doesn't move the page. Each was a bug found while testing milestone 4.
- **Automation:** Manual


### ANN-07: A click on nested boxes goes to the smaller one

- **Needs:** The School of Athens (seeded): Raphael's small box overlaps the larger Ptolemy box at the far right
- **Steps:**
  1. Click inside the Ptolemy box, away from Raphael's box.
  2. Click where Raphael's box overlaps the Ptolemy box.
- **Expected:**
  - Step 1 opens Ptolemy's annotation.
  - Step 2 opens Raphael's, not Ptolemy's.
- **Proves:** Annotorious gives a click to the smallest box under the pointer, so nested boxes stay reachable (ADR 0011). Checked on 2026-10-04 with Annotorious 3.9.3; re-run after upgrading Annotorious.
- **Automation:** Manual

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
  - Step 3: the new box goes, annotate mode ends, and the existing box opens with an "Add your annotation" form.
  - Step 4: the card shows both annotations, oldest first. Yours has **Edit** and **Delete**, the other doesn't, and "+ Add your annotation" is gone. The list entry shows "+1".
  - Step 5: only the text is editable (no box handles), because someone else drew the box.
- **Proves:** the overlap rule is checked live in the browser, the user is steered to add to the existing box, and a box holds several annotations (ADR 0011). The server checks the rule too, so a direct POST can't get round it.
- **Automation:** Manual

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
- **Automation:** Manual

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
- **Automation:** Manual

### MAN-04: Delete an annotation

- **Needs:** signed in; an annotation of yours
- **Steps:**
  1. Select it, click **Delete**, then **Keep**.
  2. Click **Delete**, then the red **Delete**.
- **Expected:**
  - Step 1 changes nothing.
  - Step 2 removes the annotation. If it was the box's only annotation, the region and its list entry go too, and in Studio both the `Annotation` and its `Region` row are gone. If others remain, the box stays with theirs.
- **Proves:** deletion asks first and then removes the annotation everywhere, and doesn't leave empty boxes.
- **Automation:** Manual

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
- **Automation:** Manual

### MAN-06: The server refuses changes to other people's content

- **Needs:** signed in; an annotation of yours; Studio
- **Steps:**
  1. Select your annotation and click **Edit**.
  2. In Studio, change that annotation's `authorId` to another user's.
  3. Click **Save**.
  4. Change `authorId` back.
- **Expected:** step 3 shows "That annotation doesn't exist, or isn't yours." and nothing changes.
- **Proves:** the server actions check ownership themselves rather than trusting the page.
- **Automation:** Manual

### MAN-07: Mobile annotate mode

- **Needs:** signed in; a phone, or a narrow window (below 1024 px)
- **Steps:**
  1. Outside annotate mode, swipe on the image.
  2. Tap **Annotate** and drag on the image.
  3. Edit an existing annotation of yours.
- **Expected:**
  - Step 1 scrolls the page.
  - In step 2, dragging draws a box instead of scrolling, and the editor opens as a sheet at the bottom of the screen with the box still visible above it.
  - In step 3, the editor also opens as a bottom sheet, and dragging moves the box.
- **Proves:** touch drawing doesn't fight with scrolling, and the editor doesn't hide the box.
- **Automation:** Manual. Passed on real phones on the deployed site on 2026-10-03 (PROD-05). Before that, it had only been checked at narrow width with a mouse.


### MAN-08: Click to read; the open box stays open and stands out

- **Needs:** an image with at least three annotations; a mouse
- **Steps:**
  1. Hover over a region without clicking.
  2. Click a region.
  3. Click an empty part of the image.
  4. Click a different region, or pick one from the list.
- **Expected:**
  - Step 1 changes nothing in the panel, which shows "Click or tap a highlighted region, or pick one below."
  - Step 2 shows that box's annotations. The box gets a thick amber outline and a light fill; the other boxes become thin and faint.
  - Step 3 leaves the same box open and highlighted.
  - Step 4 switches the panel and the highlight to the new box.
- **Proves:** reading needs an explicit click, stays put until another box is chosen, and it's always clear which box the text belongs to.
- **Automation:** Manual

### MAN-09: The editor stays above the on-screen keyboard

- **Needs:** signed in and approved; a real phone (an iPhone and an Android phone if possible). Emulators and DevTools' device mode don't reproduce the keyboard.
- **Steps:**
  1. On an image page, turn on **Annotate** and draw a box in the lower half of the image.
  2. Tap the editor's text box, and type a few lines.
  3. Tap **Cancel**, open one of your own annotations, and tap **Edit**, then the text box.
  4. Close the keyboard (the keyboard's own close or done key).
- **Expected:**
  - In steps 2 and 3, the editor sheet sits directly on top of the keyboard, with its text box and **Save** visible. The sheet takes at most about half of the space above the keyboard, and the box stays visible above the sheet (scroll if needed, but nothing is hidden behind the keyboard).
  - In step 4, the sheet drops back to the bottom of the screen.
- **Proves:** the editor reads the visible area, not the full screen, on both iOS (visual viewport) and Android (`interactive-widget=resizes-content`).
- **Automation:** Manual. Needs a real device. Passed on Android on 2026-10-04 (the `resizes-content` path). Not yet tested on an iPhone, the path where the sheet is lifted by `useKeyboardInset`.


## Production

Run these on the deployed site before sharing its URL. "Production" means the Vercel URL, signed in with the production GitHub OAuth app.

### PROD-01: Seed content is live

- **Needs:** the production seed has run
- **Steps:**
  1. Open the home page.
  2. Open three seeded paintings, and click several regions on each.
- **Expected:**
  - Step 1 shows the 12 paintings with thumbnails.
  - In step 2, each region sits over what its annotation describes, and the text renders formatted, with "By A Thousand Words".
- **Proves:** production has the database, the R2 bucket and its public URL wired up, and the seed placed regions correctly.
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
  1. Run MAN-07 (mobile annotate mode) and MAN-09 (the on-screen keyboard) on each phone.
  2. Read annotations by tapping regions (ANN-02).
- **Expected:** as described in those tests. Drawing doesn't fight with scrolling, and the editor's bottom sheet keeps the box visible.
- **Proves:** the site works on the touch screens most visitors will use.
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
| Milestone 4 (written with the code) | ANN-01 to ANN-06 |
| Milestone 5 (written with the code) | MAN-01 to MAN-07 |
| Milestone 6 (written with the code) | PROD-01 to PROD-05 |
| User approval (written with the code) | SEC-03, SEC-04 |
| Boxes and overlap, ADR 0011 (written with the code) | ANN-07, ANN-08, MAN-08 |
| On-screen keyboard (written with the code) | MAN-09 |
