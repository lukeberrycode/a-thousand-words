// Settings for the S3 client that talks to Cloudflare R2 (ADR 0002), or to the local mock that
// stands in for it (scripts/r2-mock.ts, ADR 0024). The app, the seed script and the system tests all
// build their client from this, so they all follow R2_ENDPOINT the same way.

// A read-only map of environment variable names to values.
type Env = Readonly<Record<string, string | undefined>>;

// Read a variable, or throw an error that names it if it's missing or empty.
function required(env: Env, name: string): string {
  // Look the variable up.
  const value = env[name];

  // Fail loudly if there's no value.
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);

  // Return the value.
  return value;
}

/**
 * Client settings for `new S3Client(...)`. With R2_ENDPOINT set, requests go there with the bucket
 * in the path (`/<bucket>/<key>`), which the mock expects. Otherwise they go to the account's R2
 * endpoint, and R2_ACCOUNT_ID must be set.
 */
export function r2ClientConfig(env: Env = process.env) {
  // Read the custom endpoint, if any, without trailing slashes.
  const custom = env.R2_ENDPOINT?.replace(/\/+$/, "");

  // Return the settings.
  return {
    // R2 uses the pseudo-region "auto".
    region: "auto",

    // Use the custom endpoint, or build the account's R2 address.
    endpoint: custom || `https://${required(env, "R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,

    // Put the bucket in the path only for a custom endpoint (the mock).
    forcePathStyle: Boolean(custom),

    // The access keys.
    credentials: {
      // The access key ID.
      accessKeyId: required(env, "R2_ACCESS_KEY_ID"),

      // The secret access key.
      secretAccessKey: required(env, "R2_SECRET_ACCESS_KEY"),
    },
  };
}
