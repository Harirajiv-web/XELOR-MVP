/**
 * MASTER PRODUCTION SCHEDULE (PLANNING §11.3, §4.B).
 *
 * The MPS is the one number a factory argues about: what will actually be built, week by
 * week. MRP explodes it downwards without question, so anything wrong here is wrong
 * everywhere below it.
 *
 * Two things it computes that are routinely confused with each other:
 *
 *  - **Projected on-hand** answers "will we run out?" It is a stock projection.
 *  - **ATP (available to promise)** answers "can I sell one more?" It is a commitment
 *    figure, and it is deliberately NOT the projected on-hand: stock that is already
 *    promised to a customer is on hand and unavailable at the same time. Quoting
 *    projected on-hand to a customer is how a plant promises the same pump twice.
 *
 * ATP here is DISCRETE: it is computed only in buckets that receive supply, and it counts
 * customer orders forward until the next receipt arrives — because that is the window in
 * which a new order would actually have to be satisfied.
 */

export type TimeFence = "frozen" | "firm" | "free";

export interface MpsRowInput {
  bucket: string;
  /** What the MPS proposes to receive in this bucket. */
  mpsReceiptQty: number;
  forecastQty: number;
  orderQty: number;
}

export interface MpsRow extends MpsRowInput {
  demandQty: number;
  projectedOnHand: number;
  /** Null in buckets that receive nothing — a discrete ATP inherits the last computed figure. */
  atp: number | null;
  /** The figure to show a salesperson: the last computed ATP, carried forward. */
  effectiveAtp: number;
  fence: TimeFence;
  warnings: string[];
}

export interface MpsInput {
  rows: readonly MpsRowInput[];
  onHand: number;
  /** Stock already promised to customers — subtracted from the first bucket's ATP only. */
  allocatedQty?: number;
  /** Buckets inside the demand time fence: frozen, changeable only by an override. */
  demandTimeFenceBuckets?: number;
  /** Buckets inside the planning time fence: firm, changed only by a planner. */
  planningTimeFenceBuckets?: number;
}

export function buildMps(input: MpsInput): MpsRow[] {
  const dtf = input.demandTimeFenceBuckets ?? 0;
  const ptf = input.planningTimeFenceBuckets ?? 0;
  const allocated = Math.max(0, input.allocatedQty ?? 0);

  let onHand = input.onHand;
  const startWarnings: string[] = [];
  if (onHand < 0) {
    // A negative on-hand is a data error, not a plan. Floor it and say so rather than
    // planning a recovery for stock the system only thinks it is missing (V-01).
    startWarnings.push(`On-hand was ${onHand} — floored to 0. Stock cannot be negative; reconcile the ledger.`);
    onHand = 0;
  }

  const rows: MpsRow[] = [];
  let lastAtp = 0;

  input.rows.forEach((r, i) => {
    const warnings = i === 0 ? [...startWarnings] : [];
    const demandQty = Math.max(Math.max(0, r.forecastQty), Math.max(0, r.orderQty));

    const projectedOnHand = round3(onHand + r.mpsReceiptQty - demandQty);
    if (projectedOnHand < 0) {
      warnings.push(`Projected on-hand falls to ${fmt(projectedOnHand)} — this bucket is short.`);
    }

    // Discrete ATP: computed where supply lands (and always in bucket 1, which can promise
    // out of existing stock), counting customer orders up to the next receipt.
    let atp: number | null = null;
    if (i === 0 || r.mpsReceiptQty > 0) {
      let ordersUntilNextReceipt = Math.max(0, r.orderQty);
      for (let j = i + 1; j < input.rows.length; j += 1) {
        if (input.rows[j]!.mpsReceiptQty > 0) break;
        ordersUntilNextReceipt += Math.max(0, input.rows[j]!.orderQty);
      }
      const uncommitted = i === 0 ? Math.max(0, input.onHand) - allocated : 0;
      atp = round3(r.mpsReceiptQty + uncommitted - ordersUntilNextReceipt);
      if (atp < 0) {
        warnings.push(`ATP is ${fmt(atp)} — more is committed than will be available. Something already promised cannot be met.`);
      }
      lastAtp = atp;
    }

    rows.push({
      ...r,
      demandQty,
      projectedOnHand,
      atp,
      effectiveAtp: lastAtp,
      fence: i < dtf ? "frozen" : i < ptf ? "firm" : "free",
      warnings,
    });

    onHand = projectedOnHand;
  });

  return rows;
}

/**
 * The earliest bucket that can promise `qty`, and how much is free before then.
 *
 * This is the question a salesperson actually asks — "when can I get twelve more?" — and
 * the honest answer names a bucket rather than saying no.
 */
export function earliestPromise(rows: readonly MpsRow[], qty: number): {
  bucket: string | null;
  cumulativeAtp: number;
  message: string;
} {
  let cumulative = 0;
  for (const r of rows) {
    if (r.atp === null) continue;
    cumulative = round3(cumulative + Math.max(0, r.atp));
    if (cumulative >= qty) {
      return {
        bucket: r.bucket,
        cumulativeAtp: cumulative,
        message: `${fmt(qty)} can be promised by ${r.bucket} (${fmt(cumulative)} available to promise by then).`,
      };
    }
  }
  return {
    bucket: null,
    cumulativeAtp: cumulative,
    message:
      cumulative > 0
        ? `Only ${fmt(cumulative)} is available to promise inside the horizon — ${fmt(qty)} needs the schedule extended or increased.`
        : "Nothing is available to promise inside the horizon; every bucket is fully committed.",
  };
}

/**
 * Whether a proposed change to an MPS row is allowed by its time fence.
 *
 * Fences are not advice. Inside the demand fence the plant has already cut metal and
 * booked material against the number; changing it is a decision with a cost, so it needs
 * a named override rather than a keystroke.
 */
export function checkFence(
  row: Pick<MpsRow, "bucket" | "fence" | "mpsReceiptQty">,
  newQty: number,
  opts: { hasOverrideRole?: boolean; overrideReason?: string } = {},
): { allowed: boolean; requiresOverride: boolean; reason: string } {
  if (newQty === row.mpsReceiptQty) {
    return { allowed: true, requiresOverride: false, reason: "No change." };
  }
  if (row.fence === "free") {
    return { allowed: true, requiresOverride: false, reason: `${row.bucket} is outside the planning fence — change it freely.` };
  }
  if (row.fence === "firm") {
    return {
      allowed: true,
      requiresOverride: false,
      reason: `${row.bucket} is inside the planning fence — the planner owns this change and it will re-drive MRP.`,
    };
  }
  const reason = opts.overrideReason?.trim();
  if (opts.hasOverrideRole && reason) {
    return {
      allowed: true,
      requiresOverride: true,
      reason: `${row.bucket} is frozen; changed under a recorded override: ${reason}`,
    };
  }
  return {
    allowed: false,
    requiresOverride: true,
    reason: opts.hasOverrideRole
      ? `${row.bucket} is frozen — material is already committed against it. Supply a reason for the override.`
      : `${row.bucket} is frozen — material is already committed against it. Only the plant manager can change it, with a reason.`,
  };
}

function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round3(n));
}
