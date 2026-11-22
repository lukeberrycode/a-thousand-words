// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the functions under test.
import { branchProblem, branchesCreated, isDocsOnly, targetFile } from "./branch-rule";

// The plan and ADR files we pretend are on main.
const onMain = [
  // A plan.
  "docs/plans/commons.md",
  // Another plan.
  "docs/plans/m3-search.md",
  // An ADR.
  "docs/adr/0019-production-secrets.md",
  // Another ADR.
  "docs/adr/0021-agent-rules-by-checkout.md",
  // The ADR index, which isn't an ADR.
  "docs/adr/README.md",
];

// Split a command into words.
const words = (command: string) => command.split(/\s+/);

// Group the tests for the branch check.
describe("branchProblem", () => {
  // Group the tests for exempt prefixes.
  describe("exempt prefixes", () => {
    // Each exempt branch is fine without a plan or ADR.
    it.each(["fix/typo", "docs/readme", "dependabot/npm_and_yarn/next-16.1.0"])(
      // The test's name.
      "allows %s even when nothing is on main",
      // The test itself.
      (branch) => {
        // No problem is reported.
        expect(branchProblem(branch, [])).toBeNull();
      },
    );

    // A bare prefix with nothing after it isn't allowed.
    it.each(["fix/", "docs/", "dependabot/"])("rejects the bare prefix %s", (branch) => {
      // Check the branch.
      const message = branchProblem(branch, onMain);

      // There's a problem...
      expect(message).not.toBeNull();

      // ...and the message names the branch.
      expect(message).toContain(branch);
    });
  });

  // Group the tests for plan branches.
  describe("plan branches", () => {
    // A plan that exists is fine.
    it("allows plan/<slug> when its plan is on main", () => {
      // The first plan.
      expect(branchProblem("plan/commons", onMain)).toBeNull();

      // The second plan.
      expect(branchProblem("plan/m3-search", onMain)).toBeNull();
    });

    // A plan that doesn't exist is refused.
    it("rejects plan/<slug> when its plan is not on main, naming the branch, path and main", () => {
      // Check a branch with no plan.
      const message = branchProblem("plan/missing-plan", onMain);

      // There's a problem.
      expect(message).not.toBeNull();

      // It names the branch.
      expect(message).toContain("plan/missing-plan");

      // It names the missing file.
      expect(message).toContain("docs/plans/missing-plan.md");

      // It mentions main.
      expect(message).toContain("main");
    });

    // An empty list means nothing is on main.
    it("rejects a plan branch when the list is empty", () => {
      // The message names the file it wanted.
      expect(branchProblem("plan/commons", [])).toContain("docs/plans/commons.md");
    });

    // The right file name in the wrong place doesn't count.
    it("does not count a file elsewhere with the same name", () => {
      // Files with the same name in other folders don't satisfy the rule.
      expect(branchProblem("plan/other", ["docs/adr/other.md", "docs/plans/sub/other.md"])).not.toBeNull();
    });
  });

  // Group the tests for ADR branches.
  describe("ADR branches", () => {
    // A number that exists is fine.
    it("allows adr/<number> when an ADR with that number is on main", () => {
      // ADR 0021 is on main.
      expect(branchProblem("adr/0021", onMain)).toBeNull();
    });

    // The slug can be anything.
    it("allows adr/<number>-<slug> even if the slug differs from the file's", () => {
      // The file's own slug.
      expect(branchProblem("adr/0021-agent-rules-by-checkout", onMain)).toBeNull();

      // A different slug.
      expect(branchProblem("adr/0021-something-else", onMain)).toBeNull();
    });

    // A number that doesn't exist is refused.
    it("rejects an ADR number that is not on main, naming the branch", () => {
      // Check a branch with no ADR.
      const message = branchProblem("adr/0022-new-thing", onMain);

      // There's a problem.
      expect(message).not.toBeNull();

      // It names the branch.
      expect(message).toContain("adr/0022-new-thing");
    });

    // An empty list means nothing is on main.
    it("rejects an ADR branch when the list is empty", () => {
      // There's a problem.
      expect(branchProblem("adr/0021", [])).not.toBeNull();
    });

    // Numbers must have exactly four digits.
    it("rejects a number that is not four digits", () => {
      // Too short.
      expect(branchProblem("adr/21", onMain)).not.toBeNull();

      // Still too short.
      expect(branchProblem("adr/021", onMain)).not.toBeNull();

      // Too long, even with a matching file.
      expect(branchProblem("adr/00021", ["docs/adr/00021-x.md"])).not.toBeNull();
    });
  });

  // Group the tests for names that match no rule.
  describe("other names", () => {
    // Each of these is refused, and the message explains the options.
    it.each(["feature-x", "graphql-api", "main-fix", "plan/Commons", "plan/a/b", "plan/", "adr/"])(
      // The test's name.
      "rejects %s and lists the naming options",
      // The test itself.
      (branch) => {
        // Check the branch, even with files that look close.
        const message = branchProblem(branch, [...onMain, "docs/plans/Commons.md", "docs/plans/a/b.md"]);

        // There's a problem.
        expect(message).not.toBeNull();

        // It names the branch in quotes.
        expect(message).toContain(`"${branch}"`);

        // It lists the plan option.
        expect(message).toContain("plan/");

        // It lists the ADR option.
        expect(message).toContain("adr/");

        // It lists the fix option.
        expect(message).toContain("fix/");

        // It lists the docs option.
        expect(message).toContain("docs/");

        // It lists the Dependabot option.
        expect(message).toContain("dependabot/");
      },
    );
  });

  // Group the tests for Claude Code's worktree branch names.
  describe("EnterWorktree names", () => {
    // The prefix is ignored for exempt branches.
    it("ignores a leading worktree- for exempt prefixes", () => {
      // A fix branch with the prefix is fine.
      expect(branchProblem("worktree-fix/x", [])).toBeNull();
    });

    // The prefix is ignored for plan branches.
    it("applies the plan rule after worktree-", () => {
      // A plan that exists is fine.
      expect(branchProblem("worktree-plan/commons", onMain)).toBeNull();

      // Check a plan that doesn't exist.
      const message = branchProblem("worktree-plan/foo", onMain);

      // There's a problem.
      expect(message).not.toBeNull();

      // It names the missing file.
      expect(message).toContain("docs/plans/foo.md");
    });

    // The prefix is ignored for ADR branches.
    it("applies the ADR rule after worktree-", () => {
      // An ADR that exists is fine.
      expect(branchProblem("worktree-adr/0021", onMain)).toBeNull();

      // One that doesn't is refused.
      expect(branchProblem("worktree-adr/0099", onMain)).not.toBeNull();
    });

    // Other names stay refused.
    it("rejects worktree-<other>", () => {
      // A name that fits no rule is refused.
      expect(branchProblem("worktree-feature-x", onMain)).not.toBeNull();
    });
  });
});

// Group the tests for the docs-only check.
describe("isDocsOnly", () => {
  // Docs and top-level Markdown count.
  it("is true for files under docs/ and top-level Markdown", () => {
    // An ADR, a plan and the README.
    expect(isDocsOnly(["docs/adr/0021-x.md", "docs/plans/foo.md", "README.md"])).toBe(true);
  });

  // The agent's own rules don't count as docs.
  it.each([["CLAUDE.md"], ["AGENTS.md"]])("is false for the agent's rules, %s", (file) => {
    // Even next to a docs file.
    expect(isDocsOnly(["docs/one-pager.md", file])).toBe(false);
  });

  // Any file type under docs/ counts.
  it("is true for non-Markdown files under docs/", () => {
    // An image under docs/.
    expect(isDocsOnly(["docs/images/diagram.png"])).toBe(true);
  });

  // Code and other files don't count.
  it.each([["src/app/page.tsx"], [".claude/agents/x.md"], ["package.json"], ["src/lib/notes.md"]])(
    // The test's name.
    "is false for %s",
    // The test itself.
    (file) => {
      // This file alone isn't docs.
      expect(isDocsOnly([file])).toBe(false);
    },
  );

  // One code file spoils the lot.
  it("is false for a mix of docs and code", () => {
    // A doc and a source file.
    expect(isDocsOnly(["docs/one-pager.md", "src/lib/branch-rule.ts"])).toBe(false);
  });

  // The folder must be at the top level.
  it("does not treat a path that merely contains docs/ as docs", () => {
    // `src/docs/` isn't `docs/`.
    expect(isDocsOnly(["src/docs/x.md"])).toBe(false);
  });
});

// Group the tests for finding created branches.
describe("branchesCreated", () => {
  // The result for a created branch.
  const created = (name: string, ifMissing = false) => [{ name, ifMissing }];

  // Group the tests for `git switch`.
  describe("git switch", () => {
    // Each creating form.
    it.each(["git switch -c x", "git switch -C x", "git switch --create x", "git switch --create=x"])(
      // The test's name.
      "%s creates x",
      // The test itself.
      (command) => {
        // The branch x is created.
        expect(branchesCreated(words(command))).toEqual(created("x"));
      },
    );

    // Plain switching creates nothing.
    it("git switch x creates nothing", () => {
      // No branch is created.
      expect(branchesCreated(words("git switch x"))).toEqual([]);
    });
  });

  // Group the tests for `git checkout`.
  describe("git checkout", () => {
    // Each creating form.
    it.each(["git checkout -b x", "git checkout -B x"])("%s creates x", (command) => {
      // The branch x is created.
      expect(branchesCreated(words(command))).toEqual(created("x"));
    });

    // Plain checkout creates nothing.
    it("git checkout x creates nothing", () => {
      // No branch is created.
      expect(branchesCreated(words("git checkout x"))).toEqual([]);
    });
  });

  // Group the tests for `git branch`.
  describe("git branch", () => {
    // Each creating form.
    it.each(["git branch x", "git branch x main", "git branch -f x"])("%s creates x", (command) => {
      // The branch x is created.
      expect(branchesCreated(words(command))).toEqual(created("x"));
    });

    // Listing, deleting, renaming create nothing.
    it.each(["git branch", "git branch -d x", "git branch -m a b", "git branch --list"])(
      // The test's name.
      "%s creates nothing",
      // The test itself.
      (command) => {
        // No branch is created.
        expect(branchesCreated(words(command))).toEqual([]);
      },
    );
  });

  // Group the tests for `git worktree add`.
  describe("git worktree add", () => {
    // An explicit new branch.
    it("with -b creates that branch unconditionally", () => {
      // The branch x is created, whether or not it exists.
      expect(branchesCreated(words("git worktree add -b x ../path"))).toEqual(created("x"));
    });

    // Only a path: the folder's name is used.
    it("with only a path creates a branch named after the folder, if missing", () => {
      // The branch foo is created only if it's missing.
      expect(branchesCreated(words("git worktree add ../foo"))).toEqual(created("foo", true));
    });

    // A path and a branch: the branch is checked out.
    it("with a path and an existing branch creates nothing", () => {
      // No branch is created.
      expect(branchesCreated(words("git worktree add ../foo existing"))).toEqual([]);
    });

    // Detached: no branch at all.
    it("with --detach creates nothing", () => {
      // No branch is created.
      expect(branchesCreated(words("git worktree add --detach ../foo"))).toEqual([]);
    });
  });

  // Options before the subcommand are skipped.
  it("skips global options before the subcommand", () => {
    // `-C some/dir` is skipped, and the branch is found.
    expect(branchesCreated(words("git -C some/dir switch -c x"))).toEqual(created("x"));
  });

  // Commands that aren't git are ignored.
  it.each(["npm test", "ls -b x", "echo git switch -c x"])("ignores the non-git command %s", (command) => {
    // No branch is created.
    expect(branchesCreated(words(command))).toEqual([]);
  });

  // An empty command is fine.
  it("returns nothing for an empty command", () => {
    // No words, no branch.
    expect(branchesCreated([])).toEqual([]);
  });
});

// Group the tests for finding a branch's target file.
describe("targetFile", () => {
  // The files we pretend are on main.
  const onMain = ["docs/plans/agent-implement.md", "docs/adr/0022-no-links-in-annotations.md", "docs/adr/README.md"];

  // A plan branch finds its plan.
  it("finds the plan a plan/ branch carries out", () => {
    // The plan's path is returned.
    expect(targetFile("plan/agent-implement", onMain)).toBe("docs/plans/agent-implement.md");
  });

  // An ADR branch finds its ADR by number.
  it("finds an ADR by its number, whatever the branch's slug", () => {
    // The ADR's own slug.
    expect(targetFile("adr/0022-no-links-in-annotations", onMain)).toBe("docs/adr/0022-no-links-in-annotations.md");

    // Any other slug.
    expect(targetFile("adr/0022-anything", onMain)).toBe("docs/adr/0022-no-links-in-annotations.md");

    // No slug at all.
    expect(targetFile("adr/0022", onMain)).toBe("docs/adr/0022-no-links-in-annotations.md");
  });

  // The worktree prefix is ignored.
  it("ignores the worktree- prefix", () => {
    // The plan is still found.
    expect(targetFile("worktree-plan/agent-implement", onMain)).toBe("docs/plans/agent-implement.md");
  });

  // No file, no result.
  it("gives null when the file isn't on main, or the branch names nothing", () => {
    // Try branches that point at nothing.
    for (const branch of ["plan/missing", "adr/0099-x", "fix/typo", "docs/readme", "feature/x", "adr/22-x"]) {
      // Each gives null.
      expect(targetFile(branch, onMain)).toBeNull();
    }
  });
});
