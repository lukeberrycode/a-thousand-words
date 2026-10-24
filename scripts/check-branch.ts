// Checks that a branch carries out a plan or an ADR already on `main` (ADR 0021), and that a
// `content/` branch only adds content files (ADR 0026). CI runs it on
// every pull request, whichever checkout or tool made the branch. Usage: npm run check:branch [-- <branch>];
// without a branch, it checks the current one. It reads `origin/main`, so fetch first.

import { execFileSync } from "node:child_process";
import { branchProblem, contentBranchProblem } from "../src/lib/branch-rule";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

const branch = process.argv[2] || git("branch", "--show-current");
const filesOnMain = git("ls-tree", "-r", "--name-only", "origin/main", "--", "docs/plans", "docs/adr").split("\n");
// A content/ branch may only add content files (ADR 0026). CI sets CONTENT_DIFF_BASE to HEAD^1:
// HEAD is the pull request merged into main, so its first parent is the main it was merged into,
// however far main has moved since. Locally it compares with origin/main: fetch and rebase first.
const base = process.env.CONTENT_DIFF_BASE || "origin/main";
const changes = branch.replace(/^worktree-/, "").startsWith("content/")
  ? git("diff", "--name-status", "--no-renames", base, "HEAD").split("\n")
  : [];
const problem = branchProblem(branch, filesOnMain) ?? contentBranchProblem(branch, changes);
if (problem) {
  console.error(problem);
  process.exit(1);
}
console.log(`Branch "${branch}" is allowed.`);
