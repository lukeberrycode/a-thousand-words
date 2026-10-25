import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { currentWorktree } from "../../scripts/checkout";
import { browserCallProblem, browserOrigins, checkLocalDatabase, isAllowedUrl, signedInState } from "./mcp";
import { checkoutPort } from "./worktree";

// The limits on the agent's browser (ADR 0026). The checkout's folder here is made up: the checks
// only compare paths, so it needn't exist.
const ROOT = "/work/checkout";
const ORIGINS = ["http://localhost:20765", "http://localhost:21765"];
const context = { origins: ORIGINS, root: ROOT };
const problem = (tool: string, input: Record<string, unknown> = {}) => browserCallProblem(tool, input, context);

describe("browserOrigins", () => {
  it("allows the checkout's dev server and R2 mock on localhost", () => {
    expect(browserOrigins({ app: 3000, r2: 3001 })).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });

  it("adds the origin of R2_PUBLIC_URL, without its path", () => {
    expect(browserOrigins({ app: 3000, r2: 3001 }, "https://pub-abc123.r2.dev/images")).toEqual([
      "http://localhost:3000",
      "http://localhost:3001",
      "https://pub-abc123.r2.dev",
    ]);
  });

  it("doesn't repeat the R2 mock's origin when R2_PUBLIC_URL is on it, as in a --mock worktree", () => {
    expect(browserOrigins({ app: 20765, r2: 21765 }, "http://localhost:21765/dev-bucket")).toEqual(ORIGINS);
  });

  it("ignores an empty R2_PUBLIC_URL", () => {
    expect(browserOrigins({ app: 3000, r2: 3001 }, "")).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });
});

describe("isAllowedUrl", () => {
  it("allows any page on an allowed origin", () => {
    for (const url of [
      "http://localhost:20765",
      "http://localhost:20765/",
      "http://localhost:20765/images/abc?x=1#top",
      "http://localhost:21765/dev-bucket/images/a.png",
      "HTTP://LOCALHOST:20765/upload",
    ]) {
      expect(isAllowedUrl(url, ORIGINS), url).toBe(true);
    }
  });

  it("allows https on an allowed https origin", () => {
    expect(isAllowedUrl("https://pub-abc123.r2.dev/images/a.jpg", ["https://pub-abc123.r2.dev"])).toBe(true);
  });

  it("refuses other hosts, ports and schemes", () => {
    for (const url of [
      "https://example.com/",
      "http://evil.example/",
      "https://a-thousand-words-pi.vercel.app/",
      "http://localhost:3000/",
      "http://localhost/",
      "https://localhost:20765/",
      "http://127.0.0.1:20765/",
      "http://[::1]:20765/",
      "http://localhost.evil.example:20765/",
      "ws://localhost:20765/",
    ]) {
      expect(isAllowedUrl(url, ORIGINS), url).toBe(false);
    }
  });

  it("refuses URLs that aren't web pages", () => {
    for (const url of [
      "file:///etc/passwd",
      "file:///work/checkout/.env",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "chrome://settings",
      "about:blank",
      "view-source:http://localhost:20765/",
    ]) {
      expect(isAllowedUrl(url, ORIGINS), url).toBe(false);
    }
  });

  it("refuses URLs whose userinfo makes another host look local", () => {
    for (const url of [
      "http://localhost:20765@evil.example/",
      "http://localhost:20765:x@evil.example/",
      "http://user:pass@evil.example/?http://localhost:20765",
    ]) {
      expect(isAllowedUrl(url, ORIGINS), url).toBe(false);
    }
  });

  it("refuses malformed URLs", () => {
    for (const url of ["", "localhost:20765", "/images/abc", "http://", "http://localhost:99999/", "not a url"]) {
      expect(isAllowedUrl(url, ORIGINS), url).toBe(false);
    }
  });

  it("refuses everything when no origin is allowed", () => {
    expect(isAllowedUrl("http://localhost:20765/", [])).toBe(false);
  });
});

describe("browserCallProblem: tools", () => {
  it("allows the checked tools of the pinned version", () => {
    for (const tool of [
      "browser_click",
      "browser_close",
      "browser_console_messages",
      "browser_drag",
      "browser_fill_form",
      "browser_handle_dialog",
      "browser_hover",
      "browser_navigate_back",
      "browser_network_requests",
      "browser_press_key",
      "browser_resize",
      "browser_select_option",
      "browser_snapshot",
      "browser_take_screenshot",
      "browser_type",
      "browser_wait_for",
      "browser_tabs",
    ]) {
      expect(problem(tool), tool).toBeNull();
    }
  });

  it("refuses the tools that run JavaScript", () => {
    expect(problem("browser_evaluate", { function: "() => document.cookie" })).toMatch(/browser_evaluate/);
    expect(problem("browser_run_code_unsafe", { code: "process.exit()" })).toMatch(/browser_run_code_unsafe/);
  });

  it("refuses unknown tools, including ones a later version might add", () => {
    for (const tool of [
      "",
      "browser_install",
      "browser_pdf_save",
      "browser_mouse_click_xy",
      "mcp__playwright__browser_click",
      "BROWSER_CLICK",
    ]) {
      expect(problem(tool), tool).not.toBeNull();
    }
  });
});

describe("browserCallProblem: urls", () => {
  it("lets the browser open the checkout's own pages", () => {
    expect(problem("browser_navigate", { url: "http://localhost:20765/upload" })).toBeNull();
    expect(problem("browser_tabs", { action: "new", url: "http://localhost:21765/dev-bucket/a.png" })).toBeNull();
    expect(problem("browser_tabs", { action: "list" })).toBeNull();
  });

  it("refuses any other url, and says which origins are allowed", () => {
    const reason = problem("browser_navigate", { url: "https://example.com/" });
    expect(reason).toContain("https://example.com/");
    expect(reason).toContain("http://localhost:20765");
    expect(problem("browser_tabs", { action: "new", url: "https://example.com/" })).not.toBeNull();
    expect(problem("browser_navigate", { url: "file:///etc/passwd" })).not.toBeNull();
    expect(problem("browser_navigate", { url: "http://localhost:20765@evil.example/" })).not.toBeNull();
  });

  it("refuses a url that isn't a string or is missing its value", () => {
    for (const url of [undefined, null, 42, { href: "http://localhost:20765/" }]) {
      expect(problem("browser_navigate", { url }), String(url)).not.toBeNull();
    }
  });
});

describe("browserCallProblem: files the browser writes", () => {
  it("allows files inside .playwright-mcp/, given relative or absolute", () => {
    for (const filename of [
      ".playwright-mcp/page.png",
      ".playwright-mcp/shots/page.png",
      `${ROOT}/.playwright-mcp/snapshot.md`,
    ]) {
      expect(problem("browser_take_screenshot", { filename }), filename).toBeNull();
    }
    expect(problem("browser_snapshot", { filename: ".playwright-mcp/snapshot.md" })).toBeNull();
    expect(problem("browser_console_messages", { filename: ".playwright-mcp/console.txt" })).toBeNull();
    expect(problem("browser_network_requests", { filename: ".playwright-mcp/requests.txt" })).toBeNull();
  });

  it("allows a call that names no file", () => {
    expect(problem("browser_take_screenshot", {})).toBeNull();
    expect(problem("browser_take_screenshot", { filename: undefined })).toBeNull();
  });

  it("refuses files anywhere else", () => {
    for (const filename of [
      "/etc/cron.d/job",
      "/home/someone/.bashrc",
      `${ROOT}/src/app/page.tsx`,
      `${ROOT}/.claude/settings.json`,
      "page.png",
      "src/lib/mcp.ts",
      ".env",
      "../outside.png",
      ".playwright-mcp/../.env",
      ".playwright-mcp/../../outside.png",
      `${ROOT}/.playwright-mcp/../.claude/hooks/guard.mjs`,
      ".playwright-mcp",
      ".playwright-mcp/",
      `${ROOT}/.playwright-mcp`,
      ".playwright-mcp-evil/page.png",
      `${ROOT}/.playwright-mcp-evil/page.png`,
      `${ROOT}-evil/.playwright-mcp/page.png`,
    ]) {
      const reason = problem("browser_take_screenshot", { filename });
      expect(reason, filename).not.toBeNull();
      expect(reason, filename).toContain(".playwright-mcp/");
    }
  });

  it("checks the filename of every tool that writes one", () => {
    for (const tool of ["browser_snapshot", "browser_console_messages", "browser_network_requests"]) {
      expect(problem(tool, { filename: "/tmp/out.txt" }), tool).not.toBeNull();
    }
  });
});

describe("browserCallProblem: files the browser uploads", () => {
  it("allows JPEG, PNG and WebP images inside the checkout, in any case", () => {
    for (const path of [
      `${ROOT}/e2e/fixtures/painting.jpg`,
      `${ROOT}/e2e/fixtures/painting.JPEG`,
      `${ROOT}/public/a.png`,
      `${ROOT}/public/a.PnG`,
      `${ROOT}/b.webp`,
      `${ROOT}/b.WEBP`,
    ]) {
      expect(problem("browser_file_upload", { paths: [path] }), path).toBeNull();
    }
    expect(problem("browser_drop", { paths: [`${ROOT}/a.png`, `${ROOT}/b.jpg`] })).toBeNull();
  });

  it("allows an upload with no files, which cancels the file chooser", () => {
    expect(problem("browser_file_upload", {})).toBeNull();
    expect(problem("browser_file_upload", { paths: [] })).toBeNull();
    expect(problem("browser_file_upload", { paths: undefined })).toBeNull();
  });

  it("refuses files that aren't images the site takes", () => {
    for (const path of [
      `${ROOT}/.env`,
      `${ROOT}/.env.local`,
      `${ROOT}/.env.png.local`,
      `${ROOT}/package.json`,
      `${ROOT}/a.gif`,
      `${ROOT}/a.svg`,
      `${ROOT}/a.png.txt`,
      `${ROOT}/png`,
    ]) {
      expect(problem("browser_file_upload", { paths: [path] }), path).not.toBeNull();
    }
  });

  it("refuses images outside the checkout, or given by relative path", () => {
    for (const path of [
      "/etc/a.png",
      "/home/someone/Pictures/a.jpg",
      `${ROOT}/../a.png`,
      `${ROOT}/e2e/../../a.png`,
      `${ROOT}-evil/a.png`,
      "/work/a.png",
      "a.png",
      "e2e/fixtures/painting.jpg",
      "./a.png",
    ]) {
      expect(problem("browser_file_upload", { paths: [path] }), path).not.toBeNull();
    }
  });

  it("refuses images under .claude/ or .playwright-mcp/", () => {
    for (const path of [
      `${ROOT}/.claude/a.png`,
      `${ROOT}/.claude/worktrees/x/a.png`,
      `${ROOT}/.playwright-mcp/page.png`,
      `${ROOT}/e2e/../.playwright-mcp/page.png`,
    ]) {
      expect(problem("browser_file_upload", { paths: [path] }), path).not.toBeNull();
    }
  });

  it("refuses the whole call if any one file is refused", () => {
    expect(problem("browser_file_upload", { paths: [`${ROOT}/a.png`, `${ROOT}/.env`] })).not.toBeNull();
    expect(problem("browser_drop", { paths: [`${ROOT}/a.png`, "/etc/b.png"] })).not.toBeNull();
  });

  it("refuses paths that aren't a list", () => {
    for (const paths of [`${ROOT}/a.png`, { 0: `${ROOT}/a.png` }, 1, null]) {
      expect(problem("browser_file_upload", { paths }), String(paths)).not.toBeNull();
    }
  });

  describe("with symbolic links in a real checkout", () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "mcp-test-")));
    const root = join(base, "checkout");
    mkdirSync(join(root, ".playwright-mcp"), { recursive: true });
    writeFileSync(join(base, "secret.txt"), "secret");
    writeFileSync(join(root, ".env"), "SECRET=1");
    writeFileSync(join(root, ".playwright-mcp", "storage-state.json"), "{}");
    symlinkSync(join(base, "secret.txt"), join(root, "outside.png"));
    symlinkSync(join(root, ".env"), join(root, "env.png"));
    symlinkSync(join(root, ".playwright-mcp", "storage-state.json"), join(root, "state.png"));
    afterAll(() => rmSync(base, { recursive: true, force: true }));

    const upload = (path: string) =>
      browserCallProblem("browser_file_upload", { paths: [path] }, { origins: ORIGINS, root });

    // A ".png" link to another file isn't an image inside the checkout: it would upload the file it
    // points to, such as .env or the signed-in session.
    it("refuses an image name that links to a file outside the checkout", () => {
      expect(upload(join(root, "outside.png"))).not.toBeNull();
    });

    it("refuses an image name that links to .env", () => {
      expect(upload(join(root, "env.png"))).not.toBeNull();
    });

    it("refuses an image name that links into .playwright-mcp/", () => {
      expect(upload(join(root, "state.png"))).not.toBeNull();
    });
  });
});

describe("checkLocalDatabase", () => {
  it("accepts Postgres databases on this machine", () => {
    for (const url of [
      "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
      "postgresql://postgres@localhost:5432/a_thousand_words",
      "postgres://postgres:postgres@127.0.0.1:51214/template1",
      "postgresql://postgres@[::1]:5432/db",
      "postgres://localhost/db",
    ]) {
      expect(() => checkLocalDatabase(url), url).not.toThrow();
    }
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => checkLocalDatabase(undefined)).toThrow(/DATABASE_URL isn't set/);
    expect(() => checkLocalDatabase("")).toThrow(/DATABASE_URL isn't set/);
  });

  it("throws for a malformed URL", () => {
    for (const url of ["not a url", "localhost:5432/db", "postgres://localhost:99999/db"]) {
      expect(() => checkLocalDatabase(url), url).toThrow();
    }
  });

  it("throws for another protocol", () => {
    for (const url of [
      "mysql://root@localhost/db",
      "prisma+postgres://localhost:51213/?api_key=x",
      "http://localhost:5432/",
      "file:///tmp/db",
    ]) {
      expect(() => checkLocalDatabase(url), url).toThrow(/postgres:\/\//);
    }
  });

  it("throws for a database on any other host, naming it", () => {
    expect(() =>
      checkLocalDatabase("postgresql://user:pw@ep-x.eu-west-2.aws.neon.tech/neondb?sslmode=require"),
    ).toThrow(/ep-x\.eu-west-2\.aws\.neon\.tech/);
    for (const url of [
      "postgres://db.example.com/db",
      "postgres://localhost.evil.example/db",
      "postgres://localhost@ep-x.eu-west-2.aws.neon.tech/db",
      "postgres://10.0.0.5/db",
      "postgres://0.0.0.0/db",
      "postgres://ep-x.eu-west-2.aws.neon.tech/db?host=localhost",
    ]) {
      expect(() => checkLocalDatabase(url), url).toThrow();
    }
  });
});

describe("signedInState", () => {
  it("holds one Auth.js session cookie for localhost", () => {
    const expires = new Date("2026-11-01T12:34:56.789Z");
    expect(signedInState("token-abc", expires)).toEqual({
      cookies: [
        {
          name: "authjs.session-token",
          value: "token-abc",
          domain: "localhost",
          path: "/",
          expires: Math.floor(expires.getTime() / 1000),
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    });
  });

  it("gives the expiry in whole Unix seconds", () => {
    const [cookie] = signedInState("t", new Date(1_793_000_000_999)).cookies;
    expect(cookie.expires).toBe(1_793_000_000);
    expect(Number.isInteger(cookie.expires)).toBe(true);
  });
});

// The hook itself, run as Claude Code runs it: the hook input as JSON on stdin, and the checkout in
// CLAUDE_PROJECT_DIR. Its origins come from whichever checkout this runs in.
describe("mcp-guard.mjs", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const checkout = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8" }).trim();
  const hook = join(checkout, ".claude", "hooks", "mcp-guard.mjs");
  const appPort = checkoutPort(currentWorktree(checkout), "app");

  function runHook(stdin: string, { projectDir = checkout as string | null } = {}) {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
    // Run from another folder, so the hook has to find the checkout for itself.
    const result = spawnSync(process.execPath, ["--no-warnings", hook], {
      input: stdin,
      env,
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: 20_000,
    });
    return { status: result.status, stderr: result.stderr };
  }

  const call = (tool_name: string, tool_input: Record<string, unknown>) =>
    JSON.stringify({ tool_name, tool_input, cwd: checkout });

  it("allows navigating to this checkout's dev server", () => {
    const result = runHook(call("mcp__playwright__browser_navigate", { url: `http://localhost:${appPort}/` }));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  }, 30_000);

  it("finds the checkout from the input's cwd when CLAUDE_PROJECT_DIR isn't set", () => {
    const result = runHook(call("mcp__playwright__browser_navigate", { url: `http://localhost:${appPort}/` }), {
      projectDir: null,
    });
    expect(result.status).toBe(0);
  }, 30_000);

  it("blocks navigating elsewhere, with the reason on stderr", () => {
    const result = runHook(call("mcp__playwright__browser_navigate", { url: "https://example.com/" }));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("https://example.com/");
  }, 30_000);

  it("blocks the tools that run JavaScript", () => {
    const result = runHook(call("mcp__playwright__browser_evaluate", { function: "() => document.cookie" }));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("browser_evaluate");
  }, 30_000);

  it("blocks uploading a file that isn't an image in the checkout", () => {
    const result = runHook(call("mcp__playwright__browser_file_upload", { paths: [join(checkout, ".env")] }));
    expect(result.status).toBe(2);
    expect(result.stderr).not.toBe("");
  }, 30_000);

  it("lets other tools through", () => {
    for (const name of ["Bash", "Read", "mcp__other__browser_evaluate"]) {
      const result = runHook(call(name, { command: "echo hi" }));
      expect(result.status, name).toBe(0);
    }
  }, 30_000);

  it("fails closed when its input isn't JSON", () => {
    for (const stdin of ["not json", "", '{"tool_name": "mcp__playwright__browser_navigate"']) {
      const result = runHook(stdin);
      expect(result.status, stdin).toBe(2);
      expect(result.stderr, stdin).toMatch(/blocked/);
    }
  }, 30_000);

  it("fails closed when it can't find the checkout", () => {
    const result = runHook(
      JSON.stringify({
        tool_name: "mcp__playwright__browser_navigate",
        tool_input: { url: `http://localhost:${appPort}/` },
        cwd: "/",
      }),
      { projectDir: "/" },
    );
    expect(result.status).toBe(2);
  }, 30_000);
});
