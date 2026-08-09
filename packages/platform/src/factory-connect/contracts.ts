export const MACHINE_COMMAND_CAPABILITIES = [
  "robot.job.enqueue",
  "robot.program.select_approved",
  "robot.pause_after_cycle",
  "amr.route.dispatch",
  "quality.output.quarantine",
  "maintenance.inspection.request",
] as const;

export const MACHINE_STATES = [
  "running",
  "idle",
  "blocked",
  "faulted",
  "protective_stop",
  "offline",
] as const;

export const MACHINE_INSPECTION_TYPES = [
  "visual",
  "mechanical",
  "electrical",
  "safety",
] as const;

export const MAX_MACHINE_COMMAND_TTL_MS = 15 * 60_000;
export const MAX_MACHINE_STATE_AGE_MS = 2 * 60_000;
export const MAX_MACHINE_STATE_FUTURE_SKEW_MS = 60_000;
export const MAX_FACTORY_APPROVAL_AGE_MS = 15 * 60_000;

export type MachineCommandCapability =
  (typeof MACHINE_COMMAND_CAPABILITIES)[number];
export type MachineState = (typeof MACHINE_STATES)[number];
export type MachineInspectionType = (typeof MACHINE_INSPECTION_TYPES)[number];

export interface MachineCommandParameterMap {
  "robot.job.enqueue": {
    jobId: string;
    productionOrderRef?: string;
  };
  "robot.program.select_approved": {
    programId: string;
    approvedRevision: string;
  };
  "robot.pause_after_cycle": {
    reasonCode: string;
  };
  "amr.route.dispatch": {
    routeId: string;
    missionRef?: string;
  };
  "quality.output.quarantine": {
    lotRef: string;
    reasonCode: string;
  };
  "maintenance.inspection.request": {
    inspectionType: MachineInspectionType;
    reasonCode?: string;
  };
}

export type MachineCommandIntent = {
  [Capability in MachineCommandCapability]: {
    assetCode: string;
    capability: Capability;
    parameters: MachineCommandParameterMap[Capability];
    requiredState: MachineState;
    expiresAt: string;
  };
}[MachineCommandCapability];

export type MachineCommandRequest = MachineCommandIntent & {
  approvalRef: string;
  idempotencyKey: string;
};

export interface MachineCommandPolicy {
  allowlistedCapabilities: readonly string[];
  requiresApproval: boolean;
  forbidden?: readonly string[];
}

export interface MachineCommandVerdict {
  allowed: boolean;
  reason: string;
}

export type FactoryCommandExecutionBoundary =
  | { allowed: true; simulated: true }
  | {
      allowed: false;
      code: "FACTORY_APPROVAL_SELF_EXECUTION" | "FACTORY_EDGE_TRANSPORT_UNAVAILABLE";
      httpStatus: 403 | 501;
      reason: string;
    };

/**
 * The public simulator may be evaluated by its approver because it cannot contact
 * hardware. Every physical-edge attempt is refused; the two-person condition is retained
 * so a future transport cannot accidentally erase that boundary when it is implemented.
 */
export function factoryCommandExecutionBoundary(
  deploymentMode: string,
  approvalExecutorSeparated: boolean,
): FactoryCommandExecutionBoundary {
  if (deploymentMode === "simulator") return { allowed: true, simulated: true };
  if (!approvalExecutorSeparated) {
    return {
      allowed: false,
      code: "FACTORY_APPROVAL_SELF_EXECUTION",
      httpStatus: 403,
      reason: "Physical edge execution requires an executor who did not approve the command.",
    };
  }
  return {
    allowed: false,
    code: "FACTORY_EDGE_TRANSPORT_UNAVAILABLE",
    httpStatus: 501,
    reason: "Real edge dispatch is disabled until a mutually authenticated claim and acknowledgement transport is deployed.",
  };
}

export interface FactoryGatewayView {
  code: string;
  name: string;
  siteCode: string;
  zoneCode: string | null;
  deploymentMode: string;
  softwareVersion: string;
  healthStatus: string;
  reportedHealthStatus: string;
  heartbeatStale: boolean;
  heartbeatSource: string;
  lastHeartbeatAt: string | null;
  commandMode: string;
  capabilities: readonly string[];
}

export interface FactoryAssetView {
  assetCode: string;
  name: string;
  assetKind: string;
  siteCode: string;
  zoneCode: string;
  connectorCode: string;
  manufacturer: string | null;
  model: string | null;
  gatewayCode: string | null;
  adapterMode: string;
  commandMode: string;
  state: string;
  safetyState: string;
  observedAt: string | null;
  evidenceAgeSeconds: number | null;
  evidenceStale: boolean;
  activeProgram: string | null;
  productionOrderRef: string | null;
  materialRef: string | null;
  cycleTimeSeconds: string | null;
  goodCount: number | null;
  rejectCount: number | null;
  energyKwh: string | null;
  alarmCode: string | null;
  commandPolicy: MachineCommandPolicy;
  attributes: Record<string, unknown>;
}

export interface FactoryDwellView {
  id: string;
  trackedRef: string;
  materialRef: string | null;
  batchRef: string | null;
  productionOrderRef: string | null;
  zoneCode: string;
  enteredAt: string;
  dwellMinutes: number;
  expectedMaxMinutes: number;
  exceededByMinutes: number;
  status: string;
  causeCode: string | null;
  location: { zoneCode: string; x: string | null; y: string | null; confidence: string | null; source: string } | null;
}

export interface FactoryOverview {
  generatedAt: string;
  boundary: string;
  gateways: FactoryGatewayView[];
  assets: FactoryAssetView[];
  dwell: FactoryDwellView[];
  commands: Array<{
    commandKey: string;
    capability: string;
    status: string;
    simulated: boolean;
    approvalRef: string;
    createdAt: string;
    result: unknown;
  }>;
  summary: { assets: number; constrained: number; exceededDwell: number; headline: string };
  mission: {
    graphKey: string;
    triggerReady: boolean;
    goal: string;
    evidence: unknown;
    specialists: readonly string[];
    approvalBoundary: string;
  };
}

type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; reason: string };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SAFE_SAFETY_STATES = new Set(["normal", "ready", "safe", "clear"]);

const ALLOWED_REQUIRED_STATES: Readonly<Record<MachineCommandCapability, readonly MachineState[]>> = {
  "robot.job.enqueue": ["idle"],
  "robot.program.select_approved": ["idle"],
  "robot.pause_after_cycle": ["running"],
  "amr.route.dispatch": ["idle"],
  "quality.output.quarantine": ["running", "idle", "blocked"],
  "maintenance.inspection.request": ["idle", "blocked", "faulted", "protective_stop", "offline"],
};

function recordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): string | null {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) return `Unknown field '${unknown[0]}'.`;
  const missing = required.find((key) => !(key in value));
  return missing ? `Required field '${missing}' is missing.` : null;
}

function identifier(value: unknown, field: string): ValidationResult<string> {
  if (typeof value !== "string") return { valid: false, reason: `${field} must be a string.` };
  const normalized = value.trim();
  if (!IDENTIFIER.test(normalized)) {
    return { valid: false, reason: `${field} must be a 1-128 character identifier.` };
  }
  return { valid: true, value: normalized };
}

function optionalIdentifier(value: unknown, field: string): ValidationResult<string | undefined> {
  if (value === undefined) return { valid: true, value: undefined };
  return identifier(value, field);
}

export function normalizeMachineCommandParameters(
  capability: MachineCommandCapability,
  value: unknown,
): ValidationResult<MachineCommandParameterMap[MachineCommandCapability]> {
  const raw = recordOf(value);
  if (!raw) return { valid: false, reason: "parameters must be an object." };

  const build = (
    required: readonly string[],
    optional: readonly string[],
    fields: readonly string[],
  ): ValidationResult<Record<string, string>> => {
    const keyError = exactKeys(raw, required, optional);
    if (keyError) return { valid: false, reason: `parameters: ${keyError}` };
    const output: Record<string, string> = {};
    for (const field of fields) {
      const result = optional.includes(field)
        ? optionalIdentifier(raw[field], `parameters.${field}`)
        : identifier(raw[field], `parameters.${field}`);
      if (!result.valid) return result;
      if (result.value !== undefined) output[field] = result.value;
    }
    return { valid: true, value: output };
  };
  const asParameters = (
    result: ValidationResult<Record<string, string>>,
  ): ValidationResult<MachineCommandParameterMap[MachineCommandCapability]> =>
    result.valid
      ? {
          valid: true,
          value: result.value as unknown as MachineCommandParameterMap[MachineCommandCapability],
        }
      : result;

  switch (capability) {
    case "robot.job.enqueue":
      return asParameters(build(["jobId"], ["productionOrderRef"], ["jobId", "productionOrderRef"]));
    case "robot.program.select_approved":
      return asParameters(build(["programId", "approvedRevision"], [], ["programId", "approvedRevision"]));
    case "robot.pause_after_cycle":
      return asParameters(build(["reasonCode"], [], ["reasonCode"]));
    case "amr.route.dispatch":
      return asParameters(build(["routeId"], ["missionRef"], ["routeId", "missionRef"]));
    case "quality.output.quarantine":
      return asParameters(build(["lotRef", "reasonCode"], [], ["lotRef", "reasonCode"]));
    case "maintenance.inspection.request": {
      const keyError = exactKeys(raw, ["inspectionType"], ["reasonCode"]);
      if (keyError) return { valid: false, reason: `parameters: ${keyError}` };
      if (!(MACHINE_INSPECTION_TYPES as readonly unknown[]).includes(raw.inspectionType)) {
        return { valid: false, reason: "parameters.inspectionType is not an allowed inspection type." };
      }
      const reason = optionalIdentifier(raw.reasonCode, "parameters.reasonCode");
      if (!reason.valid) return reason;
      return {
        valid: true,
        value: {
          inspectionType: raw.inspectionType as MachineInspectionType,
          ...(reason.value === undefined ? {} : { reasonCode: reason.value }),
        },
      };
    }
  }
}

/**
 * Normalises the exact action a human is being asked to approve. No unknown root or
 * capability-specific parameter is retained, so the canonical form is safe to hash and
 * compare again at command-request time.
 */
export function normalizeMachineCommandIntent(
  value: unknown,
  options: { now?: string; enforceExpiryWindow?: boolean } = {},
): ValidationResult<MachineCommandIntent> {
  const raw = recordOf(value);
  if (!raw) return { valid: false, reason: "factoryCommand must be an object." };
  const keyError = exactKeys(raw, ["assetCode", "capability", "parameters", "requiredState", "expiresAt"]);
  if (keyError) return { valid: false, reason: `factoryCommand: ${keyError}` };

  const assetCode = identifier(raw.assetCode, "factoryCommand.assetCode");
  if (!assetCode.valid) return assetCode;
  if (!(MACHINE_COMMAND_CAPABILITIES as readonly unknown[]).includes(raw.capability)) {
    return { valid: false, reason: "factoryCommand.capability is not in the closed catalogue." };
  }
  if (!(MACHINE_STATES as readonly unknown[]).includes(raw.requiredState)) {
    return { valid: false, reason: "factoryCommand.requiredState is not a recognised machine state." };
  }
  if (
    typeof raw.expiresAt !== "string" ||
    !ISO_TIMESTAMP.test(raw.expiresAt) ||
    !Number.isFinite(Date.parse(raw.expiresAt))
  ) {
    return { valid: false, reason: "factoryCommand.expiresAt must be an ISO timestamp." };
  }
  const expiry = new Date(raw.expiresAt).toISOString();
  if (options.enforceExpiryWindow !== false) {
    const now = Date.parse(options.now ?? new Date().toISOString());
    const expires = Date.parse(expiry);
    if (!Number.isFinite(now) || expires <= now) {
      return { valid: false, reason: "factoryCommand.expiresAt must be in the future." };
    }
    if (expires - now > MAX_MACHINE_COMMAND_TTL_MS) {
      return { valid: false, reason: "factoryCommand.expiresAt cannot be more than 15 minutes away." };
    }
  }

  const capability = raw.capability as MachineCommandCapability;
  const requiredState = raw.requiredState as MachineState;
  if (!ALLOWED_REQUIRED_STATES[capability].includes(requiredState)) {
    return {
      valid: false,
      reason: `Capability '${capability}' cannot be requested in required state '${requiredState}'.`,
    };
  }
  const parameters = normalizeMachineCommandParameters(capability, raw.parameters);
  if (!parameters.valid) return parameters;

  return {
    valid: true,
    value: {
      assetCode: assetCode.value,
      capability,
      parameters: parameters.value,
      requiredState,
      expiresAt: expiry,
    } as MachineCommandIntent,
  };
}

/** Stable, fixed-key JSON used as the approval-intent hash preimage. */
export function canonicalMachineCommandIntent(intent: MachineCommandIntent): string {
  const parameters = Object.fromEntries(
    Object.entries(intent.parameters).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify({
    assetCode: intent.assetCode,
    capability: intent.capability,
    parameters,
    requiredState: intent.requiredState,
    expiresAt: intent.expiresAt,
  });
}

/**
 * A controller request is a named capability, never an arbitrary instruction. Safety
 * functions are absent from the global catalogue and a particular asset must allow the
 * capability again. The controller/safety PLC remains the final authority even after this
 * verdict succeeds.
 */
export function machineCommandVerdict(input: {
  capability: string;
  policy: MachineCommandPolicy;
  approvalRef?: string;
  expiresAt: string;
  now?: string;
  requiredState?: string;
  observedState?: string;
  observedAt?: string;
  safetyState?: string;
  maxStateAgeMs?: number;
}): MachineCommandVerdict {
  if (!(MACHINE_COMMAND_CAPABILITIES as readonly string[]).includes(input.capability)) {
    return { allowed: false, reason: "Capability is not in XELOR's closed machine-command catalogue." };
  }
  if (input.policy.forbidden?.includes(input.capability)) {
    return { allowed: false, reason: "The asset policy explicitly forbids this capability." };
  }
  if (!input.policy.allowlistedCapabilities.includes(input.capability)) {
    return { allowed: false, reason: "The asset has not allowlisted this capability." };
  }
  if (input.policy.requiresApproval && !input.approvalRef?.trim()) {
    return { allowed: false, reason: "An attributable approval reference is required." };
  }
  const expiry = Date.parse(input.expiresAt);
  const now = Date.parse(input.now ?? new Date().toISOString());
  if (!Number.isFinite(expiry) || !Number.isFinite(now) || expiry <= now) {
    return { allowed: false, reason: "The command has expired or has an invalid expiry." };
  }
  if (expiry - now > MAX_MACHINE_COMMAND_TTL_MS) {
    return { allowed: false, reason: "The command expiry exceeds the 15-minute maximum TTL." };
  }
  if (!input.requiredState) {
    return { allowed: false, reason: "A required machine state must be bound to the command." };
  }
  if (input.requiredState !== input.observedState) {
    return {
      allowed: false,
      reason: `Asset state is '${input.observedState ?? "unknown"}', not required state '${input.requiredState}'.`,
    };
  }
  const capability = input.capability as MachineCommandCapability;
  if (!ALLOWED_REQUIRED_STATES[capability].includes(input.requiredState as MachineState)) {
    return { allowed: false, reason: `Capability '${capability}' is not permitted from state '${input.requiredState}'.` };
  }
  const observedAt = Date.parse(input.observedAt ?? "");
  const age = now - observedAt;
  if (
    !Number.isFinite(observedAt) ||
    age > (input.maxStateAgeMs ?? MAX_MACHINE_STATE_AGE_MS) ||
    age < -MAX_MACHINE_STATE_FUTURE_SKEW_MS
  ) {
    return { allowed: false, reason: "The latest machine state is missing, stale or implausibly future-dated." };
  }
  if (!SAFE_SAFETY_STATES.has(input.safetyState?.trim().toLowerCase() ?? "")) {
    return { allowed: false, reason: `The reported safety state '${input.safetyState ?? "unknown"}' is not command-ready.` };
  }
  return {
    allowed: true,
    reason: "XELOR policy gates passed; this verdict authorizes no physical action.",
  };
}
