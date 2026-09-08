/**
 * EXPENSE-CLAIM POLICY AND PER-DIEM (EXPENDITURE §4.C, V-CLM-02…05, V-ADV-01…03).
 *
 * Every rule here is a **flag**, not a refusal, with exactly one exception — an overdue
 * advance blocks a new one. That asymmetry is the module's stance on people: a claim with
 * a missing receipt or a stale date is a conversation for the approver, who can see
 * context the software cannot. Cash already handed out and not accounted for is different,
 * because it is the company's money sitting somewhere unexplained.
 *
 * Per-diem is resolved **as of the expense date**, never as of today. A rate revised in
 * October must not restate a July trip, and an employee promoted in September must be paid
 * the grade they held when they travelled.
 */

export type CityTier = "A" | "B" | "C";
export type FlagSeverity = "info" | "warn" | "block";

export interface PolicyFlag {
  code: string;
  severity: FlagSeverity;
  message: string;
  lineNo?: number;
}

/* --------------------------------- per diem -------------------------------- */

export interface PerDiemRate {
  gradeCode: string;
  cityTier: CityTier;
  tripType: "domestic" | "international";
  dailyRate: number;
  lodgingRate?: number | null;
  mealsRate?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export function resolvePerDiem(
  rates: readonly PerDiemRate[],
  key: { gradeCode: string; cityTier: CityTier; tripType?: "domestic" | "international" },
  onDate: string,
): PerDiemRate | null {
  const trip = key.tripType ?? "domestic";
  const rows = rates.filter(
    (r) =>
      r.gradeCode === key.gradeCode &&
      r.cityTier === key.cityTier &&
      r.tripType === trip &&
      r.effectiveFrom <= onDate &&
      (r.effectiveTo == null || r.effectiveTo >= onDate),
  );
  return [...rows].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

export interface PerDiemEntitlement {
  days: number;
  dailyRate: number;
  entitlement: number;
  rateRef: string;
}

/**
 * Days are counted **inclusively**: leaving Monday and returning Wednesday is three days,
 * not two. The employee ate on all three of them, and an off-by-one here is the complaint
 * every travel policy in the country generates.
 */
export function perDiemEntitlement(
  rates: readonly PerDiemRate[],
  key: { gradeCode: string; cityTier: CityTier; tripType?: "domestic" | "international" },
  fromDate: string,
  toDate: string,
): PerDiemEntitlement | null {
  const rate = resolvePerDiem(rates, key, fromDate);
  if (!rate) return null;
  const days = Math.max(1, Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000) + 1);
  return {
    days,
    dailyRate: rate.dailyRate,
    entitlement: Math.round(days * rate.dailyRate * 100) / 100,
    rateRef: `${rate.gradeCode}/${rate.cityTier}/${rate.tripType}@${rate.effectiveFrom}`,
  };
}

/* ------------------------------- claim policy ------------------------------ */

export interface ClaimLineForPolicy {
  lineNo: number;
  expenseHeadCode: string;
  expenseDate: string;
  amount: number;
  hasReceipt: boolean;
  /** The head's threshold above which a receipt is mandatory. */
  receiptThreshold: number;
  reimbursableType: "bill_backed" | "allowance";
  perDiemCeiling?: number | null;
}

export interface ClaimPolicyInput {
  claimDate: string;
  submittedOn: string;
  lines: readonly ClaimLineForPolicy[];
  /** Holidays and the tenant's weekend, so "weekend expense" is configuration. */
  nonWorkingDates?: readonly string[];
  weekendWeekdays?: readonly number[];
  staleClaimDays?: number;
}

const STALE_DAYS = 60;

export function evaluateClaimPolicy(input: ClaimPolicyInput): PolicyFlag[] {
  const flags: PolicyFlag[] = [];
  const staleAfter = input.staleClaimDays ?? STALE_DAYS;
  const weekend = input.weekendWeekdays ?? [0]; // Sunday only — a six-day factory week

  for (const l of input.lines) {
    // V-CLM-02 — a receipt above the head's threshold.
    if (!l.hasReceipt && l.reimbursableType === "bill_backed" && l.amount > l.receiptThreshold) {
      flags.push({
        code: "MISSING_RECEIPT",
        severity: "warn",
        lineNo: l.lineNo,
        message: `₹${fmt(l.amount)} on ${l.expenseHeadCode} is above the ₹${fmt(l.receiptThreshold)} receipt threshold and has no receipt attached.`,
      });
    }

    // V-CLM-03 — per-diem above the ceiling is potentially a taxable perquisite, which is
    // a payroll consequence rather than a refusal.
    if (l.reimbursableType === "allowance" && l.perDiemCeiling != null && l.amount > l.perDiemCeiling) {
      flags.push({
        code: "PER_DIEM_EXCEEDED",
        severity: "warn",
        lineNo: l.lineNo,
        message: `₹${fmt(l.amount)} exceeds the ₹${fmt(l.perDiemCeiling)} per-diem ceiling for this grade and city tier; the excess may be a taxable perquisite.`,
      });
    }

    // V-CLM-05 — stale, and expenses on a non-working day.
    const ageDays = Math.round((Date.parse(input.submittedOn) - Date.parse(l.expenseDate)) / 86_400_000);
    if (ageDays > staleAfter) {
      flags.push({
        code: "STALE_EXPENSE",
        severity: "warn",
        lineNo: l.lineNo,
        message: `The expense is ${ageDays} days old, past the ${staleAfter}-day claim window.`,
      });
    }
    const dow = new Date(`${l.expenseDate}T00:00:00Z`).getUTCDay();
    if (weekend.includes(dow) || (input.nonWorkingDates ?? []).includes(l.expenseDate)) {
      flags.push({
        code: "NON_WORKING_DAY",
        severity: "info",
        lineNo: l.lineNo,
        message: `The expense falls on a non-working day (${l.expenseDate}). Informational — weekend work is ordinary here.`,
      });
    }
    if (l.expenseDate > input.submittedOn) {
      flags.push({
        code: "FUTURE_DATED",
        severity: "block",
        lineNo: l.lineNo,
        message: `The expense is dated ${l.expenseDate}, which is after the submission date.`,
      });
    }
  }
  return flags;
}

/* ------------------------------ advances ----------------------------------- */

export interface AdvanceState {
  advanceNo: string;
  amount: number;
  paidAmount: number;
  settledAmount: number;
  refundedAmount: number;
  settleBy: string;
  status: "requested" | "approved" | "disbursed" | "partially_settled" | "settled" | "cancelled";
}

export function advanceBalance(a: AdvanceState): number {
  return Math.round((a.paidAmount - a.settledAmount - a.refundedAmount) * 100) / 100;
}

export function isOverdue(a: AdvanceState, asOf: string): boolean {
  return advanceBalance(a) > 0 && a.settleBy < asOf.slice(0, 10);
}

export interface AdvanceGateResult {
  allowed: boolean;
  code?: "ADVANCE_OVERDUE_BLOCK";
  reason: string;
  blockingAdvances: string[];
  overridden: boolean;
}

/**
 * The module's ONE hard block (V-ADV-02).
 *
 * A second advance while the first is unsettled past its date is how an employee ends up
 * owing three months' salary and nobody notices until they resign. It is overridable, and
 * the override is recorded — but the default is no.
 */
export function canRequestAdvance(
  existing: readonly AdvanceState[],
  asOf: string,
  opts: { hasOverridePermission?: boolean; overrideReason?: string } = {},
): AdvanceGateResult {
  const overdue = existing.filter((a) => isOverdue(a, asOf));
  if (overdue.length === 0) {
    return { allowed: true, reason: "No advance is outstanding past its settlement date.", blockingAdvances: [], overridden: false };
  }
  const list = overdue.map((a) => `${a.advanceNo} (₹${fmt(advanceBalance(a))} since ${a.settleBy})`);
  if (opts.hasOverridePermission && opts.overrideReason) {
    return {
      allowed: true,
      reason: `Allowed under a recorded override despite ${overdue.length} overdue advance(s): ${opts.overrideReason}`,
      blockingAdvances: overdue.map((a) => a.advanceNo),
      overridden: true,
    };
  }
  return {
    allowed: false,
    code: "ADVANCE_OVERDUE_BLOCK",
    reason: `Settle the outstanding advance first — ${list.join(", ")}.`,
    blockingAdvances: overdue.map((a) => a.advanceNo),
    overridden: false,
  };
}

export interface SettlementPlan {
  adjustedAgainstClaim: number;
  refundDue: number;
  reimburseDue: number;
  newStatus: AdvanceState["status"];
  explanation: string;
}

/**
 * Settle an advance against a claim (V-CLM-04, V-ADV-03).
 *
 * `net_reimbursable` is never negative. When the advance exceeds the claim the difference
 * is a **refund receivable from the employee**, which is a different thing from a negative
 * payment: it goes on the advance's ageing, not into the payroll run as a deduction that
 * nobody agreed to.
 */
export function planSettlement(advance: AdvanceState, claimTotal: number): SettlementPlan {
  const outstanding = advanceBalance(advance);
  const adjusted = Math.round(Math.min(outstanding, claimTotal) * 100) / 100;
  const refundDue = Math.round(Math.max(0, outstanding - claimTotal) * 100) / 100;
  const reimburseDue = Math.round(Math.max(0, claimTotal - outstanding) * 100) / 100;
  const newStatus: AdvanceState["status"] = refundDue > 0 ? "partially_settled" : "settled";
  return {
    adjustedAgainstClaim: adjusted,
    refundDue,
    reimburseDue,
    newStatus,
    explanation:
      refundDue > 0
        ? `₹${fmt(adjusted)} of the ₹${fmt(outstanding)} advance is adjusted against this claim; ₹${fmt(refundDue)} is refundable by the employee, and the advance stays partially settled until that refund is received.`
        : reimburseDue > 0
          ? `The ₹${fmt(outstanding)} advance is fully adjusted and ₹${fmt(reimburseDue)} is reimbursable to the employee.`
          : `The advance is settled exactly against this claim.`,
  };
}

/** Ageing buckets for the outstanding-advance report. */
export function ageAdvances(
  advances: readonly AdvanceState[],
  asOf: string,
): Record<"current" | "1-30" | "31-60" | "60+", { count: number; amount: number }> {
  const out = {
    current: { count: 0, amount: 0 },
    "1-30": { count: 0, amount: 0 },
    "31-60": { count: 0, amount: 0 },
    "60+": { count: 0, amount: 0 },
  };
  for (const a of advances) {
    const bal = advanceBalance(a);
    if (bal <= 0) continue;
    const overdueDays = Math.round((Date.parse(asOf) - Date.parse(a.settleBy)) / 86_400_000);
    const key = overdueDays <= 0 ? "current" : overdueDays <= 30 ? "1-30" : overdueDays <= 60 ? "31-60" : "60+";
    out[key].count += 1;
    out[key].amount = Math.round((out[key].amount + bal) * 100) / 100;
  }
  return out;
}

const fmt = (n: number): string => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
