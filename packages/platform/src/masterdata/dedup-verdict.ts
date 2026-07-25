/**
 * Duplicate-explanation VERDICT layer (DECISIONS-V2 §4.3 "AI explains, never decides").
 *
 * WHY THIS FILE EXISTS — measured, not assumed. A local 3B model was tested on this exact
 * task four ways (see `_scratch/ai-capability-test*.ps1`, 25 Jul 2026):
 *   - given the raw records, it FABRICATED a GSTIN match between two different GSTINs;
 *   - given a worked example, it COPIED the example's conclusion and recommended merging
 *     two demonstrably different vendors.
 * A small model cannot be trusted to execute the conditional ("IF the id differs THEN say
 * different"). So the conclusion and the recommended action are decided HERE, in pure code,
 * from the same deterministic evidence the detector produced. The model is handed the
 * settled verdict and may only phrase the reason — it cannot flip a conclusion it never owns.
 *
 * Everything here is pure and DB-free, so the live service and the eval gate score the
 * identical logic.
 */
import {
  POSSIBLE_NAME_SIM,
  trigramSimilarity,
  type DuplicateMatch,
  type MasterRecord,
} from "./dedup.js";

/** Per-field state, decided by code. `missing` means we could not compare at all. */
export type FindingVerdict = "match" | "different" | "missing";

export interface DedupFinding {
  field: string; // gstin | cin | legal_name
  label: string; // human label, per-domain (e.g. "item code" for ENGINEERING)
  verdict: FindingVerdict;
  detail: string; // the evidence sentence fragment, containing ONLY real values
}

/**
 * `same`      — a strong identifier matched exactly; near-proof of one business.
 * `different` — a strong identifier is present on both sides and DISAGREES.
 * `unproven`  — no strong identifier available to compare; names alone are not proof.
 */
export type DedupConclusion = "same" | "different" | "unproven";

export interface DedupVerdict {
  conclusion: DedupConclusion;
  /** The first sentence the human reads. Code owns this wording — never the model. */
  headline: string;
  /** The recommended next step. Code owns this too (a wrong "merge" is unrecoverable). */
  action: string;
  confidence: number; // 0..1, from the detector
  candidateName: string;
  existingName: string;
  findings: DedupFinding[];
}

function norm(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t.toUpperCase() : null;
}

/** Compare one identifier field into a settled finding. */
function compareId(
  field: string,
  label: string,
  candidateValue: string | null | undefined,
  existingValue: string | null | undefined,
): DedupFinding {
  const a = norm(candidateValue);
  const b = norm(existingValue);
  if (a && b && a === b) {
    return { field, label, verdict: "match", detail: `both records carry ${label} ${a}` };
  }
  if (a && b) {
    return { field, label, verdict: "different", detail: `the new record has ${label} ${a} but the existing one has ${b}` };
  }
  if (!a && !b) {
    return { field, label, verdict: "missing", detail: `neither record has a ${label} on file` };
  }
  return {
    field,
    label,
    verdict: "missing",
    detail: a
      ? `only the new record has a ${label} (${a}), so they cannot be compared on it`
      : `only the existing record has a ${label} (${b ?? ""}), so they cannot be compared on it`,
  };
}

const LABELS: Record<string, string> = {
  gstin: "GST number",
  cin: "company registration number",
  legal_name: "name",
};

/**
 * Decide the conclusion, the headline and the action from the deterministic evidence.
 * A strong-identifier MATCH beats a DIFFERENT on the other identifier (an exact GSTIN
 * match is definitive; a stale CIN on one row is not evidence of a second business).
 */
export function decideDuplicateVerdict(
  candidate: MasterRecord,
  top: DuplicateMatch,
  fieldLabels: Record<string, string> = {},
): DedupVerdict {
  const label = (f: string): string => fieldLabels[f] ?? LABELS[f] ?? f;

  const gstin = compareId("gstin", label("gstin"), candidate.gstin, top.existingGstin);
  const cin = compareId("cin", label("cin"), candidate.cin, top.existingCin);

  const sim = trigramSimilarity(candidate.legalName, top.existingName);
  const simPct = Math.round(sim * 100);
  const name: DedupFinding = {
    field: "legal_name",
    label: label("legal_name"),
    verdict: sim >= POSSIBLE_NAME_SIM ? "match" : "different",
    detail:
      sim >= POSSIBLE_NAME_SIM
        ? `the ${label("legal_name")}s are ${simPct}% similar ("${candidate.legalName}" vs "${top.existingName}")`
        : `the ${label("legal_name")}s are only ${simPct}% similar ("${candidate.legalName}" vs "${top.existingName}")`,
  };

  const findings = [gstin, cin, name];
  const strongMatch = gstin.verdict === "match" || cin.verdict === "match";
  const strongDiffer = gstin.verdict === "different" || cin.verdict === "different";

  let conclusion: DedupConclusion;
  let headline: string;
  let action: string;
  if (strongMatch) {
    conclusion = "same";
    headline = "These are almost certainly the same business.";
    action = "Merge into the existing record, keeping the older one.";
  } else if (strongDiffer) {
    conclusion = "different";
    headline = "These are probably two different businesses, despite the similar name.";
    action = "Keep both records. Check with whoever raised this before linking them.";
  } else {
    conclusion = "unproven";
    headline = "There is not enough proof to tell whether these are the same business.";
    action = `Ask for the ${label("gstin")} before creating this record.`;
  }

  return {
    conclusion,
    headline,
    action,
    confidence: top.score,
    candidateName: candidate.legalName,
    existingName: top.existingName,
    findings,
  };
}

/**
 * The deterministic reason sentence. Used as the offline (zero-spend) answer AND as the
 * fallback whenever the model is refused, unreachable, or produces ungrounded text — so
 * the feature ALWAYS has a correct explanation without a model (registry degradedMode
 * `deterministic_substitute`).
 */
export function renderDeterministicReason(v: DedupVerdict): string {
  const say = v.findings
    .filter((f) => (v.conclusion === "unproven" ? true : f.verdict !== "missing"))
    .map((f) => f.detail);
  const body = say.length ? say.join("; ") : "there is no evidence either way";
  return `${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
}

/** The full human-facing note, assembled from parts code owns plus one reason sentence. */
export function renderDuplicateNote(v: DedupVerdict, reason: string): string {
  return `${v.headline} ${reason.trim()}\nSuggested action: ${v.action}`;
}

/* ------------------------------------------------------------------------- *
 * GROUNDING GUARD — the safety net for whatever the model writes.
 * ------------------------------------------------------------------------- */

/** Every value the model is allowed to mention, drawn from the settled evidence. */
export function allowedEvidenceText(v: DedupVerdict): string {
  return [
    v.candidateName,
    v.existingName,
    ...v.findings.map((f) => f.detail),
    String(Math.round(v.confidence * 100)),
    v.confidence.toFixed(2),
  ]
    .join(" | ")
    .toUpperCase();
}

/**
 * Internal vocabulary that must never leak. NOTE: "match"/"different"/"missing" are banned
 * only in their SHOUTED token form — as ordinary words they are exactly how a human would
 * describe this evidence ("the GST numbers are different"), and banning them outright
 * forced needless degradation in the first live run.
 */
const BANNED_TOKENS = /\b(MATCH|DIFFERENT|MISSING)\b/;
const BANNED_WORDS = /\b(verdict|json|conclusion|payload|findings)\b/i;

/**
 * Phrases that would contradict a conclusion the model does not own. Tightened after the
 * first live run, where the model wrote "likely refer to the same entity" under an
 * explicitly UNPROVEN verdict — a hedge word plus "same" is still an assertion.
 */
const CONTRADICTS: Record<DedupConclusion, RegExp | null> = {
  same: /\b(two different|not the same|different (businesses|companies|firms|suppliers|entities))\b/i,
  different:
    /\b(the same (business|company|firm|supplier|entity)|are identical|almost certainly the same)\b/i,
  // For "not enough proof", ANY claim of sameness — however hedged — is a contradiction.
  unproven:
    /\b(almost certainly|definitely|certainly|clearly|likely|probably|appear to be|seem to be)\b[^.]{0,40}\b(same|identical)\b|\bthe same (business|company|firm|supplier|entity|record)\b|\bidentical\b|\btwo different (businesses|companies)\b/i,
};

export interface GroundingResult {
  ok: boolean;
  /** why it was rejected — surfaced in the AI log so refusals are explainable. */
  reason?: string;
}

/**
 * Reject model text that invents an identifier/number, leaks internal vocabulary,
 * contradicts the code-owned conclusion, or runs long. Any rejection falls back to the
 * deterministic reason — the user never sees ungrounded text.
 */
export function checkGrounding(text: string, v: DedupVerdict): GroundingResult {
  const t = text.trim();
  if (!t) return { ok: false, reason: "empty" };
  if (t.length > 400) return { ok: false, reason: "too_long" };
  if (BANNED_TOKENS.test(t) || BANNED_WORDS.test(t)) {
    return { ok: false, reason: "leaked_internal_vocabulary" };
  }
  // A dangling quote means the text was cut mid-name — never show a truncated fragment.
  if ((t.match(/"/g)?.length ?? 0) % 2 !== 0) return { ok: false, reason: "unbalanced_quotes" };

  const contra = CONTRADICTS[v.conclusion];
  if (contra && contra.test(t)) return { ok: false, reason: "contradicts_verdict" };

  // Every percentage we supply is a SIMILARITY. A model that re-reads "17% similar" as
  // "differing by only 17%" has inverted the meaning while keeping the digits, so a plain
  // token check would pass it. Require each percentage to still be labelled a similarity.
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    const tail = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 16);
    if (!/similar/i.test(tail)) return { ok: false, reason: `percentage_reinterpreted:${m[1]}%` };
  }

  // Any token carrying a digit (an identifier, a score, a percentage) must appear in the
  // evidence. This is what catches the round-1 failure: a GSTIN the model made up.
  const allowed = allowedEvidenceText(v);
  const tokens = t.toUpperCase().match(/[A-Z0-9][A-Z0-9._%-]{3,}/g) ?? [];
  for (const tok of tokens) {
    if (!/\d/.test(tok)) continue;
    const bare = tok.replace(/[%.]+$/, "");
    if (!allowed.includes(bare)) return { ok: false, reason: `ungrounded_value:${bare}` };
  }

  // EVERY bare number too, however short — a model invented "differ by only 12 characters
  // out of 30", and 2-digit inventions are invisible to the token scan above. Matched with
  // digit boundaries so a number cannot be excused by appearing mid-identifier.
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) {
    const n = m[0];
    const re = new RegExp(`(?<![\\d.])${n.replace(/\./g, "\\.")}(?![\\d.])`);
    if (!re.test(allowed)) return { ok: false, reason: `ungrounded_number:${n}` };
  }
  return { ok: true };
}
