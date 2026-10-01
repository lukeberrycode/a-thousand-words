# 7. Auth.js v5 (beta) for sign-in

Date: 2026-10-01 · Status: Accepted

## Context

Milestone 3 adds sign-in with GitHub (ADR 0002 chose Auth.js). Two versions were available:

- **v4** (`next-auth@4`, stable): supports Next.js 16, but was designed around the Pages Router, so App Router use needs more glue code.
- **v5** (`next-auth@5.0.0-beta.x`, beta): built for the App Router, with one `auth()` helper for server components, server actions and route handlers. It's what the current Auth.js documentation describes, and it's widely used in production despite the beta label.

## Decision

Use **Auth.js v5**:

- `next-auth` **pinned to an exact beta version** (no `^` range), upgraded deliberately after reading the changelog.
- The **GitHub** provider, configured from `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` and `AUTH_SECRET`.
- The **Prisma adapter** (`@auth/prisma-adapter`), storing users, accounts and sessions in Postgres alongside our own tables.

## Consequences

- Server code gets the signed-in user with `await auth()`, replacing the demo user in `src/lib/current-user.ts`. Every server action must still check it (Next.js docs: server actions are reachable by direct POST).
- The schema gains Auth.js's `Account`, `Session` and `VerificationToken` models, and `User` gains the fields the adapter expects (e.g. `image`, `emailVerified`). `avatarUrl` is replaced by the adapter's `image`.
- Beta APIs can change between releases. The exact pin stops surprise upgrades; the cost is that upgrades are manual.
- Risk to check during implementation: the adapter is typed against `@prisma/client`, while we generate the client into `src/generated/prisma` (ADR 0003). If the types don't line up, a thin cast at the adapter boundary is acceptable.
- If v5 proves unworkable, v4 is the fallback. The database tables are the same, so switching wouldn't need a data migration.
