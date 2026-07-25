import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  describeHold,
  evaluateCompletionGate,
  holdStopsDowntimeClock,
  labourAmount,
  labourHours,
  requiresClosureApproval,
  resolveLabourRate,
  rollUpCost,
  LabourRateMissing,
  type CompletionGateInput,
  type LabourRateConfig,
} from "./work-order.js";

/* --------------------------- the completion gate --------------------------- */

const READY: CompletionGateInput = {
  mwoType: "breakdown",
  tasks: [
    { sequence: 1, instruction: "Isolate and lock out", isMandatory: true, completedAt: "2026-07-14T10:00:00Z" },
    { sequence: 2, instruction: "Replace pump seal", isMandatory: true, completedAt: "2026-07-14T11:00:00Z" },
    { sequence: 3, instruction: "Pressure-test coolant line at 4 bar", isMandatory: true, completedAt: "2026-07-14T12:00:00Z" },
  ],
  openDowntimeIds: [],
  failureModeId: "EXT-LEAK",
  failureCauseId: "SEAL-WEAR",
  detectionId: "OPR-OBS",
  requiresCompetentPerson: false,
  competentPersonRef: null,
  labourRowCount: 2,
};

test("a properly finished breakdown job passes the gate cleanly", () => {
  assert.deepEqual(evaluateCompletionGate(READY), []);
});

test("the gate reports EVERY unmet condition at once, not the first one it hits", () => {
  const failures = evaluateCompletionGate({
    ...READY,
    tasks: [...READY.tasks.slice(0, 2), { sequence: 3, instruction: "Pressure-test coolant line at 4 bar", isMandatory: true, completedAt: null }],
    openDowntimeIds: ["dt-118"],
    failureCauseId: null,
  });
  const gates = failures.map((f) => f.gate).sort();
  assert.deepEqual(gates, ["downtime_open", "failure_code_required", "mandatory_task_incomplete"]);

  const task = failures.find((f) => f.gate === "mandatory_task_incomplete")!;
  assert.equal(task.taskSeq, 3);
  assert.equal(task.instruction, "Pressure-test coolant line at 4 bar", "the technician gets a jump link, not a toast");

  const code = failures.find((f) => f.gate === "failure_code_required")!;
  assert.equal(code.field, "failure_cause_id");

  const dt = failures.find((f) => f.gate === "downtime_open")!;
  assert.match(dt.hint!, /handback/);
});

test("an optional task left blank does not block completion", () => {
  const failures = evaluateCompletionGate({
    ...READY,
    tasks: [...READY.tasks, { sequence: 4, instruction: "Photograph the housing", isMandatory: false, completedAt: null }],
  });
  assert.deepEqual(failures, []);
});

test("preventive work needs no failure code — demanding one teaches people to pick at random", () => {
  const failures = evaluateCompletionGate({
    ...READY,
    mwoType: "preventive",
    failureModeId: null,
    failureCauseId: null,
    detectionId: null,
  });
  assert.deepEqual(failures, []);
});

test("a statutory examination cannot be signed off without the competent person", () => {
  const failures = evaluateCompletionGate({
    ...READY,
    mwoType: "statutory",
    failureModeId: null,
    failureCauseId: null,
    detectionId: null,
    requiresCompetentPerson: true,
    competentPersonRef: null,
  });
  assert.equal(failures.length, 1);
  assert.equal(failures[0]!.gate, "competent_person_required");
});

test("a job with no labour on it is not a job", () => {
  const failures = evaluateCompletionGate({ ...READY, labourRowCount: 0 });
  assert.deepEqual(failures.map((f) => f.gate), ["no_labour_recorded"]);
});

/* ------------------------------- lifecycle -------------------------------- */

test("the MWO state machine allows only the documented moves", () => {
  assert.equal(canTransition("assigned", "in_progress"), true);
  assert.equal(canTransition("in_progress", "on_hold"), true);
  assert.equal(canTransition("on_hold", "in_progress"), true);
  assert.equal(canTransition("in_progress", "completed"), true);
  assert.equal(canTransition("completed", "closed"), true);
  assert.equal(canTransition("completed", "in_progress"), true, "reopening is allowed until closure");

  assert.equal(
    canTransition("on_hold", "on_hold"),
    true,
    "changing the hold REASON is the moment the machine goes back to production",
  );

  assert.equal(canTransition("assigned", "completed"), false, "no skipping the work");
  assert.equal(canTransition("closed", "in_progress"), false, "terminal is terminal");
  assert.equal(canTransition("cancelled", "assigned"), false);
  assert.equal(canTransition("on_hold", "completed"), false, "resume before you finish");
});

test("only one hold reason stops the downtime clock, and the UI says which", () => {
  assert.equal(holdStopsDowntimeClock("awaiting_spare"), false);
  assert.equal(holdStopsDowntimeClock("awaiting_vendor"), false);
  assert.equal(holdStopsDowntimeClock("awaiting_permit"), false);
  assert.equal(holdStopsDowntimeClock("other"), false);
  assert.equal(
    holdStopsDowntimeClock("awaiting_production_window"),
    true,
    "downtime measures the asset's availability, not the paperwork's status",
  );
  assert.match(describeHold("awaiting_spare"), /keeps running/);
  assert.match(describeHold("awaiting_production_window"), /clock stops/);
});

/* --------------------------- labour & costing ------------------------------ */

const RATES: LabourRateConfig[] = [
  { trade: "fitter", grade: "T1", ratePerHour: 380, otMultiplier: 1.5, effectiveFrom: "2026-04-01", effectiveTo: null, source: "local_config" },
  { trade: "fitter", grade: "T2", ratePerHour: 420, otMultiplier: 1.5, effectiveFrom: "2026-04-01", effectiveTo: null, source: "local_config" },
  { trade: "electrician", grade: "T2", ratePerHour: 460, otMultiplier: 1.5, effectiveFrom: "2026-04-01", effectiveTo: null, source: "local_config" },
  { trade: "contractor", grade: null, ratePerHour: 550, otMultiplier: 1.5, effectiveFrom: "2026-04-01", effectiveTo: null, source: "local_config" },
];

test("labour hours are derived from the two timestamps, never typed", () => {
  assert.equal(labourHours("2026-07-14T09:44:00+05:30", "2026-07-14T12:56:00+05:30"), 3.2);
  assert.equal(labourHours("2026-07-14T11:05:00+05:30", "2026-07-14T12:05:00+05:30"), 1.0);
});

test("the as-of rate governs: a raise dated after the work date cannot restate a closed job", () => {
  const withRaise: LabourRateConfig[] = [
    { ...RATES[1]!, effectiveTo: "2026-08-31" },
    { ...RATES[1]!, ratePerHour: 465, effectiveFrom: "2026-09-01" },
  ];
  assert.equal(resolveLabourRate(withRaise, "fitter", "T2", "2026-07-14").ratePerHour, 420);
  assert.equal(resolveLabourRate(withRaise, "fitter", "T2", "2026-09-14").ratePerHour, 465);
});

test("HRM's published rate is preferred over the local fallback", () => {
  const both: LabourRateConfig[] = [
    ...RATES,
    { trade: "fitter", grade: "T2", ratePerHour: 437.5, otMultiplier: 1.5, effectiveFrom: "2026-04-01", effectiveTo: null, source: "hrm" },
  ];
  const r = resolveLabourRate(both, "fitter", "T2", "2026-07-14");
  assert.equal(r.source, "hrm");
  assert.equal(r.ratePerHour, 437.5, "HRM owns what a person costs; this module holds a fallback, not a copy");
});

test("a trade with no rate refuses rather than valuing labour at zero", () => {
  assert.throws(() => resolveLabourRate(RATES, "welder", null, "2026-07-14"), (e: unknown) => e instanceof LabourRateMissing);
});

test("overtime applies the configured multiplier and nothing else", () => {
  assert.equal(labourAmount(2, 420), 840);
  assert.equal(labourAmount(2, 420, true, 1.5), 1260);
});

/**
 * §20.4, the demo's closing arithmetic: Balaji 3.2 h at Rs 420 plus Nitin 1.0 h at Rs 460
 * is Rs 1,804 of labour; three spare lines valued BY INVENTORY total Rs 4,676; nothing
 * external. Rs 6,480 — below the Rs 25,000 threshold, so the manager closes it directly.
 */
test("TC-16-06 — the story arc's cost rolls up to the blueprint's Rs 6,480 exactly", () => {
  const balaji = labourAmount(3.2, resolveLabourRate(RATES, "fitter", "T2", "2026-07-14").ratePerHour);
  const nitin = labourAmount(1.0, resolveLabourRate(RATES, "electrician", "T2", "2026-07-14").ratePerHour);
  assert.equal(balaji, 1344);
  assert.equal(nitin, 460);

  const snapshot = rollUpCost({
    labour: [{ amount: balaji }, { amount: nitin }],
    spares: [{ valuedAmount: 2840 }, { valuedAmount: 1180 }, { valuedAmount: 656 }],
    external: [],
  });
  assert.equal(snapshot.costLabour, 1804);
  assert.equal(snapshot.costSpares, 4676);
  assert.equal(snapshot.costExternal, 0);
  assert.equal(snapshot.costTotal, 6480);

  const approval = requiresClosureApproval(snapshot, false, 25000);
  assert.equal(approval.required, false);
});

test("TC-16-06 — the roll-up is idempotent: running it five times changes nothing", () => {
  const input = {
    labour: [{ amount: 1344 }, { amount: 460 }],
    spares: [{ valuedAmount: 2840 }, { valuedAmount: 1180 }, { valuedAmount: 656 }],
    external: [{ amount: 22500 }],
  };
  const runs = Array.from({ length: 5 }, () => rollUpCost(input));
  for (const r of runs) assert.deepEqual(r, runs[0]);
  assert.equal(runs[0]!.costTotal, 28980);
});

test("a labour row still running contributes nothing until it is stopped", () => {
  const snapshot = rollUpCost({ labour: [{ amount: 1344 }, { amount: null }], spares: [], external: [] });
  assert.equal(snapshot.costLabour, 1344);
});

test("closure approval is required above the threshold, and ALWAYS for safety work", () => {
  const big = rollUpCost({ labour: [{ amount: 12000 }], spares: [{ valuedAmount: 20000 }], external: [] });
  assert.equal(requiresClosureApproval(big, false, 25000).required, true);
  assert.match(requiresClosureApproval(big, false, 25000).reason!, /cost_above_threshold/);

  const small = rollUpCost({ labour: [{ amount: 400 }], spares: [], external: [] });
  assert.equal(requiresClosureApproval(small, false, 25000).required, false);
  assert.equal(
    requiresClosureApproval(small, true, 25000).reason,
    "safety_related",
    "a cheap job that hurt someone still goes to the plant head",
  );
});

test("exactly at the threshold does not require approval — the band is 'above', not 'at'", () => {
  const exact = rollUpCost({ labour: [{ amount: 25000 }], spares: [], external: [] });
  assert.equal(requiresClosureApproval(exact, false, 25000).required, false);
});
