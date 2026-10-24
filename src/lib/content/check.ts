import { checkBody, checkRegion } from "@/lib/annotations";
import { MAX_PAINTINGS_PER_FILE, type ContentFile, type Operation } from "./operations";

// Checks on the content files themselves, before any database is involved (ADR 0026). The unit
// tests run them on every file in prisma/content, so CI refuses a bad file, and the runner runs
// them again before applying anything.

/**
 * The baseline: the old seed's content, already on the site before content files. It predates the
 * cap on paintings per file and the rule that annotations name their sources, so neither applies.
 */
export const BASELINE = "0001-baseline";

const NAME = /^\d{4}-[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COMMONS_FILE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:.+/;

function isUrl(s: string) {
  try {
    return ["http:", "https:"].includes(new URL(s).protocol);
  } catch {
    return false;
  }
}

/** Every problem with these files, in order, as "<file>, operation <n>: <problem>". Empty if none. */
export function checkFiles(files: ContentFile[]): string[] {
  const errors: string[] = [];
  const paintings = new Set<string>();
  const boxes = new Set<string>();
  const collections = new Set<string>();
  const numbers = new Set<string>();

  for (const file of files) {
    if (!NAME.test(file.name)) {
      errors.push(`${file.name}: name it like 0002-dutch-golden-age: four digits, then lower-case words.`);
    }
    const number = file.name.slice(0, 4);
    if (numbers.has(number)) errors.push(`${file.name}: another file has the number ${number}.`);
    numbers.add(number);

    if (!Array.isArray(file.operations) || file.operations.length === 0) {
      errors.push(`${file.name}: has no operations.`);
      continue;
    }
    const added = file.operations.filter((o) => o.op === "addPainting").length;
    if (added > MAX_PAINTINGS_PER_FILE && file.name !== BASELINE) {
      errors.push(`${file.name}: adds ${added} paintings; a file may add at most ${MAX_PAINTINGS_PER_FILE}.`);
    }

    const needSources = file.name !== BASELINE;
    file.operations.forEach((o, i) => {
      for (const problem of checkOperation(o)) errors.push(`${file.name}, operation ${i + 1} (${o.op}): ${problem}`);
    });

    function checkOperation(o: Operation): string[] {
      const problems: string[] = [];
      const sources = (list: string[]) => {
        if (needSources && list.length === 0) problems.push("name at least one source.");
        for (const s of list) if (!isUrl(s)) problems.push(`source ${JSON.stringify(s)} isn't a web address.`);
      };
      const known = (set: Set<string>, key: string, what: string) => {
        if (!set.has(key)) problems.push(`no earlier ${what} has the key ${JSON.stringify(key)}.`);
      };
      switch (o.op) {
        case "addPainting":
          if (!KEY.test(o.key))
            problems.push(`key ${JSON.stringify(o.key)} must be lower-case words joined by hyphens.`);
          if (paintings.has(o.key)) problems.push(`painting key ${o.key} is already used.`);
          if (!o.title.trim()) problems.push("give the painting a title.");
          if (!COMMONS_FILE.test(o.source)) problems.push("source must be a Wikimedia Commons file page.");
          paintings.add(o.key);
          break;
        case "annotate": {
          known(paintings, o.painting, "painting");
          if (!KEY.test(o.key))
            problems.push(`key ${JSON.stringify(o.key)} must be lower-case words joined by hyphens.`);
          if (boxes.has(o.key)) problems.push(`annotation key ${o.key} is already used.`);
          const problem = checkRegion(o.region) ?? checkBody(o.body);
          if (problem) problems.push(problem);
          sources(o.sources);
          boxes.add(o.key);
          break;
        }
        case "editAnnotation": {
          known(boxes, o.key, "annotation");
          const problem = (o.region && checkRegion(o.region)) || checkBody(o.body);
          if (problem) problems.push(problem);
          sources(o.sources);
          break;
        }
        case "removeAnnotation":
          known(boxes, o.key, "annotation");
          break;
        case "removePainting":
          known(paintings, o.key, "painting");
          break;
        case "addCollection":
          if (!KEY.test(o.slug))
            problems.push(`slug ${JSON.stringify(o.slug)} must be lower-case words joined by hyphens.`);
          if (collections.has(o.slug)) problems.push(`collection ${o.slug} is already added.`);
          if (!o.name.trim()) problems.push("give the collection a name.");
          collections.add(o.slug);
          break;
        case "addToCollection":
        case "removeFromCollection":
          known(collections, o.collection, "collection");
          for (const p of o.paintings) known(paintings, p, "painting");
          break;
        default:
          problems.push("isn't an operation the runner knows.");
      }
      return problems;
    }
  }
  return errors;
}
