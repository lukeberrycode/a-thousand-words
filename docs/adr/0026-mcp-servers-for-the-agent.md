# 26. The coding agent checks its own work in a browser and the local database, through MCP

Date: 2026-10-25 · Status: Proposed

## Context

The agent can't look at what it builds. It finds visible changes by searching the code (ADR 0025), and sees the result only through the system tests it writes. To check data, it writes a one-off script or guesses from the schema. MCP lets Claude Code use tools from local servers, and two would let it look instead of guess: a browser and the database.

Three things shape the choice.

- **MCP servers run outside Claude Code's sandbox.** The sandbox covers shell commands only. Local MCP servers "run with your full access" (Claude Code's sandboxing docs), so the sandbox's network allow list doesn't apply to them. Their limits have to come from their own options, permission rules and hooks.
- **Each server is a new way in for untrusted text.** Whatever it returns goes straight into the agent's context. So each server has to be judged against the lethal trifecta: private data, untrusted content and a way to send data out, all in one session.
- **`prisma dev` can't enforce database roles.** Tested on 25 October 2026 on a throwaway `prisma dev` server (PostgreSQL 17.5 on PGlite): a role granted only `SELECT` could insert rows and drop the table, `current_user` was always `postgres`, and a wrong password was accepted. A read-only role on each worktree's database (ADR 0020) wouldn't hold, so read-only has to come from the MCP server.

Options for the browser:

- **Playwright MCP** (Microsoft). The same engine as the system tests (ADR 0013). It reads pages as accessibility snapshots, and its own docs say it "is not a security boundary".
- **Claude in Chrome.** The owner's own browser, with the owner's sign-ins, so a fooled agent could reach far more.

Options for the database:

- **The reference Postgres server** (`@modelcontextprotocol/server-postgres`). Archived and deprecated in 2025, after its read-only mode was got round by sending several statements at once.
- **`postgres-mcp`** (Crystal DBA, MIT). Maintained and widely used. Its restricted mode runs read-only transactions, parses each statement with pglast before running it, refuses `COMMIT` and `ROLLBACK`, and limits query time.
- **A newer read-only server.** Several exist, with little track record yet.
- **Our own server.** More to maintain. ADR 0027's server for the site's own data is where we build one.

Not now: GitHub MCP (the agent already uses `gh`), and documentation servers such as Context7, which send the agent's queries to a third party and need a separate decision.

## Decision

- **`.mcp.json` names two stdio servers**, `playwright` and `postgres`. Each is started by a launcher script, `scripts/mcp-playwright.ts` or `scripts/mcp-postgres.ts`, because each checkout has its own ports and database (ADR 0020). Both servers are pinned to an exact version, never `@latest`.
- **Playwright MCP** runs headless with `--isolated`, so the browser has no saved sign-ins, and writes to `.playwright-mcp/`, which is gitignored. Its `--allowed-origins` are the checkout's dev server and R2 mock ports, plus the host of `R2_PUBLIC_URL` in the main checkout, where images come from the development bucket. That option isn't a boundary, so:
  - **a new `mcp-guard.mjs` hook** (`PreToolUse`, matching `mcp__playwright__.*`) refuses any URL outside those origins. Like `guard.mjs`, it fails closed.
  - **deny rules block the tools that run JavaScript in the page** (`browser_evaluate`, `browser_run_code`; the plan checks the list against the pinned version).
- **`postgres-mcp`** runs through `uvx` with `--access-mode=restricted`. It connects to the checkout's own database, read from `.env.local`, then `.env`, in the order `scripts/load-env.ts` uses. The launcher refuses any database host except `localhost`, so it can never reach Neon. Only `list_schemas`, `list_objects`, `get_object_details`, `execute_sql` and `explain_query` are allowed; the workload and health tools are denied, since there's nothing to tune on PGlite.
- **Who gets them.** The main agent gets them, in the main checkout and in worktrees, including headless runs (ADR 0025). The subagents don't: their `tools` lists leave out MCP tools (ADR 0017), and that stays.
- **The `implement-plan` skill gains one step.** After a visible change, the agent opens each page it affects in the browser and checks it, before the `test-writer` subagent writes the tests. A browser check doesn't replace a system test.
- **What each server could open, and how it's closed:**

| Server | Untrusted content | Private data | A way out |
| --- | --- | --- | --- |
| Playwright | Only local pages. Annotations in local databases are seed data, test data or the owner's own. The live site can't be reached. | None of its own: the browser keeps no sign-ins. | Navigation is limited to local origins by the hook and the option. Annotations can't hold links or images (ADRs 0008, 0022), so a page can't make requests by itself. |
| Postgres | Rows in the local database, as above. | Development users and sessions in the local database. Never production. | None. It talks only to the local database, and its results go only into the agent's context. |

## Consequences

- The agent can see its UI changes and check data before handing over, instead of leaving gaps for the tests or the owner to find.
- Neither server runs in the sandbox. For them, the boundary is the hook, the deny rules and the servers' own options, all of it code that could have bugs. `mcp-guard.mjs` gets unit tests. CI and the owner's review stay the backstop.
- Read-only rests on `postgres-mcp`'s statement parsing, not on the database. If the parser were got round, the agent could change or drop one local database. `npm run worktree:setup` rebuilds a worktree's database; in the main checkout, `npm run db:migrate` and the seed do. Accepted, since the agent can already change its worktree's database through migrations and the seed.
- PGlite answers one query at a time, so a slow MCP query holds up the dev server and the tests. Restricted mode's time limit helps.
- The machine needs `uv` for `postgres-mcp`. Playwright MCP may want a different browser build from the system tests'; the plan checks.
- In the main checkout, the browser can't sign in: GitHub isn't an allowed origin. Whether the launcher can reuse the system tests' test sessions (ADR 0013) for signed-in pages is left to the plan.
- Project MCP servers need the owner's approval before Claude Code starts them. The plan checks that a headless run in a fresh worktree loads them.
- Page snapshots and query results use context, and so cost tokens. The run metrics will show how much.
