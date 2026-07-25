/**
 * PRIORITY & SLA (MAINTENANCE §4.C FR-MNT-031, NFR-14).
 *
 * Priority is DERIVED, never typed by a person in a hurry: criticality × severity, read
 * from an effective-dated tenant matrix. Two consequences follow, and both are the point:
 *
 *   - No statutory or policy number exists in this file. The matrix arrives as data. A
 *     tenant that wants a 10-minute P1 response edits a row; nobody redeploys anything.
 *   - The clock starts at REQUEST time, not triage time. Measuring how long maintenance
 *     took to react is the entire purpose of a response SLA, so the person being measured
 *     cannot reset it by taking longer to open the queue.
 */

export type Criticality = "A" | "B" | "C";
export type Severity = "stopped" | "degraded" | "cosmetic";
export type Priority = "P1" | "P2" | "P3" | "P4";

export interface SlaMatrixRow {
  criticality: Criticality;
  severity: Severity;
  priority: Priority;
  respondMinutes: number;
  restoreMinutes: number;
  escalateToRole: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
}

export interface ResolvedSla {
  priority: Priority;
  respondMinutes: number;
  restoreMinutes: number;
  escalateToRole: string;
  /** Which effective-dated row produced this, so a disputed SLA can be traced. */
  configRef: string;
}

export class SlaMatrixMissing extends Error {
  constructor(
    readonly criticality: Criticality,
    readonly severity: Severity,
    readonly asOf: string,
  ) {
    super(
      `No SLA matrix row for criticality ${criticality} × severity ${severity} effective on ${asOf}; insert an effective-dated row before triaging.`,
    );
    this.name = "SlaMatrixMissing";
  }
}

/**
 * As-of resolution. A matrix edited in September must not restate a July request's
 * deadline — the row that was in force when the request was raised is the row that
 * governs it, for ever.
 */
export function resolveSla(
  rows: readonly SlaMatrixRow[],
  criticality: Criticality,
  severity: Severity,
  asOfDate: string,
): ResolvedSla {
  const candidates = rows
    .filter(
      (r) =>
        r.criticality === criticality &&
        r.severity === severity &&
        r.effectiveFrom <= asOfDate &&
        (r.effectiveTo == null || r.effectiveTo >= asOfDate),
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  const row = candidates[0];
  if (!row) throw new SlaMatrixMissing(criticality, severity, asOfDate);

  return {
    priority: row.priority,
    respondMinutes: row.respondMinutes,
    restoreMinutes: row.restoreMinutes,
    escalateToRole: row.escalateToRole,
    configRef: `criticality_sla_matrix:${criticality}:${severity}:${row.effectiveFrom}`,
  };
}

export interface SlaDeadlines {
  respondBy: string; // ISO instant
  restoreBy: string;
}

/** Deadlines from the moment the request was raised (§11.3). */
export function slaDeadlines(requestedAt: string, sla: ResolvedSla): SlaDeadlines {
  const t = Date.parse(requestedAt);
  return {
    respondBy: new Date(t + sla.respondMinutes * 60_000).toISOString(),
    restoreBy: new Date(t + sla.restoreMinutes * 60_000).toISOString(),
  };
}

export type SlaState = "met" | "on_track" | "at_risk" | "breached";

/**
 * The board's chip colour, as a function rather than three copies of the same conditional
 * in three components. `at_risk` is the last 25% of the window — enough warning to act,
 * late enough not to cry wolf all day.
 */
export function slaState(dueAt: string, now: string, satisfiedAt: string | null, startedAt: string): SlaState {
  const due = Date.parse(dueAt);
  if (satisfiedAt) return Date.parse(satisfiedAt) <= due ? "met" : "breached";
  const t = Date.parse(now);
  if (t > due) return "breached";
  const total = due - Date.parse(startedAt);
  const remaining = due - t;
  return total > 0 && remaining / total <= 0.25 ? "at_risk" : "on_track";
}

/** Minutes past the deadline, for the breach event's payload. Negative means still inside. */
export function breachedByMinutes(dueAt: string, at: string): number {
  return Math.round((Date.parse(at) - Date.parse(dueAt)) / 60_000);
}
