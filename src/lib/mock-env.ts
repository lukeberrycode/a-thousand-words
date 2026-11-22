// The settings a checkout runs with when it uses the local R2 mock instead of Cloudflare R2
// (ADR 0024): the system tests always, and worktrees set up with `npm run worktree:setup -- --mock`.
// None of them is a secret, so a run needs nothing from .env except, at most, DATABASE_URL.

/** The bucket name the mock stores objects under. Any valid name works. */
export const MOCK_BUCKET = "a-thousand-words-mock";

/** R2 settings pointing at the mock on `port`, with the values the client needs but the mock ignores. */
export function mockR2Env(port: number) {
  // The mock's address on this machine.
  const endpoint = `http://localhost:${port}`;

  // Return the settings.
  return {
    // Where the S3 client sends requests.
    R2_ENDPOINT: endpoint,

    // Where browsers load images from.
    R2_PUBLIC_URL: `${endpoint}/${MOCK_BUCKET}`,

    // The bucket name.
    R2_BUCKET: MOCK_BUCKET,

    // A dummy account ID.
    R2_ACCOUNT_ID: "mock",

    // A dummy access key.
    R2_ACCESS_KEY_ID: "mock",

    // A dummy secret key.
    R2_SECRET_ACCESS_KEY: "mock",
  };
}

/**
 * Auth.js settings for a checkout that never signs in with GitHub: the system tests make their own
 * sessions (e2e/support/world.ts). Auth.js refuses to start without them. GitHub sign-in needs the
 * real values from .env, on port 3000.
 */
export const MOCK_AUTH_ENV = {
  // A fixed secret for signing sessions; fine because it's local only.
  AUTH_SECRET: "local-only-not-a-secret-0123456789abcdef",

  // A dummy GitHub client ID.
  AUTH_GITHUB_ID: "mock",

  // A dummy GitHub client secret.
  AUTH_GITHUB_SECRET: "mock",
};

/** Whether R2 settings point at a mock on this machine, rather than at Cloudflare. */
export function usesLocalR2(env: Readonly<Record<string, string | undefined>>) {
  // With no endpoint set, we're using Cloudflare.
  if (!env.R2_ENDPOINT) return false;

  // Parsing the URL can throw, so guard it.
  try {
    // Local if the hostname is a loopback name or address.
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.R2_ENDPOINT).hostname);
  } catch {
    // An unparseable endpoint isn't local.
    return false;
  }
}

/** The port of a local R2 endpoint such as `http://localhost:3001`. */
export function localR2Port(endpoint: string) {
  // Parse the URL and read its port as a number.
  return Number(new URL(endpoint).port);
}
