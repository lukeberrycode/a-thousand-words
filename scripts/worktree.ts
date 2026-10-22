// Gives a git worktree its own local database, so a migration on one branch doesn't change another
// branch's database (ADR 0020). The dev server port needs no setup: it's worked out from the folder
// name each time (src/lib/worktree.ts).
//
//   npm run worktree:setup      in a worktree, after `npm install`: copies .env from the main
//                               checkout if missing, starts the worktree's `prisma dev` server,
//                               points .env.local at it, applies the migrations and seeds it.
//                               Safe to re-run, for example after a restart.
//   npm run worktree:teardown   in a worktree, before removing it: deletes its database.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { databaseName, devPort, worktreeName, withDatabaseUrl } from "../src/lib/worktree";
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

if (!existsSync(".env")) {
  if (!existsSync(join(main, ".env"))) fail(`No .env here or in ${main}. See .env.example.`);
  copyFileSync(join(main, ".env"), ".env");
  console.log(`Copied .env from ${main}.`);
}

// Starts the server, or finds it already running, and prints its connection string.
const output = run("npx", ["--no-install", "prisma", "dev", "--name", database, "--detach"]);
const url = output.match(/postgres:\/\/\S+/)?.[0];
if (!url) fail(`prisma dev didn't print a connection string:\n${output}`);
writeFileSync(".env.local", withDatabaseUrl(existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "", url));

execFileSync("npx", ["--no-install", "prisma", "migrate", "deploy"], { stdio: "inherit" });
execFileSync("npx", ["--no-install", "tsx", "prisma/seed.ts", "--yes"], { stdio: "inherit" });

console.log(`\nWorktree ${worktree} is ready: database ${database}, dev server http://localhost:${port}.`);
