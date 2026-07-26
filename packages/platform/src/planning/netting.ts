import { bucketOf, bucketStart, offsetWorkingDaysBack, workingDaysBetween, type PlanCalendar, DEFAULT_PLAN_CALENDAR } from "./calendar.js";
import { computeLowLevelCodes, type BomEdge } from "./llc.js";
import { applyLotRule, type LotPolicy } from "./lotsize.js";

/**
 * MRP NETTING (PLANNING §11.4) — the engine.
 *
 * Material Requirements Planning is three questions asked of every item, in the right
 * order, over every bucket of the horizon:
 *
 *   1. How much is wanted?      Gross requirement — independent demand plus whatever the
 *                               parents that consume it have decided to release.
 *   2. How much is missing?     Net requirement = wanted − already coming − already here
 *                               + the safety stock we refuse to eat into.
 *   3. When must it leave?      The planned order's release date = need date − lead time,
 *                               walked over working days.
 *
 * The order of items is not incidental. Every item is netted exactly once, at its
 * low-level code, so that by the time a component is planned every parent that could
 * possibly demand it has already declared what it will release. Net an item too early and
 * its plan is computed against demand that does not exist yet — and the run silently
 * under-orders.
 *
 * Two deliberate refusals:
 *
 *  - **The engine never moves an existing commitment.** A released purchase order, a
 *    running work order, a firmed planned order — these enter as scheduled receipts at
 *    their CURRENT dates and are treated as fact. Where the plan disagrees with them the
 *    engine raises a reschedule exception for a human; it does not quietly redate somebody
 *    else's commitment to a supplier (FR-PLN-024).
 *
 *  - **A release date in the past is clamped to today and FLAGGED, not back-dated.** The
 *    honest statement is "this needed to leave last week"; a planned order dated last
 *    Tuesday is a lie that makes the horizon look feasible.
 */

export type SourceType = "make" | "buy";
export type SupplyKind = "purchase_order" | "production_order" | "firm_planned_order";

export interface ScheduledReceipt {
  bucket: string;
  qty: number;
  /** The document that promises it — a PO number, a work order number. */
  ref: string;
  kind: SupplyKind;
}

export interface MrpItemInput {
  itemId: string;
  itemCode: string;
  onHand: number;
  /** Stock already reserved against a specific order — unavailable to the plan. */
  allocatedQty?: number;
  safetyStock: number;
  lotPolicy: LotPolicy;
  /** Working days from release to receipt. Zero means "available the moment it is ordered". */
  leadTimeWorkingDays: number;
  sourceType: SourceType;
  /** MPS releases for end items, plus spares and service demand, by bucket. */
  independentDemand?: Readonly<Record<string, number>>;
  /** Where independent demand came from, for the top of the pegging chain. */
  demandRefs?: readonly { bucket: string; qty: number; ref: string; kind: "sales_order" | "forecast" | "spares" }[];
  scheduledReceipts?: readonly ScheduledReceipt[];
  /** Rounding precision of the item's UOM — 0 for `nos`, 3 for metres. */
  uomPrecision?: number;
  /** Explicit level; computed from the BOM when omitted. */
  lowLevelCode?: number;
}

export interface MrpBomLink {
  parentItemId: string;
  componentItemId: string;
  /** Quantity consumed per ONE unit of parent output. */
  qtyPer: number;
  /** Expected loss at this consumption step, as a percentage. 5 means 5%. */
  scrapPct: number;
}

export interface MrpRunInput {
  today: string;
  /** Ascending bucket labels — the planning horizon. */
  buckets: readonly string[];
  items: readonly MrpItemInput[];
  bom: readonly MrpBomLink[];
  calendar?: PlanCalendar;
}

export interface MrpBucketRow {
  bucket: string;
  grossRequirement: number;
  scheduledReceipts: number;
  projectedAvailableOpening: number;
  netRequirement: number;
  plannedReceipt: number;
  projectedAvailable: number;
}

export interface PlannedOrderPeg {
  /** The planned-order key that demanded this, or a demand reference at the top level. */
  source: string;
  qty: number;
  kind: "planned_order" | "sales_order" | "forecast" | "spares";
}

export interface PlannedOrder {
  /** Deterministic within a run: one planned order per item per receipt bucket. */
  key: string;
  itemId: string;
  itemCode: string;
  sourceType: SourceType;
  qty: number;
  netRequirement: number;
  lotRule: string;
  lotReason: string;
  /** The bucket the material must be available in. */
  receiptBucket: string;
  needDate: string;
  /** The bucket the order must be placed in — clamped to today when already past. */
  releaseBucket: string;
  releaseDate: string;
  /** What the lead time actually asked for, before clamping. This is the honest date. */
  computedReleaseBucket: string;
  computedReleaseDate: string;
  /** True when the computed release date had already passed and was clamped to today. */
  pastDue: boolean;
  /** Working days the release is late by, when past due. */
  daysLate: number;
  pegs: PlannedOrderPeg[];
}

export interface MrpItemPlan {
  itemId: string;
  itemCode: string;
  lowLevelCode: number;
  sourceType: SourceType;
  safetyStock: number;
  openingAvailable: number;
  rows: MrpBucketRow[];
  plannedOrders: PlannedOrder[];
  warnings: string[];
}

export interface MrpRunResult {
  today: string;
  buckets: readonly string[];
  /** In the order they were netted — ascending low-level code. */
  plans: MrpItemPlan[];
  plannedOrders: PlannedOrder[];
  lowLevelCodes: Record<string, number>;
  warnings: string[];
}

interface DependentContribution {
  qty: number;
  fromOrderKey: string;
}

export function runMrp(input: MrpRunInput): MrpRunResult {
  const cal = input.calendar ?? DEFAULT_PLAN_CALENDAR;
  const buckets = [...input.buckets];
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]));

  const edges: BomEdge[] = input.bom.map((l) => ({ parentItemId: l.parentItemId, componentItemId: l.componentItemId }));
  const itemIds = input.items.map((i) => i.itemId);
  const computed = computeLowLevelCodes(itemIds, edges);

  const llcOf = (it: MrpItemInput): number => it.lowLevelCode ?? computed.get(it.itemId) ?? 0;

  // Ascending level; ties broken by item code so a re-run of identical data produces an
  // identical, diffable plan.
  const ordered = [...input.items].sort((a, b) => llcOf(a) - llcOf(b) || a.itemCode.localeCompare(b.itemCode));

  const childrenOf = new Map<string, MrpBomLink[]>();
  for (const l of input.bom) {
    if (!childrenOf.has(l.parentItemId)) childrenOf.set(l.parentItemId, []);
    childrenOf.get(l.parentItemId)!.push(l);
  }

  // itemId -> bucket -> contributions from parents already netted.
  const dependent = new Map<string, Map<string, DependentContribution[]>>();
  const plans: MrpItemPlan[] = [];
  const allOrders: PlannedOrder[] = [];
  const runWarnings: string[] = [];

  for (const it of ordered) {
    const warnings: string[] = [];
    const precision = it.uomPrecision ?? it.lotPolicy.uomPrecision ?? 0;

    let opening = it.onHand - (it.allocatedQty ?? 0);
    if (it.onHand < 0) {
      warnings.push(`On-hand for ${it.itemCode} is ${fmt(it.onHand)} — floored to 0 for planning. Stock cannot be negative; reconcile the ledger.`);
    }
    if (opening < 0) {
      if (it.onHand >= 0) {
        warnings.push(`${it.itemCode} has ${fmt(it.allocatedQty ?? 0)} allocated against ${fmt(it.onHand)} on hand — nothing is free to plan with.`);
      }
      opening = 0;
    }
    if (it.leadTimeWorkingDays <= 0 && it.sourceType === "buy") {
      warnings.push(`${it.itemCode} has no purchase lead time — orders are being planned as if they arrive the day they are raised.`);
    }

    const receiptsByBucket = new Map<string, number>();
    for (const sr of it.scheduledReceipts ?? []) {
      if (!bucketIndex.has(sr.bucket)) continue; // outside the horizon: not this run's business
      receiptsByBucket.set(sr.bucket, round3((receiptsByBucket.get(sr.bucket) ?? 0) + sr.qty));
    }

    const deps = dependent.get(it.itemId) ?? new Map<string, DependentContribution[]>();

    // Gross requirement per bucket, and who asked for it.
    const gross: number[] = [];
    const pegsByBucket: PlannedOrderPeg[][] = [];
    for (const b of buckets) {
      const independent = round3(it.independentDemand?.[b] ?? 0);
      const contributions = deps.get(b) ?? [];
      const dependentTotal = contributions.reduce((a, c) => a + c.qty, 0);
      // Scrap gross-up is applied per BOM line when the contribution is created; the sum is
      // rounded ONCE here. Rounding each parent's share separately compounds the rounding
      // upward and quietly inflates the order across a multi-parent item.
      const total = roundUpTo(independent + dependentTotal, precision);
      gross.push(total);

      const pegs: PlannedOrderPeg[] = [];
      for (const ref of it.demandRefs ?? []) {
        if (ref.bucket === b && ref.qty > 0) pegs.push({ source: ref.ref, qty: round3(ref.qty), kind: ref.kind });
      }
      for (const c of contributions) pegs.push({ source: c.fromOrderKey, qty: round3(c.qty), kind: "planned_order" });
      pegsByBucket.push(pegs);
    }

    const rows: MrpBucketRow[] = [];
    const orders: PlannedOrder[] = [];
    let available = opening;

    for (let t = 0; t < buckets.length; t += 1) {
      const bucket = buckets[t]!;
      const grossT = gross[t]!;
      const sched = receiptsByBucket.get(bucket) ?? 0;
      const openingAvailable = available;

      // Spec verbatim: Net = Gross − Scheduled − ProjectedAvailable(t−1) + SafetyStock.
      const rawNet = grossT - sched - openingAvailable + it.safetyStock;
      const netRequirement = rawNet > 0 ? round3(rawNet) : 0;

      let plannedReceipt = 0;
      if (netRequirement > 0) {
        // POQ needs to see what is coming; nothing else looks at this.
        const future: number[] = [];
        let peek = available + sched - grossT;
        for (let k = t + 1; k < buckets.length; k += 1) {
          const s = receiptsByBucket.get(buckets[k]!) ?? 0;
          const n = gross[k]! - s - peek + it.safetyStock;
          future.push(n > 0 ? n : 0);
          peek = peek + s - gross[k]!;
        }

        const lot = applyLotRule(netRequirement, { ...it.lotPolicy, uomPrecision: precision }, future);
        plannedReceipt = lot.qty;

        const needDate = bucketStart(bucket);
        const rawReleaseDate = offsetWorkingDaysBack(needDate, it.leadTimeWorkingDays, cal);
        const pastDue = rawReleaseDate < input.today;
        const releaseDate = pastDue ? input.today : rawReleaseDate;
        const releaseBucket = bucketOf(releaseDate);

        const order: PlannedOrder = {
          key: `${it.itemCode}@${bucket}`,
          itemId: it.itemId,
          itemCode: it.itemCode,
          sourceType: it.sourceType,
          qty: plannedReceipt,
          netRequirement,
          lotRule: lot.rule,
          lotReason: lot.reason,
          receiptBucket: bucket,
          needDate,
          releaseBucket,
          releaseDate,
          computedReleaseBucket: bucketOf(rawReleaseDate),
          computedReleaseDate: rawReleaseDate,
          pastDue,
          daysLate: pastDue ? workingDaysBetween(rawReleaseDate, input.today, cal) : 0,
          pegs: pegsByBucket[t]!,
        };
        orders.push(order);
        allOrders.push(order);

        // Explode into components, in the RELEASE bucket — the components are needed when
        // the parent starts, not when it finishes.
        for (const link of childrenOf.get(it.itemId) ?? []) {
          const scrapFactor = link.scrapPct > 0 && link.scrapPct < 100 ? 1 / (1 - link.scrapPct / 100) : 1;
          if (link.scrapPct >= 100) {
            runWarnings.push(`BOM line ${it.itemCode} → component has scrap ${fmt(link.scrapPct)}% — a 100% loss cannot be grossed up; treated as no scrap.`);
          }
          const qty = plannedReceipt * link.qtyPer * scrapFactor;
          if (!dependent.has(link.componentItemId)) dependent.set(link.componentItemId, new Map());
          const m = dependent.get(link.componentItemId)!;
          if (!m.has(order.releaseBucket)) m.set(order.releaseBucket, []);
          m.get(order.releaseBucket)!.push({ qty, fromOrderKey: order.key });
        }
      }

      const projectedAvailable = round3(openingAvailable + sched + plannedReceipt - grossT);
      rows.push({
        bucket,
        grossRequirement: grossT,
        scheduledReceipts: sched,
        projectedAvailableOpening: round3(openingAvailable),
        netRequirement,
        plannedReceipt,
        projectedAvailable,
      });
      available = projectedAvailable;
    }

    plans.push({
      itemId: it.itemId,
      itemCode: it.itemCode,
      lowLevelCode: llcOf(it),
      sourceType: it.sourceType,
      safetyStock: it.safetyStock,
      openingAvailable: round3(opening),
      rows,
      plannedOrders: orders,
      warnings,
    });
  }

  // Dependent demand that landed on an item outside the horizon, or on an item nobody
  // planned, is invisible material. Say it out loud.
  for (const [itemId, byBucket] of dependent) {
    if (plans.some((p) => p.itemId === itemId)) continue;
    const total = [...byBucket.values()].flat().reduce((a, c) => a + c.qty, 0);
    runWarnings.push(`${fmt(round3(total))} of a component (item ${itemId}) was demanded by the plan but the item has no planning policy — it was not planned.`);
  }

  return {
    today: input.today,
    buckets,
    plans,
    plannedOrders: allOrders,
    lowLevelCodes: Object.fromEntries([...computed.entries()]),
    warnings: runWarnings,
  };
}

/**
 * Walk a planned order's pegging chain upward to the demand that caused it.
 *
 * This is the answer to "why are we buying fifty castings?" — and it is the single most
 * asked question of any MRP system.
 */
export function pegUpwards(orderKey: string, orders: readonly PlannedOrder[]): {
  chain: string[];
  demands: PlannedOrderPeg[];
} {
  const byKey = new Map(orders.map((o) => [o.key, o]));
  const chain: string[] = [];
  const demands: PlannedOrderPeg[] = [];
  const seen = new Set<string>();
  const queue = [orderKey];

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    chain.push(key);
    const order = byKey.get(key);
    if (!order) continue;
    for (const p of order.pegs) {
      if (p.kind === "planned_order") queue.push(p.source);
      else demands.push(p);
    }
  }
  return { chain, demands };
}

function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
}
function roundUpTo(value: number, precision: number): number {
  const f = 10 ** precision;
  // -0 is a real hazard here: Math.ceil(-1e-9) is -0, and a gross requirement of -0
  // compares unequal to 0 under strict equality, so a plan diff would show a change that
  // is not one. Normalise it at the source.
  const r = Math.ceil(value * f - 1e-9) / f;
  return r === 0 ? 0 : r;
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round3(n));
}
