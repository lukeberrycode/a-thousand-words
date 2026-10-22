// `npm run dev`: `next dev` on this checkout's port, 3000 in the main checkout and a fixed port
// worked out from the folder name in a worktree (ADR 0020). Next reads PORT before it loads .env
// files, so the port has to be passed here.

import { spawn } from "node:child_process";
import { devPort } from "../src/lib/worktree";
import { currentWorktree } from "./checkout";

const port = devPort(currentWorktree());
const next = spawn("next", ["dev", "--port", String(port), ...process.argv.slice(2)], { stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => next.kill(signal));
next.on("error", (err) => {
  console.error(`Couldn't start next dev (${err.message}). Has \`npm install\` been run here?`);
  process.exit(1);
});
next.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
