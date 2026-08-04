import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AppError } from "@ind-core/platform";
import { AgentRegistryService } from "./agent-registry.service.js";
import { AgentRunRepository } from "./agent-run.repository.js";
import { AgentGraphEngine } from "./agent-graph.engine.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { DeterministicAgentReasoner } from "./agent-reasoner.service.js";
import { GraphRegistryService } from "./graph-registry.service.js";
import { AgentActionService } from "./agent-action.service.js";
import { DecisionIntelligenceService } from "./decision-intelligence.service.js";
import type { OutcomeInput } from "./decision-intelligence.repository.js";
import { MvpReadinessService } from "./mvp-readiness.service.js";
import {
  AgentControlService,
  type AgentAutonomyMode,
} from "./agent-control.service.js";

@Injectable()
export class AgentOsService {
  constructor(
    private readonly agents: AgentRegistryService,
    private readonly graphs: GraphRegistryService,
    private readonly capabilities: CapabilityRegistryService,
    private readonly reasoner: DeterministicAgentReasoner,
    private readonly repository: AgentRunRepository,
    private readonly engine: AgentGraphEngine,
    private readonly actionService: AgentActionService,
    private readonly decisions: DecisionIntelligenceService,
    private readonly readinessService: MvpReadinessService,
    private readonly control: AgentControlService,
  ) {}

  async catalogue() {
    const policy = await this.control.policy();
    return {
      runtime: {
        status: "live",
        providerMode: this.reasoner.mode,
        providerDisclosure:
          "Orchestration, ERP reads, approval gates and governed action dispatch are live. Language reasoning is deterministic; no external model API or connector is active.",
        autonomyMode: policy.mode,
        externalConnections: 0,
        signalIngress: {
          status: "live",
          source: "internal_erp_event",
          endpoint: "/api/v1/agent-os/signals",
          idempotentBy: "eventId",
        },
      },
      agents: this.agents.list(),
      capabilities: this.capabilities.list(),
      graphs: this.graphs.list(),
    };
  }

  async start(input: {
    graphKey: string;
    graphVersion?: number;
    goal: string;
    missionInput: Record<string, unknown>;
    idempotencyKey: string;
    /** Stable business identity used when the mission snapshot contains observation time. */
    idempotencyIdentity?: Record<string, unknown>;
  }) {
    await this.control.assertRuntimeActive();
    if (!input.idempotencyKey.trim()) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REQUIRED",
        400,
        "Idempotency-Key header is required.",
      );
    }
    const graph = this.graphs.get(input.graphKey, input.graphVersion);
    const requestFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          graphKey: graph.key,
          graphVersion: graph.version,
          goal: input.goal,
          input: input.idempotencyIdentity ?? input.missionInput,
        }),
      )
      .digest("hex");
    const created = await this.repository.create({
      graph,
      graphHash: this.graphs.contentHash(graph),
      goal: input.goal,
      missionInput: input.missionInput,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      providerMode: this.reasoner.mode,
    });
    const state = await this.engine.execute(created.runId);
    return { replayed: created.replayed, ...presentRun(state) };
  }

  async ingestSignal(input: {
    eventId: string;
    eventType: string;
    sourceDomain: string;
    summary: string;
    severity?: "low" | "medium" | "high" | "critical";
    payload?: Record<string, unknown>;
  }) {
    return this.start({
      graphKey: "operations.controlled-action-mission",
      goal: `Respond to ${input.sourceDomain} signal '${input.eventType}': ${input.summary}`,
      missionInput: {
        trigger: {
          mode: "internal_erp_event",
          eventId: input.eventId,
          eventType: input.eventType,
          sourceDomain: input.sourceDomain,
          severity: input.severity ?? "medium",
          receivedAt: new Date().toISOString(),
        },
        signalPayload: input.payload ?? {},
      },
      idempotencyKey: `agent-signal:${input.eventId}`,
      idempotencyIdentity: {
        eventId: input.eventId,
        eventType: input.eventType,
        sourceDomain: input.sourceDomain,
        summary: input.summary,
        severity: input.severity ?? "medium",
        payload: input.payload ?? {},
      },
    });
  }

  async get(runId: string) {
    return presentRun(await this.repository.get(runId));
  }

  async list(limit: number) {
    return this.repository.list(limit);
  }

  async cancel(runId: string, reason: string) {
    await this.repository.cancelRun(runId, reason);
    return this.get(runId);
  }

  async resume(runId: string) {
    await this.control.assertRuntimeActive();
    return presentRun(await this.engine.execute(runId));
  }

  controlCenter() {
    return this.control.snapshot();
  }

  async setControlMode(mode: AgentAutonomyMode, reason: string) {
    const policy = await this.control.setMode(mode, reason);
    if (mode === "autonomous_guarded") {
      const waiting = await this.repository.runIdsWithStatus(["waiting_step"]);
      for (const runId of waiting) await this.engine.execute(runId);
    }
    return { policy, control: await this.control.snapshot() };
  }

  engageKillSwitch(reason: string) {
    return this.control.engageKillSwitch(reason);
  }

  releaseKillSwitch() {
    return this.control.releaseKillSwitch();
  }

  async proceedStep(gateId: string, note: string) {
    await this.control.assertRuntimeActive();
    const runId = await this.repository.approveStepGate(gateId, note);
    return presentRun(await this.engine.execute(runId));
  }

  async resumeHalted() {
    await this.control.assertRuntimeActive();
    const ids = await this.repository.runIdsWithStatus(["halted"]);
    const resumed: string[] = [];
    for (const runId of ids) {
      await this.engine.execute(runId);
      resumed.push(runId);
    }
    return { resumed, control: await this.control.snapshot() };
  }

  async approvals() {
    return this.repository.pendingApprovals();
  }

  async actions(limit: number, runId?: string) {
    return this.actionService.list(limit, runId);
  }

  async commander() {
    const [decisionRoom, platform] = await Promise.all([
      this.decisions.commander(),
      this.readinessService.snapshot(),
    ]);
    return { ...decisionRoom, platform };
  }

  memory(limit?: number) {
    return this.decisions.memory(limit);
  }

  knowledgeGraph(limit?: number) {
    return this.decisions.knowledgeGraph(limit);
  }

  readiness() {
    return this.readinessService.snapshot();
  }

  async commanderRisk(riskKey: string) {
    const risk = await this.decisions.risk(riskKey);
    if (!risk) throw new AppError("DECISION_RISK_NOT_FOUND", 404, "This risk is no longer active in current ERP data.");
    return risk;
  }

  async startCommanderRisk(riskKey: string, idempotencyKey: string) {
    const risk = await this.commanderRisk(riskKey);
    const result = await this.start({
      graphKey: "operations.controlled-action-mission",
      goal: `Resolve ${risk.title} safely: ${risk.plainSummary}`,
      missionInput: {
        trigger: {
          mode: "decision_commander",
          riskKey: risk.key,
          riskKind: risk.kind,
          severity: risk.severity,
          detectedAt: new Date().toISOString(),
        },
        risk,
        permittedRecoveryOptions: risk.recoveryOptions,
        consequenceBoundary:
          "Prepare governed work only. A named person must approve every consequential action.",
      },
      idempotencyKey,
      idempotencyIdentity: {
        source: "decision_commander",
        riskKey: risk.key,
        riskKind: risk.kind,
      },
    });
    await this.decisions.persistRiskEvidence(risk, result.run.id);
    return result;
  }

  outcomes(limit?: number) {
    return this.decisions.outcomes(limit);
  }

  recordOutcome(input: OutcomeInput) {
    return this.decisions.recordOutcome(input);
  }

  async decideApproval(
    approvalId: string,
    decision: "approved" | "rejected",
    note: string,
  ) {
    await this.control.assertRuntimeActive();
    const result = await this.repository.decideApproval(
      approvalId,
      decision,
      note,
    );
    const state = result.approved
      ? await this.engine.execute(result.runId)
      : await this.repository.get(result.runId);
    return presentRun(state);
  }
}

function presentRun(state: Awaited<ReturnType<AgentRunRepository["get"]>>) {
  return {
    run: state.run,
    nodes: state.nodes,
    approvals: state.approvals,
    events: state.events,
    checkpoints: state.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      sequence: checkpoint.sequence,
      reason: checkpoint.reason,
      createdAt: checkpoint.createdAt,
    })),
  };
}
