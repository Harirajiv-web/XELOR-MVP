import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@ind-core/platform";
import {
  fetchOnyxFactoryOperations,
  onyxFactoryRequestHeaders,
  parseOnyxFactoryOperations,
  resolveOnyxFactoryOperationsPath,
  resolveOnyxFactoryOrigin,
} from "./onyx-factory-intelligence.http-adapter.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

function fixture(): Record<string, unknown> {
  return {
    schemaVersion: "factory-operations.v1",
    demo: {
      mockOnly: true,
      scenario: "3s-workroom-poc",
      boundary:
        "Configured 3S simulator evidence only. No physical controller or schedule publisher is connected.",
    },
    customer: {
      tenantId: "0192a8c0-0000-7000-8000-000000000001",
      code: "3S",
      name: "3S Precision Parts",
    },
    source: {
      system: "ONYX Factory Connect",
      projection: "factory_operations",
      evidenceMode: "simulator",
    },
    freshness: {
      generatedAt: "2026-08-20T10:00:00.000Z",
      freshestObservedAt: "2026-08-20T09:58:00.000Z",
      staleMachineCount: 0,
    },
    summary: {
      machineCount: 2,
      constrainedMachineCount: 1,
      assignedJobCount: 1,
      atRiskJobCount: 1,
      replanProposalCount: 1,
      averageOeePct: 67.5,
    },
    machines: [
      {
        assetCode: "AST-PNQ-TRN-01",
        name: "Turning centre 01",
        assetKind: "cnc_turning_centre",
        siteCode: "PNQ",
        zoneCode: "MACHINE-SHOP",
        maintenanceAssetRef: "AST-PNQ-TRN-01",
        workCenterRef: "wc-lth01",
        workCenterCode: "WC-LTH01",
        state: "faulted",
        safetyState: "safe",
        observedAt: "2026-08-20T09:57:00.000Z",
        evidenceAgeSeconds: 180,
        evidenceStale: false,
        adapterMode: "simulator",
        mockOnly: true,
        actualCycleSeconds: 67,
        oee: {
          shift: { code: "SHIFT-A", label: "Shift A", source: "configured_mock_snapshot" },
          status: "complete",
          availabilityPct: 75,
          performancePct: 90,
          qualityPct: 100,
          oeePct: 67.5,
          inputs: {
            plannedProductionSeconds: 28_800,
            runSeconds: 21_600,
            idealCycleSeconds: 60,
            totalCount: 324,
            goodCount: 324,
            rejectCount: 0,
          },
          warnings: [],
        },
        assignment: {
          assignmentId: "assignment-3s-01",
          status: "assigned",
          evidenceType: "configured_mock_snapshot",
          job: {
            jobId: "JOB-3S-PX400-SHAFT",
            orderRef: "SO-3S-0042",
            itemCode: "CMP-PX4-SFT",
            operationCode: "OP-20",
            operationName: "Turn pump shaft",
            quantity: 120,
            dueAt: "2026-08-22T12:00:00.000Z",
            priority: 1,
          },
          operator: {
            employeeRef: "employee-42",
            employeeCode: "EMP-042",
            name: "Asha Patil",
            skill: "CNC turning",
            shiftCode: "SHIFT-A",
            availability: "assigned",
            basis: "configured 3S POC assignment",
          },
        },
      },
      {
        assetCode: "AST-PNQ-TRN-02",
        name: "Turning centre 02",
        assetKind: "cnc_turning_centre",
        siteCode: "PNQ",
        zoneCode: "MACHINE-SHOP",
        maintenanceAssetRef: "AST-PNQ-TRN-02",
        workCenterRef: "wc-lth02",
        workCenterCode: "WC-LTH02",
        state: "idle",
        safetyState: "safe",
        observedAt: "2026-08-20T09:58:00.000Z",
        evidenceAgeSeconds: 120,
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
        jobId: "JOB-3S-PX400-SHAFT",
        orderRef: "SO-3S-0042",
        itemCode: "CMP-PX4-SFT",
        operationCode: "OP-20",
        operationName: "Turn pump shaft",
        assetCode: "AST-PNQ-TRN-01",
        state: "faulted",
        reason: "The assigned turning centre is faulted.",
        operatorCode: "EMP-042",
        dueAt: "2026-08-22T12:00:00.000Z",
      },
    ],
    replanProposals: [
      {
        proposalId: "proposal-3s-01",
        jobId: "JOB-3S-PX400-SHAFT",
        orderRef: "SO-3S-0042",
        fromAssetCode: "AST-PNQ-TRN-01",
        fromWorkCenterCode: "WC-LTH01",
        toAssetCode: "AST-PNQ-TRN-02",
        toWorkCenterCode: "WC-LTH02",
        status: "proposed",
        reason: "The routing names WC-LTH02 as the explicit alternate and its asset is idle.",
        deterministicRule: "explicit_alternate_then_asset_code",
        requiresHumanApproval: true,
        autoPublished: false,
      },
    ],
  };
}

function assertCode(error: unknown, code: string): boolean {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, code);
  return true;
}

test("demo auth is explicit and uses only the existing ONYX isolated-demo credential", () => {
  assert.deepEqual(
    onyxFactoryRequestHeaders({ ONYX_PUBLIC_DEMO: "true" }),
    {
      accept: "application/json",
      "x-xelor-public-demo": "investor-presentation",
    },
  );
  assert.throws(
    () => onyxFactoryRequestHeaders({ ONYX_PUBLIC_DEMO: "false" }),
    (error) => assertCode(error, "ONYX_FACTORY_AUTH_REQUIRED"),
  );
});

test("service-token mode sends a bearer credential without a demo fallback", () => {
  const headers = onyxFactoryRequestHeaders({ ONYX_SERVICE_TOKEN: "  service-secret  " });
  assert.deepEqual(headers, {
    accept: "application/json",
    authorization: "Bearer service-secret",
  });
  assert.equal("x-xelor-public-demo" in headers, false);
});

test("origin and operations path keep endpoint changes isolated", () => {
  assert.equal(resolveOnyxFactoryOrigin({}), "http://localhost:3000");
  assert.throws(
    () => resolveOnyxFactoryOrigin({ NODE_ENV: "production" }),
    (error) => assertCode(error, "ONYX_FACTORY_ORIGIN_REQUIRED"),
  );
  assert.equal(
    resolveOnyxFactoryOrigin({ ONYX_API_BASE_URL: "https://onyx.example.test" }),
    "https://onyx.example.test",
  );
  assert.equal(
    resolveOnyxFactoryOperationsPath({}),
    "/api/v1/integration/factory/views/operations",
  );
  assert.equal(
    resolveOnyxFactoryOperationsPath({ ONYX_FACTORY_OPERATIONS_PATH: "/api/v2/factory/operations" }),
    "/api/v2/factory/operations",
  );
  assert.throws(
    () => resolveOnyxFactoryOrigin({ ONYX_API_BASE_URL: "https://secret@example.test/api" }),
    (error) => assertCode(error, "ONYX_FACTORY_ORIGIN_INVALID"),
  );
});

test("validates, links and freshness-checks factory-operations.v1", () => {
  const parsed = parseOnyxFactoryOperations(fixture(), { now: NOW });
  assert.equal(parsed.demo.scenario, "3s-workroom-poc");
  assert.equal(parsed.machines[0]?.assignment?.operator.employeeCode, "EMP-042");
  assert.equal(parsed.replanProposals[0]?.toWorkCenterCode, "WC-LTH02");
});

test("preserves explainable OEE anomalies and counts only actionable proposals", () => {
  const value = fixture();
  const machines = value.machines as Array<Record<string, unknown>>;
  const oee = machines[0]?.oee as Record<string, unknown>;
  oee.availabilityPct = 105;
  oee.performancePct = 118;
  oee.oeePct = 112;
  (value.summary as Record<string, unknown>).averageOeePct = 112;
  (value.replanProposals as unknown[]).push({
    proposalId: "proposal-3s-blocked",
    jobId: "JOB-3S-PX400-SHAFT",
    orderRef: "SO-3S-0042",
    fromAssetCode: "AST-PNQ-TRN-01",
    fromWorkCenterCode: "WC-LTH01",
    toAssetCode: null,
    toWorkCenterCode: null,
    status: "blocked",
    reason: "No additional qualified alternate is configured.",
    deterministicRule: "explicit_alternate_then_asset_code",
    requiresHumanApproval: true,
    autoPublished: false,
  });

  const parsed = parseOnyxFactoryOperations(value, { now: NOW });
  assert.equal(parsed.machines[0]?.oee?.performancePct, 118);
  assert.equal(parsed.replanProposals.length, 2);
  assert.equal(parsed.summary.replanProposalCount, 1);
});

test("accepts a distinct target asset within the same work centre", () => {
  const value = fixture();
  const proposal = (value.replanProposals as Array<Record<string, unknown>>)[0]!;
  proposal.toWorkCenterCode = "WC-LTH01";
  assert.doesNotThrow(() => parseOnyxFactoryOperations(value, { now: NOW }));
});

test("allows honest stale rows but rejects a stale-count mismatch", () => {
  const stale = fixture();
  const machines = stale.machines as Array<Record<string, unknown>>;
  machines[0]!.observedAt = "2026-08-18T09:57:00.000Z";
  machines[0]!.evidenceAgeSeconds = 172_980;
  machines[0]!.evidenceStale = true;
  (stale.freshness as Record<string, unknown>).staleMachineCount = 1;

  const parsed = parseOnyxFactoryOperations(stale, { now: NOW });
  assert.equal(parsed.freshness.staleMachineCount, 1);
  assert.equal(parsed.machines[0]?.evidenceStale, true);

  (stale.freshness as Record<string, unknown>).staleMachineCount = 0;
  assert.throws(
    () => parseOnyxFactoryOperations(stale, { now: NOW }),
    (error) => assertCode(error, "ONYX_FACTORY_STALE_COUNT_INVALID"),
  );
});

test("accepts nullable OEE inputs, nullable reported freshest-at and safe additive fields", () => {
  const value = fixture();
  const machines = value.machines as Array<Record<string, unknown>>;
  const oee = machines[0]!.oee as Record<string, unknown>;
  const inputs = oee.inputs as Record<string, unknown>;
  inputs.runSeconds = null;
  inputs.sourceCounter = "simulated";
  machines[0]!.adapterMode = "edge-shadow";
  machines[0]!.state = "maintenance_window";
  machines[0]!.additionalEvidence = { adapter: "v2" };
  (value.source as Record<string, unknown>).evidenceMode = "mixed";
  (value.freshness as Record<string, unknown>).freshestObservedAt = null;
  (value.summary as Record<string, unknown>).constrainedMachineCount = 0;
  value.additiveProjectionField = "forward-compatible";

  const parsed = parseOnyxFactoryOperations(value, { now: NOW });
  assert.equal(parsed.machines[0]?.oee?.inputs.runSeconds, null);
  assert.equal(parsed.machines[0]?.adapterMode, "edge-shadow");
  assert.equal(parsed.machines[0]?.state, "maintenance_window");
  assert.equal(parsed.source.evidenceMode, "mixed");
  assert.equal(parsed.freshness.freshestObservedAt, null);
});

test("fails closed on stale projection, missing/future machine evidence, malformed or inconsistent data", () => {
  const stale = fixture();
  (stale.freshness as Record<string, unknown>).generatedAt = "2026-08-20T09:40:00.000Z";
  assert.throws(
    () => parseOnyxFactoryOperations(stale, { now: NOW }),
    (error) => assertCode(error, "ONYX_FACTORY_PROJECTION_STALE"),
  );

  const wrongVersion = fixture();
  wrongVersion.schemaVersion = "factory-operations.v2";
  assert.throws(
    () => parseOnyxFactoryOperations(wrongVersion, { now: NOW }),
    (error) => assertCode(error, "ONYX_FACTORY_CONTRACT_INVALID"),
  );

  const inconsistent = fixture();
  (inconsistent.summary as Record<string, unknown>).machineCount = 99;
  assert.throws(
    () => parseOnyxFactoryOperations(inconsistent, { now: NOW }),
    (error) => assertCode(error, "ONYX_FACTORY_SUMMARY_INVALID"),
  );

  const missing = fixture();
  (missing.machines as Array<Record<string, unknown>>)[0]!.observedAt = null;
  assert.throws(
    () => parseOnyxFactoryOperations(missing, { now: NOW }),
    (error) => assertCode(error, "ONYX_FACTORY_EVIDENCE_MISSING"),
  );

  const future = fixture();
  (future.machines as Array<Record<string, unknown>>)[0]!.observedAt =
    "2026-08-20T10:02:00.000Z";
  assert.throws(
    () => parseOnyxFactoryOperations(future, { now: NOW }),
    (error) => assertCode(error, "ONYX_FACTORY_EVIDENCE_FUTURE"),
  );
});

test("HTTP adapter sends the isolated auth contract and never exposes tokens in failures", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
    });
    return new Response(JSON.stringify(fixture()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const result = await fetchOnyxFactoryOperations({
    env: { ONYX_PUBLIC_DEMO: "true" },
    fetcher,
    now: NOW,
  });
  assert.equal(result.customer.name, "3S Precision Parts");
  assert.equal(calls[0]?.url, "http://localhost:3000/api/v1/integration/factory/views/operations");
  assert.equal(calls[0]?.headers.get("x-xelor-public-demo"), "investor-presentation");
  assert.equal(calls[0]?.headers.has("authorization"), false);

  const refused = (async () => new Response("no", { status: 401 })) as typeof fetch;
  await assert.rejects(
    () =>
      fetchOnyxFactoryOperations({
        env: { ONYX_SERVICE_TOKEN: "do-not-disclose-this-token" },
        fetcher: refused,
        now: NOW,
      }),
    (error) => {
      assertCode(error, "ONYX_FACTORY_UPSTREAM_REFUSED");
      assert.doesNotMatch((error as Error).message, /do-not-disclose/);
      return true;
    },
  );
});
