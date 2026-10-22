#!/usr/bin/env node
// Stop hook: Claude can't finish a turn with failing checks (ADR 0015, the definition of done in
// CLAUDE.md). Runs lint, typecheck and unit tests when the code has changed since they last passed,
// and sends failures back to Claude. The system tests are too slow for every turn; CLAUDE.md says
// when to run them.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const input = JSON.parse(
  await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }),
);

// The checkout Claude is working in: the main working tree or a git worktree. When Claude is
// already continuing because of this hook (stop_hook_active), it checks again: Claude Code ends the
// turn anyway after eight blocks in a row.
let root;
try {
  root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: input.cwd, encoding: "utf8" }).trim();
} catch {
  process.exit(0);
}
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// The state of the code: the commit, uncommitted changes and new files, outside docs.
const paths = [".", ":(exclude)docs", ":(exclude)*.md"];
const hash = createHash("sha256")
  .update(git("rev-parse", "HEAD"))
  .update(git("diff", "HEAD", "--", ...paths));
for (const file of git("ls-files", "--others", "--exclude-standard", "-z", "--", ...paths).split("\0")) {
  // A nested repository, such as a git worktree under .claude/worktrees, is listed as "dir/".
  if (file && !file.endsWith("/")) hash.update(file).update(readFileSync(join(root, file)));
}
const state = hash.digest("hex");

const stateDir = join(git("rev-parse", "--absolute-git-dir").trim(), "claude-hooks");
const stateFile = join(stateDir, "checks-passed");
if (!existsSync(join(root, "node_modules"))) process.exit(0);
if (existsSync(stateFile) && readFileSync(stateFile, "utf8") === state) process.exit(0);

const failures = [];
for (const script of ["lint", "typecheck", "test"]) {
  const run = spawnSync("npm", ["run", "-s", script], { cwd: root, encoding: "utf8", timeout: 240_000 });
  if (run.status !== 0) {
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
    failures.push(`npm run ${script} failed:\n${output}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`The definition of done in CLAUDE.md isn't met yet.\n\n${failures.join("\n\n")}\n`);
  process.exit(2);
}
mkdirSync(stateDir, { recursive: true });
writeFileSync(stateFile, state);
