import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";
import { db } from "@/lib/db";
import { publicUrl } from "@/lib/storage";

// The read-only GraphQL API at /api/graphql (ADR 0020). It exposes what any visitor can already
// see on the site, and nothing else: no emails, approval state, fingerprints or Auth.js rows.

/** Most images one `images` query returns. */
export const PAGE_MAX = 50;
/** Most images one collection returns, like a home page row. */
const COLLECTION_IMAGES_MAX = 50;

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
  id: true,
  title: true,
  description: true,
  storageKey: true,
  width: true,
  height: true,
  createdAt: true,
} as const;

type ImageRow = {
  id: string;
  title: string;
  description: string | null;
  storageKey: string;
  width: number;
  height: number;
  createdAt: Date;
};
type HasId = { id: string };
type Dated = { createdAt: Date; updatedAt?: Date };

const authorSelect = { select: { name: true } } as const;

// A page cursor is the last image's position in the order: its createdAt and id, base64url-encoded.
// Clients should treat it as opaque.
function encodeCursor(image: { createdAt: Date; id: string }) {
  return Buffer.from(`${image.createdAt.toISOString()}|${image.id}`).toString("base64url");
}

function decodeCursor(cursor: string) {
  const [time, id, ...rest] = Buffer.from(cursor, "base64url").toString().split("|");
  const createdAt = new Date(time ?? "");
  if (!id || rest.length > 0 || Number.isNaN(createdAt.getTime())) {
    throw new GraphQLError("after isn't a cursor from this API.", { extensions: { code: "BAD_USER_INPUT" } });
  }
  return { createdAt, id };
}

// Nested fields use Prisma's fluent API (`findUnique(...).regions()`). Prisma batches findUnique
// calls made in the same tick into one query, so a page of 50 images costs one regions query,
// not 50: its answer to GraphQL's N+1 problem, without adding DataLoader.
const resolvers = {
  Query: {
    image: (_: unknown, { id }: { id: string }) => db.image.findUnique({ where: { id }, select: imageSelect }),

    images: async (_: unknown, { first, after }: { first: number; after?: string | null }) => {
      if (!Number.isInteger(first) || first < 1 || first > PAGE_MAX) {
        throw new GraphQLError(`first must be between 1 and ${PAGE_MAX}.`, { extensions: { code: "BAD_USER_INPUT" } });
      }
      // Ordered by createdAt, with ties broken by id, so pages never overlap. The next page starts
      // after the last image's position, not at its row, so deleting that image doesn't end paging.
      const from = after == null ? null : decodeCursor(after);
      const rows = await db.image.findMany({
        where: from
          ? { OR: [{ createdAt: { lt: from.createdAt } }, { createdAt: from.createdAt, id: { lt: from.id } }] }
          : {},
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: first + 1,
        select: imageSelect,
      });
      const nodes = rows.slice(0, first);
      const last = nodes.at(-1);
      return { nodes, pageInfo: { endCursor: last ? encodeCursor(last) : null, hasNextPage: rows.length > first } };
    },

    collections: () =>
      db.collection.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, name: true, blurb: true },
      }),
  },

  Image: {
    url: (image: ImageRow) => publicUrl(image.storageKey),
    createdAt: (image: Dated) => image.createdAt.toISOString(),
    owner: (image: HasId) => db.image.findUnique({ where: { id: image.id } }).owner(authorSelect),
    regions: (image: HasId) =>
      db.image
        .findUnique({ where: { id: image.id } })
        .regions({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
        .then((r) => r ?? []),
  },

  Region: {
    createdAt: (region: Dated) => region.createdAt.toISOString(),
    updatedAt: (region: Dated) => region.updatedAt!.toISOString(),
    annotations: (region: HasId) =>
      db.region
        .findUnique({ where: { id: region.id } })
        .annotations({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
        .then((a) => a ?? []),
  },

  Annotation: {
    createdAt: (annotation: Dated) => annotation.createdAt.toISOString(),
    updatedAt: (annotation: Dated) => annotation.updatedAt!.toISOString(),
    author: (annotation: HasId) => db.annotation.findUnique({ where: { id: annotation.id } }).author(authorSelect),
  },

  Collection: {
    images: async (collection: HasId) => {
      const links = await db.collection.findUnique({ where: { id: collection.id } }).images({
        orderBy: { position: "asc" },
        take: COLLECTION_IMAGES_MAX,
        select: { image: { select: imageSelect } },
      });
      return (links ?? []).map((link) => link.image);
    },
  },
};

export const schema = createSchema({ typeDefs, resolvers });
