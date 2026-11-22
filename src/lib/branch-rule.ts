// Which branches may exist (ADR 0021): a branch carries out a plan or an ADR that's already on
// `main`, or it's a fix, a docs change or a Dependabot update. These are the pure parts:
// .claude/hooks/guard.mjs and scripts/check-branch.ts ask git what's on `main`. Node loads this
// file in the hook without a build step, so it uses only types that can be stripped.

/** Branches that need no plan or ADR. */
export const EXEMPT_PREFIXES = ["fix/", "docs/", "dependabot/"];

// Claude Code's EnterWorktree tool names a worktree's branch `worktree-<name>`.
const WORKTREE_PREFIX = "worktree-";

/**
 * What a branch carries out, from its name alone: a plan (`plan/<slug>` → `docs/plans/<slug>.md`),
 * an ADR (`adr/<number>[-<slug>]` → files starting `docs/adr/<number>-`), or nothing it names
 * (null). Exempt branches and badly formed names give null too.
 */
export function branchTarget(branch: string): { kind: "plan"; path: string } | { kind: "adr"; prefix: string } | null {
  // Remove the worktree prefix, if there is one.
  const name = branch.startsWith(WORKTREE_PREFIX) ? branch.slice(WORKTREE_PREFIX.length) : branch;

  // Try to read the name as `plan/<slug>`.
  const plan = /^plan\/([a-z0-9][a-z0-9-]*)$/.exec(name);

  // If it matches, the target is that plan's file.
  if (plan) return { kind: "plan", path: `docs/plans/${plan[1]}.md` };

  // Try to read the name as `adr/<four digits>[-<slug>]`.
  const adr = /^adr\/(\d{4})(-[a-z0-9-]+)?$/.exec(name);

  // If it matches, the target is any ADR file starting with that number.
  if (adr) return { kind: "adr", prefix: `docs/adr/${adr[1]}-` };

  // Otherwise the name doesn't point at anything.
  return null;
}

/** The file on `main` that a branch carries out, or null if there isn't one. */
export function targetFile(branch: string, filesOnMain: readonly string[]): string | null {
  // Work out what the branch name points at.
  const target = branchTarget(branch);

  // For a plan, the exact file must be on main.
  if (target?.kind === "plan") return filesOnMain.includes(target.path) ? target.path : null;

  // For an ADR, some Markdown file with the right prefix must be on main.
  if (target?.kind === "adr") {
    // Return the first matching file, or null.
    return filesOnMain.find((file) => file.startsWith(target.prefix) && file.endsWith(".md")) ?? null;
  }

  // The branch names no target.
  return null;
}

/**
 * Why `branch` can't be created or pushed, or null if it can. `filesOnMain` lists the files under
 * docs/plans and docs/adr on `main`.
 */
export function branchProblem(branch: string, filesOnMain: readonly string[]): string | null {
  // Remove the worktree prefix, if there is one.
  const name = branch.startsWith(WORKTREE_PREFIX) ? branch.slice(WORKTREE_PREFIX.length) : branch;

  // Exempt prefixes are fine, as long as something follows them.
  if (EXEMPT_PREFIXES.some((prefix) => name.startsWith(prefix) && name.length > prefix.length)) return null;

  // Work out what the branch name points at.
  const target = branchTarget(branch);

  // If the target exists on main, the branch is fine.
  if (target && targetFile(branch, filesOnMain)) return null;

  // A plan that isn't on main.
  if (target?.kind === "plan") {
    // Explain what to do.
    return `Branch "${branch}" carries out ${target.path}, which isn't on main. Put the plan on main first (ADR 0021).`;
  }

  // An ADR that isn't on main.
  if (target?.kind === "adr") {
    // Pull the number out of the prefix.
    const number = target.prefix.slice("docs/adr/".length, -1);

    // Explain what to do.
    return `Branch "${branch}" carries out ADR ${number}, which isn't on main. Put the ADR on main first (ADR 0021).`;
  }

  // A name that points at nothing: explain the naming rules.
  return (
    // Say what's wrong, and the plan and ADR forms...
    `Branch "${branch}" doesn't say what it carries out. Name it plan/<slug> for docs/plans/<slug>.md, ` +
    // ...then the exempt prefixes...
    `adr/<number>-<slug> for an ADR, or start it with ${EXEMPT_PREFIXES.join(", ")}. ` +
    // ...and the reminder that the plan or ADR must come first.
    "The plan or ADR must already be on main (ADR 0021)."
  );
}

// The agent's own rules: a change to them goes through review, like code.
const AGENT_RULES = ["CLAUDE.md", "AGENTS.md"];

/**
 * True if a push changes only docs: anything under docs/, or a Markdown file at the top level other
 * than the agent's rules.
 */
export function isDocsOnly(files: readonly string[]) {
  // Every file must be under docs/, or a top-level Markdown file that isn't one of the agent's rules.
  return files.every((file) => file.startsWith("docs/") || (/^[^/]+\.md$/.test(file) && !AGENT_RULES.includes(file)));
}

/** A branch a git command creates. `ifMissing`: only if no branch has that name yet. */
export type NewBranch = { name: string; ifMissing: boolean };

/**
 * The branches one git command creates, from its words (`["git", "switch", "-c", "x"]`). Covers
 * `switch -c`, `checkout -b`, `branch <name>` and `worktree add`, which is enough to catch
 * mistakes; CI checks every pull request's branch whatever made it.
 */
export function branchesCreated(words: readonly string[]): NewBranch[] {
  // Anything that isn't a git command creates nothing.
  if (words[0] !== "git") return [];

  // Our position in the words, just after "git".
  let at = 1;

  // Options before the subcommand; -C and -c take a value.
  while (at < words.length && words[at].startsWith("-")) at += words[at] === "-C" || words[at] === "-c" ? 2 : 1;

  // The subcommand, such as "switch".
  const command = words[at];

  // Everything after the subcommand.
  const args = words.slice(at + 1);

  // Find the value that follows any of the given flags.
  const valueOf = (flags: string[]) => {
    // Check each argument in turn.
    for (let i = 0; i < args.length; i++) {
      // A flag followed by its value, as separate words.
      if (flags.includes(args[i])) return args[i + 1];

      // A long flag written as `--flag=value`.
      const long = flags.find((flag) => flag.startsWith("--") && args[i].startsWith(`${flag}=`));

      // Return what follows the equals sign.
      if (long) return args[i].slice(long.length + 1);
    }

    // No such flag.
    return undefined;
  };

  // Turn a name into a one-item result, or an empty one if there's no name.
  const created = (name: string | undefined, ifMissing = false) => (name ? [{ name, ifMissing }] : []);

  // `git switch -c <name>` and its variants.
  if (command === "switch") return created(valueOf(["-c", "-C", "--create", "--force-create", "--orphan"]));

  // `git checkout -b <name>` and its variants.
  if (command === "checkout") return created(valueOf(["-b", "-B", "--orphan"]));

  // `git branch <name>`.
  if (command === "branch") {
    // Any other option lists, deletes, renames or copies branches.
    if (args.some((arg) => arg.startsWith("-") && !["-f", "--force", "-t", "--track", "--no-track"].includes(arg))) {
      // So nothing is created.
      return [];
    }

    // The first non-option word is the new branch's name.
    return created(args.find((arg) => !arg.startsWith("-")));
  }

  // `git worktree add ...`.
  if (command === "worktree" && args[0] === "add") {
    // The words after `add`.
    const rest = args.slice(1);

    // Find an explicit new-branch flag.
    const flag = rest.findIndex((arg) => arg === "-b" || arg === "-B");

    // If there is one, the word after it names the branch.
    if (flag >= 0) return created(rest[flag + 1]);

    // A detached worktree creates no branch.
    if (rest.some((arg) => arg === "-d" || arg === "--detach")) return [];

    // The path words: not options, and not the value after `--reason`.
    const paths = rest.filter((arg, i) => !arg.startsWith("-") && rest[i - 1] !== "--reason");

    // `git worktree add <path>` checks out a branch named after the folder, creating it if needed.
    if (paths.length === 1) return created(paths[0].replace(/\/+$/, "").split("/").pop(), true);
  }

  // Nothing else creates a branch.
  return [];
}
