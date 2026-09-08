import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@ind-core/platform";
import type {
  OnyxFactoryIntelligencePort,
  OnyxFactoryOperationsSnapshot,
} from "../ports/onyx-factory-intelligence.port.js";
import { FactoryIntelligenceService } from "./factory-intelligence.service.js";

function snapshot(): OnyxFactoryOperationsSnapshot {
  return {
    schemaVersion: "factory-operations.v1",
    demo: {
      mockOnly: true,
      scenario: "3s-workroom-poc",
      boundary:
        "Configured 3S simulator evidence only; no physical controller or schedule publisher is connected.",
    },
    customer: {
      tenantId: "0192a8c0-0000-7000-8000-000000000001",
      code: "3S",
      name: "3S Precision Parts Pvt Ltd",
    },
    source: {
      system: "ONYX Factory Connect",
      projection: "factory_operations",
      evidenceMode: "simulator",
    },
    freshness: {
      generatedAt: "2026-08-20T10:00:00.000Z",
      freshestObservedAt: "2026-08-20T09:59:30.000Z",
      staleMachineCount: 0,
    },
    summary: {
      machineCount: 2,
      constrainedMachineCount: 1,
      assignedJobCount: 1,
      atRiskJobCount: 1,
      replanProposalCount: 1,
      averageOeePct: 1,
    },
    machines: [
      {
        assetCode: "AST-PNQ-TRN-01",
        name: "CNC turning centre",
        assetKind: "machine",
        siteCode: "PUNE-01",
        zoneCode: "MACHINE-SHOP",
        maintenanceAssetRef: "maintenance-trn-01",
        workCenterRef: "work-centre-lth01",
        workCenterCode: "WC-LTH01",
        state: "faulted",
        safetyState: "normal",
        observedAt: "2026-08-20T09:59:20.000Z",
        evidenceAgeSeconds: 40,
        evidenceStale: false,
        adapterMode: "simulator",
        mockOnly: true,
        actualCycleSeconds: 75,
        oee: {
          shift: {
            code: "B",
            label: "Shift B · deterministic POC scenario",
            source: "configured_3s_mock_shift",
          },
          status: "complete",
          // Deliberately wrong upstream percentages prove XELOR recomputes from raw inputs.
          availabilityPct: 1,
          performancePct: 1,
          qualityPct: 1,
          oeePct: 1,
          inputs: {
            plannedProductionSeconds: 28_800,
            runSeconds: 21_600,
            idealCycleSeconds: 60,
            totalCount: 324,
            goodCount: 324,
            rejectCount: 0,
          },
          warnings: ["Upstream percentages intentionally differ in this test fixture."],
        },
        assignment: {
          assignmentId: "assignment-3s-lathe",
          status: "assigned",
          evidenceType: "configured_mock_snapshot",
          job: {
            jobId: "POC-REPLAY-MO-2627-00003-OP10",
            orderRef: "MO-2627-00003",
            itemCode: "CMP-PX4-SFT",
            operationCode: "OP-10",
            operationName: "Turn and grind shaft",
            quantity: 120,
            dueAt: "2026-08-23T18:00:00+05:30",
            priority: 20,
          },
          operator: {
            employeeRef: "employee-3s-0009",
            employeeCode: "3S-0009",
            name: "Vikram Jadhav",
            skill: "CNC Operator · Turning",
            shiftCode: "B",
            availability: "configured_available",
            basis: "Configured 3S mock assignment, not a live roster write.",
          },
        },
      },
      {
        assetCode: "AST-PNQ-LTH-02",
        name: "CNC lathe 2",
        assetKind: "machine",
        siteCode: "PUNE-01",
        zoneCode: "MACHINE-SHOP",
        maintenanceAssetRef: null,
        workCenterRef: "work-centre-lth02",
        workCenterCode: "WC-LTH02",
        state: "idle",
        safetyState: "normal",
        observedAt: "2026-08-20T09:59:30.000Z",
        evidenceAgeSeconds: 30,
        evidenceStale: false,
        adapterMode: "simulator",
        mockOnly: true,
        actualCycleSeconds: null,
        oee: null,
        assignment: null,
      },
    ],
    atRiskJobs: [
      {
        jobId: "POC-REPLAY-MO-2627-00003-OP10",
        orderRef: "MO-2627-00003",
        itemCode: "CMP-PX4-SFT",
        operationCode: "OP-10",
        operationName: "Turn and grind shaft",
        assetCode: "AST-PNQ-TRN-01",
        state: "faulted",
        reason: "AST-PNQ-TRN-01 is faulted; its configured job is at risk.",
        operatorCode: "3S-0009",
        dueAt: "2026-08-23T18:00:00+05:30",
      },
    ],
    replanProposals: [
      {
        proposalId: "POC-REPLAY-MO-2627-00003-OP10:AST-PNQ-TRN-01:AST-PNQ-LTH-02",
        jobId: "POC-REPLAY-MO-2627-00003-OP10",
        orderRef: "MO-2627-00003",
        fromAssetCode: "AST-PNQ-TRN-01",
        fromWorkCenterCode: "WC-LTH01",
        toAssetCode: "AST-PNQ-LTH-02",
        toWorkCenterCode: "WC-LTH02",
        status: "proposed",
        reason: "AST-PNQ-LTH-02 is the configured fresh, idle alternate.",
        deterministicRule: "explicit_alternate_then_asset_code",
        requiresHumanApproval: true,
        autoPublished: false,
      },
    ],
  };
}

function serviceFor(value: OnyxFactoryOperationsSnapshot): FactoryIntelligenceService {
  const port: OnyxFactoryIntelligencePort = {
    operationsPath: () => "/api/v1/integration/factory/views/operations",
    evidenceFreshnessThresholdSeconds: () => 86_400,
    readOperations: async () => value,
  };
  return new FactoryIntelligenceService(port);
}

test("recomputes OEE and validates ONYX's explicit 3S lathe proposal without mutation", async () => {
  const value = snapshot();
  const before = structuredClone(value);
  const view = await serviceFor(value).overview();

  assert.deepEqual(value, before);
  assert.equal(view.oee[0]?.analysis.availability.percent, 75);
  assert.equal(view.oee[0]?.analysis.performance.percent, 90);
  assert.equal(view.oee[0]?.analysis.quality.percent, 100);
  assert.equal(view.oee[0]?.analysis.oee.percent, 67.5);
  assert.equal(
    view.oee[0]?.analysis.provenance.observedAt,
    "2026-08-20T09:59:20.000Z",
  );
  assert.equal(view.oee[0]?.analysis.freshness.ageSeconds, 40);
  assert.equal(view.oee[0]?.upstream.oeePct, 1);
  assert.equal(view.replan.validation.status, "feasible");
  assert.equal(view.replan.validation.proposals.length, 1);
  assert.deepEqual(view.replan.recommendation, {
    jobId: "POC-REPLAY-MO-2627-00003-OP10",
    orderRef: "MO-2627-00003",
    fromAssetCode: "AST-PNQ-TRN-01",
    toAssetCode: "AST-PNQ-LTH-02",
    fromWorkCenterCode: "WC-LTH01",
    toWorkCenterCode: "WC-LTH02",
    deterministicRule: "explicit_alternate_then_asset_code",
    reason: "AST-PNQ-LTH-02 is the configured fresh, idle alternate.",
    status: "proposed",
  });
  assert.equal(view.boundary.scheduleMutationPerformed, false);
  assert.equal(view.boundary.autoPublished, false);
  assert.equal(view.boundary.physicalCommandIssued, false);
});

test("reports mixed snapshot freshness while retaining an unrelated stale row", async () => {
  const value = snapshot();
  const unrelated = structuredClone(value.machines[1]!);
  unrelated.assetCode = "AST-PNQ-MILL-99";
  unrelated.name = "Configured historical mill";
  unrelated.workCenterRef = "work-centre-mill99";
  unrelated.workCenterCode = "WC-MILL99";
  unrelated.observedAt = "2026-08-18T09:59:30.000Z";
  unrelated.evidenceAgeSeconds = 172_830;
  unrelated.evidenceStale = true;
  value.machines = [...value.machines, unrelated];
  value.freshness.staleMachineCount = 1;
  value.summary.machineCount = 3;

  const view = await serviceFor(value).overview();
  assert.equal(view.freshness.status, "mixed");
  assert.equal(view.freshness.staleMachineCount, 1);
  assert.equal(view.freshness.oldestObservedAt, "2026-08-18T09:59:30.000Z");
  assert.equal(view.freshness.oldestAgeSeconds, 172_830);
  assert.ok(view.replan.recommendation);
});

test("nullable OEE inputs reach deterministic insufficient-evidence analysis", async () => {
  const value = snapshot();
  value.machines[0]!.oee!.inputs.runSeconds = null;
  const view = await serviceFor(value).overview();
  assert.equal(view.oee[0]?.analysis.status, "insufficient_data");
  assert.equal(view.oee[0]?.analysis.availability.percent, null);
});

test("actionability refuses an exact proposal whose current target evidence is stale", async () => {
  const value = snapshot();
  value.machines[1]!.evidenceStale = true;
  value.freshness.staleMachineCount = 1;
  const service = serviceFor(value);

  assert.equal((await service.overview()).replan.recommendation, null);
  await assert.rejects(
    () => service.actionableOverview("3s-workroom-poc"),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "FACTORY_INTELLIGENCE_NOT_ACTIONABLE");
      return true;
    },
  );
});

test("capability refuses to start when ONYX has no validated lathe recovery", async () => {
  const value = snapshot();
  value.machines[0]!.state = "running";
  value.summary.constrainedMachineCount = 0;
  value.summary.atRiskJobCount = 0;
  value.summary.replanProposalCount = 0;
  value.atRiskJobs = [];
  value.replanProposals = [];
  const service = serviceFor(value);

  const view = await service.overview();
  assert.equal(view.constraints.length, 0);
  assert.equal(view.replan.recommendation, null);
  await assert.rejects(
    () => service.actionableOverview("3s-workroom-poc"),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "FACTORY_INTELLIGENCE_NOT_ACTIONABLE");
      return true;
    },
  );
});

test("capability is bounded to the named 3S mock scenario", async () => {
  await assert.rejects(
    () => serviceFor(snapshot()).actionableOverview("another-factory"),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "FACTORY_INTELLIGENCE_SCENARIO_UNSUPPORTED");
      return true;
    },
  );
});
