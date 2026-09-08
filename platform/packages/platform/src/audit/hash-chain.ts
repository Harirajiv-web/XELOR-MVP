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
  return chainHash(prevHash, canonicalize(entry));
}

/**
 * The generic link: sha256(prevHash \n payload).
 *
 * Exposed on its own because `audit_log` is not the only hash-chained table — `ai_action_log`
 * chains every AI call the same way, and so does anything else that has to be able to prove
 * later that it was not edited. One implementation, or the two chains eventually disagree
 * about what a valid link looks like.
 */
export function chainHash(prevHash: string, payload: string): string {
  return createHash("sha256").update(prevHash).update("\n").update(payload).digest("hex");
}

/** One row of any hash-chained table, reduced to what verification actually needs. */
export interface ChainRow {
  seq: number;
  prevHash: string | null;
  rowHash: string;
  /** The canonical payload the hash was taken over. */
  payload: string;
}

export type ChainBreakKind = "none" | "hash_mismatch" | "link_mismatch" | "sequence_gap";

export interface ChainVerification {
  fromSeq: number;
  toSeq: number;
  rowsChecked: number;
  intact: boolean;
  firstBreakSeq: number | null;
  breakKind: ChainBreakKind;
  message: string;
}

/**
 * Walk a chain and report the FIRST break, in a form an attestation row can store.
 *
 * Three failures are distinguished because they mean different things, and "chain broken"
 * throws away the only diagnostic information the chain carries:
 *   - a **hash mismatch** means a row's content was changed in place;
 *   - a **link mismatch** means a row was replaced or re-signed;
 *   - a **sequence gap** means a row was deleted outright.
 * The first says somebody edited a record, the third says somebody removed one.
 */
export function verifyChainDetailed(rows: readonly ChainRow[]): ChainVerification {
  if (rows.length === 0) {
    return { fromSeq: 0, toSeq: 0, rowsChecked: 0, intact: true, firstBreakSeq: null, breakKind: "none", message: "Nothing to verify — the chain is empty." };
  }
  const ordered = [...rows].sort((a, b) => a.seq - b.seq);
  const from = ordered[0]!.seq;
  const to = ordered[ordered.length - 1]!.seq;
  let prev = ordered[0]!.prevHash ?? GENESIS_HASH;

  for (let i = 0; i < ordered.length; i += 1) {
    const r = ordered[i]!;
    if (i > 0 && r.seq !== ordered[i - 1]!.seq + 1) {
      return {
        fromSeq: from, toSeq: to, rowsChecked: i, intact: false, firstBreakSeq: r.seq, breakKind: "sequence_gap",
        message: `Sequence gap before ${r.seq}: entries ${ordered[i - 1]!.seq + 1}–${r.seq - 1} are missing. A row was deleted, not altered.`,
      };
    }
    if ((r.prevHash ?? GENESIS_HASH) !== prev) {
      return {
        fromSeq: from, toSeq: to, rowsChecked: i, intact: false, firstBreakSeq: r.seq, breakKind: "link_mismatch",
        message: `Link broken at ${r.seq}: it points at a predecessor that is not the row before it. A row was replaced or re-signed.`,
      };
    }
    if (chainHash(prev, r.payload) !== r.rowHash) {
      return {
        fromSeq: from, toSeq: to, rowsChecked: i + 1, intact: false, firstBreakSeq: r.seq, breakKind: "hash_mismatch",
        message: `Content changed at ${r.seq}: the stored hash does not match the row it claims to cover.`,
      };
    }
    prev = r.rowHash;
  }

  return {
    fromSeq: from, toSeq: to, rowsChecked: ordered.length, intact: true, firstBreakSeq: null, breakKind: "none",
    message: `Chain intact across ${ordered.length} entries (${from}–${to}).`,
  };
}

/** Re-walk a tenant's audit chain in seq order; returns the first break, or ok. */
export function verifyChain(
  rows: Array<{ entry: AuditEntry; prevHash: string; hash: string }>,
): { ok: true } | { ok: false; brokenAtSeq: number } {
  const detailed = verifyChainDetailed(
    rows.map((r) => ({ seq: r.entry.seq, prevHash: r.prevHash, rowHash: r.hash, payload: canonicalize(r.entry) })),
  );
  return detailed.intact ? { ok: true } : { ok: false, brokenAtSeq: detailed.firstBreakSeq! };
}
