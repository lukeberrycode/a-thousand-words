// `npm run dev`: `next dev` on this checkout's port, 3000 in the main checkout and a fixed port
// worked out from the folder name in a worktree (ADR 0020). Next reads PORT before it loads .env
// files, so the port has to be passed here.
//
// When R2_ENDPOINT points at this machine, as in a worktree set up with `--mock`, it also starts the
// R2 mock there, keeping objects in .r2-mock/, and stops it with Next (ADR 0024).

import "./load-env";
import { spawn, type ChildProcess } from "node:child_process";
import { localR2Port, usesLocalR2 } from "../src/lib/mock-env";
import { devPort } from "../src/lib/worktree";
import { currentWorktree } from "./checkout";

const port = devPort(currentWorktree());
const children: ChildProcess[] = [];

if (usesLocalR2(process.env)) {
  const r2Port = String(localR2Port(process.env.R2_ENDPOINT!));
  children.push(spawn("tsx", ["scripts/r2-mock.ts", "--port", r2Port, "--dir", ".r2-mock"], { stdio: "inherit" }));
}

const next = spawn("next", ["dev", "--port", String(port), ...process.argv.slice(2)], { stdio: "inherit" });
children.push(next);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => children.forEach((child) => child.kill(signal)));
}
// If either one stops, stop the other: a dev server without its storage only half works.
for (const child of children) {
  child.on("exit", (code, signal) => {
    for (const other of children) if (other !== child) other.kill("SIGTERM");
    process.exit(code ?? (signal ? 1 : 0));
  });
}
