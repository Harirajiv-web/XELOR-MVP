/**
 * The payslip explainer's DETERMINISTIC core (HR-65, AI #7 `hrm.payslip_explainer`).
 *
 * This feature is registered Tier-3 — *advisory-only-forever*: never tool access, never a
 * write path, one-way setting. Its registered deterministic baseline is
 * `payslip_trace_template` and its degraded mode is `template_output`, both of which are
 * implemented here.
 *
 * The design rule is the one measured earlier in this codebase and recorded in
 * `dedup-verdict.ts`: **the verdict lives in code, only the wording lives in the model.**
 * A local 3B model, given room to conclude, invents figures and copies examples. So every
 * number an employee reads is computed here, the whole explanation can be rendered here
 * without any model at all, and a model's contribution is accepted only if it survives
 * `checkPayslipGrounding` — which rejects any digit that is not already on the payslip.
 *
 * There is a second reason for the strictness, specific to this feature. A payslip
 * explanation that says "you appear to have been underpaid" is not a bad sentence; it is a
 * legal event. The guard therefore refuses conclusions, advice and error claims outright.
 */

/** The facts an explanation may refer to. Nothing outside this object may be mentioned. */
export interface PayslipTrace {
  periodLabel: string; // "June 2026"
  employeeName: string;
  paidDays: number;
  lopDays: number;
  otHours: number;
  otPay: number;
  gross: number;
  includedWages: number;
  excludedWages: number;
  excludedPct: number;
  thresholdAt50: number;
  addback: number;
  deemedWages: number;
  pfWageBase: number;
  pfCeiling: number;
  statutory: Array<{ statute: "epf" | "esi" | "pt" | "tds"; amount: number; wageBase: number }>;
  totalDeduction: number;
  netPay: number;
}

const inr = (n: number): string =>
  // Indian digit grouping: 1,14,875 — not 114,875. Getting this wrong is the tell that a
  // product was not built for this market.
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100);

const STATUTE_LABEL: Record<string, string> = {
  epf: "provident fund",
  esi: "ESI",
  pt: "professional tax",
  tds: "income tax",
};

/**
 * The template baseline. This is a complete, correct explanation on its own — the AI
 * feature has to BEAT this before it is allowed to ship, and falls back to it whenever the
 * model is off, refused, over budget, or ungrounded.
 */
export function renderPayslipExplanation(t: PayslipTrace): string {
  const parts: string[] = [];

  const otClause = t.otPay > 0 ? `, including Rs ${inr(t.otPay)} of overtime for ${t.otHours} hours` : "";
  const lopClause = t.lopDays > 0 ? ` after ${t.lopDays} day(s) of loss of pay` : "";
  parts.push(
    `For ${t.periodLabel} you were paid for ${t.paidDays} days${lopClause}, and your gross came to Rs ${inr(t.gross)}${otClause}.`,
  );

  if (t.addback > 0) {
    parts.push(
      `Allowances that sit outside "wages" came to Rs ${inr(t.excludedWages)}, which is ${t.excludedPct}% of your total pay. ` +
        `Because that is more than half of Rs ${inr(t.gross)}, Rs ${inr(t.addback)} is counted back into wages, ` +
        `so provident fund is worked out on Rs ${inr(t.deemedWages)} rather than on your basic of Rs ${inr(t.includedWages)}.`,
    );
  } else {
    parts.push(
      `Allowances that sit outside "wages" came to Rs ${inr(t.excludedWages)}, which is ${t.excludedPct}% of your total pay. ` +
        `That is not above half of Rs ${inr(t.gross)}, so nothing is added back and provident fund is worked out on Rs ${inr(t.deemedWages)}.`,
    );
  }

  if (t.pfWageBase < t.deemedWages) {
    parts.push(`Provident fund stops at the ceiling of Rs ${inr(t.pfCeiling)}, so Rs ${inr(t.pfWageBase)} is used.`);
  }

  const deductions = t.statutory
    .filter((s) => s.amount > 0)
    .map((s) => `${STATUTE_LABEL[s.statute]} Rs ${inr(s.amount)}`);
  if (deductions.length > 0) {
    parts.push(
      `Deductions were ${deductions.join(", ")}, Rs ${inr(t.totalDeduction)} in all, leaving Rs ${inr(t.netPay)} net.`,
    );
  } else {
    parts.push(`Nothing was deducted, so the full Rs ${inr(t.netPay)} is yours.`);
  }

  return parts.join(" ");
}

/**
 * Every figure the explanation is permitted to mention, rendered in each form a model might
 * write it: bare, grouped Indian-style, and with or without decimals.
 */
export function allowedPayslipNumbers(t: PayslipTrace): string {
  const values = [
    t.paidDays,
    t.lopDays,
    t.otHours,
    t.otPay,
    t.gross,
    t.includedWages,
    t.excludedWages,
    t.excludedPct,
    t.thresholdAt50,
    t.addback,
    t.deemedWages,
    t.pfWageBase,
    t.pfCeiling,
    t.totalDeduction,
    t.netPay,
    ...t.statutory.flatMap((s) => [s.amount, s.wageBase]),
    50, // the statutory threshold percentage, which the sentence may name
  ];
  const forms = new Set<string>();
  for (const v of values) {
    const r = Math.round(v * 100) / 100;
    forms.add(String(r));
    forms.add(r.toFixed(2));
    forms.add(String(Math.round(r)));
    forms.add(inr(r));
    forms.add(inr(r).replace(/,/g, ""));
  }
  // The period label carries a year the sentence is allowed to repeat.
  forms.add(t.periodLabel);
  return [...forms].join(" ");
}

export interface PayslipGroundingResult {
  ok: boolean;
  reason?: string;
}

/** Words a Tier-3, advisory-only explanation must never use. */
const BANNED_ADVICE =
  /\b(you should|you must|we recommend|i recommend|recommend that|please contact|consider (?:filing|raising|contacting)|advise|advice)\b/i;
/** Claims about correctness are a legal event, not a sentence. */
const BANNED_JUDGEMENT =
  /\b(underpaid|overpaid|incorrect|wrong|mistake|error|discrepanc\w*|illegal|unlawful|violat\w*|owed to you|entitled to a refund)\b/i;
/** Internal vocabulary that must never leak into an employee-facing sentence. */
const BANNED_JARGON = /\b(verdict|json|payload|findings|prompt|token|schema|deemed_wages|wage_class)\b/i;

/**
 * Accept a model's sentence only if every number in it is already on the payslip, and it
 * makes no judgement and gives no advice.
 *
 * Each rule here exists because a small model actually did the thing: invented a
 * two-digit figure, reinterpreted a percentage, truncated a quoted value mid-way, and
 * volunteered that the employee should raise a query with HR.
 */
export function checkPayslipGrounding(text: string, trace: PayslipTrace): PayslipGroundingResult {
  const t = text.trim();
  if (t.length === 0) return { ok: false, reason: "empty" };
  if (t.length > 900) return { ok: false, reason: "too_long" };

  if (BANNED_ADVICE.test(t)) return { ok: false, reason: "gave_advice" };
  if (BANNED_JUDGEMENT.test(t)) return { ok: false, reason: "judged_correctness" };
  if (BANNED_JARGON.test(t)) return { ok: false, reason: "internal_jargon" };

  // A dangling quote means the sentence was truncated mid-value.
  if ((t.match(/"/g)?.length ?? 0) % 2 !== 0) return { ok: false, reason: "unbalanced_quotes" };

  const allowed = allowedPayslipNumbers(trace);
  const allowedSet = new Set(allowed.split(/\s+/));

  for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0];
    const bare = raw.replace(/,/g, "");
    if (allowedSet.has(raw) || allowedSet.has(bare)) continue;
    // Also accept a trailing-zero variant (1500.00 vs 1500).
    const asNum = Number(bare);
    if (Number.isFinite(asNum) && (allowedSet.has(String(asNum)) || allowedSet.has(asNum.toFixed(2)))) continue;
    return { ok: false, reason: `ungrounded_number:${raw}` };
  }

  return { ok: true };
}
