import { economicOrderQty } from "./lotsize.js";

/**
 * REORDER POLICIES & INVENTORY PLANNING (PLANNING §11.10, §4.I).
 *
 * Not every item deserves MRP. A plant that nets ten thousand fasteners through a
 * level-by-level explosion every night has spent a lot of computation to be told to buy
 * washers. Those items get a reorder point instead: watch the stock, order when it drops.
 *
 * The trap this module exists to prevent is running BOTH on the same item. An item that is
 * MRP-planned *and* carries a reorder point gets ordered twice — once by the plan, once by
 * the trigger — and the second order has no demand behind it. That is the single most
 * common way an ERP quietly builds excess inventory, so it is a hard conflict here rather
 * than a note in a manual.
 *
 * Safety stock uses the statistical formula, not a rule of thumb, because the two sources
 * of uncertainty are different in kind: demand varies week to week, and the SUPPLIER'S LEAD
 * TIME varies too. A plant with a reliable supplier and volatile demand needs a very
 * different buffer from one with steady demand and a foundry that is late half the time,
 * and "two weeks of cover" cannot tell them apart.
 */

export type PlanningMethod = "mrp" | "reorder_point" | "min_max" | "none";
export type AbcClass = "A" | "B" | "C";

/** Z-multipliers for the usual service levels. Interpolation between them is not meaningful. */
export const SERVICE_LEVEL_Z: Readonly<Record<string, number>> = {
  "0.90": 1.28,
  "0.95": 1.645,
  "0.98": 2.05,
  "0.99": 2.33,
};

export function zForServiceLevel(level: number): { z: number; matched: string; note: string } {
  const key = level.toFixed(2);
  const exact = SERVICE_LEVEL_Z[key];
  if (exact !== undefined) return { z: exact, matched: key, note: `Service level ${key} → Z = ${exact}.` };
  // Round DOWN to the nearest defined level rather than interpolating: promising a service
  // level the table does not define is a number nobody can defend in a review.
  const defined = Object.keys(SERVICE_LEVEL_Z)
    .map(Number)
    .sort((a, b) => a - b);
  const below = [...defined].reverse().find((d) => d <= level) ?? defined[0]!;
  const k = below.toFixed(2);
  return {
    z: SERVICE_LEVEL_Z[k]!,
    matched: k,
    note: `Service level ${key} is not a defined step — used the ${k} multiplier (Z = ${SERVICE_LEVEL_Z[k]}) rather than interpolating.`,
  };
}

export interface SafetyStockInput {
  /** Mean demand per period (the same period the lead time is expressed in). */
  meanDemand: number;
  /** Standard deviation of demand per period. */
  demandStdDev: number;
  /** Mean lead time, in periods. */
  meanLeadTime: number;
  /** Standard deviation of the lead time, in periods. */
  leadTimeStdDev: number;
  serviceLevel: number;
  /** Weeks of history behind the demand statistics; below 26 the figure is not trustworthy. */
  historyPeriods?: number;
}

export interface SafetyStockResult {
  safetyStock: number;
  z: number;
  serviceLevelUsed: string;
  demandComponent: number;
  leadTimeComponent: number;
  /** Which source of variability dominates — this is the actionable part. */
  dominantDriver: "demand" | "lead_time" | "balanced";
  confident: boolean;
  explanation: string;
}

/** Safety_Stock = Z × sqrt( LT × σ_demand² + demand² × σ_LT² ) — PLANNING §11.10 verbatim. */
export function safetyStockFor(input: SafetyStockInput): SafetyStockResult {
  const { z, matched, note } = zForServiceLevel(input.serviceLevel);
  const demandComponent = Math.max(0, input.meanLeadTime) * input.demandStdDev ** 2;
  const leadTimeComponent = input.meanDemand ** 2 * input.leadTimeStdDev ** 2;
  const safetyStock = round3(z * Math.sqrt(demandComponent + leadTimeComponent));

  const total = demandComponent + leadTimeComponent;
  const dominantDriver: SafetyStockResult["dominantDriver"] =
    total === 0 ? "balanced" : demandComponent / total > 0.65 ? "demand" : leadTimeComponent / total > 0.65 ? "lead_time" : "balanced";

  const history = input.historyPeriods ?? 0;
  const confident = history >= 26;

  const driverText =
    dominantDriver === "lead_time"
      ? "Most of this buffer exists because the SUPPLIER is unreliable, not because demand is. Chasing lead-time consistency will shrink it faster than a forecast will."
      : dominantDriver === "demand"
        ? "Most of this buffer exists because demand varies, not because the supplier does. A better forecast shrinks it; chasing the supplier will not."
        : "Demand variability and lead-time variability contribute about equally.";

  return {
    safetyStock,
    z,
    serviceLevelUsed: matched,
    demandComponent: round3(demandComponent),
    leadTimeComponent: round3(leadTimeComponent),
    dominantDriver,
    confident,
    explanation: confident
      ? `${note} ${driverText}`
      : `${note} ${driverText} Based on only ${history} period(s) of history — below the 26 needed for the statistics to mean anything, so treat this as indicative.`,
  };
}

export interface ReorderPolicyInput {
  itemId: string;
  itemCode: string;
  method: PlanningMethod;
  /** Average demand per period. */
  meanDemand: number;
  /** Lead time in the same periods. */
  leadTimePeriods: number;
  safetyStock: number;
  /** EOQ inputs; optional. */
  annualDemand?: number;
  orderCost?: number;
  holdingCost?: number;
  /** For min/max. */
  maxLevel?: number;
}

export interface ReorderPolicyResult {
  itemId: string;
  itemCode: string;
  method: PlanningMethod;
  reorderPoint: number;
  demandDuringLeadTime: number;
  safetyStock: number;
  orderQty: number | null;
  maxLevel: number | null;
  explanation: string;
}

/** Reorder point = expected demand across the lead time + safety stock. */
export function reorderPolicy(input: ReorderPolicyInput): ReorderPolicyResult {
  const demandDuringLeadTime = round3(Math.max(0, input.meanDemand) * Math.max(0, input.leadTimePeriods));
  const reorderPoint = round3(demandDuringLeadTime + Math.max(0, input.safetyStock));
  const eoq = economicOrderQty(input.annualDemand ?? 0, input.orderCost ?? 0, input.holdingCost ?? 0);
  const orderQty = eoq === null ? null : round3(eoq);

  const maxLevel = input.method === "min_max" ? (input.maxLevel ?? round3(reorderPoint + (orderQty ?? demandDuringLeadTime))) : null;

  const explanation =
    input.method === "min_max"
      ? `Order up to ${fmt(maxLevel ?? 0)} whenever stock falls to ${fmt(reorderPoint)} — ${fmt(demandDuringLeadTime)} will be consumed while the order is in transit, plus ${fmt(input.safetyStock)} of buffer.`
      : `Raise an order when stock falls to ${fmt(reorderPoint)}: ${fmt(demandDuringLeadTime)} will be consumed over the ${fmt(input.leadTimePeriods)}-period lead time, plus ${fmt(input.safetyStock)} of safety stock.${orderQty !== null ? ` Order ${fmt(orderQty)} at a time (economic order quantity).` : ""}`;

  return {
    itemId: input.itemId,
    itemCode: input.itemCode,
    method: input.method,
    reorderPoint,
    demandDuringLeadTime,
    safetyStock: round3(Math.max(0, input.safetyStock)),
    orderQty,
    maxLevel,
    explanation,
  };
}

export interface PolicyConflict {
  itemId: string;
  itemCode: string;
  severity: "critical" | "high" | "medium";
  message: string;
  suggestion: string;
}

/**
 * The conflict guard.
 *
 * Each rule below is one way a plant ends up ordering material it does not need, or not
 * ordering material it does. None of them are theoretical; all of them look like correct
 * configuration on the screen where they are entered.
 */
export function detectPolicyConflicts(
  items: readonly {
    itemId: string;
    itemCode: string;
    method: PlanningMethod;
    hasReorderPoint: boolean;
    isMrpPlanned: boolean;
    hasBom: boolean;
    safetyStock: number;
    reorderPoint?: number;
    maxLevel?: number | null;
    leadTimeWorkingDays: number;
    abc?: AbcClass;
  }[],
): PolicyConflict[] {
  const out: PolicyConflict[] = [];

  for (const i of items) {
    if (i.isMrpPlanned && i.hasReorderPoint) {
      out.push({
        itemId: i.itemId,
        itemCode: i.itemCode,
        severity: "critical",
        message: `${i.itemCode} is planned by MRP AND carries a reorder point — it will be ordered twice, once by the plan and once by the trigger.`,
        suggestion: "Pick one. MRP for anything with a bill of materials or a customer order behind it; a reorder point for consumables.",
      });
    }

    if (i.method === "reorder_point" && i.hasBom) {
      out.push({
        itemId: i.itemId,
        itemCode: i.itemCode,
        severity: "high",
        message: `${i.itemCode} is made from a bill of materials but is planned by reorder point — its components will never see the demand.`,
        suggestion: "Switch it to MRP so the explosion reaches its components.",
      });
    }

    if (i.method === "min_max" && i.maxLevel != null && i.reorderPoint != null && i.maxLevel <= i.reorderPoint) {
      out.push({
        itemId: i.itemId,
        itemCode: i.itemCode,
        severity: "high",
        message: `${i.itemCode} has a maximum level (${fmt(i.maxLevel)}) at or below its reorder point (${fmt(i.reorderPoint)}) — every order it raises will be for nothing or next to nothing.`,
        suggestion: "Raise the maximum above the reorder point by at least one economic order quantity.",
      });
    }

    if (i.safetyStock > 0 && i.leadTimeWorkingDays === 0) {
      out.push({
        itemId: i.itemId,
        itemCode: i.itemCode,
        severity: "medium",
        message: `${i.itemCode} holds ${fmt(i.safetyStock)} of safety stock against a zero lead time — it is buffering a risk it does not have.`,
        suggestion: "Either record the real lead time or release the safety stock.",
      });
    }

    if (i.abc === "A" && i.method === "min_max") {
      out.push({
        itemId: i.itemId,
        itemCode: i.itemCode,
        severity: "medium",
        message: `${i.itemCode} is an A-class item on a min/max policy — the most valuable stock in the plant is being managed by the least attentive method.`,
        suggestion: "A-class items are worth planning. Move it to MRP.",
      });
    }
  }

  return out.sort((a, b) => rank(a.severity) - rank(b.severity) || a.itemCode.localeCompare(b.itemCode));
}

function rank(s: PolicyConflict["severity"]): number {
  return s === "critical" ? 0 : s === "high" ? 1 : 2;
}

/**
 * ABC classification by annual consumption value — Pareto, not quantity.
 *
 * A is the ~80% of value, B the next ~15%, C the rest. The boundary is taken at the item
 * that CROSSES the threshold, so a single item worth 85% of the plant's spend lands in A
 * on its own rather than dragging half the catalogue with it.
 */
export function classifyAbc(
  items: readonly { itemId: string; itemCode: string; annualValue: number }[],
  thresholds: { a?: number; b?: number } = {},
): { itemId: string; itemCode: string; annualValue: number; cumulativeShare: number; abc: AbcClass }[] {
  const aCut = thresholds.a ?? 0.8;
  const bCut = thresholds.b ?? 0.95;
  const total = items.reduce((acc, i) => acc + Math.max(0, i.annualValue), 0);
  const sorted = [...items].sort((x, y) => y.annualValue - x.annualValue || x.itemCode.localeCompare(y.itemCode));

  let running = 0;
  return sorted.map((i) => {
    const before = total > 0 ? running / total : 0;
    running += Math.max(0, i.annualValue);
    const cumulativeShare = total > 0 ? round3(running / total) : 0;
    // Classified on the share BEFORE this item, so the item that crosses 80% is in A.
    const abc: AbcClass = before < aCut ? "A" : before < bCut ? "B" : "C";
    return { itemId: i.itemId, itemCode: i.itemCode, annualValue: round3(i.annualValue), cumulativeShare, abc };
  });
}

function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round3(n));
}
