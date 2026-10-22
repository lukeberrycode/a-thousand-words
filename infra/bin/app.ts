import { App } from "aws-cdk-lib";
import { GithubDeployRoleStack } from "../lib/github-deploy-role-stack";
import { OrphanCleanupStack } from "../lib/orphan-cleanup-stack";

// Both stacks are environment-agnostic: they deploy to the account and region of the credentials
// in use, and `cdk synth` works without any. Settings come from context (cdk.json, or `-c`).
const app = new App();

function context(name: string): string | undefined {
  const value = app.node.tryGetContext(name);
  return value === undefined || value === "" ? undefined : String(value);
}

new OrphanCleanupStack(app, "AThousandWordsOrphanCleanup", {
  description: "a-thousand-words: daily cleanup of orphaned R2 uploads (docs/adr/0018)",
  dryRun: context("dryRun") !== "false",
  maxDeletes: Number(context("maxDeletes") ?? 100),
  budgetUsd: Number(context("budgetUsd") ?? 5),
  alarmEmail: context("alarmEmail"),
});

new GithubDeployRoleStack(app, "AThousandWordsGithubDeploy", {
  description: "a-thousand-words: GitHub Actions OIDC deploy role (deployed once, by hand)",
  githubRepo: context("githubRepo") ?? "lukeberrycode/a-thousand-words",
  existingOidcProviderArn: context("githubOidcProviderArn"),
});
