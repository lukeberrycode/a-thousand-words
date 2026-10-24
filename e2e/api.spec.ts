import type { APIRequestContext } from "@playwright/test";
import { deleteObject, publicUrl, sql } from "./support/services";
import { expect, test } from "./support/world";

// The read-only GraphQL API at /api/graphql (docs/system-tests.md, ADR 0023). These call it as any
// client would, with no browser and no session, and compare its answers with the database.

type Result = {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

async function graphql(request: APIRequestContext, query: string, variables?: Record<string, unknown>) {
  const response = await request.post("/api/graphql", { data: { query, variables } });
  return { text: await response.text(), result: (await response.json()) as Result };
}

/** A timestamp column as the API writes it: ISO 8601 in UTC, to the millisecond. */
const iso = (column: string) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

type Page = {
  nodes: { id: string; createdAt: string }[];
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
};

const PAGE = `query ($first: Int, $after: String) {
  images(first: $first, after: $after) { nodes { id createdAt } pageInfo { endCursor hasNextPage } }
}`;

test("API-01: Query an image with its regions and annotations", async ({ request, world }) => {
  const owner = await world.user({ name: "Owner" });
  const other = await world.user({ name: "Other" });
  const image = await world.image(owner, { title: "API image", description: "Seen through the API" });
  const hat = await world.region(image, owner, { x: 0.1, y: 0.2, w: 0.3, h: 0.25 }, "A **hat**");
  await world.addAnnotation(hat, other, "<b>Not</b> a hat");
  const dog = await world.region(image, other, { x: 0.5, y: 0.55, w: 0.2, h: 0.15 }, "A dog");

  const { result } = await graphql(
    request,
    `
      query ($id: ID!) {
        image(id: $id) {
          id
          title
          description
          url
          width
          height
          createdAt
          owner {
            name
          }
          regions {
            id
            x
            y
            w
            h
            createdAt
            updatedAt
            annotations {
              bodyMarkdown
              createdAt
              updatedAt
              author {
                name
              }
            }
          }
        }
      }
    `,
    { id: image.id },
  );
  expect(result.errors).toBeUndefined();

  // Timestamps as the database holds them; everything else as the test made it.
  const [imageRow] = await sql<{ createdAt: string }>(
    `SELECT ${iso('"createdAt"')} AS "createdAt" FROM "Image" WHERE id = $1`,
    [image.id],
  );
  const times = async (table: string, ids: string[]) => {
    const found = await sql<{ id: string; createdAt: string; updatedAt: string }>(
      `SELECT id, ${iso('"createdAt"')} AS "createdAt", ${iso('"updatedAt"')} AS "updatedAt" FROM "${table}" WHERE id = ANY($1)`,
      [ids],
    );
    return new Map(found.map((r) => [r.id, { createdAt: r.createdAt, updatedAt: r.updatedAt }]));
  };
  const regionTimes = await times("Region", [hat, dog]);
  const annotations = await sql<{ id: string; regionId: string }>(
    `SELECT id, "regionId" FROM "Annotation" WHERE "regionId" = ANY($1) ORDER BY "createdAt"`,
    [[hat, dog]],
  );
  const annotationTimes = await times(
    "Annotation",
    annotations.map((a) => a.id),
  );
  const at = (regionId: string, n: number) =>
    annotationTimes.get(annotations.filter((a) => a.regionId === regionId)[n].id);

  expect(result.data).toEqual({
    image: {
      id: image.id,
      title: image.title,
      description: "Seen through the API",
      url: publicUrl(image.storageKey),
      width: image.width,
      height: image.height,
      createdAt: imageRow.createdAt,
      owner: { name: owner.name },
      // Oldest first, both regions and annotations.
      regions: [
        {
          id: hat,
          x: 0.1,
          y: 0.2,
          w: 0.3,
          h: 0.25,
          ...regionTimes.get(hat),
          annotations: [
            { bodyMarkdown: "A **hat**", ...at(hat, 0), author: { name: owner.name } },
            // Returned exactly as stored, for the client to render safely (ADR 0008).
            { bodyMarkdown: "<b>Not</b> a hat", ...at(hat, 1), author: { name: other.name } },
          ],
        },
        {
          id: dog,
          x: 0.5,
          y: 0.55,
          w: 0.2,
          h: 0.15,
          ...regionTimes.get(dog),
          annotations: [{ bodyMarkdown: "A dog", ...at(dog, 0), author: { name: other.name } }],
        },
      ],
    },
  });

  // The URL is the real file.
  expect((await request.get(publicUrl(image.storageKey))).status()).toBe(200);

  const missing = await graphql(
    request,
    `
      {
        image(id: "no-such-image") {
          id
        }
      }
    `,
  );
  expect(missing.result).toEqual({ data: { image: null } });
});

test("API-02: Page through every image, newest first", async ({ request, world }) => {
  const owner = await world.user();
  // Made one after another, so the newest three images on the site, newest last here.
  const oldest = await world.image(owner, { title: "Oldest" });
  const middle = await world.image(owner, { title: "Middle" });
  const newest = await world.image(owner, { title: "Newest" });

  const page = async (first: number, after?: string) => {
    const { result } = await graphql(request, PAGE, { first, after });
    expect(result.errors).toBeUndefined();
    return (result.data as { images: Page }).images;
  };

  const seen: Page["nodes"] = [];
  let after: string | undefined;
  for (let pages = 0; ; pages++) {
    expect(pages, "too many pages: paging isn't moving on").toBeLessThan(1000);
    const { nodes, pageInfo } = await page(3, after);
    seen.push(...nodes);
    if (!pageInfo.hasNextPage) break;
    expect(pageInfo.endCursor).toBeTruthy();
    after = pageInfo.endCursor!;
  }

  const ids = seen.map((n) => n.id);
  expect(new Set(ids).size, "no image twice").toBe(ids.length);
  expect(ids.slice(0, 3)).toEqual([newest.id, middle.id, oldest.id]);
  const times = seen.map((n) => n.createdAt);
  expect(times, "newest first").toEqual([...times].sort().reverse());
  // Every image, in the order the database gives: createdAt, then id, both descending.
  const all = await sql<{ id: string }>(`SELECT id FROM "Image" ORDER BY "createdAt" DESC, id DESC`);
  expect(ids).toEqual(all.map((r) => r.id));

  // A cursor still works after its image is deleted: the next page starts after its position.
  const firstTwo = await page(2);
  expect(firstTwo.nodes.map((n) => n.id)).toEqual([newest.id, middle.id]);
  await sql(`DELETE FROM "Image" WHERE id = $1`, [middle.id]);
  await deleteObject(middle.storageKey);
  const next = await page(1, firstTwo.pageInfo.endCursor!);
  expect(next.nodes.map((n) => n.id)).toEqual([oldest.id]);

  // A made-up cursor is refused.
  const bad = await graphql(request, PAGE, { first: 2, after: "nonsense" });
  expect(bad.result.data).toBeNull();
  expect(bad.result.errors).toEqual([
    expect.objectContaining({
      message: "after isn't a cursor from this API.",
      extensions: expect.objectContaining({ code: "BAD_USER_INPUT" }),
    }),
  ]);
});

test("API-03: The API gives out no private data", async ({ request, world }) => {
  const owner = await world.user({ name: "Owner" });
  const other = await world.user({ name: "Other" });
  const image = await world.image(owner, { title: "Private data check" });
  const region = await world.region(image, owner, { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, "Owner's note");
  await world.addAnnotation(region, other, "Other's note");

  // Everything the schema offers about images, regions, annotations, authors and collections.
  const { text, result } = await graphql(
    request,
    `
      query ($id: ID!) {
        image(id: $id) {
          ...Everything
        }
        images(first: 50) {
          nodes {
            ...Everything
          }
        }
        collections {
          slug
          name
          blurb
          images {
            ...Everything
          }
        }
      }
      fragment Everything on Image {
        id
        title
        description
        url
        width
        height
        createdAt
        owner {
          name
        }
        regions {
          id
          x
          y
          w
          h
          createdAt
          updatedAt
          annotations {
            id
            bodyMarkdown
            createdAt
            updatedAt
            author {
              name
            }
          }
        }
      }
    `,
    { id: image.id },
  );
  expect(result.errors).toBeUndefined();
  // The test's own data is in the response, names included...
  expect(text).toContain(owner.name);
  expect(text).toContain(other.name);
  // ...but no one's email address.
  const emails = await sql<{ email: string }>(`SELECT email FROM "User" WHERE email IS NOT NULL`);
  expect(emails.map((u) => u.email)).toEqual(expect.arrayContaining([owner.email, other.email]));
  for (const { email } of emails) expect(text, "an email address is in the response").not.toContain(email);

  // The schema has no field for them, or for who drew a region.
  for (const [query, message] of [
    [`{ image(id: "${image.id}") { owner { email } } }`, 'Cannot query field "email" on type "Author".'],
    [
      `{ image(id: "${image.id}") { regions { annotations { author { email } } } } }`,
      'Cannot query field "email" on type "Author".',
    ],
    [`{ image(id: "${image.id}") { regions { author { name } } } }`, 'Cannot query field "author" on type "Region".'],
  ]) {
    const refused = await graphql(request, query);
    expect(refused.result.data, query).toBeUndefined();
    expect(
      refused.result.errors?.map((e) => e.message),
      query,
    ).toEqual([message]);
  }
});
