import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clipIntervalHours,
  computeReliability,
  downtimePareto,
  inputsDigest,
  startedWithin,
  type DowntimeInterval,
  type KpiWindow,
} from "./reliability.js";

/**
 * TC-16-03 — the hand-computed golden fixture from MAINTENANCE §11.5 / §16.3, copied
 * verbatim. Asset AST-PNQ-VMC-01, July 2026, shift calendar PNQ-2SHIFT = 2 shifts x 8 h x
 * 26 working days = 416.0 scheduled hours.
 *
 * Interval #2 crosses midnight on purpose: it is the fixture that catches an engine which
 * counts a stop twice, or attributes it to the wrong day.
 */
const JULY: KpiWindow = { from: "2026-07-01", to: "2026-07-31" };

const dt = (
  id: string,
  startedAt: string,
  endedAt: string | null,
  kind: "unplanned" | "planned" = "unplanned",
  reasonCode = "mechanical",
  mwoId: string | null = null,
): DowntimeInterval => ({
  id,
  assetId: "vmc-01",
  startedAt,
  endedAt,
  kind,
  productionImpacting: true,
  reasonCode,
  mwoId,
});

// IST instants, written as the +05:30 offsets the shop floor sees.
const GOLDEN: DowntimeInterval[] = [
  dt("d1", "2026-07-06T09:40:00+05:30", "2026-07-06T13:10:00+05:30", "unplanned", "mechanical", "MWO-104"),
  dt("d2", "2026-07-17T22:15:00+05:30", "2026-07-18T01:45:00+05:30", "unplanned", "hydraulic", "MWO-118"),
  dt("d3", "2026-07-28T14:00:00+05:30", "2026-07-28T15:30:00+05:30", "unplanned", "electrical", "MWO-147"),
  dt("d4", "2026-07-11T07:00:00+05:30", "2026-07-11T11:00:00+05:30", "planned", "planned_pm", "MWO-PM"),
];

test("TC-16-03 — MTBF, MTTR and availability match the hand computation to the decimal", () => {
  const r = computeReliability({ window: JULY, scheduledHours: 416.0, intervals: GOLDEN });

  assert.equal(r.downtimeUnplannedHours, 8.5, "3.5 + 3.5 + 1.5");
  assert.equal(r.downtimePlannedHours, 4.0, "the PM window is reported, not counted as a failure");
  assert.equal(r.failureCount, 3);
  assert.equal(r.operatingHours, 407.5);
  assert.equal(r.mtbfHours, 135.833);
  assert.equal(r.mttrHours, 2.833);
  assert.equal(r.availabilityPct, 97.9567);
});

test("TC-16-03 — the availability identity holds: mtbf/(mtbf+mttr) equals operating/scheduled", () => {
  const r = computeReliability({ window: JULY, scheduledHours: 416.0, intervals: GOLDEN });
  const direct = Math.round(((407.5 / 416) * 100 + Number.EPSILON) * 10000) / 10000;
  assert.equal(r.availabilityPct, direct, "the two tiles can never tell different stories");
  // computeReliability throws if these ever diverge — assert the guard is live.
  assert.equal(direct, 97.9567);
});

test("TC-16-03b — the midnight-crossing stop counts once, in the month it began", () => {
  const r = computeReliability({ window: JULY, scheduledHours: 416.0, intervals: GOLDEN });
  assert.equal(r.inputs.failureRowIds.length, 3);
  assert.ok(r.inputs.failureRowIds.includes("d2"));
  assert.equal(clipIntervalHours(GOLDEN[1]!, JULY), 3.5);
});

test("TC-16-03c — a window with no failures returns NULL, never 0 and never infinity", () => {
  const r = computeReliability({ window: JULY, scheduledHours: 416.0, intervals: [GOLDEN[3]!] });
  assert.equal(r.failureCount, 0);
  assert.equal(r.mtbfHours, null);
  assert.equal(r.mttrHours, null);
  assert.equal(r.availabilityPct, 100, "no unplanned stops means the machine was available all its scheduled hours");
  assert.ok(r.notes.some((n) => n.includes("undefined, not zero")));
});

test("TC-16-03d — no shift calendar means NULL availability, not an assumed 24x7", () => {
  const r = computeReliability({ window: JULY, scheduledHours: null, intervals: GOLDEN });
  assert.equal(r.scheduledHours, null);
  assert.equal(r.operatingHours, null);
  assert.equal(r.mtbfHours, null);
  assert.equal(r.availabilityPct, null);
  assert.equal(r.mttrHours, 2.833, "MTTR needs only downtime and failures, so it survives");
  assert.ok(r.notes.some((n) => n.includes("Needs shift calendar")));
});

test("TC-16-01c — a stop spanning month end contributes to both months and totals exactly once", () => {
  const spanning = dt("dx", "2026-07-31T22:00:00+05:30", "2026-08-01T03:00:00+05:30");
  const july = computeReliability({ window: JULY, scheduledHours: 416, intervals: [spanning] });
  const august = computeReliability({
    window: { from: "2026-08-01", to: "2026-08-31" },
    scheduledHours: 416,
    intervals: [spanning],
  });
  assert.equal(july.downtimeUnplannedHours, 2.0);
  assert.equal(august.downtimeUnplannedHours, 3.0);
  assert.equal(july.downtimeUnplannedHours + august.downtimeUnplannedHours, 5.0);
  // ... and it is ONE failure, in the month it started.
  assert.equal(july.failureCount, 1);
  assert.equal(august.failureCount, 0);
});

test("an interval entirely outside the window contributes nothing", () => {
  const june = dt("dj", "2026-06-10T09:00:00+05:30", "2026-06-10T12:00:00+05:30");
  assert.equal(clipIntervalHours(june, JULY), 0);
  assert.equal(startedWithin(june, JULY), false);
  const r = computeReliability({ window: JULY, scheduledHours: 416, intervals: [june] });
  assert.equal(r.failureCount, 0);
  assert.equal(r.downtimeUnplannedHours, 0);
});

test("an OPEN interval accrues hours up to the cutoff — a machine down right now is still down", () => {
  const open = dt("do", "2026-07-20T09:00:00+05:30", null);
  const r = computeReliability({
    window: { ...JULY, openIntervalCutoff: "2026-07-20T12:00:00+05:30" },
    scheduledHours: 416,
    intervals: [open],
  });
  assert.equal(r.downtimeUnplannedHours, 3.0);
  assert.equal(r.failureCount, 1);
});

test("a non-production-impacting unplanned stop is recorded but is not a failure", () => {
  const cosmetic: DowntimeInterval = {
    ...dt("dc", "2026-07-09T09:00:00+05:30", "2026-07-09T11:00:00+05:30"),
    productionImpacting: false,
  };
  const r = computeReliability({ window: JULY, scheduledHours: 416, intervals: [cosmetic] });
  assert.equal(r.failureCount, 0, "availability measures production impact, not every inconvenience");
  assert.equal(r.downtimeUnplannedHours, 0);
});

test("TC-16-03e — PM compliance keeps the missed occurrence in the denominator", () => {
  const occ = (id: string, dueDate: string, completedAt: string | null, status: "completed" | "missed") => ({
    id,
    dueDate,
    graceDays: 3,
    status,
    completedAt,
  });
  const r = computeReliability({
    window: JULY,
    scheduledHours: 416,
    intervals: [],
    occurrences: [
      occ("o1", "2026-07-05", "2026-07-05T10:00:00Z", "completed"),
      occ("o2", "2026-07-10", "2026-07-13T10:00:00Z", "completed"), // exactly on the grace edge
      occ("o3", "2026-07-15", "2026-07-16T10:00:00Z", "completed"),
      occ("o4", "2026-07-20", "2026-07-22T10:00:00Z", "completed"),
      occ("o5", "2026-07-25", null, "missed"),
    ],
  });
  assert.equal(r.pmDueCount, 5);
  assert.equal(r.pmCompletedInGrace, 4);
  assert.equal(r.pmCompliancePct, 80.0, "5 due, 4 in grace — the missed one is not quietly dropped");
});

test("a service completed one day past its grace window does not count as compliant", () => {
  const r = computeReliability({
    window: JULY,
    scheduledHours: 416,
    intervals: [],
    occurrences: [
      { id: "o1", dueDate: "2026-07-10", graceDays: 3, status: "completed", completedAt: "2026-07-14T09:00:00Z" },
    ],
  });
  assert.equal(r.pmCompliancePct, 0);
});

test("schedule adherence counts planned work only, and only against its planned window", () => {
  const r = computeReliability({
    window: JULY,
    scheduledHours: 416,
    intervals: [],
    plannedMwos: [
      { id: "m1", plannedEnd: "2026-07-05T12:00:00Z", actualEnd: "2026-07-05T11:00:00Z" },
      { id: "m2", plannedEnd: "2026-07-12T12:00:00Z", actualEnd: "2026-07-13T09:00:00Z" },
      { id: "m3", plannedEnd: "2026-07-20T12:00:00Z", actualEnd: null },
      { id: "m4", plannedEnd: null, actualEnd: "2026-07-22T09:00:00Z" }, // a breakdown: excluded
    ],
  });
  assert.equal(r.scheduleAdherencePct, 33.3333, "1 of the 3 planned jobs finished inside its window");
});

test("the inputs digest is stable under row order and changes when a row joins", () => {
  const a = inputsDigest({
    downtimeRowIds: ["d1", "d2", "d3"],
    occurrenceIds: [],
    mwoIds: [],
    window: JULY,
    scheduledHours: 416,
  });
  const b = inputsDigest({
    downtimeRowIds: ["d3", "d1", "d2"],
    occurrenceIds: [],
    mwoIds: [],
    window: JULY,
    scheduledHours: 416,
  });
  const c = inputsDigest({
    downtimeRowIds: ["d1", "d2", "d3", "d4"],
    occurrenceIds: [],
    mwoIds: [],
    window: JULY,
    scheduledHours: 416,
  });
  assert.equal(a, b, "same rows, same digest — a snapshot proves it is reproducible");
  assert.notEqual(a, c);
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
});

test("the Pareto ranks by hours and carries the row ids behind every bar", () => {
  const rows = downtimePareto(GOLDEN, JULY, { mechanical: "Mechanical", hydraulic: "Hydraulic" });
  assert.equal(rows[0]!.key, "planned_pm");
  assert.equal(rows[0]!.hours, 4.0);
  assert.equal(rows[1]!.hours, 3.5);
  assert.deepEqual(
    rows.find((r) => r.key === "electrical")!.ids,
    ["d3"],
    "a chart bar that cannot be drilled into is decoration",
  );
});
