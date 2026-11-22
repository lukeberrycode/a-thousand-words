// Make the build fail if this file is imported from client code.
import "server-only";

// Import the shared database client.
import { db } from "@/lib/db";

// Import the similarity threshold and the fingerprint type.
import { SIMILAR_MAX_DISTANCE, type ImageFingerprint } from "@/lib/image-hash";

// Import the helper that turns a storage key into a public URL.
import { publicUrl } from "@/lib/storage";

// An existing image that matches an upload.
export type SimilarImage = {
  // The image's id.
  id: string;

  // The image's title.
  title: string;

  // A URL for a small preview.
  thumbnail: string;

  // How many annotations the image has.
  annotationCount: number;

  /** The very same file, rather than a look-alike. */
  exact: boolean;
};

/**
 * Existing images that are the same file, or look the same (ADR 0010). At most three, closest first.
 * This compares against every fingerprinted image, which is fine at demo scale.
 */
export async function findSimilarImages(fp: Pick<ImageFingerprint, "sha256" | "phash">): Promise<SimilarImage[]> {
  // Run a raw SQL query (below) that finds exact and near matches, closest first, at most three.
  const rows = await db.$queryRaw<
    { id: string; title: string; storageKey: string; annotationCount: number; exact: boolean }[]
  >`
    SELECT i.id, i.title, i."storageKey",
           (SELECT count(*) FROM "Annotation" a JOIN "Region" r ON r.id = a."regionId"
             WHERE r."imageId" = i.id)::int AS "annotationCount",
           (i.sha256 = ${fp.sha256}) AS exact
    FROM "Image" i
    WHERE i.sha256 = ${fp.sha256}
       OR (i.phash IS NOT NULL AND bit_count((i.phash # ${fp.phash})::bit(64)) <= ${SIMILAR_MAX_DISTANCE})
    ORDER BY exact DESC, bit_count((i.phash # ${fp.phash})::bit(64)) ASC NULLS LAST
    LIMIT 3`;

  // Swap each storage key for a public thumbnail URL, and make `exact` a true boolean.
  return rows.map(({ storageKey, ...r }) => ({ ...r, exact: !!r.exact, thumbnail: publicUrl(storageKey) }));
}
