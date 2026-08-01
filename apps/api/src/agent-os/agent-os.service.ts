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
  ) {}

  catalogue() {
    return {
      runtime: {
        status: "live",
        providerMode: this.reasoner.mode,
        providerDisclosure:
          "Orchestration, ERP reads, approval gates and governed action dispatch are live. Language reasoning is deterministic; no external model API or connector is active.",
        autonomyMode: "approval_bound",
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
  }) {
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
          input: input.missionInput,
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
    return presentRun(await this.engine.execute(runId));
  }

  async approvals() {
    return this.repository.pendingApprovals();
  }

  async actions(limit: number, runId?: string) {
    return this.actionService.list(limit, runId);
  }

  commander() {
    return this.decisions.commander();
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
