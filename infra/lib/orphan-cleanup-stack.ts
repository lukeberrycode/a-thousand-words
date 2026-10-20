import * as path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as targets from "aws-cdk-lib/aws-scheduler-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

export interface OrphanCleanupStackProps extends StackProps {
  /** Log what would be deleted, without deleting. Default true. */
  dryRun?: boolean;
  /** Refuse to delete more than this many objects in one run. Default 100. */
  maxDeletes?: number;
  /** Monthly account budget in US dollars. Default 5. */
  budgetUsd?: number;
  /** Where alarm and budget emails go. No email, no notifications. */
  alarmEmail?: string;
}

/**
 * A daily Lambda that deletes R2 objects with no Image row (docs/adr/0017). The app itself stays
 * on Vercel, Neon and R2; AWS only runs this job.
 */
export class OrphanCleanupStack extends Stack {
  constructor(scope: Construct, id: string, props: OrphanCleanupStackProps = {}) {
    super(scope, id, props);
    const { dryRun = true, maxDeletes = 100, budgetUsd = 5, alarmEmail } = props;

    // Filled in by hand after the first deploy (infra/README.md). CloudFormation generates a random
    // placeholder and never regenerates it, so later deploys leave the real values alone.
    const secret = new secretsmanager.Secret(this, "Config", {
      description:
        "a-thousand-words orphan cleanup: JSON with R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and DATABASE_URL",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const logGroup = new logs.LogGroup(this, "Logs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const fn = new NodejsFunction(this, "Cleanup", {
      description: "Deletes R2 uploads with no Image row, once they're a day old",
      entry: path.join(__dirname, "../lambda/handler.ts"),
      handler: "handler",
      depsLockFilePath: path.join(__dirname, "../package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.minutes(2),
      logGroup,
      environment: {
        SECRET_ARN: secret.secretArn,
        DRY_RUN: String(dryRun),
        MAX_DELETES: String(maxDeletes),
        MIN_AGE_HOURS: "24",
        KEY_PREFIX: "images/",
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        format: OutputFormat.CJS,
        target: "node22",
        minify: true,
        sourceMap: true,
        sourcesContent: false,
        // Bundle the AWS SDK too, so the version is the one in package-lock.json rather than
        // whatever the runtime ships. pg-native is pg's optional native driver, not used.
        externalModules: ["pg-native"],
      },
    });
    secret.grantRead(fn);

    new scheduler.Schedule(this, "Daily", {
      description: "Run the orphan cleanup once a day",
      schedule: scheduler.ScheduleExpression.cron({ hour: "3", minute: "17" }),
      target: new targets.LambdaInvoke(fn, { retryAttempts: 2 }),
    });

    const topic = new sns.Topic(this, "Alerts", { displayName: "a-thousand-words alerts" });
    if (alarmEmail) topic.addSubscription(new subscriptions.EmailSubscription(alarmEmail));

    const errors = new cloudwatch.Alarm(this, "Errors", {
      alarmDescription: "The orphan cleanup failed. Its log group says why.",
      metric: fn.metricErrors({ period: Duration.hours(1), statistic: "Sum" }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errors.addAlarmAction(new cwActions.SnsAction(topic));

    // Account-wide: covers everything in this AWS account, not just this stack.
    new budgets.CfnBudget(this, "Budget", {
      budget: {
        budgetName: "a-thousand-words-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: budgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: alarmEmail
        ? [
            { type: "ACTUAL", threshold: 80 },
            { type: "FORECASTED", threshold: 100 },
          ].map(({ type, threshold }) => ({
            notification: {
              notificationType: type,
              comparisonOperator: "GREATER_THAN",
              threshold,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: alarmEmail }],
          }))
        : undefined,
    });

    new CfnOutput(this, "SecretArn", { value: secret.secretArn });
    new CfnOutput(this, "FunctionName", { value: fn.functionName });
    new CfnOutput(this, "LogGroupName", { value: logGroup.logGroupName });
  }
}
