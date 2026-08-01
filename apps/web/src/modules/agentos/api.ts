"use client";

import { api } from "@spine/api/client";

export type AgentKey =
  | "ONYX"
  | "HEXA"
  | "MICA"
  | "SPAR"
  | "AXLE"
  | "KILN"
  | "RASP";

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

export type CommanderRiskKind = "delivery" | "supply" | "planning" | "quality" | "maintenance";
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
    nodes: readonly { id: string; kind: string; label: string; domain: string }[];
    edges: readonly { id: string; source: string; target: string; relation: string }[];
  };
}

interface DataEnvelope<T> {
  data: T;
}

export const agentOsApi = {
  catalogue: async (): Promise<AgentCatalogue> =>
    (await api.get<DataEnvelope<AgentCatalogue>>("/agent-os/catalogue")).data,
  commander: async (): Promise<DecisionCommander> =>
    (await api.get<DataEnvelope<DecisionCommander>>("/agent-os/commander")).data,
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
  start: async (goal: string, graphKey: string): Promise<AgentRunDetail> =>
    (
      await api.post<DataEnvelope<AgentRunDetail>>("/agent-os/runs", {
        graphKey,
        goal,
        input: { surface: "phase-2-mission-control" },
      })
    ).data,
  signal: async (): Promise<AgentRunDetail> =>
    (
      await api.post<DataEnvelope<AgentRunDetail>>("/agent-os/signals", {
        eventId: `northstar-risk-${crypto.randomUUID()}`,
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
      })
    ).data,
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
