# A Thousand Words: One-Pager & MVP Scope

Living version: https://claude.ai/code/artifact/44265a49-0b8f-4615-a100-eefea41f698f

## Overview

**A Thousand Words is Genius.com for images:** anyone can upload an image, draw a region on it, and attach an annotation that explains what's there.

Images are packed with meaning that viewers miss: references hidden in a painting, the joke behind a meme, the people in a historical photo, the design choices in a UI. A Thousand Words pins explanations directly to the part of the image they're about.

## Goals and success criteria

- [ ] A visitor can open a public URL, view an image, and read its annotations without an account
- [ ] A signed-in user can upload an image and add an annotation in under a minute
- [ ] Annotations stay aligned to their regions at any screen size, including mobile
- [ ] The repo has a clear README, architecture doc, and ADRs explaining key decisions
- [ ] At least 10 seeded images with real annotations, so the demo feels alive

## MVP scope

| Feature | Detail |
| --- | --- |
| Accounts | Sign up / sign in (OAuth via GitHub or Google) |
| Image upload | JPEG, PNG, WebP up to 10 MB; title and short description |
| Image page | Public URL per image; annotated regions shown as subtle highlights |
| Create annotation | Draw a rectangle, write Markdown text, save |
| Read annotation | Hover or tap a region to open its annotation in a side panel |
| Edit / delete | Authors can edit or delete their own annotations and images |
| Browse | Home page listing recent images |

### Core user flows

1. **Read:** visitor opens an image page → sees highlighted regions → taps one → reads the annotation.
2. **Upload:** user signs in → uploads an image → lands on its new page.
3. **Annotate:** user on an image page → clicks "Annotate" → drags a box → writes text → saves → the region appears for everyone.

## Non-goals for v1

- Voting, reputation points ("IQ"), or ranking of annotations
- Comment threads or replies on annotations
- Non-rectangular regions (polygons, freehand)
- Verified "creator" annotations
- Search, tags, and categories
- Moderation tools beyond author delete
- Notifications and following
- Native mobile apps (responsive web only)

## Milestones

1. **Spike:** a static image with hard-coded fractional regions that stay aligned on resize.
2. **Upload and view:** upload an image to storage; public image page; home page of recent images.
3. **Accounts:** OAuth sign-in; uploads tied to a user.
4. **Create annotations:** draw a box, write Markdown, save; regions render for all visitors.
5. **Read and manage:** hover/tap side panel; edit and delete own content; mobile annotate mode.
6. **Ship:** deploy, seed 10+ annotated images, write README and ADRs.
7. **Automate system tests:** add a way to run the checks in [`docs/system-tests.md`](system-tests.md) automatically (tool choice recorded in an ADR). Each automated test refers to its test ID, and the list stays as the permanent reference. Tests that need a real third party, such as GitHub sign-in, may stay manual or use a test double.
8. **User experience documentation:** describe every expected user experience and journey from the user's point of view: what they see, do and get back in the browser, including steps that depend on the full stack (sign-in, uploads, saving). Unlike the system tests, these docs are independent of the implementation and assume no access to the database, storage or dev tools. Testers use them to check what they actually see, and future agents use them to validate a refactor or full rebuild. Written after the demo ships, to avoid churn while features are still changing.
9. **Human code review:** before the project moves beyond the demo phase, a human reviews all of the code. This is the final safeguard: no code is used in anger without human review, while the prototype can still be built quickly with reasonable safeguards at every stage. Only a human can mark this milestone done.

**After the MVP:** voting → reputation points → replies and threads → polygon regions → search and tags → verified creator annotations.
