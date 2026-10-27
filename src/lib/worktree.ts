// Each git worktree gets its own dev server port and its own local database, so parallel checkouts
// don't test each other's code or migrate each other's database (ADR 0020). These are the pure
// parts; scripts/checkout.ts asks git which checkout is running.

/** The main checkout keeps the port and database it always had. */
export const MAIN_PORT = 3000;
export const MAIN_DATABASE = "a-thousand-words";

// Worktree dev server ports are 20000 to 20999: clear of the usual dev server ports, and below the
// range Linux hands out for outgoing connections (32768 and up).
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
  return checkoutPort(worktree, "app");
}

// Each checkout also runs a local R2 mock beside its dev server, and the system tests start their
// own app server and mock, so they never test a server someone else started (ADR 0024). Each kind
// of server has its own band of 1000 ports, at the same offset as the dev server: 20000 to 23999.
const BANDS = { app: 0, r2: 1000, testApp: 2000, testR2: 3000 };
const MAIN_PORTS = { app: MAIN_PORT, r2: 3001, testApp: 3100, testR2: 3101 };

/** Which server a port is for: the dev server, its R2 mock, or the system tests' app and mock. */
export type PortKind = keyof typeof BANDS;

/** A checkout's port for one kind of server. The main checkout (null) has fixed ports. */
export function checkoutPort(worktree: string | null, kind: PortKind) {
  if (worktree === null) return MAIN_PORTS[kind];
  return FIRST_PORT + BANDS[kind] + (hash(worktree) % PORT_COUNT);
}

/** The `prisma dev` server name for the checkout's database. */
export function databaseName(worktree: string | null) {
  return worktree === null ? MAIN_DATABASE : `${MAIN_DATABASE}-${worktree}`;
}

/** Sets `DATABASE_URL` in the text of an env file, keeping every other line. */
export function withDatabaseUrl(envFile: string, url: string) {
  return withEnvValues(envFile, { DATABASE_URL: url });
}

/** Sets each of `values` in the text of an env file, at the end, keeping every other line. */
/**
 * The TCP connection string in `prisma dev` output. A `prisma+postgres://` URL there is skipped:
 * plain `postgres://` matching would take its tail, which isn't a working DATABASE_URL.
 */
export function tcpDatabaseUrl(output: string): string | undefined {
  return output.match(/(?<![\w+])postgres(?:ql)?:\/\/[^\s"']+/)?.[0];
}

export function withEnvValues(envFile: string, values: Readonly<Record<string, string>>) {
  const names = Object.keys(values);
  const added = names.map((name) => `${name}="${values[name]}"`).join("\n");
  return `${withoutEnvValues(envFile, names).trimEnd()}\n${added}\n`.trimStart();
}

/** Removes the lines that set any of `names` from the text of an env file, keeping every other line. */
export function withoutEnvValues(envFile: string, names: readonly string[]) {
  return envFile
    .split("\n")
    .filter((line) => !names.some((name) => new RegExp(`^\\s*${name}\\s*=`).test(line)))
    .join("\n");
}
