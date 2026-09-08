import { expect, test, type Page, type Route } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await Promise.race([
    page.locator("#username").waitFor({ state: "visible" }),
    page
      .getByRole("button", { name: "Enter the factory intelligence" })
      .waitFor({ state: "visible" }),
  ]);
  if (await page.locator("#username").isVisible()) {
    await page.getByRole("textbox", { name: "Username or email" }).fill("hari");
    await page.getByRole("textbox", { name: "Password" }).fill("1234");
    await page.getByRole("button", { name: "Enter XELOR" }).click();
  }
}

const intelligence = {
  schemaVersion: "xelor-factory-intelligence.v1",
  scenario: {
    key: "3s-workroom-poc",
    label: "3S turning-centre breakdown and governed alternate review",
    mockOnly: true,
  },
  customer: { code: "3S", name: "3S Precision Parts Pvt Ltd" },
  source: {
    system: "ONYX Factory Connect",
    transport: "versioned_http_projection",
    upstreamSchemaVersion: "factory-operations.v1",
    evidenceMode: "simulator",
    mockOnly: true,
    endpointPath: "/api/v1/integration/factory/views/operations",
  },
  freshness: {
    generatedAt: "2026-08-20T10:00:00.000Z",
    freshestObservedAt: "2026-08-20T09:59:30.000Z",
    oldestObservedAt: "2026-08-20T09:59:20.000Z",
    ageSeconds: 30,
    oldestAgeSeconds: 40,
    maxAgeSeconds: 86_400,
    staleMachineCount: 0,
    status: "fresh",
  },
  summary: {
    machineCount: 2,
    constrainedMachineCount: 1,
    assignedJobCount: 1,
    atRiskJobCount: 1,
    proposedAlternateCount: 1,
    recomputedAverageOeePct: 67.5,
  },
  constraints: [
    {
      assetCode: "AST-PNQ-TRN-01",
      workCenterCode: "WC-LTH01",
      state: "faulted",
      severity: "critical",
      reason: "AST-PNQ-TRN-01 is faulted; its configured job is at risk.",
      evidenceRef: "asset:AST-PNQ-TRN-01:2026-08-20T09:59:20.000Z",
    },
  ],
  oee: [
    {
      assetCode: "AST-PNQ-TRN-01",
      assetName: "CNC turning centre",
      workCenterCode: "WC-LTH01",
      state: "faulted",
      shift: {
        code: "B",
        label: "Shift B · deterministic POC scenario",
        source: "configured_3s_mock_shift",
      },
      observedAt: "2026-08-20T09:59:20.000Z",
      evidenceStale: false,
      actualCycleSeconds: 1320,
      upstream: {
        status: "complete",
        availabilityPct: 75,
        performancePct: 90,
        qualityPct: 100,
        oeePct: 67.5,
        warnings: [],
      },
      analysis: {
        status: "complete",
        customerCode: "3S",
        assetRef: "maintenance-trn-01",
        assetCode: "AST-PNQ-TRN-01",
        workCenterCode: "WC-LTH01",
        window: {
          label: "Shift B · deterministic POC scenario",
          start: null,
          end: null,
        },
        rawInputs: {
          plannedProductionSeconds: 28_800,
          runSeconds: 21_600,
          idealCycleSeconds: 60,
          totalCount: 324,
          goodCount: 324,
          rejectCount: 0,
        },
        formulas: {
          availability: "runSeconds / plannedProductionSeconds",
          performance: "(idealCycleSeconds * totalCount) / runSeconds",
          quality: "goodCount / totalCount",
          oee: "availability * performance * quality",
        },
        availability: { percent: 75 },
        performance: { percent: 90 },
        quality: { percent: 100 },
        oee: { percent: 67.5 },
        freshness: { status: "fresh", ageSeconds: 30 },
        confidence: { score: 92, band: "high" },
        warnings: [],
      },
    },
  ],
  assignments: [
    {
      assignmentId: "assignment-3s-lathe",
      assetCode: "AST-PNQ-TRN-01",
      workCenterCode: "WC-LTH01",
      machineState: "faulted",
      job: {
        jobId: "POC-REPLAY-MO-2627-00003-OP10",
        orderRef: "MO-2627-00003",
        itemCode: "CMP-PX4-SFT",
        operationCode: "OP-10",
        operationName: "Turn and grind shaft",
        quantity: 45,
        dueAt: "2026-08-23T18:00:00+05:30",
        priority: 20,
      },
      operator: {
        employeeCode: "3S-0009",
        name: "Vikram Jadhav",
        skill: "CNC Operator · Turning",
        shiftCode: "B",
        availability: "configured_available",
        basis: "Configured 3S mock assignment, not a live roster write.",
      },
    },
  ],
  atRiskWork: [
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
  replan: {
    suppliedProposals: [],
    validation: {
      status: "feasible",
      affectedOperations: [{}],
      blockedOperations: [],
    },
    recommendation: {
      jobId: "POC-REPLAY-MO-2627-00003-OP10",
      orderRef: "MO-2627-00003",
      fromAssetCode: "AST-PNQ-TRN-01",
      toAssetCode: "AST-PNQ-LTH-02",
      fromWorkCenterCode: "WC-LTH01",
      toWorkCenterCode: "WC-LTH02",
      deterministicRule: "explicit_alternate_then_asset_code",
      reason: "AST-PNQ-LTH-02 is the configured fresh, idle alternate.",
      status: "proposed",
    },
    statement:
      "ONYX supplied WC-LTH01 → WC-LTH02; XELOR matched it to the configured qualified, available alternate and prepared a review-only request.",
  },
  mission: {
    graphKey: "factory.intelligence-recovery",
    graphVersion: 1,
    goal:
      "Explain the current 3S turning-centre constraint and pause before one planning-review request.",
    approvalBoundary:
      "Approval creates one attributable review work item for ONYX Planning; it does not publish a schedule or contact a machine.",
  },
  boundary: {
    analysisOnly: true,
    onyxRemainsScheduleSourceOfTruth: true,
    scheduleMutationPerformed: false,
    autoPublished: false,
    physicalCommandIssued: false,
    statement:
      "XELOR recomputed a configured 3S mock snapshot. ONYX remains the schedule source of truth; no schedule was changed and no physical controller was contacted.",
  },
};

function runDetail(status: "waiting_approval" | "completed", decision?: "approved" | "rejected") {
  const pending = status === "waiting_approval";
  return {
    run: {
      id: "0192a8c0-1000-7000-8000-000000000001",
      graphKey: "factory.intelligence-recovery",
      graphVersion: 1,
      goal: intelligence.mission.goal,
      status,
      providerMode: "stub",
      consumedSteps: pending ? 4 : 8,
      maxSteps: 14,
      createdAt: "2026-08-20T10:01:00.000Z",
      completedAt: pending ? null : "2026-08-20T10:02:00.000Z",
      input: { scenarioKey: "3s-workroom-poc" },
      output: null,
      errorCode: null,
      errorMessage: null,
    },
    nodes: Array.from({ length: 9 }, (_, index) => ({
      id: `node-run-${index}`,
      nodeId: `node-${index}`,
      nodeName: `Factory recovery step ${index + 1}`,
      nodeKind: index === 4 ? "approval" : "capability",
      agentKey: index === 4 ? null : "KILN",
      capabilityKey: null,
      status: pending && index >= 4 ? (index === 4 ? "waiting_approval" : "queued") : decision === "rejected" && index > 4 ? "skipped" : "succeeded",
      attempt: 1,
      output: null,
      errorCode: null,
      errorMessage: null,
      startedAt: "2026-08-20T10:01:00.000Z",
      completedAt: pending && index >= 4 ? null : "2026-08-20T10:02:00.000Z",
    })),
    approvals: [
      {
        id: "0192a8c0-1000-7000-8000-000000000010",
        runId: "0192a8c0-1000-7000-8000-000000000001",
        nodeId: "human-replan-approval",
        title: "Approve the 3S alternate-work-centre review request",
        risk: "medium",
        proposedAction:
          "Create one attributable ONYX Planning review work item. This does not publish a schedule or contact a machine.",
        status: pending ? "pending" : "decided",
        decision: pending ? null : decision,
        decisionNote: pending ? null : "Reviewed in browser test.",
        createdAt: "2026-08-20T10:01:30.000Z",
        decidedAt: pending ? null : "2026-08-20T10:02:00.000Z",
      },
    ],
    events: [{ id: "event-1", sequence: 1, eventType: "run.started", nodeId: null, payload: {}, createdAt: "2026-08-20T10:01:00.000Z" }],
    checkpoints: [{ id: "checkpoint-1", sequence: 1, reason: "wave_completed", createdAt: "2026-08-20T10:01:20.000Z" }],
  };
}

async function mockFactoryFlow(
  page: Page,
  factorySnapshot: typeof intelligence = intelligence,
): Promise<{ decision: () => string | null }> {
  let decision: string | null = null;
  await page.route("**/api/v1/agent-os/factory-intelligence", (route) =>
    route.fulfill({ status: 200, json: { data: factorySnapshot } }),
  );
  await page.route("**/api/v1/agent-os/runs?*", (route) =>
    route.fulfill({ status: 200, json: { data: [] } }),
  );
  await page.route("**/api/v1/agent-os/runs", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 201, json: { data: runDetail("waiting_approval") } });
  });
  await page.route("**/api/v1/agent-os/approvals/*/decide", async (route) => {
    const body = route.request().postDataJSON() as { decision: "approved" | "rejected" };
    decision = body.decision;
    await route.fulfill({ status: 201, json: { data: runDetail("completed", body.decision) } });
  });
  await page.route("**/api/v1/agent-os/actions?*", (route: Route) =>
    route.fulfill({
      status: 200,
      json: {
        data:
          decision === "approved"
            ? [
                {
                  id: "action-1",
                  runId: "0192a8c0-1000-7000-8000-000000000001",
                  nodeId: "axle-dispatch-review",
                  approvalNodeId: "human-replan-approval",
                  agentKey: "AXLE",
                  targetDomain: "onyx.planning",
                  actionType: "factory_replan_request",
                  title: "Review 3S WC-LTH01 to WC-LTH02 recovery",
                  risk: "medium",
                  executionMode: "governed_work_item",
                  payload: {},
                  status: "dispatched",
                  approvedBy: "demo-approver",
                  dispatchedAt: "2026-08-20T10:02:00.000Z",
                },
              ]
            : [],
      },
    }),
  );
  return { decision: () => decision };
}

test("Factory Intelligence explains the 3S mock from desktop to mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  const mixed = structuredClone(intelligence);
  mixed.freshness.status = "mixed";
  mixed.freshness.staleMachineCount = 1;
  mixed.freshness.oldestObservedAt = "2026-08-18T09:59:30.000Z";
  mixed.freshness.oldestAgeSeconds = 172_830;
  mixed.summary.machineCount = 3;
  await mockFactoryFlow(page, mixed);
  await page.goto("/agentos/factory-intelligence");

  await expect(page.getByRole("heading", { name: "3S Factory Intelligence" })).toBeVisible();
  await expect(page.getByText("Configured mock", { exact: true })).toBeVisible();
  await expect(page.getByText("Mixed freshness", { exact: true })).toBeVisible();
  await expect(page.getByText(/1 of 3 rows flagged stale/)).toBeVisible();
  await expect(page.getByText("67.5%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Vikram Jadhav", { exact: false })).toBeVisible();
  await expect(page.getByText("MO-2627-00003", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("WC-LTH01", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("WC-LTH02", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh ONYX evidence" })).toBeVisible();
  await expect(page.getByText(/no schedule was changed/i)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("rejection stops before dispatch while approval records exactly one ONYX review item", async ({ page }) => {
  await signIn(page);
  const state = await mockFactoryFlow(page);
  await page.goto("/agentos/factory-intelligence");

  await page.getByRole("button", { name: "Start governed recovery" }).click();
  await expect(page.getByRole("button", { name: "Recovery already active" })).toBeDisabled();
  await page.getByLabel("Decision note").fill("Evidence does not justify this review.");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByText(/No work item dispatched/)).toBeVisible();
  expect(state.decision()).toBe("rejected");

  await page.getByRole("button", { name: "Start governed recovery" }).click();
  await page.getByLabel("Decision note").fill("Approve one bounded ONYX planning review.");
  await page.getByRole("button", { name: "Approve planning review" }).click();
  await expect(page.getByText(/1 approval-linked factory_replan_request/)).toBeVisible();
  expect(state.decision()).toBe("approved");
});
