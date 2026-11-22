// Import the error class for reporting bad requests.
import { GraphQLError } from "graphql";

// Import the function that builds an executable schema.
import { createSchema } from "graphql-yoga";

// Import the shared database client.
import { db } from "@/lib/db";

// Import the helper that turns a storage key into a public URL.
import { publicUrl } from "@/lib/storage";

// The read-only GraphQL API at /api/graphql (ADR 0023). It exposes what any visitor can already
// see on the site, and nothing else: no emails, approval state, fingerprints or Auth.js rows.

/** Most images one `images` query returns. */
export const PAGE_MAX = 50;

/** Most images one collection returns, like a home page row. */
const COLLECTION_IMAGES_MAX = 50;

// The schema, written in GraphQL's own language. It sits in a template string, so it can't hold // comments.
const typeDefs = /* GraphQL */ `
  type Query {
    image(id: ID!): Image
    """
    Every image, newest first. first is 1 to ${PAGE_MAX}; pass the last page's endCursor as
    after to get the next page. A cursor still works if its image has since been deleted.
    """
    images(first: Int = 20, after: String): ImagePage!
    "Themed rows on the home page, in their set order."
    collections: [Collection!]!
  }

  type Image {
    id: ID!
    title: String!
    description: String
    "The image file's public URL."
    url: String!
    "Pixel size of the image file."
    width: Int!
    height: Int!
    "ISO 8601."
    createdAt: String!
    owner: Author!
    "Boxes on the image, oldest first."
    regions: [Region!]!
  }

  "A box on an image, as fractions (0 to 1) of the image's width and height (ADR 0005)."
  type Region {
    id: ID!
    x: Float!
    y: Float!
    w: Float!
    h: Float!
    createdAt: String!
    updatedAt: String!
    "Oldest first."
    annotations: [Annotation!]!
  }

  type Annotation {
    id: ID!
    """
    Markdown written by any signed-in user, exactly as stored. It's untrusted: render it without
    raw HTML or images, as the site does (ADR 0008).
    """
    bodyMarkdown: String!
    createdAt: String!
    updatedAt: String!
    author: Author!
  }

  "A user, as the site shows them to other people."
  type Author {
    "Display name from GitHub; null if they haven't set one."
    name: String
  }

  type Collection {
    slug: String!
    name: String!
    blurb: String
    "In row order; at most ${COLLECTION_IMAGES_MAX}."
    images: [Image!]!
  }

  type ImagePage {
    nodes: [Image!]!
    pageInfo: PageInfo!
  }

  type PageInfo {
    "Pass as after to get the next page; null if this page is empty."
    endCursor: String
    hasNextPage: Boolean!
  }
`;

// The Image columns the API reads. Never sha256 or phash: they aren't public, and BigInt
// doesn't serialise to JSON.
const imageSelect = {
  // The image's id.
  id: true,

  // Its title.
  title: true,

  // Its description.
  description: true,

  // Where its file is stored.
  storageKey: true,

  // Its pixel width.
  width: true,

  // Its pixel height.
  height: true,

  // When it was uploaded.
  createdAt: true,
} as const;

// An image row as read with the columns above.
type ImageRow = {
  // The image's id.
  id: string;

  // Its title.
  title: string;

  // Its description, if any.
  description: string | null;

  // Where its file is stored.
  storageKey: string;

  // Its pixel width.
  width: number;

  // Its pixel height.
  height: number;

  // When it was uploaded.
  createdAt: Date;
};

// Anything with an id.
type HasId = { id: string };

// Anything with dates.
type Dated = { createdAt: Date; updatedAt?: Date };

// Read only a user's name.
const authorSelect = { select: { name: true } } as const;

// A page cursor is the last image's position in the order: its createdAt and id, base64url-encoded.
// Clients should treat it as opaque.
function encodeCursor(image: { createdAt: Date; id: string }) {
  // Join the time and id with a bar, then encode them as base64url.
  return Buffer.from(`${image.createdAt.toISOString()}|${image.id}`).toString("base64url");
}

// Turn a cursor back into a time and id, or fail with a clear error.
function decodeCursor(cursor: string) {
  // Decode the cursor and split it at the bars.
  const [time, id, ...rest] = Buffer.from(cursor, "base64url").toString().split("|");

  // Read the time part as a date.
  const createdAt = new Date(time ?? "");

  // Reject cursors with no id, extra parts, or an unreadable date.
  if (!id || rest.length > 0 || Number.isNaN(createdAt.getTime())) {
    // Tell the client the cursor is bad.
    throw new GraphQLError("after isn't a cursor from this API.", { extensions: { code: "BAD_USER_INPUT" } });
  }

  // Return the position.
  return { createdAt, id };
}

// Nested fields use Prisma's fluent API (`findUnique(...).regions()`). Prisma batches findUnique
// calls made in the same tick into one query, so a page of 50 images costs one regions query,
// not 50: its answer to GraphQL's N+1 problem, without adding DataLoader.
const resolvers = {
  // Top-level queries.
  Query: {
    // `image(id)`: one image, or null.
    image: (_: unknown, { id }: { id: string }) => db.image.findUnique({ where: { id }, select: imageSelect }),

    // `images(first, after)`: a page of images, newest first.
    images: async (_: unknown, { first, after }: { first: number; after?: string | null }) => {
      // Refuse page sizes outside 1 to PAGE_MAX.
      if (!Number.isInteger(first) || first < 1 || first > PAGE_MAX) {
        // Tell the client what's allowed.
        throw new GraphQLError(`first must be between 1 and ${PAGE_MAX}.`, { extensions: { code: "BAD_USER_INPUT" } });
      }

      // Ordered by createdAt, with ties broken by id, so pages never overlap. The next page starts
      // after the last image's position, not at its row, so deleting that image doesn't end paging.
      const from = after == null ? null : decodeCursor(after);

      // Fetch one more row than asked for, to learn whether there's a next page.
      const rows = await db.image.findMany({
        // Rows after the cursor, or all rows if there's no cursor.
        where: from
          ? { OR: [{ createdAt: { lt: from.createdAt } }, { createdAt: from.createdAt, id: { lt: from.id } }] }
          : {},

        // Newest first, ties broken by id.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],

        // One extra row.
        take: first + 1,

        // Only the public columns.
        select: imageSelect,
      });

      // The page itself, without the extra row.
      const nodes = rows.slice(0, first);

      // The last image on the page.
      const last = nodes.at(-1);

      // Return the page and its paging details.
      return { nodes, pageInfo: { endCursor: last ? encodeCursor(last) : null, hasNextPage: rows.length > first } };
    },

    // `collections`: the home page's themed rows.
    collections: () =>
      // Read them from the database.
      db.collection.findMany({
        // In their set order.
        orderBy: { sortOrder: "asc" },

        // Only the public columns.
        select: { id: true, slug: true, name: true, blurb: true },
      }),
  },

  // Fields of an Image.
  Image: {
    // The file's public URL.
    url: (image: ImageRow) => publicUrl(image.storageKey),

    // The upload time as ISO text.
    createdAt: (image: Dated) => image.createdAt.toISOString(),

    // The uploader (name only).
    owner: (image: HasId) => db.image.findUnique({ where: { id: image.id } }).owner(authorSelect),

    // The image's regions, oldest first.
    regions: (image: HasId) =>
      // Start from the image.
      db.image
        .findUnique({ where: { id: image.id } })
        // Load its regions in a fixed order.
        .regions({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
        // Use an empty list if the image has gone.
        .then((r) => r ?? []),
  },

  // Fields of a Region.
  Region: {
    // The creation time as ISO text.
    createdAt: (region: Dated) => region.createdAt.toISOString(),

    // The last-change time as ISO text.
    updatedAt: (region: Dated) => region.updatedAt!.toISOString(),

    // The region's annotations, oldest first.
    annotations: (region: HasId) =>
      // Start from the region.
      db.region
        .findUnique({ where: { id: region.id } })
        // Load its annotations in a fixed order.
        .annotations({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
        // Use an empty list if the region has gone.
        .then((a) => a ?? []),
  },

  // Fields of an Annotation.
  Annotation: {
    // The creation time as ISO text.
    createdAt: (annotation: Dated) => annotation.createdAt.toISOString(),

    // The last-change time as ISO text.
    updatedAt: (annotation: Dated) => annotation.updatedAt!.toISOString(),

    // The author (name only).
    author: (annotation: HasId) => db.annotation.findUnique({ where: { id: annotation.id } }).author(authorSelect),
  },

  // Fields of a Collection.
  Collection: {
    // The collection's images, in row order.
    images: async (collection: HasId) => {
      // Load the links between the collection and its images.
      const links = await db.collection.findUnique({ where: { id: collection.id } }).images({
        // In row order.
        orderBy: { position: "asc" },

        // No more than the limit.
        take: COLLECTION_IMAGES_MAX,

        // Only the public image columns.
        select: { image: { select: imageSelect } },
      });

      // Return the images themselves.
      return (links ?? []).map((link) => link.image);
    },
  },
};

// Build and export the schema from the definitions and resolvers.
export const schema = createSchema({ typeDefs, resolvers });
