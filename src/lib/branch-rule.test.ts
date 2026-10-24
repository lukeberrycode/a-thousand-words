import { describe, expect, it } from "vitest";
import { branchProblem, branchesCreated, isDocsOnly, targetFile } from "./branch-rule";

const onMain = [
  "docs/plans/commons.md",
  "docs/plans/m3-search.md",
  "docs/adr/0019-production-secrets.md",
  "docs/adr/0021-agent-rules-by-checkout.md",
  "docs/adr/README.md",
];

const words = (command: string) => command.split(/\s+/);

describe("branchProblem", () => {
  describe("exempt prefixes", () => {
    it.each(["fix/typo", "docs/readme", "content/dutch-golden-age", "dependabot/npm_and_yarn/next-16.1.0"])(
      "allows %s even when nothing is on main",
      (branch) => {
        expect(branchProblem(branch, [])).toBeNull();
      },
    );

    it("allows a content branch made by EnterWorktree", () => {
      expect(branchProblem("worktree-content/dutch-golden-age", [])).toBeNull();
    });

    it.each(["fix/", "docs/", "content/", "dependabot/"])("rejects the bare prefix %s", (branch) => {
      const message = branchProblem(branch, onMain);
      expect(message).not.toBeNull();
      expect(message).toContain(branch);
    });
  });

  describe("plan branches", () => {
    it("allows plan/<slug> when its plan is on main", () => {
      expect(branchProblem("plan/commons", onMain)).toBeNull();
      expect(branchProblem("plan/m3-search", onMain)).toBeNull();
    });

    it("rejects plan/<slug> when its plan is not on main, naming the branch, path and main", () => {
      const message = branchProblem("plan/missing-plan", onMain);
      expect(message).not.toBeNull();
      expect(message).toContain("plan/missing-plan");
      expect(message).toContain("docs/plans/missing-plan.md");
      expect(message).toContain("main");
    });

    it("rejects a plan branch when the list is empty", () => {
      expect(branchProblem("plan/commons", [])).toContain("docs/plans/commons.md");
    });

    it("does not count a file elsewhere with the same name", () => {
      expect(branchProblem("plan/other", ["docs/adr/other.md", "docs/plans/sub/other.md"])).not.toBeNull();
    });
  });

  describe("ADR branches", () => {
    it("allows adr/<number> when an ADR with that number is on main", () => {
      expect(branchProblem("adr/0021", onMain)).toBeNull();
    });

    it("allows adr/<number>-<slug> even if the slug differs from the file's", () => {
      expect(branchProblem("adr/0021-agent-rules-by-checkout", onMain)).toBeNull();
      expect(branchProblem("adr/0021-something-else", onMain)).toBeNull();
    });

    it("rejects an ADR number that is not on main, naming the branch", () => {
      const message = branchProblem("adr/0022-new-thing", onMain);
      expect(message).not.toBeNull();
      expect(message).toContain("adr/0022-new-thing");
    });

    it("rejects an ADR branch when the list is empty", () => {
      expect(branchProblem("adr/0021", [])).not.toBeNull();
    });

    it("rejects a number that is not four digits", () => {
      expect(branchProblem("adr/21", onMain)).not.toBeNull();
      expect(branchProblem("adr/021", onMain)).not.toBeNull();
      expect(branchProblem("adr/00021", ["docs/adr/00021-x.md"])).not.toBeNull();
    });
  });

  describe("other names", () => {
    it.each(["feature-x", "graphql-api", "main-fix", "plan/Commons", "plan/a/b", "plan/", "adr/"])(
      "rejects %s and lists the naming options",
      (branch) => {
        const message = branchProblem(branch, [...onMain, "docs/plans/Commons.md", "docs/plans/a/b.md"]);
        expect(message).not.toBeNull();
        expect(message).toContain(`"${branch}"`);
        expect(message).toContain("plan/");
        expect(message).toContain("adr/");
        expect(message).toContain("fix/");
        expect(message).toContain("docs/");
        expect(message).toContain("content/");
        expect(message).toContain("dependabot/");
      },
    );
  });

  describe("EnterWorktree names", () => {
    it("ignores a leading worktree- for exempt prefixes", () => {
      expect(branchProblem("worktree-fix/x", [])).toBeNull();
    });

    it("applies the plan rule after worktree-", () => {
      expect(branchProblem("worktree-plan/commons", onMain)).toBeNull();
      const message = branchProblem("worktree-plan/foo", onMain);
      expect(message).not.toBeNull();
      expect(message).toContain("docs/plans/foo.md");
    });

    it("applies the ADR rule after worktree-", () => {
      expect(branchProblem("worktree-adr/0021", onMain)).toBeNull();
      expect(branchProblem("worktree-adr/0099", onMain)).not.toBeNull();
    });

    it("rejects worktree-<other>", () => {
      expect(branchProblem("worktree-feature-x", onMain)).not.toBeNull();
    });
  });
});

describe("isDocsOnly", () => {
  it("is true for files under docs/ and top-level Markdown", () => {
    expect(isDocsOnly(["docs/adr/0021-x.md", "docs/plans/foo.md", "README.md"])).toBe(true);
  });

  it.each([["CLAUDE.md"], ["AGENTS.md"]])("is false for the agent's rules, %s", (file) => {
    expect(isDocsOnly(["docs/one-pager.md", file])).toBe(false);
  });

  it("is true for non-Markdown files under docs/", () => {
    expect(isDocsOnly(["docs/images/diagram.png"])).toBe(true);
  });

  it.each([["src/app/page.tsx"], [".claude/agents/x.md"], ["package.json"], ["src/lib/notes.md"]])(
    "is false for %s",
    (file) => {
      expect(isDocsOnly([file])).toBe(false);
    },
  );

  it("is false for a mix of docs and code", () => {
    expect(isDocsOnly(["docs/one-pager.md", "src/lib/branch-rule.ts"])).toBe(false);
  });

  it("does not treat a path that merely contains docs/ as docs", () => {
    expect(isDocsOnly(["src/docs/x.md"])).toBe(false);
  });
});

describe("branchesCreated", () => {
  const created = (name: string, ifMissing = false) => [{ name, ifMissing }];

  describe("git switch", () => {
    it.each(["git switch -c x", "git switch -C x", "git switch --create x", "git switch --create=x"])(
      "%s creates x",
      (command) => {
        expect(branchesCreated(words(command))).toEqual(created("x"));
      },
    );

    it("git switch x creates nothing", () => {
      expect(branchesCreated(words("git switch x"))).toEqual([]);
    });
  });

  describe("git checkout", () => {
    it.each(["git checkout -b x", "git checkout -B x"])("%s creates x", (command) => {
      expect(branchesCreated(words(command))).toEqual(created("x"));
    });

    it("git checkout x creates nothing", () => {
      expect(branchesCreated(words("git checkout x"))).toEqual([]);
    });
  });

  describe("git branch", () => {
    it.each(["git branch x", "git branch x main", "git branch -f x"])("%s creates x", (command) => {
      expect(branchesCreated(words(command))).toEqual(created("x"));
    });

    it.each(["git branch", "git branch -d x", "git branch -m a b", "git branch --list"])(
      "%s creates nothing",
      (command) => {
        expect(branchesCreated(words(command))).toEqual([]);
      },
    );
  });

  describe("git worktree add", () => {
    it("with -b creates that branch unconditionally", () => {
      expect(branchesCreated(words("git worktree add -b x ../path"))).toEqual(created("x"));
    });

    it("with only a path creates a branch named after the folder, if missing", () => {
      expect(branchesCreated(words("git worktree add ../foo"))).toEqual(created("foo", true));
    });

    it("with a path and an existing branch creates nothing", () => {
      expect(branchesCreated(words("git worktree add ../foo existing"))).toEqual([]);
    });

    it("with --detach creates nothing", () => {
      expect(branchesCreated(words("git worktree add --detach ../foo"))).toEqual([]);
    });
  });

  it("skips global options before the subcommand", () => {
    expect(branchesCreated(words("git -C some/dir switch -c x"))).toEqual(created("x"));
  });

  it.each(["npm test", "ls -b x", "echo git switch -c x"])("ignores the non-git command %s", (command) => {
    expect(branchesCreated(words(command))).toEqual([]);
  });

  it("returns nothing for an empty command", () => {
    expect(branchesCreated([])).toEqual([]);
  });
});

describe("targetFile", () => {
  const onMain = ["docs/plans/agent-implement.md", "docs/adr/0022-no-links-in-annotations.md", "docs/adr/README.md"];

  it("finds the plan a plan/ branch carries out", () => {
    expect(targetFile("plan/agent-implement", onMain)).toBe("docs/plans/agent-implement.md");
  });

  it("finds an ADR by its number, whatever the branch's slug", () => {
    expect(targetFile("adr/0022-no-links-in-annotations", onMain)).toBe("docs/adr/0022-no-links-in-annotations.md");
    expect(targetFile("adr/0022-anything", onMain)).toBe("docs/adr/0022-no-links-in-annotations.md");
    expect(targetFile("adr/0022", onMain)).toBe("docs/adr/0022-no-links-in-annotations.md");
  });

  it("ignores the worktree- prefix", () => {
    expect(targetFile("worktree-plan/agent-implement", onMain)).toBe("docs/plans/agent-implement.md");
  });

  it("gives null when the file isn't on main, or the branch names nothing", () => {
    for (const branch of [
      "plan/missing",
      "adr/0099-x",
      "fix/typo",
      "docs/readme",
      "content/x",
      "feature/x",
      "adr/22-x",
    ]) {
      expect(targetFile(branch, onMain)).toBeNull();
    }
  });
});
