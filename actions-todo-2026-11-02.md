# Actions to do (2026-11-02)

Found while writing the what-is notes for Next.js, Node.js and Tailwind CSS in lukeberrycode-help, checked against `main` at `cb8a47f`. Most urgent first.

## 1. Upgrade Next.js after the 2026-11-03 security release

**Where:** `package.json` pins `next` and `eslint-config-next` at `16.4.2`.

**Why:** Next.js announced a scheduled security release for 3 November 2026 (blog post of 27 October). Several recent Next.js security fixes were for critical issues in React Server Components, which this app uses.

**Fix:** once the release is out, read its notes, upgrade `next` and `eslint-config-next` to the patched version, then run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run test:system`.

Source: https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026

## 2. Move `@types/node` off Node 20

**Where:** `package.json` has `"@types/node": "^20"`, while `.github/workflows/ci.yml` runs Node 24.

**Why:** Node 20 reached end of life on 2026-04-30. The types describe Node 20's APIs, so APIs added in 22 and 24 are missing from type checking, and nothing flags code that would break on an older Node.

**Fix:** set `@types/node` to `^24` (the version CI and Vercel run), then `npm run typecheck`. Consider also pinning the Node version for the project (`.nvmrc` and `"engines"`), as ai-app-demo does.

Source: https://github.com/nodejs/Release (schedule.json)

## 3. Plan the clean-up Lambda's move off Node 22

**Where:** `infra/lib/orphan-cleanup-stack.ts` uses `lambda.Runtime.NODEJS_22_X`, and `.github/workflows/infra.yml` uses Node 22.

**Why:** Node 22 reaches end of life on 2027-04-30. Not urgent, but AWS Lambda deprecates runtimes on its own schedule around Node's.

**Fix:** move the function to `NODEJS_24_X` and the `infra` workflow to Node 24 before then, run the `infra` tests, deploy, and check the next scheduled run's logs (it's in dry-run or live mode as configured, ADR 0018).

Source: https://github.com/nodejs/Release (schedule.json)

## 4. Make the page font the Geist font the theme sets up

**Where:** `src/app/globals.css`. `@theme inline` maps `--font-sans` to `var(--font-geist-sans)` (loaded by `next/font` in `src/app/layout.tsx`), but the `body` rule below it sets `font-family: Arial, Helvetica, sans-serif;`.

**Why:** text that doesn't use the `font-sans` utility explicitly appears in Arial, so the Geist font is loaded but mostly unused. The `body` rule came with the `create-next-app` template.

**Fix:** decide which font the site should use. For Geist, replace the `font-family` line with `font-family: var(--font-sans);` (or add `font-sans` to `<body>`'s classes in `layout.tsx`). For Arial, stop loading Geist in `layout.tsx` and remove the font mappings, so the page doesn't download fonts it doesn't use. Then check the pages visually and with `npm run test:perf`.

Source: https://tailwindcss.com/docs/theme

## 5. Clear the `npm audit` findings, and update the reason CI gives for allowing them

Added on 2026-11-03, while upgrading Next.js (item 1, PR #37).

**Where:** `npm audit --omit=dev` reports 6 high and 2 moderate advisories, all in dependencies of dependencies:

- `graphql-yoga` 5.24.1 (pinned exactly in `package.json`) brings in `@graphql-tools/utils` 11.2.2, which has prototype pollution in `mergeDeep` (GHSA-7mx3-vvmw-hjmv, GHSA-c4qx-w738-7hr3). This is the public `/api/graphql` route.
- `prisma` 7.10.0 brings in `mysql2` 3.15.3 (GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3) and, through `@prisma/config`, `deepmerge-ts` 7.1.5 (GHSA-ggr8-5vv4-36mx).
- `fast-uri` 3.1.8, through `prisma` › `@prisma/dev` › `ajv` (moderate; four advisories, including GHSA-w74x-v6f9-j3xg).
- `qs` 6.16.0, through `@annotorious/react` › … › `url` (moderate, GHSA-6pq8-jhm2-2vcw).

The comment above the audit step in `.github/workflows/ci.yml` (lines 52–53) and ADR 0015 say the open high advisories are all inside Prisma with no fix available. That is no longer true on either count.

**Why:** CI blocks only on critical advisories, so these pass unnoticed. The GraphQL one is on a route anyone can call. The others are lower risk (the app never loads `mysql2`, and the Prisma config loader never sees user input), but they all have fixes now.

**Fix:** on a `fix/` branch:

1. Set `graphql-yoga` to `5.24.6`, which no longer uses `@graphql-tools/utils` 11.
2. Move `prisma`, `@prisma/client` and `@prisma/adapter-pg` together to `7.10.1`, which brings `mysql2` 3.24.4 and `deepmerge-ts` 8.0.2.
3. Run `npm update fast-uri qs` to move them to 3.1.9 and 6.17.x, inside their existing ranges.
4. Check that `npm audit --omit=dev` is clean, then run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run test:system` (the API tests cover GraphQL).
5. If the audit is clean, consider making CI block on high advisories as well. That changes ADR 0015's decision, so it needs a new ADR that supersedes that part. Either way, fix the comment in `ci.yml`.

Source: `npm audit --omit=dev --json`, run on 2026-11-03.
