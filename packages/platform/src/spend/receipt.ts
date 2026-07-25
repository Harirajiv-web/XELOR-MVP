import { GSTIN_RE } from "./itc.js";

/**
 * RECEIPT EXTRACTION — AI #1 `expenditure.receipt_extraction` (EXPENDITURE §11.4, §13.1,
 * DECISIONS-V2 §4.2).
 *
 * Registered **committed**, Tier-2 (draft-record), baseline
 * `azure_doc_intelligence_prebuilt_invoice`, degraded mode `manual_entry`.
 *
 * This is the module's flagship and the one an investor will actually watch: point a phone
 * at a hotel bill, get a claim line. It is also the AI feature with the largest blast
 * radius in the product, because its output is money.
 *
 * The design principle is the one recorded in `ai-verdict-in-code-wording-in-model`,
 * pushed one step further: **the model reads paper and the code checks arithmetic.** A
 * vision model is genuinely good at finding "₹6,322" on a crumpled thermal print and
 * genuinely willing to invent a total that makes the numbers look tidy. So every figure it
 * returns is re-derived here, and any field that fails demotes itself to "needs review"
 * rather than arriving on a claim.
 *
 * Four cross-checks, each catching a failure that has actually happened:
 *
 *   1. **GSTIN shape and state code.** Fifteen characters in a fixed pattern, and the
 *      leading two digits must be the state the supply came from. A model that transcribes
 *      `24AAHFH2811Q1Z3` as `Z4AAHFH2811Q1Z3` produces a plausible string and an
 *      unclaimable credit.
 *   2. **The tax adds up.** CGST + SGST (or IGST) must equal the rate times the taxable
 *      value, to the rupee.
 *   3. **The total adds up.** taxable + tax = total, ±₹1 for the supplier's own rounding.
 *   4. **The lines add up to the total.** The check that catches a hallucinated line.
 *
 * Nothing here ever writes a claim line. A confirmed draft does, through a human, with the
 * per-field confidence and every edit the human made recorded beside it — because the
 * edit rate is the only honest measure of whether this feature is worth its cost.
 */

export interface ReceiptLine {
  description: string;
  amount: number;
  hsnSac?: string | null;
}

/** The shape a model is allowed to return. Anything else is rejected wholesale. */
export interface ReceiptDraft {
  merchant: string;
  invoiceNo?: string | null;
  invoiceDate: string; // YYYY-MM-DD
  supplierGstin?: string | null;
  recipientGstin?: string | null;
  placeOfSupplyStateCode?: string | null;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  currency: string;
  lines: ReceiptLine[];
  suggestedHeadCode?: string | null;
}

export type FieldName =
  | "merchant"
  | "invoiceDate"
  | "supplierGstin"
  | "recipientGstin"
  | "taxableValue"
  | "cgst"
  | "sgst"
  | "igst"
  | "total"
  | "lines"
  | "suggestedHeadCode";

export type Confidence = Partial<Record<FieldName, number>>;

export interface ValidationResult {
  ok: boolean;
  /** Present when the draft is rejected outright — a malformed draft is not repaired. */
  reason?: string;
}

const ALLOWED_KEYS = new Set([
  "merchant",
  "invoiceNo",
  "invoiceDate",
  "supplierGstin",
  "recipientGstin",
  "placeOfSupplyStateCode",
  "taxableValue",
  "cgst",
  "sgst",
  "igst",
  "total",
  "currency",
  "lines",
  "suggestedHeadCode",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STRING = 200;

/**
 * The wholesale rejection (V-EXT-01).
 *
 * Note that an unknown key is fatal rather than ignored. A model that returns an extra
 * field has either misunderstood the schema or is echoing something out of the document,
 * and a document is untrusted input — an image can contain text saying anything at all.
 * Dropping unknown keys quietly would make the day one of them is named `approved` an
 * interesting day.
 */
export function validateReceiptDraft(value: unknown): ValidationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "the extraction result is not an object" };
  }
  const d = value as Record<string, unknown>;

  for (const key of Object.keys(d)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, reason: `unexpected field '${key}' in the extraction result` };
  }

  const str = (k: string, required: boolean): string | null => {
    const v = d[k];
    if (v == null) return required ? `${k} is missing` : null;
    if (typeof v !== "string") return `${k} must be a string`;
    if (v.length > MAX_STRING) return `${k} is longer than ${MAX_STRING} characters`;
    return null;
  };
  const num = (k: string): string | null => {
    const v = d[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return `${k} must be a finite number`;
    if (v < 0) return `${k} cannot be negative`;
    if (v > 100_000_000) return `${k} is implausibly large for a receipt`;
    return null;
  };

  for (const e of [str("merchant", true), str("invoiceNo", false), str("currency", true)]) {
    if (e) return { ok: false, reason: e };
  }
  for (const k of ["taxableValue", "cgst", "sgst", "igst", "total"]) {
    const e = num(k);
    if (e) return { ok: false, reason: e };
  }
  if (typeof d.invoiceDate !== "string" || !ISO_DATE.test(d.invoiceDate)) {
    return { ok: false, reason: "invoiceDate must be a YYYY-MM-DD date" };
  }
  for (const k of ["supplierGstin", "recipientGstin"] as const) {
    const v = d[k];
    if (v == null) continue;
    if (typeof v !== "string" || !GSTIN_RE.test(v)) return { ok: false, reason: `${k} is not a valid GSTIN` };
  }
  if (!Array.isArray(d.lines)) return { ok: false, reason: "lines must be an array" };
  if (d.lines.length > 50) return { ok: false, reason: "a receipt with more than 50 lines is not a receipt" };
  for (const [i, raw] of (d.lines as unknown[]).entries()) {
    if (typeof raw !== "object" || raw === null) return { ok: false, reason: `line ${i} is not an object` };
    const l = raw as Record<string, unknown>;
    for (const key of Object.keys(l)) {
      if (!["description", "amount", "hsnSac"].includes(key)) {
        return { ok: false, reason: `unexpected field '${key}' on line ${i}` };
      }
    }
    if (typeof l.description !== "string" || l.description.length > MAX_STRING) {
      return { ok: false, reason: `line ${i} description is missing or too long` };
    }
    if (typeof l.amount !== "number" || !Number.isFinite(l.amount) || l.amount < 0) {
      return { ok: false, reason: `line ${i} amount must be a non-negative number` };
    }
  }
  if (d.currency !== "INR") {
    return { ok: false, reason: `currency '${String(d.currency)}' — only INR receipts are handled in this release` };
  }
  return { ok: true };
}

/* ------------------------------ cross-checks ------------------------------- */

export interface CrossCheck {
  field: FieldName;
  passed: boolean;
  detail: string;
}

export interface CrossCheckResult {
  checks: CrossCheck[];
  /** Fields the human must look at before anything is persisted. */
  needsReview: FieldName[];
  /** True when the whole draft reconciles and nothing needs a human's eye. */
  clean: boolean;
}

/** ±₹1 absorbs the supplier's own rounding; anything larger is a real disagreement. */
const RUPEE_TOLERANCE = 1;

export function crossCheckReceipt(
  draft: ReceiptDraft,
  opts: { confidence?: Confidence; confidenceFloor?: number; expectedGstRate?: number | null } = {},
): CrossCheckResult {
  const checks: CrossCheck[] = [];
  const floor = opts.confidenceFloor ?? 0.85;
  const r2 = (n: number): number => Math.round(n * 100) / 100;

  // 1. GSTIN shape, and the state code against the place of supply.
  if (draft.supplierGstin) {
    const shaped = GSTIN_RE.test(draft.supplierGstin);
    const state = draft.supplierGstin.slice(0, 2);
    const pos = draft.placeOfSupplyStateCode ?? null;
    const stateOk = pos == null || pos === state;
    checks.push({
      field: "supplierGstin",
      passed: shaped && stateOk,
      detail: !shaped
        ? `'${draft.supplierGstin}' is not a valid GSTIN`
        : stateOk
          ? `shape valid; state ${state} matches the place of supply`
          : `state code ${state} does not match the stated place of supply ${pos}`,
    });
  }

  // 2. The tax adds up against the taxable value.
  const tax = r2(draft.cgst + draft.sgst + draft.igst);
  const bothSplits = draft.igst > 0 && (draft.cgst > 0 || draft.sgst > 0);
  checks.push({
    field: "igst",
    passed: !bothSplits,
    detail: bothSplits
      ? "the receipt shows IGST and CGST/SGST together, which cannot both apply to one supply"
      : "a single tax split, as expected",
  });
  if (draft.cgst > 0 || draft.sgst > 0) {
    const halvesMatch = Math.abs(draft.cgst - draft.sgst) <= 0.5;
    checks.push({
      field: "cgst",
      passed: halvesMatch,
      detail: halvesMatch
        ? `CGST ₹${draft.cgst} and SGST ₹${draft.sgst} agree`
        : `CGST ₹${draft.cgst} and SGST ₹${draft.sgst} differ — an intra-state supply splits evenly`,
    });
  }
  if (opts.expectedGstRate != null && draft.taxableValue > 0) {
    const expected = r2((draft.taxableValue * opts.expectedGstRate) / 100);
    const matches = Math.abs(expected - tax) <= RUPEE_TOLERANCE;
    checks.push({
      field: "taxableValue",
      passed: matches,
      detail: matches
        ? `${opts.expectedGstRate}% of ₹${draft.taxableValue} = ₹${expected}, matching the tax shown`
        : `${opts.expectedGstRate}% of ₹${draft.taxableValue} = ₹${expected}, but the receipt shows ₹${tax}`,
    });
  }

  // 3. taxable + tax = total.
  const computedTotal = r2(draft.taxableValue + tax);
  const totalMatches = Math.abs(computedTotal - draft.total) <= RUPEE_TOLERANCE;
  checks.push({
    field: "total",
    passed: totalMatches,
    detail: totalMatches
      ? `₹${draft.taxableValue} + ₹${tax} = ₹${computedTotal}, matching the printed total`
      : `₹${draft.taxableValue} + ₹${tax} = ₹${computedTotal}, but the receipt prints ₹${draft.total}`,
  });

  // 4. The lines add up. This is the one that catches an invented line.
  if (draft.lines.length > 0) {
    const lineSum = r2(draft.lines.reduce((a, l) => a + l.amount, 0));
    // A line list may be quoted before or after tax; either reconciliation is acceptable.
    const matchesNet = Math.abs(lineSum - draft.taxableValue) <= RUPEE_TOLERANCE;
    const matchesGross = Math.abs(lineSum - draft.total) <= RUPEE_TOLERANCE;
    checks.push({
      field: "lines",
      passed: matchesNet || matchesGross,
      detail:
        matchesNet || matchesGross
          ? `the ${draft.lines.length} lines sum to ₹${lineSum}, reconciling with the ${matchesNet ? "taxable value" : "total"}`
          : `the ${draft.lines.length} lines sum to ₹${lineSum}, which matches neither the taxable value (₹${draft.taxableValue}) nor the total (₹${draft.total})`,
    });
  }

  const needsReview = new Set<FieldName>(checks.filter((c) => !c.passed).map((c) => c.field));

  // A failed total contaminates every figure it was derived from: reviewing the total
  // alone while the taxable value that produced it stays "confident" is not a review.
  if (needsReview.has("total")) {
    needsReview.add("taxableValue");
    if (draft.igst > 0) needsReview.add("igst");
    if (draft.cgst > 0) needsReview.add("cgst");
    if (draft.sgst > 0) needsReview.add("sgst");
  }

  // Low confidence is itself a reason to look, whatever the arithmetic says.
  for (const [field, value] of Object.entries(opts.confidence ?? {}) as Array<[FieldName, number]>) {
    if (value < floor) {
      needsReview.add(field);
      checks.push({ field, passed: false, detail: `confidence ${value.toFixed(2)} is below the ${floor} floor` });
    }
  }

  return { checks, needsReview: [...needsReview], clean: needsReview.size === 0 };
}

/* --------------------- the deterministic categoriser ----------------------- */

export interface HeadKeywordSpec {
  code: string;
  name: string;
  keywords: readonly string[];
}

/**
 * The registered deterministic baseline for auto-categorisation.
 *
 * A merchant name carries most of the signal on an Indian expense receipt — "Indian Oil"
 * is fuel, "Hotel" anything is lodging — and this ships whether or not a model does. It is
 * also the bar the model has to clear in the golden-set gate.
 */
export function keywordCategoriser(
  input: { merchant: string; lines?: readonly ReceiptLine[] },
  heads: readonly HeadKeywordSpec[],
): { headCode: string | null; confidence: number; matched: string[] } {
  const text = `${input.merchant} ${(input.lines ?? []).map((l) => l.description).join(" ")}`.toLowerCase();
  let best: { code: string; hits: string[] } | null = null;
  for (const h of heads) {
    const hits = h.keywords.filter((k) => text.includes(k.toLowerCase()));
    if (hits.length === 0) continue;
    if (!best || hits.length > best.hits.length) best = { code: h.code, hits };
  }
  if (!best) return { headCode: null, confidence: 0.2, matched: [] };
  return {
    headCode: best.code,
    confidence: Math.min(0.9, 0.5 + best.hits.length * 0.15),
    matched: best.hits,
  };
}

/* --------------------------- the fallback merge ---------------------------- */

export interface MergeResult {
  merged: ReceiptDraft;
  /** Fields where the two sources disagreed — shown to the human as a pick-one diff. */
  divergent: FieldName[];
  usedFallback: boolean;
}

/**
 * Merge a model draft with the deterministic fallback pass.
 *
 * The fallback WINS on every numeric field, because the whole reason it was called is that
 * the model's arithmetic did not reconcile. Where the two disagree the human is shown both
 * and picks — a silent merge would hide exactly the disagreement that is worth seeing.
 */
export function mergeWithFallback(model: ReceiptDraft, fallback: Partial<ReceiptDraft>): MergeResult {
  const divergent: FieldName[] = [];
  const merged: ReceiptDraft = { ...model };
  const numeric: FieldName[] = ["taxableValue", "cgst", "sgst", "igst", "total"];

  for (const f of numeric) {
    const fb = fallback[f as keyof ReceiptDraft];
    if (typeof fb !== "number") continue;
    if (Math.abs((model[f as keyof ReceiptDraft] as number) - fb) > RUPEE_TOLERANCE) divergent.push(f);
    (merged as unknown as Record<string, unknown>)[f] = fb;
  }
  for (const f of ["merchant", "invoiceDate", "supplierGstin", "recipientGstin"] as const) {
    const fb = fallback[f];
    if (fb == null) continue;
    if (model[f] !== fb) divergent.push(f as FieldName);
    (merged as unknown as Record<string, unknown>)[f] = fb;
  }
  return { merged, divergent, usedFallback: true };
}

/* ------------------------------ the honest metric -------------------------- */

export interface ExtractionOutcome {
  attachmentId: string;
  confirmed: boolean;
  usedFallback: boolean;
  /** field → { extracted, final } for every value the human changed. */
  edits: Readonly<Record<string, { extracted: unknown; final: unknown }>>;
  fieldsPresented: number;
}

export interface AcceptanceReport {
  drafts: number;
  confirmed: number;
  declined: number;
  acceptanceRatePct: number;
  /** The number that actually says whether this feature is worth its cost. */
  fieldEditRatePct: number;
  fallbackRatePct: number;
  mostEditedFields: Array<{ field: string; edits: number }>;
}

/**
 * The AI-acceptance dashboard.
 *
 * Acceptance rate alone flatters the feature: a user who confirms a draft after correcting
 * four of its seven fields has "accepted" it and has also done the work by hand. The
 * **field edit rate** is the honest measure, and it is reported beside the headline so the
 * headline cannot be quoted on its own.
 */
export function acceptanceReport(outcomes: readonly ExtractionOutcome[]): AcceptanceReport {
  const drafts = outcomes.length;
  const confirmed = outcomes.filter((o) => o.confirmed).length;
  const presented = outcomes.reduce((a, o) => a + o.fieldsPresented, 0);
  const edited = outcomes.reduce((a, o) => a + Object.keys(o.edits).length, 0);
  const byField = new Map<string, number>();
  for (const o of outcomes) {
    for (const f of Object.keys(o.edits)) byField.set(f, (byField.get(f) ?? 0) + 1);
  }
  const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
  return {
    drafts,
    confirmed,
    declined: drafts - confirmed,
    acceptanceRatePct: pct(confirmed, drafts),
    fieldEditRatePct: pct(edited, presented),
    fallbackRatePct: pct(outcomes.filter((o) => o.usedFallback).length, drafts),
    mostEditedFields: [...byField.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([field, edits]) => ({ field, edits })),
  };
}
