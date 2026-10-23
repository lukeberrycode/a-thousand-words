---
name: implement-plan
description: Carries out a plan or ADR that's on main, unattended, in the current worktree, through to a pull request. Started by `npm run agent:implement -- <branch>`, which makes and sets up the worktree first.
argument-hint: "[branch, e.g. plan/<slug> or adr/<number>-<slug>]"
disable-model-invocation: true
---

Carry out the plan or ADR that branch `$ARGUMENTS` names, in this worktree, and open a pull request (ADR 0025).

Nobody is watching. Never wait for an answer, and never ask one. When something needs the owner, write it down under **Needs the owner** (step 7) and carry on with what's clear. Stop only when a missing decision blocks everything else.

## 0. Check where you are

- `git branch --show-current` must be `$ARGUMENTS`. `git status` must be clean. If not, stop and report.
- This worktree was set up with `npm run worktree:setup -- --mock`. It uses the local R2 mock and holds no secrets. Never look for `.env` files or production values; the deny rules block them anyway.

## 1. Read the plan

- Find the file: `docs/plans/<slug>.md` for `plan/<slug>`, or the ADR in `docs/adr/` whose number the branch names (`targetFile` in `src/lib/branch-rule.ts`).
- Read it, `CLAUDE.md`, and every ADR or doc it cites.
- Write down, as a task list, every change the plan asks for: its decision, steps and any "to do". Note each choice the plan leaves open. Take the simplest option that keeps to the ADRs when the choice is minor. Put it under **Needs the owner** when it isn't.

## 2. Carry it out

- Change the code as the plan says. Reuse what's in `src/lib` before writing anything new.
- For a change users can see, search the UI for every place the old behaviour is described or shown: labels, help text, placeholders, empty states and docs. Grep for the words, not only the code. For example, the annotation editor's help text lists the Markdown it supports.
- A schema change needs a migration from `npm run db:migrate -- --name <short_name>` (the name, because there's no terminal to ask for one), which uses this worktree's own database. Note `prod:migrate` for the pull request.
- New decisions along the way get an ADR (`write-adr` skill).

## 3. Tests

Ask the `test-writer` subagent for the tests. Give it the behaviour the plan asks for, in the plan's words, and the test IDs in `docs/system-tests.md` that it touches. Don't give it your code. It writes unit tests and system tests, and updates `docs/system-tests.md`.

If it reports a failing test that it says shows a bug, fix the code, not the test.

## 4. Run every check

Run these in order, each as its own command:

```
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:system
```

`npm run test:system` starts its own R2 mock and dev server, on this worktree's test ports (`playwright.config.ts`). It needs nothing running first.

Run `npm run build` and `npm run test:system` on their own: no `| tail`, `2>&1`, `cd`, `timeout` or env-var prefix. Only the exact command runs outside the sandbox. Arguments after `--` are fine.

Fix each failure and run the check again. After three failed attempts at the same failure, stop fixing it. Record the failing command, the last output that matters, and what you tried, under **Needs the owner**. Then go on.

## 5. Review

Ask the `code-reviewer` subagent to review the branch against `origin/main` (`git diff origin/main...HEAD`): local `main` may be behind. Fix every blocker and anything marked "should fix" that's clearly right, then run step 4's checks again. Then ask for one more review. If blockers remain after the second round, list them under **Needs the owner**.

## 6. Docs

Check the definition of done in `CLAUDE.md`. The README, `docs/architecture.md`, the one-pager, `docs/system-tests.md` and `docs/discovery/risks.md` must still describe what the code does.

## 7. Commit, push, open the pull request

- Commit in small, logical steps, with messages in the style of `git log`.
- `git push -u origin $ARGUMENTS`.
- `gh pr create`, on its own (`gh` can only sign in when it isn't part of a longer command), with `--title` naming what the branch carries out, and `--body` in this shape:

  ```markdown
  Carries out <plan or ADR, linked>.

  ## What changed
  - ...

  ## Checks
  | Check | Result |
  | --- | --- |
  | format, lint, typecheck, unit tests, build | pass / fail |
  | system tests (R2 mock) | N passed / failures |
  | code review | no blockers / N blockers |

  ## Owner actions
  - Run `npm run prod:migrate` before merging (only if there's a migration).
  - Manual tests from docs/system-tests.md that a person has to run.

  ## Needs the owner
  - Open questions, unfixed failures and remaining blockers. "Nothing" if there are none.
  ```

- Add `--draft` if **Needs the owner** isn't empty, or if any check fails. Otherwise open it ready for review.
- Don't merge, and don't push to `main`. Both are blocked anyway; merging is for the owner (`/release`).

## 8. Report

End your final message with this line, and nothing after it. Once the pull request is open, end **every** later final message with it too: the Stop hook can send you back to fix a check after you've reported, and the launcher reads only your last message.

```
RESULT {"pr": "<pull request URL>", "draft": <true or false>}
```

If no pull request could be opened, end with `RESULT {"pr": null, "draft": true}` and say why just above it.
