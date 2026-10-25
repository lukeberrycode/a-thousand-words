---
name: release
description: Takes a reviewed pull request to production in the right order (migrate, merge, deploy, then the PROD-01 to PROD-05 checks), with the owner doing the production steps.
argument-hint: "[pull request number]"
disable-model-invocation: true
---

Release pull request #$ARGUMENTS to production. If no number was given, ask for it.

Merging to `main` deploys the live site. You can't touch production: the owner runs `prod:migrate` and merges. Your job is to check each step, tell the owner exactly what to run, and wait for them. Go one step at a time, and stop if a step fails.

## 1. Ready to merge?

- Run `gh pr view <number>` and `gh pr checks <number>`, each on its own (`gh` can only sign in when it isn't part of a longer command). Every check must pass.
- Read the description for anything the owner must do before merging.
- If the code hasn't been reviewed in this session, offer to run the `code-reviewer` subagent first.

## 2. Migrate production, if needed

- Run `git fetch origin`, then `git diff --name-only origin/main...origin/<head branch> -- prisma/migrations`.
- If that lists nothing, there's no migration: go to step 3.
- If it lists migrations, they must reach production **before** the merge: the new code expects the new schema. Ask the owner to check out the branch and run, in this prompt:

  ```
  ! npm run prod:migrate
  ```

  Then read the output. Continue only if it says the migrations were applied. New columns must work with the old code too, because the live site runs the old code until the deploy finishes.

## 3. Merge

Ask the owner to merge, on GitHub or with `! gh pr merge <number> --merge`. Then confirm it: `gh pr view <number> --json state,mergeCommit`.

## 4. Wait for the deploy

Vercel deploys `main` and records it on GitHub. Find the deployment for the merge commit:

```
gh api "repos/lukeberrycode/a-thousand-words/deployments?environment=Production&sha=<merge commit>"
```

Then check its status (`gh api <statuses_url>`) every minute or so, until the latest state is `success`. If it's `failure` or `error`, stop and tell the owner: the old version stays live until a new deploy succeeds. They can roll back in Vercel.

## 5. Check production

Read the **Production** section of `docs/system-tests.md`, and walk the owner through PROD-01 to PROD-05 at https://a-thousand-words-pi.vercel.app/.

- **PROD-01:** check the home page yourself first with WebFetch: it should show a Recently added row, then a row for each collection in prisma/seed-data.ts, each with its blurb and thumbnails. Then ask the owner to open three and click regions.
- **PROD-02 to PROD-05** need the owner's browser, GitHub account and phones. Give them the steps and expected results for each, one test at a time, and ask for pass or fail.
- If the release only changes docs or tests, say which checks can be skipped, and let the owner decide.

## 6. Report

A short summary: the PR, whether a migration ran, the deployed commit, and each PROD test with pass, fail or skipped. For any failure, offer to open a fix branch. Don't change `docs/system-tests.md` unless the owner asks.
