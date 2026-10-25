// Starts the agent's browser, Playwright MCP, for this checkout (ADR 0026). Claude Code runs it from
// .mcp.json and talks to it over stdin and stdout, so nothing here may print to stdout.
//
//   - Headless and --isolated: the browser keeps no profile, so it has no sign-ins of its own.
//   - --allowed-origins: this checkout's dev server and R2 mock, and where images are served from.
//     That option isn't a boundary; .claude/hooks/mcp-guard.mjs checks every call against the same
//     list (src/lib/mcp.ts).
//   - Signed in as a local user, "Agent (local)", with a fresh Auth.js session in this checkout's
//     database, as the system tests sign in (e2e/support/world.ts). If the database isn't running,
//     or isn't on this machine, the browser starts signed out.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { BROWSER_OUTPUT_DIR, browserOrigins, checkLocalDatabase, signedInState } from "../src/lib/mcp";
import { checkoutPort } from "../src/lib/worktree";
import { checkoutEnv, currentWorktree } from "./checkout";

/** The user the browser signs in as. Approved, so it can upload and annotate. */
const AGENT_USER = { id: "mcp-agent", name: "Agent (local)", email: "mcp-agent@example.test" };
const SESSION_DAYS = 7;

// tsx runs this as CommonJS, which has no top-level await.
void main();

async function main() {
  // Claude Code doesn't promise which folder a server starts in, but it does say which checkout.
  if (process.env.CLAUDE_PROJECT_DIR) process.chdir(process.env.CLAUDE_PROJECT_DIR);
  const env = checkoutEnv();
  const worktree = currentWorktree();
  const origins = browserOrigins(
    { app: checkoutPort(worktree, "app"), r2: checkoutPort(worktree, "r2") },
    env.R2_PUBLIC_URL,
  );
  mkdirSync(BROWSER_OUTPUT_DIR, { recursive: true });

  const args = [
    "--headless",
    "--isolated",
    "--browser=chromium",
    `--output-dir=${BROWSER_OUTPUT_DIR}`,
    `--allowed-origins=${origins.join(";")}`,
  ];
  const state = await signIn(env.DATABASE_URL).catch((err: Error) => {
    console.error(`mcp-playwright: starting signed out, since the database couldn't be reached: ${err.message}`);
    return null;
  });
  if (state) args.push(`--storage-state=${state}`);

  const server = spawn("playwright-mcp", args, { stdio: "inherit" });
  server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => server.kill(signal));
}

/** Makes a new session for the agent's user, replacing its old ones. Returns the storage state file. */
async function signIn(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error("DATABASE_URL isn't set");
  checkLocalDatabase(databaseUrl);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    await db.user.upsert({
      where: { id: AGENT_USER.id },
      update: {},
      create: { ...AGENT_USER, approvedAt: new Date() },
    });
    const sessionToken = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await db.$transaction([
      db.session.deleteMany({ where: { userId: AGENT_USER.id } }),
      db.session.create({ data: { sessionToken, userId: AGENT_USER.id, expires } }),
    ]);
    const file = join(BROWSER_OUTPUT_DIR, "storage-state.json");
    writeFileSync(file, JSON.stringify(signedInState(sessionToken, expires), null, 2));
    return file;
  } finally {
    await db.$disconnect();
  }
}
