# 3. Prisma as the ORM

Date: 2026-10-01 · Status: Accepted

## Context

We need typed database access and schema migrations. The main candidates were Prisma and Drizzle.

## Decision

Use **Prisma 7** with the `prisma-client` generator (output in `src/generated/prisma`) and the `@prisma/adapter-pg` driver adapter.

## Consequences

- A declarative schema file is the single source of truth for the data model, with mature migration tooling (`prisma migrate dev`) and Prisma Studio for browsing data.
- Plenty of documentation and examples.
- The generated client is gitignored and rebuilt by the `postinstall` script.
- Pinned to stable 7.10.0: at setup time the npm `latest` tag pointed at an 8.0 release candidate.
