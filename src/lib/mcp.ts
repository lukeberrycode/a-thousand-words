// The limits on the agent's browser, Playwright MCP (ADR 0026). MCP servers run outside Claude
// Code's sandbox, so these checks are the boundary: scripts/mcp-playwright.ts uses them to start the
// server, and .claude/hooks/mcp-guard.mjs to check each call. Node
// loads this file in the hook without a build step, so it uses only types that can be stripped, and
// imports nothing but Node's own modules.

import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

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

/**
 * Where `path`, resolved against `root`, really is: symbolic links followed, so a link named
 * `x.png` that points at `.env` counts as `.env`. For a file that doesn't exist yet, the nearest
 * folder above it that does is followed instead.
 */
function realPath(root: string, path: string): string {
  const full = resolve(root, path);
  if (existsSync(full)) return realpathSync(full);
  const parent = dirname(full);
  return parent === full ? full : join(realPath(root, parent), basename(full));
}

/** Whether `path`, resolved against `root` and with links followed, is inside `folder` (relative to `root`). */
function isInside(root: string, folder: string, path: string) {
  const from = relative(realPath(root, folder), realPath(root, path));
  return from !== "" && !from.startsWith("..") && !isAbsolute(from);
}

/** Whether `path` is a file with other names: a hard link can't be followed to see what it is. */
function hasOtherNames(root: string, path: string) {
  const full = resolve(root, path);
  return existsSync(full) && statSync(full).nlink > 1;
}

/** The file's details without following a link, or null if there's nothing there, not even a broken link. */
function lstatOrNull(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/**
 * Whether the server may write `filename`: inside .playwright-mcp/, with no symbolic link on the way
 * down from .playwright-mcp itself, broken links included. Following links here would let a link
 * such as `.playwright-mcp -> ~` pass, since both sides would then lead to the same place.
 */
function isOutputFile(root: string, filename: string) {
  const base = resolve(root, BROWSER_OUTPUT_DIR);
  const rest = relative(base, resolve(root, filename));
  if (rest === "" || rest.startsWith("..") || isAbsolute(rest)) return false;
  let current = base;
  for (const part of ["", ...rest.split(sep)]) {
    current = join(current, part);
    const stats = lstatOrNull(current);
    if (stats === null) return true; // Nothing below it exists either.
    if (stats.isSymbolicLink()) return false;
  }
  return !hasOtherNames(root, filename);
}

/**
 * Why a Playwright MCP call must be refused, or null if it may go ahead. `tool` is the name without
 * the `mcp__playwright__` prefix, `root` the checkout's folder.
 * - The tool must be one of BROWSER_TOOLS.
 * - Every `url` must be on one of `origins`.
 * - Every `filename` it writes must be inside .playwright-mcp/.
 * - Every file in `paths` it uploads must be an image inside the checkout, outside .claude/ and
 *   .playwright-mcp/, so it can't send a log or the signed-in session to the site.
 * Links are the way round these checks, since the agent can make one with `ln` and the server runs
 * outside the sandbox. So uploads are checked where they really lead, with links followed; files
 * written must have no link on the way, and .playwright-mcp itself must be a real folder; and a file
 * with hard links is refused. A link made between this check and the call isn't caught.
 * `browser_drop`'s `data` isn't checked: a dropped URL is only text, and opening it would still need
 * a navigation, which is checked.
 */
export function browserCallProblem(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  { origins, root }: { origins: readonly string[]; root: string },
): string | null {
  if (!BROWSER_TOOLS.includes(tool)) {
    return `${tool} isn't one of the browser tools the agent may use (src/lib/mcp.ts, ADR 0026).`;
  }
  // The server also writes files there under names no call gives: console logs, and downloads named
  // by the page. So the folder, and everything in it, must be free of links whatever the call.
  const outputDir = resolve(root, BROWSER_OUTPUT_DIR);
  const output = lstatOrNull(outputDir);
  if (output !== null && !output.isDirectory()) {
    return `${BROWSER_OUTPUT_DIR} must be a real folder, not a link or a file. Remove it, and the browser makes it again.`;
  }
  if (output !== null) {
    const link = readdirSync(outputDir, { recursive: true, withFileTypes: true }).find((entry) =>
      entry.isSymbolicLink(),
    );
    if (link) {
      return `${BROWSER_OUTPUT_DIR} mustn't hold links, but ${relative(root, join(link.parentPath, link.name))} is one. Remove it first.`;
    }
  }
  if ("url" in input) {
    const url = String(input.url);
    if (!isAllowedUrl(url, origins)) {
      return `The browser may only open this checkout's own pages (${origins.join(", ")}), not ${url}.`;
    }
  }
  if ("filename" in input && input.filename !== undefined) {
    const filename = String(input.filename);
    if (!isOutputFile(root, filename)) {
      return `Browser files go in ${BROWSER_OUTPUT_DIR}/, for example ${posix.join(BROWSER_OUTPUT_DIR, "page.png")}, not ${filename}.`;
    }
  }
  if ("paths" in input && input.paths !== undefined) {
    if (!Array.isArray(input.paths)) return "paths must be a list of files.";
    for (const item of input.paths) {
      const path = String(item);
      const hidden = [".claude", BROWSER_OUTPUT_DIR].some((folder) => isInside(root, folder, path));
      const image = UPLOAD_EXTENSIONS.some((ext) => realPath(root, path).toLowerCase().endsWith(ext));
      if (!isAbsolute(path) || !isInside(root, ".", path) || hidden || !image || hasOtherNames(root, path)) {
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
export function checkLocalDatabase(databaseUrl: string | undefined): asserts databaseUrl is string {
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
