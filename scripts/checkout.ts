// Which git checkout is running: the main one, or a linked worktree (ADR 0020). Used by
// `npm run dev`, the Playwright config and `npm run worktree:setup`.

import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { config } from "dotenv";
import { worktreeName } from "../src/lib/worktree";

function git(args: string[], cwd: string) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** The worktree's name, or null in the main checkout (or outside git, as on Vercel). */
export function currentWorktree(cwd = process.cwd()): string | null {
  try {
    const [gitDir, commonDir, topLevel] = git(
      ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--show-toplevel"],
      cwd,
    ).split("\n");
    return gitDir === commonDir ? null : worktreeName(basename(topLevel));
  } catch {
    return null;
  }
}

/** The folders of every checkout of this repository, the main one first. */
export function checkoutFolders(cwd = process.cwd()) {
  return git(["worktree", "list", "--porcelain"], cwd)
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

/**
 * The checkout's settings: the environment, then .env.local, then .env, in the order load-env.ts
 * reads them. Unlike load-env.ts, they're returned instead of put in process.env, so a server the
 * caller starts doesn't inherit the secrets in .env (ADR 0026).
 */
export function checkoutEnv(): Record<string, string | undefined> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined) env[name] = value;
  config({ path: [".env.local", ".env"], processEnv: env, quiet: true });
  return env;
}
