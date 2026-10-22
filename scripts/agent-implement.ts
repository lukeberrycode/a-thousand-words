// `npm run agent:implement -- <branch>`: an agent carries out a plan or ADR that's on main, with no
// one watching, through to a pull request (ADR 0025). The owner runs this; agents don't.
//
//   1. Checks the branch name against origin/main (ADR 0021) and that the branch doesn't exist yet.
//   2. Makes the worktree .claude/worktrees/<branch with / as ->, installs, and sets it up with the
//      local R2 mock, so it holds no secrets (ADR 0024).
//   3. Runs Claude Code headless there, in auto mode, on the implement-plan skill. Every hook, deny
//      rule and the sandbox apply as in any worktree session. The log goes to
//      .claude/agent-runs/<folder>.jsonl in the main checkout.
//   4. Sends a desktop notification with the pull request's link, and exits non-zero on failure.
//
// AGENT_BUDGET_USD caps the run's spend (default 25). The worktree stays for inspection; remove it
// with `npm run worktree:teardown` there, then `git worktree remove`.

import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { branchProblem, targetFile } from "../src/lib/branch-rule";
import { checkoutFolders } from "./checkout";

// tsx runs this as CommonJS, which has no top-level await.
void main();

async function main() {
  const branch = process.argv[2];
  if (!branch) fail("Usage: npm run agent:implement -- <plan/slug | adr/NNNN-slug>");
  // The guard accepts this prefix only because Claude Code's EnterWorktree adds it (ADR 0021).
  if (branch.startsWith("worktree-")) fail(`Name the branch without the worktree- prefix.`);

  const main = checkoutFolders()[0];
  const git = (...args: string[]) => execFileSync("git", args, { cwd: main, encoding: "utf8" }).trim();

  git("fetch", "--quiet", "origin");
  const onMain = git("ls-tree", "-r", "--name-only", "origin/main", "--", "docs/plans", "docs/adr").split("\n");
  const problem = branchProblem(branch, onMain);
  if (problem) fail(problem);
  const plan = targetFile(branch, onMain);
  if (!plan) fail(`Branch "${branch}" doesn't carry out a plan or ADR, so there's nothing for the agent to do.`);
  if (exists(() => git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}`))) {
    fail(`Branch ${branch} already exists here. Pick another slug, or finish that branch by hand.`);
  }
  if (git("ls-remote", "--heads", "origin", branch)) fail(`Branch ${branch} already exists on origin.`);

  const folder = branch.replace(/\//g, "-");
  const worktree = join(main, ".claude", "worktrees", folder);
  if (existsSync(worktree)) fail(`${worktree} already exists.`);
  const logDir = join(main, ".claude", "agent-runs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${folder}.jsonl`);

  console.log(`Carrying out ${plan} on ${branch}, in ${worktree}.`);
  git("worktree", "add", "--quiet", "--no-track", "-b", branch, worktree, "origin/main");
  const inWorktree = (command: string, args: string[]) =>
    execFileSync(command, args, { cwd: worktree, stdio: ["ignore", "inherit", "inherit"] });
  inWorktree("npm", ["ci", "--no-audit", "--no-fund"]);
  inWorktree("npm", ["run", "worktree:setup", "--", "--mock"]);
  inWorktree("npx", ["--no-install", "playwright", "install", "chromium"]);

  const budget = process.env.AGENT_BUDGET_USD ?? "25";
  console.log(`\nStarting the agent (budget $${budget}). Log: ${logPath}\n`);
  const claude = spawn(
    "claude",
    [
      "-p",
      `/implement-plan ${branch}`,
      "--permission-mode",
      "auto",
      "--output-format",
      "stream-json",
      "--verbose",
      "--max-budget-usd",
      budget,
    ],
    { cwd: worktree, stdio: ["ignore", "pipe", "inherit"] },
  );
  const exited = new Promise<number>((resolve) => {
    claude.on("error", (err) => {
      console.error(`Couldn't start claude: ${err.message}`);
      resolve(127);
    });
    claude.on("close", (status) => resolve(status ?? 1));
  });

  const log = createWriteStream(logPath);
  // The last RESULT line the agent wrote anywhere. Normally it ends the final message, but the Stop
  // hook can send the agent back to work after it has reported.
  let resultLine = "";
  for await (const line of createInterface({ input: claude.stdout })) {
    log.write(`${line}\n`);
    const event = parse(line);
    // The agent's own words, a line each, so a watching terminal can follow along.
    if (event?.type === "assistant") {
      for (const part of event.message?.content ?? []) {
        if (part.type !== "text" || !part.text.trim()) continue;
        console.log(`> ${part.text.trim().split("\n")[0]}`);
        resultLine = [...part.text.matchAll(/^RESULT (\{.*\})\s*$/gm)].pop()?.[1] ?? resultLine;
      }
    }
    if (event?.type === "result") {
      resultLine = [...String(event.result ?? "").matchAll(/^RESULT (\{.*\})\s*$/gm)].pop()?.[1] ?? resultLine;
    }
  }
  log.end();
  const code = await exited;

  const outcome = resultLine ? parse(resultLine) : null;
  if (!outcome?.pr) {
    notify(`${branch}: failed. Log: ${logPath}`, "critical");
    fail(`The agent didn't open a pull request (exit ${code}). Read ${logPath}; the worktree is ${worktree}.`);
  }
  // A pull request exists even if the run then stopped badly (over budget, say): report it, as a draft.
  const draft = outcome.draft !== false || code !== 0;
  const stopped = code !== 0 ? ` (the agent stopped with exit ${code})` : "";
  const summary = `${branch}: ${draft ? "draft PR, needs you" : "PR ready for review"}: ${outcome.pr}${stopped}`;
  notify(summary, draft ? "normal" : "low");
  console.log(`\n${summary}`);
}

function parse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function exists(check: () => unknown) {
  try {
    check();
    return true;
  } catch {
    return false;
  }
}

function notify(message: string, urgency: "low" | "normal" | "critical") {
  try {
    execFileSync("notify-send", ["--urgency", urgency, "A Thousand Words", message]);
  } catch {
    // No notification daemon (a server, CI): the terminal still has the result.
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
