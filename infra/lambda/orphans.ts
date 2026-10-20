// Which stored objects are orphans: no Image row points at them, and they're old enough that no
// upload can still be in progress. Pure, so it's unit-tested without R2 or Postgres.

export interface StoredObject {
  key: string;
  /** When R2 last wrote the object. Undefined if R2 didn't say; such objects are never deleted. */
  lastModified: Date | undefined;
}

/** 24 hours. Far longer than the 5-minute signed upload URL plus a pause at the duplicate warning. */
export const DEFAULT_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Keys to delete: objects with no Image row (not in `knownKeys`) that are strictly older than
 * `minAgeMs` at `now`. An object exactly `minAgeMs` old is kept until the next run.
 */
export function findOrphans(
  objects: readonly StoredObject[],
  knownKeys: ReadonlySet<string>,
  now: Date,
  minAgeMs: number = DEFAULT_MIN_AGE_MS,
): string[] {
  return objects
    .filter(
      (o) =>
        !knownKeys.has(o.key) &&
        o.lastModified !== undefined &&
        now.getTime() - o.lastModified.getTime() > minAgeMs,
    )
    .map((o) => o.key);
}

/** Split a list into chunks of at most `size` (DeleteObjects takes up to 1,000 keys). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
