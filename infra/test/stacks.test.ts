import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { GithubDeployRoleStack } from "../lib/github-deploy-role-stack";
import { OrphanCleanupStack } from "../lib/orphan-cleanup-stack";

type Statement = { Action: string | string[]; Resource: unknown; Effect: string };

describe("OrphanCleanupStack", () => {
  let template: Template;

  beforeAll(() => {
    // Synthesising bundles the function with esbuild, which takes a few seconds.
    template = Template.fromStack(new OrphanCleanupStack(new App(), "Test"));
  }, 60_000);

  it("has exactly one function, on Node 22, dry run by default", () => {
    template.resourceCountIs("AWS::Lambda::Function", 1);
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
      Environment: { Variables: Match.objectLike({ DRY_RUN: "true", KEY_PREFIX: "images/" }) },
    });
  });

  it("runs it from exactly one daily schedule", () => {
    template.resourceCountIs("AWS::Scheduler::Schedule", 1);
    template.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: Match.stringLikeRegexp("^cron\\(17 3 \\* \\* \\? \\*\\)$"),
    });
  });

  it("lets the function read only its own secret", () => {
    const secrets = template.findResources("AWS::SecretsManager::Secret");
    expect(Object.keys(secrets)).toHaveLength(1);
    const secretId = Object.keys(secrets)[0];

    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as Statement[],
    );
    const secretStatements = statements.filter((s) => [s.Action].flat().some((a) => a.startsWith("secretsmanager:")));
    expect(secretStatements).toHaveLength(1);
    expect([secretStatements[0].Action].flat()).toContain("secretsmanager:GetSecretValue");
    expect(secretStatements[0].Resource).toEqual({ Ref: secretId });
  });

  it("keeps logs for a month and alarms on errors", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: 30 });
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "Errors",
      Namespace: "AWS/Lambda",
      Threshold: 1,
    });
  });

  it("sends no email and has a $5 budget unless told otherwise", () => {
    template.resourceCountIs("AWS::SNS::Subscription", 0);
    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({ BudgetLimit: { Amount: 5, Unit: "USD" } }),
      NotificationsWithSubscribers: Match.absent(),
    });
  });

  it("emails alarms and budget warnings to the given address", () => {
    const t = Template.fromStack(
      new OrphanCleanupStack(new App(), "WithEmail", { alarmEmail: "ops@example.com", dryRun: false }),
    );
    t.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email", Endpoint: "ops@example.com" });
    t.hasResourceProperties("AWS::Budgets::Budget", {
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({ Subscribers: [{ SubscriptionType: "EMAIL", Address: "ops@example.com" }] }),
      ]),
    });
    t.hasResourceProperties("AWS::Lambda::Function", {
      Environment: { Variables: Match.objectLike({ DRY_RUN: "false" }) },
    });
  }, 60_000);
});

describe("GithubDeployRoleStack", () => {
  it("trusts only the repository's main branch, and only to assume the CDK roles", () => {
    const t = Template.fromStack(new GithubDeployRoleStack(new App(), "Deploy", { githubRepo: "owner/repo" }));
    t.resourceCountIs("AWS::IAM::OIDCProvider", 1);
    t.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub": "repo:owner/repo:ref:refs/heads/main",
              },
            },
          }),
        ],
      },
    });
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: [Match.objectLike({ Action: "sts:AssumeRole" })],
      },
    });
  });

  it("reuses an existing OIDC provider when given one", () => {
    const t = Template.fromStack(
      new GithubDeployRoleStack(new App(), "Deploy", {
        githubRepo: "owner/repo",
        existingOidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
      }),
    );
    t.resourceCountIs("AWS::IAM::OIDCProvider", 0);
  });
});
