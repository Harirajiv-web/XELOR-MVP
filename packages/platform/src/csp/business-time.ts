/**
 * BUSINESS-TIME ARITHMETIC (CSP §11.3, FR-3.2).
 *
 * An SLA promise of "first response within 4 hours" made at 17:00 on a Saturday does not
 * mean 21:00 on Saturday. It means 11:00 on Monday — or 13:00, depending on whether the
 * tenant works Saturdays and whether Monday is a holiday. Getting this wrong does not
 * produce a slightly-off number; it produces a breach notification at 9 p.m. and an
 * argument with a customer who was never promised what the software thinks it promised.
 *
 * So there is exactly ONE implementation of business time in this codebase, it is pure,
 * and it is the only thing allowed to add minutes to a clock:
 *
 *   - **A calendar is data.** Working weekdays, a daily window, and a holiday list, all
 *     from the tenant's configuration. Nothing here assumes Mon–Fri or 9-to-5.
 *   - **Elapsed time is recomputable from history**, never accumulated into a counter.
 *     Pause windows are stored as intervals, so "how much of the clock has this ticket
 *     actually used" can be re-derived years later and audited — which is what makes an
 *     SLA verdict defensible rather than merely asserted.
 *   - **Nothing reads a client clock.** Every input here is a server timestamp.
 */

import { IST_OFFSET_MINUTES } from "../time/ist.js";

export interface BusinessCalendar {
  code: string;
  /** 0 = Sunday … 6 = Saturday. e.g. Mon–Sat = [1,2,3,4,5,6]. */
  workingWeekdays: readonly number[];
  /** Minutes past local midnight, e.g. 09:00 = 540. */
  dayStartMinutes: number;
  /** Minutes past local midnight, e.g. 18:00 = 1080. */
  dayEndMinutes: number;
  /** YYYY-MM-DD dates that are not worked, whatever the weekday. */
  holidays: readonly string[];
  utcOffsetMinutes?: number;
}

export const DEFAULT_CALENDAR: BusinessCalendar = {
  code: "3S-MON-SAT",
  workingWeekdays: [1, 2, 3, 4, 5, 6],
  dayStartMinutes: 9 * 60,
  dayEndMinutes: 18 * 60,
  holidays: [],
  utcOffsetMinutes: IST_OFFSET_MINUTES,
};

const MINUTE = 60_000;
const DAY = 86_400_000;

const offsetOf = (cal: BusinessCalendar): number => cal.utcOffsetMinutes ?? IST_OFFSET_MINUTES;

/** The instant, as local wall-clock milliseconds since the epoch. */
const toLocal = (instantMs: number, cal: BusinessCalendar): number => instantMs + offsetOf(cal) * MINUTE;
const toUtc = (localMs: number, cal: BusinessCalendar): number => localMs - offsetOf(cal) * MINUTE;

const localDateISO = (localMs: number): string => new Date(localMs).toISOString().slice(0, 10);
const localMidnight = (localMs: number): number => Math.floor(localMs / DAY) * DAY;
const localWeekday = (localMs: number): number => new Date(localMidnight(localMs)).getUTCDay();

function isWorkingDay(localMs: number, cal: BusinessCalendar): boolean {
  if (!cal.workingWeekdays.includes(localWeekday(localMs))) return false;
  return !cal.holidays.includes(localDateISO(localMs));
}

/** Minutes of the working window that fall on this local day at or after `localMs`. */
function remainingMinutesInDay(localMs: number, cal: BusinessCalendar): number {
  if (!isWorkingDay(localMs, cal)) return 0;
  const midnight = localMidnight(localMs);
  const minutesIntoDay = (localMs - midnight) / MINUTE;
  const from = Math.max(minutesIntoDay, cal.dayStartMinutes);
  return Math.max(0, cal.dayEndMinutes - from);
}

/**
 * Add business minutes to an instant.
 *
 * A start outside the working window is first advanced to the next window opening — a
 * ticket raised at 22:40 starts its clock at tomorrow's 09:00, which is what the customer
 * was actually promised.
 */
export function addBusinessMinutes(fromIso: string, minutes: number, cal: BusinessCalendar): string {
  if (minutes < 0) throw new Error("addBusinessMinutes: minutes must be >= 0");
  let local = toLocal(Date.parse(fromIso), cal);
  let remaining = minutes;

  // Advance to the start of the next working window if we are outside one.
  local = advanceToWindow(local, cal);
  if (remaining === 0) return new Date(toUtc(local, cal)).toISOString();

  let guard = 0;
  while (remaining > 0 && guard < 4000) {
    guard += 1;
    const available = remainingMinutesInDay(local, cal);
    if (available <= 0) {
      local = advanceToWindow(localMidnight(local) + DAY, cal);
      continue;
    }
    if (available >= remaining) {
      return new Date(toUtc(local + remaining * MINUTE, cal)).toISOString();
    }
    remaining -= available;
    local = advanceToWindow(localMidnight(local) + DAY, cal);
  }
  throw new Error("addBusinessMinutes: could not resolve — is the calendar workable at all?");
}

/** Move an instant forward to the next moment inside the working window (or leave it). */
function advanceToWindow(localMs: number, cal: BusinessCalendar): number {
  let cur = localMs;
  let guard = 0;
  while (guard < 4000) {
    guard += 1;
    if (isWorkingDay(cur, cal)) {
      const midnight = localMidnight(cur);
      const into = (cur - midnight) / MINUTE;
      if (into < cal.dayStartMinutes) return midnight + cal.dayStartMinutes * MINUTE;
      if (into < cal.dayEndMinutes) return cur;
    }
    cur = localMidnight(cur) + DAY;
  }
  throw new Error("advanceToWindow: no working day found within range");
}

/** Business minutes strictly between two instants. Order-insensitive is NOT assumed:
 *  a `to` before `from` returns 0, because negative elapsed time is a bug, not a value. */
export function businessMinutesBetween(fromIso: string, toIso: string, cal: BusinessCalendar): number {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (toMs <= fromMs) return 0;

  let local = toLocal(fromMs, cal);
  const endLocal = toLocal(toMs, cal);
  let total = 0;
  let guard = 0;

  while (local < endLocal && guard < 4000) {
    guard += 1;
    if (!isWorkingDay(local, cal)) {
      local = localMidnight(local) + DAY;
      continue;
    }
    const midnight = localMidnight(local);
    const windowStart = midnight + cal.dayStartMinutes * MINUTE;
    const windowEnd = midnight + cal.dayEndMinutes * MINUTE;
    const segStart = Math.max(local, windowStart);
    const segEnd = Math.min(endLocal, windowEnd);
    if (segEnd > segStart) total += (segEnd - segStart) / MINUTE;
    local = midnight + DAY;
  }
  return Math.round(total * 1000) / 1000;
}

/** A paused interval. An open range (`to === null`) means the clock is stopped right now. */
export interface PauseWindow {
  from: string;
  to: string | null;
}

/**
 * Business minutes the clock spent PAUSED inside [from, asOf].
 *
 * Pauses are clipped to the measurement window, so a pause that began before the ticket's
 * clock started, or that is still open now, contributes only the part that overlaps.
 */
export function pausedBusinessMinutes(
  windows: readonly PauseWindow[],
  fromIso: string,
  asOfIso: string,
  cal: BusinessCalendar,
): number {
  let total = 0;
  for (const w of windows) {
    const start = Math.max(Date.parse(w.from), Date.parse(fromIso));
    const end = Math.min(w.to ? Date.parse(w.to) : Date.parse(asOfIso), Date.parse(asOfIso));
    if (end <= start) continue;
    total += businessMinutesBetween(new Date(start).toISOString(), new Date(end).toISOString(), cal);
  }
  return Math.round(total * 1000) / 1000;
}

/**
 * How much of the clock a ticket has actually consumed: business time since it started,
 * less the time it spent legitimately waiting on the customer.
 *
 * Derived from history every single time. There is no running total to drift, and a
 * disputed SLA verdict is re-derived rather than argued about — the same discipline the
 * attendance engine uses for a disputed day.
 */
export function consumedBusinessMinutes(input: {
  startedAt: string;
  asOf: string;
  pauseWindows: readonly PauseWindow[];
  calendar: BusinessCalendar;
}): number {
  const gross = businessMinutesBetween(input.startedAt, input.asOf, input.calendar);
  const paused = pausedBusinessMinutes(input.pauseWindows, input.startedAt, input.asOf, input.calendar);
  return Math.round(Math.max(0, gross - paused) * 1000) / 1000;
}

/**
 * Recompute a due date after a priority change, PRESERVING elapsed time (FR-3.2).
 *
 * The naive implementation — "new priority, new clock from now" — is how a ticket gets
 * escalated to urgent at hour three and thereby gains more time than it had before. Here
 * the minutes already consumed are subtracted from the new allowance, and an allowance
 * already exhausted lands the due date at the moment of the change rather than in the past.
 */
export function recomputeDueOnPriorityChange(input: {
  startedAt: string;
  changedAt: string;
  pauseWindows: readonly PauseWindow[];
  newAllowanceMinutes: number;
  calendar: BusinessCalendar;
}): { dueAt: string; consumedMinutes: number; remainingMinutes: number; alreadyExhausted: boolean } {
  const consumed = consumedBusinessMinutes({
    startedAt: input.startedAt,
    asOf: input.changedAt,
    pauseWindows: input.pauseWindows,
    calendar: input.calendar,
  });
  const remaining = Math.max(0, input.newAllowanceMinutes - consumed);
  return {
    dueAt: addBusinessMinutes(input.changedAt, remaining, input.calendar),
    consumedMinutes: consumed,
    remainingMinutes: remaining,
    alreadyExhausted: consumed >= input.newAllowanceMinutes,
  };
}

/** Plain English for the portal's submit confirmation — "First response within 4 business
 *  hours", not an ISO timestamp a shop-floor engineer has to decode. */
export function describeAllowance(minutes: number): string {
  if (minutes < 60) return `${minutes} business minutes`;
  if (minutes % (60 * 24) === 0) {
    const days = minutes / (60 * 24);
    return `${days} business day${days === 1 ? "" : "s"}`;
  }
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} business hour${hours === 1 ? "" : "s"}`;
}
