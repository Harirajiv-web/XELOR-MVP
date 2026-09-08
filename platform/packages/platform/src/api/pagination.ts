/**
 * Cursor pagination only (DECISIONS-V2 §5.3) — never offset. Offset pagination
 * drifts under concurrent inserts and scans linearly; a keyset cursor on
 * (created_at, id) is stable and index-friendly.
 */
export interface CursorPage<T> {
  items: T[];
  /** Opaque cursor for the next page; null when the last page is reached. */
  nextCursor: string | null;
}

export interface CursorQuery {
  limit: number;
  cursor?: string;
}

/** Encode a keyset position (createdAt ISO + id) into an opaque cursor. */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!createdAt || !id) throw new Error("Malformed cursor");
  return { createdAt, id };
}
