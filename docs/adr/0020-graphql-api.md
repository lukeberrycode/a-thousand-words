# 20. A small, read-only GraphQL API with GraphQL Yoga

Date: 2026-10-20 · Status: Accepted

## Context

The app has no public API. Pages read the database in server components, and writes go through server actions (see `docs/architecture.md`). Nothing outside the app needs an API yet.

The project's owner wanted to demonstrate GraphQL and experiment with it. That serves two of the project's aims in the [README](../../README.md#why-i-built-this): "Use technologies I hadn't yet used in production" (aim 2; its list predates this ADR and doesn't name GraphQL) and "Show my work in public, to help me find my next role" (aim 3). The data suits GraphQL: images hold regions, regions hold annotations, and each has an author, so a client can ask for exactly the depth it needs in one request.

Options considered:

- **GraphQL Yoga** (`graphql-yoga`): a GraphQL server built on the Fetch API's `Request` and `Response`, which is what a Next.js route handler takes and returns, so it needs no adapter. It has few dependencies, bundles GraphiQL for development, and has hooks for validation rules. Maintained by The Guild.
- **Apollo Server**: the best-known option, but it targets Node's HTTP server or Express; Next.js needs a community integration package. It's heavier, and much of its documentation leads towards Apollo's paid platform.
- **No GraphQL; add REST route handlers only if an API is needed.** Simpler, but it wouldn't meet the aim, and nothing needs a REST API either.

## Decision

- **GraphQL Yoga** at `/api/graphql` (`src/app/api/graphql/route.ts`), with the schema written as SDL in `src/lib/graphql/schema.ts`. Versions are pinned exactly: `graphql-yoga` 5.24.1 and `graphql` 16.14.2.
- **Read-only, and small.** Queries `image(id)`, `images(first, after)` and `collections`, with types `Image`, `Region`, `Annotation`, `Author` and `Collection`. No mutations: writes stay in the server actions, which already check the session, approval and ownership. Adding mutations would mean repeating every one of those checks in a second place.
- **Only what the site already shows.** `Author` has only `name`. No emails, approval state, user ids, fingerprints, storage keys or Auth.js rows. The schema is the boundary: a field not in it can't be asked for, whatever the resolver loads.
- **Annotation Markdown is returned as stored.** It's untrusted (ADR 0008), and the schema's description of `bodyMarkdown` says to render it without raw HTML or images. The response is JSON, so nothing is rendered on the way.
- **Limits**, checked before anything runs (`src/lib/graphql/limits.ts`):
  - At most 8 levels deep. The schema has no cycles, so its deepest real query is 6; the limit still holds if links are added later.
  - At most 200 fields per query, aliases included, so a query can't repeat an expensive field hundreds of times.
  - `images` returns 1 to 50 per page, with cursor pagination (`endCursor`, `hasNextPage`). Each collection returns at most 50 images.
  - Yoga's defaults also apply: request batching is off, mutations are refused over GET, and unexpected errors are masked in production.
- **No N+1 queries.** Nested fields use Prisma's fluent API (`db.image.findUnique(...).regions()`). Prisma batches `findUnique` calls made in the same tick into one query. A query for a page of images with their regions, annotations and authors makes the same number of SQL queries for 1 image as for 50. That avoids adding DataLoader.
- **GraphiQL and introspection in development only.** The schema isn't secret (it's in this repository), but turning both off in production is Yoga's guidance, and costs nothing here.
- **No sign-in.** The API reads no cookies or sessions, and everything it returns is public. So Yoga's default CORS settings (any origin) are acceptable.
- **Vitest for unit tests** (`npm test`), added with this change: the schema and resolvers are tested against an in-memory stand-in for the Prisma client, without a database. Playwright (ADR 0013) still tests the running app.

## Consequences

- Two new runtime dependencies (`graphql-yoga`, `graphql`) and one dev dependency (`vitest`). Yoga brings in packages from graphql-tools and envelop.
- Two ways to read the data: server components query Prisma directly, and the API queries it through resolvers. Pages don't use the API, so it can change without breaking the site, but the two can drift. The schema has to be updated by hand when the data model changes.
- Server actions remain the only way to write. If the API ever gains mutations, they must reuse the actions' checks, with ownership in the write's `where` (ADR 0006), rather than repeat them.
- There's no rate limiting. The query limits bound the cost of one request, not the number of requests; Vercel's platform limits are the only protection against floods.
- Vitest must load graphql-yoga's dependencies through Vite (`server.deps.inline` in `vitest.config.mts`). Otherwise they'd get graphql's CommonJS build and our code its ES module build, and graphql refuses to mix the two. Next.js bundles them, so the app isn't affected.
- Responses aren't cached. Every query reads the database, like the pages do.
