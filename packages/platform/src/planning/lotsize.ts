/**
 * LOT SIZING (PLANNING §11.4).
 *
 * Net requirement says how short we are. The lot rule says how much to actually order,
 * and it exists because the shortfall and the orderable quantity are different numbers in
 * every real supply chain: a foundry will not pour 22 castings, it pours 50.
 *
 * Every rule here rounds UP, never down. A lot rule that can return less than the net
 * requirement has converted a sizing policy into a shortage, silently, and the shortage
 * surfaces weeks later on the shop floor instead of here.
 */

export type LotRule = "L4L" | "FOQ" | "MOQ" | "MULT" | "EOQ" | "POQ";

export interface LotPolicy {
  rule: LotRule;
  /** FOQ: the fixed quantity. MOQ: the minimum. MULT: the multiple. POQ: periods to cover. */
  lotSize?: number | null;
  /** EOQ inputs. Annual demand D, order cost S (₹), holding cost H (₹/unit/year). */
  annualDemand?: number | null;
  orderCost?: number | null;
  holdingCost?: number | null;
  /** Rounding precision of the item's unit of measure — 0 for `nos`, 3 for metres. */
  uomPrecision?: number;
  /** Applied after the rule, if the supplier also enforces a floor. */
  minOrderQty?: number | null;
}

export interface LotResult {
  qty: number;
  rule: LotRule;
  /** Plain language, because a planner asked to trust 50 when they needed 22 deserves the reason. */
  reason: string;
  /** Quantity ordered beyond the net requirement — it becomes next period's opening stock. */
  overage: number;
}

function roundUpTo(value: number, precision: number): number {
  const f = 10 ** precision;
  const r = Math.ceil(value * f - 1e-9) / f;
  return r === 0 ? 0 : r; // never hand back -0
}

/** Economic order quantity: sqrt(2DS/H). Returns null when an input is missing or non-positive. */
export function economicOrderQty(annualDemand: number, orderCost: number, holdingCost: number): number | null {
  if (!(annualDemand > 0) || !(orderCost > 0) || !(holdingCost > 0)) return null;
  return Math.sqrt((2 * annualDemand * orderCost) / holdingCost);
}

/**
 * Size one planned order.
 *
 * `netReq` is this bucket's shortfall. `futureNetReqs` is the run of net requirements in
 * the buckets that follow, which only POQ looks at — it is what "cover the next k periods"
 * needs, and passing it here is cheaper than a second pass over the horizon.
 */
export function applyLotRule(netReq: number, policy: LotPolicy, futureNetReqs: readonly number[] = []): LotResult {
  const precision = policy.uomPrecision ?? 0;
  const need = roundUpTo(netReq, precision);
  if (need <= 0) return { qty: 0, rule: policy.rule, reason: "No net requirement in this bucket.", overage: 0 };

  let qty = need;
  let reason = "";

  switch (policy.rule) {
    case "L4L":
      qty = need;
      reason = `Lot-for-lot: order exactly the ${fmt(need)} short.`;
      break;

    case "FOQ": {
      const fixed = policy.lotSize ?? 0;
      if (!(fixed > 0)) {
        qty = need;
        reason = `Fixed order quantity has no lot size configured — ordered the ${fmt(need)} short instead.`;
        break;
      }
      // A fixed quantity smaller than the shortfall must be ordered more than once, not
      // rounded down into a shortage.
      const batches = Math.ceil(need / fixed - 1e-9);
      qty = roundUpTo(fixed * batches, precision);
      reason =
        batches === 1
          ? `Fixed order quantity ${fmt(fixed)}.`
          : `Fixed order quantity ${fmt(fixed)} × ${batches} batches to cover ${fmt(need)}.`;
      break;
    }

    case "MOQ": {
      const min = policy.lotSize ?? 0;
      qty = Math.max(need, min);
      qty = roundUpTo(qty, precision);
      reason =
        qty > need
          ? `Supplier minimum order quantity ${fmt(min)} — ${fmt(need)} was needed.`
          : `Above the ${fmt(min)} minimum, so ordered the ${fmt(need)} short.`;
      break;
    }

    case "MULT": {
      const mult = policy.lotSize ?? 0;
      if (!(mult > 0)) {
        qty = need;
        reason = `Order multiple has no lot size configured — ordered the ${fmt(need)} short instead.`;
        break;
      }
      qty = roundUpTo(Math.ceil(need / mult - 1e-9) * mult, precision);
      reason = `Rounded up to a multiple of ${fmt(mult)} — ${fmt(need)} was needed.`;
      break;
    }

    case "EOQ": {
      const eoq = economicOrderQty(policy.annualDemand ?? 0, policy.orderCost ?? 0, policy.holdingCost ?? 0);
      if (eoq === null) {
        // Falling back silently to L4L would make an EOQ item behave as lot-for-lot with
        // nothing on the order to say so. Say so.
        qty = need;
        reason = `EOQ needs annual demand, order cost and holding cost — one is missing, so ordered the ${fmt(need)} short.`;
        break;
      }
      qty = roundUpTo(Math.max(need, eoq), precision);
      reason =
        qty > need
          ? `Economic order quantity ${fmt(roundUpTo(eoq, precision))} (√(2·${fmt(policy.annualDemand ?? 0)}·${fmt(policy.orderCost ?? 0)}/${fmt(policy.holdingCost ?? 0)})) — ${fmt(need)} was needed.`
          : `Net requirement ${fmt(need)} already exceeds the economic order quantity ${fmt(roundUpTo(eoq, precision))}.`;
      break;
    }

    case "POQ": {
      const periods = Math.max(1, Math.floor(policy.lotSize ?? 1));
      const covered = futureNetReqs.slice(0, periods - 1).reduce((a, b) => a + Math.max(0, b), 0);
      qty = roundUpTo(need + covered, precision);
      reason =
        periods === 1
          ? `Period order quantity covering this bucket only: ${fmt(need)}.`
          : `Period order quantity covering ${periods} buckets: ${fmt(need)} now plus ${fmt(covered)} ahead.`;
      break;
    }
  }

  const floor = policy.minOrderQty ?? 0;
  if (floor > 0 && qty < floor) {
    qty = roundUpTo(floor, precision);
    reason = `${reason} Raised to the ${fmt(floor)} supplier minimum.`;
  }

  return { qty, rule: policy.rule, reason, overage: Math.round((qty - need) * 1000) / 1000 };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
