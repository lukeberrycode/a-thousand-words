#!/usr/bin/env node
// PreToolUse hook for the subagents in .claude/agents (ADR 0016): keeps each one to its job, which a
// tool list can't do on its own. Usage: node agent-scope.mjs <code-reviewer|test-writer>.
// - code-reviewer: no edits; Bash only for git commands that read.
// - test-writer: edits only test files; Bash only for the test, lint and typecheck commands.
// Fails closed: anything it can't parse is blocked (exit 2), because any other failure lets the call through.
import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

let input;
try {
  input = JSON.parse(
    await new Promise((done) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => done(data));
    }),
  );
} catch {
  block("agent-scope: couldn't read the hook input.");
}

const agent = process.argv[2];
const { tool_name: tool, tool_input: args = {}, cwd } = input;

const readGit = /^git (diff|log|show|status|blame|ls-files|rev-parse|merge-base|branch --show-current)\b/;
const testing = [
  /^npm (test|run test|run test:system|run lint|run typecheck)$/,
  /^npm run test:system -- [\w ./:@=-]+$/,
  /^npx --no-install (vitest run|playwright test)( [\w ./:@=-]+)?$/,
];
const allowedBash = {
  "code-reviewer": [readGit],
  "test-writer": [readGit, ...testing],
};

// Test files: unit tests next to the code, the Playwright specs and helpers, and the test catalogue.
const testFile = /^(src\/.+\.test\.tsx?|e2e\/.+\.tsx?|docs\/system-tests\.md)$/;

if (!allowedBash[agent]) block(`agent-scope: unknown agent "${agent}".`);

if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
  if (agent === "code-reviewer") block("The code reviewer only reads. Report the problem instead of fixing it.");
  let root;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  } catch {
    block("agent-scope: couldn't find the repository root.");
  }
  const file = String(args.file_path ?? args.notebook_path ?? "");
  const path = relative(root, resolve(cwd ?? root, file));
  if (path.startsWith("..") || isAbsolute(path) || !testFile.test(path)) {
    block(
      `The test writer only edits test files (src/**/*.test.ts, e2e/, docs/system-tests.md), not ${path}. ` +
        "If the code needs to change, say so in your report.",
    );
  }
}

if (tool === "Bash") {
  const command = String(args.command ?? "").trim();
  // No chaining, pipes, redirects or substitutions: each command must match the list on its own.
  if (/[;&|<>`$\n\\]/.test(command)) {
    block("Run one command at a time, without pipes, redirects or substitutions.");
  }
  if (/(^|\s)(--output|-o)\b/.test(command)) block("Don't write output to files.");
  if (!allowedBash[agent].some((pattern) => pattern.test(command))) {
    block(`The ${agent} agent can't run "${command}". Allowed: ${allowedBash[agent].map(String).join(", ")}`);
  }
}
