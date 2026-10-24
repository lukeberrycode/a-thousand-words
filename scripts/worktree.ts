// Gives a git worktree its own local database, so a migration on one branch doesn't change another
// branch's database (ADR 0020). The dev server port needs no setup: it's worked out from the folder
// name each time (src/lib/worktree.ts).
//
//   npm run worktree:setup      in a worktree, after `npm install`: copies .env from the main
//                               checkout if missing, starts the worktree's `prisma dev` server,
//                               points .env.local at it, and applies the migrations and the
//                               content files (ADR 0026). Safe to re-run, for example after a
//                               restart.
//   npm run worktree:setup -- --mock
//                               the same, but with no secrets: instead of copying .env, it points
//                               .env.local at a local R2 mock and dummy auth values, and loads the
//                               content's paintings into the mock (ADR 0024). `npm run dev` then
//                               starts the mock too. GitHub sign-in doesn't work in such a
//                               worktree. agent:implement uses this.
//   npm run worktree:teardown   in a worktree, before removing it: deletes its database.

import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { MOCK_AUTH_ENV, mockR2Env } from "../src/lib/mock-env";
import {
  checkoutPort,
  databaseName,
  devPort,
  withEnvValues,
  withoutEnvValues,
  worktreeName,
} from "../src/lib/worktree";
import { checkoutFolders, currentWorktree } from "./checkout";

function run(command: string, args: string[]) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const worktree = currentWorktree();
if (worktree === null) {
  fail("This is the main checkout. It uses port 3000 and the a-thousand-words database: there's nothing to set up.");
}
const database = databaseName(worktree);
const port = devPort(worktree);

if (process.argv[2] === "teardown") {
  run("npx", ["--no-install", "prisma", "dev", "rm", database, "--force"]);
  console.log(`Removed the ${database} database.`);
  process.exit(0);
}

// Two worktree folders whose names hash to the same port would test each other's dev server.
const [main, ...others] = checkoutFolders();
for (const folder of others) {
  const other = worktreeName(basename(folder));
  if (folder !== process.cwd() && other !== worktree && devPort(other) === port) {
    fail(`${folder} also uses port ${port}. Rename one of the worktree folders.`);
  }
  if (folder !== process.cwd() && other === worktree) {
    fail(`${folder} has the same name, so it would share this worktree's database. Rename one of them.`);
  }
}

const mock = process.argv.includes("--mock");
const r2Port = checkoutPort(worktree, "r2");

if (!mock && !existsSync(".env")) {
  if (!existsSync(join(main, ".env"))) fail(`No .env here or in ${main}. See .env.example.`);
  copyFileSync(join(main, ".env"), ".env");
  console.log(`Copied .env from ${main}.`);
}

// Starts the server, or finds it already running, and prints its connection string.
const output = run("npx", ["--no-install", "prisma", "dev", "--name", database, "--detach"]);
const url = output.match(/postgres:\/\/\S+/)?.[0];
if (!url) fail(`prisma dev didn't print a connection string:\n${output}`);
const values = mock ? { DATABASE_URL: url, ...mockR2Env(r2Port), ...MOCK_AUTH_ENV } : { DATABASE_URL: url };
// Without --mock, drop any mock values an earlier `--mock` setup left, or they'd still win over .env.
const mockNames = Object.keys({ ...mockR2Env(r2Port), ...MOCK_AUTH_ENV });
const previous = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const kept = mock ? previous : withoutEnvValues(previous, mockNames);
writeFileSync(".env.local", withEnvValues(kept, values));

execFileSync("npx", ["--no-install", "prisma", "migrate", "deploy"], { stdio: "inherit" });
// tsx runs this as CommonJS, which has no top-level await.
void loadContentAndFinish();

async function loadContentAndFinish() {
  const stopMock = mock ? await startMock() : () => {};
  try {
    execFileSync("npx", ["--no-install", "tsx", "scripts/content.ts", "apply", "--yes"], { stdio: "inherit" });
  } finally {
    stopMock();
  }
  const storage = mock ? `R2 mock http://localhost:${r2Port}` : "R2 from .env";
  console.log(
    `\nWorktree ${worktree} is ready: database ${database}, ${storage}, dev server http://localhost:${port}.`,
  );
}

/** Starts the R2 mock for the content files, unless one is already running here. Returns how to stop it. */
async function startMock() {
  const up = () =>
    fetch(`http://localhost:${r2Port}/`).then(
      (res) => res.ok,
      () => false,
    );
  if (await up()) return () => {};
  // In its own process group: npx and tsx each start a child, and killing the group stops them all.
  const child = spawn(
    "npx",
    ["--no-install", "tsx", "scripts/r2-mock.ts", "--port", String(r2Port), "--dir", ".r2-mock"],
    { stdio: "ignore", detached: true },
  );
  const stop = () => {
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      // Already stopped.
    }
  };
  for (let i = 0; i < 100 && !(await up()); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!(await up())) {
    stop();
    fail(`The R2 mock didn't start on port ${r2Port}.`);
  }
  return stop;
}
