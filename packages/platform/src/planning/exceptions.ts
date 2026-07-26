import { bucketsBetween } from "./calendar.js";
import type { MrpRunResult, PlannedOrder, SupplyKind } from "./netting.js";
// ABC is one concept with one home — the inventory-planning module that computes it. An
// exception's severity only READS the class; it must not get a second definition of it.
import type { AbcClass } from "./reorder.js";

/**
 * THE EXCEPTION WORKLIST (PLANNING §11.5, §4.D).
 *
 * A regenerative MRP run over a real factory produces thousands of planned orders and
 * almost none of them need a human. The exceptions are the module's actual product: the
 * short list of things that will go wrong unless somebody does something this week.
 *
 * Three principles the messages here are built on:
 *
 *  - **Every exception names the thing to do.** "Shortage on CI-CASTING-IMP" is a fact;
 *    "expedite 50 castings from the foundry or W31 machining slips" is an instruction. A
 *    worklist of facts gets ignored; a worklist of instructions gets worked.
 *
 *  - **Severity comes from consequence, not from category.** A late order pegged to a
 *    customer's sales order outranks the same lateness pegged to a forecast, because one
 *    of them breaks a promise to somebody who is expecting a delivery. An A-class item
 *    outranks a C-class one for the same reason.
 *
 *  - **The engine proposes; it never acts.** Every row here carries a suggestion and a
 *    reference. Accepting it is a person's keystroke — MRP does not reschedule a
 *    supplier's commitment on its own.
 */

export type ExceptionType =
  | "release_now"
  | "reschedule_in"
  | "reschedule_out"
  | "excess"
  | "cancel"
  | "past_due"
  | "shortage"
  | "data_warning"
  | "fence_violation";

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";
export type PeggedDemandKind = "sales_order" | "forecast" | "spares" | "none";

export interface OpenSupply {
  ref: string;
  kind: SupplyKind;
  itemId: string;
  itemCode: string;
  qty: number;
  /** Where the supply currently says it will arrive. */
  dueBucket: string;
}

export interface PlanningException {
  type: ExceptionType;
  severity: ExceptionSeverity;
  itemId: string;
  itemCode: string;
  /** The document this is about — a planned-order key, a PO number, a work order. */
  ref: string;
  message: string;
  suggestion: string;
  /** Where the plan wants it, when that differs from where it is. */
  suggestedBucket?: string;
  currentBucket?: string;
  bucketsMoved?: number;
  pegKind: PeggedDemandKind;
  pegRef?: string;
}

export interface ExceptionOptions {
  /** Buckets within which a planned order is due to be released — the "act now" window. */
  releaseWindowBuckets?: number;
  /** Buckets of slack tolerated before a reschedule is worth a planner's attention. */
  rescheduleToleranceBuckets?: number;
  abcByItemId?: Readonly<Record<string, AbcClass>>;
  /** Open supply the plan did not create: released POs, running work orders. */
  openSupply?: readonly OpenSupply[];
  /** Item-level data problems found upstream of the run. */
  dataWarnings?: readonly { itemId: string; itemCode: string; message: string; suggestion?: string }[];
}

const SEVERITY_ORDER: Record<ExceptionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Severity from consequence: how late, how important the part, and whose promise is on the
 * line. A forecast slipping two weeks is a planning matter; a customer order slipping two
 * weeks is a phone call.
 */
export function severityFor(input: {
  bucketsLate: number;
  abc?: AbcClass;
  pegKind: PeggedDemandKind;
  baseline?: ExceptionSeverity;
}): ExceptionSeverity {
  let score = SEVERITY_ORDER[input.baseline ?? "medium"];
  if (input.bucketsLate >= 2) score -= 2;
  else if (input.bucketsLate >= 1) score -= 1;
  if (input.abc === "A") score -= 1;
  else if (input.abc === "C") score += 1;
  if (input.pegKind === "sales_order") score -= 1;
  else if (input.pegKind === "forecast") score += 1;

  const clamped = Math.max(0, Math.min(3, score));
  return (["critical", "high", "medium", "low"] as const)[clamped]!;
}

function dominantPeg(order: PlannedOrder): { kind: PeggedDemandKind; ref?: string } {
  // A sales order outranks a forecast even when the forecast quantity is larger: the
  // severity question is "who is waiting", not "how much".
  const so = order.pegs.find((p) => p.kind === "sales_order");
  if (so) return { kind: "sales_order", ref: so.source };
  const spares = order.pegs.find((p) => p.kind === "spares");
  if (spares) return { kind: "spares", ref: spares.source };
  const fc = order.pegs.find((p) => p.kind === "forecast");
  if (fc) return { kind: "forecast", ref: fc.source };
  const parent = order.pegs.find((p) => p.kind === "planned_order");
  return parent ? { kind: "none", ref: parent.source } : { kind: "none" };
}

const SUPPLY_NOUN: Record<SupplyKind, string> = {
  purchase_order: "purchase order",
  production_order: "work order",
  firm_planned_order: "firmed planned order",
};

export function generateExceptions(run: MrpRunResult, opts: ExceptionOptions = {}): PlanningException[] {
  const releaseWindow = opts.releaseWindowBuckets ?? 1;
  const tolerance = opts.rescheduleToleranceBuckets ?? 1;
  const abc = opts.abcByItemId ?? {};
  const out: PlanningException[] = [];
  const todayBucket = run.buckets[0] ?? "";

  for (const o of run.plannedOrders) {
    const peg = dominantPeg(o);
    const cls = abc[o.itemId];

    if (o.pastDue) {
      out.push({
        type: "past_due",
        severity: severityFor({ bucketsLate: Math.max(1, Math.abs(bucketsBetween(o.computedReleaseBucket, todayBucket))), abc: cls, pegKind: peg.kind, baseline: "high" }),
        itemId: o.itemId,
        itemCode: o.itemCode,
        ref: o.key,
        message: `${fmt(o.qty)} ${o.itemCode} needed to be ${o.sourceType === "buy" ? "ordered" : "started"} in ${o.computedReleaseBucket} — that week has passed.`,
        suggestion:
          o.sourceType === "buy"
            ? `Release today and ask the supplier to pull in ${o.daysLate} working day(s), or the ${o.receiptBucket} requirement slips.`
            : `Start today and recover ${o.daysLate} working day(s) on the floor, or the ${o.receiptBucket} requirement slips.`,
        currentBucket: o.computedReleaseBucket,
        suggestedBucket: o.releaseBucket,
        bucketsMoved: bucketsBetween(o.computedReleaseBucket, o.releaseBucket),
        pegKind: peg.kind,
        pegRef: peg.ref,
      });
      continue; // a past-due order is already the strongest thing to say about it
    }

    const untilRelease = bucketsBetween(todayBucket, o.releaseBucket);
    if (untilRelease <= releaseWindow) {
      out.push({
        type: "release_now",
        severity: severityFor({ bucketsLate: 0, abc: cls, pegKind: peg.kind, baseline: untilRelease <= 0 ? "high" : "medium" }),
        itemId: o.itemId,
        itemCode: o.itemCode,
        ref: o.key,
        message: `${fmt(o.qty)} ${o.itemCode} is due to be ${o.sourceType === "buy" ? "ordered" : "released"} in ${o.releaseBucket}.`,
        suggestion: o.sourceType === "buy" ? "Convert to a purchase requisition." : "Convert to a work order.",
        currentBucket: o.releaseBucket,
        pegKind: peg.kind,
        pegRef: peg.ref,
      });
    }
  }

  // Open supply the buyer or the shop floor already committed to. The engine did not move
  // it and will not; it says where the plan wants it and leaves the decision on the desk.
  const wantedByItem = new Map<string, PlannedOrder[]>();
  for (const o of run.plannedOrders) {
    if (!wantedByItem.has(o.itemId)) wantedByItem.set(o.itemId, []);
    wantedByItem.get(o.itemId)!.push(o);
  }

  for (const s of opts.openSupply ?? []) {
    const plan = run.plans.find((p) => p.itemId === s.itemId);
    const cls = abc[s.itemId];
    const noun = SUPPLY_NOUN[s.kind];

    // The bucket the plan first goes short in is the date this supply is actually wanted.
    const firstShort = plan?.rows.find((r) => r.netRequirement > 0);
    if (!firstShort) {
      const hasAnyDemand = plan?.rows.some((r) => r.grossRequirement > 0) ?? false;
      if (!hasAnyDemand) {
        out.push({
          type: "excess",
          severity: severityFor({ bucketsLate: 0, abc: cls, pegKind: "none", baseline: "medium" }),
          itemId: s.itemId,
          itemCode: s.itemCode,
          ref: s.ref,
          message: `${fmt(s.qty)} ${s.itemCode} on ${noun} ${s.ref} has no demand pegged to it anywhere in the horizon.`,
          suggestion: "Cancel it, or reduce it to what a later requirement will actually take.",
          currentBucket: s.dueBucket,
          pegKind: "none",
        });
      }
      continue;
    }

    const drift = bucketsBetween(firstShort.bucket, s.dueBucket);
    if (drift > tolerance) {
      out.push({
        type: "reschedule_in",
        severity: severityFor({ bucketsLate: drift, abc: cls, pegKind: "none", baseline: "high" }),
        itemId: s.itemId,
        itemCode: s.itemCode,
        ref: s.ref,
        message: `${noun} ${s.ref} brings ${fmt(s.qty)} ${s.itemCode} in ${s.dueBucket}, but the plan needs it by ${firstShort.bucket}.`,
        suggestion: `Ask for a pull-in of ${drift} week(s) to ${firstShort.bucket}.`,
        currentBucket: s.dueBucket,
        suggestedBucket: firstShort.bucket,
        bucketsMoved: -drift,
        pegKind: "none",
      });
    } else if (drift < -tolerance) {
      out.push({
        type: "reschedule_out",
        severity: severityFor({ bucketsLate: 0, abc: cls, pegKind: "none", baseline: "medium" }),
        itemId: s.itemId,
        itemCode: s.itemCode,
        ref: s.ref,
        message: `${noun} ${s.ref} arrives in ${s.dueBucket} but ${s.itemCode} is not needed until ${firstShort.bucket}.`,
        suggestion: `Push out ${Math.abs(drift)} week(s) to stop paying to hold it.`,
        currentBucket: s.dueBucket,
        suggestedBucket: firstShort.bucket,
        bucketsMoved: Math.abs(drift),
        pegKind: "none",
      });
    }
  }

  // A shortage is a net requirement the lead time cannot reach in time — the plan itself
  // admits it is late. Past-due releases are exactly that, so the shortage is raised
  // against the ITEM, once, naming the earliest bucket that cannot be covered.
  for (const plan of run.plans) {
    const late = plan.plannedOrders.filter((o) => o.pastDue);
    if (late.length === 0) continue;
    const first = late[0]!;
    const peg = dominantPeg(first);
    out.push({
      type: "shortage",
      severity: severityFor({ bucketsLate: 2, abc: abc[plan.itemId], pegKind: peg.kind, baseline: "critical" }),
      itemId: plan.itemId,
      itemCode: plan.itemCode,
      ref: first.key,
      message: `${plan.itemCode} cannot be covered by ${first.receiptBucket} — the ${first.sourceType === "buy" ? "purchase" : "manufacturing"} lead time is longer than the time left.`,
      suggestion: "Expedite, split the order, or move the requirement out. The horizon cannot absorb this on its own.",
      currentBucket: first.receiptBucket,
      pegKind: peg.kind,
      pegRef: peg.ref,
    });
  }

  for (const plan of run.plans) {
    for (const w of plan.warnings) {
      out.push({
        type: "data_warning",
        severity: "low",
        itemId: plan.itemId,
        itemCode: plan.itemCode,
        ref: plan.itemCode,
        message: w,
        suggestion: "Fix the item master — the plan is running on a default until you do.",
        pegKind: "none",
      });
    }
  }

  for (const w of opts.dataWarnings ?? []) {
    out.push({
      type: "data_warning",
      severity: "low",
      itemId: w.itemId,
      itemCode: w.itemCode,
      ref: w.itemCode,
      message: w.message,
      suggestion: w.suggestion ?? "Fix the item master — the plan is running on a default until you do.",
      pegKind: "none",
    });
  }

  return sortExceptions(out);
}

/** Worst first, then by item, so a planner works down the page and stops when time runs out. */
export function sortExceptions(rows: readonly PlanningException[]): PlanningException[] {
  return [...rows].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.itemCode.localeCompare(b.itemCode) || a.type.localeCompare(b.type),
  );
}

/** A fence violation is raised when a suggestion would move something already frozen. */
export function fenceViolation(input: {
  itemId: string;
  itemCode: string;
  ref: string;
  bucket: string;
  reason: string;
}): PlanningException {
  return {
    type: "fence_violation",
    severity: "high",
    itemId: input.itemId,
    itemCode: input.itemCode,
    ref: input.ref,
    message: `The plan wants to change ${input.ref} in ${input.bucket}, which is inside the frozen fence.`,
    suggestion: input.reason,
    currentBucket: input.bucket,
    pegKind: "none",
  };
}

export function summarise(rows: readonly PlanningException[]): {
  total: number;
  bySeverity: Record<ExceptionSeverity, number>;
  byType: Record<string, number>;
  headline: string;
} {
  const bySeverity: Record<ExceptionSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const byType: Record<string, number> = {};
  for (const r of rows) {
    bySeverity[r.severity] += 1;
    byType[r.type] = (byType[r.type] ?? 0) + 1;
  }
  const headline =
    bySeverity.critical > 0
      ? `${bySeverity.critical} critical exception(s) need a decision today.`
      : bySeverity.high > 0
        ? `${bySeverity.high} exception(s) need attention this week; nothing is critical.`
        : rows.length > 0
          ? "Nothing urgent — the worklist is routine releases and housekeeping."
          : "The plan is clean: no exceptions in this horizon.";
  return { total: rows.length, bySeverity, byType, headline };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
