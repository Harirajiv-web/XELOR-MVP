import { sql } from "drizzle-orm";
import type { Tx } from "@ind-core/db";
import { AppError, currentTenant } from "@ind-core/platform";

/** Take the audit-chain lock FIRST, before document locks/numbering. This avoids
 * lock-order inversion in multi-line awards while keeping every write atomic. */
export async function lockCommercialInTx(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${currentTenant().tenantId}))`,
  );
}
export const todayIso = (): string => new Date().toISOString().slice(0, 10);
export function assertOpenDeadline(
  deadline: string,
  onDate = todayIso(),
): void {
  if (deadline < onDate)
    throw new AppError(
      "BIDDING_CLOSED",
      409,
      `The response deadline was ${deadline}.`,
    );
}
/** One-off charges are spread over the requested quantity, giving comparable unit costs. */
export function landedUnitCost(
  qty: number,
  price: number,
  tooling = 0,
  freight = 0,
  tax = 0,
): string {
  if (
    !Number.isFinite(qty) ||
    qty <= 0 ||
    [price, tooling, freight, tax].some((x) => !Number.isFinite(x) || x < 0)
  ) {
    throw new AppError(
      "INVALID_COMMERCIAL_VALUE",
      422,
      "Quantity must be positive and prices must be finite and non-negative.",
    );
  }
  return (
    Math.round(
      (price + (tooling + freight + tax) / qty + Number.EPSILON) * 100,
    ) / 100
  ).toFixed(2);
}
export function awardBlockers(
  rfq: { qty: string; needDate: string },
  quote: {
    technicalGate: string;
    gateNote: string | null;
    moq: string | null;
    promisedDate: string | null;
    validUntil: string | null;
  },
  expectedDate?: string,
  onDate = todayIso(),
): string[] {
  const reasons: string[] = [];
  if (quote.technicalGate !== "pass" && quote.technicalGate !== "conditional")
    reasons.push("Technical approval is required.");
  if (quote.technicalGate === "conditional" && !quote.gateNote?.trim())
    reasons.push("The conditional approval needs a recorded deviation.");
  if (quote.validUntil && quote.validUntil < onDate)
    reasons.push("The supplier price has expired; request a new revision.");
  if (quote.moq && Number(quote.moq) > Number(rfq.qty))
    reasons.push("The supplier minimum quantity exceeds this request.");
  if (!quote.promisedDate)
    reasons.push("A confirmed supplier delivery date is required.");
  if (quote.promisedDate && quote.promisedDate > rfq.needDate)
    reasons.push("The supplier promise misses the material need date.");
  if ((expectedDate ?? quote.promisedDate ?? onDate) < onDate)
    reasons.push("The delivery date is in the past.");
  if (expectedDate && expectedDate > rfq.needDate)
    reasons.push(
      "The purchase order delivery date misses the material need date.",
    );
  if (expectedDate && quote.promisedDate && expectedDate < quote.promisedDate)
    reasons.push(
      "The purchase order cannot promise earlier than the supplier quote.",
    );
  return reasons;
}
