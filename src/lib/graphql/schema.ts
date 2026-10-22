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
    after to get the next page.
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
    "Who drew the box."
    author: Author!
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
      // The cursor is the last image's id; ties on createdAt are broken by id, so pages never overlap.
      const rows = await db.image.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: first + 1,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        select: imageSelect,
      });
      const nodes = rows.slice(0, first);
      return { nodes, pageInfo: { endCursor: nodes.at(-1)?.id ?? null, hasNextPage: rows.length > first } };
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
        .regions({ orderBy: { createdAt: "asc" } })
        .then((r) => r ?? []),
  },

  Region: {
    createdAt: (region: Dated) => region.createdAt.toISOString(),
    updatedAt: (region: Dated) => region.updatedAt!.toISOString(),
    author: (region: HasId) => db.region.findUnique({ where: { id: region.id } }).author(authorSelect),
    annotations: (region: HasId) =>
      db.region
        .findUnique({ where: { id: region.id } })
        .annotations({ orderBy: { createdAt: "asc" } })
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
