import { describe, expect, it } from "vitest";
import {
  MAIN_DATABASE,
  MAIN_PORT,
  checkoutPort,
  databaseName,
  devPort,
  withDatabaseUrl,
  withEnvValues,
  worktreeName,
  type PortKind,
} from "./worktree";

const names = ["graphql", "fix-upload", "review-pr-23", "isolation", "search", "agent-a1b2c3"];

describe("devPort", () => {
  it("keeps port 3000 for the main checkout", () => {
    expect(MAIN_PORT).toBe(3000);
    expect(devPort(null)).toBe(3000);
  });

  it("gives the same name the same port every time", () => {
    for (const name of names) expect(devPort(name)).toBe(devPort(name));
  });

  // Pinned so a change to the hash is caught: changing it moves every existing worktree's port,
  // and anything that remembers the old port (a browser tab, an OAuth callback URL) breaks.
  it("gives the ports it has always given", () => {
    expect(devPort("graphql")).toBe(20298);
    expect(devPort("fix-upload")).toBe(20730);
  });

  it("keeps worktree ports in 20000 to 20999, never 3000", () => {
    for (const name of [...names, "", "a", "x".repeat(200), "ünïcode"]) {
      const port = devPort(name);
      expect(Number.isInteger(port)).toBe(true);
      expect(port).toBeGreaterThanOrEqual(20000);
      expect(port).toBeLessThanOrEqual(20999);
      expect(port).not.toBe(3000);
    }
  });

  it("gives realistic worktree names different ports", () => {
    const ports = names.map(devPort);
    expect(new Set(ports).size).toBe(names.length);
  });
});

describe("checkoutPort", () => {
  const kinds: PortKind[] = ["app", "r2", "testApp", "testR2"];
  const bands = { app: 20000, r2: 21000, testApp: 22000, testR2: 23000 };

  it("gives the main checkout fixed ports, with the dev server on 3000", () => {
    expect(kinds.map((kind) => checkoutPort(null, kind))).toEqual([3000, 3001, 3100, 3101]);
  });

  it("matches devPort for the dev server", () => {
    for (const name of [null, ...names]) expect(checkoutPort(name, "app")).toBe(devPort(name));
  });

  it("keeps each kind in its own band of 1000, at the dev server's offset", () => {
    for (const name of [...names, "", "x".repeat(200)]) {
      const offset = devPort(name) - 20000;
      for (const kind of kinds) expect(checkoutPort(name, kind)).toBe(bands[kind] + offset);
    }
  });

  it("never gives two kinds the same port, in any checkout", () => {
    const all = [null, ...names].flatMap((name) => kinds.map((kind) => checkoutPort(name, kind)));
    expect(new Set(all).size).toBe(all.length);
  });

  it("stays below the ports Linux hands out for outgoing connections", () => {
    for (const name of names) for (const kind of kinds) expect(checkoutPort(name, kind)).toBeLessThan(32768);
  });
});

describe("worktreeName", () => {
  it("leaves a safe name alone", () => {
    expect(worktreeName("fix-upload")).toBe("fix-upload");
    expect(worktreeName("review-pr-23")).toBe("review-pr-23");
  });

  it("lower-cases the folder name", () => {
    expect(worktreeName("GraphQL")).toBe("graphql");
  });

  it("turns each run of other characters into one hyphen", () => {
    expect(worktreeName("fix upload")).toBe("fix-upload");
    expect(worktreeName("fix__upload..v2")).toBe("fix-upload-v2");
    expect(worktreeName("feature/new  thing")).toBe("feature-new-thing");
    expect(worktreeName("a--b")).toBe("a-b");
    expect(worktreeName("café")).toBe("caf");
  });

  it("has no leading or trailing hyphen", () => {
    expect(worktreeName("-fix-")).toBe("fix");
    expect(worktreeName("  .fix upload!! ")).toBe("fix-upload");
  });
});

describe("databaseName", () => {
  it("keeps the main checkout's database", () => {
    expect(MAIN_DATABASE).toBe("a-thousand-words");
    expect(databaseName(null)).toBe("a-thousand-words");
  });

  it("names a worktree's database after the worktree", () => {
    expect(databaseName("graphql")).toBe("a-thousand-words-graphql");
    expect(databaseName("review-pr-23")).toBe("a-thousand-words-review-pr-23");
  });
});

describe("withDatabaseUrl", () => {
  const url = "postgres://localhost:51214/template1";

  it("adds DATABASE_URL to an empty file", () => {
    expect(withDatabaseUrl("", url)).toBe(`DATABASE_URL="${url}"\n`);
  });

  it("replaces an existing DATABASE_URL line", () => {
    const env = 'DATABASE_URL="postgres://old"\nAUTH_SECRET="s"\n';
    const out = withDatabaseUrl(env, url);
    expect(out).not.toContain("postgres://old");
    expect(out.match(/DATABASE_URL=/g)).toHaveLength(1);
    expect(out).toContain(`DATABASE_URL="${url}"`);
    expect(out).toContain('AUTH_SECRET="s"');
  });

  it("replaces an unquoted or spaced DATABASE_URL line", () => {
    const out = withDatabaseUrl("DATABASE_URL = postgres://old\nA=1\n", url);
    expect(out).toBe(`A=1\nDATABASE_URL="${url}"\n`);
  });

  it("keeps every other line, including comments and blank lines in the middle", () => {
    const env = [
      "# Auth",
      'AUTH_SECRET="s"',
      "",
      "# Database",
      'DATABASE_URL="postgres://old"',
      "",
      "# R2",
      "R2_BUCKET=images",
      "",
    ].join("\n");
    const out = withDatabaseUrl(env, url);
    expect(out).toBe(
      ["# Auth", 'AUTH_SECRET="s"', "", "# Database", "", "# R2", "R2_BUCKET=images", `DATABASE_URL="${url}"`, ""].join(
        "\n",
      ),
    );
  });

  it("keeps lines that only look like DATABASE_URL", () => {
    const env = "# DATABASE_URL=postgres://commented\nSHADOW_DATABASE_URL=postgres://shadow\n";
    const out = withDatabaseUrl(env, url);
    expect(out).toContain("# DATABASE_URL=postgres://commented");
    expect(out).toContain("SHADOW_DATABASE_URL=postgres://shadow");
    expect(out).toContain(`\nDATABASE_URL="${url}"`);
  });

  it("ends with exactly one newline", () => {
    for (const env of ["", "A=1", "A=1\n", "A=1\n\n\n", 'DATABASE_URL="x"\n\n']) {
      const out = withDatabaseUrl(env, url);
      expect(out.endsWith("\n")).toBe(true);
      expect(out.endsWith("\n\n")).toBe(false);
    }
  });

  it("gives the same file when run twice", () => {
    const once = withDatabaseUrl("A=1\n# note\n\nB=2\n", url);
    expect(withDatabaseUrl(once, url)).toBe(once);
  });
});

describe("withEnvValues", () => {
  it("sets several values, replacing old lines and keeping the rest", () => {
    const env = 'R2_BUCKET=old\n# keep\nAUTH_SECRET="s"\nR2_ENDPOINT = "http://x"\n';
    expect(withEnvValues(env, { R2_ENDPOINT: "http://localhost:21000", R2_BUCKET: "mock" })).toBe(
      '# keep\nAUTH_SECRET="s"\nR2_ENDPOINT="http://localhost:21000"\nR2_BUCKET="mock"\n',
    );
  });

  it("doesn't touch a variable whose name only starts the same", () => {
    expect(withEnvValues("R2_BUCKET_OLD=1\n", { R2_BUCKET: "b" })).toBe('R2_BUCKET_OLD=1\nR2_BUCKET="b"\n');
  });
});
