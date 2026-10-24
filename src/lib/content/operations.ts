import type { Region } from "@/lib/regions";

// The operations a content file in prisma/content can contain (ADR 0026). Each file exports
// `operations`, a list of these, applied in order. Keys are stable: later files refer to earlier
// content by them.

/** Add a painting from Wikimedia Commons. */
export type AddPainting = {
  op: "addPainting";
  /** Lower-case words joined by hyphens. Also names the file in R2. */
  key: string;
  title: string;
  description: string;
  /** The Commons file page, such as https://commons.wikimedia.org/wiki/File:Example.jpg. */
  source: string;
};

/** Add a box to a painting, holding one annotation by the content account. */
export type Annotate = {
  op: "annotate";
  /** The painting's key. */
  painting: string;
  /** The box's key, unique across every content file. */
  key: string;
  region: Region;
  body: string;
  /** Where each claim comes from: at least one URL. */
  sources: string[];
};

/**
 * Change the text, and optionally the box, of a content annotation. If the box can't move (it
 * holds someone else's annotation, or would hide another box), the whole step is skipped, text
 * included, so the text never ends up beside the wrong box.
 */
export type EditAnnotation = {
  op: "editAnnotation";
  key: string;
  body: string;
  region?: Region;
  sources: string[];
};

/** Remove a content annotation. Its box goes too if it's left empty. */
export type RemoveAnnotation = { op: "removeAnnotation"; key: string };

/** Remove a content painting, unless anyone else has annotated it. */
export type RemovePainting = { op: "removePainting"; key: string };

/** Add a home page row (ADR 0014). It goes below the existing rows. */
export type AddCollection = { op: "addCollection"; slug: string; name: string; blurb: string };

/** Add paintings to the end of a row, in this order. */
export type AddToCollection = { op: "addToCollection"; collection: string; paintings: string[] };

/** Take paintings out of a row. Images added to it some other way stay. */
export type RemoveFromCollection = { op: "removeFromCollection"; collection: string; paintings: string[] };

export type Operation =
  | AddPainting
  | Annotate
  | EditAnnotation
  | RemoveAnnotation
  | RemovePainting
  | AddCollection
  | AddToCollection
  | RemoveFromCollection;

/** A content file: its name without the extension, such as "0001-baseline", and its operations. */
export type ContentFile = { name: string; operations: Operation[] };

/** The most paintings one file may add. */
export const MAX_PAINTINGS_PER_FILE = 25;

/** The account that owns everything content files add: the old seed's "A Thousand Words" user. */
export const CONTENT_USER = { id: "seed-user", name: "A Thousand Words" };

/**
 * The R2 key of a content painting. The `seed` prefix is the old seed's (prisma/seed.ts), kept so
 * the paintings it loaded keep their files.
 */
export function contentStorageKey(key: string) {
  return `images/seed/${key}.jpg`;
}
