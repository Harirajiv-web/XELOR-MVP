import { round2 } from "../tax/gst.js";

/**
 * MWO COMPLETION GATE AND COST ROLL-UP (MAINTENANCE §4.C FR-MNT-035/036, §4.G FR-MNT-090).
 *
 * The completion gate is where a CMMS either collects the data that makes it worth
 * buying, or does not. Every field the reliability views need — the failure code, the
 * checklist result, the moment the machine actually went back to production — is a field
 * a tired technician at 17:30 would rather skip. So the gate is a hard stop that names
 * EVERY unmet condition at once, with the exact task and the exact field, rather than
 * rejecting once per field and training people to hate the software.
 */

export type MwoType = "breakdown" | "corrective" | "preventive" | "statutory" | "improvement";

export interface CompletionGateTask {
  sequence: number;
  instruction: string;
  isMandatory: boolean;
  completedAt: string | null;
}

export interface CompletionGateInput {
  mwoType: MwoType;
  tasks: readonly CompletionGateTask[];
  /** Downtime intervals on this MWO's asset that are still open. */
  openDowntimeIds: readonly string[];
  failureModeId: string | null;
  failureCauseId: string | null;
  detectionId: string | null;
  /** Statutory work cannot be signed off by just anybody (Factories Act s.28/s.29). */
  requiresCompetentPerson: boolean;
  competentPersonRef: string | null;
  /** Labour must have actually been recorded — a job with no time on it is not a job. */
  labourRowCount: number;
}

export interface CompletionGateFailure {
  gate:
    | "mandatory_task_incomplete"
    | "failure_code_required"
    | "downtime_open"
    | "competent_person_required"
    | "no_labour_recorded";
  field?: string;
  taskSeq?: number;
  instruction?: string;
  downtimeId?: string;
  hint?: string;
}

/**
 * Returns EVERY unmet gate, not the first. §7.2 renders this as a checklist with jump
 * links; a UI can only do that if the API tells it everything in one response.
 */
export function evaluateCompletionGate(input: CompletionGateInput): CompletionGateFailure[] {
  const failures: CompletionGateFailure[] = [];

  for (const t of input.tasks) {
    if (t.isMandatory && !t.completedAt) {
      failures.push({
        gate: "mandatory_task_incomplete",
        taskSeq: t.sequence,
        instruction: t.instruction,
      });
    }
  }

  // Failure coding is mandatory ONLY where it means something. A preventive MWO has no
  // failure to code, and demanding one would teach technicians to pick a code at random —
  // which is worse than no data, because it looks like data.
  if (input.mwoType === "breakdown" || input.mwoType === "corrective") {
    if (!input.failureModeId) failures.push({ gate: "failure_code_required", field: "failure_mode_id" });
    if (!input.failureCauseId) failures.push({ gate: "failure_code_required", field: "failure_cause_id" });
    if (!input.detectionId) failures.push({ gate: "failure_code_required", field: "detection_id" });
  }

  for (const id of input.openDowntimeIds) {
    failures.push({
      gate: "downtime_open",
      downtimeId: id,
      hint: "Use handback to return the machine before completing — downtime measures the asset, not the paperwork.",
    });
  }

  if (input.requiresCompetentPerson && !input.competentPersonRef) {
    failures.push({
      gate: "competent_person_required",
      field: "competent_person_ref",
      hint: "A statutory examination must record the competent person who performed it.",
    });
  }

  if (input.labourRowCount === 0) {
    failures.push({ gate: "no_labour_recorded", hint: "Record at least one labour row before completing." });
  }

  return failures;
}

/* --------------------------------- costing --------------------------------- */

export interface LabourRateConfig {
  trade: string;
  grade: string | null;
  ratePerHour: number;
  otMultiplier: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** 'hrm' when HRM published a costing rate for the employee; 'local_config' otherwise. */
  source: "hrm" | "local_config";
}

export interface ResolvedLabourRate {
  ratePerHour: number;
  source: "hrm" | "local_config";
  configRef: string;
}

export class LabourRateMissing extends Error {
  constructor(trade: string, asOf: string) {
    super(`No labour rate for trade '${trade}' effective on ${asOf}; add an effective-dated rate before valuing labour.`);
    this.name = "LabourRateMissing";
  }
}

/**
 * As-of rate resolution, HRM-first (FR-MNT-075).
 *
 * A rate revised in October must not restate a July job. And the rate that is preferred
 * is HRM's, because HRM owns what a person costs — this module holds a fallback so it
 * works before HRM costing lands, never a copy of employee pay data.
 */
export function resolveLabourRate(
  rates: readonly LabourRateConfig[],
  trade: string,
  grade: string | null,
  workDate: string,
): ResolvedLabourRate {
  const applicable = rates
    .filter(
      (r) =>
        r.trade === trade &&
        (r.grade == null || grade == null || r.grade === grade) &&
        r.effectiveFrom <= workDate &&
        (r.effectiveTo == null || r.effectiveTo >= workDate),
    )
    // HRM's published rate wins; then the most specific grade; then the latest row.
    .sort(
      (a, b) =>
        (a.source === "hrm" ? -1 : 1) - (b.source === "hrm" ? -1 : 1) ||
        (b.grade ? 1 : 0) - (a.grade ? 1 : 0) ||
        b.effectiveFrom.localeCompare(a.effectiveFrom),
    );

  const row = applicable[0];
  if (!row) throw new LabourRateMissing(trade, workDate);
  return {
    ratePerHour: row.ratePerHour,
    source: row.source,
    configRef: `maintenance_labour_rate:${row.trade}:${row.grade ?? "*"}:${row.effectiveFrom}`,
  };
}

/** Hours between two instants, to 3 decimals — the same arithmetic the DB's generated
 *  column performs, so the API's preview and the stored value cannot disagree. */
export function labourHours(startedAt: string, endedAt: string): number {
  const h = (Date.parse(endedAt) - Date.parse(startedAt)) / 3_600_000;
  return Math.round((h + Number.EPSILON) * 1000) / 1000;
}

export function labourAmount(hours: number, ratePerHour: number, isOvertime = false, otMultiplier = 1): number {
  return round2(hours * ratePerHour * (isOvertime ? otMultiplier : 1));
}

export interface CostSnapshot {
  costLabour: number;
  costSpares: number;
  costExternal: number;
  costTotal: number;
}

/**
 * Cost roll-up. Note what is NOT here: no valuation. The spares figure is the sum of what
 * INVENTORY returned when it posted each issue under its own valuation method. This module
 * mirrors that number and never recomputes it, which is why a stock revaluation in
 * Inventory can never silently restate a closed maintenance job.
 */
export function rollUpCost(input: {
  labour: readonly { amount: number | null }[];
  spares: readonly { valuedAmount: number }[];
  external: readonly { amount: number }[];
}): CostSnapshot {
  const costLabour = round2(input.labour.reduce((a, l) => a + (l.amount ?? 0), 0));
  const costSpares = round2(input.spares.reduce((a, s) => a + s.valuedAmount, 0));
  const costExternal = round2(input.external.reduce((a, e) => a + e.amount, 0));
  return { costLabour, costSpares, costExternal, costTotal: round2(costLabour + costSpares + costExternal) };
}

/** Does this closure need an approval? Cost band OR safety flag (FR-MNT-037). The
 *  threshold is config; only the SHAPE of the decision lives in code. */
export function requiresClosureApproval(
  snapshot: CostSnapshot,
  isSafetyRelated: boolean,
  thresholdAmount: number,
): { required: boolean; reason: string | null } {
  if (isSafetyRelated) return { required: true, reason: "safety_related" };
  if (snapshot.costTotal > thresholdAmount) {
    return { required: true, reason: `cost_above_threshold:${thresholdAmount}` };
  }
  return { required: false, reason: null };
}

/* ------------------------------- lifecycle -------------------------------- */

export type MwoStatus =
  | "draft"
  | "approved"
  | "assigned"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "closed"
  | "cancelled";

/** The state machine, stated once. Every transition in the service consults this map,
 *  so an illegal move is a 409 with a sentence rather than a corrupted row. */
export const MWO_TRANSITIONS: Readonly<Record<MwoStatus, readonly MwoStatus[]>> = {
  draft: ["approved", "assigned", "cancelled"],
  approved: ["assigned", "cancelled"],
  assigned: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["on_hold", "completed", "cancelled"],
  // on_hold -> on_hold is legal and load-bearing: the reason CHANGES while the job stays
  // parked. "Awaiting spare" becoming "awaiting production window" is the moment the
  // machine goes back to production, and it is what stops the downtime clock — refusing it
  // would force a pointless resume-and-re-hold, or worse, leave the clock running.
  on_hold: ["in_progress", "on_hold", "cancelled"],
  completed: ["closed", "in_progress"], // reopening a completed job is allowed until closure
  closed: [],
  cancelled: [],
};

export function canTransition(from: MwoStatus, to: MwoStatus): boolean {
  return MWO_TRANSITIONS[from].includes(to);
}

export type HoldReason =
  | "awaiting_spare"
  | "awaiting_vendor"
  | "awaiting_production_window"
  | "awaiting_permit"
  | "other";

/**
 * Does the downtime clock keep running while the job is on hold?
 *
 * Only one reason stops it: the machine has been handed back and production is running
 * again, and what remains is maintenance's paperwork or a future window. Downtime measures
 * the ASSET's availability, not the work order's status — the distinction the demo makes
 * explicit, and the one that decides whether OEE is believable.
 */
export function holdStopsDowntimeClock(reason: HoldReason): boolean {
  return reason === "awaiting_production_window";
}

export function describeHold(reason: HoldReason): string {
  return holdStopsDowntimeClock(reason)
    ? "The machine is back with production, so the downtime clock stops even though this job stays open."
    : "The machine is still unavailable, so the downtime clock keeps running.";
}
