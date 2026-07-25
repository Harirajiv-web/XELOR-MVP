/**
 * BUDGETARY CONTROL (EXPENDITURE §11.3, V-BUD-01…04).
 *
 * The single idea this module exists to defend: **availability is not report-time
 * arithmetic.** A budget that is checked by summing posted journals answers the question
 * "what have we spent?" — which is the wrong question, because the money that will sink a
 * cost centre is already committed on approved purchase orders and claims sitting in an
 * approval inbox. By the time it reaches the ledger the decision has been taken.
 *
 * So availability is read from an append-only **reservation ledger** with three buckets:
 *
 *     available = budget(period) − actual − committed − in_approval
 *
 * and the lifecycle of one reservation is: **reserve** into `in_approval` when a document
 * is submitted → **flip** to `committed` when it is finally approved → **flip** to `actual`
 * when Accounts acknowledges the posting → **reverse** (a signed negative row) if it is
 * rejected or cancelled. Nothing is ever updated in place; a correction is another row, so
 * the sequence of decisions survives.
 *
 * Everything here is pure. The `FOR UPDATE` row lock that makes two simultaneous submits
 * serialise is the service's job; this file decides what the numbers mean.
 */

export type ControlAction = "stop" | "warn" | "ignore";
export type BudgetBasis = "monthly" | "cumulative";
export type ConsumptionBucket = "in_approval" | "committed" | "actual";
export type ConsumptionEntryType = "reserve" | "flip" | "reverse";

export interface BudgetLineSpec {
  id: string;
  expenseHeadCode: string;
  annualAmount: number;
  /** 12 numbers, April-first (Indian FY). Must sum to the annual amount. */
  monthlyDistribution: readonly number[];
  controlAction: ControlAction;
  basis: BudgetBasis;
}

export interface ConsumptionEntry {
  bucket: ConsumptionBucket;
  /** Signed: a reversal is negative. Summing the column IS the balance. */
  amount: number;
  period: number; // 1..12, April = 1
  entryType: ConsumptionEntryType;
}

export interface Availability {
  budgeted: number;
  actual: number;
  committed: number;
  inApproval: number;
  available: number;
  /** Share of the period's budget already used or spoken for, 0..1+ (can exceed 1). */
  consumedFraction: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Indian financial year: April is period 1, March is period 12. */
export function periodOf(isoDate: string): number {
  const m = Number(isoDate.slice(5, 7));
  return m >= 4 ? m - 3 : m + 9;
}

export function fiscalYearOf(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

/**
 * The budget for a period.
 *
 * `monthly` reads that month's cell. `cumulative` reads everything from April to this
 * month inclusive — which is what a cost-centre owner who underspent in April actually
 * expects, and the reason `basis` is configuration rather than an assumption.
 */
export function budgetedFor(line: BudgetLineSpec, period: number): number {
  if (period < 1 || period > 12) throw new Error(`period ${period} is outside the financial year`);
  if (line.basis === "cumulative") {
    return round2(line.monthlyDistribution.slice(0, period).reduce((a, b) => a + b, 0));
  }
  return round2(line.monthlyDistribution[period - 1] ?? 0);
}

/**
 * Read availability from the ledger.
 *
 * Under `cumulative` basis the CONSUMPTION is summed over the same window as the budget —
 * comparing a year-to-date allowance against one month's spend would report an
 * availability that does not exist.
 */
export function availability(
  line: BudgetLineSpec,
  entries: readonly ConsumptionEntry[],
  period: number,
): Availability {
  const inWindow =
    line.basis === "cumulative"
      ? entries.filter((e) => e.period >= 1 && e.period <= period)
      : entries.filter((e) => e.period === period);

  const sum = (b: ConsumptionBucket): number =>
    round2(inWindow.filter((e) => e.bucket === b).reduce((a, e) => a + e.amount, 0));

  const budgeted = budgetedFor(line, period);
  const actual = sum("actual");
  const committed = sum("committed");
  const inApproval = sum("in_approval");
  const consumed = round2(actual + committed + inApproval);

  return {
    budgeted,
    actual,
    committed,
    inApproval,
    available: round2(budgeted - consumed),
    // A zero budget with spend against it is fully consumed, not a division by zero. The
    // tile must read "over budget", not "NaN%".
    consumedFraction: budgeted === 0 ? (consumed > 0 ? Infinity : 0) : round2(consumed / budgeted),
  };
}

export interface CheckResult {
  decision: "allow" | "warn" | "block";
  availability: Availability;
  requested: number;
  shortfall: number;
  /** Set when the decision is `block`; the roles that may override it. */
  overrideRoles?: readonly string[];
  reason: string;
  /** True when the caller's override permission converted a block into an allow. */
  overridden: boolean;
}

export const BUDGET_OVERRIDE_ROLES = ["finance_controller", "cfo"] as const;

/**
 * Decide whether a document may proceed.
 *
 * Three control actions, and the distinction between them is the whole point:
 *
 *   - `stop`   — refuse, with the shortfall and the path to an override. The MRO spares
 *                head is `stop` because an unbudgeted spares spike is exactly the thing
 *                the controller wants to hear about *before* it happens.
 *   - `warn`   — allow, and say so loudly. Travel is `warn`: refusing a customer visit to
 *                protect a budget line is usually the more expensive decision.
 *   - `ignore` — allow silently. Rent is `ignore`; the lease was signed last year and the
 *                system refusing to record it changes nothing except the accounts.
 *
 * An override never fails silently: it returns `overridden: true` so the caller must
 * record a reason, and the reason is what makes the control meaningful after the fact.
 */
export function checkBudget(input: {
  line: BudgetLineSpec;
  entries: readonly ConsumptionEntry[];
  period: number;
  requested: number;
  callerCanOverride?: boolean;
}): CheckResult {
  const avail = availability(input.line, input.entries, input.period);
  const shortfall = round2(Math.max(0, input.requested - avail.available));
  const within = input.requested <= avail.available;

  if (within) {
    return {
      decision: "allow",
      availability: avail,
      requested: input.requested,
      shortfall: 0,
      reason: `₹${fmt(input.requested)} against ₹${fmt(avail.available)} available.`,
      overridden: false,
    };
  }

  switch (input.line.controlAction) {
    case "stop":
      if (input.callerCanOverride) {
        return {
          decision: "allow",
          availability: avail,
          requested: input.requested,
          shortfall,
          reason: `Over budget by ₹${fmt(shortfall)}; allowed under a recorded budget override.`,
          overridden: true,
        };
      }
      return {
        decision: "block",
        availability: avail,
        requested: input.requested,
        shortfall,
        overrideRoles: BUDGET_OVERRIDE_ROLES,
        reason: `Over budget by ₹${fmt(shortfall)} on a stop-controlled head (₹${fmt(avail.available)} available).`,
        overridden: false,
      };
    case "warn":
      return {
        decision: "warn",
        availability: avail,
        requested: input.requested,
        shortfall,
        reason: `Over budget by ₹${fmt(shortfall)} — allowed, and the cost-centre owner is notified.`,
        overridden: false,
      };
    case "ignore":
      return {
        decision: "allow",
        availability: avail,
        requested: input.requested,
        shortfall,
        reason: `Over budget by ₹${fmt(shortfall)}; this head is not budget-controlled.`,
        overridden: false,
      };
  }
}

const fmt = (n: number): string => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

/* ------------------------------- revisions --------------------------------- */

export interface RevisionConflict {
  budgetLineId: string;
  expenseHeadCode: string;
  proposedAmount: number;
  alreadyConsumed: number;
  overCommitBy: number;
}

/**
 * A revision that cuts a line below what it has already spent or committed.
 *
 * The naive behaviour — refuse — is wrong, because the money is already gone and the
 * budget must be allowed to record reality. The other naive behaviour — accept silently —
 * is worse, because a line quietly goes negative and nobody is told. So the conflict is
 * RETURNED, the caller must acknowledge it explicitly, existing commitments are never
 * retro-cancelled, and the line shows a negative availability in red (V-BUD-03).
 */
export function revisionConflicts(
  proposed: ReadonlyArray<{ line: BudgetLineSpec; newAnnualAmount: number; newMonthlyDistribution: readonly number[] }>,
  entriesByLine: Readonly<Record<string, readonly ConsumptionEntry[]>>,
  period: number,
): RevisionConflict[] {
  const out: RevisionConflict[] = [];
  for (const p of proposed) {
    const entries = entriesByLine[p.line.id] ?? [];
    // Only ACTUAL and COMMITTED are irreversible. Something still sitting in an approval
    // inbox can be rejected, so it must not block a controller from cutting a budget.
    const irreversible = round2(
      entries.filter((e) => e.bucket !== "in_approval").reduce((a, e) => a + e.amount, 0),
    );
    const revised: BudgetLineSpec = {
      ...p.line,
      annualAmount: p.newAnnualAmount,
      monthlyDistribution: p.newMonthlyDistribution,
    };
    const newBudget =
      p.line.basis === "cumulative" ? budgetedFor(revised, 12) : round2(p.newMonthlyDistribution.reduce((a, b) => a + b, 0));
    if (newBudget < irreversible) {
      out.push({
        budgetLineId: p.line.id,
        expenseHeadCode: p.line.expenseHeadCode,
        proposedAmount: newBudget,
        alreadyConsumed: irreversible,
        overCommitBy: round2(irreversible - newBudget),
      });
    }
  }
  void period;
  return out;
}

/** The monthly distribution must add up to the annual figure. A budget whose cells do not
 *  sum to its own total is a budget nobody can reconcile against later. */
export function validateDistribution(annualAmount: number, monthly: readonly number[]): { ok: boolean; reason?: string } {
  if (monthly.length !== 12) return { ok: false, reason: `expected 12 monthly cells, got ${monthly.length}` };
  if (monthly.some((m) => m < 0)) return { ok: false, reason: "a monthly budget cell cannot be negative" };
  const sum = round2(monthly.reduce((a, b) => a + b, 0));
  if (Math.abs(sum - round2(annualAmount)) > 0.01) {
    return { ok: false, reason: `monthly cells sum to ₹${fmt(sum)} but the annual amount is ₹${fmt(annualAmount)}` };
  }
  return { ok: true };
}

/** An even twelfth, with the rounding remainder pushed into March so the cells still sum
 *  to the annual figure exactly. */
export function evenDistribution(annualAmount: number): number[] {
  const cell = Math.floor((annualAmount / 12) * 100) / 100;
  const cells = Array.from({ length: 12 }, () => cell);
  cells[11] = round2(annualAmount - cell * 11);
  return cells;
}
