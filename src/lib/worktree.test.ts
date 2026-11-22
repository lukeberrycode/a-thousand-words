// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the functions and constants under test.
import {
  // The main checkout's database name.
  MAIN_DATABASE,
  // The main checkout's dev server port.
  MAIN_PORT,
  // A checkout's port for one kind of server.
  checkoutPort,
  // The database name for a checkout.
  databaseName,
  // A checkout's dev server port.
  devPort,
  // Sets DATABASE_URL in an env file.
  withDatabaseUrl,
  // Sets several values in an env file.
  withEnvValues,
  // Removes values from an env file.
  withoutEnvValues,
  // Turns a folder name into a worktree name.
  worktreeName,
  // The type of server kinds.
  type PortKind,
} from "./worktree";

// Some realistic worktree names.
const names = ["graphql", "fix-upload", "review-pr-23", "isolation", "search", "agent-a1b2c3"];

// Group the tests for the dev server port.
describe("devPort", () => {
  // Check the main checkout.
  it("keeps port 3000 for the main checkout", () => {
    // The constant is 3000.
    expect(MAIN_PORT).toBe(3000);

    // And the main checkout (null) gets it.
    expect(devPort(null)).toBe(3000);
  });

  // Check the port is stable.
  it("gives the same name the same port every time", () => {
    // Asking twice gives the same answer.
    for (const name of names) expect(devPort(name)).toBe(devPort(name));
  });

  // Pinned so a change to the hash is caught: changing it moves every existing worktree's port,
  // and anything that remembers the old port (a browser tab, an OAuth callback URL) breaks.
  it("gives the ports it has always given", () => {
    // Known port for "graphql".
    expect(devPort("graphql")).toBe(20298);

    // Known port for "fix-upload".
    expect(devPort("fix-upload")).toBe(20730);
  });

  // Check the range.
  it("keeps worktree ports in 20000 to 20999, never 3000", () => {
    // Try ordinary names and some awkward ones.
    for (const name of [...names, "", "a", "x".repeat(200), "ünïcode"]) {
      // Work out the port.
      const port = devPort(name);

      // It's a whole number.
      expect(Number.isInteger(port)).toBe(true);

      // At least 20000.
      expect(port).toBeGreaterThanOrEqual(20000);

      // At most 20999.
      expect(port).toBeLessThanOrEqual(20999);

      // Never the main checkout's port.
      expect(port).not.toBe(3000);
    }
  });

  // Check names don't collide.
  it("gives realistic worktree names different ports", () => {
    // Work out every name's port.
    const ports = names.map(devPort);

    // All of them are different.
    expect(new Set(ports).size).toBe(names.length);
  });
});

// Group the tests for per-kind ports.
describe("checkoutPort", () => {
  // The four kinds of server.
  const kinds: PortKind[] = ["app", "r2", "testApp", "testR2"];

  // The first port of each kind's band.
  const bands = { app: 20000, r2: 21000, testApp: 22000, testR2: 23000 };

  // Check the main checkout.
  it("gives the main checkout fixed ports, with the dev server on 3000", () => {
    // The four fixed ports, in order.
    expect(kinds.map((kind) => checkoutPort(null, kind))).toEqual([3000, 3001, 3100, 3101]);
  });

  // Check it agrees with devPort.
  it("matches devPort for the dev server", () => {
    // For the main checkout and every worktree, "app" is the dev port.
    for (const name of [null, ...names]) expect(checkoutPort(name, "app")).toBe(devPort(name));
  });

  // Check the bands.
  it("keeps each kind in its own band of 1000, at the dev server's offset", () => {
    // Try ordinary names and some awkward ones.
    for (const name of [...names, "", "x".repeat(200)]) {
      // The dev port's position within its band.
      const offset = devPort(name) - 20000;

      // Each kind's port is its band's start plus that offset.
      for (const kind of kinds) expect(checkoutPort(name, kind)).toBe(bands[kind] + offset);
    }
  });

  // Check ports don't collide.
  it("never gives two kinds the same port, in any checkout", () => {
    // Every port for every checkout and kind.
    const all = [null, ...names].flatMap((name) => kinds.map((kind) => checkoutPort(name, kind)));

    // All of them are different.
    expect(new Set(all).size).toBe(all.length);
  });

  // Check the ceiling.
  it("stays below the ports Linux hands out for outgoing connections", () => {
    // Every port is under 32768.
    for (const name of names) for (const kind of kinds) expect(checkoutPort(name, kind)).toBeLessThan(32768);
  });
});

// Group the tests for naming.
describe("worktreeName", () => {
  // Check safe names.
  it("leaves a safe name alone", () => {
    // A name with hyphens is unchanged.
    expect(worktreeName("fix-upload")).toBe("fix-upload");

    // So is one with digits.
    expect(worktreeName("review-pr-23")).toBe("review-pr-23");
  });

  // Check case.
  it("lower-cases the folder name", () => {
    // Capitals become lower case.
    expect(worktreeName("GraphQL")).toBe("graphql");
  });

  // Check unsafe characters.
  it("turns each run of other characters into one hyphen", () => {
    // A space becomes a hyphen.
    expect(worktreeName("fix upload")).toBe("fix-upload");

    // A mix of punctuation becomes one hyphen.
    expect(worktreeName("fix__upload..v2")).toBe("fix-upload-v2");

    // A slash and two spaces become one hyphen.
    expect(worktreeName("feature/new  thing")).toBe("feature-new-thing");

    // Two hyphens become one.
    expect(worktreeName("a--b")).toBe("a-b");

    // An accented letter is dropped.
    expect(worktreeName("café")).toBe("caf");
  });

  // Check the ends.
  it("has no leading or trailing hyphen", () => {
    // Hyphens at both ends are trimmed.
    expect(worktreeName("-fix-")).toBe("fix");

    // So is other punctuation at both ends.
    expect(worktreeName("  .fix upload!! ")).toBe("fix-upload");
  });
});

// Group the tests for database names.
describe("databaseName", () => {
  // Check the main checkout.
  it("keeps the main checkout's database", () => {
    // The constant is the original name.
    expect(MAIN_DATABASE).toBe("a-thousand-words");

    // And the main checkout (null) gets it.
    expect(databaseName(null)).toBe("a-thousand-words");
  });

  // Check worktrees.
  it("names a worktree's database after the worktree", () => {
    // The worktree's name is added as a suffix.
    expect(databaseName("graphql")).toBe("a-thousand-words-graphql");

    // Also for a name with digits.
    expect(databaseName("review-pr-23")).toBe("a-thousand-words-review-pr-23");
  });
});

// Group the tests for setting DATABASE_URL.
describe("withDatabaseUrl", () => {
  // The URL used in the tests.
  const url = "postgres://localhost:51214/template1";

  // Check the empty file.
  it("adds DATABASE_URL to an empty file", () => {
    // The result is one line with a trailing newline.
    expect(withDatabaseUrl("", url)).toBe(`DATABASE_URL="${url}"\n`);
  });

  // Check replacement.
  it("replaces an existing DATABASE_URL line", () => {
    // A file with an old value and another variable.
    const env = 'DATABASE_URL="postgres://old"\nAUTH_SECRET="s"\n';

    // Set the new value.
    const out = withDatabaseUrl(env, url);

    // The old value is gone.
    expect(out).not.toContain("postgres://old");

    // There's exactly one DATABASE_URL line.
    expect(out.match(/DATABASE_URL=/g)).toHaveLength(1);

    // It has the new value.
    expect(out).toContain(`DATABASE_URL="${url}"`);

    // The other variable is kept.
    expect(out).toContain('AUTH_SECRET="s"');
  });

  // Check unusual formatting.
  it("replaces an unquoted or spaced DATABASE_URL line", () => {
    // Set the value in a file with an unquoted, spaced line.
    const out = withDatabaseUrl("DATABASE_URL = postgres://old\nA=1\n", url);

    // The old line is gone, and the new one is at the end.
    expect(out).toBe(`A=1\nDATABASE_URL="${url}"\n`);
  });

  // Check that other lines survive.
  it("keeps every other line, including comments and blank lines in the middle", () => {
    // A file with comments, blank lines and the old value.
    const env = [
      // A comment.
      "# Auth",
      // A variable.
      'AUTH_SECRET="s"',
      // A blank line.
      "",
      // A comment.
      "# Database",
      // The old value.
      'DATABASE_URL="postgres://old"',
      // A blank line.
      "",
      // A comment.
      "# R2",
      // A variable.
      "R2_BUCKET=images",
      // A blank line at the end.
      "",
    ].join("\n");

    // Set the new value.
    const out = withDatabaseUrl(env, url);

    // Everything else is kept, and the new line is at the end.
    expect(out).toBe(
      ["# Auth", 'AUTH_SECRET="s"', "", "# Database", "", "# R2", "R2_BUCKET=images", `DATABASE_URL="${url}"`, ""].join(
        "\n",
      ),
    );
  });

  // Check that similar names are left alone.
  it("keeps lines that only look like DATABASE_URL", () => {
    // A commented-out line and a similarly named variable.
    const env = "# DATABASE_URL=postgres://commented\nSHADOW_DATABASE_URL=postgres://shadow\n";

    // Set the new value.
    const out = withDatabaseUrl(env, url);

    // The comment is kept.
    expect(out).toContain("# DATABASE_URL=postgres://commented");

    // The similarly named variable is kept.
    expect(out).toContain("SHADOW_DATABASE_URL=postgres://shadow");

    // The new line is there.
    expect(out).toContain(`\nDATABASE_URL="${url}"`);
  });

  // Check the ending.
  it("ends with exactly one newline", () => {
    // Try files with different endings.
    for (const env of ["", "A=1", "A=1\n", "A=1\n\n\n", 'DATABASE_URL="x"\n\n']) {
      // Set the new value.
      const out = withDatabaseUrl(env, url);

      // It ends with a newline...
      expect(out.endsWith("\n")).toBe(true);

      // ...but not two.
      expect(out.endsWith("\n\n")).toBe(false);
    }
  });

  // Check it can be repeated.
  it("gives the same file when run twice", () => {
    // Set the value once.
    const once = withDatabaseUrl("A=1\n# note\n\nB=2\n", url);

    // Setting it again changes nothing.
    expect(withDatabaseUrl(once, url)).toBe(once);
  });
});

// Group the tests for setting several values.
describe("withEnvValues", () => {
  // Check replacement of several.
  it("sets several values, replacing old lines and keeping the rest", () => {
    // A file with two old values, a comment and another variable.
    const env = 'R2_BUCKET=old\n# keep\nAUTH_SECRET="s"\nR2_ENDPOINT = "http://x"\n';

    // Old lines go, the rest stays, and the new ones are added at the end.
    expect(withEnvValues(env, { R2_ENDPOINT: "http://localhost:21000", R2_BUCKET: "mock" })).toBe(
      '# keep\nAUTH_SECRET="s"\nR2_ENDPOINT="http://localhost:21000"\nR2_BUCKET="mock"\n',
    );
  });

  // Check that similar names are left alone.
  it("doesn't touch a variable whose name only starts the same", () => {
    // R2_BUCKET_OLD is a different variable from R2_BUCKET.
    expect(withEnvValues("R2_BUCKET_OLD=1\n", { R2_BUCKET: "b" })).toBe('R2_BUCKET_OLD=1\nR2_BUCKET="b"\n');
  });
});

// Group the tests for removing values.
describe("withoutEnvValues", () => {
  // Check removal.
  it("removes only the named lines", () => {
    // A file with a comment and three variables.
    const env = '# R2\nR2_ENDPOINT="http://localhost:21000"\nR2_BUCKET="mock"\nDATABASE_URL="x"\n';

    // Only the two named variables are removed.
    expect(withoutEnvValues(env, ["R2_ENDPOINT", "R2_BUCKET"])).toBe('# R2\nDATABASE_URL="x"\n');
  });
});
