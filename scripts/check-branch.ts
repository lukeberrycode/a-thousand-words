// Checks that a branch carries out a plan or an ADR already on `main` (ADR 0021). CI runs it on
// every pull request, whichever checkout or tool made the branch. Usage: npm run check:branch [-- <branch>];
// without a branch, it checks the current one. It reads `origin/main`, so fetch first.

import { execFileSync } from "node:child_process";
import { branchProblem } from "../src/lib/branch-rule";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

const branch = process.argv[2] || git("branch", "--show-current");
const filesOnMain = git("ls-tree", "-r", "--name-only", "origin/main", "--", "docs/plans", "docs/adr").split("\n");
const problem = branchProblem(branch, filesOnMain);
if (problem) {
  console.error(problem);
  process.exit(1);
}
console.log(`Branch "${branch}" is allowed.`);
