#!/usr/bin/env node
// PreToolUse hook for the agent's browser, Playwright MCP (ADR 0026). The server runs outside the
// sandbox and its --allowed-origins option isn't a boundary, so this checks every call: only the
// pinned version's known tools, only this checkout's own pages, files written only in
// .playwright-mcp/, and only images uploaded (src/lib/mcp.ts). Exit 2 blocks the call and shows the
// reason to Claude. Fails closed: if the hook itself fails, the call is blocked.
//
// The origins are worked out here as scripts/mcp-playwright.ts works them out, from git and the env
// files. This guards against mistakes and against instructions planted in a page, not against an
// agent set on getting out: the rules live in src/lib, which the agent can edit, and `npm run dev`
// already runs its code outside the sandbox. Review and CI are the backstop (ADR 0015).
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

try {
  await guard();
} catch (err) {
  block(`mcp-guard.mjs failed, so the call is blocked: ${err?.message ?? err}`);
}

async function guard() {
  const input = JSON.parse(
    await new Promise((resolve) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
    }),
  );
  const { tool_name: name = "", tool_input: args = {}, cwd } = input;
  const prefix = "mcp__playwright__";
  if (!name.startsWith(prefix)) return;

  // Loaded here, not imported above, so that if node_modules is broken the hook still blocks.
  const { config } = await import("dotenv");
  const { browserCallProblem, browserOrigins } = await import(new URL("../../src/lib/mcp.ts", import.meta.url));
  const { checkoutPort, worktreeName } = await import(new URL("../../src/lib/worktree.ts", import.meta.url));

  const [gitDir, commonDir, root] = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--show-toplevel"],
    {
      cwd: process.env.CLAUDE_PROJECT_DIR ?? cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    },
  )
    .trim()
    .split("\n");
  const worktree = gitDir === commonDir ? null : worktreeName(basename(root));
  const env = { ...process.env };
  config({ path: [`${root}/.env.local`, `${root}/.env`], processEnv: env, quiet: true });
  const origins = browserOrigins(
    { app: checkoutPort(worktree, "app"), r2: checkoutPort(worktree, "r2") },
    env.R2_PUBLIC_URL,
  );

  const problem = browserCallProblem(name.slice(prefix.length), args, { origins, root });
  if (problem) block(problem);
}
