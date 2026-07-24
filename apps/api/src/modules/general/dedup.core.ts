/**
 * GENERAL's duplicate-detection core (feature `general.master_dedup`, AI #2). This is
 * the DETERMINISTIC brain — pure, DB-free, zero model spend. Per DECISIONS-V2 §4.3
 * ("AI explains; it never decides") the *decision* "is this a duplicate?" is made here
 * by rules; a model may later only EXPLAIN the rows these rules surface.
 *
 * The registry's declared baseline is `pg_trgm_gstin_exact`: exact GSTIN/CIN match plus
 * trigram name similarity. Being pure, the exact same scorer runs in the live service
 * (against DB rows) AND in the eval harness (against golden-set rows) — so what ships is
 * what was graded.
 */

/** A master record we can dedup: company / vendor / customer / item all fit this shape. */
export interface MasterRecord {
  id?: string; // absent for a not-yet-created candidate
  legalName: string;
  gstin?: string | null;
  cin?: string | null;
}

export type DuplicateLevel = "definite" | "strong" | "possible";

export interface DuplicateMatch {
  existingId: string;
  existingName: string;
  score: number; // 0..1
  level: DuplicateLevel;
  matchedFields: string[]; // the evidence: gstin | cin | legal_name
}

// Name-similarity thresholds (tuned so exact-id stays definite, close names are strong).
export const STRONG_NAME_SIM = 0.85;
export const POSSIBLE_NAME_SIM = 0.6;

// Common Indian company legal-form tokens stripped before comparing names, so
// "Trishul Precision Pvt Ltd" and "Trishul Precision Private Limited" match.
const LEGAL_TOKENS = new Set([
  "private",
  "pvt",
  "limited",
  "ltd",
  "llp",
  "inc",
  "incorporated",
  "corporation",
  "corp",
  "company",
  "co",
  "and",
]);

/** Lowercase, drop punctuation + legal-form tokens, collapse whitespace. */
export function normalizeName(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !LEGAL_TOKENS.has(w));
  return words.join(" ");
}

/** pg_trgm-style trigrams: each word padded with 2 leading + 1 trailing space. */
export function trigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (const word of text.split(" ").filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Jaccard similarity over trigram sets — compatible in spirit with pg_trgm.similarity(). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(normalizeName(a));
  const tb = trigrams(normalizeName(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function sameId(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * The DETERMINISTIC baseline: exact GSTIN or CIN match only. This is what the candidate
 * (the full detector) must beat on the golden set.
 */
export function exactIdMatch(candidate: MasterRecord, existing: MasterRecord): boolean {
  return sameId(candidate.gstin, existing.gstin) || sameId(candidate.cin, existing.cin);
}

/** Score one existing record against the candidate; null if not a plausible duplicate. */
export function scoreAgainst(candidate: MasterRecord, existing: MasterRecord): DuplicateMatch | null {
  if (!existing.id) return null;
  if (sameId(candidate.gstin, existing.gstin)) {
    return { existingId: existing.id, existingName: existing.legalName, score: 1, level: "definite", matchedFields: ["gstin"] };
  }
  if (sameId(candidate.cin, existing.cin)) {
    return { existingId: existing.id, existingName: existing.legalName, score: 1, level: "definite", matchedFields: ["cin"] };
  }
  const sim = trigramSimilarity(candidate.legalName, existing.legalName);
  if (sim >= STRONG_NAME_SIM) {
    return { existingId: existing.id, existingName: existing.legalName, score: sim, level: "strong", matchedFields: ["legal_name"] };
  }
  if (sim >= POSSIBLE_NAME_SIM) {
    return { existingId: existing.id, existingName: existing.legalName, score: sim, level: "possible", matchedFields: ["legal_name"] };
  }
  return null;
}

/** All plausible duplicates of `candidate` among `existing`, best match first. */
export function detectDuplicates(candidate: MasterRecord, existing: MasterRecord[]): DuplicateMatch[] {
  return existing
    .map((e) => scoreAgainst(candidate, e))
    .filter((m): m is DuplicateMatch => m !== null)
    .sort((a, b) => b.score - a.score);
}

/** The candidate predictor for the eval gate: does the detector flag ANY duplicate? */
export function hasDuplicate(candidate: MasterRecord, existing: MasterRecord[]): boolean {
  return detectDuplicates(candidate, existing).length > 0;
}
