import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadContentFiles } from "./files";
import { checkSource } from "./source";

// Content files must be plain data, checked on their source before they're imported (ADR 0026).

const wrap = (value: string) => `export const operations = ${value};\n`;
const ok = (text: string) => expect(checkSource("0002-x", text)).toEqual([]);
const refused = (text: string) => {
  const problems = checkSource("0002-x", text);
  expect(problems.length).toBeGreaterThan(0);
  for (const p of problems) expect(p).toContain("0002-x.ts");
  return problems;
};

describe("checkSource", () => {
  it("accepts a typical content file", () => {
    ok(`// A batch of paintings.
import type { Operation } from "@/lib/content/operations";
import type { Region } from "@/lib/regions";

export const operations: Operation[] = [
  {
    op: "addPainting",
    key: "milkmaid",
    title: "The Milkmaid",
    description: \`Johannes Vermeer, about 1658.\`,
    source: "https://commons.wikimedia.org/wiki/File:Milkmaid.jpg",
  },
  {
    "op": "annotate",
    painting: "milkmaid",
    key: "milkmaid-1",
    region: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    body: "Bread and a jug.",
    sources: ["https://en.wikipedia.org/wiki/The_Milkmaid_(Vermeer)"],
  },
];
`);
  });

  it.each([
    ["an empty list", "[]"],
    ["nested arrays and objects", "[{ a: [1, [2, { b: {} }]] }]"],
    ["strings, both quotes", `["a", 'b']`],
    ["a template string without substitutions", "[`plain`]"],
    ["numbers, including negative and decimal", "[0, 1.5, -2, -0.25, 1e3]"],
    ["true, false and null", "[true, false, null]"],
    ["string keys", `[{ "quoted key": 1 }]`],
  ])("accepts %s", (_, value) => ok(wrap(value)));

  it("accepts the export without a type annotation", () => ok(wrap("[]")));

  it.each([
    ["a function call", "[run()]"],
    ["a call at the top of the list", "build()"],
    ["an identifier", "[x]"],
    ["undefined", "[undefined]"],
    ["NaN", "[NaN]"],
    ["a spread in a list", "[...more]"],
    ["a spread in an object", "[{ ...more }]"],
    ["a shorthand property", "[{ key }]"],
    ["a computed property", "[{ [key]: 1 }]"],
    ["a numeric key", "[{ 1: 'a' }]"],
    ["a method", "[{ f() { return 1; } }]"],
    ["a getter", "[{ get f() { return 1; } }]"],
    ["a template substitution", "[`a ${process.env.DATABASE_URL}`]"],
    ["an arrow function", "[() => 1]"],
    ["arithmetic", "[1 + 2]"],
    ["a negated string", `[-"1"]`],
    ["a new expression", "[new Date()]"],
    ["an await", "[await fetch('https://example.com')]"],
    ["a type assertion", "[{ a: 1 } as never]"],
    ["a property access", "[process.env]"],
    ["a dynamic import", "[import('node:fs')]"],
    ["a regular expression", "[/x/]"],
  ])("refuses %s", (_, value) => {
    refused(wrap(value));
  });

  it("refuses a value import", () => {
    refused(`import { writeFileSync } from "node:fs";\n${wrap("[]")}`);
  });

  it("refuses a side-effect import", () => {
    refused(`import "./evil";\n${wrap("[]")}`);
  });

  it("refuses an import with only inline type specifiers, which isn't an `import type`", () => {
    refused(`import { type Operation } from "@/lib/content/operations";\n${wrap("[]")}`);
  });

  it("refuses a statement besides the export", () => {
    refused(`console.log("hi");\n${wrap("[]")}`);
  });

  it("refuses another declaration, even a plain one", () => {
    refused(`const x = 1;\n${wrap("[]")}`);
  });

  it("refuses a function declaration", () => {
    refused(`function f() {}\n${wrap("[]")}`);
  });

  it("refuses operations that isn't exported", () => {
    const problems = refused("const operations = [];\n");
    expect(problems.join(" ")).toContain("exactly one");
  });

  it.each(["let", "var"])("refuses `export %s operations`", (keyword) => {
    refused(`export ${keyword} operations = [];\n`);
  });

  it("refuses two operations exports", () => {
    refused(`${wrap("[]")}${wrap("[]")}`);
  });

  it("refuses a file with no operations export", () => {
    const problems = refused(`import type { Operation } from "@/lib/content/operations";\n`);
    expect(problems.join(" ")).toContain("exactly one");
  });

  it("refuses an empty file", () => {
    refused("");
  });

  it("refuses an export under another name", () => {
    refused("export const ops = [];\n");
  });

  it("refuses a default export", () => {
    refused(`${wrap("[]")}export default 1;\n`);
  });

  it("refuses another declaration in the same export", () => {
    refused("export const operations = [], other = 1;\n");
  });

  it("refuses an export with no value", () => {
    refused("export declare const operations: never[];\n");
  });
});

describe("loadContentFiles and plain data", () => {
  let dir: string;
  const make = () => (dir = mkdtempSync(join(tmpdir(), "content-files-")));
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  const valid = `export const operations = [
  { op: "addCollection", slug: "c", name: "C", blurb: "" },
];
`;

  it("loads a plain-data file", async () => {
    make();
    writeFileSync(join(dir, "0002-good.ts"), valid);
    expect(await loadContentFiles(dir)).toEqual([
      { name: "0002-good", operations: [{ op: "addCollection", slug: "c", name: "C", blurb: "" }] },
    ]);
  });

  it("refuses a file with a top-level side effect without running it", async () => {
    make();
    const marker = join(dir, "ran.txt");
    writeFileSync(
      join(dir, "0002-evil.ts"),
      `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(marker)}, "ran");
export const operations = [];
`,
    );
    await expect(loadContentFiles(dir)).rejects.toThrow(/0002-evil\.ts/);
    expect(existsSync(marker)).toBe(false);
  });

  it("refuses a side effect hidden inside the operations, without running it", async () => {
    make();
    const marker = join(dir, "ran.txt");
    writeFileSync(
      join(dir, "0002-evil.ts"),
      `export const operations = [
  { op: "addCollection", slug: "c", name: (await import("node:fs")).writeFileSync(${JSON.stringify(marker)}, "ran") ?? "C", blurb: "" },
];
`,
    );
    await expect(loadContentFiles(dir)).rejects.toThrow(/plain data/);
    expect(existsSync(marker)).toBe(false);
  });

  it("exempts the baseline", async () => {
    make();
    writeFileSync(
      join(dir, "0001-baseline.ts"),
      `const list = [{ op: "addCollection", slug: "c", name: "C", blurb: "" }];
export const operations = list.map((o) => ({ ...o }));
`,
    );
    const files = await loadContentFiles(dir);
    expect(files.map((f) => f.name)).toEqual(["0001-baseline"]);
    expect(files[0].operations).toHaveLength(1);
  });

  it("doesn't exempt a file merely numbered 0001", async () => {
    make();
    writeFileSync(join(dir, "0001-other.ts"), `const x = [];\nexport const operations = x;\n`);
    await expect(loadContentFiles(dir)).rejects.toThrow(/0001-other\.ts/);
  });
});
