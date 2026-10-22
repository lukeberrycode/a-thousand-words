# Risks

Written on 12 October 2026, after milestone 7, from the one-pager, the architecture doc and the ADRs. The project started without a risks register, so the early entries are retrospective. Add a risk when it's first noticed, and record how it was retired.

**Status:** **Retired** (evidence shows it's handled) · **Mitigated** (reduced, but some remains) · **Open** (not yet handled) · **Accepted** (knowingly left).

| # | Risk | How it was handled | Status |
| --- | --- | --- | --- |
| R1 | **Regions drift off their subjects** when the image is resized or zoomed, the core promise of the product. | Milestone 1 was a spike that proved it first. Regions are stored as fractions of the image ([ADR 0005](../adr/0005-fractional-region-coordinates.md)), and the app owns zoom ([ADR 0012](../adr/0012-app-owned-zoom.md)). Covered by system tests and the `view-geometry` unit tests. | Retired |
| R2 | **Drawing a box fights with panning on touch screens.** | Drawing happens only in an explicit annotate mode, with zoom and pan off ([architecture](../architecture.md#key-risks)). Touch checks MAN-07, MAN-09 and MAN-10 stay manual, on a real phone. | Mitigated |
| R3 | **Overlapping boxes can't be clicked.** | Boxes that would hide each other are refused ([ADR 0011](../adr/0011-regions-and-overlap.md)). Unit tested in `overlap.test.ts`. | Retired |
| R4 | **Script injection through annotation text.** | Markdown is rendered to React elements, with raw HTML shown as text and no images ([ADR 0008](../adr/0008-markdown-rendering.md)). Part of the human review's focus (milestone 9). | Mitigated |
| R5 | **Abuse: unwanted or unlawful uploads, spam.** | New accounts are pending until the owner approves them. Uploads are size-limited and signed. Every image has a "Report it" link. | Mitigated |
| R6 | **The same image is uploaded again**, splitting its annotations. | Uploads are fingerprinted and similar images trigger a warning ([ADR 0010](../adr/0010-duplicate-detection.md)). | Retired |
| R7 | **Auth.js v5 is a beta**, and its API can change. | Pinned to an exact version and upgraded deliberately ([ADR 0007](../adr/0007-authjs-v5-beta.md)). | Accepted |
| R8 | **This Next.js version differs from what AI models were trained on.** | `AGENTS.md` tells agents to read the bundled Next.js docs before writing code. | Mitigated |
| R9 | **Orphaned files in R2**, from abandoned uploads or failed deletes. | Known and documented ([architecture](../architecture.md)); a periodic cleanup of keys with no `Image` row would fix it. | Open |
| R10 | **Personal data:** any sign-in stores the person's GitHub name, email and avatar. | Before sharing the URL widely: a privacy note and a way to delete an account, or stop storing the email (milestone 9). | Open |
| R11 | **AI-written code reaches real users unreviewed.** | Milestone 9: a human reviews all the code before the first non-owner account is approved. | Open |
| R12 | **A change breaks the live site**, because `main` deploys on push and nothing checked it first. | CI on every pull request, required by the `main` ruleset, plus the agent guardrails in `.claude/` ([ADR 0015](../adr/0015-agent-guardrails-and-ci.md)). | Mitigated |
| R13 | **An agent reads production secrets or changes production.** | Deny rules and hooks keep agents away from `.env*` and the `prod:*` scripts ([ADR 0015](../adr/0015-agent-guardrails-and-ci.md)). On 21 October 2026 an IDE selection sent `.env.prod` into a conversation, which no deny rule can stop; production and preview secrets now come from KeePassXC, so no plain-text copy is in the project ([ADR 0019](../adr/0019-prod-secrets-from-keepassxc.md)). | Mitigated |
| R15 | **AI-written annotations contain errors**, or readers can't tell they were written by AI. | Planned in milestone 10: the owner reviews every content batch before it reaches production, and how to label AI-drafted content is an open question in the [content migrations plan](../plans/content-migrations.md). | Open |
| R16 | **A content run changes or hides users' work**, once content is added to the live site regularly. | Planned in milestone 10: every write is limited to the content account's own rows, and a step that would affect users' boxes is skipped and reported ([plan](../plans/content-migrations.md)). | Open |
| R17 | **A painting changes or disappears on Wikimedia Commons**, leaving its boxes on the wrong subject or on nothing. | Only if milestone 11 goes ahead: a daily check pins changed paintings to the version their boxes were placed on, and, if the R2 fallback copy is kept, it covers deleted ones ([plan](../plans/commons-hosted-images.md)). | Open |
