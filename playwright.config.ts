import { defineConfig, devices } from "@playwright/test";
import "./scripts/load-env";
import { currentWorktree } from "./scripts/checkout";
import { MOCK_AUTH_ENV, mockR2Env } from "./src/lib/mock-env";
import { checkoutPort } from "./src/lib/worktree";

// Automated system tests (docs/system-tests.md, ADR 0013). Each test is named after its test ID.
// Sign-in uses a database session made by the test instead of GitHub (e2e/support/world.ts).
//
// Each run starts its own servers (ADR 0024), on this checkout's test ports (ADR 0020), so it always
// tests this checkout's code, even with a dev server already running here:
// - an R2 mock holding objects in memory (scripts/r2-mock.ts), unless E2E_REAL_R2 is set, when the
//   tests use the real bucket from .env instead;
// - `next dev`, building into .next-test, beside any dev server's .next.
// The only setting a run needs from .env or .env.local is DATABASE_URL.

const worktree = currentWorktree();
const realR2 = Boolean(process.env.E2E_REAL_R2);
const r2Port = checkoutPort(worktree, "testR2");
const appPort = checkoutPort(worktree, "testApp");

// Set here, not only on the app server, because the test workers load this file too and talk to the
// same bucket (e2e/support/services.ts).
Object.assign(process.env, MOCK_AUTH_ENV, realR2 ? {} : mockR2Env(r2Port));

// localhost, not 127.0.0.1: the session cookie is set for localhost (docs/system-tests.md).
const baseURL = `http://localhost:${appPort}`;

export default defineConfig({
  testDir: "e2e",
  // One at a time: the local database from `npx prisma dev` mixes up queries arriving on several
  // connections at once ("bind message supplies 3 parameters, but prepared statement requires 0").
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/support/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The image page then zooms without animating, so box positions can be read straight away.
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    ...(realR2
      ? []
      : [
          {
            command: `npx --no-install tsx scripts/r2-mock.ts --port ${r2Port}`,
            url: `http://localhost:${r2Port}/`,
            reuseExistingServer: false,
            timeout: 30_000,
          },
        ]),
    {
      command: `npx --no-install next dev --port ${appPort}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NEXT_DIST_DIR: ".next-test" },
    },
  ],
});
