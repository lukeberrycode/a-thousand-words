// Runs the content runner (src/lib/content/runner.ts) for e2e/content.spec.ts, in its own tsx
// process: see content.ts for why. Reads a ContentRequest as JSON on stdin, and
// prints the result as JSON on a line starting RESULT_PREFIX.
//
// It uses the tests' database and bucket: DATABASE_URL and the R2 mock's settings come from the
// Playwright worker's environment. Downloads are faked with test pictures (see sourceFor).

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { applyFile, contentStatus, loadState } from "@/lib/content/runner";
import { RESULT_PREFIX, type ApplyResult, type ContentRequest, type StatusResult } from "./content";
import { picture } from "./pictures";
import { deleteObject, putObject } from "./services";

async function main(): Promise<ApplyResult | StatusResult> {
  const input = await new Promise<string>((resolve) => {
    let text = "";
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve(text));
  });
  const request = JSON.parse(input) as ContentRequest;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    if (request.mode === "status") {
      const status = await contentStatus(db, request.files);
      return {
        applied: status.applied.map((a) => a.name),
        pending: status.pending.map((p) => p.name),
        problems: status.problems,
      };
    }

    const puts: string[] = [];
    const removes: string[] = [];
    const downloads: string[] = [];
    const log: string[] = [];
    const plan = await applyFile(db, request.file, await loadState(db), {
      yes: request.yes,
      delayMs: 0,
      log: (line) => log.push(line),
      download: async (source) => {
        downloads.push(source);
        const seed = /File:e2e-(\d+)\.jpg$/.exec(source)?.[1];
        return seed ? (await picture(Number(seed), { format: "jpeg" })).buffer : null;
      },
      store: {
        put: async (key, bytes) => {
          puts.push(key);
          await putObject(key, bytes, "image/jpeg");
        },
        remove: async (key) => {
          removes.push(key);
          await deleteObject(key);
        },
      },
    });
    return {
      changes: plan.changes.map((c) => c.text),
      skipped: plan.skipped,
      unchanged: plan.unchanged,
      unmatched: plan.unmatched,
      puts,
      removes,
      downloads,
      log,
    };
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (result) => {
    console.log(RESULT_PREFIX + JSON.stringify(result));
    process.exit(0);
  },
  (err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  },
);
