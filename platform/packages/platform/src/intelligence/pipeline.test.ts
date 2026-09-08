import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPipeline, type PipelinePhase, type PipelineStage, type StepFacts } from "./pipeline.js";

/**
 * The claim under test is the only one that matters for this file:
 *
 *   THE PIPELINE DESCRIBES WHAT HAPPENED, AND NOTHING ELSE.
 *
 * So most of these tests assert an ABSENCE. An observe step must not carry an `execute`. A
 * step that failed while reading the vendor master must not go on to claim it raised
 * anything. A step that was never approved must not show an approval. Those are the rows a
 * demo would be tempted to fill in, and each one of them would make the twelve true rows
 * worthless.
 *
 * The findings fixtures below are copied from the shapes the mission engine actually writes
 * in `mission.service.ts`. If a step's findings change, these tests are where the pipeline
 * finds out.
 */

const AT = "2026-07-20T09:15:00.000Z";

const step = (over: Partial<StepFacts> & { stepKey: string }): StepFacts => ({
  status: "succeeded",
  at: AT,
  evidence: [],
  findings: {},
  refusedReason: null,
  soNo: "SO-2627-00007",
  ...over,
});

const phases = (stages: readonly PipelineStage[]): PipelinePhase[] => stages.map((s) => s.phase);
const find = (stages: readonly PipelineStage[], p: PipelinePhase): PipelineStage | undefined =>
  stages.find((s) => s.phase === p);

/* ------------------------------------------------------ an observe step observes -- */

test("a material netting step reads and reasons, and never claims to have executed anything", () => {
  const stages = buildPipeline(step({
    stepKey: "materials",
    findings: {
      componentCount: 5,
      shortCount: 2,
      shortages: [
        { itemCode: "RAW-BLT-M8", shortQty: 775.51 },
        { itemCode: "CMP-PX4-SEAL", shortQty: 40 },
      ],
    },
  }));

  assert.ok(phases(stages).includes("collect"));
  assert.ok(phases(stages).includes("analyse"));
  assert.equal(find(stages, "execute"), undefined);
  assert.equal(find(stages, "update"), undefined);
  assert.equal(find(stages, "approve"), undefined);

  // The numbers come out of the findings, not out of a sentence somebody wrote.
  assert.match(find(stages, "analyse")!.detail!, /2 of 5 short/);
  assert.match(find(stages, "analyse")!.detail!, /776 RAW-BLT-M8/);
});

test("the stock read is attributed to Inventory, by name", () => {
  const stages = buildPipeline(step({ stepKey: "materials", findings: { componentCount: 5, shortCount: 0, shortages: [] } }));
  const collect = find(stages, "collect")!;
  assert.equal(collect.system, "Inventory · Stock");
  assert.equal(collect.sourceKind, "phase1-erp");
});

test("capacity is labelled as a stand-in, because no MES is connected", () => {
  const stages = buildPipeline(step({ stepKey: "capacity", findings: { capacityHeadroom: 0.85, productionDays: 6 } }));
  const collect = find(stages, "collect")!;
  assert.equal(collect.sourceKind, "simulated-api");
  assert.match(collect.system, /no MES connected/);
  // 6 working days at 85% headroom is 8, and the stage says so rather than saying "85%".
  assert.match(find(stages, "analyse")!.detail!, /stretches to 8/);
});

/* ------------------------------------------------------------- sources, honestly -- */

test("seeded supplier terms are marked as a stand-in and say why", () => {
  const stages = buildPipeline(step({ stepKey: "sourcing", findings: { optionCount: 7 } }));
  const context = find(stages, "context")!;
  assert.equal(context.sourceKind, "simulated-api");
  assert.match(context.detail!, /Phase 1 holds no price or lead-time master/);
});

test("an uploaded spreadsheet is marked as a file, and named", () => {
  const stages = buildPipeline(step({
    stepKey: "sourcing",
    findings: { optionCount: 4 },
    termsFrom: "spreadsheet",
    termsFile: "kaveri-price-list.xlsx",
  }));
  const context = find(stages, "context")!;
  assert.equal(context.sourceKind, "file");
  assert.match(context.system, /kaveri-price-list\.xlsx/);
});

/* ------------------------------------------------------------------ a failure -- */

test("a step that failed while reading does not go on to claim it acted", () => {
  const stages = buildPipeline(step({
    stepKey: "procure",
    status: "failed",
    refusedReason: "the plan names a vendor this tenant does not have",
    findings: {
      purchaseOrders: [],
      committed: [{ itemCode: "CMP-CAS50" }],
      totalValue: 0,
      unresolved: ["vendor 'General Supplies Co' (V-GEN) is not in this tenant's vendor master"],
      verified: false,
    },
  }));

  assert.equal(find(stages, "collect")!.status, "failed");
  assert.equal(find(stages, "execute"), undefined);
  assert.equal(find(stages, "verify"), undefined);
  assert.equal(find(stages, "update"), undefined);
  // The record always survives — it is how the failure is known at all.
  assert.equal(find(stages, "record")!.status, "completed");
  assert.equal(find(stages, "continue"), undefined);
});

test("a failed WRITE still shows the check that caught it", () => {
  const stages = buildPipeline(step({
    stepKey: "procure",
    status: "failed",
    findings: {
      purchaseOrders: [],
      committed: [{ itemCode: "CMP-CAS50" }],
      vendorCount: 1,
      totalValue: 0,
      verified: false,
      failure: "Meridian Metals & Alloys: vendor is inactive",
    },
  }));
  assert.equal(find(stages, "execute")!.status, "failed");
  // The verify genuinely ran — re-reading the table is how the step learned it had failed.
  assert.equal(find(stages, "verify")!.status, "failed");
  assert.equal(find(stages, "update"), undefined);
});

test("no released build sheet stops the arc, and says so once", () => {
  const stages = buildPipeline(step({
    stepKey: "engineering",
    status: "failed",
    refusedReason: "no released engineering revision",
    findings: { engineeringReady: false, componentLines: 0 },
    evidence: [{ source: "bom", provenance: "live", ref: "no active BOM for PMP-CP50", detail: "engineering has not released a structure" }],
  }));
  assert.equal(find(stages, "collect")!.status, "failed");
  assert.equal(find(stages, "continue"), undefined);
  assert.equal(find(stages, "record")!.detail, "no released engineering revision");
});

/* -------------------------------------------------------------------- a write -- */

test("a purchase commitment shows the documents by number, and the re-read that proved them", () => {
  const stages = buildPipeline(step({
    stepKey: "procure",
    findings: {
      purchaseOrders: [
        { poNo: "PO-2627-00014", vendorName: "Meridian Metals & Alloys", value: 92500 },
        { poNo: "PO-2627-00015", vendorName: "Atlas Alloys India", value: 40000 },
      ],
      committed: [{ itemCode: "CMP-CAS50" }, { itemCode: "CMP-SFT20" }],
      totalValue: 132500,
      vendorCount: 2,
      verified: true,
      failure: null,
    },
  }));

  assert.match(find(stages, "execute")!.detail!, /PO-2627-00014, PO-2627-00015/);
  assert.equal(find(stages, "verify")!.status, "completed");
  assert.equal(find(stages, "update")!.system, "Purchase · Purchase orders");
  assert.match(find(stages, "update")!.detail!, /Meridian Metals/);
  assert.ok(phases(stages).includes("continue"));
});

test("reserving nothing is a skip, not a success, and claims no state change", () => {
  const stages = buildPipeline(step({
    stepKey: "reserve",
    findings: { reserved: [], verified: true, totalReserved: 0 },
  }));
  assert.equal(find(stages, "execute")!.status, "skipped");
  assert.equal(find(stages, "update"), undefined);
});

test("a reservation whose postcondition failed does not claim Sales was updated", () => {
  const stages = buildPipeline(step({
    stepKey: "reserve",
    findings: { reserved: [{ line: "PMP-CP50", qty: 12 }], verified: false, totalReserved: 0 },
  }));
  assert.equal(find(stages, "execute")!.status, "completed");
  assert.equal(find(stages, "verify")!.status, "failed");
  assert.equal(find(stages, "update"), undefined);
});

/* ----------------------------------------------------------------- the human -- */

test("stopping for a person is an approval that requires review, and the arc waits", () => {
  const stages = buildPipeline(step({
    stepKey: "authorize",
    status: "waiting_approval",
    findings: { requiresApproval: true, approvalNo: "APR-2627-00003" },
    evidence: [{ source: "tenant policy", provenance: "seeded", ref: "autonomy envelope", detail: "the ₹84,000 premium exceeds the ₹20,000 this mission may commit alone" }],
  }));

  const approve = find(stages, "approve")!;
  assert.equal(approve.status, "requires_review");
  assert.equal(approve.sourceKind, "user-input");
  assert.match(approve.detail!, /APR-2627-00003/);
  assert.equal(find(stages, "continue")!.status, "waiting");
  assert.match(find(stages, "analyse")!.detail!, /₹84,000/);
});

test("proceeding without a human is recorded as approved by policy, and names the tier", () => {
  const stages = buildPipeline(step({
    stepKey: "authorize",
    findings: { requiresApproval: false, tier: "A3" },
    evidence: [{ detail: "premium Rs 0 is within the Rs 20,000 envelope" }],
  }));
  const approve = find(stages, "approve")!;
  assert.equal(approve.status, "approved");
  assert.match(approve.detail!, /A3/);
  assert.equal(find(stages, "continue")!.status, "completed");
});

/* ------------------------------------------------------------------- a retry -- */

test("a retry says it is a retry and carries the failure it is recovering from", () => {
  const stages = buildPipeline(step({
    stepKey: "procure",
    attempt: 2,
    previousFailure: "PURCHASE refused: vendor on credit hold",
    findings: {
      purchaseOrders: [{ poNo: "PO-2627-00016", vendorName: "Atlas Alloys India", value: 40000 }],
      committed: [{ itemCode: "CMP-SFT20" }],
      totalValue: 40000,
      vendorCount: 1,
      verified: true,
      failure: null,
    },
  }));

  const t = find(stages, "trigger")!;
  assert.equal(t.status, "retrying");
  assert.match(t.detail!, /attempt 2/);
  // The original failure is never swallowed — it is the first thing the pipeline says.
  assert.match(t.detail!, /vendor on credit hold/);
  assert.equal(find(stages, "execute")!.status, "completed");
});

/* ---------------------------------------------------------------- the closing -- */

test("closing verifies every action before it claims the commitment was met", () => {
  const stages = buildPipeline(step({
    stepKey: "close",
    findings: {
      orderedQty: 120, deliveredQty: 120,
      promisedDate: "2026-08-19", actualDate: "2026-08-14",
      marginPct: 24.9, targetMarginPct: 18,
      autonomousActions: 2, approvedActions: 1,
      planVersions: 2, actionsVerified: 3, actionsTotal: 3,
    },
  }));

  assert.equal(find(stages, "verify")!.status, "completed");
  assert.match(find(stages, "verify")!.detail!, /3 of 3/);
  assert.match(find(stages, "analyse")!.detail!, /2026-08-14 against 2026-08-19 promised/);
  // Nothing follows the close.
  assert.equal(find(stages, "continue"), undefined);
});

test("an unverified action fails the close, whatever the outcome says", () => {
  const stages = buildPipeline(step({
    stepKey: "close",
    status: "failed",
    findings: { orderedQty: 120, deliveredQty: 120, actionsVerified: 2, actionsTotal: 3, marginPct: 24.9, targetMarginPct: 18 },
  }));
  assert.equal(find(stages, "verify")!.status, "failed");
});

/* -------------------------------------------------------------- the invariants -- */

test("every stage carries the step's own server clock, and no other", () => {
  const stages = buildPipeline(step({ stepKey: "intake", findings: { objective: { orderQty: 120 }, orderValue: 1_740_000, lineCount: 1 } }));
  assert.ok(stages.length > 0);
  for (const s of stages) assert.equal(s.at, AT);
});

test("a step key this build does not know is described as unknown, not guessed at", () => {
  const stages = buildPipeline(step({ stepKey: "teleport" }));
  assert.deepEqual(phases(stages), ["trigger", "record"]);
  assert.equal(find(stages, "trigger")!.detail, "teleport");
});

test("the thirteen steps of the arc all produce a pipeline, and none of them is empty", () => {
  const arc = ["intake", "engineering", "materials", "capacity", "sourcing", "strategy", "critique",
    "authorize", "reserve", "procure", "workorder", "watch", "close"];
  for (const key of arc) {
    const stages = buildPipeline(step({ stepKey: key }));
    assert.ok(stages.length >= 2, `${key} produced ${stages.length} stage(s)`);
    // Every step is triggered by something and records what it did. Those two are universal.
    assert.equal(stages[0]!.phase, "trigger");
    assert.ok(phases(stages).includes("record"), `${key} did not record itself`);
  }
});

test("an approval that a person granted shows as approved, not as still waiting", () => {
  const stages = buildPipeline(step({
    stepKey: "authorize",
    status: "succeeded",
    findings: { requiresApproval: true, approvalNo: "APR-2627-00003" },
  }));
  const approve = find(stages, "approve")!;
  assert.equal(approve.status, "approved");
  assert.match(approve.detail!, /granted/);
  assert.equal(find(stages, "continue")!.status, "completed");
});

test("an approval that a person refused shows as refused, and nothing follows", () => {
  const stages = buildPipeline(step({
    stepKey: "authorize",
    status: "failed",
    findings: { requiresApproval: true, approvalNo: "APR-2627-00003" },
  }));
  assert.equal(find(stages, "approve")!.status, "failed");
  assert.equal(find(stages, "continue"), undefined);
});
