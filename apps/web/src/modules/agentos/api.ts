"use client";

import { api } from "@spine/api/client";
import type {
  FactoryOverview,
  MachineCommandRequest,
} from "@ind-core/platform/factory-connect/contracts";

export type AgentKey =
  "ONYX" | "HEXA" | "MICA" | "SPAR" | "AXLE" | "KILN" | "RASP" | "RELAY" | "ACHILES";

export interface AgentDefinition {
  key: AgentKey;
  name: string;
  department: string;
  purpose: string;
  allowedCapabilityPrefixes: readonly string[];
  delegatesTo: readonly AgentKey[];
}

export interface CapabilityDefinition {
  key: string;
  name: string;
  description: string;
  mode: string;
  requiredPermission: string;
  allowedAgents: readonly AgentKey[];
  sideEffecting: boolean;
}

export interface GraphNodeDefinition {
  id: string;
  name: string;
  kind: string;
  agentKey?: AgentKey;
  capabilityKey?: string;
  dependsOn: readonly string[];
}

export interface GraphDefinition {
  key: string;
  version: number;
  name: string;
  description: string;
  maxSteps: number;
  nodes: readonly GraphNodeDefinition[];
}

export interface AgentCatalogue {
  runtime: {
    status: string;
    providerMode: string;
    providerDisclosure: string;
    autonomyMode: string;
    externalConnections: number;
    signalIngress: {
      status: string;
      source: string;
      endpoint: string;
      idempotentBy: string;
    };
  };
  agents: readonly AgentDefinition[];
  capabilities: readonly CapabilityDefinition[];
  graphs: readonly GraphDefinition[];
}

export interface AgentRunSummary {
  id: string;
  graphKey: string;
  graphVersion: number;
  goal: string;
  status: string;
  providerMode: string;
  consumedSteps: number;
  maxSteps: number;
  createdAt: string;
  completedAt: string | null;
}

export interface AgentNodeRun {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeKind: string;
  agentKey: AgentKey | null;
  capabilityKey: string | null;
  status: string;
  attempt: number;
  output: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AgentApproval {
  id: string;
  runId: string;
  nodeId: string;
  title: string;
  risk: string;
  proposedAction: string;
  status: string;
  decision: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface PendingAgentApproval {
  id: string;
  runId: string;
  nodeId: string;
  title: string;
  risk: string;
  proposedAction: string;
  proposed: Record<string, unknown>;
  status: "pending";
  decisionNote: null;
  createdAt: string;
}

export interface AgentRunEvent {
  id: string;
  sequence: number;
  eventType: string;
  nodeId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface AgentRunDetail {
  run: AgentRunSummary & {
    input: Record<string, unknown>;
    output: unknown;
    errorCode: string | null;
    errorMessage: string | null;
  };
  nodes: readonly AgentNodeRun[];
  approvals: readonly AgentApproval[];
  events: readonly AgentRunEvent[];
  checkpoints: readonly {
    id: string;
    sequence: number;
    reason: string;
    createdAt: string;
  }[];
}

export interface AgentAction {
  id: string;
  runId: string;
  nodeId: string;
  approvalNodeId: string;
  agentKey: AgentKey;
  targetDomain: string;
  actionType: string;
  title: string;
  risk: "low" | "medium" | "high";
  executionMode: string;
  payload: Record<string, unknown>;
  status: string;
  approvedBy: string;
  dispatchedAt: string;
}

export type CommanderRiskKind =
  "delivery" | "supply" | "planning" | "quality" | "maintenance";
export type CommanderSeverity = "critical" | "high" | "medium" | "low";

export interface CommanderEvidence {
  domain: string;
  entityType: string;
  entityId: string;
  reference: string;
  label: string;
  detail: string;
  observedAt: string;
}

export interface DecisionConfidence {
  score: number;
  band: "high" | "medium" | "low";
  meaning: string;
  dimensions: {
    evidenceCoverage: number;
    freshness: number;
    completeness: number;
    learningHistory: number;
  };
  strengths: readonly string[];
  gaps: readonly string[];
}

export interface CommanderRisk {
  key: string;
  kind: CommanderRiskKind;
  severity: CommanderSeverity;
  title: string;
  plainSummary: string;
  ownerAgent: AgentKey;
  status: "needs_decision";
  commitmentDate: string | null;
  daysToCommitment: number | null;
  exposure: { amount: number | null; currency: "INR"; basis: string };
  causes: readonly string[];
  recoveryOptions: readonly {
    id: string;
    title: string;
    plainSummary: string;
    actionType: string;
    approvalRequired: boolean;
    reversible: boolean;
    cost: { amount: number | null; currency: "INR"; basis: string };
  }[];
  evidence: readonly CommanderEvidence[];
  confidence: DecisionConfidence;
}

export interface DecisionMemoryItem {
  missionRunId: string;
  decisionKey: string;
  title: string;
  riskKind: string | null;
  ownerAgent: AgentKey;
  severityAtDecision: string | null;
  missionStatus: string;
  humanDecision: string;
  decisionNote: string | null;
  chosenAction: { title: string; actionType: string; status: string } | null;
  evidenceLinks: number;
  outcomeCount: number;
  verifiedOutcomeCount: number;
  verifiedValue: number;
  learned: string;
  startedAt: string;
  completedAt: string | null;
  decidedAt: string | null;
}

export interface OrganizationalMemory {
  summary: {
    decisionsRemembered: number;
    withVerifiedOutcome: number;
    awaitingHumanDecision: number;
    lastDecisionAt: string | null;
  };
  items: readonly DecisionMemoryItem[];
  disclosure: string;
}

export interface MvpReadiness {
  checkedAt: string;
  integrations: {
    status: string;
    connectors: number;
    connections: number;
    healthyConnections: number;
    simulatedConnections: number;
    liveConnections: number;
    activeFlows: number;
    totalFlows: number;
    disclosure: string;
  };
  documents: {
    status: string;
    drafts: number;
    confirmed: number;
    acceptanceRatePct: number;
    fieldEditRatePct: number;
    fallbackRatePct: number;
    humanConfirmationRequired: boolean;
    disclosure: string;
  };
  aiGovernance: {
    registeredFeatures: number;
    enabledFeatures: number;
    openIncidents: number;
    status: string;
  };
  operations: {
    checkedAt: string;
    database: { status: string; queryMs: number };
    decisionRuntime24h: {
      total: number;
      active: number;
      completed: number;
      failed: number;
    };
    governance: { pendingApprovals: number; governedActions24h: number };
    eventDelivery: {
      status: string;
      unpublished: number;
      retrying: number;
      oldestAgeSeconds: number;
    };
    intelligence: {
      evidenceLinks: number;
      outcomes: number;
      verifiedOutcomes: number;
    };
    disclosure: string;
  };
  upgrades: readonly {
    key: string;
    label: string;
    status: string;
    proof: string;
  }[];
}

export interface DecisionCommander {
  asOf: string;
  method: string;
  disclosure: string;
  headline: string;
  summary: {
    totalRisks: number;
    critical: number;
    high: number;
    commitmentsAtRisk: number;
    exposedValue: number;
    exposureBasis: string;
    sourcesChecked: number;
    averageConfidence: number;
  };
  confidence: {
    high: number;
    medium: number;
    low: number;
    disclosure: string;
  };
  value: {
    estimatedValue: number;
    verifiedValue: number;
    outcomeCount: number;
    verifiedCount: number;
    currency: "INR";
    disclosure: string;
  };
  risks: readonly CommanderRisk[];
  graph: {
    nodes: readonly {
      id: string;
      kind: string;
      label: string;
      domain: string;
    }[];
    edges: readonly {
      id: string;
      source: string;
      target: string;
      relation: string;
      observedAt?: string;
    }[];
    summary: {
      currentDecisions: number;
      rememberedDecisions: number;
      relationships: number;
      businessAreas: number;
    };
    disclosure: string;
  };
  memory: OrganizationalMemory;
  platform: MvpReadiness;
}

interface DataEnvelope<T> {
  data: T;
}

export interface FactoryCommandResult {
  commandKey: string;
  status: string;
  simulated: boolean;
  replayed?: boolean;
  verdict?: string;
  result: unknown;
}

export type FactoryProductionView = Pick<
  FactoryOverview,
  "generatedAt" | "boundary" | "gateways" | "assets" | "summary" | "mission"
>;

export interface FactoryCommandEvidenceEnvelope {
  command: (FactoryCommandResult & { capability: string; createdAt: string }) | null;
}

export const FACTORY_PRODUCTION_VIEW_PATH = "/integration/factory/views/production";
export const factoryCommandEvidencePath = (approvalRef: string): string =>
  `/integration/factory/commands/by-approval/${encodeURIComponent(approvalRef)}`;

type PendingMutation = { fingerprint: string; key: string };
type PendingMutationAttempt = { storageKey: string; key: string; attemptKey: string };
type ActivePendingMutation = { inFlight: number; sawAmbiguousOutcome: boolean };

const activePendingMutations = new Map<string, ActivePendingMutation>();

function mutationActorContext(): string {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem("aikyantra.session") ?? "null",
    ) as { accessToken?: string } | null;
    const payload = stored?.accessToken?.split(".")[1];
    if (!payload) return "public-demo-presenter";
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { sub?: unknown; groups?: unknown };
    return JSON.stringify({
      subject: typeof decoded.sub === "string" ? decoded.sub : "unknown-subject",
      groups: Array.isArray(decoded.groups)
        ? decoded.groups.filter((group): group is string => typeof group === "string").sort()
        : [],
    });
  } catch {
    return "unresolved-session";
  }
}

async function mutationFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Keep one key for one logical launch until its response is received. This survives a page
 * reload after an ambiguous network failure without making a later, intentionally new run
 * replay forever. Only the payload hash and random key are retained in session storage.
 */
async function pendingMutationKey(
  scope: string,
  identity: unknown,
): Promise<PendingMutationAttempt> {
  const fingerprint = await mutationFingerprint({
    actor: mutationActorContext(),
    identity,
  });
  const storageKey = `xelor:pending-mutation:${scope}`;
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(storageKey) ?? "null",
    ) as PendingMutation | null;
    if (parsed?.fingerprint === fingerprint && parsed.key) {
      return registerPendingMutationAttempt(storageKey, parsed.key);
    }
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The server remains
    // idempotent; only cross-reload retry continuity is unavailable in that environment.
  }
  const key = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({ fingerprint, key } satisfies PendingMutation),
    );
  } catch {
    // See the storage boundary above.
  }
  return registerPendingMutationAttempt(storageKey, key);
}

function registerPendingMutationAttempt(
  storageKey: string,
  key: string,
): PendingMutationAttempt {
  const attemptKey = `${storageKey}:${key}`;
  const active = activePendingMutations.get(attemptKey);
  if (active) active.inFlight += 1;
  else activePendingMutations.set(attemptKey, { inFlight: 1, sawAmbiguousOutcome: false });
  return { storageKey, key, attemptKey };
}

function settlePendingMutation(
  attempt: PendingMutationAttempt,
  receivedSuccess: boolean,
): void {
  const active = activePendingMutations.get(attempt.attemptKey);
  if (!active) return;
  if (!receivedSuccess) active.sawAmbiguousOutcome = true;
  active.inFlight -= 1;
  if (active.inFlight > 0) return;
  activePendingMutations.delete(attempt.attemptKey);
  if (active.sawAmbiguousOutcome || !receivedSuccess) return;
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(attempt.storageKey) ?? "null",
    ) as PendingMutation | null;
    if (parsed?.key === attempt.key) {
      window.sessionStorage.removeItem(attempt.storageKey);
    }
  } catch {
    // A successful request needs no recovery key when storage is unavailable.
  }
}

export const agentOsApi = {
  catalogue: async (): Promise<AgentCatalogue> =>
    (await api.get<DataEnvelope<AgentCatalogue>>("/agent-os/catalogue")).data,
  commander: async (): Promise<DecisionCommander> =>
    (await api.get<DataEnvelope<DecisionCommander>>("/agent-os/commander"))
      .data,
  memory: async (limit = 20): Promise<OrganizationalMemory> =>
    (
      await api.get<DataEnvelope<OrganizationalMemory>>(
        "/agent-os/commander/memory",
        { query: { limit } },
      )
    ).data,
  readiness: async (): Promise<MvpReadiness> =>
    (await api.get<DataEnvelope<MvpReadiness>>("/agent-os/commander/readiness"))
      .data,
  startCommanderRisk: async (riskKey: string): Promise<AgentRunDetail> =>
    (
      await api.post<DataEnvelope<AgentRunDetail>>(
        `/agent-os/commander/risks/${encodeURIComponent(riskKey)}/start`,
        {},
      )
    ).data,
  runs: async (limit = 12): Promise<readonly AgentRunSummary[]> =>
    (
      await api.get<DataEnvelope<readonly AgentRunSummary[]>>(
        "/agent-os/runs",
        { query: { limit } },
      )
    ).data,
  run: async (runId: string): Promise<AgentRunDetail> =>
    (await api.get<DataEnvelope<AgentRunDetail>>(`/agent-os/runs/${runId}`))
      .data,
  approvals: async (): Promise<readonly PendingAgentApproval[]> =>
    (
      await api.get<DataEnvelope<readonly PendingAgentApproval[]>>(
        "/agent-os/approvals",
      )
    ).data,
  actions: async (
    limit = 50,
    runId?: string,
  ): Promise<readonly AgentAction[]> =>
    (
      await api.get<DataEnvelope<readonly AgentAction[]>>("/agent-os/actions", {
        query: { limit, ...(runId ? { runId } : {}) },
      })
    ).data,
  start: async (
    goal: string,
    graphKey: string,
    input: Record<string, unknown> = {},
  ): Promise<AgentRunDetail> => {
    const body = {
      graphKey,
      goal,
      input: { surface: "phase-2-mission-control", ...input },
    };
    return (await api.post<DataEnvelope<AgentRunDetail>>("/agent-os/runs", body)).data;
  },
  factoryOverview: async (): Promise<FactoryProductionView> =>
    api.get<FactoryProductionView>(FACTORY_PRODUCTION_VIEW_PATH),
  submitFactoryCommand: async (
    request: MachineCommandRequest,
  ): Promise<FactoryCommandResult> =>
    api.post<FactoryCommandResult>("/integration/factory/commands", request, {
      idempotencyKey: request.idempotencyKey,
    }),
  signal: async (): Promise<AgentRunDetail> => {
    const signalIdentity = {
      eventType: "delivery.commitment.at_risk",
      sourceDomain: "operations",
      story: "northstar-px400",
    };
    const pending = await pendingMutationKey("agent-os-signal", signalIdentity);
    const eventId = `northstar-risk-${pending.key}`;
    let receivedSuccess = false;
    try {
      const result = (
        await api.post<DataEnvelope<AgentRunDetail>>("/agent-os/signals", {
          eventId,
          eventType: "delivery.commitment.at_risk",
          sourceDomain: "operations",
          summary:
            "Northstar PX-400 delivery commitment requires a coordinated recovery review.",
          severity: "high",
          payload: {
            customer: "Northstar Process Systems",
            product: "PX-400",
            source: "local_investor_demo",
          },
        }, { idempotencyKey: eventId })
      ).data;
      receivedSuccess = true;
      return result;
    } finally {
      settlePendingMutation(pending, receivedSuccess);
    }
  },
  decide: async (
    approvalId: string,
    decision: "approved" | "rejected",
    note: string,
  ): Promise<AgentRunDetail> =>
    (
      await api.post<DataEnvelope<AgentRunDetail>>(
        `/agent-os/approvals/${approvalId}/decide`,
        { decision, note },
      )
    ).data,
  cancel: async (runId: string, reason: string): Promise<AgentRunDetail> =>
    (
      await api.post<DataEnvelope<AgentRunDetail>>(
        `/agent-os/runs/${runId}/cancel`,
        { reason },
      )
    ).data,
};
