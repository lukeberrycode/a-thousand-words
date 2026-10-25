# 26. The coding agent checks its own work in a browser, through MCP

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
- **`postgres-mcp`** (Crystal DBA, MIT). Widely used. Its restricted mode runs read-only transactions, parses each statement with pglast before running it, refuses `COMMIT` and `ROLLBACK`, and limits query time.
- **A newer read-only server.** Several exist, with little track record yet.
- **Our own server.** More to maintain. ADR 0027's server for the site's own data is where we build one.

Not now: GitHub MCP (the agent already uses `gh`), and documentation servers such as Context7, which send the agent's queries to a third party and need a separate decision.

## Decision

- **`.mcp.json` names one stdio server, `playwright`.** A launcher script, `scripts/mcp-playwright.ts`, starts it, because each checkout has its own ports and database (ADR 0020). The server is a devDependency pinned to an exact version, so it runs with `npx --no-install`, never `@latest`.
- **The pinned version is 0.0.80**, not the newest (0.0.83). It's built on Playwright 1.63, as the system tests are, so both use the same browser build (Chromium 1243) and nothing extra is downloaded. It also predates WebMCP, which in later versions lets a page register tools of its own: one more way in for untrusted text.
- **Playwright MCP** runs headless with `--isolated`, so the browser has no saved profile, and writes to `.playwright-mcp/`, which is gitignored. Its `--allowed-origins` are the checkout's dev server and R2 mock, plus the origin of `R2_PUBLIC_URL`, which in the main checkout is the development bucket. The launcher gives the server only its own environment, not the settings it reads from `.env`. The option isn't a boundary, so:
  - **a new `mcp-guard.mjs` hook** (`PreToolUse`, matching `mcp__playwright__.*`) checks every call, and fails closed like `guard.mjs`. It allows only the tools of the pinned version that have been checked; a tool added in a later version stays off until someone looks at it. Every `url` must be on an allowed origin. Every `filename` the server writes must be in `.playwright-mcp/`. Every file it uploads must be a JPEG, PNG or WebP image inside the checkout, outside `.claude/` and `.playwright-mcp/`. It works the origins out for itself, from git and the env files, rather than reading a file the agent could change. The checks are pure functions in `src/lib/mcp.ts`, with unit tests.
  - **deny rules block the tools that run JavaScript**: `browser_evaluate`, in the page, and `browser_run_code_unsafe`, in the server process, outside the sandbox. The hook refuses them too.
- **The browser is signed in** as an approved local user, "Agent (local)" (id `mcp-agent`). Each time it starts, the launcher replaces that user's sessions in the checkout's database with a new one, and passes it to the browser as a storage state file, the way the system tests sign in (ADR 0013). It refuses a database that isn't on this machine. So the agent can check upload and annotation pages, in the main checkout too, without GitHub.
- **No database server, for now.** `postgres-mcp` was the choice, but 0.3.0, its newest release (May 2025), can't be installed as published. It pins `pglast==7.2.0`, which is no longer on PyPI. Its open range for the `mcp` package now picks up mcp 2.x, which renamed the API it uses. With both overridden (pglast 7.21, mcp below 2), it ran on a worktree's database and refused every write tried: a `DELETE`, `SELECT 1; COMMIT; DELETE …`, and a `DELETE` inside a `WITH`. But that's a combination its authors never tested, from a project with no release in 17 months, and its read-only mode is the only thing standing between the agent and the database. A database server needs a new ADR: a maintained read-only server, or our own, which ADR 0027 may build.
- **Who gets it.** The main agent gets it, in the main checkout and in worktrees, including headless runs (ADR 0025). The subagents don't: their `tools` lists leave out MCP tools (ADR 0017), and that stays.
- **The `implement-plan` skill gains one step.** After a visible change, the agent opens each page it affects in the browser and checks it, before the `test-writer` subagent writes the tests. A browser check doesn't replace a system test.
- **What the server could open, and how it's closed:**

| Server | Untrusted content | Private data | A way out |
| --- | --- | --- | --- |
| Playwright | Only local pages. Annotations in local databases are seed data, test data or the owner's own. The live site can't be reached. | A session for the local agent user, in the checkout's own database. No real sign-ins, and the server doesn't get `.env`. | Navigation is limited to local origins by the hook and the option. Uploads are limited to images in the checkout. Annotations can't hold links or images (ADRs 0008, 0022), so a page can't make requests by itself. |

## Consequences

- The agent can see its UI changes before handing over, instead of leaving gaps for the tests or the owner to find. It still checks data with one-off scripts or through the app.
- The server doesn't run in the sandbox. For it, the boundary is the hook, the deny rules and the server's own options, all of it code that could have bugs. CI and the owner's review stay the backstop.
- `--allowed-origins` doesn't cover redirects. A local page that redirects elsewhere, such as the GitHub sign-in, can take the browser off the allowed origins, though the hook still refuses any further navigation there.
- Moving to a newer Playwright MCP means checking its new tools and options, adding them to `BROWSER_TOOLS` in `src/lib/mcp.ts`, and turning off WebMCP (`--no-webmcp`). Moving the system tests to Playwright 1.64 is a good time to do it.
- The agent user and its session live in each checkout's database, the main checkout's too. The seed doesn't remove them; the launcher recreates them if they're gone.
- Project MCP servers need approval. Headless runs (`claude -p`) load them without asking. Interactive sessions use `enabledMcpjsonServers` in `.claude/settings.json`, which applies once the folder is trusted.
- Page snapshots use context, and so cost tokens. The run metrics will show how much.
