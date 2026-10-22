# 21. Branches carry out a plan or ADR already on main, and agents in worktrees get the strict rules

Date: 2026-10-22 · Status: Accepted

## Context

ADR 0015 put every agent under the same rules. ADR 0020 made parallel agents in git worktrees possible. Two problems came up.

- **Branches drifted from their plans.** A branch could write its own plan or ADR and then carry it out, so the owner first saw the plan in the same pull request as the code. A plan is easier to review, and to change, before any code depends on it.
- **The rules got in the way in the main checkout.** An agent there usually works with the owner watching. It couldn't push a docs fix to `main`, which the owner had approved (docs go straight to `main`, code goes through a pull request), and the `Stop` hook held every turn open while checks failed, even mid-conversation. An agent in a worktree runs for a long time unattended, and that's where the rules matter.

A hook can't tell whether a person is watching, but it can tell which checkout it's in: in a linked worktree, `git rev-parse --git-dir` and `--git-common-dir` differ. Deny rules in `.claude/settings.json` can't depend on that, so any rule that differs between the two moves into a hook.

## Decision

- **Branch names say what they carry out.** `plan/<slug>` carries out `docs/plans/<slug>.md`. `adr/<number>-<slug>` carries out ADR `<number>`. The plan or ADR must already be on `main`. `fix/`, `docs/` and `dependabot/` branches need neither. `src/lib/branch-rule.ts` holds the rule. Plans and ADRs reach `main` as docs-only commits. A branch can still add ADRs for decisions it makes along the way.
- **CI checks every pull request's branch** (`npm run check:branch`, in the required `checks` job), however the branch was made. That's the check that can't be got round.
- **`guard.mjs` checks earlier**, for quicker feedback: new branches in a worktree, any new worktree (`git worktree add`, the `EnterWorktree` tool) and pushes from a worktree. It reads `origin/main`, and fetches it if the plan isn't there.
- **The main checkout is freer.** Docs-only pushes to `main` are allowed: changes under `docs/` and Markdown files at the top level. Branches made there aren't checked until CI. The `Stop` hook shows failing checks once for each state of the code, without holding the turn open.
- **Some rules stay everywhere.** These are the deny rules on secrets, env files, `prod:*` and `keepassxc`, force pushes, remote deletes, merging and `rm -rf`. Pushing code to `main` also stays blocked everywhere. They cost nothing in normal work, and an agent with a person watching can still make a mistake, or run in auto mode with nobody watching. The subagents keep their narrow scope (ADR 0017) wherever they run.
- **The guard fails closed.** If the hook itself fails, it blocks the call, as `agent-scope.mjs` already did. Before, a crash let the call through.

This amends ADR 0015. Its pushes-to-`main` deny rules have moved into `guard.mjs`, and its `Stop` hook now behaves differently in the main checkout.

## Consequences

- Plans are reviewed before any code depends on them, and each pull request names the plan it carries out.
- Small changes without a plan need a `fix/` or `docs/` branch. Two plans on one branch, or a plan split over several branches, don't fit the naming. Split the plan, or extend the rule.
- In the main checkout, a failing check no longer stops a turn. CI still blocks the merge.
- The guard parses commands by splitting on spaces, as before. Quoted arguments and `bash -c` get past it. It's a guard against mistakes; CI is the boundary.
- Subagents started with `isolation: "worktree"` get branch names the guard doesn't see. Their pull requests fail the CI check until the branch is renamed.
- `EnterWorktree` names its branch `worktree-<name>`, so the rule ignores that prefix. A name such as `plan/<slug>` gives `worktree-plan/<slug>`.
- The hook loads `branch-rule.ts` through Node's built-in type stripping (Node 22.18 and later), so that file must use only types that can be stripped.
