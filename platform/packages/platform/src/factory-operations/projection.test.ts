import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FACTORY_OPERATIONS_SCHEMA_VERSION,
  FACTORY_REPLAN_RULE,
  projectFactoryOperations,
  type FactoryOperationsAssetInput,
} from "./projection.js";

const generatedAt = "2026-08-20T12:00:00.000Z";
const customer = {
  tenantId: "0192a8c0-0000-7000-8000-000000000001",
  code: "3S",
  name: "3S Precision Parts Pvt Ltd",
};

function asset(
  assetCode: string,
  state: string,
  options: {
    alternateAssetCodes?: string[];
    assigned?: boolean;
    stale?: boolean;
    workCenterCode?: string;
    observedAt?: string;
    workroom?: boolean;
  } = {},
): FactoryOperationsAssetInput {
  const assigned = options.assigned ?? false;
  return {
    assetCode,
    name: assetCode,
    assetKind: "machine",
    siteCode: "PUNE-01",
    zoneCode: "MACHINE-SHOP",
    maintenanceAssetRef: `maintenance:${assetCode}`,
    workCenterRef: `work-centre:${assetCode}`,
    state,
    safetyState: "normal",
    observedAt: options.observedAt ?? "2026-08-20T11:59:00.000Z",
    evidenceAgeSeconds: 60,
    evidenceStale: options.stale ?? false,
    adapterMode: "simulator",
    actualCycleSeconds: 2.15,
    goodCount: 30,
    rejectCount: 2,
    attributes: options.workroom === false
      ? {}
      : {
          workroom: {
            mockOnly: true,
            workCenterCode: options.workCenterCode ?? `WC-${assetCode}`,
            alternateAssetCodes: options.alternateAssetCodes ?? [],
            ...(assigned
              ? {
                  job: {
                    jobId: `JOB-${assetCode}`,
                    orderRef: "PO-2627-00002",
                    itemCode: "PMP-PX400",
                    operationCode: "VMC-MILL",
                    operationName: "Machine casing faces",
                    quantity: 40,
                    dueAt: "2026-08-22T17:00:00+05:30",
                    priority: 10,
                  },
                  operator: {
                    employeeRef: "0192a8c0-0025-7000-8000-000000000208",
                    employeeCode: "3S-0008",
                    name: "Sanjay Patil",
                    skill: "CNC VMC operator",
                    shiftCode: "A",
                    availability: "present_on_mock_shift",
                    basis: "Active 3S employee and configured Shift A POC assignment.",
                  },
                }
              : {}),
          },
        },
    stateEvidence: {
      mockShift: {
        code: "A",
        label: "Shift A · deterministic POC snapshot",
        source: "configured_3s_mock_shift",
        plannedProductionSeconds: 100,
        runSeconds: 80,
        idealCycleSeconds: 2,
      },
    },
  };
}

describe("Factory Operations projection", () => {
  it("publishes stable customer, provenance, freshness and formula-backed OEE", () => {
    const result = projectFactoryOperations({
      generatedAt,
      customer,
      assets: [asset("VMC-01", "running", { assigned: true })],
    });
    assert.equal(result.schemaVersion, FACTORY_OPERATIONS_SCHEMA_VERSION);
    assert.deepEqual(result.customer, customer);
    assert.deepEqual(result.source, {
      system: "ONYX Factory Connect",
      projection: "factory_operations",
      evidenceMode: "simulator",
    });
    assert.equal(result.freshness.generatedAt, generatedAt);
    assert.equal(result.freshness.freshestObservedAt, "2026-08-20T11:59:00.000Z");
    assert.equal(result.machines[0]!.oee?.oeePct, 60);
    assert.equal(result.machines[0]!.oee?.availabilityPct, 80);
    assert.equal(result.machines[0]!.assignment?.operator.employeeCode, "3S-0008");
  });

  it("excludes ordinary Factory Connect bindings from the Workroom contract", () => {
    const result = projectFactoryOperations({
      generatedAt,
      customer,
      assets: [asset("ROBOT-CELL-03", "blocked", { workroom: false }), asset("VMC-01", "running")],
    });
    assert.deepEqual(result.machines.map((machine) => machine.assetCode), ["VMC-01"]);
  });

  it("orders machines by asset code so database row order cannot change the response", () => {
    const result = projectFactoryOperations({
      generatedAt,
      customer,
      assets: [asset("VMC-02", "idle"), asset("LTH-01", "running"), asset("VMC-01", "running")],
    });
    assert.deepEqual(result.machines.map((machine) => machine.assetCode), ["LTH-01", "VMC-01", "VMC-02"]);
  });

  it("marks a configured job at risk when its assigned machine is constrained", () => {
    const result = projectFactoryOperations({
      generatedAt,
      customer,
      assets: [asset("VMC-01", "faulted", { assigned: true })],
    });
    assert.equal(result.summary.atRiskJobCount, 1);
    assert.deepEqual(result.atRiskJobs[0], {
      jobId: "JOB-VMC-01",
      orderRef: "PO-2627-00002",
      itemCode: "PMP-PX400",
      operationCode: "VMC-MILL",
      operationName: "Machine casing faces",
      assetCode: "VMC-01",
      state: "faulted",
      reason: "VMC-01 is faulted; its configured job is at risk.",
      operatorCode: "3S-0008",
      dueAt: "2026-08-22T17:00:00+05:30",
    });
  });

  it("proposes the first configured alternate by asset code and never auto-publishes", () => {
    const result = projectFactoryOperations({
      generatedAt,
      customer,
      assets: [
        asset("VMC-01", "faulted", {
          assigned: true,
          alternateAssetCodes: ["VMC-03", "VMC-02"],
          workCenterCode: "WC-VMC01",
        }),
        asset("VMC-03", "idle", { workCenterCode: "WC-VMC03" }),
        asset("VMC-02", "idle", { workCenterCode: "WC-VMC02" }),
      ],
    });
    assert.deepEqual(result.replanProposals[0], {
      proposalId: "JOB-VMC-01:VMC-01:VMC-02",
      jobId: "JOB-VMC-01",
      orderRef: "PO-2627-00002",
      fromAssetCode: "VMC-01",
      fromWorkCenterCode: "WC-VMC01",
      toAssetCode: "VMC-02",
      toWorkCenterCode: "WC-VMC02",
      status: "proposed",
      reason: "VMC-02 is the first fresh, idle asset in the configured alternate set.",
      deterministicRule: FACTORY_REPLAN_RULE,
      requiresHumanApproval: true,
      autoPublished: false,
    });
  });

  it("blocks replanning when every configured alternate is stale, busy or assigned", () => {
    const result = projectFactoryOperations({
      generatedAt,
      customer,
      assets: [
        asset("VMC-01", "faulted", {
          assigned: true,
          alternateAssetCodes: ["VMC-02", "VMC-03", "VMC-04"],
        }),
        asset("VMC-02", "idle", { stale: true }),
        asset("VMC-03", "running"),
        asset("VMC-04", "idle", { assigned: true }),
      ],
    });
    assert.equal(result.replanProposals[0]?.status, "blocked");
    assert.equal(result.replanProposals[0]?.toAssetCode, null);
    assert.equal(result.summary.replanProposalCount, 0);
  });

  it("does not invent risk or a replan while the assigned machine is running", () => {
    const result = projectFactoryOperations({
      generatedAt,
      customer,
      assets: [
        asset("VMC-01", "running", { assigned: true, alternateAssetCodes: ["VMC-02"] }),
        asset("VMC-02", "idle"),
      ],
    });
    assert.deepEqual(result.atRiskJobs, []);
    assert.deepEqual(result.replanProposals, []);
  });

  it("reports freshness and averages only complete OEE rows", () => {
    const incomplete = asset("VMC-03", "idle");
    incomplete.stateEvidence = {};
    const result = projectFactoryOperations({
      generatedAt,
      customer,
      assets: [
        asset("VMC-01", "running", { stale: true, observedAt: "2026-08-20T11:55:00.000Z" }),
        asset("VMC-02", "idle", { observedAt: "2026-08-20T11:59:30.000Z" }),
        incomplete,
      ],
    });
    assert.equal(result.freshness.staleMachineCount, 1);
    assert.equal(result.freshness.freshestObservedAt, "2026-08-20T11:59:30.000Z");
    assert.equal(result.summary.averageOeePct, 60);
  });

  it("is deterministic and does not mutate input evidence", () => {
    const assets = [asset("VMC-01", "faulted", { assigned: true, alternateAssetCodes: ["VMC-02"] }), asset("VMC-02", "idle")];
    const before = structuredClone(assets);
    const first = projectFactoryOperations({ generatedAt, customer, assets });
    const second = projectFactoryOperations({ generatedAt, customer, assets });
    assert.deepEqual(first, second);
    assert.deepEqual(assets, before);
  });
});
