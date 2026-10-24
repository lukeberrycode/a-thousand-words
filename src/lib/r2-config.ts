// Settings for the S3 client that talks to Cloudflare R2 (ADR 0002), or to the local mock that
// stands in for it (scripts/r2-mock.ts, ADR 0024). The app, the seed script and the system tests all
// build their client from this, so they all follow R2_ENDPOINT the same way.

type Env = Readonly<Record<string, string | undefined>>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

/**
 * Client settings for `new S3Client(...)`. With R2_ENDPOINT set, requests go there with the bucket
 * in the path (`/<bucket>/<key>`), which the mock expects. Otherwise they go to the account's R2
 * endpoint, and R2_ACCOUNT_ID must be set.
 */
export function r2ClientConfig(env: Env = process.env) {
  const custom = env.R2_ENDPOINT?.replace(/\/+$/, "");
  return {
    region: "auto",
    endpoint: custom || `https://${required(env, "R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    forcePathStyle: Boolean(custom),
    credentials: {
      accessKeyId: required(env, "R2_ACCESS_KEY_ID"),
      secretAccessKey: required(env, "R2_SECRET_ACCESS_KEY"),
    },
  };
}
