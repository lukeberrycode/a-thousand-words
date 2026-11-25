// Import the Node functions for running child processes.
import { execFileSync, spawnSync } from "node:child_process";

// Import the Node file-system functions used to build test checkouts.
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";

// Import the function that finds the temporary folder.
import { tmpdir } from "node:os";

// Import the Node path functions.
import { dirname, join } from "node:path";

// Import the function that turns a file URL into a path.
import { fileURLToPath } from "node:url";

// Import the Vitest functions for grouping, asserting and cleaning up.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

// Import the function that names the current worktree.
import { currentWorktree } from "../../scripts/checkout";

// Import the functions under test.
import { browserCallProblem, browserOrigins, checkLocalDatabase, isAllowedUrl, signedInState } from "./mcp";

// Import the port function.
import { checkoutPort } from "./worktree";

// The limits on the agent's browser (ADR 0026). The checkout's folder here is made up: the checks
// only compare paths, so it needn't exist.
const ROOT = "/work/checkout";

// The origins used in the tests.
const ORIGINS = ["http://localhost:20765", "http://localhost:21765"];

// The settings passed to every check.
const context = { origins: ORIGINS, root: ROOT };

// Check a call and return the reason it's refused, or null.
const problem = (tool: string, input: Record<string, unknown> = {}) => browserCallProblem(tool, input, context);

// Make a symbolic link, with a hint when Windows refuses to.
const symlink = (target: string, path: string) => {
  // Try to make the link.
  try {
    symlinkSync(target, path);
  } catch (error) {
    // Windows makes symbolic links only in Developer Mode, so say how to turn it on.
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") {
      throw new Error('Can\'t make a symbolic link. Turn on "Developer Mode": Settings → System → For developers.', {
        cause: error,
      });
    }

    // Pass any other error on.
    throw error;
  }
};

// Group the tests for the allowed origins.
describe("browserOrigins", () => {
  // Check the default list.
  it("allows the checkout's dev server and R2 mock on localhost", () => {
    // The two local servers.
    expect(browserOrigins({ app: 3000, r2: 3001 })).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });

  // Check the image host.
  it("adds the origin of R2_PUBLIC_URL, without its path", () => {
    // The image host's origin is added.
    expect(browserOrigins({ app: 3000, r2: 3001 }, "https://pub-abc123.r2.dev/images")).toEqual([
      // The dev server.
      "http://localhost:3000",
      // The R2 mock.
      "http://localhost:3001",
      // The image host, with no path.
      "https://pub-abc123.r2.dev",
    ]);
  });

  // Check that duplicates are avoided.
  it("doesn't repeat the R2 mock's origin when R2_PUBLIC_URL is on it, as in a --mock worktree", () => {
    // The mock's origin appears once.
    expect(browserOrigins({ app: 20765, r2: 21765 }, "http://localhost:21765/dev-bucket")).toEqual(ORIGINS);
  });

  // Check the empty case.
  it("ignores an empty R2_PUBLIC_URL", () => {
    // Only the two local servers.
    expect(browserOrigins({ app: 3000, r2: 3001 }, "")).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });
});

// Group the tests for URL checks.
describe("isAllowedUrl", () => {
  // Check allowed URLs.
  it("allows any page on an allowed origin", () => {
    // Try several URLs on the allowed origins.
    for (const url of [
      // The bare origin.
      "http://localhost:20765",
      // The origin with a slash.
      "http://localhost:20765/",
      // A page with a query and a fragment.
      "http://localhost:20765/images/abc?x=1#top",
      // A file on the R2 mock.
      "http://localhost:21765/dev-bucket/images/a.png",
      // Upper case, which URL parsing normalises.
      "HTTP://LOCALHOST:20765/upload",
    ]) {
      // Each one is allowed.
      expect(isAllowedUrl(url, ORIGINS), url).toBe(true);
    }
  });

  // Check https.
  it("allows https on an allowed https origin", () => {
    // An https origin in the list allows its pages.
    expect(isAllowedUrl("https://pub-abc123.r2.dev/images/a.jpg", ["https://pub-abc123.r2.dev"])).toBe(true);
  });

  // Check refusals.
  it("refuses other hosts, ports and schemes", () => {
    // Try URLs that aren't on the list.
    for (const url of [
      // A different site.
      "https://example.com/",
      // A hostile site.
      "http://evil.example/",
      // The production site.
      "https://a-thousand-words-pi.vercel.app/",
      // The main checkout's port, which isn't allowed here.
      "http://localhost:3000/",
      // No port.
      "http://localhost/",
      // The right port but the wrong scheme.
      "https://localhost:20765/",
      // The same machine, by address.
      "http://127.0.0.1:20765/",
      // The same machine, by IPv6 address.
      "http://[::1]:20765/",
      // A host that only starts with "localhost".
      "http://localhost.evil.example:20765/",
      // A WebSocket scheme.
      "ws://localhost:20765/",
    ]) {
      // Each one is refused.
      expect(isAllowedUrl(url, ORIGINS), url).toBe(false);
    }
  });

  // Check non-web schemes.
  it("refuses URLs that aren't web pages", () => {
    // Try other kinds of URL.
    for (const url of [
      // A local file.
      "file:///etc/passwd",
      // A secret in the checkout.
      "file:///work/checkout/.env",
      // A script.
      "javascript:alert(1)",
      // Inline HTML.
      "data:text/html,<script>alert(1)</script>",
      // A browser page.
      "chrome://settings",
      // A blank page.
      "about:blank",
      // A source view of an allowed page.
      "view-source:http://localhost:20765/",
    ]) {
      // Each one is refused.
      expect(isAllowedUrl(url, ORIGINS), url).toBe(false);
    }
  });

  // Check tricks with user names.
  it("refuses URLs whose userinfo makes another host look local", () => {
    // Try URLs that only look local.
    for (const url of [
      // The "local" part is really a user name.
      "http://localhost:20765@evil.example/",
      // The same, with a password.
      "http://localhost:20765:x@evil.example/",
      // The local address is only in the query.
      "http://user:pass@evil.example/?http://localhost:20765",
    ]) {
      // Each one is refused.
      expect(isAllowedUrl(url, ORIGINS), url).toBe(false);
    }
  });

  // Check broken URLs.
  it("refuses malformed URLs", () => {
    // Try things that aren't proper URLs.
    for (const url of ["", "localhost:20765", "/images/abc", "http://", "http://localhost:99999/", "not a url"]) {
      // Each one is refused.
      expect(isAllowedUrl(url, ORIGINS), url).toBe(false);
    }
  });

  // Check the empty list.
  it("refuses everything when no origin is allowed", () => {
    // Nothing is on an empty list.
    expect(isAllowedUrl("http://localhost:20765/", [])).toBe(false);
  });
});

// Group the tests for the tool list.
describe("browserCallProblem: tools", () => {
  // Check the allowed tools.
  it("allows the checked tools of the pinned version", () => {
    // Try the tools on the list.
    for (const tool of [
      // Click.
      "browser_click",
      // Close.
      "browser_close",
      // Console messages.
      "browser_console_messages",
      // Drag.
      "browser_drag",
      // Fill a form.
      "browser_fill_form",
      // Handle a dialog.
      "browser_handle_dialog",
      // Hover.
      "browser_hover",
      // Go back.
      "browser_navigate_back",
      // Network requests.
      "browser_network_requests",
      // Press a key.
      "browser_press_key",
      // Resize.
      "browser_resize",
      // Select an option.
      "browser_select_option",
      // Snapshot.
      "browser_snapshot",
      // Screenshot.
      "browser_take_screenshot",
      // Type.
      "browser_type",
      // Wait.
      "browser_wait_for",
      // Tabs.
      "browser_tabs",
    ]) {
      // None of them is a problem.
      expect(problem(tool), tool).toBeNull();
    }
  });

  // Check the left-out tools.
  it("refuses the tools that run JavaScript", () => {
    // `browser_evaluate` is refused, and named in the message.
    expect(problem("browser_evaluate", { function: "() => document.cookie" })).toMatch(/browser_evaluate/);

    // So is `browser_run_code_unsafe`.
    expect(problem("browser_run_code_unsafe", { code: "process.exit()" })).toMatch(/browser_run_code_unsafe/);
  });

  // Check unknown tools.
  it("refuses unknown tools, including ones a later version might add", () => {
    // Try names that aren't on the list.
    for (const tool of [
      // Empty.
      "",
      // A tool that installs a browser.
      "browser_install",
      // A tool that saves a PDF.
      "browser_pdf_save",
      // A coordinate-based click.
      "browser_mouse_click_xy",
      // A name with the prefix still on.
      "mcp__playwright__browser_click",
      // Wrong case.
      "BROWSER_CLICK",
    ]) {
      // Each one is refused.
      expect(problem(tool), tool).not.toBeNull();
    }
  });
});

// Group the tests for URLs in calls.
describe("browserCallProblem: urls", () => {
  // Check allowed calls.
  it("lets the browser open the checkout's own pages", () => {
    // Navigating to a local page.
    expect(problem("browser_navigate", { url: "http://localhost:20765/upload" })).toBeNull();

    // Opening a new tab on the mock.
    expect(problem("browser_tabs", { action: "new", url: "http://localhost:21765/dev-bucket/a.png" })).toBeNull();

    // A tab call with no URL.
    expect(problem("browser_tabs", { action: "list" })).toBeNull();
  });

  // Check refused calls.
  it("refuses any other url, and says which origins are allowed", () => {
    // Try navigating to another site.
    const reason = problem("browser_navigate", { url: "https://example.com/" });

    // The message names the refused URL.
    expect(reason).toContain("https://example.com/");

    // And an allowed origin.
    expect(reason).toContain("http://localhost:20765");

    // A new tab on another site is refused.
    expect(problem("browser_tabs", { action: "new", url: "https://example.com/" })).not.toBeNull();

    // A local file is refused.
    expect(problem("browser_navigate", { url: "file:///etc/passwd" })).not.toBeNull();

    // A disguised host is refused.
    expect(problem("browser_navigate", { url: "http://localhost:20765@evil.example/" })).not.toBeNull();
  });

  // Check odd values.
  it("refuses a url that isn't a string or is missing its value", () => {
    // Try values that aren't proper URLs.
    for (const url of [undefined, null, 42, { href: "http://localhost:20765/" }]) {
      // Each one is refused.
      expect(problem("browser_navigate", { url }), String(url)).not.toBeNull();
    }
  });
});

// Group the tests for files the browser writes.
describe("browserCallProblem: files the browser writes", () => {
  // Check allowed paths.
  it("allows files inside .playwright-mcp/, given relative or absolute", () => {
    // Try paths inside the output folder.
    for (const filename of [
      // A relative path.
      ".playwright-mcp/page.png",
      // A path in a subfolder.
      ".playwright-mcp/shots/page.png",
      // An absolute path.
      `${ROOT}/.playwright-mcp/snapshot.md`,
    ]) {
      // Each one is allowed.
      expect(problem("browser_take_screenshot", { filename }), filename).toBeNull();
    }

    // A snapshot file.
    expect(problem("browser_snapshot", { filename: ".playwright-mcp/snapshot.md" })).toBeNull();

    // A console log file.
    expect(problem("browser_console_messages", { filename: ".playwright-mcp/console.txt" })).toBeNull();

    // A network log file.
    expect(problem("browser_network_requests", { filename: ".playwright-mcp/requests.txt" })).toBeNull();
  });

  // Check calls without a file.
  it("allows a call that names no file", () => {
    // No filename at all.
    expect(problem("browser_take_screenshot", {})).toBeNull();

    // A filename that's undefined.
    expect(problem("browser_take_screenshot", { filename: undefined })).toBeNull();
  });

  // Check refused paths.
  it("refuses files anywhere else", () => {
    // Try paths outside the output folder.
    for (const filename of [
      // A system folder.
      "/etc/cron.d/job",
      // A shell start-up file.
      "/home/someone/.bashrc",
      // A source file.
      `${ROOT}/src/app/page.tsx`,
      // The agent's settings.
      `${ROOT}/.claude/settings.json`,
      // A file in the checkout's root.
      "page.png",
      // This project's own code.
      "src/lib/mcp.ts",
      // A secrets file.
      ".env",
      // Above the checkout.
      "../outside.png",
      // Climbing out of the output folder.
      ".playwright-mcp/../.env",
      // Climbing out of the checkout.
      ".playwright-mcp/../../outside.png",
      // Climbing into a hooks folder.
      `${ROOT}/.playwright-mcp/../.claude/hooks/guard.mjs`,
      // The output folder itself.
      ".playwright-mcp",
      // The output folder with a trailing slash.
      ".playwright-mcp/",
      // The output folder, absolute.
      `${ROOT}/.playwright-mcp`,
      // A folder whose name starts the same.
      ".playwright-mcp-evil/page.png",
      // The same, absolute.
      `${ROOT}/.playwright-mcp-evil/page.png`,
      // A different checkout whose name starts the same.
      `${ROOT}-evil/.playwright-mcp/page.png`,
    ]) {
      // Try writing the file.
      const reason = problem("browser_take_screenshot", { filename });

      // It's refused.
      expect(reason, filename).not.toBeNull();

      // And the message says where files should go.
      expect(reason, filename).toContain(".playwright-mcp/");
    }
  });

  // Check every writing tool.
  it("checks the filename of every tool that writes one", () => {
    // Try each tool that writes a file.
    for (const tool of ["browser_snapshot", "browser_console_messages", "browser_network_requests"]) {
      // A path outside the output folder is refused.
      expect(problem(tool, { filename: "/tmp/out.txt" }), tool).not.toBeNull();
    }
  });
});

// Group the tests for files the browser uploads.
describe("browserCallProblem: files the browser uploads", () => {
  // Check allowed uploads.
  it("allows JPEG, PNG and WebP images inside the checkout, in any case", () => {
    // Try image paths inside the checkout.
    for (const path of [
      // A JPEG.
      `${ROOT}/e2e/fixtures/painting.jpg`,
      // A JPEG with an upper-case extension.
      `${ROOT}/e2e/fixtures/painting.JPEG`,
      // A PNG.
      `${ROOT}/public/a.png`,
      // A PNG with a mixed-case extension.
      `${ROOT}/public/a.PnG`,
      // A WebP.
      `${ROOT}/b.webp`,
      // A WebP with an upper-case extension.
      `${ROOT}/b.WEBP`,
    ]) {
      // Each one is allowed.
      expect(problem("browser_file_upload", { paths: [path] }), path).toBeNull();
    }

    // Several files at once, through `browser_drop`.
    expect(problem("browser_drop", { paths: [`${ROOT}/a.png`, `${ROOT}/b.jpg`] })).toBeNull();
  });

  // Check cancelling the chooser.
  it("allows an upload with no files, which cancels the file chooser", () => {
    // No paths at all.
    expect(problem("browser_file_upload", {})).toBeNull();

    // An empty list.
    expect(problem("browser_file_upload", { paths: [] })).toBeNull();

    // Paths that are undefined.
    expect(problem("browser_file_upload", { paths: undefined })).toBeNull();
  });

  // Check non-images.
  it("refuses files that aren't images the site takes", () => {
    // Try files that aren't accepted images.
    for (const path of [
      // A secrets file.
      `${ROOT}/.env`,
      // Another secrets file.
      `${ROOT}/.env.local`,
      // A secrets file with "png" in its name.
      `${ROOT}/.env.png.local`,
      // A config file.
      `${ROOT}/package.json`,
      // A GIF.
      `${ROOT}/a.gif`,
      // An SVG.
      `${ROOT}/a.svg`,
      // A text file with a double extension.
      `${ROOT}/a.png.txt`,
      // A file named "png" with no extension.
      `${ROOT}/png`,
    ]) {
      // Each one is refused.
      expect(problem("browser_file_upload", { paths: [path] }), path).not.toBeNull();
    }
  });

  // Check locations.
  it("refuses images outside the checkout, or given by relative path", () => {
    // Try image paths that aren't inside the checkout, or aren't absolute.
    for (const path of [
      // A system folder.
      "/etc/a.png",
      // Someone's pictures.
      "/home/someone/Pictures/a.jpg",
      // Climbing out of the checkout.
      `${ROOT}/../a.png`,
      // Climbing out from a subfolder.
      `${ROOT}/e2e/../../a.png`,
      // A different checkout whose name starts the same.
      `${ROOT}-evil/a.png`,
      // The parent folder.
      "/work/a.png",
      // A bare file name.
      "a.png",
      // A relative path.
      "e2e/fixtures/painting.jpg",
      // A relative path starting with a dot.
      "./a.png",
    ]) {
      // Each one is refused.
      expect(problem("browser_file_upload", { paths: [path] }), path).not.toBeNull();
    }
  });

  // Check private folders.
  it("refuses images under .claude/ or .playwright-mcp/", () => {
    // Try images in the private folders.
    for (const path of [
      // The agent's folder.
      `${ROOT}/.claude/a.png`,
      // A worktree inside it.
      `${ROOT}/.claude/worktrees/x/a.png`,
      // The browser's output folder.
      `${ROOT}/.playwright-mcp/page.png`,
      // The same, reached by climbing.
      `${ROOT}/e2e/../.playwright-mcp/page.png`,
    ]) {
      // Each one is refused.
      expect(problem("browser_file_upload", { paths: [path] }), path).not.toBeNull();
    }
  });

  // Check that one bad file spoils the lot.
  it("refuses the whole call if any one file is refused", () => {
    // A good file with a secrets file.
    expect(problem("browser_file_upload", { paths: [`${ROOT}/a.png`, `${ROOT}/.env`] })).not.toBeNull();

    // A good file with one outside the checkout.
    expect(problem("browser_drop", { paths: [`${ROOT}/a.png`, "/etc/b.png"] })).not.toBeNull();
  });

  // Check the shape of the input.
  it("refuses paths that aren't a list", () => {
    // Try values that aren't lists.
    for (const paths of [`${ROOT}/a.png`, { 0: `${ROOT}/a.png` }, 1, null]) {
      // Each one is refused.
      expect(problem("browser_file_upload", { paths }), String(paths)).not.toBeNull();
    }
  });

  // Group the tests that use real links on disk.
  describe("with symbolic links in a real checkout", () => {
    // A temporary folder, with its links resolved.
    const base = realpathSync(mkdtempSync(join(tmpdir(), "mcp-test-")));

    // A checkout inside it.
    const root = join(base, "checkout");

    // Make the output folder, which also makes the checkout.
    mkdirSync(join(root, ".playwright-mcp"), { recursive: true });

    // A secret outside the checkout.
    writeFileSync(join(base, "secret.txt"), "secret");

    // A secrets file inside the checkout.
    writeFileSync(join(root, ".env"), "SECRET=1");

    // A fake saved session.
    writeFileSync(join(root, ".playwright-mcp", "storage-state.json"), "{}");

    // A ".png" link to the outside secret.
    symlink(join(base, "secret.txt"), join(root, "outside.png"));

    // A ".png" link to .env.
    symlink(join(root, ".env"), join(root, "env.png"));

    // A ".png" link to the saved session.
    symlink(join(root, ".playwright-mcp", "storage-state.json"), join(root, "state.png"));

    // Delete the temporary folder when the tests finish.
    afterAll(() => rmSync(base, { recursive: true, force: true }));

    // Check an upload in this checkout.
    const upload = (path: string) =>
      // Run the check with this checkout's folder.
      browserCallProblem("browser_file_upload", { paths: [path] }, { origins: ORIGINS, root });

    // A ".png" link to another file isn't an image inside the checkout: it would upload the file it
    // points to, such as .env or the signed-in session.
    it("refuses an image name that links to a file outside the checkout", () => {
      // The link to the outside secret is refused.
      expect(upload(join(root, "outside.png"))).not.toBeNull();
    });

    // Check links to .env.
    it("refuses an image name that links to .env", () => {
      // The link to .env is refused.
      expect(upload(join(root, "env.png"))).not.toBeNull();
    });

    // Check links to the session.
    it("refuses an image name that links into .playwright-mcp/", () => {
      // The link to the saved session is refused.
      expect(upload(join(root, "state.png"))).not.toBeNull();
    });
  });
});

// Files the server writes, in a real checkout in a temporary folder. The agent can make links with
// `ln`, and the server runs outside the sandbox, so a link is the way to make it write elsewhere.
describe("browserCallProblem: files the browser writes, with links in a real checkout", () => {
  // The temporary folder.
  let base: string;

  // The checkout inside it.
  let root: string;

  // A folder outside the checkout.
  let outside: string;

  // The output folder's path.
  const output = () => join(root, ".playwright-mcp");

  // Check a call in this checkout.
  const call = (tool: string, input: Record<string, unknown> = {}) =>
    // Run the check with this checkout's folder.
    browserCallProblem(tool, input, { origins: ORIGINS, root });

  // Check writing a snapshot to a file.
  const write = (filename: string) => call("browser_snapshot", { filename });

  // Before each test, build a fresh checkout.
  beforeEach(() => {
    // A new temporary folder, with its links resolved.
    base = realpathSync(mkdtempSync(join(tmpdir(), "mcp-write-test-")));

    // The checkout's path.
    root = join(base, "checkout");

    // The outside folder's path.
    outside = join(base, "outside");

    // Make the checkout.
    mkdirSync(root);

    // Make the outside folder.
    mkdirSync(outside);

    // A secrets file in the checkout.
    writeFileSync(join(root, ".env"), "SECRET=1");

    // A file outside the checkout that must not be overwritten.
    writeFileSync(join(outside, "target.md"), "not yours");
  });

  // After each test, delete the temporary folder.
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  // Group the tests where the output folder isn't a real folder.
  describe("when .playwright-mcp isn't a real folder", () => {
    // Check that every kind of call is refused.
    const everyCall = () => {
      // A write by relative path.
      expect(write(".playwright-mcp/x.md")).not.toBeNull();

      // A write by absolute path.
      expect(write(join(root, ".playwright-mcp", "x.md"))).not.toBeNull();

      // A snapshot with no file.
      expect(call("browser_snapshot")).not.toBeNull();

      // A screenshot with no file.
      expect(call("browser_take_screenshot")).not.toBeNull();

      // A click.
      expect(call("browser_click", { element: "Upload", ref: "e1" })).not.toBeNull();

      // A navigation.
      expect(call("browser_navigate", { url: "http://localhost:20765/" })).not.toBeNull();
    };

    // A link to a folder outside the checkout.
    it("refuses every call while it links to a folder outside the checkout", () => {
      // Make the output folder a link to the outside folder.
      symlink(outside, output());

      // Every call is refused.
      everyCall();
    });

    // A link to a folder inside the checkout.
    it("refuses every call while it links to a folder inside the checkout", () => {
      // Make a folder inside the checkout.
      mkdirSync(join(root, "src"));

      // Make the output folder a link to it.
      symlink(join(root, "src"), output());

      // Every call is refused.
      everyCall();
    });

    // A link that goes nowhere.
    it("refuses every call while it's a broken link", () => {
      // Make the output folder a link to something that doesn't exist.
      symlink(join(outside, "not-yet"), output());

      // Every call is refused.
      everyCall();
    });

    // A plain file.
    it("refuses every call while it's a plain file", () => {
      // Make the output folder a plain file.
      writeFileSync(output(), "");

      // Every call is refused.
      everyCall();
    });

    // Nothing there yet.
    it("allows calls when it doesn't exist yet, as the server makes it", () => {
      // A call with no file is fine.
      expect(call("browser_snapshot")).toBeNull();

      // A write is fine.
      expect(write(".playwright-mcp/x.md")).toBeNull();
    });
  });

  // Group the tests where the output folder is real.
  describe("in a real .playwright-mcp/", () => {
    // Make the output folder before each test.
    beforeEach(() => mkdirSync(output()));

    // A page's download is saved there under the page's own name, which no call gives.
    it("refuses every call while it holds a link anywhere, even calls that name no file", () => {
      // Make a subfolder.
      mkdirSync(join(output(), "shots"));

      // Put a broken link in it.
      symlink(join(outside, "not-yet.txt"), join(output(), "shots", "report.txt"));

      // A click is refused, and the link is named in the message, with either path separator.
      expect(call("browser_click", { element: "Download", ref: "e1" })).toMatch(/shots[\\/]report\.txt/);

      // A navigation is refused.
      expect(call("browser_navigate", { url: "http://localhost:20765/" })).not.toBeNull();

      // A snapshot is refused.
      expect(call("browser_snapshot")).not.toBeNull();
    });

    // Check new files.
    it("allows a new file, in it or in a real subfolder", () => {
      // Make a real subfolder.
      mkdirSync(join(output(), "shots"));

      // A new file, by relative path.
      expect(write(".playwright-mcp/x.md")).toBeNull();

      // A new file, by absolute path.
      expect(write(join(output(), "x.md"))).toBeNull();

      // A new file in the subfolder.
      expect(write(".playwright-mcp/shots/page.png")).toBeNull();

      // A new file in a subfolder that doesn't exist yet.
      expect(write(".playwright-mcp/new-folder/page.png")).toBeNull();

      // A call with no file.
      expect(call("browser_snapshot")).toBeNull();

      // A navigation.
      expect(call("browser_navigate", { url: "http://localhost:20765/" })).toBeNull();
    });

    // Check overwriting.
    it("allows overwriting an existing plain file", () => {
      // An existing file.
      writeFileSync(join(output(), "x.md"), "old");

      // A subfolder.
      mkdirSync(join(output(), "shots"));

      // An existing file in it.
      writeFileSync(join(output(), "shots", "page.png"), "old");

      // Overwriting the first is fine.
      expect(write(".playwright-mcp/x.md")).toBeNull();

      // Overwriting the second is fine.
      expect(write(".playwright-mcp/shots/page.png")).toBeNull();
    });

    // A broken link to the outside.
    it("refuses a broken link to a file outside the checkout", () => {
      // A link to a file that doesn't exist yet, outside the checkout.
      symlink(join(outside, "new.md"), join(output(), "x.md"));

      // Writing through it is refused.
      expect(write(".playwright-mcp/x.md")).not.toBeNull();
    });

    // A broken link to the inside.
    it("refuses a broken link to a file inside the checkout", () => {
      // A link to a file that doesn't exist yet, inside the checkout.
      symlink(join(root, "src", "new.ts"), join(output(), "x.md"));

      // Writing through it is refused.
      expect(write(".playwright-mcp/x.md")).not.toBeNull();
    });

    // Links to real files.
    it("refuses a link to an existing file elsewhere", () => {
      // A link to a file outside the checkout.
      symlink(join(outside, "target.md"), join(output(), "x.md"));

      // A link to .env.
      symlink(join(root, ".env"), join(output(), "env.md"));

      // Writing through the first is refused.
      expect(write(".playwright-mcp/x.md")).not.toBeNull();

      // Writing through the second is refused.
      expect(write(".playwright-mcp/env.md")).not.toBeNull();
    });

    // Links to files in the output folder.
    it("refuses a link to an existing file inside .playwright-mcp/", () => {
      // A real file.
      writeFileSync(join(output(), "real.md"), "");

      // A link to it.
      symlink(join(output(), "real.md"), join(output(), "x.md"));

      // Writing through the link is refused.
      expect(write(".playwright-mcp/x.md")).not.toBeNull();
    });

    // Links as subfolders.
    it("refuses a file under a subfolder that is a link", () => {
      // A link to the outside folder.
      symlink(outside, join(output(), "shots"));

      // A real subfolder.
      mkdirSync(join(output(), "real"));

      // A link to it.
      symlink(join(output(), "real"), join(output(), "inner"));

      // A new file under the first link is refused.
      expect(write(".playwright-mcp/shots/new.md")).not.toBeNull();

      // An existing file under the first link is refused.
      expect(write(".playwright-mcp/shots/target.md")).not.toBeNull();

      // A new file under the second link is refused.
      expect(write(".playwright-mcp/inner/new.md")).not.toBeNull();
    });

    // Hard links.
    it("refuses a file with a hard link elsewhere", () => {
      // A hard link to .env.
      linkSync(join(root, ".env"), join(output(), "x.md"));

      // A hard link to a file outside the checkout.
      linkSync(join(outside, "target.md"), join(output(), "y.md"));

      // Writing to the first is refused.
      expect(write(".playwright-mcp/x.md")).not.toBeNull();

      // Writing to the second is refused.
      expect(write(".playwright-mcp/y.md")).not.toBeNull();
    });

    // Hard links within the folder.
    it("refuses a file with a second name, even inside .playwright-mcp/", () => {
      // A real file.
      writeFileSync(join(output(), "real.md"), "");

      // A second name for it.
      linkSync(join(output(), "real.md"), join(output(), "x.md"));

      // Writing to the new name is refused.
      expect(write(".playwright-mcp/x.md")).not.toBeNull();

      // Writing to the original name is refused too.
      expect(write(".playwright-mcp/real.md")).not.toBeNull();
    });

    // Every writing tool.
    it("checks the filename of every tool that writes one", () => {
      // A link to .env.
      symlink(join(root, ".env"), join(output(), "x.md"));

      // Try each tool that writes a file.
      for (const tool of [
        // Snapshots.
        "browser_snapshot",
        // Screenshots.
        "browser_take_screenshot",
        // Console logs.
        "browser_console_messages",
        // Network logs.
        "browser_network_requests",
      ]) {
        // Writing through the link is refused.
        expect(call(tool, { filename: ".playwright-mcp/x.md" }), tool).not.toBeNull();
      }
    });
  });
});

// Group the tests for the database check.
describe("checkLocalDatabase", () => {
  // Check local databases.
  it("accepts Postgres databases on this machine", () => {
    // Try local database URLs.
    for (const url of [
      // A local Prisma dev server.
      "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
      // The `postgresql` scheme.
      "postgresql://postgres@localhost:5432/a_thousand_words",
      // By IPv4 address.
      "postgres://postgres:postgres@127.0.0.1:51214/template1",
      // By IPv6 address.
      "postgresql://postgres@[::1]:5432/db",
      // With no port.
      "postgres://localhost/db",
    ]) {
      // Each one is accepted.
      expect(() => checkLocalDatabase(url), url).not.toThrow();
    }
  });

  // Check the missing value.
  it("throws when DATABASE_URL is missing", () => {
    // Undefined.
    expect(() => checkLocalDatabase(undefined)).toThrow(/DATABASE_URL isn't set/);

    // Empty.
    expect(() => checkLocalDatabase("")).toThrow(/DATABASE_URL isn't set/);
  });

  // Check bad URLs.
  it("throws for a malformed URL", () => {
    // Try broken URLs.
    for (const url of ["not a url", "localhost:5432/db", "postgres://localhost:99999/db"]) {
      // Each one throws.
      expect(() => checkLocalDatabase(url), url).toThrow();
    }
  });

  // Check other protocols.
  it("throws for another protocol", () => {
    // Try other protocols.
    for (const url of [
      // MySQL.
      "mysql://root@localhost/db",
      // Prisma's hosted proxy.
      "prisma+postgres://localhost:51213/?api_key=x",
      // Plain HTTP.
      "http://localhost:5432/",
      // A file.
      "file:///tmp/db",
    ]) {
      // Each one throws, asking for a postgres:// URL.
      expect(() => checkLocalDatabase(url), url).toThrow(/postgres:\/\//);
    }
  });

  // Check remote hosts.
  it("throws for a database on any other host, naming it", () => {
    // A Neon database is refused, and the host is named.
    expect(() =>
      checkLocalDatabase("postgresql://user:pw@ep-x.eu-west-2.aws.neon.tech/neondb?sslmode=require"),
    ).toThrow(/ep-x\.eu-west-2\.aws\.neon\.tech/);

    // Try other remote or disguised hosts.
    for (const url of [
      // An ordinary remote host.
      "postgres://db.example.com/db",
      // A host that starts with "localhost".
      "postgres://localhost.evil.example/db",
      // "localhost" as a user name.
      "postgres://localhost@ep-x.eu-west-2.aws.neon.tech/db",
      // A private network address.
      "postgres://10.0.0.5/db",
      // The wildcard address.
      "postgres://0.0.0.0/db",
      // A remote host with "localhost" in the query.
      "postgres://ep-x.eu-west-2.aws.neon.tech/db?host=localhost",
    ]) {
      // Each one throws.
      expect(() => checkLocalDatabase(url), url).toThrow();
    }
  });
});

// Group the tests for the sign-in state.
describe("signedInState", () => {
  // Check the whole state.
  it("holds one Auth.js session cookie for localhost", () => {
    // A date with milliseconds.
    const expires = new Date("2026-11-01T12:34:56.789Z");

    // The state holds exactly one cookie.
    expect(signedInState("token-abc", expires)).toEqual({
      cookies: [
        {
          // The Auth.js cookie name.
          name: "authjs.session-token",
          // The token passed in.
          value: "token-abc",
          // Only for localhost.
          domain: "localhost",
          // For every path.
          path: "/",
          // The expiry in whole seconds.
          expires: Math.floor(expires.getTime() / 1000),
          // Hidden from page scripts.
          httpOnly: true,
          // Plain http is fine locally.
          secure: false,
          // Sent with same-site requests.
          sameSite: "Lax",
        },
      ],
      // No saved local storage.
      origins: [],
    });
  });

  // Check the expiry format.
  it("gives the expiry in whole Unix seconds", () => {
    // A date with 999 milliseconds.
    const [cookie] = signedInState("t", new Date(1_793_000_000_999)).cookies;

    // The milliseconds are dropped.
    expect(cookie.expires).toBe(1_793_000_000);

    // It's a whole number.
    expect(Number.isInteger(cookie.expires)).toBe(true);
  });
});

// The hook itself, run as Claude Code runs it: the hook input as JSON on stdin, and the checkout in
// CLAUDE_PROJECT_DIR. Its origins come from whichever checkout this runs in.
describe("mcp-guard.mjs", () => {
  // The folder this test file is in.
  const here = dirname(fileURLToPath(import.meta.url));

  // The checkout's top folder, from git.
  const checkout = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8" }).trim();

  // The hook script's path.
  const hook = join(checkout, ".claude", "hooks", "mcp-guard.mjs");

  // The dev server port for this checkout.
  const appPort = checkoutPort(currentWorktree(checkout), "app");

  // Run the hook with some input.
  function runHook(stdin: string, { projectDir = checkout as string | null } = {}) {
    // A copy of the environment.
    const env = { ...process.env };

    // Remove any inherited project folder.
    delete env.CLAUDE_PROJECT_DIR;

    // Set it if one was given.
    if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;

    // Run from another folder, so the hook has to find the checkout for itself.
    const result = spawnSync(process.execPath, ["--no-warnings", hook], {
      // Feed the input on stdin.
      input: stdin,
      // Use this environment.
      env,
      // Start in the temporary folder.
      cwd: tmpdir(),
      // Read output as text.
      encoding: "utf8",
      // Give up after 20 seconds.
      timeout: 20_000,
    });

    // Return the exit code and the error output.
    return { status: result.status, stderr: result.stderr };
  }

  // Build the JSON input for a tool call.
  const call = (tool_name: string, tool_input: Record<string, unknown>) =>
    // Include the tool name, its input and the working folder.
    JSON.stringify({ tool_name, tool_input, cwd: checkout });

  // Check an allowed call.
  it("allows navigating to this checkout's dev server", () => {
    // Navigate to the dev server.
    const result = runHook(call("mcp__playwright__browser_navigate", { url: `http://localhost:${appPort}/` }));

    // Nothing is printed.
    expect(result.stderr).toBe("");

    // The hook exits cleanly.
    expect(result.status).toBe(0);
  }, 30_000);

  // Check finding the checkout without the environment variable.
  it("finds the checkout from the input's cwd when CLAUDE_PROJECT_DIR isn't set", () => {
    // Navigate to the dev server, with no project folder given.
    const result = runHook(call("mcp__playwright__browser_navigate", { url: `http://localhost:${appPort}/` }), {
      projectDir: null,
    });

    // The hook exits cleanly.
    expect(result.status).toBe(0);
  }, 30_000);

  // Check a blocked call.
  it("blocks navigating elsewhere, with the reason on stderr", () => {
    // Navigate to another site.
    const result = runHook(call("mcp__playwright__browser_navigate", { url: "https://example.com/" }));

    // Exit code 2 means blocked.
    expect(result.status).toBe(2);

    // The reason names the URL.
    expect(result.stderr).toContain("https://example.com/");
  }, 30_000);

  // Check blocked tools.
  it("blocks the tools that run JavaScript", () => {
    // Call the evaluate tool.
    const result = runHook(call("mcp__playwright__browser_evaluate", { function: "() => document.cookie" }));

    // Exit code 2 means blocked.
    expect(result.status).toBe(2);

    // The reason names the tool.
    expect(result.stderr).toContain("browser_evaluate");
  }, 30_000);

  // Check blocked uploads.
  it("blocks uploading a file that isn't an image in the checkout", () => {
    // Try to upload .env.
    const result = runHook(call("mcp__playwright__browser_file_upload", { paths: [join(checkout, ".env")] }));

    // Exit code 2 means blocked.
    expect(result.status).toBe(2);

    // There's a reason.
    expect(result.stderr).not.toBe("");
  }, 30_000);

  // Check that other tools aren't affected.
  it("lets other tools through", () => {
    // Try tools that aren't Playwright's.
    for (const name of ["Bash", "Read", "mcp__other__browser_evaluate"]) {
      // Call the tool.
      const result = runHook(call(name, { command: "echo hi" }));

      // The hook lets it through.
      expect(result.status, name).toBe(0);
    }
  }, 30_000);

  // Check bad input.
  it("fails closed when its input isn't JSON", () => {
    // Try input that isn't valid JSON.
    for (const stdin of ["not json", "", '{"tool_name": "mcp__playwright__browser_navigate"']) {
      // Run the hook with it.
      const result = runHook(stdin);

      // Exit code 2 means blocked.
      expect(result.status, stdin).toBe(2);

      // The message says it blocked the call.
      expect(result.stderr, stdin).toMatch(/blocked/);
    }
  }, 30_000);

  // Check a missing checkout.
  it("fails closed when it can't find the checkout", () => {
    // Run the hook with no usable project folder.
    const result = runHook(
      // Input for a navigation, with the root as its working folder.
      JSON.stringify({
        // The tool called.
        tool_name: "mcp__playwright__browser_navigate",
        // Its input.
        tool_input: { url: `http://localhost:${appPort}/` },
        // A folder that isn't a checkout.
        cwd: "/",
      }),
      // And a project folder that isn't a checkout either.
      { projectDir: "/" },
    );

    // Exit code 2 means blocked.
    expect(result.status).toBe(2);
  }, 30_000);
});
