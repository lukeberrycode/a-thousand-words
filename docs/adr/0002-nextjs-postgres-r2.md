# 2. Next.js, Postgres and Cloudflare R2

Date: 2026-10-01 · Status: Accepted

## Context

The app needs server-rendered public pages (shareable image URLs), authenticated writes, relational data (images → annotations → users), and cheap storage for image files. One developer builds it.

## Decision

- **Next.js (App Router, TypeScript)** for UI and server code in one deployable app.
- **Postgres** for relational data.
- **Cloudflare R2** for image storage: S3-compatible API and no egress fees.
- **Auth.js** for OAuth sign-in (GitHub, Google), added in milestone 3.
- Deploy on **Vercel**.

## Consequences

- One language end to end; server actions remove the need for a separate API for MVP writes.
- Browser uploads go directly to R2 with signed URLs, keeping large files off the server.
- Postgres needs a hosted provider in production (e.g. Neon, Supabase or Prisma Postgres).
