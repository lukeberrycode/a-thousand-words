// Each git worktree gets its own dev server port and its own local database, so parallel checkouts
// don't test each other's code or migrate each other's database (ADR 0020). These are the pure
// parts; scripts/checkout.ts asks git which checkout is running.

/** The main checkout keeps the port and database it always had. */
export const MAIN_PORT = 3000;
export const MAIN_DATABASE = "a-thousand-words";

// Worktree ports are 20000 to 20999: clear of the usual dev server ports, and below the range
// Linux hands out for outgoing connections (32768 and up).
const FIRST_PORT = 20000;
const PORT_COUNT = 1000;

/** A worktree's name: its folder name, made safe for a `prisma dev` server name. */
export function worktreeName(folder: string) {
  return folder
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** FNV-1a: a small hash that gives the same number for a name on every machine and Node version. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The dev server port: 3000 for the main checkout (null), otherwise fixed by the worktree's name. */
export function devPort(worktree: string | null) {
  return worktree === null ? MAIN_PORT : FIRST_PORT + (hash(worktree) % PORT_COUNT);
}

/** The `prisma dev` server name for the checkout's database. */
export function databaseName(worktree: string | null) {
  return worktree === null ? MAIN_DATABASE : `${MAIN_DATABASE}-${worktree}`;
}

/** Sets `DATABASE_URL` in the text of an env file, keeping every other line. */
export function withDatabaseUrl(envFile: string, url: string) {
  const kept = envFile.split("\n").filter((line) => !/^\s*DATABASE_URL\s*=/.test(line));
  return `${kept.join("\n").trimEnd()}\nDATABASE_URL="${url}"\n`.trimStart();
}
