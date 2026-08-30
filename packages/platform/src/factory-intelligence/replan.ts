import { scheduleOperations, type ScheduleResult } from "../planning/dispatch.js";
import type {
  AffectedFactoryOperation,
  AlternateWorkCenter,
  BlockedFactoryOperation,
  BreakdownReplanAnalysis,
  BreakdownReplanInput,
  BreakdownScheduleMetrics,
  FactoryIntelligenceWarning,
  FactorySchedulableOperation,
  OnyxReplanProposal,
  UnavailableWorkCenter,
} from "./contracts.js";

const BOUNDARY = {
  analysisOnly: true,
  requiresHumanApproval: true,
  scheduleMutationPerformed: false,
  autoPublished: false,
  physicalCommandIssued: false,
  statement:
    "This is a deterministic planning proposal only. It did not mutate an ONYX schedule, publish work, or issue a physical machine command.",
} as const;

/**
 * Preview the scheduling consequence of one or more unavailable work centres.
 *
 * ONYX supplies every proposed target; this function only validates that proposal against
 * explicitly qualified routing alternates. It returns copied candidate operations and
 * invokes the existing finite scheduler for comparison, but never mutates the caller's plan.
 * Any operation without a safe route—and every downstream step that depends on it—is kept
 * visible as blocked rather than omitted from the story.
 */
export function simulateBreakdownReplan(input: BreakdownReplanInput): BreakdownReplanAnalysis {
  const warnings: FactoryIntelligenceWarning[] = [];
  validateInput(input, warnings);

  if (input.provenance.mode !== "live") {
    addWarning(
      warnings,
      `${input.provenance.mode.toUpperCase()}_DATA`,
      "info",
      "provenance.mode",
      `${input.provenance.mode} evidence is illustrative and this result must not be described as an applied factory schedule.`,
    );
  }

  const operations = input.operations.map(cloneOperation);
  const outages = input.unavailableWorkCenters.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs] }));
  const affectedOperations = affectedFrom(operations, outages);
  const atRiskJobs = atRiskFrom(affectedOperations, operations);
  for (const proposal of input.onyxProposals) {
    const hasAffectedSource = operations.some(
      (operation) =>
        operation.jobId === proposal.jobId &&
        operation.orderRef === proposal.orderRef &&
        operation.assetCode === proposal.fromAssetCode &&
        outageForOperation(operation, outages) !== null,
    );
    if (!hasAffectedSource) {
      addWarning(
        warnings,
        "ONYX_PROPOSAL_WITHOUT_AFFECTED_OPERATION",
        "warning",
        `onyxProposals.${proposal.proposalId}`,
        "The ONYX proposal does not match an affected planning operation in this snapshot and was not applied to the preview.",
      );
    }
  }
  const invalid = warnings.some((item) => item.severity === "error");
  if (invalid) {
    return {
      scenarioId: input.scenarioId,
      customerCode: input.customerCode,
      generatedAt: input.generatedAt,
      status: "invalid_input",
      affectedOperations,
      atRiskJobs,
      proposals: [],
      blockedOperations: [],
      candidateOperations: operations,
      schedules: { baseline: null, candidate: null },
      metrics: {
        baseline: null,
        candidate: null,
        delta: emptyDelta(),
      },
      warnings,
      provenance: cloneProvenance(input),
      boundary: BOUNDARY,
    };
  }

  const directBlocked = new Map<string, BlockedFactoryOperation>();
  const proposedByKey = new Map<string, FactorySchedulableOperation>();
  const proposalByKey = new Map<string, OnyxReplanProposal>();

  for (const operation of operations) {
    const outage = outageForOperation(operation, outages);
    if (!outage) continue;
    const key = operationKey(operation);
    const considered = consideredAlternates(operation, outages);

    if (operation.locked) {
      directBlocked.set(
        key,
        blocked(
          operation,
          "LOCKED_OPERATION",
          "The affected operation is locked. A preview cannot move a committed operation without a planner first unlocking or revising it.",
          considered,
        ),
      );
      continue;
    }

    const matchingAffectedOperations = operations.filter(
      (candidate) =>
        candidate.jobId === operation.jobId &&
        candidate.orderRef === operation.orderRef &&
        candidate.assetCode === operation.assetCode &&
        outageForOperation(candidate, outages) !== null,
    );
    if (matchingAffectedOperations.length > 1) {
      directBlocked.set(
        key,
        blocked(
          operation,
          "AMBIGUOUS_ONYX_PROPOSAL",
          `The ONYX proposal has no operation sequence and matches ${matchingAffectedOperations.length} affected operations; XELOR will not guess which step to move.`,
          considered,
        ),
      );
      continue;
    }

    const matchingProposals = input.onyxProposals.filter(
      (proposal) =>
        proposal.jobId === operation.jobId &&
        proposal.orderRef === operation.orderRef &&
        proposal.fromAssetCode === operation.assetCode,
    );
    if (matchingProposals.length === 0) {
      directBlocked.set(
        key,
        blocked(
          operation,
          "NO_ONYX_PROPOSAL",
          "ONYX supplied no replan proposal for this affected job; XELOR will not invent one.",
          considered,
        ),
      );
      continue;
    }
    if (matchingProposals.length > 1) {
      directBlocked.set(
        key,
        blocked(
          operation,
          "AMBIGUOUS_ONYX_PROPOSAL",
          `ONYX supplied ${matchingProposals.length} proposals for the same affected job; a unique proposal is required.`,
          considered,
        ),
      );
      continue;
    }

    const proposal = matchingProposals[0]!;
    if (proposal.status === "blocked") {
      directBlocked.set(
        key,
        blocked(operation, "ONYX_PROPOSAL_BLOCKED", proposal.reason, considered),
      );
      continue;
    }
    if (proposal.fromWorkCenterCode !== operation.workCentreCode) {
      directBlocked.set(
        key,
        blocked(
          operation,
          "PROPOSAL_SOURCE_MISMATCH",
          `ONYX proposal source ${String(proposal.fromWorkCenterCode)} does not match ${operation.workCentreCode}.`,
          considered,
        ),
      );
      continue;
    }

    const selected = (operation.alternateWorkCenters ?? []).find(
      (alternate) =>
        alternate.assetCode === proposal.toAssetCode &&
        alternate.workCenterCode === proposal.toWorkCenterCode,
    );
    if (!selected) {
      directBlocked.set(
        key,
        blocked(
          operation,
          "PROPOSED_ALTERNATE_NOT_CONFIGURED",
          `ONYX target ${String(proposal.toAssetCode)} / ${String(proposal.toWorkCenterCode)} is not a configured routing alternate.`,
          considered,
        ),
      );
      continue;
    }
    if (!selected.qualified) {
      directBlocked.set(
        key,
        blocked(
          operation,
          "PROPOSED_ALTERNATE_NOT_QUALIFIED",
          `ONYX target ${selected.assetCode} / ${selected.workCenterCode} is configured but not qualified for this operation.`,
          considered,
        ),
      );
      continue;
    }
    if (resourceIsUnavailable(selected.assetCode, selected.workCenterId, outages)) {
      directBlocked.set(
        key,
        blocked(
          operation,
          "PROPOSED_ALTERNATE_UNAVAILABLE",
          `ONYX target ${selected.assetCode} / ${selected.workCenterCode} is unavailable in this snapshot.`,
          considered,
        ),
      );
      continue;
    }

    proposedByKey.set(key, {
      ...cloneOperation(operation),
      assetCode: selected.assetCode,
      workCentreId: selected.workCenterId,
      workCentreCode: selected.workCenterCode,
    });
    proposalByKey.set(key, { ...proposal });
  }

  // A later operation cannot be scheduled merely because its blocked predecessor was
  // removed from the candidate array. Propagating the block prevents that optimistic lie.
  const blockedByKey = new Map(directBlocked);
  for (const operation of operations) {
    const upstream = operations
      .filter(
        (candidate) =>
          candidate.orderRef === operation.orderRef &&
          candidate.seq < operation.seq &&
          directBlocked.has(operationKey(candidate)),
      )
      .sort((a, b) => a.seq - b.seq)[0];
    if (!upstream || blockedByKey.has(operationKey(operation))) continue;
    blockedByKey.set(
      operationKey(operation),
      blocked(
        operation,
        "UPSTREAM_OPERATION_BLOCKED",
        `Operation ${operation.seq} cannot be scheduled because operation ${upstream.seq} of ${operation.orderRef} has no safe route.`,
        consideredAlternates(operation, outages),
      ),
    );
  }

  const blockedOperations = [...blockedByKey.values()].sort(compareBlocked);
  for (const item of blockedOperations) {
    addWarning(
      warnings,
      `REPLAN_${item.reasonCode}`,
      "warning",
      `${item.orderRef}#${item.seq}`,
      item.reason,
    );
  }

  const candidateOperations = operations
    .filter((operation) => !blockedByKey.has(operationKey(operation)))
    .map((operation) => cloneOperation(proposedByKey.get(operationKey(operation)) ?? operation));
  const proposals = [...proposalByKey.entries()]
    .filter(([key]) => !blockedByKey.has(key))
    .map(([, proposal]) => proposal)
    .sort(
      (a, b) =>
        a.orderRef.localeCompare(b.orderRef) ||
        a.jobId.localeCompare(b.jobId) ||
        a.proposalId.localeCompare(b.proposalId),
    );

  let baseline: ScheduleResult;
  let candidate: ScheduleResult;
  try {
    baseline = scheduleOperations(operations, input.scheduleOptions);
    candidate = scheduleOperations(candidateOperations, input.scheduleOptions);
  } catch (error) {
    addWarning(
      warnings,
      "SCHEDULER_REJECTED_INPUT",
      "error",
      "scheduleOptions",
      error instanceof Error ? error.message : "The scheduler rejected the supplied plan.",
    );
    return {
      scenarioId: input.scenarioId,
      customerCode: input.customerCode,
      generatedAt: input.generatedAt,
      status: "invalid_input",
      affectedOperations,
      atRiskJobs,
      proposals: [],
      blockedOperations,
      candidateOperations,
      schedules: { baseline: null, candidate: null },
      metrics: { baseline: null, candidate: null, delta: emptyDelta() },
      warnings,
      provenance: cloneProvenance(input),
      boundary: BOUNDARY,
    };
  }

  const baselineMetrics = metricsFrom(baseline, "complete");
  const candidateMetrics = metricsFrom(candidate, blockedOperations.length > 0 ? "partial" : "complete");
  const comparable = blockedOperations.length === 0;
  const status =
    affectedOperations.length === 0
      ? "no_change"
      : blockedOperations.length === 0
        ? "feasible"
        : proposals.length > 0
          ? "partially_feasible"
          : "blocked";

  return {
    scenarioId: input.scenarioId,
    customerCode: input.customerCode,
    generatedAt: input.generatedAt,
    status,
    affectedOperations,
    atRiskJobs,
    proposals,
    blockedOperations,
    candidateOperations,
    schedules: { baseline, candidate },
    metrics: {
      baseline: baselineMetrics,
      candidate: candidateMetrics,
      delta: comparable
        ? {
            lateOrderCountChange: candidateMetrics.lateOrderCount - baselineMetrics.lateOrderCount,
            totalTardinessDaysChange:
              candidateMetrics.totalTardinessDays - baselineMetrics.totalTardinessDays,
            makespanDaysChange: candidateMetrics.makespanDays - baselineMetrics.makespanDays,
            convention: "candidate_minus_baseline_negative_is_improvement",
          }
        : emptyDelta(),
    },
    warnings,
    provenance: cloneProvenance(input),
    boundary: BOUNDARY,
  };
}

function validateInput(input: BreakdownReplanInput, warnings: FactoryIntelligenceWarning[]): void {
  const required: Array<[string, string]> = [
    ["scenarioId", input.scenarioId],
    ["customerCode", input.customerCode],
    ["provenance.sourceSystem", input.provenance.sourceSystem],
    ["provenance.snapshotVersion", input.provenance.snapshotVersion],
  ];
  for (const [field, value] of required) {
    if (value.trim().length === 0) {
      addWarning(warnings, `MISSING_${toCode(field)}`, "error", field, `${field} is required.`);
    }
  }
  for (const [field, value] of [
    ["generatedAt", input.generatedAt],
    ["provenance.observedAt", input.provenance.observedAt],
  ] as const) {
    if (!Number.isFinite(Date.parse(value))) {
      addWarning(warnings, `INVALID_${toCode(field)}`, "error", field, `${field} must be a valid ISO instant.`);
    }
  }
  if (!isDate(input.scheduleOptions.today)) {
    addWarning(
      warnings,
      "INVALID_SCHEDULE_TODAY",
      "error",
      "scheduleOptions.today",
      "scheduleOptions.today must be a YYYY-MM-DD date.",
    );
  }
  if (
    input.scheduleOptions.hoursPerDay != null &&
    (!Number.isFinite(input.scheduleOptions.hoursPerDay) || input.scheduleOptions.hoursPerDay <= 0)
  ) {
    addWarning(
      warnings,
      "INVALID_HOURS_PER_DAY",
      "error",
      "scheduleOptions.hoursPerDay",
      "hoursPerDay must be a positive finite number.",
    );
  }

  const seenOutages = new Set<string>();
  for (const outage of input.unavailableWorkCenters) {
    const outageKey = `${outage.workCenterId}#${outage.assetCode ?? "*"}`;
    if (
      (outage.assetCode !== null && !outage.assetCode.trim()) ||
      !outage.workCenterId.trim() ||
      !outage.workCenterCode.trim() ||
      !outage.reason.trim()
    ) {
      addWarning(
        warnings,
        "INVALID_UNAVAILABLE_WORK_CENTER",
        "error",
        "unavailableWorkCenters",
        "Each unavailable resource needs an explicit asset code (or null for the whole work centre), work-centre id/code and reason.",
      );
    }
    if (seenOutages.has(outageKey)) {
      addWarning(
        warnings,
        "DUPLICATE_UNAVAILABLE_WORK_CENTER",
        "error",
        "unavailableWorkCenters",
        `Unavailable resource ${outageKey} is listed more than once.`,
      );
    }
    seenOutages.add(outageKey);
    if (outage.evidenceRefs.length === 0) {
      addWarning(
        warnings,
        "OUTAGE_WITHOUT_EVIDENCE_REF",
        "warning",
        "unavailableWorkCenters.evidenceRefs",
        `${outage.workCenterCode} has no source evidence reference.`,
      );
    }
  }

  const proposalIds = new Set<string>();
  for (const proposal of input.onyxProposals) {
    const fields: Array<[string, string]> = [
      ["proposalId", proposal.proposalId],
      ["jobId", proposal.jobId],
      ["orderRef", proposal.orderRef],
      ["fromAssetCode", proposal.fromAssetCode],
      ["reason", proposal.reason],
      ["deterministicRule", proposal.deterministicRule],
    ];
    for (const [field, value] of fields) {
      if (!value.trim()) {
        addWarning(
          warnings,
          "INVALID_ONYX_PROPOSAL",
          "error",
          `onyxProposals.${field}`,
          `${field} is required on every ONYX replan proposal.`,
        );
      }
    }
    if (proposalIds.has(proposal.proposalId)) {
      addWarning(
        warnings,
        "DUPLICATE_ONYX_PROPOSAL_ID",
        "error",
        "onyxProposals.proposalId",
        `ONYX proposal ${proposal.proposalId} occurs more than once.`,
      );
    }
    proposalIds.add(proposal.proposalId);
    if (proposal.requiresHumanApproval !== true || proposal.autoPublished !== false) {
      addWarning(
        warnings,
        "UNSAFE_ONYX_PROPOSAL_GOVERNANCE",
        "error",
        `onyxProposals.${proposal.proposalId}`,
        "A proposal must require human approval and must not be auto-published.",
      );
    }
    if (
      proposal.status === "proposed" &&
      (!proposal.fromWorkCenterCode || !proposal.toAssetCode || !proposal.toWorkCenterCode)
    ) {
      addWarning(
        warnings,
        "INCOMPLETE_ONYX_PROPOSED_TARGET",
        "error",
        `onyxProposals.${proposal.proposalId}`,
        "A proposed ONYX replan needs source work centre, target asset and target work centre.",
      );
    }
    if (proposal.status === "blocked" && (proposal.toAssetCode !== null || proposal.toWorkCenterCode !== null)) {
      addWarning(
        warnings,
        "BLOCKED_ONYX_PROPOSAL_HAS_TARGET",
        "error",
        `onyxProposals.${proposal.proposalId}`,
        "A blocked ONYX proposal cannot carry a target asset or work centre.",
      );
    }
  }

  const operationKeys = new Set<string>();
  for (const operation of input.operations) {
    const key = operationKey(operation);
    const fields: Array<[string, string]> = [
      ["jobId", operation.jobId],
      ["assetCode", operation.assetCode],
      ["orderRef", operation.orderRef],
      ["itemCode", operation.itemCode],
      ["workCentreId", operation.workCentreId],
      ["workCentreCode", operation.workCentreCode],
    ];
    for (const [field, value] of fields) {
      if (!value.trim()) {
        addWarning(warnings, "INVALID_OPERATION", "error", `${key}.${field}`, `${field} is required for ${key}.`);
      }
    }
    if (!Number.isInteger(operation.seq) || operation.seq < 0) {
      addWarning(warnings, "INVALID_OPERATION_SEQUENCE", "error", `${key}.seq`, `Sequence must be a non-negative integer for ${key}.`);
    }
    if (!Number.isFinite(operation.hours) || operation.hours <= 0) {
      addWarning(warnings, "INVALID_OPERATION_HOURS", "error", `${key}.hours`, `Hours must be positive and finite for ${key}.`);
    }
    if (!isDate(operation.dueDate)) {
      addWarning(warnings, "INVALID_OPERATION_DUE_DATE", "error", `${key}.dueDate`, `dueDate must be YYYY-MM-DD for ${key}.`);
    }
    if (operation.earliestStart != null && !isDate(operation.earliestStart)) {
      addWarning(
        warnings,
        "INVALID_EARLIEST_START",
        "error",
        `${key}.earliestStart`,
        `earliestStart must be YYYY-MM-DD for ${key}.`,
      );
    }
    if (operation.lockedStart != null && !isDate(operation.lockedStart)) {
      addWarning(
        warnings,
        "INVALID_LOCKED_START",
        "error",
        `${key}.lockedStart`,
        `lockedStart must be YYYY-MM-DD for ${key}.`,
      );
    }
    if (operationKeys.has(key)) {
      addWarning(
        warnings,
        "DUPLICATE_OPERATION_KEY",
        "error",
        key,
        `${key} occurs more than once; orderRef + seq must identify one operation.`,
      );
    }
    operationKeys.add(key);

    const alternateKeys = new Set<string>();
    for (const alternate of operation.alternateWorkCenters ?? []) {
      const alternateKey = `${alternate.assetCode}#${alternate.workCenterId}#${alternate.workCenterCode}`;
      if (!alternate.assetCode.trim() || !alternate.workCenterId.trim() || !alternate.workCenterCode.trim()) {
        addWarning(
          warnings,
          "INVALID_ALTERNATE_WORK_CENTER",
          "error",
          `${key}.alternateWorkCenters`,
          `Every alternate for ${key} needs an id and code.`,
        );
      }
      if (alternate.priority != null && !Number.isFinite(alternate.priority)) {
        addWarning(
          warnings,
          "INVALID_ALTERNATE_PRIORITY",
          "error",
          `${key}.alternateWorkCenters.priority`,
          `Alternate priority must be finite for ${key}.`,
        );
      }
      if (alternateKeys.has(alternateKey)) {
        addWarning(
          warnings,
          "DUPLICATE_ALTERNATE_RESOURCE",
          "error",
          `${key}.alternateWorkCenters`,
          `Alternate ${alternateKey} occurs more than once for ${key}.`,
        );
      }
      alternateKeys.add(alternateKey);
    }
  }
}

function affectedFrom(
  operations: readonly FactorySchedulableOperation[],
  outages: readonly UnavailableWorkCenter[],
): AffectedFactoryOperation[] {
  return operations
    .flatMap((operation) => {
      const outage = outageForOperation(operation, outages);
      return outage
        ? [
            {
              jobId: operation.jobId,
              orderRef: operation.orderRef,
              itemCode: operation.itemCode,
              seq: operation.seq,
              hours: operation.hours,
              workCenterId: operation.workCentreId,
              workCenterCode: operation.workCentreCode,
              outageReason: outage.reason,
              evidenceRefs: [...outage.evidenceRefs],
            },
          ]
        : [];
    })
    .sort((a, b) => a.orderRef.localeCompare(b.orderRef) || a.seq - b.seq || a.jobId.localeCompare(b.jobId));
}

function atRiskFrom(
  affected: readonly AffectedFactoryOperation[],
  operations: readonly FactorySchedulableOperation[],
): BreakdownReplanAnalysis["atRiskJobs"] {
  const rows = new Map<string, BreakdownReplanAnalysis["atRiskJobs"][number]>();
  for (const item of affected) {
    const source = operations.find(
      (operation) =>
        operation.jobId === item.jobId &&
        operation.orderRef === item.orderRef &&
        operation.seq === item.seq &&
        operation.workCentreId === item.workCenterId,
    )!;
    const existing = rows.get(item.jobId);
    if (existing) {
      existing.affectedHours = round2(existing.affectedHours + item.hours);
    } else {
      rows.set(item.jobId, {
        jobId: item.jobId,
        orderRef: item.orderRef,
        itemCode: item.itemCode,
        dueDate: source.dueDate,
        affectedHours: item.hours,
      });
    }
  }
  return [...rows.values()].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.orderRef.localeCompare(b.orderRef) || a.jobId.localeCompare(b.jobId),
  );
}

function consideredAlternates(
  operation: FactorySchedulableOperation,
  outages: readonly UnavailableWorkCenter[],
): BlockedFactoryOperation["consideredAlternates"] {
  return [...(operation.alternateWorkCenters ?? [])]
    .sort(compareAlternates)
    .map((alternate) => ({
      assetCode: alternate.assetCode,
      workCenterId: alternate.workCenterId,
      workCenterCode: alternate.workCenterCode,
      qualified: alternate.qualified,
      unavailable: resourceIsUnavailable(alternate.assetCode, alternate.workCenterId, outages),
    }));
}

function outageForOperation(
  operation: Pick<FactorySchedulableOperation, "assetCode" | "workCentreId">,
  outages: readonly UnavailableWorkCenter[],
): UnavailableWorkCenter | null {
  return (
    outages.find(
      (outage) =>
        outage.workCenterId === operation.workCentreId &&
        (outage.assetCode === null || outage.assetCode === operation.assetCode),
    ) ?? null
  );
}

function resourceIsUnavailable(
  assetCode: string,
  workCenterId: string,
  outages: readonly UnavailableWorkCenter[],
): boolean {
  return outages.some(
    (outage) =>
      outage.workCenterId === workCenterId &&
      (outage.assetCode === null || outage.assetCode === assetCode),
  );
}

function blocked(
  operation: FactorySchedulableOperation,
  reasonCode: BlockedFactoryOperation["reasonCode"],
  reason: string,
  consideredAlternates: BlockedFactoryOperation["consideredAlternates"],
): BlockedFactoryOperation {
  return {
    jobId: operation.jobId,
    orderRef: operation.orderRef,
    itemCode: operation.itemCode,
    seq: operation.seq,
    workCenterCode: operation.workCentreCode,
    reasonCode,
    reason,
    consideredAlternates,
  };
}

function metricsFrom(
  result: ScheduleResult,
  completeness: BreakdownScheduleMetrics["completeness"],
): BreakdownScheduleMetrics {
  return {
    scheduledOperationCount: result.operations.length,
    orderCount: result.orders.length,
    lateOrderCount: result.lateOrderCount,
    totalTardinessDays: result.totalTardinessDays,
    makespanDays: result.makespanDays,
    completeness,
  };
}

function emptyDelta(): BreakdownReplanAnalysis["metrics"]["delta"] {
  return {
    lateOrderCountChange: null,
    totalTardinessDaysChange: null,
    makespanDaysChange: null,
    convention: "candidate_minus_baseline_negative_is_improvement",
  };
}

function cloneOperation(operation: FactorySchedulableOperation): FactorySchedulableOperation {
  return {
    ...operation,
    alternateWorkCenters: operation.alternateWorkCenters?.map((alternate) => ({ ...alternate })),
  };
}

function cloneProvenance(input: BreakdownReplanInput): BreakdownReplanInput["provenance"] {
  return { ...input.provenance, recordRefs: [...input.provenance.recordRefs] };
}

function operationKey(operation: Pick<FactorySchedulableOperation, "orderRef" | "seq">): string {
  return `${operation.orderRef}#${operation.seq}`;
}

function compareAlternates(a: AlternateWorkCenter, b: AlternateWorkCenter): number {
  return (
    (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER) ||
    a.workCenterCode.localeCompare(b.workCenterCode) ||
    a.workCenterId.localeCompare(b.workCenterId) ||
    a.assetCode.localeCompare(b.assetCode)
  );
}

function compareBlocked(a: BlockedFactoryOperation, b: BlockedFactoryOperation): number {
  return a.orderRef.localeCompare(b.orderRef) || a.seq - b.seq || a.jobId.localeCompare(b.jobId);
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function addWarning(
  warnings: FactoryIntelligenceWarning[],
  code: string,
  severity: FactoryIntelligenceWarning["severity"],
  field: string | null,
  message: string,
): void {
  warnings.push({ code, severity, field, message });
}

function toCode(field: string): string {
  return field.replaceAll(".", "_").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function round2(value: number): number {
  const result = Math.round((value + Number.EPSILON) * 100) / 100;
  return result === 0 ? 0 : result;
}
