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
