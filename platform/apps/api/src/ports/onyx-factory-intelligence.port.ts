/**
 * Read-only Phase 1 boundary for XELOR Factory Intelligence.
 *
 * ONYX owns the factory snapshot and the schedule. XELOR receives a versioned HTTP
 * projection, calculates an explanation and may later dispatch an approval-backed review
 * work item. It never reads the ONYX database, publishes a schedule or contacts a machine.
 */
export const ONYX_FACTORY_INTELLIGENCE = Symbol("OnyxFactoryIntelligence");

export interface OnyxOeeInputs {
  plannedProductionSeconds: number | null;
  runSeconds: number | null;
  idealCycleSeconds: number | null;
  totalCount: number | null;
  goodCount: number | null;
  rejectCount: number | null;
}

export interface OnyxFactoryAssignment {
  assignmentId: string;
  status: "assigned";
  evidenceType: "configured_mock_snapshot";
  job: {
    jobId: string;
    orderRef: string;
    itemCode: string;
    operationCode: string;
    operationName: string;
    quantity: number;
    dueAt: string;
    priority: number;
  };
  operator: {
    employeeRef: string;
    employeeCode: string;
    name: string;
    skill: string;
    shiftCode: string;
    availability: string;
    basis: string;
  };
}

export interface OnyxFactoryMachine {
  assetCode: string;
  name: string;
  assetKind: string;
  siteCode: string;
  zoneCode: string;
  maintenanceAssetRef: string | null;
  workCenterRef: string | null;
  workCenterCode: string | null;
  state: string;
  safetyState: string;
  /** Narrowed to non-null by the HTTP boundary for this configured mock projection. */
  observedAt: string;
  /** Narrowed to non-null by the HTTP boundary for this configured mock projection. */
  evidenceAgeSeconds: number;
  evidenceStale: boolean;
  adapterMode: string;
  mockOnly: boolean;
  actualCycleSeconds: number | null;
  oee: {
    shift: { code: string; label: string; source: string };
    status: "complete" | "incomplete" | "invalid";
    availabilityPct: number | null;
    performancePct: number | null;
    qualityPct: number | null;
    oeePct: number | null;
    inputs: OnyxOeeInputs;
    warnings: readonly string[];
  } | null;
  assignment: OnyxFactoryAssignment | null;
}

export interface OnyxAtRiskJob {
  jobId: string;
  orderRef: string;
  itemCode: string;
  operationCode: string;
  operationName: string;
  assetCode: string;
  state: string;
  reason: string;
  operatorCode: string | null;
  dueAt: string;
}

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
  deterministicRule: "explicit_alternate_then_asset_code";
  requiresHumanApproval: true;
  autoPublished: false;
}

export interface OnyxFactoryOperationsSnapshot {
  schemaVersion: "factory-operations.v1";
  demo: {
    mockOnly: true;
    scenario: "3s-workroom-poc";
    boundary: string;
  };
  customer: { tenantId: string; code: string; name: string };
  source: {
    system: "ONYX Factory Connect";
    projection: "factory_operations";
    evidenceMode: "simulator" | "edge" | "mixed" | "none";
  };
  freshness: {
    generatedAt: string;
    freshestObservedAt: string | null;
    staleMachineCount: number;
  };
  summary: {
    machineCount: number;
    constrainedMachineCount: number;
    assignedJobCount: number;
    atRiskJobCount: number;
    /** Counts only rows whose proposal status is `proposed`, not blocked evidence rows. */
    replanProposalCount: number;
    averageOeePct: number | null;
  };
  machines: readonly OnyxFactoryMachine[];
  atRiskJobs: readonly OnyxAtRiskJob[];
  replanProposals: readonly OnyxReplanProposal[];
}

export interface OnyxFactoryIntelligencePort {
  /** Non-secret route evidence; the origin and bearer credential are never returned. */
  operationsPath(): string;
  evidenceFreshnessThresholdSeconds(): number;
  readOperations(): Promise<OnyxFactoryOperationsSnapshot>;
}
