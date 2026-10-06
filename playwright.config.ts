import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

// Automated system tests (docs/system-tests.md, ADR 0013). Each test is named after its test ID.
// They run against the dev server and local database described there, with the R2 values in .env.
// Sign-in uses a database session made by the test instead of GitHub (e2e/support/world.ts).

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
    // localhost, not 127.0.0.1: the session cookie is set for localhost (docs/system-tests.md).
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // The image page then zooms without animating, so box positions can be read straight away.
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
