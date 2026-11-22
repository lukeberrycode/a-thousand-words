// Import the GraphQL functions that parse and validate queries.
import { parse, validate } from "graphql";

// Import the Vitest functions for grouping, asserting and mocking.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Import the limits and the rule under test.
import { MAX_DEPTH, MAX_FIELDS, MAX_TOP_LEVEL_FIELDS, queryLimits } from "@/lib/graphql/limits";

// Import the schema.
import { schema } from "@/lib/graphql/schema";

// Import the server factory.
import { createGraphQLServer } from "@/lib/graphql/server";

// A stand-in for the Prisma client: just the calls the resolvers make, over in-memory rows.
// It ignores `select`, so it returns whole rows (emails included), as a careless resolver would.
const { fakeDb, rows } = vi.hoisted(() => {
  // Make a date in October 2026 from a day digit.
  const t = (s: string) => new Date(`2026-10-0${s}T12:00:00Z`);

  // The in-memory tables.
  const rows = {
    // Two users, one approved.
    users: [
      // Ada, approved.
      { id: "u1", name: "Ada", email: "ada@example.com", approvedAt: t("1") },
      // An unnamed user, not approved.
      { id: "u2", name: null, email: "anon@example.com", approvedAt: null },
    ],

    // Four images.
    images: [
      {
        // The first image's id.
        id: "i1",
        // Owned by Ada.
        ownerId: "u1",
        // Its title.
        title: "First",
        // No description.
        description: null,
        // Where its file is stored.
        storageKey: "images/1.jpg",
        // Its width.
        width: 800,
        // Its height.
        height: 600,
        // A private hash the API must never show.
        sha256: "x",
        // When it was uploaded.
        createdAt: t("1"),
      },
      {
        // The second image's id.
        id: "i2",
        // Owned by Ada.
        ownerId: "u1",
        // Its title.
        title: "Second",
        // Its description.
        description: "Two",
        // Where its file is stored.
        storageKey: "images/2.jpg",
        // Its width.
        width: 10,
        // Its height.
        height: 10,
        // A private hash the API must never show.
        sha256: "y",
        // When it was uploaded.
        createdAt: t("2"),
      },
      {
        // The third image's id.
        id: "i3",
        // Owned by the unnamed user.
        ownerId: "u2",
        // Its title.
        title: "Third",
        // No description.
        description: null,
        // Where its file is stored.
        storageKey: "images/3.jpg",
        // Its width.
        width: 10,
        // Its height.
        height: 10,
        // A private hash the API must never show.
        sha256: "z",
        // When it was uploaded.
        createdAt: t("3"),
      },
      // Made at the same moment as i2, so paging has to break the tie by id.
      {
        // The fourth image's id.
        id: "i4",
        // Owned by the unnamed user.
        ownerId: "u2",
        // Its title.
        title: "Fourth",
        // No description.
        description: null,
        // Where its file is stored.
        storageKey: "images/4.jpg",
        // Its width.
        width: 10,
        // Its height.
        height: 10,
        // A private hash the API must never show.
        sha256: "w",
        // When it was uploaded: the same moment as i2.
        createdAt: t("2"),
      },
    ],

    // One region, on the first image.
    regions: [
      { id: "r1", imageId: "i1", authorId: "u1", x: 0.1, y: 0.2, w: 0.3, h: 0.4, createdAt: t("4"), updatedAt: t("5") },
    ],

    // Two annotations in that region.
    annotations: [
      // Ada's, with Markdown.
      { id: "a1", regionId: "r1", authorId: "u1", bodyMarkdown: "A **hat**", createdAt: t("4"), updatedAt: t("4") },
      {
        // The second annotation's id.
        id: "a2",
        // In the same region.
        regionId: "r1",
        // By the unnamed user.
        authorId: "u2",
        // Hostile text, which must be returned as stored.
        bodyMarkdown: "<script>alert(1)</script>",
        // When it was written.
        createdAt: t("6"),
        // When it last changed.
        updatedAt: t("6"),
      },
    ],

    // One collection.
    collections: [{ id: "c1", slug: "early", name: "Early", blurb: null, sortOrder: 0 }],

    // Which images are in it, and in what order.
    collectionImages: [
      // The second image, in second place.
      { collectionId: "c1", imageId: "i2", position: 1 },
      // The first image, in first place.
      { collectionId: "c1", imageId: "i1", position: 0 },
    ],
  };

  // A value that can be compared with < and >.
  type Comparable = Date | string;

  // The two fields images are ordered by.
  type ImageOrder = { createdAt: Date; id: string };

  // A filter: "less than" a value, or equal to one.
  type Condition = { lt: Comparable } | Comparable;

  // The shape of a `where` the images resolver sends.
  type Where = { OR?: Where[]; createdAt?: Condition; id?: Condition };

  // The shape of the arguments to `findMany`.
  type FindManyArgs = { where: Where; orderBy: Partial<Record<keyof ImageOrder, "asc" | "desc">>[]; take: number };

  // Compare two values: -1, 0 or 1.
  const compare = (a: Comparable, b: Comparable) => (a < b ? -1 : a > b ? 1 : 0);

  // Whether a value meets a condition.
  const meets = (value: Comparable, condition: Condition) =>
    // A plain value means "equal to".
    condition instanceof Date || typeof condition === "string"
      ? compare(value, condition) === 0
      : // An object with `lt` means "less than".
        compare(value, condition.lt) < 0;

  // Whether an image matches a `where`.
  const matches = (image: ImageOrder, where: Where): boolean =>
    // At least one OR branch matches, if there is an OR...
    (where.OR === undefined || where.OR.some((w) => matches(image, w))) &&
    // ...and the date meets its condition, if there is one...
    (where.createdAt === undefined || meets(image.createdAt, where.createdAt)) &&
    // ...and the id meets its condition, if there is one.
    (where.id === undefined || meets(image.id, where.id));

  // Find a row by id, or null.
  const byId = <T extends { id: string }>(list: T[], id: string) => list.find((r) => r.id === id) ?? null;

  // Find a user by id.
  const user = (id: string) => byId(rows.users, id);

  // findUnique(...) is a promise that also has the relation methods, like Prisma's fluent API.
  const fluent = <T>(row: T | null, relations: Record<string, (row: T) => unknown>) =>
    // Attach the relation methods to a promise of the row.
    Object.assign(
      // The promise.
      Promise.resolve(row),
      // The relation methods, each a spy that returns the related rows.
      Object.fromEntries(
        Object.entries(relations).map(([name, get]) => [name, vi.fn(() => Promise.resolve(row ? get(row) : null))]),
      ),
    );

  // Make a spy for `findUnique` over a list of rows, with the given relations.
  const findUnique = <T extends { id: string }>(list: T[], relations: Record<string, (row: T) => unknown>) =>
    // The spy looks the row up by id and wraps it in a fluent promise.
    vi.fn(({ where }: { where: { id: string } }) => fluent(byId(list, where.id), relations));

  // The fake client.
  const fakeDb = {
    // The image table.
    image: {
      // Look up one image, with its owner and regions.
      findUnique: findUnique(rows.images, {
        // The image's owner.
        owner: (i) => user(i.ownerId),
        // The image's regions.
        regions: (i) => rows.regions.filter((r) => r.imageId === i.id),
      }),
      // Applies `where` and `orderBy` as Prisma would, for the shapes the images resolver uses, so
      // a resolver that filters or orders wrongly returns the wrong page. It ignores `cursor`/`skip`.
      findMany: vi.fn(({ where, orderBy, take }: FindManyArgs) => {
        // Filter, then sort.
        const sorted = rows.images
          // Keep images that match the filter.
          .filter((image) => matches(image, where))
          // Sort by each field in turn.
          .sort((a, b) => {
            // Try each ordering rule.
            for (const order of orderBy) {
              // The field and direction of this rule.
              const [field, direction] = Object.entries(order)[0] as [keyof ImageOrder, "asc" | "desc"];

              // How the two images compare on that field.
              const diff = compare(a[field], b[field]);

              // If they differ, that settles it.
              if (diff !== 0) return direction === "asc" ? diff : -diff;
            }

            // Tied on every rule.
            return 0;
          });

        // Return the first `take` images.
        return Promise.resolve(sorted.slice(0, take));
      }),
    },

    // The region table.
    region: {
      // Look up one region, with its author and annotations.
      findUnique: findUnique(rows.regions, {
        // The region's author.
        author: (r) => user(r.authorId),
        // The region's annotations.
        annotations: (r) => rows.annotations.filter((a) => a.regionId === r.id),
      }),
    },

    // The annotation table, with one lookup that has an author.
    annotation: { findUnique: findUnique(rows.annotations, { author: (a) => user(a.authorId) }) },

    // The collection table.
    collection: {
      // List every collection.
      findMany: vi.fn(() => Promise.resolve(rows.collections)),

      // Look up one collection, with its images.
      findUnique: findUnique(rows.collections, {
        // The collection's images, in row order.
        images: (c) =>
          // Start from the links table.
          rows.collectionImages
            // Keep this collection's links.
            .filter((l) => l.collectionId === c.id)
            // Put them in row order.
            .sort((a, b) => a.position - b.position)
            // Swap each link for its image.
            .map((l) => ({ image: byId(rows.images, l.imageId) })),
      }),
    },
  };

  // Hand back the fake client and the rows.
  return { fakeDb, rows };
});

// Use the fake client wherever the code imports the real one.
vi.mock("@/lib/db", () => ({ db: fakeDb }));

// Use a fake address builder for storage.
vi.mock("@/lib/storage", () => ({ publicUrl: (key: string) => `https://r2.example/${key}` }));

// The shape of a GraphQL response.
type Result = { data?: Record<string, unknown> | null; errors?: { message: string; extensions?: { code?: string } }[] };

// Run a query against a fresh server.
async function run(query: string, variables?: Record<string, unknown>, { production = false } = {}) {
  // Send the query as a POST request, without a network.
  const response = await createGraphQLServer({ production }).fetch("http://localhost/api/graphql", {
    // Use POST.
    method: "POST",

    // Declare a JSON body.
    headers: { "content-type": "application/json" },

    // The query and its variables.
    body: JSON.stringify({ query, variables }),
  });

  // Return the parsed response.
  return (await response.json()) as Result;
}

// Reset all spies before each test.
beforeEach(() => vi.clearAllMocks());

// Group the tests for the `image` query.
describe("image", () => {
  // Check a full query.
  it("returns the image with its regions, annotations and authors' names", async () => {
    // Ask for an image with everything nested under it.
    const result = await run(`{
      image(id: "i1") {
        id title url width height createdAt
        owner { name }
        regions { id x y w h createdAt updatedAt annotations { bodyMarkdown createdAt author { name } } }
      }
    }`);

    // There are no errors.
    expect(result.errors).toBeUndefined();

    // The fake database returned whole user rows; only the selected fields reach the response.
    expect(rows.users[0].email).toBe("ada@example.com");

    // No email appears anywhere in the response.
    expect(JSON.stringify(result)).not.toContain("@example.com");

    // The response has exactly the requested data.
    expect(result.data).toEqual({
      image: {
        // The image's id.
        id: "i1",
        // Its title.
        title: "First",
        // Its public URL.
        url: "https://r2.example/images/1.jpg",
        // Its width.
        width: 800,
        // Its height.
        height: 600,
        // Its upload time, as ISO text.
        createdAt: "2026-10-01T12:00:00.000Z",
        // Its owner's name.
        owner: { name: "Ada" },
        // Its regions.
        regions: [
          {
            // The region's id.
            id: "r1",
            // Its left edge.
            x: 0.1,
            // Its top edge.
            y: 0.2,
            // Its width.
            w: 0.3,
            // Its height.
            h: 0.4,
            // When it was created.
            createdAt: "2026-10-04T12:00:00.000Z",
            // When it last changed.
            updatedAt: "2026-10-05T12:00:00.000Z",
            // Its annotations.
            annotations: [
              // The first annotation.
              { bodyMarkdown: "A **hat**", createdAt: "2026-10-04T12:00:00.000Z", author: { name: "Ada" } },
              // Returned as stored, for the client to render safely (ADR 0008).
              {
                // The hostile text, untouched.
                bodyMarkdown: "<script>alert(1)</script>",
                // When it was written.
                createdAt: "2026-10-06T12:00:00.000Z",
                // The author has no name.
                author: { name: null },
              },
            ],
          },
        ],
      },
    });
  });

  // Check a missing image.
  it("returns null for an unknown id", async () => {
    // The result is null, not an error.
    expect((await run(`{ image(id: "nope") { id } }`)).data).toEqual({ image: null });
  });

  // Check that the database is asked for names only.
  it("asks the database for authors' names only", async () => {
    // Ask for every author's name.
    const result = await run(`{ image(id: "i1") { owner { name } regions { annotations { author { name } } } } }`);

    // There are no errors.
    expect(result.errors).toBeUndefined();

    // The only thing asked for.
    const namesOnly = [{ select: { name: true } }];

    // Every fluent `.owner(...)` and `.author(...)` call, whichever findUnique it hung off.
    const ownerCalls = fakeDb.image.findUnique.mock.results.flatMap((r) => r.value.owner.mock.calls);

    // Every `.author(...)` call.
    const authorCalls = fakeDb.annotation.findUnique.mock.results.flatMap((r) => r.value.author.mock.calls);

    // One owner call, asking for names only.
    expect(ownerCalls).toEqual([namesOnly]);

    // One per annotation on r1.
    expect(authorCalls).toEqual([namesOnly, namesOnly]);
  });

  // Check that private fields can't be requested.
  it("has no private fields to ask for", async () => {
    // Try each private field.
    for (const field of ["owner { email }", "owner { approvedAt }", "sha256", "storageKey"]) {
      // Ask for it.
      const result = await run(`{ image(id: "i1") { ${field} } }`);

      // There's no data.
      expect(result.data).toBeUndefined();

      // The error says the field doesn't exist.
      expect(result.errors?.[0].message).toMatch(/Cannot query field/);
    }
  });

  // Check that region authors are hidden.
  it("doesn't say who drew a region", async () => {
    // Ask for a region's author.
    const result = await run(`{ image(id: "i1") { regions { author { name } } } }`);

    // There's no data.
    expect(result.data).toBeUndefined();

    // The error says the field doesn't exist.
    expect(result.errors?.map((e) => e.message)).toEqual(['Cannot query field "author" on type "Region".']);

    // The database wasn't even asked.
    expect(fakeDb.region.findUnique).not.toHaveBeenCalled();
  });
});

// Group the tests for the `images` query.
describe("images", () => {
  // The query used throughout.
  const query = `query ($first: Int, $after: String) {
    images(first: $first, after: $after) { nodes { id } pageInfo { endCursor hasNextPage } }
  }`;

  // The shape of a page of results.
  type Page = { nodes: { id: string }[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } };

  // Fetch one page, checking there are no errors.
  const page = async (variables: { first: number; after?: string }) => {
    // Run the query.
    const result = await run(query, variables);

    // There are no errors.
    expect(result.errors).toBeUndefined();

    // Return the page.
    return (result.data as { images: Page }).images;
  };

  // Build a cursor from text.
  const cursor = (text: string) => Buffer.from(text).toString("base64url");

  // The ordering the resolver should ask the database for.
  const order = [{ createdAt: "desc" }, { id: "desc" }];

  // i2 and i4 share a createdAt; i4 comes first because its id is larger.
  const newestFirst = ["i3", "i4", "i2", "i1"];

  // Check paging, end to end.
  it("pages through the images, newest first, with ties broken by id", async () => {
    // Get the first page of two.
    const first = await page({ first: 2 });

    // It has the two newest images, and says there's more.
    expect(first).toEqual({
      nodes: [{ id: "i3" }, { id: "i4" }],
      pageInfo: { endCursor: cursor("2026-10-02T12:00:00.000Z|i4"), hasNextPage: true },
    });

    // The database was asked for one extra row, with no filter.
    expect(fakeDb.image.findMany).toHaveBeenLastCalledWith({
      // No filter on the first page.
      where: {},
      // Newest first.
      orderBy: order,
      // One more than the page size.
      take: 3,
      // Some selection of columns.
      select: expect.any(Object),
    });

    // Get the second page, using the first page's cursor.
    const second = await page({ first: 2, after: first.pageInfo.endCursor! });

    // It has the two oldest images, and says there's no more.
    expect(second).toEqual({
      nodes: [{ id: "i2" }, { id: "i1" }],
      pageInfo: { endCursor: cursor("2026-10-01T12:00:00.000Z|i1"), hasNextPage: false },
    });

    // A keyset query from the cursor's position: no Prisma cursor or skip.
    const time = new Date("2026-10-02T12:00:00.000Z");

    // The database was asked for rows after the cursor's position.
    expect(fakeDb.image.findMany).toHaveBeenLastCalledWith({
      // Older, or the same age with a smaller id.
      where: { OR: [{ createdAt: { lt: time } }, { createdAt: time, id: { lt: "i4" } }] },
      // Newest first.
      orderBy: order,
      // One more than the page size.
      take: 3,
      // Some selection of columns.
      select: expect.any(Object),
    });
  });

  // Check that paging covers everything.
  it("returns every image once, whatever the page size", async () => {
    // Try several page sizes.
    for (const first of [1, 2, 3, 4, 50]) {
      // The ids seen so far.
      const seen: string[] = [];

      // The cursor for the next page.
      let after: string | undefined;

      // Page until there's no more (with a safety limit).
      for (let pages = 0; pages < 10; pages++) {
        // Get a page.
        const { nodes, pageInfo } = await page({ first, after });

        // Record its ids.
        seen.push(...nodes.map((n) => n.id));

        // Stop at the last page.
        if (!pageInfo.hasNextPage) break;

        // Carry on from where this page ended.
        after = pageInfo.endCursor!;
      }

      // Every image was seen once, in order.
      expect(seen).toEqual(newestFirst);
    }
  });

  // Check that deleting a cursor's image doesn't break paging.
  it("carries on from a cursor whose image has since been deleted", async () => {
    // Get the first page.
    const first = await page({ first: 2 });

    // Its last image is i4.
    expect(first.nodes.at(-1)).toEqual({ id: "i4" });

    // Find i4's position in the table.
    const index = rows.images.findIndex((i) => i.id === "i4");

    // Remove i4.
    const [deleted] = rows.images.splice(index, 1);

    // Make sure it's put back, whatever happens.
    try {
      // Get the next page from the now-dangling cursor.
      const second = await page({ first: 2, after: first.pageInfo.endCursor! });

      // Paging carries on with the older images.
      expect(second.nodes).toEqual([{ id: "i2" }, { id: "i1" }]);

      // And there's nothing after them.
      expect(second.pageInfo.hasNextPage).toBe(false);
    } finally {
      // Restore i4.
      rows.images.splice(index, 0, deleted);
    }
  });

  // Check the end of the list.
  it("returns an empty page after the oldest image", async () => {
    // Paging from the oldest image's cursor gives nothing.
    expect(await page({ first: 2, after: cursor("2026-10-01T12:00:00.000Z|i1") })).toEqual({
      // No images.
      nodes: [],
      // No cursor, and no more.
      pageInfo: { endCursor: null, hasNextPage: false },
    });
  });

  // Check bad cursors.
  it.each([
    // Text that isn't a cursor.
    ["nonsense", "nonsense"],
    // An empty cursor.
    ["an empty string", ""],
    // A time with no id.
    ["a cursor with no id", cursor("2026-10-02T12:00:00.000Z")],
    // A time with an empty id.
    ["a cursor with an empty id", cursor("2026-10-02T12:00:00.000Z|")],
    // An id with an unreadable time.
    ["a cursor with a bad date", cursor("yesterday|i2")],
    // Too many parts.
    ["a cursor with extra parts", cursor("2026-10-02T12:00:00.000Z|i2|x")],
    // The old cursor format.
    ["a plain image id (the old cursor)", "i2"],
  ])("refuses %s as after", async (_, after) => {
    // Send the bad cursor.
    const result = await run(query, { first: 2, after });

    // The whole result is null.
    expect(result.data).toBeNull();

    // There's exactly one error.
    expect(result.errors).toHaveLength(1);

    // It says the cursor is bad, with the right code.
    expect(result.errors?.[0]).toMatchObject({
      // The message.
      message: "after isn't a cursor from this API.",
      // The error code.
      extensions: { code: "BAD_USER_INPUT" },
    });

    // The database wasn't asked.
    expect(fakeDb.image.findMany).not.toHaveBeenCalled();
  });

  // Check bad page sizes.
  it.each([0, 51, -1])("refuses first: %i", async (first) => {
    // Send the bad page size.
    const result = await run(query, { first });

    // The error says what's allowed, with the right code.
    expect(result.errors?.[0]).toMatchObject({
      // The message.
      message: "first must be between 1 and 50.",
      // The error code.
      extensions: { code: "BAD_USER_INPUT" },
    });

    // The database wasn't asked.
    expect(fakeDb.image.findMany).not.toHaveBeenCalled();
  });
});

// Group the tests for the `collections` query.
describe("collections", () => {
  // Check the list.
  it("lists collections with their images in row order", async () => {
    // Ask for collections and their images.
    const result = await run(`{ collections { slug name blurb images { id } } }`);

    // The images are in row order: i1 then i2.
    expect(result.data).toEqual({
      collections: [{ slug: "early", name: "Early", blurb: null, images: [{ id: "i1" }, { id: "i2" }] }],
    });
  });
});

// Group the tests for the query limits.
describe("query limits", () => {
  // Only the limits rule, with the default limits unless given.
  const check = (
    // The query to check.
    query: string,
    // Optional limits.
    { depth, fields, topLevel }: { depth?: number; fields?: number; topLevel?: number } = {},
  ) => validate(schema, parse(query), [queryLimits(depth, fields, topLevel)]).map((e) => e.message);

  // The message for too many fields.
  const tooMany = `Query selects too many fields (at most ${MAX_FIELDS}).`;

  // The message for too many top-level fields.
  const tooBroad = `Query asks for too many things at once (at most ${MAX_TOP_LEVEL_FIELDS} top-level fields).`;

  // Check the defaults.
  it("has the documented defaults", () => {
    // Depth 8, 200 fields, 3 top-level fields.
    expect([MAX_DEPTH, MAX_FIELDS, MAX_TOP_LEVEL_FIELDS]).toEqual([8, 200, 3]);
  });

  // Check that real queries fit.
  it("allows the schema's deepest query at the default limit", () => {
    // The deepest real query passes.
    expect(check(`{ images { nodes { regions { annotations { author { name } } } } } }`)).toEqual([]);
  });

  // Check depth, including through fragments.
  it("rejects queries nested deeper than the limit, through fragments too", () => {
    // A query whose depth is hidden in a fragment.
    const query = `
      { images { nodes { ...Img } } }
      fragment Img on Image { regions { annotations { author { name } } } }`;

    // It passes at depth 6.
    expect(check(query, { depth: 6 })).toEqual([]);

    // It fails at depth 5.
    expect(check(query, { depth: 5 })).toEqual(["Query is nested too deeply (at most 5 levels)."]);
  });

  // Check that aliases count.
  it("counts aliased fields towards the field limit", async () => {
    // One top-level field, so only the field limit is broken. `image` itself is one field.
    const aliases = (count: number) => Array.from({ length: count }, (_, n) => `a${n}: id`).join(" ");

    // One field fewer than the limit passes.
    expect(check(`{ image(id: "i1") { ${aliases(MAX_FIELDS - 1)} } }`)).toEqual([]);

    // Run a query at the limit through the server.
    const result = await run(`{ image(id: "i1") { ${aliases(MAX_FIELDS)} } }`);

    // It's refused for having too many fields.
    expect(result.errors?.map((e) => e.message)).toEqual([tooMany]);

    // The database wasn't asked.
    expect(fakeDb.image.findUnique).not.toHaveBeenCalled();
  });

  // Check __typename.
  it("counts __typename as a field, but not as a top-level one", () => {
    // A query with __typename at both levels.
    const query = `{ __typename image(id: "i1") { __typename id } }`;

    // It has four fields.
    expect(check(query, { fields: 4 })).toEqual([]);

    // It fails with a limit of three.
    expect(check(query, { fields: 3 })).toEqual(["Query selects too many fields (at most 3)."]);

    // Two __typename fields plus three real top-level ones are within the top-level limit.
    expect(
      check(`{ __typename a: __typename image(id: "i1") { id } images { nodes { id } } collections { slug } }`),
    ).toEqual([]);
  });

  // Check introspection fields.
  it("doesn't measure __schema or __type", () => {
    // A very deep introspection query.
    const deep = `__schema { types { fields { type { ofType { ofType { ofType { ofType { ofType { name } } } } } } } } }`;

    // The same query with real fields beside it.
    const query = `{ ${deep} __type(name: "Image") { name } image(id: "i1") { id } images { nodes { id } } collections { slug } }`;

    // Without them, the query is 7 fields, 3 top-level ones and 3 levels deep: all within limits.
    expect(check(query, { fields: 7, depth: 3 })).toEqual([]);

    // One field fewer fails, so the count is exact.
    expect(check(query, { fields: 6 })).toEqual(["Query selects too many fields (at most 6)."]);
  });

  // Check that fragment blow-up is handled quickly.
  it("rejects a document of fragments that each spread the next twice, quickly", async () => {
    // Expanded in full this is 2^40 fields. Each fragment must be measured once and its size
    // reused; walking it again at every spread would never finish (a hang here is this bug).
    const fragments = Array.from({ length: 40 }, (_, n) => `fragment F${n + 1} on Query { ...F${n} ...F${n} }`);

    // The whole document.
    const query = ["query { ...F40 }", "fragment F0 on Query { __typename }", ...fragments].join("\n");

    // Start the clock.
    const start = performance.now();

    // The rule rejects it.
    expect(check(query)).toEqual([tooMany]);

    // The server rejects it too.
    const result = await run(query);

    // Both took under a second.
    expect(performance.now() - start).toBeLessThan(1000);

    // The server's error is the same.
    expect(result.errors?.map((e) => e.message)).toEqual([tooMany]);
  });

  // Check the top-level limit.
  it("allows three top-level fields", async () => {
    // Ask for three things at once.
    const result = await run(`{ image(id: "i1") { id } images(first: 1) { nodes { id } } collections { slug } }`);

    // There are no errors.
    expect(result.errors).toBeUndefined();

    // All three are answered.
    expect(result.data).toEqual({
      // The image.
      image: { id: "i1" },
      // The newest image.
      images: { nodes: [{ id: "i3" }] },
      // The collections.
      collections: [{ slug: "early" }],
    });
  });

  // Check that aliases don't dodge the limit.
  it("rejects a fourth top-level field, even under an alias", async () => {
    // Ask for four things at once.
    const result = await run(
      `{ image(id: "i1") { id } images { nodes { id } } collections { slug } more: collections { slug } }`,
    );

    // There's no data.
    expect(result.data).toBeUndefined();

    // The error says it's too broad.
    expect(result.errors?.map((e) => e.message)).toEqual([tooBroad]);

    // The database wasn't asked for collections.
    expect(fakeDb.collection.findMany).not.toHaveBeenCalled();

    // Nor for images.
    expect(fakeDb.image.findMany).not.toHaveBeenCalled();
  });

  // Check fragment handling for the top-level limit.
  it("counts top-level fields through fragments and inline fragments", () => {
    // Two fragments: one with two top-level fields, one with one.
    const fragments = `
      fragment Two on Query { image(id: "i1") { id } images { nodes { id } } }
      fragment One on Query { collections { slug } }`;

    // Three in total passes.
    expect(check(`{ ...Two ... on Query { ...One } } ${fragments}`)).toEqual([]);

    // Four in total fails.
    expect(check(`{ ...Two ... on Query { ...One more: collections { slug } } } ${fragments}`)).toEqual([tooBroad]);

    // A fragment spread twice counts twice.
    expect(check(`{ ...Two ... on Query { ...Two } } ${fragments}`)).toEqual([tooBroad]);
  });

  // Check that operations are counted separately.
  it("applies the top-level limit to each operation on its own", () => {
    // Two operations, each with three top-level fields.
    const query = `
      query A { image(id: "i1") { id } images { nodes { id } } collections { slug } }
      query B { image(id: "i2") { id } images { nodes { id } } collections { slug } }`;

    // Neither is over the limit.
    expect(check(query)).toEqual([]);
  });

  // Check cycles.
  it("survives a fragment cycle", () => {
    // Two fragments that spread each other.
    const query = `
      { images { nodes { ...A } } }
      fragment A on Image { id ...B }
      fragment B on Image { title ...A }`;

    // graphql-js reports the cycle itself; the limits rule must just not loop.
    expect(check(query)).toEqual([]);
  });

  // Check cycles through the server.
  it("refuses a fragment cycle through the server without hanging", async () => {
    // A cycle sent to the server.
    const result = await run(`{ ...A } fragment A on Query { __typename ...B } fragment B on Query { ...A }`);

    // There's no data.
    expect(result.data).toBeUndefined();

    // GraphQL's own rule reports the cycle.
    expect(result.errors?.map((e) => e.message)).toContainEqual(expect.stringMatching(/within itself/));
  });
});

// Group the tests for cross-origin access.
describe("CORS", () => {
  // The origin of a pretend other site.
  const origin = "https://elsewhere.example";

  // Check queries, in both modes.
  it.each([false, true])("never allows credentials on a query (production: %s)", async (production) => {
    // Send a query from another origin.
    const response = await createGraphQLServer({ production }).fetch("http://localhost/api/graphql", {
      // Use POST.
      method: "POST",
      // Declare JSON, and claim to come from another site.
      headers: { "content-type": "application/json", origin },
      // A simple query.
      body: JSON.stringify({ query: `{ image(id: "i1") { id } }` }),
    });

    // It succeeds.
    expect(response.status).toBe(200);

    // Any site may read it.
    expect(response.headers.get("access-control-allow-origin")).toBeTruthy();

    // But never with cookies.
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  // Check preflight, in both modes.
  it.each([false, true])("never allows credentials on a preflight (production: %s)", async (production) => {
    // Send a preflight request from another origin.
    const response = await createGraphQLServer({ production }).fetch("http://localhost/api/graphql", {
      // Use OPTIONS.
      method: "OPTIONS",
      // Ask whether a JSON POST would be allowed.
      headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });

    // It succeeds.
    expect(response.status).toBeLessThan(300);

    // Any site may read it.
    expect(response.headers.get("access-control-allow-origin")).toBeTruthy();

    // POST is allowed.
    expect(response.headers.get("access-control-allow-methods")).toMatch(/POST/);

    // But never with cookies.
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

// Group the tests for production mode.
describe("production", () => {
  // A simple introspection query.
  const introspection = `{ __schema { queryType { name } } }`;

  // Check development.
  it("allows introspection in development", async () => {
    // It works.
    expect((await run(introspection)).data).toEqual({ __schema: { queryType: { name: "Query" } } });
  });

  // Check production.
  it("refuses introspection in production", async () => {
    // Run it in production mode.
    const result = await run(introspection, undefined, { production: true });

    // There's no data.
    expect(result.data).toBeUndefined();

    // The error mentions introspection.
    expect(result.errors?.[0].message).toMatch(/introspection/i);
  });

  // Check GraphiQL.
  it("serves GraphiQL in development only", async () => {
    // Fetch the page as a browser would.
    const page = (production: boolean) =>
      // Ask for HTML.
      createGraphQLServer({ production }).fetch("http://localhost/api/graphql", { headers: { accept: "text/html" } });

    // Development answers with HTML.
    expect((await page(false)).headers.get("content-type")).toMatch(/text\/html/);

    // Production doesn't.
    expect((await page(true)).headers.get("content-type") ?? "").not.toMatch(/text\/html/);
  });

  // Check that normal use still works.
  it("still answers ordinary queries in production", async () => {
    // An ordinary query works.
    expect((await run(`{ image(id: "i2") { title } }`, undefined, { production: true })).data).toEqual({
      image: { title: "Second" },
    });
  });
});
