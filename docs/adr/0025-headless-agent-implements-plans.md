# 25. A headless agent carries out a plan in a worktree, through to a pull request

Date: 2026-10-22 · Status: Accepted

## Context

ADR 0021 made every branch carry out a plan or ADR already on `main`, and gave agents in worktrees the strict rules. ADR 0020 let worktrees run side by side. The next step was letting an agent take a plan from there to a pull request with no one watching. Then the owner's time goes on plans and reviews, not on driving sessions.

Options for starting it:

- **An interactive session** in each worktree. The owner can step in, but each run needs a terminal and a person.
- **GitHub Actions** with Claude Code's action. It needs an API key in GitHub and runs away from the local database and mocks.
- **A local script** that sets up the worktree and starts Claude Code headless.

## Decision

- **`npm run agent:implement -- <branch>`** (`scripts/agent-implement.ts`), run by the owner:
  - It checks the branch name against `origin/main` (ADR 0021), and refuses a branch that already exists.
  - It makes the worktree, installs, and sets it up with the R2 mock (ADR 0024), so the worktree holds no secrets.
  - It runs `claude -p "/implement-plan <branch>"` there in **auto mode**, with a spending cap (`AGENT_BUDGET_USD`, default 25), and logs to `.claude/agent-runs/`.
  - It sends a desktop notification with the result.
- **The `implement-plan` skill** is the procedure the agent follows:
  - read the plan;
  - carry it out, searching the UI for every place a visible change shows up;
  - have the `test-writer` subagent write the tests from the plan, not the code;
  - run every check, system tests included, with up to three attempts per failure;
  - have the `code-reviewer` subagent review, for up to two rounds;
  - bring the docs up to date, push, and open a pull request.
- **When the agent can't finish cleanly**, it still opens the pull request, as a draft, with a **Needs the owner** section. That covers an open choice in the plan, a check it couldn't fix, or a blocker that's left. Its last line, `RESULT {"pr": …, "draft": …}`, tells the script which happened.
- **No new permissions.** Inside the run, the guard hook, deny rules, sandbox, Stop hook and scoped subagents apply as in any worktree (ADRs 0015, 0017, 0021). Auto mode decides only what those leave open. The agent can't merge, push to `main`, read secrets or touch production.

## Consequences

- One command per plan. Several can run at once, each in its own worktree with its own database and ports.
- The owner reads plans before the work and pull requests after it. A draft pull request says exactly what it needs.
- Auto mode trusts a classifier for anything outside the allow list. The deny rules and the guard remain the boundary, and ADR 0021 already notes that the guard can be got round with quoting. CI and the owner's review are the backstop.
- A run costs money: the budget caps it, and the log shows where it went.
- The worktree stays after a run. Removing it is the owner's job (`npm run worktree:teardown`, then `git worktree remove`).
- Headless runs can't ask questions, so plans need to be clear about choices that matter.
