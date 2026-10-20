import { parse, validate } from "graphql";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FIELDS, queryLimits } from "@/lib/graphql/limits";
import { schema } from "@/lib/graphql/schema";
import { createGraphQLServer } from "@/lib/graphql/server";

// A stand-in for the Prisma client: just the calls the resolvers make, over in-memory rows.
// It ignores `select`, so it returns whole rows (emails included), as a careless resolver would.
const { fakeDb, rows } = vi.hoisted(() => {
  const t = (s: string) => new Date(`2026-10-0${s}T12:00:00Z`);
  const rows = {
    users: [
      { id: "u1", name: "Ada", email: "ada@example.com", approvedAt: t("1") },
      { id: "u2", name: null, email: "anon@example.com", approvedAt: null },
    ],
    images: [
      { id: "i1", ownerId: "u1", title: "First", description: null, storageKey: "images/1.jpg", width: 800, height: 600, sha256: "x", createdAt: t("1") },
      { id: "i2", ownerId: "u1", title: "Second", description: "Two", storageKey: "images/2.jpg", width: 10, height: 10, sha256: "y", createdAt: t("2") },
      { id: "i3", ownerId: "u2", title: "Third", description: null, storageKey: "images/3.jpg", width: 10, height: 10, sha256: "z", createdAt: t("3") },
    ],
    regions: [{ id: "r1", imageId: "i1", authorId: "u1", x: 0.1, y: 0.2, w: 0.3, h: 0.4, createdAt: t("4"), updatedAt: t("5") }],
    annotations: [
      { id: "a1", regionId: "r1", authorId: "u1", bodyMarkdown: "A **hat**", createdAt: t("4"), updatedAt: t("4") },
      { id: "a2", regionId: "r1", authorId: "u2", bodyMarkdown: "<script>alert(1)</script>", createdAt: t("6"), updatedAt: t("6") },
    ],
    collections: [{ id: "c1", slug: "early", name: "Early", blurb: null, sortOrder: 0 }],
    collectionImages: [
      { collectionId: "c1", imageId: "i2", position: 1 },
      { collectionId: "c1", imageId: "i1", position: 0 },
    ],
  };

  const byId = <T extends { id: string }>(list: T[], id: string) => list.find((r) => r.id === id) ?? null;
  const user = (id: string) => byId(rows.users, id);
  // findUnique(...) is a promise that also has the relation methods, like Prisma's fluent API.
  const fluent = <T>(row: T | null, relations: Record<string, (row: T) => unknown>) =>
    Object.assign(
      Promise.resolve(row),
      Object.fromEntries(
        Object.entries(relations).map(([name, get]) => [name, vi.fn(() => Promise.resolve(row ? get(row) : null))]),
      ),
    );
  const findUnique = <T extends { id: string }>(list: T[], relations: Record<string, (row: T) => unknown>) =>
    vi.fn(({ where }: { where: { id: string } }) => fluent(byId(list, where.id), relations));

  const fakeDb = {
    image: {
      findUnique: findUnique(rows.images, {
        owner: (i) => user(i.ownerId),
        regions: (i) => rows.regions.filter((r) => r.imageId === i.id),
      }),
      findMany: vi.fn(({ take, cursor }: { take: number; cursor?: { id: string } }) => {
        const sorted = [...rows.images].sort((a, b) => +b.createdAt - +a.createdAt);
        const start = cursor ? sorted.findIndex((i) => i.id === cursor.id) + 1 : 0;
        return Promise.resolve(sorted.slice(start, start + take));
      }),
    },
    region: {
      findUnique: findUnique(rows.regions, {
        author: (r) => user(r.authorId),
        annotations: (r) => rows.annotations.filter((a) => a.regionId === r.id),
      }),
    },
    annotation: { findUnique: findUnique(rows.annotations, { author: (a) => user(a.authorId) }) },
    collection: {
      findMany: vi.fn(() => Promise.resolve(rows.collections)),
      findUnique: findUnique(rows.collections, {
        images: (c) =>
          rows.collectionImages
            .filter((l) => l.collectionId === c.id)
            .sort((a, b) => a.position - b.position)
            .map((l) => ({ image: byId(rows.images, l.imageId) })),
      }),
    },
  };
  return { fakeDb, rows };
});

vi.mock("@/lib/db", () => ({ db: fakeDb }));
vi.mock("@/lib/storage", () => ({ publicUrl: (key: string) => `https://r2.example/${key}` }));

type Result = { data?: Record<string, unknown> | null; errors?: { message: string; extensions?: { code?: string } }[] };

async function run(query: string, variables?: Record<string, unknown>, { production = false } = {}) {
  const response = await createGraphQLServer({ production }).fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as Result;
}

beforeEach(() => vi.clearAllMocks());

describe("image", () => {
  it("returns the image with its regions, annotations and authors' names", async () => {
    const result = await run(`{
      image(id: "i1") {
        id title url width height createdAt
        owner { name }
        regions { id x y w h createdAt updatedAt author { name } annotations { bodyMarkdown createdAt author { name } } }
      }
    }`);
    expect(result.errors).toBeUndefined();
    // The fake database returned whole user rows; only the selected fields reach the response.
    expect(rows.users[0].email).toBe("ada@example.com");
    expect(JSON.stringify(result)).not.toContain("@example.com");
    expect(result.data).toEqual({
      image: {
        id: "i1",
        title: "First",
        url: "https://r2.example/images/1.jpg",
        width: 800,
        height: 600,
        createdAt: "2026-10-01T12:00:00.000Z",
        owner: { name: "Ada" },
        regions: [
          {
            id: "r1",
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.4,
            createdAt: "2026-10-04T12:00:00.000Z",
            updatedAt: "2026-10-05T12:00:00.000Z",
            author: { name: "Ada" },
            annotations: [
              { bodyMarkdown: "A **hat**", createdAt: "2026-10-04T12:00:00.000Z", author: { name: "Ada" } },
              // Returned as stored, for the client to render safely (ADR 0008).
              { bodyMarkdown: "<script>alert(1)</script>", createdAt: "2026-10-06T12:00:00.000Z", author: { name: null } },
            ],
          },
        ],
      },
    });
  });

  it("returns null for an unknown id", async () => {
    expect((await run(`{ image(id: "nope") { id } }`)).data).toEqual({ image: null });
  });

  it("asks the database for authors' names only", async () => {
    await run(`{ image(id: "i1") { owner { name } } }`);
    // The last findUnique is the fluent one for the owner (the first loads the image itself).
    const owner = fakeDb.image.findUnique.mock.results.at(-1)!.value.owner;
    expect(owner).toHaveBeenCalledWith({ select: { name: true } });
  });

  it("has no private fields to ask for", async () => {
    for (const field of ["owner { email }", "owner { approvedAt }", "sha256", "storageKey"]) {
      const result = await run(`{ image(id: "i1") { ${field} } }`);
      expect(result.data).toBeUndefined();
      expect(result.errors?.[0].message).toMatch(/Cannot query field/);
    }
  });
});

describe("images", () => {
  const query = `query ($first: Int, $after: String) {
    images(first: $first, after: $after) { nodes { id } pageInfo { endCursor hasNextPage } }
  }`;

  it("pages through the images, newest first", async () => {
    const first = await run(query, { first: 2 });
    expect(first.data).toEqual({
      images: { nodes: [{ id: "i3" }, { id: "i2" }], pageInfo: { endCursor: "i2", hasNextPage: true } },
    });
    expect(fakeDb.image.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 3 }));

    const second = await run(query, { first: 2, after: "i2" });
    expect(second.data).toEqual({ images: { nodes: [{ id: "i1" }], pageInfo: { endCursor: "i1", hasNextPage: false } } });
    expect(fakeDb.image.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: { id: "i2" }, skip: 1 }));
  });

  it.each([0, 51, -1])("refuses first: %i", async (first) => {
    const result = await run(query, { first });
    expect(result.errors?.[0]).toMatchObject({ message: "first must be between 1 and 50.", extensions: { code: "BAD_USER_INPUT" } });
    expect(fakeDb.image.findMany).not.toHaveBeenCalled();
  });
});

describe("collections", () => {
  it("lists collections with their images in row order", async () => {
    const result = await run(`{ collections { slug name blurb images { id } } }`);
    expect(result.data).toEqual({
      collections: [{ slug: "early", name: "Early", blurb: null, images: [{ id: "i1" }, { id: "i2" }] }],
    });
  });
});

describe("query limits", () => {
  const check = (query: string, depth: number, fields = MAX_FIELDS) =>
    validate(schema, parse(query), [queryLimits(depth, fields)]).map((e) => e.message);

  it("allows the schema's deepest query at the default limit", () => {
    expect(check(`{ images { nodes { regions { annotations { author { name } } } } } }`, 8)).toEqual([]);
  });

  it("rejects queries nested deeper than the limit, through fragments too", () => {
    const query = `
      { images { nodes { ...Img } } }
      fragment Img on Image { regions { annotations { author { name } } } }`;
    expect(check(query, 6)).toEqual([]);
    expect(check(query, 5)).toEqual(["Query is nested too deeply (at most 5 levels)."]);
  });

  it("counts aliased fields towards the field limit", async () => {
    const aliases = Array.from({ length: MAX_FIELDS / 2 + 1 }, (_, n) => `c${n}: collections { slug }`).join(" ");
    const result = await run(`{ ${aliases} }`);
    expect(result.errors?.map((e) => e.message)).toEqual([`Query selects too many fields (at most ${MAX_FIELDS}).`]);
    expect(fakeDb.collection.findMany).not.toHaveBeenCalled();
  });

  it("survives a fragment cycle", () => {
    const query = `
      { images { nodes { ...A } } }
      fragment A on Image { id ...B }
      fragment B on Image { title ...A }`;
    // graphql-js reports the cycle itself; the limits rule must just not loop.
    expect(check(query, 8)).toEqual([]);
  });
});

describe("production", () => {
  const introspection = `{ __schema { queryType { name } } }`;

  it("allows introspection in development", async () => {
    expect((await run(introspection)).data).toEqual({ __schema: { queryType: { name: "Query" } } });
  });

  it("refuses introspection in production", async () => {
    const result = await run(introspection, undefined, { production: true });
    expect(result.data).toBeUndefined();
    expect(result.errors?.[0].message).toMatch(/introspection/i);
  });

  it("serves GraphiQL in development only", async () => {
    const page = (production: boolean) =>
      createGraphQLServer({ production }).fetch("http://localhost/api/graphql", { headers: { accept: "text/html" } });
    expect((await page(false)).headers.get("content-type")).toMatch(/text\/html/);
    expect((await page(true)).headers.get("content-type") ?? "").not.toMatch(/text\/html/);
  });

  it("still answers ordinary queries in production", async () => {
    expect((await run(`{ image(id: "i2") { title } }`, undefined, { production: true })).data).toEqual({
      image: { title: "Second" },
    });
  });
});
