import { defineConfig, devices } from "@playwright/test";
import "./scripts/load-env";
import { currentWorktree } from "./scripts/checkout";
import { MOCK_AUTH_ENV, mockR2Env } from "./src/lib/mock-env";
import { MAIN_PORT, checkoutPort } from "./src/lib/worktree";

// Automated system tests (docs/system-tests.md, ADR 0013). Each test is named after its test ID.
// Sign-in uses a database session made by the test instead of GitHub (e2e/support/world.ts).
//
// Each run starts its own servers (ADR 0024), on this checkout's test ports (ADR 0020), so it always
// tests this checkout's code, even with a dev server already running here:
// - an R2 mock holding objects in memory (scripts/r2-mock.ts);
// - `next dev`, building into .next-test, beside any dev server's .next.
// The only setting a run needs from .env or .env.local is DATABASE_URL.
//
// E2E_REAL_R2=1 tests against the real bucket from .env instead, as the tests did before the mock:
// in the main checkout only, on port 3000, using the dev server there if it's running. The dev
// bucket's CORS rule only lets the browser upload from http://localhost:3000.

const worktree = currentWorktree();
const realR2 = process.env.E2E_REAL_R2 === "1";
if (realR2 && worktree !== null) {
  throw new Error("E2E_REAL_R2 runs only in the main checkout: the dev bucket accepts uploads from localhost:3000.");
}
const r2Port = checkoutPort(worktree, "testR2");
const appPort = realR2 ? MAIN_PORT : checkoutPort(worktree, "testApp");

// Set here, not only on the app server, because the test workers load this file too and talk to the
// same bucket (e2e/support/services.ts).
if (!realR2) Object.assign(process.env, MOCK_AUTH_ENV, mockR2Env(r2Port));

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
  webServer: realR2
    ? { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 }
    : [
        {
          command: `npx --no-install tsx scripts/r2-mock.ts --port ${r2Port}`,
          url: `http://localhost:${r2Port}/`,
          reuseExistingServer: false,
          timeout: 30_000,
        },
        {
          command: `npx --no-install next dev --port ${appPort}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: { NEXT_DIST_DIR: ".next-test" },
        },
      ],
});
