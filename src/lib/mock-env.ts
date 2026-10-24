// The settings a checkout runs with when it uses the local R2 mock instead of Cloudflare R2
// (ADR 0024): the system tests always, and worktrees set up with `npm run worktree:setup -- --mock`.
// None of them is a secret, so a run needs nothing from .env except, at most, DATABASE_URL.

/** The bucket name the mock stores objects under. Any valid name works. */
export const MOCK_BUCKET = "a-thousand-words-mock";

/** R2 settings pointing at the mock on `port`, with the values the client needs but the mock ignores. */
export function mockR2Env(port: number) {
  const endpoint = `http://localhost:${port}`;
  return {
    R2_ENDPOINT: endpoint,
    R2_PUBLIC_URL: `${endpoint}/${MOCK_BUCKET}`,
    R2_BUCKET: MOCK_BUCKET,
    R2_ACCOUNT_ID: "mock",
    R2_ACCESS_KEY_ID: "mock",
    R2_SECRET_ACCESS_KEY: "mock",
  };
}

/**
 * Auth.js settings for a checkout that never signs in with GitHub: the system tests make their own
 * sessions (e2e/support/world.ts). Auth.js refuses to start without them. GitHub sign-in needs the
 * real values from .env, on port 3000.
 */
export const MOCK_AUTH_ENV = {
  AUTH_SECRET: "local-only-not-a-secret-0123456789abcdef",
  AUTH_GITHUB_ID: "mock",
  AUTH_GITHUB_SECRET: "mock",
};

/** Whether R2 settings point at a mock on this machine, rather than at Cloudflare. */
export function usesLocalR2(env: Readonly<Record<string, string | undefined>>) {
  if (!env.R2_ENDPOINT) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.R2_ENDPOINT).hostname);
  } catch {
    return false;
  }
}

/** The port of a local R2 endpoint such as `http://localhost:3001`. */
export function localR2Port(endpoint: string) {
  return Number(new URL(endpoint).port);
}
