import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addInterval,
  addMonthsClamped,
  completedWithinGrace,
  decideGeneration,
  describeSchedule,
  nextCalendarDue,
  projectMeterDue,
  trailingDailyRate,
  type CalendarRule,
  type LastOccurrence,
} from "./pm-schedule.js";

/* ------------------------- calendar arithmetic ---------------------------- */

test("month arithmetic clamps instead of overflowing", () => {
  assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28", "31-Jan + 1 month is 28-Feb, not 03-Mar");
  assert.equal(addMonthsClamped("2028-01-31", 1), "2028-02-29", "and 29-Feb in a leap year");
  assert.equal(addMonthsClamped("2026-08-31", 1), "2026-09-30");
  assert.equal(addMonthsClamped("2026-03-15", 12), "2027-03-15");
});

test("every interval unit resolves to a real date", () => {
  assert.equal(addInterval("2026-07-01", 10, "day"), "2026-07-11");
  assert.equal(addInterval("2026-07-01", 2, "week"), "2026-07-15");
  assert.equal(addInterval("2026-07-01", 3, "month"), "2026-10-01");
  assert.equal(addInterval("2026-07-01", 1, "quarter"), "2026-10-01");
  assert.equal(addInterval("2026-07-01", 1, "year"), "2027-07-01");
});

/* ------------------ TC-16-04 — drift semantics, table-driven --------------- */

const QUARTERLY = (drift: "fixed" | "floating"): CalendarRule => ({
  intervalValue: 3,
  intervalUnit: "month",
  anchorDate: "2026-03-01",
  driftPolicy: drift,
});

/** Due 01-Jun, three-monthly, COMPLETED LATE on 22-Jun. The whole of CMMS drift in one row. */
const LATE_COMPLETION: LastOccurrence = {
  occurrenceSeq: 1,
  dueDate: "2026-06-01",
  completedAt: "2026-06-22T11:30:00+05:30",
  status: "completed",
};

test("TC-16-04 — FIXED keeps the calendar: a job done 21 days late is still due 01-Sep", () => {
  const r = nextCalendarDue(QUARTERLY("fixed"), LATE_COMPLETION, "2026-06-22");
  assert.equal(r.dueDate, "2026-09-01");
  assert.equal(r.basis, "last_due");
  assert.equal(r.skippedIntervals, 0);
});

test("TC-16-04 — FLOATING restarts the clock at actual completion: 22-Sep", () => {
  const r = nextCalendarDue(QUARTERLY("floating"), LATE_COMPLETION, "2026-06-22");
  assert.equal(r.dueDate, "2026-09-22");
  assert.equal(r.basis, "last_completion");
});

test("the first occurrence of a new schedule comes off the anchor date", () => {
  const r = nextCalendarDue(QUARTERLY("fixed"), null, "2026-04-01");
  assert.equal(r.dueDate, "2026-06-01");
  assert.equal(r.basis, "anchor");
});

test("TC-16-04 — a schedule dormant for a year wakes with ONE occurrence, not twelve", () => {
  const monthly: CalendarRule = {
    intervalValue: 1,
    intervalUnit: "month",
    anchorDate: "2025-07-01",
    driftPolicy: "fixed",
  };
  const last: LastOccurrence = {
    occurrenceSeq: 1,
    dueDate: "2025-07-01",
    completedAt: "2025-07-01T10:00:00Z",
    status: "completed",
  };
  const r = nextCalendarDue(monthly, last, "2026-07-15");
  assert.equal(r.dueDate, "2026-07-01", "the current one — overdue, but current");
  assert.equal(r.skippedIntervals, 11, "and eleven honest 'missed' rows, not eleven work orders");
});

test("a floating schedule cannot accumulate a backlog of dates in the first place", () => {
  const monthly: CalendarRule = {
    intervalValue: 1,
    intervalUnit: "month",
    anchorDate: "2025-07-01",
    driftPolicy: "floating",
  };
  const r = nextCalendarDue(
    monthly,
    { occurrenceSeq: 1, dueDate: "2025-07-01", completedAt: "2026-07-10T10:00:00Z", status: "completed" },
    "2026-07-15",
  );
  assert.equal(r.dueDate, "2026-08-10");
  assert.equal(r.skippedIntervals, 0);
});

/* -------------- TC-16-02 — meter-based triggering, golden fixture ---------- */

/**
 * Schedule PMS-PNQ-CMP-01-2000H on the 55 kW screw compressor: interval 2,000 run hours,
 * lead 7 days, last_generated_meter 10,000, so the next service is due at 12,000 h.
 *
 * NOTE ON A BLUEPRINT DISCREPANCY, recorded rather than papered over. Step 1 of §16.2
 * reproduces here exactly: 550 hours to go at 22.0 h/day from the 15-Jun reading projects
 * to 10-Jul, and the seven-day lead means no generation on 15-Jun. Step 2 does not: it
 * quotes a 03-Jul reading of 11,842.5 at 22.4 h/day and expects 22-Jul, but 157.5 hours at
 * 22.4 h/day is 7 days, which lands on 10-Jul from that anchor. The same document's §20.3
 * quotes 22.4 h/day while giving two readings (11,450 on 15-Jun, 11,842.5 on 03-Jul) that
 * imply 21.8056 h/day. The engine uses the rate its own readings support and states the
 * date that follows; the difference is one figure in the source document, not a choice.
 */
const METER_RULE = { intervalMeterValue: 2000, lastGeneratedMeter: 10000, generateOnForecast: true };

test("TC-16-02 step 1 — 550 hours to go at 22.0 h/day projects 10-Jul and does not generate on 15-Jun", () => {
  const m = projectMeterDue(
    METER_RULE,
    { currentValue: 11450, dailyRateEst: 22.0, lastRealReadingAt: "2026-06-15" },
    "2026-06-15",
  );
  assert.equal(m.dueMeterValue, 12000);
  assert.equal(m.projectedDate, "2026-07-10", "11,450 + 550/22 = 25 days");
  assert.equal(m.crossed, false);
  assert.equal(m.basis, "forecast");

  const d = decideGeneration(
    { pmType: "meter", leadDays: 7, meter: METER_RULE },
    {
      last: null,
      meter: { currentValue: 11450, dailyRateEst: 22.0, lastRealReadingAt: "2026-06-15" },
      today: "2026-06-15",
      openOccurrences: 0,
      maxOpen: 1,
    },
  );
  assert.equal(d.generate, false);
  assert.equal(d.triggerDate, "2026-07-03");
});

test("the forecast is anchored at the READING, so it stands still and goes overdue", () => {
  const meter = { currentValue: 11842.5, dailyRateEst: 21.8056, lastRealReadingAt: "2026-07-03" };
  // Whatever day the generator happens to run, the projected crossing is the same date.
  // Anchored at "today" instead, an unread meter would appear to be a constant seven days
  // from its service for ever — the due date running away at the speed of time.
  for (const today of ["2026-07-05", "2026-07-15", "2026-08-01"]) {
    assert.equal(projectMeterDue(METER_RULE, meter, today).projectedDate, "2026-07-10", today);
  }

  const d = decideGeneration(
    { pmType: "meter", leadDays: 7, meter: METER_RULE },
    { last: null, meter, today: "2026-07-15", openOccurrences: 0, maxOpen: 1 },
  );
  assert.equal(d.generate, true, "past the trigger date, so it is overdue and generates");
  assert.equal(d.dueBasis, "forecast");
  assert.equal(d.dueMeterValue, 12000);
  assert.equal(d.triggerDate, "2026-07-03");
});

test("TC-16-02 step 5 — an actual crossing reports basis 'meter', not 'forecast'", () => {
  const m = projectMeterDue(
    METER_RULE,
    { currentValue: 12014, dailyRateEst: 22.4, lastRealReadingAt: "2026-07-20" },
    "2026-07-20",
  );
  assert.equal(m.crossed, true);
  assert.equal(m.basis, "meter");
  assert.equal(m.projectedDate, null, "there is nothing left to forecast");
});

test("TC-16-02 stale meter — no observed reading for 60 days suppresses the forecast entirely", () => {
  const m = projectMeterDue(
    METER_RULE,
    { currentValue: 11842.5, dailyRateEst: 22.4, lastRealReadingAt: "2026-04-01" },
    "2026-07-15",
  );
  assert.equal(m.stale, true);
  assert.equal(m.projectedDate, null);

  const d = decideGeneration(
    { pmType: "meter", leadDays: 7, meter: METER_RULE },
    {
      last: null,
      meter: { currentValue: 11842.5, dailyRateEst: 22.4, lastRealReadingAt: "2026-04-01" },
      today: "2026-07-15",
      openOccurrences: 0,
      maxOpen: 1,
    },
  );
  assert.equal(d.generate, false);
  assert.match(d.reason, /stale/, "a stale meter raises a flag, it does not invent a date");
});

test("a meter with no rate at all cannot forecast, and says so", () => {
  const m = projectMeterDue(
    METER_RULE,
    { currentValue: 11000, dailyRateEst: null, lastRealReadingAt: "2026-07-14" },
    "2026-07-15",
  );
  assert.equal(m.projectedDate, null);
  assert.equal(m.stale, false);
});

test("an actual crossing always fires, even with forecast generation switched off", () => {
  const d = decideGeneration(
    { pmType: "meter", leadDays: 7, meter: { ...METER_RULE, generateOnForecast: false } },
    {
      last: null,
      meter: { currentValue: 12100, dailyRateEst: 22.4, lastRealReadingAt: "2026-07-20" },
      today: "2026-07-20",
      openOccurrences: 0,
      maxOpen: 1,
    },
  );
  assert.equal(d.generate, true);
  assert.equal(d.dueBasis, "meter");
});

test("the trailing rate is a division a user can argue with, not a model", () => {
  const rate = trailingDailyRate([
    { readingValue: 11450, readingAt: "2026-06-15" },
    { readingValue: 11842.5, readingAt: "2026-07-03" },
  ]);
  assert.equal(rate, 21.8056, "392.5 hours over 18 days");
  assert.equal(trailingDailyRate([{ readingValue: 100, readingAt: "2026-07-01" }]), null);
  assert.equal(
    trailingDailyRate([
      { readingValue: 100, readingAt: "2026-07-01" },
      { readingValue: 100, readingAt: "2026-07-05" },
    ]),
    null,
    "a meter that has not moved has no rate — not a rate of zero",
  );
});

/* ------------------------------- hybrid ----------------------------------- */

test("a hybrid schedule takes whichever rule fires first and records which one", () => {
  const rule = {
    pmType: "hybrid" as const,
    leadDays: 7,
    calendar: {
      intervalValue: 6,
      intervalUnit: "month" as const,
      anchorDate: "2026-01-01",
      driftPolicy: "fixed" as const,
    },
    meter: { intervalMeterValue: 100000, lastGeneratedMeter: 1800000, generateOnForecast: true },
  };
  // The meter crosses today; the calendar is not due until 01-Jul.
  const d = decideGeneration(rule, {
    last: { occurrenceSeq: 4, dueDate: "2026-01-01", completedAt: "2026-01-02T10:00:00Z", status: "completed" },
    meter: { currentValue: 1_900_500, dailyRateEst: 1200, lastRealReadingAt: "2026-05-20" },
    today: "2026-05-20",
    openOccurrences: 0,
    maxOpen: 1,
  });
  assert.equal(d.generate, true);
  assert.equal(d.dueBasis, "meter", "'whichever comes first' is useless data if the record does not say which");
});

/* ---------------------- backlog protection & grace ------------------------ */

test("backlog protection never blocks generation — it marks the old one missed and moves on", () => {
  const d = decideGeneration(
    {
      pmType: "calendar",
      leadDays: 7,
      calendar: { intervalValue: 1, intervalUnit: "month", anchorDate: "2026-06-01", driftPolicy: "fixed" },
    },
    {
      last: { occurrenceSeq: 2, dueDate: "2026-06-01", completedAt: null, status: "generated" },
      today: "2026-07-15",
      openOccurrences: 1,
      maxOpen: 1,
    },
  );
  assert.equal(d.generate, true);
  assert.match(d.reason, /marked missed/);
});

test("grace is a boundary, and the boundary is inclusive", () => {
  assert.equal(completedWithinGrace("2026-07-10", 3, "2026-07-13T23:59:00+05:30"), true);
  assert.equal(completedWithinGrace("2026-07-10", 3, "2026-07-14T00:01:00+05:30"), false);
  assert.equal(completedWithinGrace("2026-07-10", 0, "2026-07-10T18:00:00+05:30"), true);
});

test("the drift policy renders as a sentence a maintenance manager can act on", () => {
  assert.match(
    describeSchedule({ pmType: "calendar", leadDays: 7, calendar: QUARTERLY("fixed") }),
    /running late does not push the next one/,
  );
  assert.match(
    describeSchedule({ pmType: "calendar", leadDays: 7, calendar: QUARTERLY("floating") }),
    /clock restarts when the work is actually done/,
  );
});
