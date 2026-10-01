# A Thousand Words

> A picture is worth a thousand words. Here's where you write them.

Genius.com for images: upload an image, draw a region on it, and attach an annotation that explains what's there.

**Status:** milestone 1 (region alignment spike) done: run the dev server and open `/spike`. See [the one-pager](docs/one-pager.md) for scope and milestones.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · Postgres + Prisma · Cloudflare R2 · Annotorious · Auth.js

Why each was chosen: [docs/adr](docs/adr/README.md). How it fits together: [docs/architecture.md](docs/architecture.md).

## Getting started

Requires Node 20+ and a Postgres database.

```bash
npm install                # also generates the Prisma client
cp .env.example .env       # then set DATABASE_URL
npx prisma dev             # optional: starts a local Postgres and prints its URL
npm run db:migrate         # apply the schema
npm run dev                # http://localhost:3000
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create and apply migrations (`prisma migrate dev`) |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Project docs

- [One-pager & MVP scope](docs/one-pager.md)
- [Architecture](docs/architecture.md)
- [Architecture Decision Records](docs/adr/README.md)
