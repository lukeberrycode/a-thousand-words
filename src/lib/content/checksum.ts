import { createHash } from "node:crypto";
import type { Operation } from "./operations";

/**
 * JSON with every object's keys sorted, so the same operations always give the same text however
 * the file is formatted or its fields ordered. Fields set to undefined are left out, as
 * JSON.stringify does.
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => stableJson(v ?? null)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 of a file's operations. An applied file whose checksum changes is refused. */
export function checksum(operations: Operation[]) {
  return createHash("sha256").update(stableJson(operations)).digest("hex");
}
