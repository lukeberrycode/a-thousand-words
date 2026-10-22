import { parse, validate } from "graphql";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_DEPTH, MAX_FIELDS, MAX_TOP_LEVEL_FIELDS, queryLimits } from "@/lib/graphql/limits";
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
      {
        id: "i1",
        ownerId: "u1",
        title: "First",
        description: null,
        storageKey: "images/1.jpg",
        width: 800,
        height: 600,
        sha256: "x",
        createdAt: t("1"),
      },
      {
        id: "i2",
        ownerId: "u1",
        title: "Second",
        description: "Two",
        storageKey: "images/2.jpg",
        width: 10,
        height: 10,
        sha256: "y",
        createdAt: t("2"),
      },
      {
        id: "i3",
        ownerId: "u2",
        title: "Third",
        description: null,
        storageKey: "images/3.jpg",
        width: 10,
        height: 10,
        sha256: "z",
        createdAt: t("3"),
      },
      // Made at the same moment as i2, so paging has to break the tie by id.
      {
        id: "i4",
        ownerId: "u2",
        title: "Fourth",
        description: null,
        storageKey: "images/4.jpg",
        width: 10,
        height: 10,
        sha256: "w",
        createdAt: t("2"),
      },
    ],
    regions: [
      { id: "r1", imageId: "i1", authorId: "u1", x: 0.1, y: 0.2, w: 0.3, h: 0.4, createdAt: t("4"), updatedAt: t("5") },
    ],
    annotations: [
      { id: "a1", regionId: "r1", authorId: "u1", bodyMarkdown: "A **hat**", createdAt: t("4"), updatedAt: t("4") },
      {
        id: "a2",
        regionId: "r1",
        authorId: "u2",
        bodyMarkdown: "<script>alert(1)</script>",
        createdAt: t("6"),
        updatedAt: t("6"),
      },
    ],
    collections: [{ id: "c1", slug: "early", name: "Early", blurb: null, sortOrder: 0 }],
    collectionImages: [
      { collectionId: "c1", imageId: "i2", position: 1 },
      { collectionId: "c1", imageId: "i1", position: 0 },
    ],
  };

  type Comparable = Date | string;
  type ImageOrder = { createdAt: Date; id: string };
  type Condition = { lt: Comparable } | Comparable;
  type Where = { OR?: Where[]; createdAt?: Condition; id?: Condition };
  type FindManyArgs = { where: Where; orderBy: Partial<Record<keyof ImageOrder, "asc" | "desc">>[]; take: number };

  const compare = (a: Comparable, b: Comparable) => (a < b ? -1 : a > b ? 1 : 0);
  const meets = (value: Comparable, condition: Condition) =>
    condition instanceof Date || typeof condition === "string"
      ? compare(value, condition) === 0
      : compare(value, condition.lt) < 0;
  const matches = (image: ImageOrder, where: Where): boolean =>
    (where.OR === undefined || where.OR.some((w) => matches(image, w))) &&
    (where.createdAt === undefined || meets(image.createdAt, where.createdAt)) &&
    (where.id === undefined || meets(image.id, where.id));

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
      // Applies `where` and `orderBy` as Prisma would, for the shapes the images resolver uses, so
      // a resolver that filters or orders wrongly returns the wrong page. It ignores `cursor`/`skip`.
      findMany: vi.fn(({ where, orderBy, take }: FindManyArgs) => {
        const sorted = rows.images
          .filter((image) => matches(image, where))
          .sort((a, b) => {
            for (const order of orderBy) {
              const [field, direction] = Object.entries(order)[0] as [keyof ImageOrder, "asc" | "desc"];
              const diff = compare(a[field], b[field]);
              if (diff !== 0) return direction === "asc" ? diff : -diff;
            }
            return 0;
          });
        return Promise.resolve(sorted.slice(0, take));
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
        regions { id x y w h createdAt updatedAt annotations { bodyMarkdown createdAt author { name } } }
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
            annotations: [
              { bodyMarkdown: "A **hat**", createdAt: "2026-10-04T12:00:00.000Z", author: { name: "Ada" } },
              // Returned as stored, for the client to render safely (ADR 0008).
              {
                bodyMarkdown: "<script>alert(1)</script>",
                createdAt: "2026-10-06T12:00:00.000Z",
                author: { name: null },
              },
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
    const result = await run(`{ image(id: "i1") { owner { name } regions { annotations { author { name } } } } }`);
    expect(result.errors).toBeUndefined();
    const namesOnly = [{ select: { name: true } }];
    // Every fluent `.owner(...)` and `.author(...)` call, whichever findUnique it hung off.
    const ownerCalls = fakeDb.image.findUnique.mock.results.flatMap((r) => r.value.owner.mock.calls);
    const authorCalls = fakeDb.annotation.findUnique.mock.results.flatMap((r) => r.value.author.mock.calls);
    expect(ownerCalls).toEqual([namesOnly]);
    // One per annotation on r1.
    expect(authorCalls).toEqual([namesOnly, namesOnly]);
  });

  it("has no private fields to ask for", async () => {
    for (const field of ["owner { email }", "owner { approvedAt }", "sha256", "storageKey"]) {
      const result = await run(`{ image(id: "i1") { ${field} } }`);
      expect(result.data).toBeUndefined();
      expect(result.errors?.[0].message).toMatch(/Cannot query field/);
    }
  });

  it("doesn't say who drew a region", async () => {
    const result = await run(`{ image(id: "i1") { regions { author { name } } } }`);
    expect(result.data).toBeUndefined();
    expect(result.errors?.map((e) => e.message)).toEqual(['Cannot query field "author" on type "Region".']);
    expect(fakeDb.region.findUnique).not.toHaveBeenCalled();
  });
});

describe("images", () => {
  const query = `query ($first: Int, $after: String) {
    images(first: $first, after: $after) { nodes { id } pageInfo { endCursor hasNextPage } }
  }`;

  type Page = { nodes: { id: string }[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } };
  const page = async (variables: { first: number; after?: string }) => {
    const result = await run(query, variables);
    expect(result.errors).toBeUndefined();
    return (result.data as { images: Page }).images;
  };
  const cursor = (text: string) => Buffer.from(text).toString("base64url");
  const order = [{ createdAt: "desc" }, { id: "desc" }];
  // i2 and i4 share a createdAt; i4 comes first because its id is larger.
  const newestFirst = ["i3", "i4", "i2", "i1"];

  it("pages through the images, newest first, with ties broken by id", async () => {
    const first = await page({ first: 2 });
    expect(first).toEqual({
      nodes: [{ id: "i3" }, { id: "i4" }],
      pageInfo: { endCursor: cursor("2026-10-02T12:00:00.000Z|i4"), hasNextPage: true },
    });
    expect(fakeDb.image.findMany).toHaveBeenLastCalledWith({
      where: {},
      orderBy: order,
      take: 3,
      select: expect.any(Object),
    });

    const second = await page({ first: 2, after: first.pageInfo.endCursor! });
    expect(second).toEqual({
      nodes: [{ id: "i2" }, { id: "i1" }],
      pageInfo: { endCursor: cursor("2026-10-01T12:00:00.000Z|i1"), hasNextPage: false },
    });
    // A keyset query from the cursor's position: no Prisma cursor or skip.
    const time = new Date("2026-10-02T12:00:00.000Z");
    expect(fakeDb.image.findMany).toHaveBeenLastCalledWith({
      where: { OR: [{ createdAt: { lt: time } }, { createdAt: time, id: { lt: "i4" } }] },
      orderBy: order,
      take: 3,
      select: expect.any(Object),
    });
  });

  it("returns every image once, whatever the page size", async () => {
    for (const first of [1, 2, 3, 4, 50]) {
      const seen: string[] = [];
      let after: string | undefined;
      for (let pages = 0; pages < 10; pages++) {
        const { nodes, pageInfo } = await page({ first, after });
        seen.push(...nodes.map((n) => n.id));
        if (!pageInfo.hasNextPage) break;
        after = pageInfo.endCursor!;
      }
      expect(seen).toEqual(newestFirst);
    }
  });

  it("carries on from a cursor whose image has since been deleted", async () => {
    const first = await page({ first: 2 });
    expect(first.nodes.at(-1)).toEqual({ id: "i4" });

    const index = rows.images.findIndex((i) => i.id === "i4");
    const [deleted] = rows.images.splice(index, 1);
    try {
      const second = await page({ first: 2, after: first.pageInfo.endCursor! });
      expect(second.nodes).toEqual([{ id: "i2" }, { id: "i1" }]);
      expect(second.pageInfo.hasNextPage).toBe(false);
    } finally {
      rows.images.splice(index, 0, deleted);
    }
  });

  it("returns an empty page after the oldest image", async () => {
    expect(await page({ first: 2, after: cursor("2026-10-01T12:00:00.000Z|i1") })).toEqual({
      nodes: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });
  });

  it.each([
    ["nonsense", "nonsense"],
    ["an empty string", ""],
    ["a cursor with no id", cursor("2026-10-02T12:00:00.000Z")],
    ["a cursor with an empty id", cursor("2026-10-02T12:00:00.000Z|")],
    ["a cursor with a bad date", cursor("yesterday|i2")],
    ["a cursor with extra parts", cursor("2026-10-02T12:00:00.000Z|i2|x")],
    ["a plain image id (the old cursor)", "i2"],
  ])("refuses %s as after", async (_, after) => {
    const result = await run(query, { first: 2, after });
    expect(result.data).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toMatchObject({
      message: "after isn't a cursor from this API.",
      extensions: { code: "BAD_USER_INPUT" },
    });
    expect(fakeDb.image.findMany).not.toHaveBeenCalled();
  });

  it.each([0, 51, -1])("refuses first: %i", async (first) => {
    const result = await run(query, { first });
    expect(result.errors?.[0]).toMatchObject({
      message: "first must be between 1 and 50.",
      extensions: { code: "BAD_USER_INPUT" },
    });
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
  // Only the limits rule, with the default limits unless given.
  const check = (
    query: string,
    { depth, fields, topLevel }: { depth?: number; fields?: number; topLevel?: number } = {},
  ) => validate(schema, parse(query), [queryLimits(depth, fields, topLevel)]).map((e) => e.message);
  const tooMany = `Query selects too many fields (at most ${MAX_FIELDS}).`;
  const tooBroad = `Query asks for too many things at once (at most ${MAX_TOP_LEVEL_FIELDS} top-level fields).`;

  it("has the documented defaults", () => {
    expect([MAX_DEPTH, MAX_FIELDS, MAX_TOP_LEVEL_FIELDS]).toEqual([8, 200, 3]);
  });

  it("allows the schema's deepest query at the default limit", () => {
    expect(check(`{ images { nodes { regions { annotations { author { name } } } } } }`)).toEqual([]);
  });

  it("rejects queries nested deeper than the limit, through fragments too", () => {
    const query = `
      { images { nodes { ...Img } } }
      fragment Img on Image { regions { annotations { author { name } } } }`;
    expect(check(query, { depth: 6 })).toEqual([]);
    expect(check(query, { depth: 5 })).toEqual(["Query is nested too deeply (at most 5 levels)."]);
  });

  it("counts aliased fields towards the field limit", async () => {
    // One top-level field, so only the field limit is broken. `image` itself is one field.
    const aliases = (count: number) => Array.from({ length: count }, (_, n) => `a${n}: id`).join(" ");
    expect(check(`{ image(id: "i1") { ${aliases(MAX_FIELDS - 1)} } }`)).toEqual([]);
    const result = await run(`{ image(id: "i1") { ${aliases(MAX_FIELDS)} } }`);
    expect(result.errors?.map((e) => e.message)).toEqual([tooMany]);
    expect(fakeDb.image.findUnique).not.toHaveBeenCalled();
  });

  it("counts __typename as a field, but not as a top-level one", () => {
    const query = `{ __typename image(id: "i1") { __typename id } }`;
    expect(check(query, { fields: 4 })).toEqual([]);
    expect(check(query, { fields: 3 })).toEqual(["Query selects too many fields (at most 3)."]);
    expect(
      check(`{ __typename a: __typename image(id: "i1") { id } images { nodes { id } } collections { slug } }`),
    ).toEqual([]);
  });

  it("doesn't measure __schema or __type", () => {
    const deep = `__schema { types { fields { type { ofType { ofType { ofType { ofType { ofType { name } } } } } } } } }`;
    const query = `{ ${deep} __type(name: "Image") { name } image(id: "i1") { id } images { nodes { id } } collections { slug } }`;
    // Without them, the query is 7 fields, 3 top-level ones and 3 levels deep: all within limits.
    expect(check(query, { fields: 7, depth: 3 })).toEqual([]);
    expect(check(query, { fields: 6 })).toEqual(["Query selects too many fields (at most 6)."]);
  });

  it("rejects a document of fragments that each spread the next twice, quickly", async () => {
    // Expanded in full this is 2^40 fields. Each fragment must be measured once and its size
    // reused; walking it again at every spread would never finish (a hang here is this bug).
    const fragments = Array.from({ length: 40 }, (_, n) => `fragment F${n + 1} on Query { ...F${n} ...F${n} }`);
    const query = ["query { ...F40 }", "fragment F0 on Query { __typename }", ...fragments].join("\n");

    const start = performance.now();
    expect(check(query)).toEqual([tooMany]);
    const result = await run(query);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(result.errors?.map((e) => e.message)).toEqual([tooMany]);
  });

  it("allows three top-level fields", async () => {
    const result = await run(`{ image(id: "i1") { id } images(first: 1) { nodes { id } } collections { slug } }`);
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      image: { id: "i1" },
      images: { nodes: [{ id: "i3" }] },
      collections: [{ slug: "early" }],
    });
  });

  it("rejects a fourth top-level field, even under an alias", async () => {
    const result = await run(
      `{ image(id: "i1") { id } images { nodes { id } } collections { slug } more: collections { slug } }`,
    );
    expect(result.data).toBeUndefined();
    expect(result.errors?.map((e) => e.message)).toEqual([tooBroad]);
    expect(fakeDb.collection.findMany).not.toHaveBeenCalled();
    expect(fakeDb.image.findMany).not.toHaveBeenCalled();
  });

  it("counts top-level fields through fragments and inline fragments", () => {
    const fragments = `
      fragment Two on Query { image(id: "i1") { id } images { nodes { id } } }
      fragment One on Query { collections { slug } }`;
    expect(check(`{ ...Two ... on Query { ...One } } ${fragments}`)).toEqual([]);
    expect(check(`{ ...Two ... on Query { ...One more: collections { slug } } } ${fragments}`)).toEqual([tooBroad]);
    // A fragment spread twice counts twice.
    expect(check(`{ ...Two ... on Query { ...Two } } ${fragments}`)).toEqual([tooBroad]);
  });

  it("applies the top-level limit to each operation on its own", () => {
    const query = `
      query A { image(id: "i1") { id } images { nodes { id } } collections { slug } }
      query B { image(id: "i2") { id } images { nodes { id } } collections { slug } }`;
    expect(check(query)).toEqual([]);
  });

  it("survives a fragment cycle", () => {
    const query = `
      { images { nodes { ...A } } }
      fragment A on Image { id ...B }
      fragment B on Image { title ...A }`;
    // graphql-js reports the cycle itself; the limits rule must just not loop.
    expect(check(query)).toEqual([]);
  });

  it("refuses a fragment cycle through the server without hanging", async () => {
    const result = await run(`{ ...A } fragment A on Query { __typename ...B } fragment B on Query { ...A }`);
    expect(result.data).toBeUndefined();
    expect(result.errors?.map((e) => e.message)).toContainEqual(expect.stringMatching(/within itself/));
  });
});

describe("CORS", () => {
  const origin = "https://elsewhere.example";

  it.each([false, true])("never allows credentials on a query (production: %s)", async (production) => {
    const response = await createGraphQLServer({ production }).fetch("http://localhost/api/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ query: `{ image(id: "i1") { id } }` }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeTruthy();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it.each([false, true])("never allows credentials on a preflight (production: %s)", async (production) => {
    const response = await createGraphQLServer({ production }).fetch("http://localhost/api/graphql", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    expect(response.status).toBeLessThan(300);
    expect(response.headers.get("access-control-allow-origin")).toBeTruthy();
    expect(response.headers.get("access-control-allow-methods")).toMatch(/POST/);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
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
