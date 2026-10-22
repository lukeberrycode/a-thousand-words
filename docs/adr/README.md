# Architecture Decision Records

One short file per decision: the context, what was decided, and the consequences. New ADRs take the next number; superseded ones are marked, not deleted.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-nextjs-postgres-r2.md) | Next.js, Postgres and Cloudflare R2 | Accepted |
| [0003](0003-prisma-orm.md) | Prisma as the ORM | Accepted |
| [0004](0004-annotorious.md) | Annotorious for the annotation layer | Accepted |
| [0005](0005-fractional-region-coordinates.md) | Fractional, rectangle-only region coordinates | Accepted |
| [0006](0006-open-annotation-and-public-domain-seed.md) | Any signed-in user can annotate; seed with public-domain art | Accepted |
| [0007](0007-authjs-v5-beta.md) | Auth.js v5 (beta) for sign-in | Accepted |
| [0008](0008-markdown-rendering.md) | Render annotation Markdown with react-markdown, without HTML or images | Accepted |
| [0009](0009-deploy-vercel-neon.md) | Deploy on Vercel with Neon Postgres; migrate and seed from a workstation | Accepted |
| [0010](0010-duplicate-detection.md) | Warn about duplicate uploads using a perceptual hash | Accepted |
| [0011](0011-regions-and-overlap.md) | Boxes hold several annotations; refuse boxes that would hide each other | Accepted |
| [0012](0012-app-owned-zoom.md) | The image page owns zoom, with a custom view around Annotorious | Accepted |
| [0013](0013-playwright-system-tests.md) | Automate the system tests with Playwright, signing in with a test session | Accepted |
| [0014](0014-home-page-collections.md) | Home page rows of themed collections | Accepted |
| [0015](0015-agent-guardrails-and-ci.md) | Guard the coding agent with permissions, hooks and a sandbox; check every pull request in CI | Amended by 0021 |
| [0016](0016-unit-tests-formatting-performance.md) | Unit tests with Vitest, formatting with Prettier, performance checks with Lighthouse CI | Accepted |
| [0017](0017-skills-and-subagents.md) | Skills for repeated work, and subagents with narrow permissions | Accepted |
| [0018](0018-orphan-cleanup-on-aws.md) | Clean up orphaned uploads with a small AWS CDK stack | Accepted |
| [0019](0019-prod-secrets-from-keepassxc.md) | Read production and preview secrets from KeePassXC, not from files in the project | Accepted |
| [0020](0020-worktree-database-and-port.md) | Give each git worktree its own local database and dev server port | Accepted |
| [0021](0021-agent-rules-by-checkout.md) | Branches carry out a plan or ADR already on main; agents in worktrees get the strict rules | Accepted |
