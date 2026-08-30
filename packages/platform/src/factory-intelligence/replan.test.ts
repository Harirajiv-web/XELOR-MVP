import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  BreakdownReplanInput,
  FactorySchedulableOperation,
  OnyxReplanProposal,
} from "./contracts.js";
import { simulateBreakdownReplan } from "./replan.js";

const LTH01_OUTAGE = {
  assetCode: "AST-PNQ-TRN-01",
  workCenterId: "wc-lth01",
  workCenterCode: "WC-LTH01",
  reason: "AST-PNQ-TRN-01 is faulted",
  evidenceRefs: ["asset-state:trn-01:faulted"],
};

function alternate(
  assetCode: string,
  workCenterId: string,
  workCenterCode: string,
  priority: number,
  qualified = true,
) {
  return { assetCode, workCenterId, workCenterCode, priority, qualified };
}

const OPERATIONS: FactorySchedulableOperation[] = [
  {
    jobId: "JOB-PX4-SFT",
    assetCode: "AST-PNQ-TRN-01",
    orderRef: "WO-PX4-SFT",
    itemCode: "CMP-PX4-SFT",
    seq: 10,
    workCentreId: "wc-lth01",
    workCentreCode: "WC-LTH01",
    hours: 8,
    dueDate: "2026-08-21",
    alternateWorkCenters: [
      alternate("AST-PNQ-TRN-02", "wc-lth02", "WC-LTH02", 2),
      alternate("AST-PNQ-TRN-03", "wc-lth03", "WC-LTH03", 1),
    ],
  },
  {
    jobId: "JOB-PX4-SFT",
    assetCode: "AST-PNQ-INS-01",
    orderRef: "WO-PX4-SFT",
    itemCode: "CMP-PX4-SFT",
    seq: 20,
    workCentreId: "wc-ins01",
    workCentreCode: "WC-INS01",
    hours: 4,
    dueDate: "2026-08-21",
  },
  {
    jobId: "JOB-IMP6",
    assetCode: "AST-PNQ-TRN-01",
    orderRef: "WO-IMP6",
    itemCode: "CMP-IMP6",
    seq: 10,
    workCentreId: "wc-lth01",
    workCentreCode: "WC-LTH01",
    hours: 16,
    dueDate: "2026-08-22",
    alternateWorkCenters: [
      alternate("AST-PNQ-TRN-02", "wc-lth02", "WC-LTH02", 1),
    ],
  },
  {
    jobId: "JOB-HOUSING",
    assetCode: "AST-PNQ-VMC-01",
    orderRef: "WO-HOUSING",
    itemCode: "CMP-HSG6",
    seq: 10,
    workCentreId: "wc-vmc01",
    workCentreCode: "WC-VMC01",
    hours: 4,
    dueDate: "2026-08-24",
  },
];

function proposed(
  proposalId: string,
  jobId: string,
  orderRef: string,
  fromAssetCode: string,
  toAssetCode: string,
  toWorkCenterCode: string,
): OnyxReplanProposal {
  return {
    proposalId,
    jobId,
    orderRef,
    fromAssetCode,
    fromWorkCenterCode: "WC-LTH01",
    toAssetCode,
    toWorkCenterCode,
    status: "proposed",
    reason: `${toAssetCode} is the first fresh, idle asset in ONYX's configured alternate set.`,
    deterministicRule: "explicit_alternate_then_asset_code",
    requiresHumanApproval: true,
    autoPublished: false,
  };
}

const PROPOSALS: OnyxReplanProposal[] = [
  proposed(
    "JOB-PX4-SFT:AST-PNQ-TRN-01:AST-PNQ-TRN-02",
    "JOB-PX4-SFT",
    "WO-PX4-SFT",
    "AST-PNQ-TRN-01",
    "AST-PNQ-TRN-02",
    "WC-LTH02",
  ),
  proposed(
    "JOB-IMP6:AST-PNQ-TRN-01:AST-PNQ-TRN-02",
    "JOB-IMP6",
    "WO-IMP6",
    "AST-PNQ-TRN-01",
    "AST-PNQ-TRN-02",
    "WC-LTH02",
  ),
];

const BASE: BreakdownReplanInput = {
  scenarioId: "3s-workroom-poc",
  customerCode: "3S",
  generatedAt: "2026-08-20T08:31:00.000Z",
  provenance: {
    sourceSystem: "ONYX Factory Connect",
    mode: "mock",
    snapshotVersion: "factory-operations.v1:3s:2026-08-20T08:31:00.000Z",
    observedAt: "2026-08-20T08:30:00.000Z",
    recordRefs: ["asset-state:trn-01:faulted", "factory-operations:3s-workroom-poc"],
  },
  operations: OPERATIONS,
  unavailableWorkCenters: [LTH01_OUTAGE],
  onyxProposals: PROPOSALS,
  scheduleOptions: { today: "2026-08-20", hoursPerDay: 8, rule: "EDD" },
};

function fixture(overrides: Partial<BreakdownReplanInput> = {}): BreakdownReplanInput {
  const base = structuredClone(BASE);
  return {
    ...base,
    ...overrides,
    provenance: { ...base.provenance, ...overrides.provenance },
    scheduleOptions: { ...base.scheduleOptions, ...overrides.scheduleOptions },
  };
}

describe("governed breakdown replan analysis", () => {
  it("validates ONYX's 3S LTH01 → LTH02 proposals and previews copied operations", () => {
    const result = simulateBreakdownReplan(BASE);

    assert.equal(result.status, "feasible");
    assert.equal(result.affectedOperations.length, 2);
    assert.deepEqual(result.atRiskJobs.map((item) => item.jobId), ["JOB-PX4-SFT", "JOB-IMP6"]);
    assert.deepEqual(
      result.proposals,
      PROPOSALS.toSorted(
        (a, b) =>
          a.orderRef.localeCompare(b.orderRef) ||
          a.jobId.localeCompare(b.jobId) ||
          a.proposalId.localeCompare(b.proposalId),
      ),
    );
    assert.equal(result.blockedOperations.length, 0);

    const px4 = result.candidateOperations.find(
      (operation) => operation.orderRef === "WO-PX4-SFT" && operation.seq === 10,
    )!;
    assert.equal(px4.assetCode, "AST-PNQ-TRN-02");
    assert.equal(px4.workCentreId, "wc-lth02");
    assert.equal(px4.workCentreCode, "WC-LTH02");
    assert.equal(result.metrics.baseline?.completeness, "complete");
    assert.equal(result.metrics.candidate?.completeness, "complete");
  });

  it("does not choose the lower-priority-number alternate itself; it validates ONYX's target", () => {
    const result = simulateBreakdownReplan(BASE);
    const px4 = result.candidateOperations.find(
      (operation) => operation.orderRef === "WO-PX4-SFT" && operation.seq === 10,
    )!;

    assert.equal(
      px4.workCentreCode,
      "WC-LTH02",
      "ONYX proposed LTH02 even though LTH03 has the lower routing priority number",
    );
    assert.equal(result.proposals[0]?.deterministicRule, "explicit_alternate_then_asset_code");
  });

  it("validates a different healthy asset inside the same work centre", () => {
    const operations: FactorySchedulableOperation[] = [
      {
        jobId: "JOB-VMC-01",
        assetCode: "VMC-01",
        orderRef: "PO-2627-00002",
        itemCode: "CMP-VMC",
        seq: 10,
        workCentreId: "wc-vmc01",
        workCentreCode: "WC-VMC01",
        hours: 8,
        dueDate: "2026-08-22",
        alternateWorkCenters: [
          alternate("VMC-02", "wc-vmc01", "WC-VMC01", 1),
        ],
      },
    ];
    const proposal: OnyxReplanProposal = {
      ...proposed(
        "JOB-VMC-01:VMC-01:VMC-02",
        "JOB-VMC-01",
        "PO-2627-00002",
        "VMC-01",
        "VMC-02",
        "WC-VMC01",
      ),
      fromWorkCenterCode: "WC-VMC01",
    };
    const result = simulateBreakdownReplan(
      fixture({
        operations,
        unavailableWorkCenters: [
          {
            assetCode: "VMC-01",
            workCenterId: "wc-vmc01",
            workCenterCode: "WC-VMC01",
            reason: "VMC-01 is faulted",
            evidenceRefs: ["asset-state:VMC-01:faulted"],
          },
        ],
        onyxProposals: [proposal],
      }),
    );

    assert.equal(result.status, "feasible");
    assert.equal(result.blockedOperations.length, 0);
    assert.equal(result.candidateOperations[0]?.assetCode, "VMC-02");
    assert.equal(result.candidateOperations[0]?.workCentreId, "wc-vmc01");
    assert.equal(result.candidateOperations[0]?.workCentreCode, "WC-VMC01");

    const workCenterWide = simulateBreakdownReplan(
      fixture({
        operations,
        unavailableWorkCenters: [
          {
            assetCode: null,
            workCenterId: "wc-vmc01",
            workCenterCode: "WC-VMC01",
            reason: "The complete VMC work centre is unavailable",
            evidenceRefs: ["downtime:WC-VMC01"],
          },
        ],
        onyxProposals: [proposal],
      }),
    );
    assert.equal(workCenterWide.status, "blocked");
    assert.equal(workCenterWide.blockedOperations[0]?.reasonCode, "PROPOSED_ALTERNATE_UNAVAILABLE");
  });

  it("is deterministic, does not mutate ONYX/planning inputs, and copies nested alternates", () => {
    const input = fixture();
    const before = structuredClone(input);
    const first = simulateBreakdownReplan(input);
    const second = simulateBreakdownReplan(input);

    assert.deepEqual(first, second);
    assert.deepEqual(input, before);
    assert.notEqual(first.candidateOperations, input.operations);
    assert.notEqual(
      first.candidateOperations[0]?.alternateWorkCenters,
      input.operations[0]?.alternateWorkCenters,
    );
  });

  it("carries explicit approval and physical-execution boundaries on every result", () => {
    const result = simulateBreakdownReplan(BASE);

    assert.equal(result.boundary.analysisOnly, true);
    assert.equal(result.boundary.requiresHumanApproval, true);
    assert.equal(result.boundary.scheduleMutationPerformed, false);
    assert.equal(result.boundary.autoPublished, false);
    assert.equal(result.boundary.physicalCommandIssued, false);
    assert.match(result.boundary.statement, /proposal only/i);
    assert.match(result.boundary.statement, /did not mutate an ONYX schedule/i);
    assert.ok(result.proposals.every((proposal) => proposal.requiresHumanApproval));
    assert.ok(result.proposals.every((proposal) => !proposal.autoPublished));
  });

  it("blocks an ONYX target that is not in the operation's configured alternate set", () => {
    const proposals = structuredClone(PROPOSALS);
    proposals[0] = proposed(
      "bad-target",
      "JOB-PX4-SFT",
      "WO-PX4-SFT",
      "AST-PNQ-TRN-01",
      "AST-PNQ-TRN-99",
      "WC-LTH99",
    );
    const result = simulateBreakdownReplan(fixture({ onyxProposals: proposals }));

    assert.equal(result.status, "partially_feasible");
    assert.equal(
      result.blockedOperations.find((item) => item.jobId === "JOB-PX4-SFT")?.reasonCode,
      "PROPOSED_ALTERNATE_NOT_CONFIGURED",
    );
    assert.equal(result.metrics.candidate?.completeness, "partial");
    assert.equal(result.metrics.delta.lateOrderCountChange, null);
  });

  it("blocks a configured but unqualified ONYX target", () => {
    const operations = structuredClone(OPERATIONS);
    operations[0]!.alternateWorkCenters = [
      alternate("AST-PNQ-TRN-02", "wc-lth02", "WC-LTH02", 1, false),
    ];
    const result = simulateBreakdownReplan(fixture({ operations }));

    assert.equal(
      result.blockedOperations.find((item) => item.jobId === "JOB-PX4-SFT")?.reasonCode,
      "PROPOSED_ALTERNATE_NOT_QUALIFIED",
    );
    assert.ok(
      result.blockedOperations
        .find((item) => item.jobId === "JOB-PX4-SFT")
        ?.consideredAlternates.some((item) => item.qualified === false),
    );
  });

  it("blocks a qualified ONYX target when that target is also unavailable", () => {
    const result = simulateBreakdownReplan(
      fixture({
        unavailableWorkCenters: [
          LTH01_OUTAGE,
          {
            assetCode: "AST-PNQ-TRN-02",
            workCenterId: "wc-lth02",
            workCenterCode: "WC-LTH02",
            reason: "planned maintenance",
            evidenceRefs: ["downtime:lth02"],
          },
        ],
      }),
    );

    assert.ok(
      result.blockedOperations
        .filter((item) => item.workCenterCode === "WC-LTH01")
        .every((item) => item.reasonCode === "PROPOSED_ALTERNATE_UNAVAILABLE"),
    );
    assert.equal(result.proposals.length, 0);
  });

  it("honours an explicit blocked proposal from ONYX instead of manufacturing a fallback", () => {
    const blocked: OnyxReplanProposal = {
      ...PROPOSALS[0]!,
      proposalId: "JOB-PX4-SFT:AST-PNQ-TRN-01:blocked",
      toAssetCode: null,
      toWorkCenterCode: null,
      status: "blocked",
      reason: "No configured alternate is both fresh, idle and unassigned; the job remains blocked.",
    };
    const result = simulateBreakdownReplan(
      fixture({ onyxProposals: [blocked, PROPOSALS[1]!] }),
    );

    assert.equal(
      result.blockedOperations.find((item) => item.jobId === "JOB-PX4-SFT")?.reasonCode,
      "ONYX_PROPOSAL_BLOCKED",
    );
    assert.equal(result.proposals.some((proposal) => proposal.jobId === "JOB-PX4-SFT"), false);
  });

  it("keeps an operation and every dependent downstream step visibly blocked when ONYX supplies no proposal", () => {
    const result = simulateBreakdownReplan(
      fixture({ onyxProposals: [PROPOSALS[1]!] }),
    );

    const px4Blocks = result.blockedOperations.filter((item) => item.orderRef === "WO-PX4-SFT");
    assert.deepEqual(
      px4Blocks.map((item) => [item.seq, item.reasonCode]),
      [
        [10, "NO_ONYX_PROPOSAL"],
        [20, "UPSTREAM_OPERATION_BLOCKED"],
      ],
    );
    assert.equal(
      result.candidateOperations.some((operation) => operation.orderRef === "WO-PX4-SFT"),
      false,
    );
    assert.equal(result.metrics.candidate?.completeness, "partial");
    assert.deepEqual(result.metrics.delta, {
      lateOrderCountChange: null,
      totalTardinessDaysChange: null,
      makespanDaysChange: null,
      convention: "candidate_minus_baseline_negative_is_improvement",
    });
  });

  it("never moves a locked operation, even when ONYX proposes a qualified alternate", () => {
    const operations = structuredClone(OPERATIONS);
    operations[0] = { ...operations[0]!, locked: true, lockedStart: "2026-08-20" };
    const result = simulateBreakdownReplan(fixture({ operations }));

    assert.equal(
      result.blockedOperations.find((item) => item.jobId === "JOB-PX4-SFT")?.reasonCode,
      "LOCKED_OPERATION",
    );
  });

  it("returns no_change and zero deltas when the outage affects no planned operation", () => {
    const result = simulateBreakdownReplan(
      fixture({
        unavailableWorkCenters: [
          {
            assetCode: null,
            workCenterId: "wc-unused",
            workCenterCode: "WC-UNUSED",
            reason: "offline",
            evidenceRefs: ["asset-state:unused"],
          },
        ],
        onyxProposals: [],
      }),
    );

    assert.equal(result.status, "no_change");
    assert.equal(result.affectedOperations.length, 0);
    assert.equal(result.proposals.length, 0);
    assert.deepEqual(result.metrics.delta, {
      lateOrderCountChange: 0,
      totalTardinessDaysChange: 0,
      makespanDaysChange: 0,
      convention: "candidate_minus_baseline_negative_is_improvement",
    });
  });

  it("reports candidate-minus-baseline schedule metrics without calling either schedule authoritative", () => {
    const operations: FactorySchedulableOperation[] = [
      {
        jobId: "JOB-A",
        assetCode: "AST-PNQ-TRN-01",
        orderRef: "WO-A",
        itemCode: "A",
        seq: 10,
        workCentreId: "wc-lth01",
        workCentreCode: "WC-LTH01",
        hours: 16,
        dueDate: "2026-08-21",
        alternateWorkCenters: [
          alternate("AST-PNQ-TRN-02", "wc-lth02", "WC-LTH02", 1),
        ],
      },
      {
        jobId: "JOB-B",
        assetCode: "AST-PNQ-TRN-02",
        orderRef: "WO-B",
        itemCode: "B",
        seq: 10,
        workCentreId: "wc-lth02",
        workCentreCode: "WC-LTH02",
        hours: 16,
        dueDate: "2026-08-21",
      },
    ];
    const proposal = proposed(
      "JOB-A:AST-PNQ-TRN-01:AST-PNQ-TRN-02",
      "JOB-A",
      "WO-A",
      "AST-PNQ-TRN-01",
      "AST-PNQ-TRN-02",
      "WC-LTH02",
    );
    const result = simulateBreakdownReplan(fixture({ operations, onyxProposals: [proposal] }));

    assert.equal(result.status, "feasible");
    assert.equal(
      result.metrics.delta.makespanDaysChange,
      result.metrics.candidate!.makespanDays - result.metrics.baseline!.makespanDays,
    );
    assert.ok((result.metrics.delta.makespanDaysChange ?? 0) > 0, "sharing LTH02 lengthens this candidate");
    assert.match(result.boundary.statement, /planning proposal only/i);
  });

  it("rejects duplicate operation identities before invoking the scheduler", () => {
    const operations = [...structuredClone(OPERATIONS), structuredClone(OPERATIONS[0]!)];
    const result = simulateBreakdownReplan(fixture({ operations }));

    assert.equal(result.status, "invalid_input");
    assert.equal(result.schedules.baseline, null);
    assert.equal(result.schedules.candidate, null);
    assert.ok(result.warnings.some((item) => item.code === "DUPLICATE_OPERATION_KEY"));
  });

  it("rejects unsafe or malformed ONYX proposal governance", () => {
    const unsafe = {
      ...PROPOSALS[0]!,
      requiresHumanApproval: false,
      autoPublished: true,
    } as unknown as OnyxReplanProposal;
    const result = simulateBreakdownReplan(
      fixture({ onyxProposals: [unsafe, PROPOSALS[1]!] }),
    );

    assert.equal(result.status, "invalid_input");
    assert.equal(result.schedules.baseline, null);
    assert.ok(result.warnings.some((item) => item.code === "UNSAFE_ONYX_PROPOSAL_GOVERNANCE"));
  });

  it("refuses to guess when one sequence-less ONYX proposal matches multiple affected operations", () => {
    const operations = structuredClone(OPERATIONS);
    operations.splice(1, 0, {
      ...operations[0]!,
      seq: 15,
      hours: 2,
    });
    const result = simulateBreakdownReplan(fixture({ operations }));

    assert.equal(result.status, "partially_feasible");
    assert.ok(
      result.blockedOperations
        .filter((item) => item.jobId === "JOB-PX4-SFT" && item.workCenterCode === "WC-LTH01")
        .every((item) => item.reasonCode === "AMBIGUOUS_ONYX_PROPOSAL"),
    );
  });
});
