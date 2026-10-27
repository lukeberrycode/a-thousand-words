// `npm run dev`: `next dev` on this checkout's port, 3000 in the main checkout and a fixed port
// worked out from the folder name in a worktree (ADR 0020). Next reads PORT before it loads .env
// files, so the port has to be passed here.
//
// When R2_ENDPOINT points at this machine, as in a worktree set up with `--mock`, it also starts the
// R2 mock there, keeping objects in .r2-mock/, and stops it with Next (ADR 0024). A mock already
// answering on that port, for example one left by a dev server that was killed outright, is reused.

import "./load-env";
import { spawn, type ChildProcess } from "node:child_process";
import { localR2Port, usesLocalR2 } from "../src/lib/mock-env";
import { devPort } from "../src/lib/worktree";
import { currentWorktree } from "./checkout";

const children: ChildProcess[] = [];

// tsx runs this as CommonJS, which has no top-level await.
void main();

async function main() {
  if (usesLocalR2(process.env)) {
    const r2Port = String(localR2Port(process.env.R2_ENDPOINT!));
    const running = await fetch(`http://localhost:${r2Port}/`).then(
      (res) => res.ok,
      () => false,
    );
    if (!running) {
      // In its own process group, because tsx starts a child of its own: stop() signals the group.
      const args = ["scripts/r2-mock.ts", "--port", r2Port, "--dir", ".r2-mock"];
      children.push(spawn("tsx", args, { stdio: "inherit", detached: true }));
    }
  }

  const port = devPort(currentWorktree());
  children.push(spawn("next", ["dev", "--port", String(port), ...process.argv.slice(2)], { stdio: "inherit" }));

  // SIGHUP too: closing the terminal doesn't reach the mock, which has its own process group.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => children.forEach((child) => stop(child, signal)));
  }
  // If either one stops, stop the other: a dev server without its storage only half works.
  for (const child of children) {
    // A missing binary is an "error", not an "exit": say so, rather than crash with a stack trace.
    child.on("error", (err: NodeJS.ErrnoException) => {
      const hint = err.code === "ENOENT" ? " Has `npm install` been run here?" : "";
      console.error(`${child.spawnfile} failed (${err.message}).${hint}`);
      for (const other of children) if (other !== child) stop(other, "SIGTERM");
      process.exit(1);
    });
    child.on("exit", (code, signal) => {
      for (const other of children) if (other !== child) stop(other, "SIGTERM");
      process.exit(code ?? (signal ? 1 : 0));
    });
  }
}

function stop(child: ChildProcess, signal: NodeJS.Signals) {
  try {
    if (child.spawnargs.includes("scripts/r2-mock.ts")) process.kill(-child.pid!, signal);
    else child.kill(signal);
  } catch {
    // Already stopped.
  }
}
