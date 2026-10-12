#!/usr/bin/env node
// PostToolUse hook: format each file Claude edits with Prettier (ADR 0014). Files Prettier doesn't
// handle, or that .prettierignore lists, are skipped. Never blocks: a formatting failure is shown
// to Claude, and lint and typecheck catch real problems at the end of the turn.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

const input = JSON.parse(
  await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }),
);

const file = input.tool_input?.file_path;
if (!file || !existsSync(file)) process.exit(0);

// The checkout the file is in: the main working tree or a git worktree.
let root;
try {
  root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: input.cwd, encoding: "utf8" }).trim();
} catch {
  process.exit(0);
}
if (relative(root, file).startsWith("..")) process.exit(0);
const prettier = join(root, "node_modules", ".bin", "prettier");
if (!existsSync(prettier)) process.exit(0);

try {
  execFileSync(prettier, ["--write", "--ignore-unknown", "--log-level", "warn", file], { cwd: root, stdio: "pipe" });
} catch (err) {
  process.stderr.write(`Prettier couldn't format ${file}:\n${err.stderr ?? err.message}\n`);
  process.exit(1);
}
