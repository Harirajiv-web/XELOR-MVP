import { createHash } from "node:crypto";

/**
 * Tamper-evident, append-only audit log (DECISIONS-V2 §3.3, MCA Rule 11(g)):
 * 8-year retention, no disable switch — not even for super-admin. Each entry's
 * hash chains off the previous entry's hash, PER TENANT, so any insertion,
 * deletion or edit of history breaks the chain and a verify job detects it.
 *
 * This module is the pure hashing core (deterministic, dependency-free). The
 * physical `audit_log` table + the "no UPDATE/DELETE" trigger live in @ind-core/db.
 */

export interface AuditEntry {
  tenantId: string;
  /** Monotonic per-tenant sequence — the chain order, independent of wall-clock. */
  seq: number;
  actorId: string;
  action: string; // e.g. general.company.created
  entityType: string; // e.g. company
  entityId: string;
  /** before/after diff or a compact snapshot; already PII-masked by the caller. */
  data: unknown;
  at: string; // ISO-8601
}

/** Deterministic JSON: object keys sorted recursively so the hash is stable. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

/** The genesis link for a tenant's chain (seq 0 has no predecessor). */
export const GENESIS_HASH = "0".repeat(64);

/**
 * entryHash = sha256( prevHash || canonical(entry) ). The prevHash binding is
 * what makes the log append-only-in-effect: you cannot rewrite row N without
 * recomputing every row after it, and the verify job re-walks the whole chain.
 */
export function computeEntryHash(prevHash: string, entry: AuditEntry): string {
  return createHash("sha256")
    .update(prevHash)
    .update("\n")
    .update(canonicalize(entry))
    .digest("hex");
}

/** Re-walk a tenant's chain in seq order; returns the first break, or null if intact. */
export function verifyChain(
  rows: Array<{ entry: AuditEntry; prevHash: string; hash: string }>,
): { ok: true } | { ok: false; brokenAtSeq: number } {
  let expectedPrev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) return { ok: false, brokenAtSeq: row.entry.seq };
    if (computeEntryHash(row.prevHash, row.entry) !== row.hash) {
      return { ok: false, brokenAtSeq: row.entry.seq };
    }
    expectedPrev = row.hash;
  }
  return { ok: true };
}
