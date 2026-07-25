import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  consumedBusinessMinutes,
  describeAllowance,
  pausedBusinessMinutes,
  recomputeDueOnPriorityChange,
  DEFAULT_CALENDAR,
  type BusinessCalendar,
} from "./business-time.js";

/** Trishul's calendar: Mon–Sat, 09:00–18:00 IST, with two holidays in the demo window. */
const CAL: BusinessCalendar = {
  ...DEFAULT_CALENDAR,
  holidays: ["2026-07-20", "2026-08-15"], // a Monday, and Independence Day (a Saturday)
};

/* --------------------------- adding business time -------------------------- */

test("four business hours from a Wednesday morning lands the same morning", () => {
  // Wed 15-Jul-2026 09:30 IST + 4 h = 13:30 IST
  assert.equal(addBusinessMinutes("2026-07-15T09:30:00+05:30", 240, CAL), "2026-07-15T08:00:00.000Z");
});

test("a clock started after hours begins at the next opening, not at midnight", () => {
  // Raised at 22:40 on Wed; the window opens Thu 09:00, so 4 h lands Thu 13:00.
  const due = addBusinessMinutes("2026-07-15T22:40:00+05:30", 240, CAL);
  assert.equal(due, "2026-07-16T07:30:00.000Z", "Thu 16-Jul 13:00 IST");
});

test("a clock started before opening waits for the window", () => {
  const due = addBusinessMinutes("2026-07-16T06:15:00+05:30", 60, CAL);
  assert.equal(due, "2026-07-16T04:30:00.000Z", "Thu 10:00 IST — an hour after opening");
});

test("time spills across days without leaking the closed hours", () => {
  // Thu 16-Jul 16:00 + 4 h: 2 h left on Thursday, so it finishes Fri at 11:00.
  assert.equal(addBusinessMinutes("2026-07-16T16:00:00+05:30", 240, CAL), "2026-07-17T05:30:00.000Z");
});

test("Sunday is skipped entirely on a Mon–Sat calendar", () => {
  // Sat 18-Jul 17:00 + 2 h: 1 h left Saturday, Sunday is closed, so Monday 10:00 —
  // except Monday the 20th is a holiday here, so it lands Tuesday 10:00.
  assert.equal(addBusinessMinutes("2026-07-18T17:00:00+05:30", 120, CAL), "2026-07-21T04:30:00.000Z");
});

test("a holiday is skipped even when it falls on a working weekday", () => {
  // Fri 17-Jul 17:30 + 60 min: 30 min left Friday, Saturday is a working day here,
  // so it finishes Sat 09:30.
  assert.equal(addBusinessMinutes("2026-07-17T17:30:00+05:30", 60, CAL), "2026-07-18T04:00:00.000Z");
  // The same 60 minutes from Sat 17:30 has to cross Sunday AND the Monday holiday:
  // 30 minutes are spent before Saturday closes, and the other 30 resume Tuesday 09:00.
  assert.equal(addBusinessMinutes("2026-07-18T17:30:00+05:30", 60, CAL), "2026-07-21T04:00:00.000Z", "Tue 09:30 IST");
});

test("a Mon–Fri tenant behaves differently from a Mon–Sat one, from the same data", () => {
  const monFri: BusinessCalendar = { ...CAL, code: "MON-FRI", workingWeekdays: [1, 2, 3, 4, 5] };
  // Fri 17-Jul 17:30 + 60 min: Saturday is closed for this tenant, Monday is a holiday,
  // so Tuesday 09:30.
  assert.equal(addBusinessMinutes("2026-07-17T17:30:00+05:30", 60, monFri), "2026-07-21T04:00:00.000Z");
});

test("zero minutes still normalises an out-of-hours instant to the next opening", () => {
  assert.equal(addBusinessMinutes("2026-07-19T11:00:00+05:30", 0, CAL), "2026-07-21T03:30:00.000Z", "Sunday → Tue 09:00");
});

/* -------------------------- measuring business time ------------------------ */

test("elapsed business time counts only the open window", () => {
  // Wed 17:00 → Thu 10:00 is 17 hours of wall clock but 2 business hours.
  assert.equal(businessMinutesBetween("2026-07-15T17:00:00+05:30", "2026-07-16T10:00:00+05:30", CAL), 120);
});

test("a weekend and a holiday contribute nothing", () => {
  // Sat 18:00 → Tue 09:00 crosses Sunday and the Monday holiday: zero business minutes.
  assert.equal(businessMinutesBetween("2026-07-18T18:00:00+05:30", "2026-07-21T09:00:00+05:30", CAL), 0);
});

test("time running backwards is zero, not negative", () => {
  assert.equal(businessMinutesBetween("2026-07-16T12:00:00+05:30", "2026-07-15T12:00:00+05:30", CAL), 0);
});

/* -------------------------------- pausing ---------------------------------- */

test("a pause removes exactly the business time it covered", () => {
  const windows = [{ from: "2026-07-16T11:00:00+05:30", to: "2026-07-16T15:00:00+05:30" }];
  const gross = businessMinutesBetween("2026-07-16T09:00:00+05:30", "2026-07-16T17:00:00+05:30", CAL);
  assert.equal(gross, 480);
  assert.equal(pausedBusinessMinutes(windows, "2026-07-16T09:00:00+05:30", "2026-07-16T17:00:00+05:30", CAL), 240);
  assert.equal(
    consumedBusinessMinutes({
      startedAt: "2026-07-16T09:00:00+05:30",
      asOf: "2026-07-16T17:00:00+05:30",
      pauseWindows: windows,
      calendar: CAL,
    }),
    240,
    "eight hours open, four of them waiting on the customer",
  );
});

test("a pause spanning a weekend costs the ticket nothing it was not already paying", () => {
  // Paused Fri 17:00 → Tue 10:00. The only business time inside is Fri 17:00–18:00,
  // Sat 09:00–18:00 and Tue 09:00–10:00 — Sunday and the holiday are already free.
  const windows = [{ from: "2026-07-17T17:00:00+05:30", to: "2026-07-21T10:00:00+05:30" }];
  assert.equal(pausedBusinessMinutes(windows, "2026-07-17T09:00:00+05:30", "2026-07-21T12:00:00+05:30", CAL), 60 + 540 + 60);
});

test("a still-open pause is measured up to now, not to infinity", () => {
  const windows = [{ from: "2026-07-16T11:00:00+05:30", to: null }];
  assert.equal(pausedBusinessMinutes(windows, "2026-07-16T09:00:00+05:30", "2026-07-16T14:00:00+05:30", CAL), 180);
});

test("a pause that began before the clock did is clipped to the clock", () => {
  const windows = [{ from: "2026-07-16T09:00:00+05:30", to: "2026-07-16T12:00:00+05:30" }];
  assert.equal(pausedBusinessMinutes(windows, "2026-07-16T11:00:00+05:30", "2026-07-16T15:00:00+05:30", CAL), 60);
});

/* ------------------------- priority-change recompute ----------------------- */

test("escalating priority preserves elapsed time — it does not hand back a fresh clock", () => {
  // Raised Thu 09:00 as `medium` (8 business hours). At 12:00 it becomes `urgent`
  // (4 business hours). Three hours are already spent, so one hour remains — 13:00,
  // NOT 16:00.
  const r = recomputeDueOnPriorityChange({
    startedAt: "2026-07-16T09:00:00+05:30",
    changedAt: "2026-07-16T12:00:00+05:30",
    pauseWindows: [],
    newAllowanceMinutes: 240,
    calendar: CAL,
  });
  assert.equal(r.consumedMinutes, 180);
  assert.equal(r.remainingMinutes, 60);
  assert.equal(r.dueAt, "2026-07-16T07:30:00.000Z", "Thu 13:00 IST");
  assert.equal(r.alreadyExhausted, false);
});

test("an allowance already spent lands the deadline at the moment of the change, not in the past", () => {
  const r = recomputeDueOnPriorityChange({
    startedAt: "2026-07-16T09:00:00+05:30",
    changedAt: "2026-07-16T17:00:00+05:30",
    pauseWindows: [],
    newAllowanceMinutes: 60,
    calendar: CAL,
  });
  assert.equal(r.alreadyExhausted, true);
  assert.equal(r.remainingMinutes, 0);
  assert.equal(r.dueAt, "2026-07-16T11:30:00.000Z", "Thu 17:00 IST — due immediately, never backdated");
});

test("time the customer kept the ticket does not count against the new priority either", () => {
  const r = recomputeDueOnPriorityChange({
    startedAt: "2026-07-16T09:00:00+05:30",
    changedAt: "2026-07-16T17:00:00+05:30",
    pauseWindows: [{ from: "2026-07-16T10:00:00+05:30", to: "2026-07-16T16:00:00+05:30" }],
    newAllowanceMinutes: 240,
    calendar: CAL,
  });
  assert.equal(r.consumedMinutes, 120, "eight hours open, six of them paused");
  assert.equal(r.remainingMinutes, 120);
});

/* --------------------------------- copy ------------------------------------ */

test("the promise reads as a promise, not as a timestamp", () => {
  assert.equal(describeAllowance(240), "4 business hours");
  assert.equal(describeAllowance(60), "1 business hour");
  assert.equal(describeAllowance(30), "30 business minutes");
  assert.equal(describeAllowance(1440), "1 business day");
  assert.equal(describeAllowance(2880), "2 business days");
});
