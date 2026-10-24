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

  if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
    const name = basename(args.file_path ?? args.notebook_path ?? "");
    if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") {
      block(`${name} holds secrets: edit it by hand, not through Claude. Document new variables in .env.example.`);
    }
    if (name === "package-lock.json") block("Change package-lock.json through npm (npm install), not by editing it.");
    return;
  }

  // Loaded only for git and EnterWorktree, so a broken branch-rule.ts can still be fixed with Edit.
  let rule;
  const loadRule = async () => (rule ??= await import(new URL("../../src/lib/branch-rule.ts", import.meta.url)));

  // Each git call is short, and main is fetched at most once, so the hook stays inside its timeout.
  const git = (...gitArgs) =>
    execFileSync("git", gitArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
  let fetched = false;
  const fetchMain = () => {
    if (fetched) return;
    fetched = true;
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
    if (!rule.branchProblem(name, [])) return; // Exempt: fix/, docs/, dependabot/.
    const filesOnMain = () => {
      try {
        return git("ls-tree", "-r", "--full-tree", "--name-only", "origin/main", "--", "docs/plans", "docs/adr").split(
          "\n",
        );
      } catch {
        return [];
      }
    };
    if (!rule.branchProblem(name, filesOnMain())) return;
    fetchMain();
    const problem = rule.branchProblem(name, filesOnMain());
    if (problem) block(problem);
  };

  // A new worktree gets a new branch, named after the worktree.
  if (tool === "EnterWorktree" && !args.path) {
    if (!args.name) block("Name the worktree after what it carries out, such as plan/<slug> or adr/<number>-<slug>.");
    await loadRule();
    checkBranch(args.name);
  }

  if (tool !== "Bash") return;
  const command = String(args.command ?? "");
  // A command that moves to another directory runs git somewhere the checks below don't look.
  const movesDirectory = /(^|[;&|(\s])(cd|pushd)\s/.test(command);
  for (const part of command.split(/&&|\|\||;|\||\n/)) {
    const words = part.trim().split(/\s+/);
    if (words[0] !== "git") continue;
    await loadRule();
    const elsewhere =
      movesDirectory || words.some((w) => /^(-C|--git-dir|--work-tree)(=.*)?$/.test(w) || /^-C./.test(w));

    // New branches: checked when made in a worktree, or with a new worktree from anywhere.
    for (const { name, ifMissing } of rule.branchesCreated(words)) {
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
    if (rest.some((w) => /^(-f|--force|--force-with-lease.*|--force-if-includes|--mirror|--delete|-d|\+.*)$/.test(w))) {
      block("Force pushes and branch deletes on the remote are for the owner to run.");
    }
    if (rest.some((w) => /^(--all|--branches)$/.test(w))) {
      block("Push one branch at a time: --all would push main too.");
    }
    let current = "";
    try {
      current = git("branch", "--show-current");
    } catch {}
    // Positional words, skipping the values of options that take one. The first is the remote.
    const positional = rest.filter(
      (w, i) => !w.startsWith("-") && !/^(-o|--push-option|--repo|--receive-pack|--exec)$/.test(rest[i - 1] ?? ""),
    );
    const refs = positional.slice(1);
    if (elsewhere && refs.length === 0) block("Name the branch to push when running git push in another directory.");
    const pushes = (refs.length > 0 ? refs : ["HEAD"]).map((ref) => {
      const [source, target = source] = ref.split(":");
      const branch = target === "HEAD" ? current : target.replace(/^refs\/heads\//, "");
      let tag = target.startsWith("refs/tags/");
      if (!tag && !ref.includes(":")) {
        try {
          git("rev-parse", "--verify", "--quiet", `refs/tags/${target}`);
          tag = true;
        } catch {}
      }
      return { source, branch, tag };
    });

    for (const { source, branch, tag } of pushes) {
      if (tag) continue;
      if (!source) block("Branch deletes on the remote are for the owner to run.");
      const deploys =
        "Pushing code to main deploys the live site, so the owner does it. Push a branch and open a pull request.";
      if (branch === "main" || (elsewhere && /(^|:)(refs\/heads\/)?main$/.test(source))) {
        if (inWorktree()) block(`${deploys} From a worktree, docs go through a pull request too.`);
        if (elsewhere) block(`${deploys} To push docs to main, run git push from the main checkout, without cd or -C.`);
        fetchMain();
        // No rename detection: a file moved from src/ into docs/ is a code change.
        const files = git("diff", "--no-renames", "--name-only", `origin/main...${source}`).split("\n").filter(Boolean);
        if (files.length === 0 || !rule.isDocsOnly(files)) {
          block(
            `${deploys} Only docs (docs/, and top-level *.md other than CLAUDE.md and AGENTS.md) go straight to main.`,
          );
        }
      } else if (inWorktree() && !elsewhere) {
        checkBranch(branch);
      }
    }
  }
}
