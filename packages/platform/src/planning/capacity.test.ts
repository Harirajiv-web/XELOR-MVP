import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { availableHours, computeLoad, explainRow, overloads, type WorkCentre } from "./capacity.js";
import { compareRules, scheduleOperations, type SchedulableOp } from "./dispatch.js";

/** WC-VMC01 from PLANNING §20.2/§20.7: one machine, two shifts, 85% utilisation, 90% efficiency. */
const VMC: WorkCentre = {
  id: "wc1",
  code: "WC-VMC01",
  name: "Vertical machining centre",
  machineCount: 1,
  shifts: [
    { hours: 8, days: [1, 2, 3, 4, 5, 6] },
    { hours: 8, days: [1, 2, 3, 4, 5] },
  ],
  utilisation: 0.85,
  efficiency: 0.9,
};

describe("available capacity", () => {
  it("is machines × shift hours × utilisation × efficiency, not machines × hours", () => {
    // 6 days × 8 h + 5 days × 8 h = 88 nominal → 88 × 0.85 × 0.90 = 67.32
    assert.equal(availableHours(VMC, "2026-W30"), 67.32);
  });

  it("planning at 100/100 overstates the week by a third", () => {
    const optimistic = availableHours({ ...VMC, utilisation: 1, efficiency: 1 }, "2026-W30");
    assert.equal(optimistic, 88);
    assert.ok(optimistic - availableHours(VMC, "2026-W30") > 20, "the gap is a week's worth of a second machine");
  });

  it("a maintenance block removes REAL machine hours, not nominal ones", () => {
    // §20.7: a 4 h PM block costs 4 × 0.85 × 0.90 = 3.06 effective hours.
    const withPm = availableHours({ ...VMC, downtime: { "2026-W30": 4 } }, "2026-W30");
    assert.equal(withPm, 64.26);
    assert.ok(Math.abs(67.32 - withPm - 3.06) < 0.01);
  });

  it("a holiday inside the week reduces capacity", () => {
    const h = availableHours(VMC, "2026-W30", { workingDays: [1, 2, 3, 4, 5, 6], holidays: ["2026-07-22"] });
    assert.ok(h < 67.32);
  });
});

describe("capacity load", () => {
  const routings = [
    { itemId: "imp", operationSeq: 10, workCentreId: "wc1", setupHours: 0.667, runHoursPerUnit: 0.367 },
  ];

  it("charges setup once per order and run time per unit", () => {
    const rows = computeLoad({
      workCentres: [VMC],
      routings,
      orders: [{ ref: "PLO-1", itemId: "imp", itemCode: "IMPELLER-KV50", qty: 18, bucket: "2026-W30" }],
      buckets: ["2026-W30"],
    });
    const c = rows[0]!.contributions[0]!;
    assert.equal(c.setupHours, 0.67);
    assert.equal(c.runHours, 6.61); // 0.367 × 18
    // Charging setup per unit would make this 12 h instead of 7.28 — small batches would
    // look impossible, which is exactly the market this ERP is for.
    assert.equal(c.hours, 7.28);
  });

  it("colours a week by how close to the wall it is", () => {
    const heavy = computeLoad({
      workCentres: [VMC],
      routings,
      orders: [{ ref: "PLO-2", itemId: "imp", itemCode: "IMPELLER-KV50", qty: 200, bucket: "2026-W30" }],
      buckets: ["2026-W30"],
    });
    assert.equal(heavy[0]!.status, "red");
    assert.ok(heavy[0]!.overloadHours > 0);
    assert.match(explainRow(heavy[0]!), /more than it has/);

    const light = computeLoad({
      workCentres: [VMC],
      routings,
      orders: [{ ref: "PLO-3", itemId: "imp", itemCode: "IMPELLER-KV50", qty: 18, bucket: "2026-W30" }],
      buckets: ["2026-W30"],
    });
    assert.equal(light[0]!.status, "green");
  });

  it("work loaded onto a shut centre is not 'infinitely loaded' — it is impossible", () => {
    const shut: WorkCentre = { ...VMC, id: "wc9", code: "WC-SHUT", shifts: [] };
    const rows = computeLoad({
      workCentres: [shut],
      routings: [{ itemId: "imp", operationSeq: 10, workCentreId: "wc9", setupHours: 1, runHoursPerUnit: 1 }],
      orders: [{ ref: "PLO-4", itemId: "imp", itemCode: "IMPELLER-KV50", qty: 5, bucket: "2026-W30" }],
      buckets: ["2026-W30"],
    });
    assert.equal(rows[0]!.status, "no_capacity");
    assert.equal(rows[0]!.loadPct, null, "a percentage of zero capacity is not a number");
    assert.match(explainRow(rows[0]!), /shut that week/);
  });

  it("lists the weeks a planner has to act on, worst first", () => {
    const rows = computeLoad({
      workCentres: [VMC],
      routings,
      orders: [
        { ref: "A", itemId: "imp", itemCode: "I", qty: 200, bucket: "2026-W30" },
        { ref: "B", itemId: "imp", itemCode: "I", qty: 400, bucket: "2026-W31" },
      ],
      buckets: ["2026-W30", "2026-W31"],
    });
    const o = overloads(rows);
    assert.equal(o[0]!.bucket, "2026-W31");
  });

  it("an idle week is idle, not 0% loaded", () => {
    const rows = computeLoad({ workCentres: [VMC], routings, orders: [], buckets: ["2026-W30"] });
    assert.equal(rows[0]!.status, "idle");
  });
});

describe("tier-1 finite scheduling", () => {
  const OPS: SchedulableOp[] = [
    { orderRef: "WO-1", itemCode: "PUMP-KV50", seq: 10, workCentreId: "assy", workCentreCode: "WC-ASSY", hours: 8, dueDate: "2026-07-24" },
    { orderRef: "WO-1", itemCode: "PUMP-KV50", seq: 20, workCentreId: "test", workCentreCode: "WC-TEST", hours: 4, dueDate: "2026-07-24" },
    { orderRef: "WO-2", itemCode: "PUMP-KV80", seq: 10, workCentreId: "assy", workCentreCode: "WC-ASSY", hours: 16, dueDate: "2026-07-22" },
    { orderRef: "WO-3", itemCode: "SPARE", seq: 10, workCentreId: "assy", workCentreCode: "WC-ASSY", hours: 2, dueDate: "2026-07-31" },
  ];
  const OPTS = { today: "2026-07-20", hoursPerDay: 8 };

  it("EDD puts the earliest due date first", () => {
    const r = scheduleOperations(OPS, { ...OPTS, rule: "EDD" });
    const assy = r.operations.filter((o) => o.workCentreId === "assy");
    assert.equal(assy[0]!.orderRef, "WO-2", "WO-2 is due 22 Jul, ahead of WO-1's 24 Jul");
  });

  it("SPT clears the short job first and starves the long one", () => {
    const r = scheduleOperations(OPS, { ...OPTS, rule: "SPT" });
    const assy = r.operations.filter((o) => o.workCentreId === "assy");
    assert.equal(assy[0]!.orderRef, "WO-3", "the 2-hour job goes first under SPT");
  });

  it("respects operation precedence — 20 cannot start before 10 finishes", () => {
    const r = scheduleOperations(OPS, { ...OPTS, rule: "EDD" });
    const op10 = r.operations.find((o) => o.orderRef === "WO-1" && o.seq === 10)!;
    const op20 = r.operations.find((o) => o.orderRef === "WO-1" && o.seq === 20)!;
    assert.ok(op20.startDate > op10.startDate || (op20.startDate === op10.startDate && op20.startHourOfDay >= op10.endHourOfDay));
  });

  it("never puts two operations on one machine at the same time", () => {
    const r = scheduleOperations(OPS, { ...OPTS, rule: "EDD" });
    const assy = r.operations
      .filter((o) => o.workCentreId === "assy")
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startHourOfDay - b.startHourOfDay);
    for (let i = 1; i < assy.length; i += 1) {
      const prev = assy[i - 1]!;
      const cur = assy[i]!;
      assert.ok(
        cur.startDate > prev.endDate || (cur.startDate === prev.endDate && cur.startHourOfDay >= prev.endHourOfDay),
        `${cur.orderRef} overlaps ${prev.orderRef}`,
      );
    }
  });

  it("will not start an operation before its material arrives", () => {
    const withMaterial = OPS.map((o) => (o.orderRef === "WO-3" ? { ...o, earliestStart: "2026-07-29" } : o));
    const r = scheduleOperations(withMaterial, { ...OPTS, rule: "SPT" });
    const wo3 = r.operations.find((o) => o.orderRef === "WO-3")!;
    assert.ok(wo3.startDate >= "2026-07-29", `started ${wo3.startDate}, before material`);
  });

  it("skips the weekly off — no work happens on Sunday", () => {
    const long: SchedulableOp[] = [
      { orderRef: "WO-L", itemCode: "X", seq: 10, workCentreId: "a", workCentreCode: "A", hours: 48, dueDate: "2026-08-30" },
    ];
    const r = scheduleOperations(long, OPTS);
    // 48 h at 8 h/day is six working days from Mon 20 Jul: 20, 21, 22, 23, 24, Sat 25 —
    // and the finish lands on Mon 27 because Sunday carries no hours. On a calendar-day
    // count it would finish on the 26th, a day the plant is shut.
    assert.equal(r.operations[0]!.endDate, "2026-07-27");
  });

  it("reports lateness rather than pretending the week fits", () => {
    const r = scheduleOperations(OPS, { ...OPTS, rule: "EDD" });
    assert.equal(typeof r.totalTardinessDays, "number");
    assert.match(r.note, /proposal|late/);
  });

  it("compares the rules so a planner picks with their eyes open", () => {
    const c = compareRules(OPS, OPTS);
    assert.equal(c.length, 3);
    assert.deepEqual(c.map((x) => x.rule), ["EDD", "SPT", "CR"]);
    // EDD is the rule that minimises maximum lateness; it should never be beaten on
    // tardiness by SPT on this set.
    const edd = c.find((x) => x.rule === "EDD")!;
    const spt = c.find((x) => x.rule === "SPT")!;
    assert.ok(edd.totalTardinessDays <= spt.totalTardinessDays);
  });

  it("schedules a locked operation where it sits, and works around it", () => {
    const locked = OPS.map((o) => (o.orderRef === "WO-2" ? { ...o, locked: true, lockedStart: "2026-07-23" } : o));
    const r = scheduleOperations(locked, { ...OPTS, rule: "EDD" });
    assert.equal(r.operations.find((o) => o.orderRef === "WO-2")!.startDate, "2026-07-23");
  });
});
