import { addDays } from "./reliability.js";

/**
 * PM SCHEDULING (MAINTENANCE §11.2, FR-MNT-050..058).
 *
 * The blueprint calls drift "the single most misunderstood behaviour in CMMS products",
 * and it is right. Two schedules with the same interval behave completely differently
 * depending on one stored word:
 *
 *   FIXED    — the next due date comes from the SCHEDULED date. A six-monthly hoist
 *              examination done nine days late is still due six months after the date it
 *              was due, not six months after the day someone got round to it. Statutory
 *              work is forced to this and cannot be set otherwise.
 *   FLOATING — the next due date comes from ACTUAL COMPLETION. Correct for condition-
 *              driven work: greasing done late resets the clock, because the grease does
 *              not know what the calendar said.
 *
 * Everything here is a pure function of (schedule, last occurrence, meter readings, today).
 * The generator in the API layer does the database work; it decides nothing.
 */

export type IntervalUnit = "day" | "week" | "month" | "quarter" | "year";
export type DriftPolicy = "fixed" | "floating";
export type PmType = "calendar" | "meter" | "hybrid" | "statutory";
export type DueBasis = "calendar" | "meter" | "forecast";

/** Month arithmetic that clamps rather than overflows: 31-Jan + 1 month = 28-Feb, not
 *  03-Mar. Every ERP that skips this ships a schedule that silently drifts by three days
 *  every February. */
export function addMonthsClamped(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addInterval(dateISO: string, value: number, unit: IntervalUnit): string {
  switch (unit) {
    case "day":
      return addDays(dateISO, value);
    case "week":
      return addDays(dateISO, value * 7);
    case "month":
      return addMonthsClamped(dateISO, value);
    case "quarter":
      return addMonthsClamped(dateISO, value * 3);
    case "year":
      return addMonthsClamped(dateISO, value * 12);
  }
}

export interface CalendarRule {
  intervalValue: number;
  intervalUnit: IntervalUnit;
  anchorDate: string; // YYYY-MM-DD
  driftPolicy: DriftPolicy;
}

export interface LastOccurrence {
  occurrenceSeq: number;
  dueDate: string | null;
  completedAt: string | null; // ISO instant
  status: "scheduled" | "generated" | "in_progress" | "completed" | "skipped" | "missed";
}

export interface CalendarDueResult {
  dueDate: string;
  /** Sequence numbers skipped by the catch-up guard, to be recorded as `missed`. */
  skippedIntervals: number;
  basis: "anchor" | "last_due" | "last_completion";
}

/**
 * The next calendar due date, plus the catch-up guard.
 *
 * A schedule dormant for a year is the case that breaks naive generators: computing
 * "last due + interval" repeatedly emits twelve overdue MWOs on the morning someone
 * re-enables it. Instead, a FIXED schedule advances in whole intervals to the first date
 * that is not already past, reports how many it stepped over (each recorded as `missed`,
 * visibly, in the compliance denominator), and generates exactly one.
 */
export function nextCalendarDue(rule: CalendarRule, last: LastOccurrence | null, today: string): CalendarDueResult {
  let base: string;
  let basis: CalendarDueResult["basis"];

  if (!last) {
    base = rule.anchorDate;
    basis = "anchor";
  } else if (rule.driftPolicy === "floating" && last.completedAt) {
    base = last.completedAt.slice(0, 10);
    basis = "last_completion";
  } else {
    base = last.dueDate ?? rule.anchorDate;
    basis = last.dueDate ? "last_due" : "anchor";
  }

  let due = addInterval(base, rule.intervalValue, rule.intervalUnit);
  let skipped = 0;

  // Catch-up guard applies to FIXED only. A floating schedule's clock restarts at
  // completion, so it cannot accumulate a backlog of dates in the first place.
  if (rule.driftPolicy === "fixed") {
    // Advance while the computed date is more than one whole interval in the past.
    let guard = 0;
    while (addInterval(due, rule.intervalValue, rule.intervalUnit) <= today && guard < 1000) {
      due = addInterval(due, rule.intervalValue, rule.intervalUnit);
      skipped += 1;
      guard += 1;
    }
  }

  return { dueDate: due, skippedIntervals: skipped, basis };
}

export interface MeterState {
  currentValue: number;
  /** Trailing consumption rate, units/day. Deterministic arithmetic, never a model. */
  dailyRateEst: number | null;
  /** Last reading that was actually observed (not estimated). */
  lastRealReadingAt: string | null; // YYYY-MM-DD
}

export interface MeterRule {
  intervalMeterValue: number;
  lastGeneratedMeter: number | null;
  generateOnForecast: boolean;
}

export interface MeterDueResult {
  dueMeterValue: number;
  /** NULL when there is no usable rate — the UI says "meter stale", never a guessed date. */
  projectedDate: string | null;
  crossed: boolean;
  stale: boolean;
  basis: DueBasis;
}

/** A meter with no observed reading for this long stops driving forecasts (§11.2). */
export const METER_STALE_DAYS = 60;

/**
 * Project when a meter will cross its next threshold.
 *
 * The forecast is arithmetic — remaining units divided by the trailing daily rate — and it
 * is advisory. Generation still fires on the ACTUAL crossing if that happens first, and a
 * stale meter suppresses the forecast entirely rather than projecting from a rate nobody
 * has confirmed in two months.
 *
 * The projection is anchored at the LAST OBSERVED READING, not at today. That distinction
 * is load-bearing and easy to get wrong: anchoring at today makes a meter that nobody has
 * read since Tuesday appear to be a constant seven days from its service, for ever — the
 * due date runs away from the calendar at exactly the speed of time. Anchored at the
 * reading, the date stands still and goes overdue, which is what an overdue service is.
 *
 * Whole days are taken by FLOOR, so the forecast errs EARLY. That direction is chosen, not
 * incidental: a service generated a day early is a scheduling nuisance, while one generated
 * after the interval has already been exceeded is a missed service — and on a statutory
 * schedule, a missed service is a compliance finding. The blueprint's own worked example
 * (§16.2 step 1: 11,450 h with 550 to go at 22.0 h/day, projected to 10-Jul) reproduces
 * exactly under this rule.
 */
export function projectMeterDue(rule: MeterRule, meter: MeterState, today: string): MeterDueResult {
  const dueMeterValue = (rule.lastGeneratedMeter ?? 0) + rule.intervalMeterValue;
  const crossed = meter.currentValue >= dueMeterValue;

  const stale =
    meter.lastRealReadingAt == null ||
    daysBetween(meter.lastRealReadingAt, today) > METER_STALE_DAYS;

  let projectedDate: string | null = null;
  if (!crossed && !stale && meter.dailyRateEst != null && meter.dailyRateEst > 0 && meter.lastRealReadingAt) {
    const remaining = dueMeterValue - meter.currentValue;
    projectedDate = addDays(meter.lastRealReadingAt, Math.floor(remaining / meter.dailyRateEst));
  }

  return {
    dueMeterValue,
    projectedDate,
    crossed,
    stale,
    basis: crossed ? "meter" : "forecast",
  };
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);
}

/** The trailing consumption rate: (last − first) / days, over the readings supplied.
 *  Deliberately the simplest defensible estimator — it is shown to the user as a rate,
 *  and a user can argue with a division but not with a regression they cannot see. */
export function trailingDailyRate(
  readings: readonly { readingValue: number; readingAt: string }[],
): number | null {
  const real = [...readings].sort((a, b) => a.readingAt.localeCompare(b.readingAt));
  if (real.length < 2) return null;
  const first = real[0]!;
  const last = real[real.length - 1]!;
  const days = (Date.parse(last.readingAt) - Date.parse(first.readingAt)) / 86_400_000;
  if (days <= 0) return null;
  const delta = last.readingValue - first.readingValue;
  if (delta <= 0) return null;
  return Math.round((delta / days) * 10000) / 10000;
}

export interface GenerationDecision {
  generate: boolean;
  dueDate: string | null;
  dueMeterValue: number | null;
  dueBasis: DueBasis | null;
  /** The date from which generation was allowed: due − lead_days. */
  triggerDate: string | null;
  skippedIntervals: number;
  reason: string;
}

export interface ScheduleRule {
  pmType: PmType;
  leadDays: number;
  calendar?: CalendarRule;
  meter?: MeterRule;
}

/**
 * Should the generator create an occurrence right now, and for what due point?
 *
 * Hybrid takes whichever rule fires first and RECORDS WHICH ONE — "every 100,000 strokes
 * or 6 months, whichever comes first" is useless data if the record does not say which
 * came first.
 */
export function decideGeneration(
  rule: ScheduleRule,
  ctx: { last: LastOccurrence | null; meter?: MeterState; today: string; openOccurrences: number; maxOpen: number },
): GenerationDecision {
  const none: GenerationDecision = {
    generate: false,
    dueDate: null,
    dueMeterValue: null,
    dueBasis: null,
    triggerDate: null,
    skippedIntervals: 0,
    reason: "not due",
  };

  const calendarPart = (): GenerationDecision | null => {
    if (!rule.calendar) return null;
    const { dueDate, skippedIntervals } = nextCalendarDue(rule.calendar, ctx.last, ctx.today);
    const triggerDate = addDays(dueDate, -rule.leadDays);
    return {
      generate: ctx.today >= triggerDate,
      dueDate,
      dueMeterValue: null,
      dueBasis: "calendar",
      triggerDate,
      skippedIntervals,
      reason: ctx.today >= triggerDate ? "calendar due within lead time" : `calendar due ${dueDate}`,
    };
  };

  const meterPart = (): GenerationDecision | null => {
    if (!rule.meter || !ctx.meter) return null;
    const m = projectMeterDue(rule.meter, ctx.meter, ctx.today);
    if (m.crossed) {
      return {
        generate: true,
        dueDate: ctx.today,
        dueMeterValue: m.dueMeterValue,
        dueBasis: "meter",
        triggerDate: ctx.today,
        skippedIntervals: 0,
        reason: `meter crossed ${m.dueMeterValue}`,
      };
    }
    if (m.stale) {
      return {
        generate: false,
        dueDate: null,
        dueMeterValue: m.dueMeterValue,
        dueBasis: null,
        triggerDate: null,
        skippedIntervals: 0,
        reason: "meter stale — forecast suppressed rather than invented",
      };
    }
    if (!rule.meter.generateOnForecast || !m.projectedDate) {
      return { ...none, dueMeterValue: m.dueMeterValue, reason: "forecast generation disabled" };
    }
    const triggerDate = addDays(m.projectedDate, -rule.leadDays);
    return {
      generate: ctx.today >= triggerDate,
      dueDate: m.projectedDate,
      dueMeterValue: m.dueMeterValue,
      dueBasis: "forecast",
      triggerDate,
      skippedIntervals: 0,
      reason:
        ctx.today >= triggerDate
          ? `forecast due ${m.projectedDate}, inside the ${rule.leadDays}-day lead window`
          : `forecast due ${m.projectedDate}, trigger ${triggerDate}`,
    };
  };

  let decision: GenerationDecision;
  if (rule.pmType === "meter") {
    decision = meterPart() ?? none;
  } else if (rule.pmType === "hybrid") {
    const c = calendarPart();
    const m = meterPart();
    const candidates = [c, m].filter((x): x is GenerationDecision => x !== null);
    const firing = candidates.filter((x) => x.generate);
    decision =
      firing.length > 0
        ? firing.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0]!
        : (candidates.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0] ?? none);
  } else {
    decision = calendarPart() ?? none;
  }

  // Backlog protection is evaluated LAST and never blocks: the older occurrence is marked
  // missed by the caller and exactly one current occurrence is still generated (FR-MNT-055).
  if (decision.generate && ctx.openOccurrences >= ctx.maxOpen) {
    return { ...decision, reason: `${decision.reason}; previous occurrence still open — it will be marked missed` };
  }
  return decision;
}

/** Was an occurrence completed inside its grace window? The one arithmetic behind the
 *  PM-compliance tile, kept here so the tile and the occurrence badge cannot disagree. */
export function completedWithinGrace(dueDate: string, graceDays: number, completedAt: string): boolean {
  return completedAt.slice(0, 10) <= addDays(dueDate, graceDays);
}

/** Plain English for the UI. A drift policy the user cannot read is a drift policy the
 *  user will set wrong (§7.4 renders exactly these sentences). */
export function describeSchedule(rule: ScheduleRule): string {
  const parts: string[] = [];
  if (rule.calendar) {
    const { intervalValue, intervalUnit, driftPolicy } = rule.calendar;
    const unit = intervalValue === 1 ? intervalUnit : `${intervalUnit}s`;
    parts.push(
      driftPolicy === "fixed"
        ? `every ${intervalValue} ${unit}, fixed from the scheduled date — running late does not push the next one`
        : `every ${intervalValue} ${unit}, floating — the clock restarts when the work is actually done`,
    );
  }
  if (rule.meter) parts.push(`every ${rule.meter.intervalMeterValue} meter units`);
  return parts.join(" or ") || "no rule configured";
}
