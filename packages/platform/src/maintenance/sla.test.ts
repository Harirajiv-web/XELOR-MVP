import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breachedByMinutes,
  resolveSla,
  slaDeadlines,
  slaState,
  SlaMatrixMissing,
  type Criticality,
  type Priority,
  type Severity,
  type SlaMatrixRow,
} from "./sla.js";

/** The §4.C seeded default matrix, effective 01-Apr-2026 — as CONFIGURATION, which is the
 *  whole point: not one of these numbers appears in `sla.ts`. */
const M = (
  criticality: Criticality,
  severity: Severity,
  priority: Priority,
  respondMinutes: number,
  restoreMinutes: number,
  effectiveFrom = "2026-04-01",
): SlaMatrixRow => ({
  criticality,
  severity,
  priority,
  respondMinutes,
  restoreMinutes,
  escalateToRole: "maintenance_manager",
  effectiveFrom,
  effectiveTo: null,
});

const MATRIX: SlaMatrixRow[] = [
  M("A", "stopped", "P1", 15, 240),
  M("A", "degraded", "P2", 120, 1440),
  M("A", "cosmetic", "P3", 480, 4320),
  M("B", "stopped", "P2", 30, 480),
  M("B", "degraded", "P3", 240, 2880),
  M("B", "cosmetic", "P4", 1440, 10080),
  M("C", "stopped", "P3", 240, 1440),
  M("C", "degraded", "P4", 1440, 10080),
  M("C", "cosmetic", "P4", 1440, 20160),
];

test("TC-16-05 — the whole criticality x severity matrix derives the documented priority", () => {
  const expected: Array<[Criticality, Severity, Priority]> = [
    ["A", "stopped", "P1"],
    ["A", "degraded", "P2"],
    ["A", "cosmetic", "P3"],
    ["B", "stopped", "P2"],
    ["B", "degraded", "P3"],
    ["B", "cosmetic", "P4"],
    ["C", "stopped", "P3"],
    ["C", "degraded", "P4"],
    ["C", "cosmetic", "P4"],
  ];
  for (const [crit, sev, priority] of expected) {
    assert.equal(resolveSla(MATRIX, crit, sev, "2026-07-14").priority, priority, `${crit} x ${sev}`);
  }
});

test("the hero case: criticality A, machine stopped — P1, respond 15 minutes, restore 4 hours", () => {
  const sla = resolveSla(MATRIX, "A", "stopped", "2026-07-14");
  assert.equal(sla.priority, "P1");
  assert.equal(sla.respondMinutes, 15);
  assert.equal(sla.restoreMinutes, 240);

  const d = slaDeadlines("2026-07-14T09:32:04+05:30", sla);
  assert.equal(new Date(d.respondBy).toISOString(), "2026-07-14T04:17:04.000Z", "09:47:04 IST");
  assert.equal(new Date(d.restoreBy).toISOString(), "2026-07-14T08:02:04.000Z", "13:32:04 IST");
});

test("SLA is resolved AS OF the request date — a matrix edited later cannot restate it", () => {
  const revised: SlaMatrixRow[] = [
    { ...M("A", "stopped", "P1", 15, 240), effectiveTo: "2026-07-31" },
    M("A", "stopped", "P1", 10, 180, "2026-08-01"),
  ];
  assert.equal(resolveSla(revised, "A", "stopped", "2026-07-14").respondMinutes, 15);
  assert.equal(resolveSla(revised, "A", "stopped", "2026-08-14").respondMinutes, 10);
});

test("a missing matrix row REFUSES rather than guessing a deadline", () => {
  assert.throws(
    () => resolveSla([M("A", "stopped", "P1", 15, 240)], "B", "degraded", "2026-07-14"),
    (e: unknown) => e instanceof SlaMatrixMissing,
  );
});

test("the config ref names the exact row, so a disputed SLA is traceable", () => {
  assert.equal(
    resolveSla(MATRIX, "A", "stopped", "2026-07-14").configRef,
    "criticality_sla_matrix:A:stopped:2026-04-01",
  );
});

/* ------------------------------ chip colours ------------------------------ */

test("the SLA chip goes green, amber, red — and 'met' is decided by when the work happened", () => {
  const started = "2026-07-14T09:32:04+05:30";
  const due = "2026-07-14T09:47:04+05:30"; // 15 minutes

  assert.equal(slaState(due, "2026-07-14T09:33:00+05:30", null, started), "on_track");
  assert.equal(slaState(due, "2026-07-14T09:44:30+05:30", null, started), "at_risk", "last quarter of the window");
  assert.equal(slaState(due, "2026-07-14T09:50:00+05:30", null, started), "breached");
  assert.equal(slaState(due, "2026-07-14T09:50:00+05:30", "2026-07-14T09:36:00+05:30", started), "met");
  assert.equal(slaState(due, "2026-07-14T09:50:00+05:30", "2026-07-14T09:48:00+05:30", started), "breached");
});

test("a breach reports by how many minutes, because 'breached' alone is not actionable", () => {
  assert.equal(breachedByMinutes("2026-07-14T09:47:04+05:30", "2026-07-14T10:25:04+05:30"), 38);
  assert.ok(breachedByMinutes("2026-07-14T09:47:04+05:30", "2026-07-14T09:40:04+05:30") < 0);
});
