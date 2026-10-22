#!/usr/bin/env node
// PreToolUse hook: a second line behind the deny rules in .claude/settings.json (ADR 0015), and the
// split between the main checkout and git worktrees (ADR 0021). Exit 2 blocks the call and shows the
// reason to Claude. Fails closed: if the hook itself fails, the call is blocked.
// - Everywhere: no edits to env files or the lock file, no force pushes or remote deletes, and no
//   code pushed to main, including by a bare `git push` while on main, which a deny rule can't see.
// - In the main checkout, where the owner is at hand: docs-only pushes to main are allowed.
// - In a worktree, and when making one: nothing is pushed to main, and a new or pushed branch must
//   carry out a plan or ADR already on main (src/lib/branch-rule.ts).
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

try {
  await guard();
} catch (err) {
  block(`guard.mjs failed, so the call is blocked: ${err?.message ?? err}`);
}

async function guard() {
  const input = JSON.parse(
    await new Promise((resolve) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
    }),
  );
  const { tool_name: tool, tool_input: args = {}, cwd } = input;
  const { branchProblem, branchesCreated, isDocsOnly } = await import(
    new URL("../../src/lib/branch-rule.ts", import.meta.url)
  );

  const git = (...gitArgs) =>
    execFileSync("git", gitArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 }).trim();
  const fetchMain = () => {
    try {
      git("fetch", "--quiet", "origin", "main");
    } catch {
      // Offline: check against the last fetched main.
    }
  };
  let worktree;
  const inWorktree = () => {
    if (worktree === undefined) {
      const [gitDir, commonDir] = git("rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir").split(
        "\n",
      );
      worktree = gitDir !== commonDir;
    }
    return worktree;
  };
  const checkBranch = (name) => {
    if (!branchProblem(name, [])) return; // Exempt: fix/, docs/, dependabot/.
    const filesOnMain = () => {
      try {
        return git("ls-tree", "-r", "--name-only", "origin/main", "--", "docs/plans", "docs/adr").split("\n");
      } catch {
        return [];
      }
    };
    if (!branchProblem(name, filesOnMain())) return;
    fetchMain();
    const problem = branchProblem(name, filesOnMain());
    if (problem) block(problem);
  };

  if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
    const name = basename(args.file_path ?? args.notebook_path ?? "");
    if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") {
      block(`${name} holds secrets: edit it by hand, not through Claude. Document new variables in .env.example.`);
    }
    if (name === "package-lock.json") block("Change package-lock.json through npm (npm install), not by editing it.");
  }

  // A new worktree gets a new branch, named after the worktree.
  if (tool === "EnterWorktree" && !args.path) {
    if (!args.name) block("Name the worktree after what it carries out, such as plan/<slug> or adr/<number>-<slug>.");
    checkBranch(args.name);
  }

  if (tool !== "Bash") return;
  const command = String(args.command ?? "");
  for (const part of command.split(/&&|\|\||;|\||\n/)) {
    const words = part.trim().split(/\s+/);
    if (words[0] !== "git") continue;

    // New branches: checked when made in a worktree, or with a new worktree from anywhere.
    for (const { name, ifMissing } of branchesCreated(words)) {
      if (!words.includes("worktree") && !inWorktree()) continue;
      if (ifMissing) {
        try {
          git("rev-parse", "--verify", "--quiet", `refs/heads/${name}`);
          continue;
        } catch {
          // No branch by that name yet: git will create it.
        }
      }
      checkBranch(name);
    }

    const at = words.indexOf("push");
    if (at < 0) continue;
    const rest = words.slice(at + 1);
    if (rest.some((w) => /^(-f|--force|--force-with-lease.*|--mirror|--delete|-d)$/.test(w))) {
      block("Force pushes and branch deletes on the remote are for the owner to run.");
    }
    let current = "";
    try {
      current = git("branch", "--show-current");
    } catch {}
    const refs = rest.filter((w) => !w.startsWith("-")).slice(1);
    const pushes = (refs.length > 0 ? refs : ["HEAD"]).map((ref) => {
      const [source, target = source] = ref.replace(/^\+/, "").split(":");
      const branch = target === "HEAD" ? current : target.replace(/^refs\/heads\//, "");
      return { source, branch, tag: target.startsWith("refs/tags/") };
    });

    for (const { source, branch, tag } of pushes) {
      if (tag) continue;
      if (!source) block("Branch deletes on the remote are for the owner to run.");
      if (branch === "main") {
        const deploys =
          "Pushing code to main deploys the live site, so the owner does it. Push a branch and open a pull request.";
        if (inWorktree()) block(`${deploys} From a worktree, docs go through a pull request too.`);
        fetchMain();
        const files = git("log", "--name-only", "--format=", `origin/main..${source}`).split("\n").filter(Boolean);
        if (!isDocsOnly(files)) block(`${deploys} Only docs (docs/, top-level *.md) go straight to main.`);
      } else if (inWorktree()) {
        checkBranch(branch);
      }
    }
  }
}
