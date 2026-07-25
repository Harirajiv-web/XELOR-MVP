import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ATTENDANCE_POLICY,
  dedupePunches,
  pairPunches,
  processAttendanceDay,
  resolveShiftWindow,
  summariseMonth,
  type AttendanceDayResult,
  type DayContext,
  type PunchRecord,
  type ShiftDef,
} from "./attendance.js";

/**
 * TC-ATT-* — the attendance engine pack (HRM §16.F).
 *
 * The property under test throughout is NFR-03: processing is a pure function of its
 * inputs, so replaying a day — in any punch order, any number of times — yields the same
 * row. Every assertion below would be a manual Excel adjustment in the world this module
 * replaces.
 */

const SHIFT_A: ShiftDef = {
  code: "A",
  startTime: "06:00",
  endTime: "14:00",
  breakMinutes: 30,
  graceMinutes: 10,
  isNight: false,
  otAfterMinutes: 480,
  halfDayThresholdMinutes: 240,
};

const SHIFT_C: ShiftDef = {
  code: "C",
  startTime: "22:00",
  endTime: "06:00",
  breakMinutes: 30,
  graceMinutes: 10,
  isNight: true,
  otAfterMinutes: 480,
  halfDayThresholdMinutes: 240,
};

const P = (punchTime: string, direction: PunchRecord["direction"] = "auto"): PunchRecord => ({
  punchTime,
  direction,
  source: "device",
});

/** Shift A day on the 15th, with no leave/holiday/off. */
const dayA = (over: Partial<DayContext> = {}): DayContext => ({
  attDate: "2026-06-15",
  shift: SHIFT_A,
  entryType: "shift",
  isHoliday: false,
  ...over,
});

/* --------------------------- the ordinary cases --------------------------- */

test("TC-ATT-01 a clean Shift A day is Present with no OT and no lateness", () => {
  const d = processAttendanceDay(dayA(), [
    P("2026-06-15T05:58:00+05:30", "in"),
    P("2026-06-15T14:05:00+05:30", "out"),
  ]);
  assert.equal(d.status, "present");
  assert.equal(d.workedHours, 7.62, "8h07 span less the 30 min break");
  assert.equal(d.otHours, 0);
  assert.equal(d.lateMinutes, 0);
  assert.equal(d.payableUnits, 1);
  assert.deepEqual(d.exceptions, []);
});

test("TC-ATT-02 hours beyond ot_after_minutes become OT", () => {
  const d = processAttendanceDay(dayA(), [
    P("2026-06-15T06:00:00+05:30", "in"),
    P("2026-06-15T16:00:00+05:30", "out"),
  ]);
  assert.equal(d.workedHours, 9.5, "10h span less the 30 min break");
  assert.equal(d.otHours, 1.5, "570 worked minutes less the 480 min threshold");
  assert.equal(d.status, "present");
});

test("TC-ATT-03 lateness is measured from shift start PLUS the grace, not from shift start", () => {
  const onGrace = processAttendanceDay(dayA(), [
    P("2026-06-15T06:10:00+05:30", "in"),
    P("2026-06-15T14:30:00+05:30", "out"),
  ]);
  assert.equal(onGrace.lateMinutes, 0, "arriving exactly on the grace boundary is not late");

  const late = processAttendanceDay(dayA(), [
    P("2026-06-15T06:25:00+05:30", "in"),
    P("2026-06-15T14:30:00+05:30", "out"),
  ]);
  assert.equal(late.lateMinutes, 15);
  assert.match(late.exceptions[0] ?? "", /late by 15 min/);
});

/* ----------------------------- the C shift -------------------------------- */

test("TC-ATT-04 a C-shift out-punch on the NEXT calendar day belongs to the prior attendance date", () => {
  // This is the case a `WHERE punch_time::date = att_date` query loses every single night.
  const ctx: DayContext = {
    attDate: "2026-06-15",
    shift: SHIFT_C,
    entryType: "shift",
    isHoliday: false,
  };
  const d = processAttendanceDay(ctx, [
    P("2026-06-15T21:55:00+05:30", "in"),
    P("2026-06-16T06:10:00+05:30", "out"), // next calendar day
  ]);
  assert.equal(d.attDate, "2026-06-15", "the row stays on the 15th");
  assert.equal(d.status, "present");
  assert.equal(d.workedHours, 7.75, "8h15 span less the 30 min break");
  assert.equal(d.lateMinutes, 0);
});

test("TC-ATT-05 the pairing window is bounded by the neighbouring rostered shifts", () => {
  // With a deliberately generous 10-hour pad, the previous day's shift would otherwise be
  // swallowed. The clamp meets the neighbour halfway instead.
  const policy = { ...DEFAULT_ATTENDANCE_POLICY, windowPadBeforeMinutes: 600 };
  const ctx: DayContext = {
    attDate: "2026-06-16",
    shift: SHIFT_A,
    entryType: "shift",
    isHoliday: false,
    prevShiftEndsAt: "2026-06-15T14:00:00+05:30",
  };
  const w = resolveShiftWindow(ctx, policy);
  const unclamped = Date.parse("2026-06-15T20:00:00+05:30");
  const halfway = Date.parse("2026-06-15T22:00:00+05:30");
  assert.ok(w.windowStart > unclamped, "the raw 10h pad would have reached back to 20:00");
  assert.equal(w.windowStart, halfway, "clamped to the midpoint between the two shifts");

  // ...so a punch at 21:00 the previous evening is NOT stolen by the 16th.
  const stolen = pairPunches([P("2026-06-15T21:00:00+05:30", "in")], w);
  assert.equal(stolen.count, 0);
});

/* --------------------------- never guess a day ---------------------------- */

test("TC-ATT-06 a single punch is Pending-Regularisation, never auto-Present", () => {
  const d = processAttendanceDay(dayA(), [P("2026-06-15T06:02:00+05:30", "in")]);
  assert.equal(d.status, "pending_reg");
  assert.deepEqual(d.exceptions, ["missing out-punch"]);
  assert.equal(d.payableUnits, 0, "an unresolved day pays nothing until a human resolves it");
  assert.equal(d.lopUnits, 0, "and it is NOT booked as LOP either — it is simply unresolved");
});

test("TC-ATT-07 no punches at all is Absent with a full day of LOP", () => {
  const d = processAttendanceDay(dayA(), []);
  assert.equal(d.status, "absent");
  assert.equal(d.lopUnits, 1);
  assert.equal(d.payableUnits, 0);
});

test("TC-ATT-08 an out-punch that precedes the in-punch is rejected, not silently negated", () => {
  const d = processAttendanceDay(dayA(), [
    P("2026-06-15T14:00:00+05:30", "in"),
    P("2026-06-15T06:00:00+05:30", "out"),
  ]);
  assert.equal(d.status, "pending_reg");
  assert.equal(d.workedHours, 0);
});

/* ------------------------------ precedence -------------------------------- */

test("TC-ATT-09 weekly-off is a roster entry, never inferred from Sunday", () => {
  // 2026-06-15 is a Monday; the roster says it is this worker's rotational off.
  const d = processAttendanceDay(dayA({ entryType: "weekly_off", shift: undefined }), []);
  assert.equal(d.status, "off");
  assert.equal(d.lopUnits, 0, "an off day is not an absence");
});

test("TC-ATT-10 holiday and leave take precedence over punches", () => {
  const holiday = processAttendanceDay(dayA({ isHoliday: true }), [
    P("2026-06-15T06:00:00+05:30", "in"),
    P("2026-06-15T14:00:00+05:30", "out"),
  ]);
  assert.equal(holiday.status, "holiday", "punching on a holiday does not make it a working day");

  const paid = processAttendanceDay(
    dayA({ leave: { leaveTypeCode: "CL", isPaid: true, halfDay: false } }),
    [],
  );
  assert.equal(paid.status, "leave");
  assert.equal(paid.payableUnits, 1);
  assert.equal(paid.lopUnits, 0);

  const unpaid = processAttendanceDay(
    dayA({ leave: { leaveTypeCode: "LOP", isPaid: false, halfDay: false } }),
    [],
  );
  assert.equal(unpaid.payableUnits, 0);
  assert.equal(unpaid.lopUnits, 1, "unpaid leave flows to payroll as LOP");

  const halfPaid = processAttendanceDay(
    dayA({ leave: { leaveTypeCode: "PL", isPaid: true, halfDay: true } }),
    [],
  );
  assert.equal(halfPaid.payableUnits, 0.5);
});

/* ------------------------- messy real-world punches ----------------------- */

test("TC-ATT-11 near-duplicate punches collapse; the raw store keeps both", () => {
  const collapsed = dedupePunches(
    [
      P("2026-06-15T06:00:00+05:30", "in"),
      P("2026-06-15T06:00:20+05:30", "in"), // same finger, twice
      P("2026-06-15T14:00:00+05:30", "out"),
    ],
    DEFAULT_ATTENDANCE_POLICY,
  );
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed[0]?.punchTime, "2026-06-15T06:00:00+05:30", "the ORIGINAL is retained");
});

test("TC-ATT-12 direction-less turnstile punches are resolved by alternation", () => {
  const d = processAttendanceDay(dayA(), [
    P("2026-06-15T06:00:00+05:30"), // auto -> in
    P("2026-06-15T10:00:00+05:30"), // auto -> out
    P("2026-06-15T10:30:00+05:30"), // auto -> in
    P("2026-06-15T15:00:00+05:30"), // auto -> out
  ]);
  assert.equal(d.status, "present");
  assert.equal(d.firstIn, "2026-06-15T06:00:00+05:30");
  assert.equal(d.lastOut, "2026-06-15T15:00:00+05:30", "first-in / LAST-out spans the whole day");
});

test("TC-ATT-13 replay determinism: arrival order cannot change the answer", () => {
  const punches = [
    P("2026-06-15T06:03:00+05:30", "in"),
    P("2026-06-15T16:12:00+05:30", "out"),
    P("2026-06-15T06:03:40+05:30", "in"),
  ];
  const forward = processAttendanceDay(dayA(), punches);
  const reversed = processAttendanceDay(dayA(), [...punches].reverse());
  const shuffled = processAttendanceDay(dayA(), [punches[1]!, punches[2]!, punches[0]!]);
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward, shuffled);
  // ...and reprocessing is idempotent.
  assert.deepEqual(forward, processAttendanceDay(dayA(), punches));
});

test("TC-ATT-14 a regularisation replays to the same row as a day rebuilt from scratch", () => {
  // The employee's out-punch was missing; the manager approves a corrected out at 14:20.
  const broken = processAttendanceDay(dayA(), [P("2026-06-15T06:05:00+05:30", "in")]);
  assert.equal(broken.status, "pending_reg");

  const corrective = P("2026-06-15T14:20:00+05:30", "out");
  const regularised = processAttendanceDay(dayA(), [P("2026-06-15T06:05:00+05:30", "in"), corrective]);
  const fromScratch = processAttendanceDay(dayA(), [corrective, P("2026-06-15T06:05:00+05:30", "in")]);
  assert.deepEqual(regularised, fromScratch, "appending a correction ≡ rebuilding the day");
  assert.equal(regularised.status, "present");
});

test("TC-ATT-15 status and OT are computed independently, so half-day WITH overtime is expressible", () => {
  // Whether this arises depends entirely on shift config; the demo shifts (threshold 240 <
  // ot_after 480) can never produce it. A plant that demands 8h for a full day but pays OT
  // after 7h can — and the engine must not quietly forbid a legal combination.
  const strict: ShiftDef = { ...SHIFT_A, halfDayThresholdMinutes: 480, otAfterMinutes: 420 };
  const d = processAttendanceDay(dayA({ shift: strict }), [
    P("2026-06-15T06:00:00+05:30", "in"),
    P("2026-06-15T14:00:00+05:30", "out"),
  ]);
  assert.equal(d.status, "half", "450 worked minutes is under the 480 min full-day threshold");
  assert.ok(d.otHours > 0, "and 30 minutes beyond the 420 min OT threshold are still OT");
  assert.equal(d.payableUnits, 0.5);
});

/* ------------------------------ month roll-up ----------------------------- */

test("TC-ATT-16 Sanjay's June rolls up to 26 payable days out of 26 working days", () => {
  // §20.3: 25 present + 1 CL, 4 weekly-offs, 8 OT hours across the month.
  const days: AttendanceDayResult[] = [];
  const push = (over: Partial<AttendanceDayResult>): void => {
    days.push({
      attDate: "2026-06-01",
      status: "present",
      firstIn: null,
      lastOut: null,
      workedHours: 8,
      otHours: 0,
      lateMinutes: 0,
      lopUnits: 0,
      payableUnits: 1,
      exceptions: [],
      shiftCode: "A",
      ...over,
    });
  };
  for (let i = 0; i < 25; i += 1) push(i < 4 ? { otHours: 2 } : {});
  push({ status: "leave", payableUnits: 1, workedHours: 0 });
  for (let i = 0; i < 4; i += 1) push({ status: "off", payableUnits: 0, workedHours: 0 });

  const s = summariseMonth(days);
  assert.equal(s.workingDays, 26, "weekly-offs are excluded from the payroll denominator");
  assert.equal(s.paidDays, 26);
  assert.equal(s.lopDays, 0);
  assert.equal(s.otHours, 8);
  assert.equal(s.pendingRegularisations, 0);
});

test("TC-ATT-17 Imran's June carries one LOP day, which is what payroll prorates on", () => {
  const days: AttendanceDayResult[] = [];
  const mk = (status: AttendanceDayResult["status"], payable: number, lop: number): AttendanceDayResult => ({
    attDate: "2026-06-01",
    status,
    firstIn: null,
    lastOut: null,
    workedHours: 0,
    otHours: 0,
    lateMinutes: 0,
    lopUnits: lop,
    payableUnits: payable,
    exceptions: [],
    shiftCode: "B",
  });
  for (let i = 0; i < 23; i += 1) days.push(mk("present", 1, 0));
  days.push(mk("leave", 1, 0), mk("leave", 1, 0));
  days.push(mk("absent", 0, 1));
  for (let i = 0; i < 4; i += 1) days.push(mk("off", 0, 0));

  const s = summariseMonth(days);
  assert.equal(s.workingDays, 26);
  assert.equal(s.paidDays, 25, "25 of 26 — the figure that prorates 32,000 to 30,769");
  assert.equal(s.lopDays, 1);
});

test("TC-ATT-18 a month with an unresolved day reports it, so the lock can refuse", () => {
  const s = summariseMonth([
    {
      attDate: "2026-06-15",
      status: "pending_reg",
      firstIn: null,
      lastOut: null,
      workedHours: 0,
      otHours: 0,
      lateMinutes: 0,
      lopUnits: 0,
      payableUnits: 0,
      exceptions: ["missing out-punch"],
      shiftCode: "A",
    },
  ]);
  assert.equal(s.pendingRegularisations, 1);
});
