#!/usr/bin/env node
// PreToolUse hook: a second line behind the deny rules in .claude/settings.json (ADR 0015).
// Blocks edits to env files and the lock file, and pushes to main, which a deny rule can't fully
// catch (a bare `git push` while on main). Exit 2 blocks the call and shows the reason to Claude.
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const input = JSON.parse(
  await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }),
);

function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

const { tool_name: tool, tool_input: args = {}, cwd } = input;

if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
  const name = basename(args.file_path ?? args.notebook_path ?? "");
  if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") {
    block(`${name} holds secrets: edit it by hand, not through Claude. Document new variables in .env.example.`);
  }
  if (name === "package-lock.json") block("Change package-lock.json through npm (npm install), not by editing it.");
}

if (tool === "Bash") {
  const command = String(args.command ?? "");
  for (const part of command.split(/&&|\|\||;|\n/)) {
    const words = part.trim().split(/\s+/);
    const at = words.indexOf("push");
    if (words[0] !== "git" || at < 0) continue;
    const rest = words.slice(at + 1);
    if (rest.some((w) => /^(-f|--force|--force-with-lease.*|--mirror|--delete|-d)$/.test(w))) {
      block("Force pushes and branch deletes on the remote are for the owner to run.");
    }
    const refs = rest.filter((w) => !w.startsWith("-")).slice(1);
    let branch = "";
    try {
      branch = execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" }).trim();
    } catch {}
    const toMain = refs.some((r) => /(^|:)(refs\/heads\/)?main$/.test(r) || (r === "HEAD" && branch === "main"));
    if (toMain || (refs.length === 0 && branch === "main")) {
      block("Pushing to main deploys the live site, so the owner does it. Push a branch and open a pull request.");
    }
  }
}
