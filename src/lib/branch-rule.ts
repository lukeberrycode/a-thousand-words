// Which branches may exist (ADR 0021): a branch carries out a plan or an ADR that's already on
// `main`, or it's a fix, a docs change or a Dependabot update. These are the pure parts:
// .claude/hooks/guard.mjs and scripts/check-branch.ts ask git what's on `main`. Node loads this
// file in the hook without a build step, so it uses only types that can be stripped.

/** Branches that need no plan or ADR. */
export const EXEMPT_PREFIXES = ["fix/", "docs/", "dependabot/"];

// Claude Code's EnterWorktree tool names a worktree's branch `worktree-<name>`.
const WORKTREE_PREFIX = "worktree-";

/**
 * Why `branch` can't be created or pushed, or null if it can. `filesOnMain` lists the files under
 * docs/plans and docs/adr on `main`.
 */
export function branchProblem(branch: string, filesOnMain: readonly string[]): string | null {
  const name = branch.startsWith(WORKTREE_PREFIX) ? branch.slice(WORKTREE_PREFIX.length) : branch;
  if (EXEMPT_PREFIXES.some((prefix) => name.startsWith(prefix) && name.length > prefix.length)) return null;

  const plan = /^plan\/([a-z0-9][a-z0-9-]*)$/.exec(name);
  if (plan) {
    const path = `docs/plans/${plan[1]}.md`;
    if (filesOnMain.includes(path)) return null;
    return `Branch "${branch}" carries out ${path}, which isn't on main. Put the plan on main first (ADR 0021).`;
  }

  const adr = /^adr\/(\d{4})(-[a-z0-9-]+)?$/.exec(name);
  if (adr) {
    const prefix = `docs/adr/${adr[1]}-`;
    if (filesOnMain.some((file) => file.startsWith(prefix) && file.endsWith(".md"))) return null;
    return `Branch "${branch}" carries out ADR ${adr[1]}, which isn't on main. Put the ADR on main first (ADR 0021).`;
  }

  return (
    `Branch "${branch}" doesn't say what it carries out. Name it plan/<slug> for docs/plans/<slug>.md, ` +
    `adr/<number>-<slug> for an ADR, or start it with ${EXEMPT_PREFIXES.join(", ")}. ` +
    "The plan or ADR must already be on main (ADR 0021)."
  );
}

/** True if a push changes only docs: anything under docs/, or a Markdown file at the top level. */
export function isDocsOnly(files: readonly string[]) {
  return files.every((file) => file.startsWith("docs/") || /^[^/]+\.md$/.test(file));
}

/** A branch a git command creates. `ifMissing`: only if no branch has that name yet. */
export type NewBranch = { name: string; ifMissing: boolean };

/**
 * The branches one git command creates, from its words (`["git", "switch", "-c", "x"]`). Covers
 * `switch -c`, `checkout -b`, `branch <name>` and `worktree add`, which is enough to catch
 * mistakes; CI checks every pull request's branch whatever made it.
 */
export function branchesCreated(words: readonly string[]): NewBranch[] {
  if (words[0] !== "git") return [];
  let at = 1;
  // Options before the subcommand; -C and -c take a value.
  while (at < words.length && words[at].startsWith("-")) at += words[at] === "-C" || words[at] === "-c" ? 2 : 1;
  const command = words[at];
  const args = words.slice(at + 1);
  const valueOf = (flags: string[]) => {
    for (let i = 0; i < args.length; i++) {
      if (flags.includes(args[i])) return args[i + 1];
      const long = flags.find((flag) => flag.startsWith("--") && args[i].startsWith(`${flag}=`));
      if (long) return args[i].slice(long.length + 1);
    }
    return undefined;
  };
  const created = (name: string | undefined, ifMissing = false) => (name ? [{ name, ifMissing }] : []);

  if (command === "switch") return created(valueOf(["-c", "-C", "--create", "--force-create", "--orphan"]));
  if (command === "checkout") return created(valueOf(["-b", "-B", "--orphan"]));
  if (command === "branch") {
    // Any other option lists, deletes, renames or copies branches.
    if (args.some((arg) => arg.startsWith("-") && !["-f", "--force", "-t", "--track", "--no-track"].includes(arg))) {
      return [];
    }
    return created(args.find((arg) => !arg.startsWith("-")));
  }
  if (command === "worktree" && args[0] === "add") {
    const rest = args.slice(1);
    const flag = rest.findIndex((arg) => arg === "-b" || arg === "-B");
    if (flag >= 0) return created(rest[flag + 1]);
    if (rest.some((arg) => arg === "-d" || arg === "--detach")) return [];
    const paths = rest.filter((arg, i) => !arg.startsWith("-") && rest[i - 1] !== "--reason");
    // `git worktree add <path>` checks out a branch named after the folder, creating it if needed.
    if (paths.length === 1) return created(paths[0].replace(/\/+$/, "").split("/").pop(), true);
  }
  return [];
}
