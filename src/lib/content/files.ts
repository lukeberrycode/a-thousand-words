import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BASELINE } from "./check";
import type { ContentFile, Operation } from "./operations";
import { checkSource } from "./source";

/** Where the content files live, relative to the repository root. */
export const CONTENT_DIR = "prisma/content";

/**
 * Every content file in `dir`, in the order they apply: by name, so by number. Each file but the
 * baseline must be plain data (source.ts), checked before it's imported, so no file can run code.
 */
export async function loadContentFiles(dir = CONTENT_DIR): Promise<ContentFile[]> {
  const names = readdirSync(dir)
    .filter((f) => /^\d{4}-.*\.ts$/.test(f))
    .sort();
  const files: ContentFile[] = [];
  for (const file of names) {
    const name = file.replace(/\.ts$/, "");
    const path = resolve(join(dir, file));
    if (name !== BASELINE) {
      const problems = checkSource(name, readFileSync(path, "utf8"));
      if (problems.length > 0) throw new Error(`${dir}/${file} isn't plain data:\n  ${problems.join("\n  ")}`);
    }
    const mod: { operations?: Operation[] } = await import(pathToFileURL(path).href);
    if (!Array.isArray(mod.operations)) throw new Error(`${dir}/${file} doesn't export \`operations\`.`);
    files.push({ name, operations: mod.operations });
  }
  return files;
}
