import { Injectable } from "@nestjs/common";
import { AppError } from "@ind-core/platform";
import { z } from "zod";
import type {
  OnyxFactoryIntelligencePort,
  OnyxFactoryOperationsSnapshot,
} from "../ports/onyx-factory-intelligence.port.js";

const DEFAULT_ONYX_ORIGIN = "http://localhost:3000";
const DEFAULT_OPERATIONS_PATH = "/api/v1/integration/factory/views/operations";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_EVIDENCE_AGE_MS = 24 * 60 * 60_000;
const MAX_PROJECTION_AGE_MS = 5 * 60_000;
const MAX_FUTURE_SKEW_MS = 60_000;

const isoTimestamp = z.string().datetime({ offset: true });
const identifier = z.string().trim().min(1).max(200);
const finiteNonNegative = z.number().finite().nonnegative();
const nonNegativeInteger = z.number().int().nonnegative();

const oeeInputsSchema = z
  .object({
    plannedProductionSeconds: finiteNonNegative.nullable(),
    runSeconds: finiteNonNegative.nullable(),
    idealCycleSeconds: finiteNonNegative.nullable(),
    totalCount: nonNegativeInteger.nullable(),
    goodCount: nonNegativeInteger.nullable(),
    rejectCount: nonNegativeInteger.nullable(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (
      value.goodCount !== null &&
      value.rejectCount !== null &&
      value.totalCount !== null &&
      value.goodCount + value.rejectCount > value.totalCount
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "goodCount plus rejectCount cannot exceed totalCount",
      });
    }
  });

const assignmentSchema = z
  .object({
    assignmentId: identifier,
    status: z.literal("assigned"),
    evidenceType: z.literal("configured_mock_snapshot"),
    job: z
      .object({
        jobId: identifier,
        orderRef: identifier,
        itemCode: identifier,
        operationCode: identifier,
        operationName: identifier,
        quantity: finiteNonNegative,
        dueAt: isoTimestamp,
        priority: z.number().int().min(1).max(999),
      })
      .passthrough(),
    operator: z
      .object({
        employeeRef: identifier,
        employeeCode: identifier,
        name: identifier,
        skill: identifier,
        shiftCode: identifier,
        availability: identifier,
        basis: identifier,
      })
      .passthrough(),
  })
  .passthrough();

const machineSchema = z
  .object({
    assetCode: identifier,
    name: identifier,
    assetKind: identifier,
    siteCode: identifier,
    zoneCode: identifier,
    maintenanceAssetRef: identifier.nullable(),
    workCenterRef: identifier.nullable(),
    workCenterCode: identifier.nullable(),
    state: identifier,
    safetyState: identifier,
    observedAt: isoTimestamp.nullable(),
    evidenceAgeSeconds: finiteNonNegative.nullable(),
    evidenceStale: z.boolean(),
    adapterMode: identifier,
    mockOnly: z.boolean(),
    actualCycleSeconds: finiteNonNegative.nullable(),
    oee: z
      .object({
        shift: z
          .object({ code: identifier, label: identifier, source: identifier })
          .passthrough(),
        status: z.enum(["complete", "incomplete", "invalid"]),
        availabilityPct: finiteNonNegative.nullable(),
        performancePct: finiteNonNegative.nullable(),
        qualityPct: finiteNonNegative.max(100).nullable(),
        oeePct: finiteNonNegative.nullable(),
        inputs: oeeInputsSchema,
        warnings: z.array(z.string().min(1).max(500)).max(50),
      })
      .passthrough()
      .nullable(),
    assignment: assignmentSchema.nullable(),
  })
  .passthrough();

const operationsSchema = z
  .object({
    schemaVersion: z.literal("factory-operations.v1"),
    demo: z
      .object({
        mockOnly: z.literal(true),
        scenario: z.literal("3s-workroom-poc"),
        boundary: z.string().trim().min(20).max(2_000),
      })
      .passthrough(),
    customer: z
      .object({ tenantId: identifier, code: identifier, name: identifier })
      .passthrough(),
    source: z
      .object({
        system: z.literal("ONYX Factory Connect"),
        projection: z.literal("factory_operations"),
        evidenceMode: z.enum(["simulator", "edge", "mixed", "none"]),
      })
      .passthrough(),
    freshness: z
      .object({
        generatedAt: isoTimestamp,
        freshestObservedAt: isoTimestamp.nullable(),
        staleMachineCount: nonNegativeInteger,
      })
      .passthrough(),
    summary: z
      .object({
        machineCount: nonNegativeInteger,
        constrainedMachineCount: nonNegativeInteger,
        assignedJobCount: nonNegativeInteger,
        atRiskJobCount: nonNegativeInteger,
        replanProposalCount: nonNegativeInteger,
        averageOeePct: finiteNonNegative.nullable(),
      })
      .passthrough(),
    machines: z.array(machineSchema).min(1).max(500),
    atRiskJobs: z
      .array(
        z
          .object({
            jobId: identifier,
            orderRef: identifier,
            itemCode: identifier,
            operationCode: identifier,
            operationName: identifier,
            assetCode: identifier,
            state: identifier,
            reason: z.string().trim().min(5).max(1_000),
            operatorCode: identifier.nullable(),
            dueAt: isoTimestamp,
          })
          .passthrough(),
      )
      .max(1_000),
    replanProposals: z
      .array(
        z
          .object({
            proposalId: identifier,
            jobId: identifier,
            orderRef: identifier,
            fromAssetCode: identifier,
            fromWorkCenterCode: identifier.nullable(),
            toAssetCode: identifier.nullable(),
            toWorkCenterCode: identifier.nullable(),
            status: z.enum(["proposed", "blocked"]),
            reason: z.string().trim().min(5).max(1_000),
            deterministicRule: z.literal("explicit_alternate_then_asset_code"),
            requiresHumanApproval: z.literal(true),
            autoPublished: z.literal(false),
          })
          .passthrough(),
      )
      .max(1_000),
  })
  .passthrough();

function configurationError(code: string, message: string): never {
  throw new AppError(code, 503, message);
}

function upstreamError(code: string, message: string): never {
  throw new AppError(code, 502, message);
}

function positiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    configurationError(
      "ONYX_FACTORY_CONFIG_INVALID",
      `${name} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

/** Resolve only an origin. Credentials and route details remain separate from it. */
export function resolveOnyxFactoryOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitOrigin = env.ONYX_API_BASE_URL?.trim();
  if (env.NODE_ENV === "production" && !explicitOrigin) {
    configurationError(
      "ONYX_FACTORY_ORIGIN_REQUIRED",
      "ONYX_API_BASE_URL must be configured explicitly in production.",
    );
  }
  const configured = explicitOrigin || DEFAULT_ONYX_ORIGIN;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    configurationError(
      "ONYX_FACTORY_ORIGIN_INVALID",
      "ONYX_API_BASE_URL must be an absolute http(s) origin.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    configurationError(
      "ONYX_FACTORY_ORIGIN_INVALID",
      "ONYX_API_BASE_URL must contain only an http(s) origin without credentials, path, query or fragment.",
    );
  }
  return url.origin;
}

export function resolveOnyxFactoryOperationsPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const path = env.ONYX_FACTORY_OPERATIONS_PATH?.trim() || DEFAULT_OPERATIONS_PATH;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("#")) {
    configurationError(
      "ONYX_FACTORY_PATH_INVALID",
      "ONYX_FACTORY_OPERATIONS_PATH must be an absolute path without an origin, query or fragment.",
    );
  }
  return path;
}

/**
 * Demo access is never implicit. ONYX already owns one isolated-demo credential; the
 * legacy `x-xelor-public-demo` name is kept here solely for compatibility with that
 * existing ONYX middleware and is emitted only when this adapter's explicit flag is true.
 * Outside that mode an attributable service token is mandatory.
 */
export function onyxFactoryRequestHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (env.ONYX_PUBLIC_DEMO === "true") {
    headers["x-xelor-public-demo"] = "investor-presentation";
    return headers;
  }
  const token = env.ONYX_SERVICE_TOKEN?.trim();
  if (!token) {
    configurationError(
      "ONYX_FACTORY_AUTH_REQUIRED",
      "Factory Intelligence is disabled until ONYX_SERVICE_TOKEN is configured or ONYX_PUBLIC_DEMO is explicitly true.",
    );
  }
  headers.authorization = `Bearer ${token}`;
  return headers;
}

function ageMs(timestamp: string, nowMs: number): number {
  return nowMs - new Date(timestamp).getTime();
}

function assertProjectionAndEvidenceConsistent(
  parsed: z.infer<typeof operationsSchema>,
  now: Date,
): void {
  const nowMs = now.getTime();
  const projectionAge = ageMs(parsed.freshness.generatedAt, nowMs);
  if (projectionAge > MAX_PROJECTION_AGE_MS || projectionAge < -MAX_FUTURE_SKEW_MS) {
    upstreamError(
      "ONYX_FACTORY_PROJECTION_STALE",
      "ONYX returned a factory projection outside the accepted five-minute generation window.",
    );
  }
  const machinesMissingEvidence = parsed.machines.some(
    (machine) => !machine.observedAt || machine.evidenceAgeSeconds === null,
  );
  const freshest = parsed.freshness.freshestObservedAt;
  if (machinesMissingEvidence) {
    upstreamError(
      "ONYX_FACTORY_EVIDENCE_MISSING",
      "ONYX returned a configured mock machine without observed-at or evidence-age evidence.",
    );
  }
  const generatedMs = Date.parse(parsed.freshness.generatedAt);
  const observedTimes = parsed.machines.map((machine) =>
    Date.parse(machine.observedAt!),
  );
  if (
    (freshest !== null && ageMs(freshest, nowMs) < -MAX_FUTURE_SKEW_MS) ||
    observedTimes.some(
      (observedMs) =>
        observedMs > nowMs + MAX_FUTURE_SKEW_MS ||
        observedMs > generatedMs + MAX_FUTURE_SKEW_MS,
    )
  ) {
    upstreamError(
      "ONYX_FACTORY_EVIDENCE_FUTURE",
      "ONYX returned machine evidence timestamped beyond the accepted clock-skew window.",
    );
  }
  const actualFreshestMs = Math.max(...observedTimes);
  if (freshest !== null && Date.parse(freshest) !== actualFreshestMs) {
    upstreamError(
      "ONYX_FACTORY_FRESHNESS_INVALID",
      "ONYX freshestObservedAt does not match the newest machine observation.",
    );
  }
  const flaggedStaleCount = parsed.machines.filter(
    (machine) => machine.evidenceStale,
  ).length;
  if (parsed.freshness.staleMachineCount !== flaggedStaleCount) {
    upstreamError(
      "ONYX_FACTORY_STALE_COUNT_INVALID",
      "ONYX staleMachineCount does not match the machine evidenceStale flags.",
    );
  }

  const constrainedStates = new Set(["blocked", "faulted", "protective_stop", "offline"]);
  const assignedJobIds = new Set(
    parsed.machines.flatMap((machine) =>
      machine.assignment ? [machine.assignment.job.jobId] : [],
    ),
  );
  const atRiskJobIds = new Set(parsed.atRiskJobs.map((job) => job.jobId));
  const summaryMatches =
    parsed.summary.machineCount === parsed.machines.length &&
    parsed.summary.constrainedMachineCount ===
      parsed.machines.filter((machine) => constrainedStates.has(machine.state)).length &&
    parsed.summary.assignedJobCount ===
      parsed.machines.filter((machine) => machine.assignment !== null).length &&
    parsed.summary.atRiskJobCount === parsed.atRiskJobs.length &&
    parsed.summary.replanProposalCount ===
      parsed.replanProposals.filter((proposal) => proposal.status === "proposed").length;
  if (!summaryMatches) {
    upstreamError(
      "ONYX_FACTORY_SUMMARY_INVALID",
      "ONYX factory summary counts do not match the versioned evidence arrays.",
    );
  }
  if (
    parsed.atRiskJobs.some((job) => !assignedJobIds.has(job.jobId)) ||
    parsed.replanProposals.some((proposal) => !atRiskJobIds.has(proposal.jobId))
  ) {
    upstreamError(
      "ONYX_FACTORY_LINK_INVALID",
      "ONYX returned an at-risk job or replan proposal without its assignment evidence.",
    );
  }
  if (
    parsed.machines.some(
      (machine) =>
        (machine.oee !== null || machine.assignment !== null) &&
        (!machine.workCenterRef || !machine.workCenterCode),
    )
  ) {
    upstreamError(
      "ONYX_FACTORY_WORK_CENTER_LINK_MISSING",
      "An ONYX OEE or assignment row is missing its work-centre reference.",
    );
  }
  if (
    parsed.replanProposals.some(
      (proposal) =>
        proposal.status === "proposed" &&
        (!proposal.fromWorkCenterCode ||
          !proposal.toAssetCode ||
          !proposal.toWorkCenterCode ||
          proposal.fromAssetCode === proposal.toAssetCode),
    )
  ) {
    upstreamError(
      "ONYX_FACTORY_REPLAN_INVALID",
      "ONYX returned a proposed alternate without distinct source and target asset evidence.",
    );
  }
  if (!parsed.machines.some((machine) => machine.oee !== null)) {
    upstreamError(
      "ONYX_FACTORY_OEE_INPUTS_MISSING",
      "ONYX returned no raw OEE inputs for the 3S factory snapshot.",
    );
  }
}

export function parseOnyxFactoryOperations(
  raw: unknown,
  options: { now?: Date; maxEvidenceAgeMs?: number } = {},
): OnyxFactoryOperationsSnapshot {
  const result = operationsSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.join(".") || "response";
    upstreamError(
      "ONYX_FACTORY_CONTRACT_INVALID",
      `ONYX factory operations did not match factory-operations.v1 at '${field}'.`,
    );
  }
  const parsed = result.data;
  assertProjectionAndEvidenceConsistent(parsed, options.now ?? new Date());
  // The checks above narrow configured-mock observation fields at the transport boundary.
  // Keep that narrowing here at the transport boundary rather than spreading assertions
  // through every consumer of the port.
  return parsed as OnyxFactoryOperationsSnapshot;
}

export async function fetchOnyxFactoryOperations(
  options: {
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    now?: Date;
  } = {},
): Promise<OnyxFactoryOperationsSnapshot> {
  const env = options.env ?? process.env;
  const origin = resolveOnyxFactoryOrigin(env);
  const path = resolveOnyxFactoryOperationsPath(env);
  const headers = onyxFactoryRequestHeaders(env);
  const timeoutMs = positiveInteger(
    env.ONYX_FACTORY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    "ONYX_FACTORY_TIMEOUT_MS",
    60_000,
  );
  const maxEvidenceAgeMs = positiveInteger(
    env.ONYX_FACTORY_MAX_EVIDENCE_AGE_MS,
    DEFAULT_MAX_EVIDENCE_AGE_MS,
    "ONYX_FACTORY_MAX_EVIDENCE_AGE_MS",
    7 * 24 * 60 * 60_000,
  );

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(`${origin}${path}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    upstreamError(
      "ONYX_FACTORY_UNREACHABLE",
      "XELOR could not reach the configured ONYX factory operations endpoint.",
    );
  }
  if (!response.ok) {
    upstreamError(
      "ONYX_FACTORY_UPSTREAM_REFUSED",
      `ONYX refused the factory operations read with HTTP ${response.status}.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await response.text()) as unknown;
  } catch {
    upstreamError(
      "ONYX_FACTORY_RESPONSE_INVALID",
      "ONYX returned a non-JSON factory operations response.",
    );
  }
  return parseOnyxFactoryOperations(raw, { now: options.now, maxEvidenceAgeMs });
}

@Injectable()
export class OnyxFactoryIntelligenceHttpAdapter
  implements OnyxFactoryIntelligencePort
{
  operationsPath(): string {
    return resolveOnyxFactoryOperationsPath();
  }

  evidenceFreshnessThresholdSeconds(): number {
    return (
      positiveInteger(
        process.env.ONYX_FACTORY_MAX_EVIDENCE_AGE_MS,
        DEFAULT_MAX_EVIDENCE_AGE_MS,
        "ONYX_FACTORY_MAX_EVIDENCE_AGE_MS",
        7 * 24 * 60 * 60_000,
      ) / 1_000
    );
  }

  readOperations(): Promise<OnyxFactoryOperationsSnapshot> {
    return fetchOnyxFactoryOperations();
  }
}
