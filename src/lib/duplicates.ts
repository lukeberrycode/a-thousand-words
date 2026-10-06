import "server-only";
import { db } from "@/lib/db";
import { SIMILAR_MAX_DISTANCE, type ImageFingerprint } from "@/lib/image-hash";
import { publicUrl } from "@/lib/storage";

export type SimilarImage = {
  id: string;
  title: string;
  thumbnail: string;
  annotationCount: number;
  /** The very same file, rather than a look-alike. */
  exact: boolean;
};

/**
 * Existing images that are the same file, or look the same (ADR 0010). At most three, closest first.
 * This compares against every fingerprinted image, which is fine at demo scale.
 */
export async function findSimilarImages(fp: Pick<ImageFingerprint, "sha256" | "phash">): Promise<SimilarImage[]> {
  const rows = await db.$queryRaw<
    { id: string; title: string; storageKey: string; annotationCount: number; exact: boolean }[]
  >`
    SELECT i.id, i.title, i."storageKey",
           (SELECT count(*) FROM "Annotation" a WHERE a."imageId" = i.id)::int AS "annotationCount",
           (i.sha256 = ${fp.sha256}) AS exact
    FROM "Image" i
    WHERE i.sha256 = ${fp.sha256}
       OR (i.phash IS NOT NULL AND bit_count((i.phash # ${fp.phash})::bit(64)) <= ${SIMILAR_MAX_DISTANCE})
    ORDER BY exact DESC, bit_count((i.phash # ${fp.phash})::bit(64)) ASC NULLS LAST
    LIMIT 3`;
  return rows.map(({ storageKey, ...r }) => ({ ...r, exact: !!r.exact, thumbnail: publicUrl(storageKey) }));
}
