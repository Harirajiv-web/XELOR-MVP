import { createHash } from "node:crypto";
import { IST_OFFSET_MINUTES } from "../time/ist.js";

/**
 * RELIABILITY MATHS (MAINTENANCE §11.5, FR-MNT-100..102).
 *
 * Every number on the Maintenance Insights dashboard is computed here and nowhere else.
 * That is the point: a KPI duplicated in a chart query is a KPI that will eventually
 * disagree with itself, and "your MTBF is wrong" is the argument that ends a CMMS
 * rollout. One implementation, one published formula, one digest of the inputs.
 *
 * Three decisions worth naming, because each is a place products quietly cheat:
 *
 *   1. A zero-failure window returns NULL — not 0, not Infinity. "No failures in the
 *      window" is the honest answer; printing 0 h MTBF would read as catastrophic and
 *      printing ∞ would read as a bug.
 *   2. A plant with no shift calendar returns NULL scheduled hours and therefore NULL
 *      availability. Assuming 24x7 would inflate availability for exactly the customers
 *      who have not configured anything.
 *   3. Intervals are CLIPPED to the window, so a stop running from 31-Jul 22:00 to
 *      01-Aug 03:00 gives July 2.0 h and August 3.0 h — never 5.0 h to both.
 */

const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;
const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

export type DowntimeKind = "unplanned" | "planned";

/** One downtime interval, as the ledger stores it. `endedAt === null` means still open. */
export interface DowntimeInterval {
  id: string;
  assetId: string;
  startedAt: string; // ISO instant
  endedAt: string | null;
  kind: DowntimeKind;
  productionImpacting: boolean;
  reasonCode?: string | null;
  mwoId?: string | null;
}

/** The window a KPI is computed over. `openIntervalCutoff` is what an open interval is
 *  clipped to — normally "now", so a machine down right now still accrues hours. */
export interface KpiWindow {
  /** inclusive date, e.g. 2026-07-01 */
  from: string;
  /** inclusive date, e.g. 2026-07-31 */
  to: string;
  openIntervalCutoff?: string;
  /**
   * The plant's offset from UTC. Defaults to IST (+05:30) — the same 330 the attendance
   * engine uses. This is load-bearing, not cosmetic: a stop from 31-Jul 22:00 to 01-Aug
   * 03:00 IST is one hour on either side of midnight *in India*, but falls entirely inside
   * 31 July in UTC. Computing a month boundary in the wrong zone silently moves five hours
   * of downtime into the wrong month, every month.
   */
  utcOffsetMinutes?: number;
}

const offsetOf = (w: KpiWindow): number => w.utcOffsetMinutes ?? IST_OFFSET_MINUTES;

/** Local midnight at the start of `dateISO`, as a UTC instant. */
const startInstant = (dateISO: string, offsetMinutes: number): number =>
  Date.parse(`${dateISO}T00:00:00.000Z`) - offsetMinutes * 60_000;
/** The window's upper bound is EXCLUSIVE local midnight of the day after `to` — so a stop
 *  at 23:59 on the last day is inside the window and one at 00:00 the next day is not. */
const endInstant = (dateISO: string, offsetMinutes: number): number =>
  startInstant(dateISO, offsetMinutes) + 86_400_000;

/**
 * Hours of `interval` that fall inside `window`. Returns 0 when they do not intersect.
 * This is the function that makes month-boundary arithmetic add up (TC-16-01c).
 */
export function clipIntervalHours(interval: DowntimeInterval, window: KpiWindow): number {
  const off = offsetOf(window);
  const winFrom = startInstant(window.from, off);
  const winTo = endInstant(window.to, off);
  const cutoff = window.openIntervalCutoff ? Date.parse(window.openIntervalCutoff) : winTo;
  const s = Date.parse(interval.startedAt);
  const e = interval.endedAt ? Date.parse(interval.endedAt) : cutoff;
  const overlap = Math.min(e, winTo) - Math.max(s, winFrom);
  return overlap <= 0 ? 0 : round3(overlap / 3_600_000);
}

/** Did this interval START inside the window? Failure COUNTING keys on the start, while
 *  hours key on the overlap — deliberately asymmetric, so a stop spanning a month end is
 *  one failure in the month it began and hours in both. Counting it twice would halve
 *  MTBF for no reason other than a calendar. */
export function startedWithin(interval: DowntimeInterval, window: KpiWindow): boolean {
  const off = offsetOf(window);
  const s = Date.parse(interval.startedAt);
  return s >= startInstant(window.from, off) && s < endInstant(window.to, off);
}

export interface PmOccurrenceFact {
  id: string;
  dueDate: string; // YYYY-MM-DD
  graceDays: number;
  status: "scheduled" | "generated" | "in_progress" | "completed" | "skipped" | "missed";
  completedAt: string | null; // ISO instant
}

export interface PlannedMwoFact {
  id: string;
  plannedEnd: string | null; // ISO instant
  actualEnd: string | null;
}

export interface ReliabilityInput {
  window: KpiWindow;
  /** From General's shift calendar. NULL means the plant has not configured shifts. */
  scheduledHours: number | null;
  intervals: readonly DowntimeInterval[];
  occurrences?: readonly PmOccurrenceFact[];
  plannedMwos?: readonly PlannedMwoFact[];
}

export interface ReliabilityResult {
  scheduledHours: number | null;
  downtimeUnplannedHours: number;
  downtimePlannedHours: number;
  operatingHours: number | null;
  failureCount: number;
  mtbfHours: number | null;
  mttrHours: number | null;
  availabilityPct: number | null;
  pmDueCount: number;
  pmCompletedInGrace: number;
  pmCompliancePct: number | null;
  scheduleAdherencePct: number | null;
  /** Every id that fed a number, so the answer can be re-derived and drilled into. */
  inputs: {
    downtimeRowIds: string[];
    failureRowIds: string[];
    occurrenceIds: string[];
    mwoIds: string[];
  };
  /** Printed on the tile's info affordance — the antidote to "your MTBF is wrong". */
  formulas: Record<string, string>;
  /** Notes the UI renders INSTEAD of a number, when a number would be a lie. */
  notes: string[];
  inputsDigest: string;
}

export const KPI_FORMULAS: Record<string, string> = {
  operating_hours: "scheduled_hours - downtime_unplanned_hours",
  mtbf_hours: "(scheduled_hours - downtime_unplanned_hours) / failure_count",
  mttr_hours: "downtime_unplanned_hours / failure_count",
  availability_pct: "mtbf / (mtbf + mttr) * 100  [= operating_hours / scheduled_hours * 100]",
  pm_compliance_pct: "occurrences completed on or before (due_date + grace_days) / occurrences due",
  schedule_adherence_pct: "planned MWOs completed within their planned window / planned MWOs",
};

/**
 * The digest exists so a snapshot can prove it is reproducible: same input rows, same
 * numbers, byte for byte (TC-16-06). It hashes the sorted row IDS, not the values —
 * if a row is corrected, its id stays but the snapshot is explicitly marked for recompute.
 */
export function inputsDigest(parts: {
  downtimeRowIds: readonly string[];
  occurrenceIds: readonly string[];
  mwoIds: readonly string[];
  window: KpiWindow;
  scheduledHours: number | null;
}): string {
  const canonical = JSON.stringify({
    d: [...parts.downtimeRowIds].sort(),
    o: [...parts.occurrenceIds].sort(),
    m: [...parts.mwoIds].sort(),
    w: [parts.window.from, parts.window.to],
    s: parts.scheduledHours,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function computeReliability(input: ReliabilityInput): ReliabilityResult {
  const { window } = input;
  const notes: string[] = [];

  const inWindow = input.intervals.filter((i) => clipIntervalHours(i, window) > 0 || startedWithin(i, window));

  const unplanned = inWindow.filter((i) => i.kind === "unplanned" && i.productionImpacting);
  const planned = inWindow.filter((i) => i.kind === "planned");

  const downtimeUnplannedHours = round3(unplanned.reduce((a, i) => a + clipIntervalHours(i, window), 0));
  const downtimePlannedHours = round3(planned.reduce((a, i) => a + clipIntervalHours(i, window), 0));

  // One failure = one unplanned, production-impacting interval that STARTED in the window.
  const failures = unplanned.filter((i) => startedWithin(i, window));
  const failureCount = failures.length;

  const scheduledHours = input.scheduledHours;
  let operatingHours: number | null = null;
  let mtbfHours: number | null = null;
  let mttrHours: number | null = null;
  let availabilityPct: number | null = null;

  if (scheduledHours == null) {
    notes.push("Needs shift calendar — availability and MTBF cannot be computed without scheduled hours.");
  } else {
    operatingHours = round3(scheduledHours - downtimeUnplannedHours);
  }

  if (failureCount === 0) {
    notes.push("No unplanned failures in this window — MTBF and MTTR are undefined, not zero.");
    // Availability is still meaningful with zero failures: the machine simply never stopped.
    if (scheduledHours != null && scheduledHours > 0 && operatingHours != null) {
      availabilityPct = round4((operatingHours / scheduledHours) * 100);
    }
  } else {
    // Rounded for DISPLAY; the ratio below uses the exact values. Dividing two
    // already-rounded hour figures shifts availability in the fourth decimal — small
    // enough to look like a rounding preference, large enough to make the availability
    // tile disagree with the downtime tile, which is the argument this module exists to
    // prevent. 135.833/(135.833+2.833) is 97.9570; the honest answer is 97.9567.
    const exactMttr = downtimeUnplannedHours / failureCount;
    mttrHours = round3(exactMttr);
    if (operatingHours != null) {
      const exactMtbf = operatingHours / failureCount;
      mtbfHours = round3(exactMtbf);
      availabilityPct = round4((exactMtbf / (exactMtbf + exactMttr)) * 100);

      // The identity the dashboard prints out loud (§11.5). If these two expressions ever
      // disagree, the availability tile and the downtime tile are telling different
      // stories about the same machine — fail loudly rather than ship both.
      if (scheduledHours != null && scheduledHours > 0) {
        const direct = round4((operatingHours / scheduledHours) * 100);
        if (Math.abs(direct - availabilityPct) > 0.00005) {
          throw new Error(
            `availability identity broken: mtbf/(mtbf+mttr)=${availabilityPct} vs operating/scheduled=${direct}`,
          );
        }
      }
    }
  }

  /* ---------------------------- PM compliance ---------------------------- */

  const occurrences = input.occurrences ?? [];
  const dueInWindow = occurrences.filter((o) => o.dueDate >= window.from && o.dueDate <= window.to);
  const completedInGrace = dueInWindow.filter((o) => {
    if (o.status !== "completed" || !o.completedAt) return false;
    return Date.parse(o.completedAt) <= endInstant(addDays(o.dueDate, o.graceDays), offsetOf(window));
  });
  const pmDueCount = dueInWindow.length;
  const pmCompliancePct = pmDueCount === 0 ? null : round4((completedInGrace.length / pmDueCount) * 100);
  if (pmDueCount === 0) notes.push("No preventive work was due in this window.");

  /* -------------------------- schedule adherence ------------------------- */

  const plannedMwos = (input.plannedMwos ?? []).filter((m) => m.plannedEnd != null);
  const onTime = plannedMwos.filter((m) => m.actualEnd != null && Date.parse(m.actualEnd) <= Date.parse(m.plannedEnd!));
  const scheduleAdherencePct =
    plannedMwos.length === 0 ? null : round4((onTime.length / plannedMwos.length) * 100);

  const downtimeRowIds = inWindow.map((i) => i.id);
  const occurrenceIds = dueInWindow.map((o) => o.id);
  const mwoIds = [
    ...new Set([...unplanned.map((i) => i.mwoId).filter((x): x is string => !!x), ...plannedMwos.map((m) => m.id)]),
  ];

  return {
    scheduledHours,
    downtimeUnplannedHours,
    downtimePlannedHours,
    operatingHours,
    failureCount,
    mtbfHours,
    mttrHours,
    availabilityPct,
    pmDueCount,
    pmCompletedInGrace: completedInGrace.length,
    pmCompliancePct,
    scheduleAdherencePct,
    inputs: {
      downtimeRowIds,
      failureRowIds: failures.map((f) => f.id),
      occurrenceIds,
      mwoIds,
    },
    formulas: KPI_FORMULAS,
    notes,
    inputsDigest: inputsDigest({ downtimeRowIds, occurrenceIds, mwoIds, window, scheduledHours }),
  };
}

/** Calendar-day arithmetic on a YYYY-MM-DD string, UTC-safe. */
export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ParetoRow {
  key: string;
  label: string;
  hours: number;
  count: number;
  ids: string[];
}

/**
 * Downtime Pareto by reason code. Sorted by hours descending — and every bar carries the
 * row ids behind it, because a chart that cannot be drilled into is decoration (§7.8).
 */
export function downtimePareto(
  intervals: readonly DowntimeInterval[],
  window: KpiWindow,
  labels: Readonly<Record<string, string>> = {},
): ParetoRow[] {
  const acc = new Map<string, ParetoRow>();
  for (const i of intervals) {
    const hours = clipIntervalHours(i, window);
    if (hours <= 0) continue;
    const key = i.reasonCode ?? "unspecified";
    const row = acc.get(key) ?? { key, label: labels[key] ?? key, hours: 0, count: 0, ids: [] };
    row.hours = round3(row.hours + hours);
    row.count += 1;
    row.ids.push(i.id);
    acc.set(key, row);
  }
  return [...acc.values()].sort((a, b) => b.hours - a.hours || a.key.localeCompare(b.key));
}
