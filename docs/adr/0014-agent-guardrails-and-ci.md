# 14. Guard the coding agent with permissions, hooks and a sandbox, and check every pull request in CI

Date: 2026-10-12 · Status: Accepted

## Context

Claude Code writes most of this project's code. Until now, safety depended on the owner reading each permission prompt: the only settings were a personal `.claude/settings.local.json` with one rule. Nothing stopped an agent reading `.env.prod`, which holds production database and storage credentials, or running `npm run prod:*`. Lint and typecheck ran only when someone remembered, and nothing checked a pull request before it merged, though `main` deploys the live site.

The aim is to let the agent work for longer without supervision: it should do routine work without asking, be unable to do dangerous things at all, and be unable to call a task finished while checks fail. Each guard should have a second line behind it, and the last line shouldn't depend on the agent's own setup.

## Decision

- **Permissions** (`.claude/settings.json`, checked in): allow the routine loop (lint, typecheck, tests, build, format, local migrations, commits, pushing branches, opening pull requests). Deny reading or editing the env files, the `prod:*` scripts and anything naming `.env.prod`, merging pull requests, force pushes, pushing to `main`, `git reset --hard` and `rm -rf`. The owner merges and pushes to `main`. Personal rules stay in the git-ignored `.claude/settings.local.json`.
- **Hooks** (`.claude/hooks/`, Node scripts, as `jq` isn't installed everywhere):
  - `guard.mjs` (`PreToolUse`): blocks edits to env files and `package-lock.json`, force pushes, remote deletes, and pushes to `main`, including a bare `git push` while on `main`, which a deny rule can't see.
  - `format.mjs` (`PostToolUse`): runs Prettier on each edited file in the checkout.
  - `stop-checks.mjs` (`Stop`): runs lint, typecheck and unit tests when the code has changed since they last passed, and sends failures back to the agent, which then can't finish the turn. The system tests take two minutes, too slow for every turn; `CLAUDE.md` says when to run them.
- **Sandbox:** Claude Code's Bash sandbox (bubblewrap on Linux) is on. Shell commands can write only inside the project and temp, can reach only npm and GitHub, and can't read `.env.prod`. Commands that need the local database, a browser or the dev server on localhost run outside it (`excludedCommands`): the system tests, Lighthouse, the dev server, migrations, the seed and user scripts, and `gh`, whose login the sandbox can't reach.
- **CI** (`.github/workflows/ci.yml`): every pull request and push to `main` runs format check, lint, typecheck, unit tests, build and `npm audit`. The `main` ruleset requires the `checks` job to pass. Dependabot (`.github/dependabot.yml`) opens weekly update pull requests, which go through the same checks.
- **`npm audit` blocks on critical advisories only.** On 12 October 2026 it reported four high advisories, all inside Prisma's dependencies with no fix available: `mysql2`, which this app never loads (it uses Postgres), and `deepmerge-ts` in Prisma's config loader, which never sees user input. The full report stays in the CI log.

## Consequences

- The agent can run a whole milestone on a branch, opening a pull request at the end, without prompts for routine work. The owner is the only one who can merge or deploy.
- Every change, the owner's or the agent's, passes the same checks before it reaches the live site. CI is outside the agent's reach, so it holds even if local settings are changed or bypassed.
- Deny rules match the command Claude writes, not every way of running a program (`bash -c …` isn't matched), so they're a guard against mistakes, not a security boundary. The sandbox is the stronger layer for files and network; CI and the ruleset are the final one.
- The sandbox mounts placeholders over protected paths inside the project (`.bashrc`, `.claude/skills` and others). Tools that walk the whole tree trip over them: `.prettierignore` skips dotfiles, and `next build` runs outside the sandbox.
- The system tests and Lighthouse don't run in CI yet: they need a database and storage there (risk R12 in `docs/discovery/risks.md`). A mock S3 service would make that possible.
- Claude Code's settings and hook formats change often. If a hook stops firing after an upgrade, check them against the current documentation.
