# 17. Clean up orphaned uploads with a small AWS CDK stack

Date: 2026-10-20 · Status: Accepted

## Context

Two paths leave a file in R2 with no `Image` row: an upload abandoned between the browser's `PUT` and `createImage` (including one left at the duplicate warning), and an R2 delete that fails after an image is deleted, which is logged and ignored. Each orphan costs a little storage and nothing else, but nothing ever removes them. `docs/architecture.md` listed this under "Known gaps".

The fix is a periodic job: list the bucket, find keys with no `Image` row, and delete them once they're old enough that no upload can still be in progress. Options considered:

- **A Vercel cron calling a route in the app:** the least new machinery. The job would share the app's code, environment and deploys. But it adds a route that deletes files, which needs its own secret to guard it, and a run is bounded by the function time limit.
- **R2 lifecycle rules:** R2 can expire objects by age and prefix, but it doesn't know which keys the database still uses. Uploading to a `pending/` prefix and copying to `images/` on `createImage` would let a rule expire abandoned uploads, but not the leftovers of failed deletes, and it changes the upload flow.
- **A Cloudflare Worker with a cron trigger:** next to R2, with a bucket binding instead of S3 credentials. It would need a Postgres driver that works in Workers, and it adds a third platform's tooling for one job.
- **A scheduled AWS Lambda, defined with the AWS CDK:** a separate stack with its own deploy, secrets, logs, alarm and budget.

## Decision

- The cleanup is an **AWS Lambda run daily by EventBridge Scheduler**, defined in a CDK app in `infra/` with its own `package.json`, lockfile, tests and workflow. The app's hosting doesn't change: Vercel, Neon and R2 stay as they are, and AWS only runs this job.
- Honestly, the deciding reason is the second aim in the README: to use AWS and the CDK in a real, if small, piece of this project. A Vercel cron would have done the job with less setup. The job is small and self-contained, so it's a low-risk place to do that, and the stack is easy to delete if it doesn't earn its place.
- The function talks to R2 through the S3 API, configured as in `src/lib/storage.ts`, and to Postgres with plain `pg` rather than Prisma, to keep the bundle small. It only considers keys under `images/`, and only deletes objects with no `Image` row whose last write is **more than 24 hours** ago.
- **Dry run by default:** the first deploys log what they'd delete. Deleting starts only after the logs have been reviewed and `ORPHAN_CLEANUP_DRY_RUN` is set to `false`.
- **At most 100 deletes a run.** More than that most likely means a misconfigured database, so the run deletes nothing and fails.
- Credentials live in **one Secrets Manager secret**, filled in by hand. The function's role may read that secret and nothing else in Secrets Manager.
- GitHub Actions deploys on pushes to `main` that touch `infra/`, signing in with **GitHub OIDC**. The OIDC provider and deploy role are a separate stack, deployed once by hand, and the role may only assume the roles `cdk bootstrap` created. No AWS keys are stored in GitHub.

## Consequences

- Orphans no longer accumulate: abandoned uploads go after a day, and a failed delete is retried the next night.
- A second cloud account to run, with its own sign-in, region and bill. Expected cost is about $0.40 a month (the secret); everything else is inside free tiers. An account-wide $5 budget emails a warning if that's wrong.
- The cleanup's credentials are a second copy of the production secrets, and changing the database or bucket means updating both Vercel and the secret. The R2 token should be the cleanup's own, so it can be revoked alone.
- The 24-hour limit is a trade-off: a user who leaves the duplicate warning open for more than a day and then chooses **Upload anyway** finds their file gone, and `createImage` refuses it. They upload again.
- Infrastructure changes are tested on pull requests (template assertions and unit tests for the orphan rule) and synthesised without AWS credentials, so a broken stack is caught before it reaches `main`.
- If the stack is removed, nothing in the app changes; orphans just start accumulating again.
