# 9. Deploy on Vercel with Neon Postgres; migrate and seed from a workstation

Date: 2026-10-02 · Status: Accepted

## Context

Milestone 6 puts the demo on a public URL. ADR 0002 chose Vercel for hosting and left the production Postgres provider open. Production also needs its own storage, sign-in app and secrets, a way to apply migrations, and seed content.

## Decision

- **Hosting:** Vercel, on the free `*.vercel.app` subdomain. A custom domain can be added later without code changes.
- **Database:** **Neon** Postgres, in a US East region near Vercel's default functions region. The app uses Neon's **pooled** connection string, because serverless functions open many short-lived connections.
- **Migrations:** applied by hand with `npm run prod:migrate` (`prisma migrate deploy`), using Neon's **direct** connection string. They don't run as part of the Vercel build: preview builds would otherwise migrate the production database, and a failed migration would be mixed up with a failed deploy.
- **Production secrets for these commands** live in `.env.prod`. It's git-ignored, and Next.js never loads it automatically, so local builds can't reach production by accident. The app's own production settings are Vercel environment variables.
- **Separate production resources:** an R2 bucket and an R2 API token, a GitHub OAuth app and an `AUTH_SECRET`, all separate from development.
- **Image URLs:** the production bucket's `r2.dev` URL for now. Cloudflare rate-limits it and describes it as for development, but a portfolio demo's traffic is small. Moving to a custom domain only changes `R2_PUBLIC_URL`.
- **Seed content:** `prisma/seed-data.ts` holds 12 public-domain paintings from Wikimedia Commons with 77 annotations. `npm run prod:seed -- --yes` loads them, owned by an "A Thousand Words" user. Without `--yes` it only prints which database and bucket it would use.
- **Reports:** a "Report it" link on every image page emails `REPORT_EMAIL` (ADR 0006). It's a mail link rather than an in-app form, because no one reviews reports in-app yet.

## Consequences

- Deploying is pushing to `main`. Changing the schema adds one manual step, `npm run prod:migrate`, which the README lists.
- Neon's free tier suspends an idle database, so the first request after a quiet period is slower.
- The seed is safe to re-run: it skips paintings whose R2 key already exists, but it never updates them. To change seeded content, edit it in the app, or delete the image and seed again.
- Real-phone testing happens on the deployed site, before the URL is shared publicly (milestone 6 in the one-pager).
