/**
 * Planning's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable. Engineering is
 * AXLE's too and is still off limits: the item fields Planning needs are re-declared here
 * rather than reached for, because a shared type is a dependency wearing a helpful face.
 *
 * Every field name below was read off `apps/api/src/modules/planning/*.service.ts` and
 * `packages/db/src/schema/planning.ts`. Numerics arrive as STRINGS (NUMERIC(18,3) is not
 * safe through a JS float) and are formatted, never arithmetic'd, on this side.
 */

/* ------------------------------------ the run ------------------------------- */

/** The inputs the run recorded about itself, so it can be re-derived exactly. */
export interface MrpRunParams {
  horizonBuckets?: number;
  itemsPlanned?: number;
  openSupplyRows?: number;
  demandRows?: number;
  calendar?: { code?: string; workingDays?: number[]; holidays?: string[] };
}

/**
 * `GET /planning/mrp/runs/latest` returns the whole `mrp_run` row — or `null` when the
 * factory has never run MRP. Null is an ANSWER here, not a failure, and the screen treats it
 * as one.
 */
export interface MrpRunHeader {
  id: string;
  runNo: string;
  runType: string;
  /** The date the plan was computed AS OF — not the same as when it was created. */
  planningDate: string;
  horizonBuckets: number;
  firstBucket: string;
  lastBucket: string;
  status: string;
  itemCount: number;
  plannedOrderCount: number;
  exceptionCount: number;
  durationMs: number;
  params: MrpRunParams;
  warnings: string[];
  failureReason: string | null;
  createdAt: string;
  /** The actor's uuid. The endpoint carries no display name for it. */
  createdBy: string;
}

/* -------------------------------- planned orders ---------------------------- */

export interface PlannedOrderRow {
  id: string;
  /** ITEM@BUCKET — deterministic within a run, which is why it is safe to link on. */
  orderKey: string;
  itemCode: string;
  sourceType: string;
  qty: string;
  lotRule: string;
  /** Why this quantity and not the bare shortage. Shown, never hidden behind a tooltip. */
  lotReason: string;
  receiptBucket: string;
  /** The date the material is actually wanted — the question the screen is opened with. */
  needDate: string;
  releaseBucket: string;
  releaseDate: string;
  /** What the lead time actually wanted, before it was clamped to today. */
  computedReleaseBucket: string;
  pastDue: boolean;
  daysLate: number;
  status: string;
  convertedToKind: string | null;
  convertedToRef: string | null;
}

/** The explain endpoint hands back the raw `planned_order` row, which carries more. */
export interface PlannedOrderDetail extends PlannedOrderRow {
  itemId: string;
  netRequirement: string;
  computedReleaseDate: string;
}

/* --------------------------------- exceptions ------------------------------- */

export interface PlanExceptionRow {
  id: string;
  exceptionType: string;
  severity: string;
  itemId: string;
  itemCode: string;
  ref: string;
  /** What happened, in a sentence. Written by the backend for a person, not for a log. */
  message: string;
  /** What to do about it. */
  suggestion: string;
  currentBucket: string | null;
  suggestedBucket: string | null;
  bucketsMoved: number | null;
  pegKind: string;
  pegRef: string | null;
  status: string;
  snoozedUntil: string | null;
  actionNote: string | null;
}

export interface PlanExceptionSummary {
  openCount: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  headline: string;
}

/* ----------------------------------- demand --------------------------------- */

export interface DemandBucket {
  bucket: string;
  forecastQty: number;
  orderQty: number;
  /** What MRP actually explodes — orders plus whatever forecast they did not consume. */
  netDemand: number;
  consumedQty: number;
  remainingForecast: number;
  unforecastOrderQty: number;
  refs: Array<{ ref: string; qty: number; kind: string }>;
}

export interface DemandItem {
  itemId: string;
  itemCode: string;
  buckets: DemandBucket[];
  warnings: string[];
}

/* ---------------------------------- policies -------------------------------- */

export interface PlanningPolicyRow {
  id: string;
  itemId: string;
  itemCode: string;
  /** Derived from the BOM graph, never chosen. An item planned at the wrong level under-orders silently. */
  lowLevelCode: number;
  planningMethod: string;
  sourceType: string;
  lotRule: string;
  lotSize: string | null;
  leadTimeWorkingDays: number;
  safetyStock: string;
  abcClass: string | null;
  reorderPoint: string | null;
  isMpsItem: boolean;
}

/* --------------------------------- the working ------------------------------ */

export interface MrpExplainRow {
  bucket: string;
  grossRequirement: string;
  scheduledReceipts: string;
  projectedAvailableOpening: string;
  netRequirement: string;
  plannedReceipt: string;
  projectedAvailable: string;
  /** The arithmetic of this bucket, in words, written by the run and never recomputed. */
  working: string;
}

export interface MrpExplain {
  runNo: string;
  itemCode: string;
  lowLevelCode: number;
  openingAvailable: string;
  safetyStock: string;
  warnings: string[];
  rows: MrpExplainRow[];
  plannedOrders: PlannedOrderDetail[];
}

/* ----------------------------------- paths ---------------------------------- */

/**
 * Most of these answer `{ data: [...] }` with no cursor: a run is a fixed set of rows, and
 * paging a plan that was computed in one go would be inventing a boundary the data does not
 * have. `mrp/runs/latest` answers a bare object or null.
 */
export const planningApi = {
  latestRunPath: "/planning/mrp/runs/latest",
  plannedOrdersPath: "/planning/planned-orders",
  exceptionsPath: "/planning/exceptions",
  exceptionSummaryPath: "/planning/exceptions/summary",
  demandPath: "/planning/demand",
  policiesPath: "/planning/policies",
  explainPath: (runNo: string, itemCode: string) =>
    `/planning/mrp/runs/${encodeURIComponent(runNo)}/explain/${encodeURIComponent(itemCode)}`,
  /** The in-app URL of the explanation screen, for linking out of a list. */
  explainHref: (runNo: string, itemCode: string) =>
    `/planning/explain/${encodeURIComponent(runNo)}/${encodeURIComponent(itemCode)}`,
} as const;

/**
 * Severity → one of the eight status tones.
 *
 * Four visibly different treatments, ordered by urgency: red triangle, amber clock, dashed
 * outline, grey. Severity is not a workflow state, but it is the thing a planner scans down
 * the page for, and the badge is what makes that scan possible in mixed factory lighting.
 */
export function severityTone(severity: string): "overdue" | "pending" | "draft" | "unknown" {
  if (severity === "critical") return "overdue";
  if (severity === "high") return "pending";
  if (severity === "medium") return "draft";
  return "unknown";
}
