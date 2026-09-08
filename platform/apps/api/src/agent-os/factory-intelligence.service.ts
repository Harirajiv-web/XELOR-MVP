import { Inject, Injectable } from "@nestjs/common";
import {
  AppError,
  calculateOee,
  simulateBreakdownReplan,
  type BreakdownReplanAnalysis,
  type FactoryEvidenceProvenance,
  type FactorySchedulableOperation,
  type OeeAnalysis,
  type OnyxReplanProposal as ValidatedOnyxReplanProposal,
} from "@ind-core/platform";
import {
  ONYX_FACTORY_INTELLIGENCE,
  type OnyxFactoryIntelligencePort,
  type OnyxFactoryMachine,
  type OnyxFactoryOperationsSnapshot,
} from "../ports/onyx-factory-intelligence.port.js";

const SCENARIO_KEY = "3s-workroom-poc" as const;
const GRAPH_KEY = "factory.intelligence-recovery" as const;
const CONSTRAINED_STATES = new Set([
  "blocked",
  "faulted",
  "protective_stop",
  "offline",
]);
const LATHE_RECOVERY = {
  jobId: "POC-REPLAY-MO-2627-00003-OP10",
  orderRef: "MO-2627-00003",
  itemCode: "CMP-PX4-SFT",
  operationCode: "OP-10",
  fromAssetCode: "AST-PNQ-TRN-01",
  toAssetCode: "AST-PNQ-LTH-02",
  fromWorkCenterCode: "WC-LTH01",
  toWorkCenterCode: "WC-LTH02",
} as const;

export interface FactoryIntelligenceView {
  schemaVersion: "xelor-factory-intelligence.v1";
  scenario: { key: typeof SCENARIO_KEY; label: string; mockOnly: true };
  customer: { code: string; name: string };
  source: {
    system: "ONYX Factory Connect";
    transport: "versioned_http_projection";
    upstreamSchemaVersion: "factory-operations.v1";
    evidenceMode: "simulator" | "edge" | "mixed" | "none";
    mockOnly: true;
    endpointPath: string;
  };
  freshness: {
    generatedAt: string;
    freshestObservedAt: string;
    oldestObservedAt: string;
    ageSeconds: number;
    oldestAgeSeconds: number;
    maxAgeSeconds: number;
    staleMachineCount: number;
    status: "fresh" | "mixed" | "stale";
  };
  summary: {
    machineCount: number;
    constrainedMachineCount: number;
    assignedJobCount: number;
    atRiskJobCount: number;
    proposedAlternateCount: number;
    recomputedAverageOeePct: number | null;
  };
  constraints: Array<{
    assetCode: string;
    workCenterCode: string | null;
    state: string;
    severity: "critical" | "high";
    reason: string;
    evidenceRef: string;
  }>;
  oee: Array<{
    assetCode: string;
    assetName: string;
    workCenterCode: string;
    state: string;
    shift: { code: string; label: string; source: string };
    observedAt: string;
    evidenceStale: boolean;
    actualCycleSeconds: number | null;
    upstream: {
      status: "complete" | "incomplete" | "invalid";
      availabilityPct: number | null;
      performancePct: number | null;
      qualityPct: number | null;
      oeePct: number | null;
      warnings: readonly string[];
    };
    analysis: OeeAnalysis;
  }>;
  assignments: Array<{
    assignmentId: string;
    assetCode: string;
    workCenterCode: string | null;
    machineState: string;
    job: NonNullable<OnyxFactoryMachine["assignment"]>["job"];
    operator: Omit<
      NonNullable<OnyxFactoryMachine["assignment"]>["operator"],
      "employeeRef"
    >;
  }>;
  atRiskWork: OnyxFactoryOperationsSnapshot["atRiskJobs"];
  replan: {
    suppliedProposals: OnyxFactoryOperationsSnapshot["replanProposals"];
    validation: BreakdownReplanAnalysis;
    recommendation: {
      jobId: string;
      orderRef: string;
      fromAssetCode: string;
      toAssetCode: string;
      fromWorkCenterCode: string;
      toWorkCenterCode: string;
      deterministicRule: "explicit_alternate_then_asset_code";
      reason: string;
      status: "proposed";
    } | null;
    statement: string;
  };
  mission: {
    graphKey: typeof GRAPH_KEY;
    graphVersion: 1;
    goal: string;
    approvalBoundary: string;
  };
  boundary: {
    analysisOnly: true;
    onyxRemainsScheduleSourceOfTruth: true;
    scheduleMutationPerformed: false;
    autoPublished: false;
    physicalCommandIssued: false;
    statement: string;
  };
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function sequenceOf(operationCode: string): number {
  const match = operationCode.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function dateOf(instant: string): string {
  return instant.slice(0, 10);
}

function provenanceOf(
  snapshot: OnyxFactoryOperationsSnapshot,
  recordRefs: readonly string[],
  observedAt: string,
): FactoryEvidenceProvenance {
  const mode =
    snapshot.source.evidenceMode === "simulator"
      ? "simulator"
      : snapshot.source.evidenceMode === "none"
        ? "manual"
        : "live";
  return {
    sourceSystem: snapshot.source.system,
    mode,
    snapshotVersion: `${snapshot.schemaVersion}:${snapshot.freshness.generatedAt}`,
    observedAt,
    recordRefs: [...recordRefs],
  };
}

function processingHours(machine: OnyxFactoryMachine): number {
  const assignment = machine.assignment;
  if (!assignment) return 0;
  const cycleSeconds =
    machine.actualCycleSeconds ?? machine.oee?.inputs.idealCycleSeconds ?? 0;
  return round((cycleSeconds * assignment.job.quantity) / 3_600, 4);
}

function operationsOf(
  snapshot: OnyxFactoryOperationsSnapshot,
): FactorySchedulableOperation[] {
  const byAsset = new Map(
    snapshot.machines.map((machine) => [machine.assetCode, machine]),
  );
  return snapshot.machines.flatMap((machine) => {
    if (!machine.assignment || !machine.workCenterRef || !machine.workCenterCode) {
      return [];
    }
    const alternates = snapshot.replanProposals
      .filter(
        (proposal) =>
          proposal.jobId === machine.assignment?.job.jobId &&
          proposal.orderRef === machine.assignment.job.orderRef &&
          proposal.fromAssetCode === machine.assetCode &&
          proposal.toAssetCode !== null &&
          proposal.toWorkCenterCode !== null,
      )
      .flatMap((proposal) => {
        const target = byAsset.get(proposal.toAssetCode!);
        if (!target?.workCenterRef || !target.workCenterCode) return [];
        return [
          {
            assetCode: target.assetCode,
            workCenterId: target.workCenterRef,
            workCenterCode: target.workCenterCode,
            qualified:
              proposal.status === "proposed" &&
              proposal.deterministicRule === "explicit_alternate_then_asset_code",
            reason: proposal.reason,
          },
        ];
      });
    return [
      {
        jobId: machine.assignment.job.jobId,
        assetCode: machine.assetCode,
        orderRef: machine.assignment.job.orderRef,
        itemCode: machine.assignment.job.itemCode,
        seq: sequenceOf(machine.assignment.job.operationCode),
        workCentreId: machine.workCenterRef,
        workCentreCode: machine.workCenterCode,
        hours: processingHours(machine),
        dueDate: dateOf(machine.assignment.job.dueAt),
        earliestStart: dateOf(snapshot.freshness.generatedAt),
        alternateWorkCenters: alternates,
      },
    ];
  });
}

function suppliedProposalsOf(
  snapshot: OnyxFactoryOperationsSnapshot,
): ValidatedOnyxReplanProposal[] {
  return snapshot.replanProposals.map((proposal) => ({ ...proposal }));
}

function unavailableOf(snapshot: OnyxFactoryOperationsSnapshot) {
  return snapshot.machines.flatMap((machine) => {
    if (
      !CONSTRAINED_STATES.has(machine.state) ||
      !machine.workCenterRef ||
      !machine.workCenterCode
    ) {
      return [];
    }
    const risk = snapshot.atRiskJobs.find(
      (job) => job.assetCode === machine.assetCode,
    );
    return [
      {
        assetCode: machine.assetCode,
        workCenterId: machine.workCenterRef,
        workCenterCode: machine.workCenterCode,
        reason:
          risk?.reason ??
          `${machine.assetCode} reported deterministic constrained state ${machine.state}.`,
        evidenceRefs: [
          `asset:${machine.assetCode}`,
          ...(risk ? [`job:${risk.jobId}`] : []),
        ],
      },
    ];
  });
}

@Injectable()
export class FactoryIntelligenceService {
  constructor(
    @Inject(ONYX_FACTORY_INTELLIGENCE)
    private readonly onyx: OnyxFactoryIntelligencePort,
  ) {}

  async overview(): Promise<FactoryIntelligenceView> {
    const snapshot = await this.onyx.readOperations();
    const freshnessThresholdSeconds =
      this.onyx.evidenceFreshnessThresholdSeconds();
    const observedTimes = snapshot.machines.map((machine) =>
      Date.parse(machine.observedAt),
    );
    const freshestObservedMs = Math.max(...observedTimes);
    const oldestObservedMs = Math.min(...observedTimes);
    const freshestObservedAt = new Date(freshestObservedMs).toISOString();
    const oldestObservedAt = new Date(oldestObservedMs).toISOString();

    const oee = snapshot.machines.flatMap((machine) => {
      if (!machine.oee || !machine.workCenterCode) return [];
      const analysis = calculateOee({
        customerCode: snapshot.customer.code,
        assetRef: machine.maintenanceAssetRef ?? machine.assetCode,
        assetCode: machine.assetCode,
        workCenterCode: machine.workCenterCode,
        windowLabel: machine.oee.shift.label,
        windowStart: null,
        windowEnd: null,
        generatedAt: snapshot.freshness.generatedAt,
        freshnessThresholdSeconds,
        inputs: { ...machine.oee.inputs },
        provenance: provenanceOf(
          snapshot,
          [
            `asset:${machine.assetCode}`,
            `shift:${machine.oee.shift.code}`,
          ],
          machine.observedAt,
        ),
      });
      return [
        {
          assetCode: machine.assetCode,
          assetName: machine.name,
          workCenterCode: machine.workCenterCode,
          state: machine.state,
          shift: { ...machine.oee.shift },
          observedAt: machine.observedAt,
          evidenceStale: machine.evidenceStale,
          actualCycleSeconds: machine.actualCycleSeconds,
          upstream: {
            status: machine.oee.status,
            availabilityPct: machine.oee.availabilityPct,
            performancePct: machine.oee.performancePct,
            qualityPct: machine.oee.qualityPct,
            oeePct: machine.oee.oeePct,
            warnings: [...machine.oee.warnings],
          },
          analysis,
        },
      ];
    });

    const validation = simulateBreakdownReplan({
      scenarioId: SCENARIO_KEY,
      customerCode: snapshot.customer.code,
      generatedAt: snapshot.freshness.generatedAt,
      provenance: provenanceOf(
        snapshot,
        [
          ...snapshot.machines.map((machine) => `asset:${machine.assetCode}`),
          ...snapshot.atRiskJobs.map((job) => `job:${job.jobId}`),
          ...snapshot.replanProposals.map(
            (proposal) => `proposal:${proposal.proposalId}`,
          ),
        ],
        freshestObservedAt,
      ),
      operations: operationsOf(snapshot),
      unavailableWorkCenters: unavailableOf(snapshot),
      onyxProposals: suppliedProposalsOf(snapshot),
      scheduleOptions: {
        today: dateOf(snapshot.freshness.generatedAt),
        rule: "EDD",
        hoursPerDay: 8,
      },
    });

    const exactSource = snapshot.machines.find(
      (machine) =>
        machine.assetCode === LATHE_RECOVERY.fromAssetCode &&
        machine.workCenterCode === LATHE_RECOVERY.fromWorkCenterCode &&
        machine.mockOnly &&
        !machine.evidenceStale &&
        CONSTRAINED_STATES.has(machine.state) &&
        machine.assignment?.job.jobId === LATHE_RECOVERY.jobId &&
        machine.assignment.job.orderRef === LATHE_RECOVERY.orderRef &&
        machine.assignment.job.itemCode === LATHE_RECOVERY.itemCode &&
        machine.assignment.job.operationCode === LATHE_RECOVERY.operationCode,
    );
    const exactTarget = snapshot.machines.find(
      (machine) =>
        machine.assetCode === LATHE_RECOVERY.toAssetCode &&
        machine.workCenterCode === LATHE_RECOVERY.toWorkCenterCode &&
        machine.mockOnly &&
        !machine.evidenceStale &&
        machine.state === "idle" &&
        machine.assignment === null,
    );
    const exactRisk = snapshot.atRiskJobs.find(
      (job) =>
        job.jobId === LATHE_RECOVERY.jobId &&
        job.orderRef === LATHE_RECOVERY.orderRef &&
        job.itemCode === LATHE_RECOVERY.itemCode &&
        job.operationCode === LATHE_RECOVERY.operationCode &&
        job.assetCode === LATHE_RECOVERY.fromAssetCode,
    );
    const exactSuppliedProposal = snapshot.replanProposals.find(
      (proposal) =>
        proposal.status === "proposed" &&
        proposal.jobId === LATHE_RECOVERY.jobId &&
        proposal.orderRef === LATHE_RECOVERY.orderRef &&
        proposal.fromAssetCode === LATHE_RECOVERY.fromAssetCode &&
        proposal.toAssetCode === LATHE_RECOVERY.toAssetCode &&
        proposal.fromWorkCenterCode === LATHE_RECOVERY.fromWorkCenterCode &&
        proposal.toWorkCenterCode === LATHE_RECOVERY.toWorkCenterCode &&
        proposal.deterministicRule === "explicit_alternate_then_asset_code" &&
        proposal.requiresHumanApproval &&
        !proposal.autoPublished,
    );
    const exactCurrentEvidence =
      snapshot.source.evidenceMode === "simulator" &&
      exactSource !== undefined &&
      exactTarget !== undefined &&
      exactRisk !== undefined &&
      exactSuppliedProposal !== undefined;
    const validatedLatheProposal = exactCurrentEvidence
      ? validation.proposals.find(
          (proposal) =>
            proposal.status === "proposed" &&
            proposal.jobId === LATHE_RECOVERY.jobId &&
            proposal.orderRef === LATHE_RECOVERY.orderRef &&
            proposal.fromAssetCode === LATHE_RECOVERY.fromAssetCode &&
            proposal.toAssetCode === LATHE_RECOVERY.toAssetCode &&
            proposal.fromWorkCenterCode === LATHE_RECOVERY.fromWorkCenterCode &&
            proposal.toWorkCenterCode === LATHE_RECOVERY.toWorkCenterCode &&
            proposal.deterministicRule === "explicit_alternate_then_asset_code",
        )
      : undefined;
    const recommendation = validatedLatheProposal
      ? {
          jobId: validatedLatheProposal.jobId,
          orderRef: validatedLatheProposal.orderRef,
          fromAssetCode: LATHE_RECOVERY.fromAssetCode,
          toAssetCode: LATHE_RECOVERY.toAssetCode,
          fromWorkCenterCode: LATHE_RECOVERY.fromWorkCenterCode,
          toWorkCenterCode: LATHE_RECOVERY.toWorkCenterCode,
          deterministicRule: "explicit_alternate_then_asset_code" as const,
          reason: validatedLatheProposal.reason,
          status: "proposed" as const,
        }
      : null;

    const calculatedOee = oee
      .map((item) => item.analysis.oee.percent)
      .filter((value): value is number => value !== null);
    const generatedMs = Date.parse(snapshot.freshness.generatedAt);
    const staleMachineCount = snapshot.machines.filter(
      (machine) => machine.evidenceStale,
    ).length;
    const freshnessStatus =
      staleMachineCount === 0
        ? "fresh"
        : staleMachineCount === snapshot.machines.length
          ? "stale"
          : "mixed";
    const constraints = snapshot.machines
      .filter((machine) => CONSTRAINED_STATES.has(machine.state))
      .map((machine) => ({
        assetCode: machine.assetCode,
        workCenterCode: machine.workCenterCode,
        state: machine.state,
        severity: (["faulted", "offline", "protective_stop"].includes(machine.state)
          ? "critical"
          : "high") as "critical" | "high",
        reason:
          snapshot.atRiskJobs.find((job) => job.assetCode === machine.assetCode)
            ?.reason ??
          `${machine.assetCode} is ${machine.state}; deterministic constraint rules prevent it from being treated as available.`,
        evidenceRef: `asset:${machine.assetCode}:${machine.observedAt}`,
      }));
    const assignments = snapshot.machines.flatMap((machine) => {
      if (!machine.assignment) return [];
      const { employeeRef: _employeeRef, ...operator } =
        machine.assignment.operator;
      return [
        {
          assignmentId: machine.assignment.assignmentId,
          assetCode: machine.assetCode,
          workCenterCode: machine.workCenterCode,
          machineState: machine.state,
          job: { ...machine.assignment.job },
          operator,
        },
      ];
    });

    return {
      schemaVersion: "xelor-factory-intelligence.v1",
      scenario: {
        key: SCENARIO_KEY,
        label: "3S turning-centre breakdown and governed alternate review",
        mockOnly: true,
      },
      customer: {
        code: snapshot.customer.code,
        name: snapshot.customer.name,
      },
      source: {
        system: "ONYX Factory Connect",
        transport: "versioned_http_projection",
        upstreamSchemaVersion: snapshot.schemaVersion,
        evidenceMode: snapshot.source.evidenceMode,
        mockOnly: true,
        endpointPath: this.onyx.operationsPath(),
      },
      freshness: {
        generatedAt: snapshot.freshness.generatedAt,
        freshestObservedAt,
        oldestObservedAt,
        ageSeconds: Math.max(
          0,
          round((generatedMs - freshestObservedMs) / 1_000),
        ),
        oldestAgeSeconds: Math.max(
          0,
          round((generatedMs - oldestObservedMs) / 1_000),
        ),
        maxAgeSeconds: freshnessThresholdSeconds,
        staleMachineCount,
        status: freshnessStatus,
      },
      summary: {
        machineCount: snapshot.summary.machineCount,
        constrainedMachineCount: constraints.length,
        assignedJobCount: assignments.length,
        atRiskJobCount: snapshot.atRiskJobs.length,
        proposedAlternateCount: snapshot.summary.replanProposalCount,
        recomputedAverageOeePct:
          calculatedOee.length === 0
            ? null
            : round(
                calculatedOee.reduce((sum, value) => sum + value, 0) /
                  calculatedOee.length,
              ),
      },
      constraints,
      oee,
      assignments,
      atRiskWork: snapshot.atRiskJobs.map((job) => ({ ...job })),
      replan: {
        suppliedProposals: snapshot.replanProposals.map((proposal) => ({
          ...proposal,
        })),
        validation,
        recommendation,
        statement: recommendation
          ? `ONYX supplied ${recommendation.fromWorkCenterCode} → ${recommendation.toWorkCenterCode}; XELOR matched it to the configured qualified, available alternate and prepared a review-only request.`
          : "No ONYX WC-LTH01 → WC-LTH02 proposal currently passes XELOR validation. No planning-review request can be dispatched.",
      },
      mission: {
        graphKey: GRAPH_KEY,
        graphVersion: 1,
        goal:
          "Explain the current 3S turning-centre constraint and OEE evidence, validate ONYX's WC-LTH01 to WC-LTH02 proposal, and pause before one planning-review request.",
        approvalBoundary:
          "Approval creates one attributable review work item for ONYX Planning. It does not publish or apply a schedule and does not contact a machine.",
      },
      boundary: {
        analysisOnly: true,
        onyxRemainsScheduleSourceOfTruth: true,
        scheduleMutationPerformed: false,
        autoPublished: false,
        physicalCommandIssued: false,
        statement:
          "XELOR recomputed and explained a configured 3S mock snapshot. ONYX remains the schedule source of truth; no schedule was changed, no work was auto-published and no physical controller was contacted.",
      },
    };
  }

  async actionableOverview(scenarioKey: string): Promise<FactoryIntelligenceView> {
    if (scenarioKey !== SCENARIO_KEY) {
      throw new AppError(
        "FACTORY_INTELLIGENCE_SCENARIO_UNSUPPORTED",
        422,
        `Only the configured ${SCENARIO_KEY} mock scenario is available in this POC.`,
      );
    }
    const view = await this.overview();
    if (
      !view.replan.recommendation ||
      view.replan.recommendation.jobId !== LATHE_RECOVERY.jobId ||
      view.replan.recommendation.orderRef !== LATHE_RECOVERY.orderRef ||
      view.replan.recommendation.fromAssetCode !== LATHE_RECOVERY.fromAssetCode ||
      view.replan.recommendation.toAssetCode !== LATHE_RECOVERY.toAssetCode ||
      view.replan.recommendation.fromWorkCenterCode !==
        LATHE_RECOVERY.fromWorkCenterCode ||
      view.replan.recommendation.toWorkCenterCode !==
        LATHE_RECOVERY.toWorkCenterCode ||
      view.replan.recommendation.deterministicRule !==
        "explicit_alternate_then_asset_code" ||
      !view.replan.suppliedProposals.some(
        (proposal) =>
          proposal.status === "proposed" &&
          proposal.jobId === LATHE_RECOVERY.jobId &&
          proposal.orderRef === LATHE_RECOVERY.orderRef &&
          proposal.fromAssetCode === LATHE_RECOVERY.fromAssetCode &&
          proposal.toAssetCode === LATHE_RECOVERY.toAssetCode &&
          proposal.fromWorkCenterCode === LATHE_RECOVERY.fromWorkCenterCode &&
          proposal.toWorkCenterCode === LATHE_RECOVERY.toWorkCenterCode &&
          proposal.deterministicRule === "explicit_alternate_then_asset_code" &&
          proposal.requiresHumanApproval &&
          !proposal.autoPublished,
      ) ||
      !view.assignments.some(
        (assignment) =>
          assignment.job.jobId === LATHE_RECOVERY.jobId &&
          assignment.job.orderRef === LATHE_RECOVERY.orderRef &&
          assignment.job.itemCode === LATHE_RECOVERY.itemCode &&
          assignment.job.operationCode === LATHE_RECOVERY.operationCode &&
          assignment.assetCode === LATHE_RECOVERY.fromAssetCode,
      ) ||
      !["feasible", "partially_feasible"].includes(view.replan.validation.status)
    ) {
      throw new AppError(
        "FACTORY_INTELLIGENCE_NOT_ACTIONABLE",
        409,
        "The current ONYX evidence does not contain a validated WC-LTH01 to WC-LTH02 review proposal. No governed action was started.",
      );
    }
    return view;
  }
}
