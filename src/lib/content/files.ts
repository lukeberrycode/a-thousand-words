import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ContentFile, Operation } from "./operations";

/** Where the content files live, relative to the repository root. */
export const CONTENT_DIR = "prisma/content";

/** Every content file in `dir`, in the order they apply: by name, so by number. */
export async function loadContentFiles(dir = CONTENT_DIR): Promise<ContentFile[]> {
  const names = readdirSync(dir)
    .filter((f) => /^\d{4}-.*\.ts$/.test(f))
    .sort();
  const files: ContentFile[] = [];
  for (const file of names) {
    const mod: { operations?: Operation[] } = await import(pathToFileURL(resolve(join(dir, file))).href);
    if (!Array.isArray(mod.operations)) throw new Error(`${dir}/${file} doesn't export \`operations\`.`);
    files.push({ name: file.replace(/\.ts$/, ""), operations: mod.operations });
  }
  return files;
}
