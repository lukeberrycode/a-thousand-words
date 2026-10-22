import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

export interface GithubDeployRoleStackProps extends StackProps {
  /** owner/name of the repository whose main branch may deploy. */
  githubRepo: string;
  /**
   * ARN of an existing GitHub OIDC provider in the account. An account can hold only one per URL,
   * so pass this if one already exists; otherwise the stack creates it.
   */
  existingOidcProviderArn?: string;
}

const GITHUB_OIDC_URL = "https://token.actions.githubusercontent.com";

/**
 * One-time bootstrap, deployed by hand (infra/README.md): lets GitHub Actions on `main` deploy the
 * orphan cleanup stack with short-lived credentials, so no AWS keys are stored in GitHub.
 */
export class GithubDeployRoleStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubDeployRoleStackProps) {
    super(scope, id, props);

    const provider = props.existingOidcProviderArn
      ? iam.OidcProviderNative.fromOidcProviderArn(this, "GithubOidc", props.existingOidcProviderArn)
      : new iam.OidcProviderNative(this, "GithubOidc", {
          url: GITHUB_OIDC_URL,
          clientIds: ["sts.amazonaws.com"],
        });

    const role = new iam.Role(this, "DeployRole", {
      description: `GitHub Actions deploys from ${props.githubRepo} main`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });

    // `cdk deploy` does its work through the roles `cdk bootstrap` created, so this role only
    // needs to assume those. What they may do is set by the bootstrap, not here.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );

    new CfnOutput(this, "DeployRoleArn", {
      value: role.roleArn,
      description: "Set as the AWS_DEPLOY_ROLE_ARN repository variable in GitHub",
    });
  }
}
