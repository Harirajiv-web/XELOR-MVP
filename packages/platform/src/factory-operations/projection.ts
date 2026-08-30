import { computeOee, type OeeResult } from "./oee.js";

export const FACTORY_OPERATIONS_SCHEMA_VERSION = "factory-operations.v1" as const;
export const FACTORY_REPLAN_RULE = "explicit_alternate_then_asset_code" as const;

export interface FactoryOperationsCustomer {
  tenantId: string;
  code: string;
  name: string;
}

export interface FactoryOperationsAssetInput {
  assetCode: string;
  name: string;
  assetKind: string;
  siteCode: string;
  zoneCode: string;
  maintenanceAssetRef: string | null;
  workCenterRef: string | null;
  state: string;
  safetyState: string;
  observedAt: string | null;
  evidenceAgeSeconds: number | null;
  evidenceStale: boolean;
  adapterMode: string;
  actualCycleSeconds: number | null;
  goodCount: number | null;
  rejectCount: number | null;
  attributes: Record<string, unknown>;
  stateEvidence: Record<string, unknown>;
}

export interface WorkroomShift {
  code: string;
  label: string;
  source: string;
}

export interface WorkroomMachineOee extends OeeResult {
  shift: WorkroomShift;
}

export interface WorkroomJob {
  jobId: string;
  orderRef: string;
  itemCode: string;
  operationCode: string;
  operationName: string;
  quantity: number;
  dueAt: string;
  priority: number;
}

export interface WorkroomOperator {
  employeeRef: string;
  employeeCode: string;
  name: string;
  skill: string;
  shiftCode: string;
  availability: string;
  basis: string;
}

export interface WorkroomAssignment {
  assignmentId: string;
  status: "assigned";
  evidenceType: "configured_mock_snapshot";
  job: WorkroomJob;
  operator: WorkroomOperator;
}

export interface WorkroomMachine {
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
  observedAt: string | null;
  evidenceAgeSeconds: number | null;
  evidenceStale: boolean;
  adapterMode: string;
  mockOnly: boolean;
  actualCycleSeconds: number | null;
  oee: WorkroomMachineOee | null;
  assignment: WorkroomAssignment | null;
}

export interface WorkroomAtRiskJob {
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

export interface WorkroomReplanProposal {
  proposalId: string;
  jobId: string;
  orderRef: string;
  fromAssetCode: string;
  fromWorkCenterCode: string | null;
  toAssetCode: string | null;
  toWorkCenterCode: string | null;
  status: "proposed" | "blocked";
  reason: string;
  deterministicRule: typeof FACTORY_REPLAN_RULE;
  requiresHumanApproval: true;
  autoPublished: false;
}

export interface FactoryOperationsProjection {
  schemaVersion: typeof FACTORY_OPERATIONS_SCHEMA_VERSION;
  demo: {
    mockOnly: true;
    scenario: "3s-workroom-poc";
    boundary: string;
  };
  customer: FactoryOperationsCustomer;
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
    replanProposalCount: number;
    averageOeePct: number | null;
  };
  machines: WorkroomMachine[];
  atRiskJobs: WorkroomAtRiskJob[];
  replanProposals: WorkroomReplanProposal[];
}

export interface FactoryOperationsProjectionInput {
  generatedAt: string;
  customer: FactoryOperationsCustomer;
  assets: readonly FactoryOperationsAssetInput[];
}

interface WorkroomConfig {
  mockOnly: true;
  workCenterCode: string | null;
  alternateAssetCodes: string[];
  assignment: WorkroomAssignment | null;
}

const CONSTRAINED_STATES = new Set(["blocked", "faulted", "protective_stop", "offline"]);

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(stringOf)
        .filter((entry): entry is string => entry !== null)
        .sort((a, b) => a.localeCompare(b))
    : [];
}

function jobOf(value: unknown): WorkroomJob | null {
  const row = recordOf(value);
  if (!row) return null;
  const jobId = stringOf(row.jobId);
  const orderRef = stringOf(row.orderRef);
  const itemCode = stringOf(row.itemCode);
  const operationCode = stringOf(row.operationCode);
  const operationName = stringOf(row.operationName);
  const quantity = numberOf(row.quantity);
  const dueAt = stringOf(row.dueAt);
  const priority = numberOf(row.priority);
  if (
    !jobId ||
    !orderRef ||
    !itemCode ||
    !operationCode ||
    !operationName ||
    quantity === null ||
    quantity < 0 ||
    !dueAt ||
    priority === null ||
    !Number.isInteger(priority)
  ) {
    return null;
  }
  return { jobId, orderRef, itemCode, operationCode, operationName, quantity, dueAt, priority };
}

function operatorOf(value: unknown): WorkroomOperator | null {
  const row = recordOf(value);
  if (!row) return null;
  const employeeRef = stringOf(row.employeeRef);
  const employeeCode = stringOf(row.employeeCode);
  const name = stringOf(row.name);
  const skill = stringOf(row.skill);
  const shiftCode = stringOf(row.shiftCode);
  const availability = stringOf(row.availability);
  const basis = stringOf(row.basis);
  if (!employeeRef || !employeeCode || !name || !skill || !shiftCode || !availability || !basis) {
    return null;
  }
  return { employeeRef, employeeCode, name, skill, shiftCode, availability, basis };
}

function workroomConfig(attributes: Record<string, unknown>, assetCode: string): WorkroomConfig | null {
  const row = recordOf(attributes.workroom);
  if (!row || row.mockOnly !== true) return null;
  const job = jobOf(row.job);
  const operator = operatorOf(row.operator);
  return {
    mockOnly: true,
    workCenterCode: stringOf(row.workCenterCode),
    alternateAssetCodes: stringsOf(row.alternateAssetCodes),
    assignment:
      job && operator
        ? {
            assignmentId: `${assetCode}:${job.jobId}:${operator.employeeCode}`,
            status: "assigned",
            evidenceType: "configured_mock_snapshot",
            job,
            operator,
          }
        : null,
  };
}

function oeeOf(
  stateEvidence: Record<string, unknown>,
  goodCount: number | null,
  rejectCount: number | null,
): WorkroomMachineOee | null {
  const shift = recordOf(stateEvidence.mockShift);
  if (!shift) return null;
  const code = stringOf(shift.code);
  const label = stringOf(shift.label);
  const source = stringOf(shift.source);
  if (!code || !label || !source) return null;
  return {
    shift: { code, label, source },
    ...computeOee({
      plannedProductionSeconds: numberOf(shift.plannedProductionSeconds),
      runSeconds: numberOf(shift.runSeconds),
      idealCycleSeconds: numberOf(shift.idealCycleSeconds),
      goodCount,
      rejectCount,
    }),
  };
}

function evidenceMode(machines: readonly WorkroomMachine[]): "simulator" | "edge" | "mixed" | "none" {
  const modes = new Set(machines.map((machine) => machine.adapterMode));
  if (modes.size === 0) return "none";
  if (modes.size === 1 && modes.has("simulator")) return "simulator";
  if (modes.size === 1 && modes.has("edge")) return "edge";
  return "mixed";
}

/**
 * Build the read-only Workroom projection from tenant-fenced Factory Connect evidence.
 *
 * Replanning is intentionally a proposal, never a state change: an at-risk job moves only
 * to an explicitly configured, fresh and idle alternate. No heuristic invents a compatible
 * machine, and no result publishes a planning schedule or contacts a controller.
 */
export function projectFactoryOperations(
  input: FactoryOperationsProjectionInput,
): FactoryOperationsProjection {
  const configured = input.assets
    .map((asset) => ({ asset, config: workroomConfig(asset.attributes, asset.assetCode) }))
    .filter((entry): entry is { asset: FactoryOperationsAssetInput; config: WorkroomConfig } =>
      entry.config !== null,
    )
    .sort((a, b) => a.asset.assetCode.localeCompare(b.asset.assetCode));

  const configs = new Map(configured.map((entry) => [entry.asset.assetCode, entry.config]));
  const machines: WorkroomMachine[] = configured.map(({ asset, config }) => ({
    assetCode: asset.assetCode,
    name: asset.name,
    assetKind: asset.assetKind,
    siteCode: asset.siteCode,
    zoneCode: asset.zoneCode,
    maintenanceAssetRef: asset.maintenanceAssetRef,
    workCenterRef: asset.workCenterRef,
    workCenterCode: config.workCenterCode,
    state: asset.state,
    safetyState: asset.safetyState,
    observedAt: asset.observedAt,
    evidenceAgeSeconds: asset.evidenceAgeSeconds,
    evidenceStale: asset.evidenceStale,
    adapterMode: asset.adapterMode,
    mockOnly: true,
    actualCycleSeconds: asset.actualCycleSeconds,
    oee: oeeOf(asset.stateEvidence, asset.goodCount, asset.rejectCount),
    assignment: config.assignment,
  }));
  const machineByCode = new Map(machines.map((machine) => [machine.assetCode, machine]));

  const constrainedMachines = machines.filter((machine) => CONSTRAINED_STATES.has(machine.state));
  const atRiskJobs: WorkroomAtRiskJob[] = constrainedMachines
    .filter((machine): machine is WorkroomMachine & { assignment: WorkroomAssignment } =>
      machine.assignment !== null,
    )
    .map((machine) => ({
      ...machine.assignment.job,
      assetCode: machine.assetCode,
      state: machine.state,
      reason: `${machine.assetCode} is ${machine.state}; its configured job is at risk.`,
      operatorCode: machine.assignment.operator.employeeCode,
    }))
    .map(({ quantity: _quantity, priority: _priority, ...risk }) => risk)
    .sort((a, b) => a.jobId.localeCompare(b.jobId) || a.assetCode.localeCompare(b.assetCode));

  const replanProposals: WorkroomReplanProposal[] = atRiskJobs.map((risk) => {
    const source = machineByCode.get(risk.assetCode)!;
    const alternates = configs.get(source.assetCode)?.alternateAssetCodes ?? [];
    const target = alternates
      .map((assetCode) => machineByCode.get(assetCode))
      .filter((machine): machine is WorkroomMachine => machine !== undefined)
      .find(
        (machine) =>
          machine.state === "idle" &&
          !machine.evidenceStale &&
          machine.assignment === null,
      );
    const proposed = target !== undefined;
    return {
      proposalId: `${risk.jobId}:${source.assetCode}:${target?.assetCode ?? "blocked"}`,
      jobId: risk.jobId,
      orderRef: risk.orderRef,
      fromAssetCode: source.assetCode,
      fromWorkCenterCode: source.workCenterCode,
      toAssetCode: target?.assetCode ?? null,
      toWorkCenterCode: target?.workCenterCode ?? null,
      status: proposed ? "proposed" : "blocked",
      reason: proposed
        ? `${target.assetCode} is the first fresh, idle asset in the configured alternate set.`
        : "No configured alternate is both fresh, idle and unassigned; the job remains blocked.",
      deterministicRule: FACTORY_REPLAN_RULE,
      requiresHumanApproval: true,
      autoPublished: false,
    };
  });

  const completeOee = machines
    .map((machine) => machine.oee)
    .filter((oee): oee is WorkroomMachineOee => oee?.status === "complete" && oee.oeePct !== null);
  const averageOeePct = completeOee.length
    ? Math.round(
        (completeOee.reduce((sum, oee) => sum + (oee.oeePct ?? 0), 0) /
          completeOee.length +
          Number.EPSILON) *
          100,
      ) / 100
    : null;
  const observed = machines
    .map((machine) => machine.observedAt)
    .filter((value): value is string => value !== null)
    .sort((a, b) => b.localeCompare(a));

  return {
    schemaVersion: FACTORY_OPERATIONS_SCHEMA_VERSION,
    demo: {
      mockOnly: true,
      scenario: "3s-workroom-poc",
      boundary:
        "Deterministic mock evidence for the 3S POC only. No physical controller is contacted and no schedule is auto-published.",
    },
    customer: input.customer,
    source: {
      system: "ONYX Factory Connect",
      projection: "factory_operations",
      evidenceMode: evidenceMode(machines),
    },
    freshness: {
      generatedAt: input.generatedAt,
      freshestObservedAt: observed[0] ?? null,
      staleMachineCount: machines.filter((machine) => machine.evidenceStale).length,
    },
    summary: {
      machineCount: machines.length,
      constrainedMachineCount: constrainedMachines.length,
      assignedJobCount: machines.filter((machine) => machine.assignment !== null).length,
      atRiskJobCount: atRiskJobs.length,
      replanProposalCount: replanProposals.filter((proposal) => proposal.status === "proposed").length,
      averageOeePct,
    },
    machines,
    atRiskJobs,
    replanProposals,
  };
}
