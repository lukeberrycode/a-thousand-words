// The limits on the agent's browser, Playwright MCP (ADR 0026). MCP servers run outside Claude
// Code's sandbox, so these checks are the boundary: scripts/mcp-playwright.ts uses them to start the
// server, and .claude/hooks/mcp-guard.mjs to check each call. Node
// loads this file in the hook without a build step, so it uses only types that can be stripped, and
// imports nothing but Node's own modules.

import { isAbsolute, posix, relative, resolve } from "node:path";

/** Host names that mean this machine. */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Where Playwright MCP writes its files: snapshots, screenshots and the signed-in session. */
export const BROWSER_OUTPUT_DIR = ".playwright-mcp";

/**
 * The Playwright MCP tools the agent may call, for the pinned version (0.0.80). Any other tool is
 * refused, so a new tool in a later version stays off until someone checks it. Left out on purpose:
 * `browser_evaluate` and `browser_run_code_unsafe`, which run any JavaScript in the page or in the
 * server, outside the sandbox.
 */
export const BROWSER_TOOLS = [
  "browser_click",
  "browser_close",
  "browser_console_messages",
  "browser_drag",
  "browser_drop",
  "browser_file_upload",
  "browser_fill_form",
  "browser_find",
  "browser_handle_dialog",
  "browser_hover",
  "browser_navigate",
  "browser_navigate_back",
  "browser_network_request",
  "browser_network_requests",
  "browser_press_key",
  "browser_resize",
  "browser_select_option",
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_type",
  "browser_wait_for",
  "browser_tabs",
];

/** Files the browser may upload: the image types the site takes (src/lib/uploads.ts). */
const UPLOAD_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * The origins the browser may open: the checkout's dev server and R2 mock, and the origin images
 * are served from (`R2_PUBLIC_URL`), which in the main checkout is the development bucket.
 */
export function browserOrigins(ports: { app: number; r2: number }, r2PublicUrl?: string) {
  const origins = [`http://localhost:${ports.app}`, `http://localhost:${ports.r2}`];
  if (r2PublicUrl) {
    const origin = new URL(r2PublicUrl).origin;
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

/** Whether the browser may open `url`: only http(s) pages on one of `origins`. */
export function isAllowedUrl(url: string, origins: readonly string[]) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (parsed.protocol === "http:" || parsed.protocol === "https:") && origins.includes(parsed.origin);
}

/** Whether `path`, resolved against `root`, is inside `folder` (itself relative to `root`). */
function isInside(root: string, folder: string, path: string) {
  const from = relative(resolve(root, folder), resolve(root, path));
  return from !== "" && !from.startsWith("..") && !isAbsolute(from);
}

/**
 * Why a Playwright MCP call must be refused, or null if it may go ahead. `tool` is the name without
 * the `mcp__playwright__` prefix, `root` the checkout's folder.
 * - The tool must be one of BROWSER_TOOLS.
 * - Every `url` must be on one of `origins`.
 * - Every `filename` it writes must be inside .playwright-mcp/.
 * - Every file in `paths` it uploads must be an image inside the checkout, outside .claude/ and
 *   .playwright-mcp/, so it can't send a log or the signed-in session to the site.
 */
export function browserCallProblem(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  { origins, root }: { origins: readonly string[]; root: string },
): string | null {
  if (!BROWSER_TOOLS.includes(tool)) {
    return `${tool} isn't one of the browser tools the agent may use (src/lib/mcp.ts, ADR 0026).`;
  }
  if ("url" in input) {
    const url = String(input.url);
    if (!isAllowedUrl(url, origins)) {
      return `The browser may only open this checkout's own pages (${origins.join(", ")}), not ${url}.`;
    }
  }
  if ("filename" in input && input.filename !== undefined) {
    const filename = String(input.filename);
    if (!isInside(root, BROWSER_OUTPUT_DIR, filename)) {
      return `Browser files go in ${BROWSER_OUTPUT_DIR}/, for example ${posix.join(BROWSER_OUTPUT_DIR, "page.png")}, not ${filename}.`;
    }
  }
  if ("paths" in input && input.paths !== undefined) {
    if (!Array.isArray(input.paths)) return "paths must be a list of files.";
    for (const item of input.paths) {
      const path = String(item);
      const image = UPLOAD_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext));
      const hidden = [".claude", BROWSER_OUTPUT_DIR].some((folder) => isInside(root, folder, path));
      if (!isAbsolute(path) || !isInside(root, ".", path) || hidden || !image) {
        return `The browser may only upload JPEG, PNG or WebP images from this checkout, not ${path}.`;
      }
    }
  }
  return null;
}

/**
 * Throws unless `databaseUrl` is a Postgres database on this machine, so the browser's sign-in can
 * never write to Neon or any other host.
 */
export function checkLocalDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error("DATABASE_URL isn't set, in .env.local or .env.");
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL isn't a valid URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`DATABASE_URL must be a postgres:// URL, not ${url.protocol}//.`);
  }
  if (!LOCAL_HOSTS.includes(url.hostname)) {
    throw new Error(`The browser only signs in with a database on this machine, not ${url.hostname}.`);
  }
}

/** The Playwright storage state that signs the browser in, given an Auth.js session token. */
export function signedInState(sessionToken: string, expires: Date) {
  return {
    cookies: [
      {
        name: "authjs.session-token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
        expires: Math.floor(expires.getTime() / 1000),
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
}
