// The limits on the agent's browser, Playwright MCP (ADR 0026). MCP servers run outside Claude
// Code's sandbox, so these checks are the boundary: scripts/mcp-playwright.ts uses them to start the
// server, and .claude/hooks/mcp-guard.mjs to check each call. Node
// loads this file in the hook without a build step, so it uses only types that can be stripped, and
// imports nothing but Node's own modules.

// Import the Node file-system functions used below.
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";

// Import the Node path functions used below.
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
  // Click an element.
  "browser_click",

  // Close the browser.
  "browser_close",

  // Read the page's console messages.
  "browser_console_messages",

  // Drag one element onto another.
  "browser_drag",

  // Drop data or files onto an element.
  "browser_drop",

  // Upload files through a file chooser.
  "browser_file_upload",

  // Fill in several form fields at once.
  "browser_fill_form",

  // Find elements on the page.
  "browser_find",

  // Accept or dismiss a dialog.
  "browser_handle_dialog",

  // Hover over an element.
  "browser_hover",

  // Open a URL.
  "browser_navigate",

  // Go back one page.
  "browser_navigate_back",

  // Read one network request's details.
  "browser_network_request",

  // List the page's network requests.
  "browser_network_requests",

  // Press a key.
  "browser_press_key",

  // Resize the browser window.
  "browser_resize",

  // Choose an option in a dropdown.
  "browser_select_option",

  // Read the page's accessibility snapshot.
  "browser_snapshot",

  // Take a screenshot.
  "browser_take_screenshot",

  // Type text into an element.
  "browser_type",

  // Wait for text or a delay.
  "browser_wait_for",

  // List, open, close or select tabs.
  "browser_tabs",
];

/** Files the browser may upload: the image types the site takes (src/lib/uploads.ts). */
const UPLOAD_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * The origins the browser may open: the checkout's dev server and R2 mock, and the origin images
 * are served from (`R2_PUBLIC_URL`), which in the main checkout is the development bucket.
 */
export function browserOrigins(ports: { app: number; r2: number }, r2PublicUrl?: string) {
  // Start with the dev server and the R2 mock.
  const origins = [`http://localhost:${ports.app}`, `http://localhost:${ports.r2}`];

  // If images are served from somewhere else, allow that too.
  if (r2PublicUrl) {
    // Take just the origin (scheme, host and port) from the URL.
    const origin = new URL(r2PublicUrl).origin;

    // Add it unless it's already in the list.
    if (!origins.includes(origin)) origins.push(origin);
  }

  // Return the list.
  return origins;
}

/** Whether the browser may open `url`: only http(s) pages on one of `origins`. */
export function isAllowedUrl(url: string, origins: readonly string[]) {
  // The URL, once parsed.
  let parsed: URL;

  // Parsing can throw, so guard it.
  try {
    // Parse the URL.
    parsed = new URL(url);
  } catch {
    // Something that isn't a URL isn't allowed.
    return false;
  }

  // Allow only web pages, and only on the listed origins.
  return (parsed.protocol === "http:" || parsed.protocol === "https:") && origins.includes(parsed.origin);
}

/**
 * Where `path`, resolved against `root`, really is: symbolic links followed, so a link named
 * `x.png` that points at `.env` counts as `.env`. For a file that doesn't exist yet, the nearest
 * folder above it that does is followed instead.
 */
function realPath(root: string, path: string): string {
  // The full path, with `..` and `.` resolved.
  const full = resolve(root, path);

  // If it exists, follow any links to the real place.
  if (existsSync(full)) return realpathSync(full);

  // Otherwise look at its parent folder.
  const parent = dirname(full);

  // At the top of the file system, stop. Otherwise resolve the parent and add the file's name back.
  return parent === full ? full : join(realPath(root, parent), basename(full));
}

/** Whether `path`, resolved against `root` and with links followed, is inside `folder` (relative to `root`). */
function isInside(root: string, folder: string, path: string) {
  // The route from the real folder to the real path.
  const from = relative(realPath(root, folder), realPath(root, path));

  // Inside means the route is non-empty, doesn't climb out with `..`, and isn't absolute.
  return from !== "" && !from.startsWith("..") && !isAbsolute(from);
}

/** Whether `path` is a file with other names: a hard link can't be followed to see what it is. */
function hasOtherNames(root: string, path: string) {
  // The full path.
  const full = resolve(root, path);

  // It has other names if it exists and more than one name points at it.
  return existsSync(full) && statSync(full).nlink > 1;
}

/** The file's details without following a link, or null if there's nothing there, not even a broken link. */
function lstatOrNull(path: string) {
  // Reading can throw, so guard it.
  try {
    // Read the details of the path itself, not of what a link points to.
    return lstatSync(path);
  } catch {
    // Nothing is there.
    return null;
  }
}

/**
 * Whether the server may write `filename`: inside .playwright-mcp/, with no symbolic link on the way
 * down from .playwright-mcp itself, broken links included. Following links here would let a link
 * such as `.playwright-mcp -> ~` pass, since both sides would then lead to the same place.
 */
function isOutputFile(root: string, filename: string) {
  // The output folder's full path.
  const base = resolve(root, BROWSER_OUTPUT_DIR);

  // The route from it to the file.
  const rest = relative(base, resolve(root, filename));

  // Refuse the folder itself, and anything that climbs out of it.
  if (rest === "" || rest.startsWith("..") || isAbsolute(rest)) return false;

  // The path walked so far.
  let current = base;

  // Walk down from the folder itself, one part at a time.
  for (const part of ["", ...rest.split(sep)]) {
    // Step into the next part.
    current = join(current, part);

    // Look at it without following a link.
    const stats = lstatOrNull(current);

    // Nothing below it exists either.
    if (stats === null) return true;

    // A link on the way is not allowed.
    if (stats.isSymbolicLink()) return false;
  }

  // The file must not have other names.
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
  // The tool being called.
  tool: string,
  // The arguments of the call.
  input: Readonly<Record<string, unknown>>,
  // The allowed origins and the checkout's folder.
  { origins, root }: { origins: readonly string[]; root: string },
): string | null {
  // Refuse any tool not on the list.
  if (!BROWSER_TOOLS.includes(tool)) {
    // Say which one, and where the list is.
    return `${tool} isn't one of the browser tools the agent may use (src/lib/mcp.ts, ADR 0026).`;
  }

  // The server also writes files there under names no call gives: console logs, and downloads named
  // by the page. So the folder, and everything in it, must be free of links whatever the call.
  const outputDir = resolve(root, BROWSER_OUTPUT_DIR);

  // Look at the folder without following a link.
  const output = lstatOrNull(outputDir);

  // If something is there but it isn't a real folder, refuse.
  if (output !== null && !output.isDirectory()) {
    // Say how to fix it.
    return `${BROWSER_OUTPUT_DIR} must be a real folder, not a link or a file. Remove it, and the browser makes it again.`;
  }

  // If the folder exists, search it for links.
  if (output !== null) {
    // Find the first link anywhere inside it.
    const link = readdirSync(outputDir, { recursive: true, withFileTypes: true }).find((entry) =>
      // Keep entries that are symbolic links.
      entry.isSymbolicLink(),
    );

    // If there is one, refuse.
    if (link) {
      // Name the link so it can be removed.
      return `${BROWSER_OUTPUT_DIR} mustn't hold links, but ${relative(root, join(link.parentPath, link.name))} is one. Remove it first.`;
    }
  }

  // If the call opens a URL, check it.
  if ("url" in input) {
    // The URL as a string.
    const url = String(input.url);

    // Refuse URLs outside the allowed origins.
    if (!isAllowedUrl(url, origins)) {
      // Say what is allowed.
      return `The browser may only open this checkout's own pages (${origins.join(", ")}), not ${url}.`;
    }
  }

  // If the call writes a file, check where.
  if ("filename" in input && input.filename !== undefined) {
    // The file name as a string.
    const filename = String(input.filename);

    // Refuse files outside the output folder.
    if (!isOutputFile(root, filename)) {
      // Say where files should go.
      return `Browser files go in ${BROWSER_OUTPUT_DIR}/, for example ${posix.join(BROWSER_OUTPUT_DIR, "page.png")}, not ${filename}.`;
    }
  }

  // If the call uploads files, check each one.
  if ("paths" in input && input.paths !== undefined) {
    // The paths must be a list.
    if (!Array.isArray(input.paths)) return "paths must be a list of files.";

    // Check each path in turn.
    for (const item of input.paths) {
      // The path as a string.
      const path = String(item);

      // Whether it's inside a folder that must stay private.
      const hidden = [".claude", BROWSER_OUTPUT_DIR].some((folder) => isInside(root, folder, path));

      // Whether it really leads to an image file.
      const image = UPLOAD_EXTENSIONS.some((ext) => realPath(root, path).toLowerCase().endsWith(ext));

      // It must be absolute, inside the checkout, not hidden, an image, and without other names.
      if (!isAbsolute(path) || !isInside(root, ".", path) || hidden || !image || hasOtherNames(root, path)) {
        // Say what is allowed.
        return `The browser may only upload JPEG, PNG or WebP images from this checkout, not ${path}.`;
      }
    }
  }

  // Nothing wrong: the call may go ahead.
  return null;
}

/**
 * Throws unless `databaseUrl` is a Postgres database on this machine, so the browser's sign-in can
 * never write to Neon or any other host.
 */
export function checkLocalDatabase(databaseUrl: string | undefined): asserts databaseUrl is string {
  // It must be set.
  if (!databaseUrl) throw new Error("DATABASE_URL isn't set, in .env.local or .env.");

  // The URL, once parsed.
  let url: URL;

  // Parsing can throw, so guard it.
  try {
    // Parse the URL.
    url = new URL(databaseUrl);
  } catch {
    // It isn't a URL at all.
    throw new Error("DATABASE_URL isn't a valid URL.");
  }

  // It must be a Postgres URL.
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    // Say what it was.
    throw new Error(`DATABASE_URL must be a postgres:// URL, not ${url.protocol}//.`);
  }

  // It must point at this machine.
  if (!LOCAL_HOSTS.includes(url.hostname)) {
    // Say which host it named.
    throw new Error(`The browser only signs in with a database on this machine, not ${url.hostname}.`);
  }
}

/** The Playwright storage state that signs the browser in, given an Auth.js session token. */
export function signedInState(sessionToken: string, expires: Date) {
  // Return the state Playwright loads.
  return {
    // The browser's cookies.
    cookies: [
      {
        // The cookie Auth.js reads its session from.
        name: "authjs.session-token",

        // The session token.
        value: sessionToken,

        // Send it only to localhost.
        domain: "localhost",

        // Send it with every path.
        path: "/",

        // When it expires, in seconds since 1970.
        expires: Math.floor(expires.getTime() / 1000),

        // Hide it from page scripts.
        httpOnly: true,

        // Allow plain http, since this is local.
        secure: false,

        // Send it with same-site requests and top-level navigations.
        sameSite: "Lax",
      },
    ],

    // No saved local storage.
    origins: [],
  };
}
