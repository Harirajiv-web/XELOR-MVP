import type {
  SchedulableOp,
  ScheduleOptions,
  ScheduleResult,
} from "../planning/dispatch.js";

/**
 * Pure contracts for Phase 2 factory intelligence.
 *
 * ONYX owns the machine, job and schedule facts. XELOR can explain those facts and build
 * a proposal from them, but this package has no persistence, controller or machine-command
 * surface. Keeping that boundary in the result shape makes it difficult for a POC screen to
 * accidentally present a simulation as something that was applied to a factory.
 */

export type FactoryEvidenceMode = "live" | "simulator" | "mock" | "manual";

export interface FactoryEvidenceProvenance {
  /** System or adapter that supplied the values, for example `ONYX_POC_MOCK`. */
  sourceSystem: string;
  mode: FactoryEvidenceMode;
  /** Version of the complete factory snapshot from which this fact was projected. */
  snapshotVersion: string;
  /** Latest source observation included in the snapshot. ISO instant. */
  observedAt: string;
  /** Stable source row/event identifiers that let a reviewer reproduce the number. */
  recordRefs: readonly string[];
}

export type FactoryWarningSeverity = "info" | "warning" | "error";

export interface FactoryIntelligenceWarning {
  code: string;
  severity: FactoryWarningSeverity;
  field: string | null;
  message: string;
}

/** The six raw values in ONYX's machine OEE DTO. Null means the source did not supply it. */
export interface OeeRawInputs {
  plannedProductionSeconds: number | null;
  runSeconds: number | null;
  idealCycleSeconds: number | null;
  totalCount: number | null;
  goodCount: number | null;
  rejectCount: number | null;
}

export interface OeeAnalysisInput {
  customerCode: string;
  assetRef: string;
  assetCode: string;
  workCenterCode: string;
  /** ONYX always supplies its shift label, but the current POC has no interval instants. */
  windowLabel: string;
  windowStart: string | null;
  windowEnd: string | null;
  /** Explicit rather than defaulting to the clock, so a result can always be replayed. */
  generatedAt: string;
  /** Defaults to five minutes when omitted. */
  freshnessThresholdSeconds?: number;
  inputs: OeeRawInputs;
  provenance: FactoryEvidenceProvenance;
}

export type OeeMetricStatus = "calculated" | "unavailable";

export interface OeeMetricResult {
  status: OeeMetricStatus;
  /** The safe 0..1 ratio used by the composite OEE. */
  ratio: number | null;
  /** The uncapped formula result. It exposes standards/count inconsistencies. */
  rawRatio: number | null;
  percent: number | null;
  wasCapped: boolean;
  formula: string;
  explanation: string;
}

export type OeeFreshnessStatus = "fresh" | "stale" | "future" | "unknown";

export interface OeeFreshness {
  generatedAt: string;
  observedAt: string;
  ageSeconds: number | null;
  thresholdSeconds: number;
  status: OeeFreshnessStatus;
}

export interface OeeDataConfidence {
  score: number;
  band: "high" | "medium" | "low";
  basis: "deterministic_data_quality_not_prediction";
  meaning: string;
  dimensions: {
    inputValidity: number;
    freshness: number;
    provenance: number;
    representativeness: number;
  };
  strengths: string[];
  gaps: string[];
}

export interface OeeAnalysis {
  status: "complete" | "insufficient_data" | "invalid_data";
  customerCode: string;
  assetRef: string;
  assetCode: string;
  workCenterCode: string;
  window: { label: string; start: string | null; end: string | null };
  rawInputs: OeeRawInputs;
  formulas: {
    availability: string;
    performance: string;
    quality: string;
    oee: string;
  };
  availability: OeeMetricResult;
  performance: OeeMetricResult;
  quality: OeeMetricResult;
  oee: OeeMetricResult;
  freshness: OeeFreshness;
  confidence: OeeDataConfidence;
  warnings: FactoryIntelligenceWarning[];
  provenance: FactoryEvidenceProvenance;
  disclosure: string;
}

export interface AlternateWorkCenter {
  assetCode: string;
  workCenterId: string;
  workCenterCode: string;
  /** Only a qualified routing alternate can receive production work. */
  qualified: boolean;
  /** Lower values are preferred. Ties resolve by code then id. */
  priority?: number;
  reason?: string;
}

/** A planning operation plus the ONYX job and routing facts needed for a replan preview. */
export interface FactorySchedulableOperation extends SchedulableOp {
  jobId: string;
  assetCode: string;
  alternateWorkCenters?: readonly AlternateWorkCenter[];
}

export interface UnavailableWorkCenter {
  /** Null is an explicit work-centre-wide outage; otherwise only this asset is unavailable. */
  assetCode: string | null;
  workCenterId: string;
  workCenterCode: string;
  reason: string;
  evidenceRefs: readonly string[];
}

export interface BreakdownReplanInput {
  scenarioId: string;
  customerCode: string;
  generatedAt: string;
  provenance: FactoryEvidenceProvenance;
  operations: readonly FactorySchedulableOperation[];
  unavailableWorkCenters: readonly UnavailableWorkCenter[];
  /** Proposals supplied by ONYX. XELOR validates these; it never invents a target. */
  onyxProposals: readonly OnyxReplanProposal[];
  scheduleOptions: ScheduleOptions;
}

export interface AffectedFactoryOperation {
  jobId: string;
  orderRef: string;
  itemCode: string;
  seq: number;
  hours: number;
  workCenterId: string;
  workCenterCode: string;
  outageReason: string;
  evidenceRefs: string[];
}

export type BlockedOperationReason =
  | "LOCKED_OPERATION"
  | "NO_ONYX_PROPOSAL"
  | "AMBIGUOUS_ONYX_PROPOSAL"
  | "ONYX_PROPOSAL_BLOCKED"
  | "PROPOSAL_SOURCE_MISMATCH"
  | "PROPOSED_ALTERNATE_NOT_CONFIGURED"
  | "PROPOSED_ALTERNATE_NOT_QUALIFIED"
  | "PROPOSED_ALTERNATE_UNAVAILABLE"
  | "NO_ALTERNATES_CONFIGURED"
  | "NO_QUALIFIED_ALTERNATE"
  | "ALL_QUALIFIED_ALTERNATES_UNAVAILABLE"
  | "UPSTREAM_OPERATION_BLOCKED";

export interface BlockedFactoryOperation {
  jobId: string;
  orderRef: string;
  itemCode: string;
  seq: number;
  workCenterCode: string;
  reasonCode: BlockedOperationReason;
  reason: string;
  consideredAlternates: Array<{
    assetCode: string;
    workCenterId: string;
    workCenterCode: string;
    qualified: boolean;
    unavailable: boolean;
  }>;
}

/** Direct structural counterpart of ONYX `WorkroomReplanProposal`. */
export interface OnyxReplanProposal {
  proposalId: string;
  jobId: string;
  orderRef: string;
  fromAssetCode: string;
  fromWorkCenterCode: string | null;
  toAssetCode: string | null;
  toWorkCenterCode: string | null;
  status: "proposed" | "blocked";
  reason: string;
  deterministicRule: string;
  requiresHumanApproval: true;
  autoPublished: false;
}

export interface BreakdownScheduleMetrics {
  scheduledOperationCount: number;
  orderCount: number;
  lateOrderCount: number;
  totalTardinessDays: number;
  makespanDays: number;
  completeness: "complete" | "partial";
}

export interface BreakdownScheduleDelta {
  /** Candidate minus baseline. Negative is an improvement. Null means not comparable. */
  lateOrderCountChange: number | null;
  totalTardinessDaysChange: number | null;
  makespanDaysChange: number | null;
  convention: "candidate_minus_baseline_negative_is_improvement";
}

export type BreakdownReplanStatus =
  | "feasible"
  | "partially_feasible"
  | "blocked"
  | "no_change"
  | "invalid_input";

export interface BreakdownReplanAnalysis {
  scenarioId: string;
  customerCode: string;
  generatedAt: string;
  status: BreakdownReplanStatus;
  affectedOperations: AffectedFactoryOperation[];
  atRiskJobs: Array<{
    jobId: string;
    orderRef: string;
    itemCode: string;
    dueDate: string;
    affectedHours: number;
  }>;
  /** ONYX proposals that passed XELOR's routing and governance validation. */
  proposals: OnyxReplanProposal[];
  blockedOperations: BlockedFactoryOperation[];
  /** Proposed copies only. The caller's schedule objects are never changed. */
  candidateOperations: FactorySchedulableOperation[];
  schedules: {
    baseline: ScheduleResult | null;
    candidate: ScheduleResult | null;
  };
  metrics: {
    baseline: BreakdownScheduleMetrics | null;
    candidate: BreakdownScheduleMetrics | null;
    delta: BreakdownScheduleDelta;
  };
  warnings: FactoryIntelligenceWarning[];
  provenance: FactoryEvidenceProvenance;
  boundary: {
    analysisOnly: true;
    requiresHumanApproval: true;
    scheduleMutationPerformed: false;
    autoPublished: false;
    physicalCommandIssued: false;
    statement: string;
  };
}
