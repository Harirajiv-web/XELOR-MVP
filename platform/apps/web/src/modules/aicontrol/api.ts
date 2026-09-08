"use client";

import { api } from "@spine/api/client";

export type AutonomyMode = "autonomous_guarded" | "step_by_step";

export interface ControlNode {
  id: string;
  runId: string;
  nodeId: string;
  nodeName: string;
  nodeKind: string;
  agentKey: string | null;
  capabilityKey: string | null;
  status: string;
  attempt: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  dependsOn: readonly string[];
}

export interface ControlStepGate {
  id: string;
  runId: string;
  sequence: number;
  nodeIds: readonly string[];
  status: "pending" | "approved";
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ControlApproval {
  id: string;
  runId: string;
  nodeId: string;
  title: string;
  risk: string;
  proposedAction: string;
  status: string;
  createdAt: string;
}

export interface ControlRun {
  id: string;
  graphKey: string;
  goal: string;
  status: string;
  consumedSteps: number;
  maxSteps: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  nodes: readonly ControlNode[];
  approvals: readonly ControlApproval[];
  stepGates: readonly ControlStepGate[];
  latestEvent: {
    id: string;
    sequence: number;
    eventType: string;
    nodeId: string | null;
    createdAt: string;
  } | null;
}

export interface ControlCenter {
  checkedAt: string;
  automation: {
    status: "active" | "stopped";
    manualErpAvailable: boolean;
    reason: string | null;
  };
  policy: {
    mode: AutonomyMode;
    changedReason: string;
    changedAt: string | null;
    changedBy: string | null;
  };
  summary: {
    activeRuns: number;
    haltedRuns: number;
    workingAgents: number;
    waitingForProceed: number;
    mandatoryApprovals: number;
  };
  permissions: readonly { key: string; purpose: string }[];
  runs: readonly ControlRun[];
}

interface Envelope<T> {
  data: T;
}

export const aiControlApi = {
  state: async (): Promise<ControlCenter> =>
    (await api.get<Envelope<ControlCenter>>("/agent-os/control")).data,
  setMode: async (mode: AutonomyMode, reason: string): Promise<void> => {
    await api.post("/agent-os/control/mode", { mode, reason });
  },
  engageKillSwitch: async (reason: string): Promise<void> => {
    await api.post("/agent-os/control/kill-switch/engage", { reason });
  },
  releaseKillSwitch: async (): Promise<void> => {
    await api.post("/agent-os/control/kill-switch/release", {});
  },
  proceed: async (gateId: string, note: string): Promise<void> => {
    await api.post(`/agent-os/control/steps/${encodeURIComponent(gateId)}/proceed`, { note });
  },
  resumeHalted: async (): Promise<void> => {
    await api.post("/agent-os/control/resume-halted", {});
  },
} as const;
