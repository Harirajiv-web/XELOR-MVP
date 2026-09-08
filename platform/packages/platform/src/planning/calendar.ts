import { addDays, isoDayOfWeek, isoWeek, isoWeekStart, startOfIsoWeek } from "../time/date.js";

/**
 * THE PLANNING CALENDAR (PLANNING §11.4 lead-time offset, §11.6 capacity).
 *
 * Everything in MRP is a date question wearing a quantity's clothes. "How many castings do
 * we need" is easy; "by when must the purchase order leave, so the casting arrives before
 * the machining starts, so the pump ships on the day we promised" is the actual problem —
 * and it is decided entirely by this calendar.
 *
 * Two rules that look like details and are not:
 *
 *  - **Lead time is counted in WORKING days, not calendar days.** A two-week purchase lead
 *    time quoted by a foundry means twelve working days, not fourteen. Offsetting on
 *    calendar days silently promises the plant two extra days it does not have, once per
 *    order, forever.
 *
 *  - **A bucket is an ISO week, and it is labelled, not indexed.** Planners say "W31", the
 *    shop floor says "W31", and the ERP must say "W31" too. Indexing buckets 0..n from an
 *    arbitrary run date is how a plan stops being discussable across two screens.
 */

/** Mon–Sat, the ordinary Indian factory week. Sunday is the weekly off. */
export const DEFAULT_WORKING_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

export interface PlanCalendar {
  /** ISO day numbers that are working days: 1 = Monday … 7 = Sunday. */
  workingDays: readonly number[];
  /** Plant holidays as `YYYY-MM-DD`. A holiday is not a working day even on a weekday. */
  holidays: readonly string[];
}

export const DEFAULT_PLAN_CALENDAR: PlanCalendar = { workingDays: DEFAULT_WORKING_DAYS, holidays: [] };

export function isWorkingDay(dateISO: string, cal: PlanCalendar = DEFAULT_PLAN_CALENDAR): boolean {
  if (cal.holidays.includes(dateISO)) return false;
  return cal.workingDays.includes(isoDayOfWeek(dateISO));
}

/**
 * Walk `days` working days backwards from `fromISO` — the lead-time offset.
 *
 * The start date itself is not counted: a need date of Monday with a one-working-day lead
 * time releases on Saturday, because the work has to happen *before* Monday, not on it.
 */
export function offsetWorkingDaysBack(fromISO: string, days: number, cal: PlanCalendar = DEFAULT_PLAN_CALENDAR): string {
  if (days <= 0) return fromISO;
  let cursor = fromISO;
  let remaining = days;
  // A calendar with no working days at all would spin forever. Bound the walk at four
  // years and fail loudly rather than hang a planning run.
  let guard = 0;
  while (remaining > 0) {
    cursor = addDays(cursor, -1);
    if (isWorkingDay(cursor, cal)) remaining -= 1;
    if ((guard += 1) > 1461) {
      throw new Error(`planning calendar has no working days: cannot offset ${days} day(s) back from ${fromISO}`);
    }
  }
  return cursor;
}

/** Walk `days` working days forward — used to schedule an operation, not to offset a lead time. */
export function offsetWorkingDaysForward(fromISO: string, days: number, cal: PlanCalendar = DEFAULT_PLAN_CALENDAR): string {
  if (days <= 0) return fromISO;
  let cursor = fromISO;
  let remaining = days;
  let guard = 0;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isWorkingDay(cursor, cal)) remaining -= 1;
    if ((guard += 1) > 1461) {
      throw new Error(`planning calendar has no working days: cannot offset ${days} day(s) forward from ${fromISO}`);
    }
  }
  return cursor;
}

/** Working days in `[fromISO, toISO)` — the load-side counterpart of the offset. */
export function workingDaysBetween(fromISO: string, toISO: string, cal: PlanCalendar = DEFAULT_PLAN_CALENDAR): number {
  if (fromISO >= toISO) return 0;
  let n = 0;
  for (let d = fromISO; d < toISO; d = addDays(d, 1)) if (isWorkingDay(d, cal)) n += 1;
  return n;
}

/** The bucket label a date falls in, e.g. `2026-W30`. */
export function bucketOf(dateISO: string): string {
  return isoWeek(dateISO);
}

/** The Monday that opens a bucket — the date a release in that bucket is dated. */
export function bucketStart(label: string): string {
  return isoWeekStart(label);
}

/** The Sunday that closes a bucket. */
export function bucketEnd(label: string): string {
  return addDays(isoWeekStart(label), 6);
}

/** `count` consecutive bucket labels starting with the bucket containing `fromISO`. */
export function bucketHorizon(fromISO: string, count: number): string[] {
  const out: string[] = [];
  // `fromISO` is a DATE, not a bucket label — take the Monday of the week it falls in.
  let start = startOfIsoWeek(fromISO);
  for (let i = 0; i < count; i += 1) {
    out.push(isoWeek(start));
    start = addDays(start, 7);
  }
  return out;
}

/** How many buckets `later` is after `earlier`; negative if it is before. */
export function bucketsBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${bucketStart(later)}T00:00:00Z`) - Date.parse(`${bucketStart(earlier)}T00:00:00Z`)) / (7 * 86_400_000));
}
