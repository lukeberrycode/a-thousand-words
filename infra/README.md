# infra: orphaned upload cleanup on AWS

A small AWS CDK app that deletes orphaned objects from the production R2 bucket once a day: files that no `Image` row points at. They come from uploads abandoned before `createImage` ran, and from R2 deletes that failed after an image was deleted (see "Known gaps" in [docs/architecture.md](../docs/architecture.md)). Why it runs on AWS rather than as a Vercel cron: [ADR 0018](../docs/adr/0018-orphan-cleanup-on-aws.md).

The app itself is unchanged: it still runs on Vercel, with Neon Postgres and Cloudflare R2. AWS only runs this job.

## What it creates

Stack `AThousandWordsOrphanCleanup` (`lib/orphan-cleanup-stack.ts`), deployed by GitHub Actions:

| Resource | What it's for |
| --- | --- |
| Lambda function (Node 22, arm64), bundled with esbuild | `lambda/handler.ts`: lists every object under `images/` in R2, asks Postgres which keys have an `Image` row, and deletes the others once they're **more than 24 hours old**. The age limit means an upload still in progress, such as one waiting at the duplicate warning, is never touched. |
| EventBridge Scheduler schedule | Runs the function at 03:17 UTC every day. |
| Secrets Manager secret | The R2 credentials and Neon connection string. Created with a random placeholder; you fill it in once (below). The function may read this secret and no other. |
| CloudWatch log group | The function's logs, kept for 30 days. |
| CloudWatch alarm + SNS topic | Alarms when the function fails. Emails the address in `alarmEmail`, if set. |
| AWS Budgets budget | $5 a month for the **whole account**, warning at 80% actual and 100% forecast. Emails the same address, if set. |

Stack `AThousandWordsGithubDeploy` (`lib/github-deploy-role-stack.ts`) is deployed once, by hand: the GitHub OIDC provider and the role GitHub Actions assumes to deploy.

### Safety

- **Dry run is on** until you turn it off. The function then logs each key it would delete (`"Would delete"`) and deletes nothing.
- **At most 100 deletes a run** (`maxDeletes`). A wrong `DATABASE_URL`, such as an empty database, would make every object look orphaned. With more than 100 orphans the function deletes nothing, logs the keys and fails, which sets off the alarm. If the keys are right, deploy once with a higher `-c maxDeletes=…`.
- Only keys under `images/` are considered, the prefix the app and the content runner write to (`images/<uuid>.<ext>`, `images/seed/<key>.jpg`).
- The function lists R2 first and queries Postgres second, so an `Image` row created during the listing is still seen.

## Commands

Run from `infra/`. It has its own `package.json` and lockfile; the app's `npm install` doesn't touch it.

```bash
npm ci
npm run typecheck
npm test            # Vitest: the orphan rules, and assertions on the synthesised templates
npx cdk synth       # no AWS credentials needed
```

Settings are CDK context, with defaults in `cdk.json`, overridden with `-c name=value`:

| Context | Default | |
| --- | --- | --- |
| `dryRun` | `true` | `false` to really delete |
| `alarmEmail` | none | Where alarm and budget emails go |
| `maxDeletes` | `100` | Most objects one run may delete |
| `budgetUsd` | `5` | Monthly account budget |
| `githubRepo` | `lukeberrycode/a-thousand-words` | Repository whose `main` may deploy (deploy role stack) |
| `githubOidcProviderArn` | none | Reuse an existing GitHub OIDC provider (deploy role stack) |

## Deployment

The workflow [`.github/workflows/infra.yml`](../.github/workflows/infra.yml) runs when a change touches `infra/`. On a pull request, it typechecks, tests and synthesises, without AWS credentials. On a push to `main`, or a manual run on `main`, it also deploys `AThousandWordsOrphanCleanup`. It signs in to AWS with GitHub's OIDC token, so no AWS keys are stored in GitHub. Until the `AWS_DEPLOY_ROLE_ARN` variable is set, the deploy job is skipped.

GitHub repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | The `DeployRoleArn` output of the deploy role stack |
| `AWS_REGION` | Region to deploy to. Default `eu-west-2` |
| `ALARM_EMAIL` | Optional. Alarm and budget emails |
| `ORPHAN_CLEANUP_DRY_RUN` | Unset (dry run) until you've reviewed the logs; then `false` |

### One-time setup

Done once, from a workstation signed in to the AWS account as an administrator (for example `aws sso login`, or a profile in `AWS_PROFILE`).

1. **Bootstrap CDK** in the account and region. This creates the roles and bucket `cdk deploy` uses:

   ```bash
   cd infra && npm ci
   npx cdk bootstrap aws://<account-id>/eu-west-2
   ```

2. **Create the deploy role** for GitHub Actions:

   ```bash
   npx cdk deploy AThousandWordsGithubDeploy
   ```

   It trusts only GitHub's OIDC tokens for `main` of this repository, and may only assume the roles `cdk bootstrap` created. If the account already has a GitHub OIDC provider (`aws iam list-open-id-connect-providers`), add `-c githubOidcProviderArn=<its ARN>`: an account can only have one.

3. **Set the repository variables** above: `AWS_DEPLOY_ROLE_ARN` from the stack's output, `AWS_REGION`, and `ALARM_EMAIL` if you want emails. Leave `ORPHAN_CLEANUP_DRY_RUN` unset.

4. **Deploy the cleanup stack**: merge to `main`, or run the Infra workflow by hand (Actions → Infra → Run workflow). Or deploy from the workstation with `npx cdk deploy AThousandWordsOrphanCleanup -c alarmEmail=you@example.com`.

5. **Confirm the email subscriptions.** AWS sends a "Subscription Confirmation" email to `ALARM_EMAIL`; alarms aren't delivered until you click its link.

6. **Fill in the secret.** Create an R2 API token for the production bucket with Object Read & Write, separate from the app's, so it can be revoked on its own. Use Neon's connection string (pooled or direct). Write the values to a file outside the repository:

   ```json
   {
     "R2_ACCOUNT_ID": "…",
     "R2_ACCESS_KEY_ID": "…",
     "R2_SECRET_ACCESS_KEY": "…",
     "R2_BUCKET": "…",
     "DATABASE_URL": "postgresql://…?sslmode=verify-full"
   }
   ```

   Then store it and delete the file:

   ```bash
   aws secretsmanager put-secret-value --secret-id <SecretArn output> --secret-string file://secret.json
   rm secret.json
   ```

   Later deploys never overwrite it: CloudFormation generated the placeholder once and leaves the value alone.

7. **Run it once and read the log**, rather than waiting for 03:17:

   ```bash
   aws lambda invoke --function-name <FunctionName output> /dev/stdout
   aws logs tail <LogGroupName output> --since 10m
   ```

   It reports how many objects it listed, how many have a row, and each key it would delete.

8. **Turn dry run off** once the logs from a few runs list only keys that really are orphans: set `ORPHAN_CLEANUP_DRY_RUN` to `false` and run the Infra workflow by hand.

## Cost

Close to zero:

- **Lambda, EventBridge Scheduler, CloudWatch logs, one alarm, SNS email:** one short run a day is far inside each free tier.
- **Secrets Manager:** about **$0.40 a month** for the one secret, plus $0.05 per 10,000 reads (about 30 a month).
- **AWS Budgets:** budgets that only send alerts are free.
- **Outside AWS:** one R2 listing and one Postgres query a day. Both are negligible, though the query wakes Neon's compute for a few seconds if it has scaled to zero.

The $5 budget is there to catch a mistake, not to fund the stack.
