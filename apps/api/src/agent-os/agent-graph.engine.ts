import { Inject, Injectable } from "@nestjs/common";
import {
  AppError,
  conditionMatches,
  readyAgentNodes,
  validateAgentGraph,
  valueAtPath,
  type AgentGraphDefinition,
  type AgentGraphNodeDefinition,
  type AgentNodeStatus,
} from "@ind-core/platform";
import { AI_GOVERNANCE } from "../ai/ai.tokens.js";
import type { AiGovernance } from "../ai/governance.port.js";
import { AgentRegistryService } from "./agent-registry.service.js";
import {
  AgentRunRepository,
  type AgentRunState,
} from "./agent-run.repository.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { DeterministicAgentReasoner } from "./agent-reasoner.service.js";
import { AgentControlService } from "./agent-control.service.js";

const TERMINAL_RUNS = new Set(["completed", "failed", "cancelled"]);

/**
 * True only for the PER-OPERATOR RBAC refusal raised by AgentAuthorizationService — the
 * running user does not hold the capability's permission.
 *
 * `AGENT_CAPABILITY_FORBIDDEN` is deliberately NOT included. That one means the registered
 * graph names a capability its own agent may never invoke: a static misconfiguration that
 * is identical for every operator and must fail loudly rather than quietly skip on every
 * single run.
 */
function isAuthorizationDenial(error: unknown): boolean {
  return error instanceof AppError && error.code === "AGENT_TOOL_FORBIDDEN";
}

@Injectable()
export class AgentGraphEngine {
  private readonly activeRuns = new Set<string>();

  constructor(
    @Inject(AI_GOVERNANCE) private readonly governance: AiGovernance,
    private readonly repository: AgentRunRepository,
    private readonly agents: AgentRegistryService,
    private readonly capabilities: CapabilityRegistryService,
    private readonly reasoner: DeterministicAgentReasoner,
    private readonly control: AgentControlService,
  ) {}

  async execute(runId: string): Promise<AgentRunState> {
    if (this.activeRuns.has(runId)) return this.repository.get(runId);
    this.activeRuns.add(runId);
    try {
      let state = await this.repository.get(runId);
      if (TERMINAL_RUNS.has(state.run.status)) return state;
      if (state.nodes.some((node) => node.status === "waiting_approval")) {
        return state;
      }
      await this.repository.recoverInterruptedNodes(runId);

      const gate = await this.governance.check("agent-os.runtime");
      if (!gate.allowed) {
        if (gate.reason === "kill_switch") {
          await this.repository.haltRun(runId, "Global AI kill switch engaged.");
          return this.repository.get(runId);
        }
        await this.repository.failRun(
          runId,
          new AppError(
            "AGENT_OS_REFUSED",
            403,
            `Agent OS execution was refused (${gate.reason ?? "governance"}).`,
          ),
        );
        return this.repository.get(runId);
      }

      const graph = state.run.graphSnapshot as unknown as AgentGraphDefinition;
      const validation = validateAgentGraph(graph);
      if (!validation.valid) {
        await this.repository.failRun(
          runId,
          new AppError(
            "AGENT_GRAPH_INVALID",
            500,
            validation.errors.join("; "),
          ),
        );
        return this.repository.get(runId);
      }
      await this.repository.markRunRunning(runId);

      for (;;) {
        state = await this.repository.get(runId);
        if (TERMINAL_RUNS.has(state.run.status)) return state;
        const runtimeGate = await this.control.runtimeGate();
        if (!runtimeGate.allowed) {
          await this.repository.haltRun(
            runId,
            runtimeGate.reason ?? "Global AI kill switch engaged.",
          );
          return this.repository.get(runId);
        }
        if (new Date() >= state.run.timeoutAt) {
          await this.repository.failRun(
            runId,
            new AppError(
              "AGENT_RUN_TIMEOUT",
              408,
              "The mission exceeded its execution timeout.",
            ),
          );
          return this.repository.get(runId);
        }
        if (state.nodes.some((node) => node.status === "failed")) {
          await this.repository.failRun(
            runId,
            new AppError(
              "AGENT_NODE_FAILED",
              500,
              "A graph node failed; the mission stopped safely.",
            ),
          );
          return this.repository.get(runId);
        }

        const statuses = this.repository.statusRecord(state);
        if (allNodesTerminal(statuses)) {
          const finalNode = [...graph.nodes]
            .reverse()
            .find((node) => statuses[node.id] === "succeeded");
          const outputs = this.repository.outputRecord(state);
          await this.repository.completeRun(runId, {
            graphKey: graph.key,
            graphVersion: graph.version,
            finalNodeId: finalNode?.id ?? null,
            result: finalNode ? outputs[finalNode.id] : null,
          });
          return this.repository.get(runId);
        }

        const readyIds = readyAgentNodes(graph, statuses);
        if (readyIds.length === 0) {
          if (state.nodes.some((node) => node.status === "waiting_approval")) {
            return state;
          }
          await this.repository.failRun(
            runId,
            new AppError(
              "AGENT_GRAPH_DEADLOCK",
              500,
              "No graph node can make progress.",
            ),
          );
          return this.repository.get(runId);
        }

        if (!(await this.control.allowWave(runId, readyIds))) {
          return this.repository.get(runId);
        }

        const outputs = this.repository.outputRecord(state);
        const readyNodes = readyIds
          .map((id) => graph.nodes.find((node) => node.id === id))
          .filter((node): node is AgentGraphNodeDefinition => Boolean(node));

        await Promise.all(
          readyNodes.map(async (node) => {
            if (node.condition) {
              const source = outputs[node.condition.nodeId];
              if (!conditionMatches(node.condition, source)) {
                await this.repository.skipNode(
                  runId,
                  node.id,
                  "condition_not_met",
                );
                return;
              }
            }
            // No input, no work. A node whose every dependency was skipped has nothing to
            // reason over, so running it would invent an assessment from an empty evidence
            // set — the one thing this system must never do. A node with even ONE succeeded
            // dependency still runs: the eight-way evidence join proceeds on seven live
            // specialists and records the eighth as unavailable.
            if (
              node.dependsOn.length > 0 &&
              node.dependsOn.every((dep) => statuses[dep] === "skipped")
            ) {
              await this.repository.skipNode(
                runId,
                node.id,
                "dependencies_skipped",
              );
              return;
            }
            await this.executeNode(state, graph, node, outputs);
          }),
        );
        await this.repository.checkpoint(
          runId,
          `wave_completed:${readyIds.join(",")}`,
        );
      }
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  private async executeNode(
    state: AgentRunState,
    graph: AgentGraphDefinition,
    node: AgentGraphNodeDefinition,
    outputs: Record<string, unknown>,
  ): Promise<void> {
    const dependencies = Object.fromEntries(
      node.dependsOn.map((id) => [id, outputs[id]]),
    );
    const priorAttempt =
      state.nodes.find((candidate) => candidate.nodeId === node.id)?.attempt ??
      0;
    if (priorAttempt >= (node.maxAttempts ?? 1)) {
      await this.repository.failNode(
        state.run.id,
        node.id,
        new AppError(
          "AGENT_NODE_RETRY_EXHAUSTED",
          409,
          `Node '${node.id}' exhausted its bounded retry allowance.`,
        ),
      );
      return;
    }
    await this.repository.startNode(state.run.id, node.id, {
      dependencyNodeIds: node.dependsOn,
      missionInput: state.run.input as Record<string, unknown>,
    });
    try {
      switch (node.kind) {
        case "capability": {
          const descriptor = this.capabilities.get(node.capabilityKey);
          const approvalNodeId = descriptor.sideEffecting
            ? approvedApprovalAncestor(graph, node.id, outputs)
            : undefined;
          if (descriptor.sideEffecting && !approvalNodeId) {
            throw new AppError(
              "AGENT_ACTION_APPROVAL_REQUIRED",
              409,
              `Capability '${node.capabilityKey}' cannot execute before an approved human gate.`,
            );
          }
          let output: unknown;
          try {
            output = await this.capabilities.invoke(
              node.agentKey,
              node.capabilityKey,
              node.input ?? {},
              {
                runId: state.run.id,
                nodeId: node.id,
                approvalNodeId,
              },
            );
          } catch (error) {
            // A READ-ONLY evidence source that this operator is not entitled to must not
            // sink the mission. The graph is one shape for everyone, but authority is per
            // person: ACHILES' platform health is XELOR-internal and a plant operations
            // lead deliberately cannot read it (migration 0070 grants it to xelor_admin,
            // it_admin and demo_admin only). Failing the whole run there means the mission
            // never reaches its human approval gate — the decision a person was waiting to
            // make is lost because of a permission they were never meant to hold.
            //
            // The skip is RECORDED, not hidden: `capability_not_permitted` reaches the
            // evidence join and the brief, so the mission says it did not see this source
            // rather than implying it did. An agent still cannot widen a user's authority —
            // the operator sees nothing they could not already see.
            //
            // Anything that ACTS keeps failing hard. A side-effecting capability that is
            // refused is a control that fired, and the mission must stop.
            if (!descriptor.sideEffecting && isAuthorizationDenial(error)) {
              await this.repository.skipNode(
                state.run.id,
                node.id,
                "capability_not_permitted",
              );
              return;
            }
            throw error;
          }
          await this.repository.succeedNode(state.run.id, node.id, {
            capabilityKey: node.capabilityKey,
            agentKey: node.agentKey,
            mode: descriptor.sideEffecting ? "approved_execute" : "live_read",
            data: output,
          });
          return;
        }
        case "agent": {
          const output = await this.reasoner.complete({
            agent: this.agents.get(node.agentKey),
            node,
            goal: state.run.goal,
            missionInput: state.run.input as Record<string, unknown>,
            dependencies,
          });
          await this.repository.succeedNode(state.run.id, node.id, output);
          return;
        }
        case "verification": {
          const result = await this.reasoner.complete({
            agent: this.agents.get("HEXA"),
            node,
            goal: state.run.goal,
            missionInput: state.run.input as Record<string, unknown>,
            dependencies,
          });
          // Verification covers only work that precedes this node. A Phase 3 graph has a
          // read-only preflight before approval and an execution verification afterwards;
          // inspecting future capability nodes would make the preflight fail merely because
          // an approved write exists later in the immutable graph.
          const ancestors = ancestorNodeIds(graph, node.id);
          const capabilityNodes = graph.nodes.filter(
            (
              candidate,
            ): candidate is Extract<
              AgentGraphNodeDefinition,
              { kind: "capability" }
            > =>
              candidate.kind === "capability" && ancestors.has(candidate.id),
          );
          const descriptors = capabilityNodes.map((candidate) =>
            this.capabilities.get(candidate.capabilityKey),
          );
          const sideEffectNodes = capabilityNodes.filter((candidate) =>
            this.capabilities.get(candidate.capabilityKey).sideEffecting,
          );
          const computedChecks = {
            registeredCapabilities:
              descriptors.length === capabilityNodes.length,
            tenantScopedServiceBoundary: descriptors.every(
              (descriptor) => descriptor.executionBoundary === "domain_service",
            ),
            sideEffectPolicySatisfied: sideEffectNodes.every((candidate) =>
              Boolean(approvedApprovalAncestor(graph, candidate.id, outputs)),
            ),
            evidencePresent: node.dependsOn.every(
              (dependency) => dependencies[dependency] != null,
            ),
          };
          const passed = Object.values(computedChecks).every(Boolean);
          if (!passed) {
            throw new AppError(
              "AGENT_VERIFICATION_FAILED",
              409,
              "HEXA rejected the mission evidence.",
            );
          }
          await this.repository.succeedNode(state.run.id, node.id, {
            ...result,
            passed,
            declaredChecks: node.checks,
            computedChecks,
          });
          return;
        }
        case "transform": {
          await this.repository.succeedNode(state.run.id, node.id, {
            operation: node.operation,
            sources: node.dependsOn,
            data: dependencies,
          });
          return;
        }
        case "branch": {
          const value = valueAtPath(outputs[node.sourceNodeId], node.path);
          const selected =
            node.cases[String(value)] ?? node.defaultCase ?? null;
          await this.repository.succeedNode(state.run.id, node.id, {
            value,
            selected,
          });
          return;
        }
        case "approval": {
          await this.repository.waitForApproval(state.run.id, node.id, {
            title: node.title,
            risk: node.risk,
            proposedAction: node.proposedAction,
            proposed: {
              goal: state.run.goal,
              evidenceNodeIds: node.dependsOn,
              graph: `${graph.key}@${graph.version}`,
            },
          });
          return;
        }
      }
    } catch (error) {
      const attemptJustMade = priorAttempt + 1;
      if (attemptJustMade < (node.maxAttempts ?? 1)) {
        await this.repository.retryNode(state.run.id, node.id, error);
      } else {
        await this.repository.failNode(state.run.id, node.id, error);
      }
    }
  }
}

function ancestorNodeIds(
  graph: AgentGraphDefinition,
  nodeId: string,
): Set<string> {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const found = new Set<string>();
  const pending = [...(byId.get(nodeId)?.dependsOn ?? [])];
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (!candidate || found.has(candidate)) continue;
    found.add(candidate);
    pending.push(...(byId.get(candidate)?.dependsOn ?? []));
  }
  return found;
}

function approvedApprovalAncestor(
  graph: AgentGraphDefinition,
  nodeId: string,
  outputs: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const ancestorId of ancestorNodeIds(graph, nodeId)) {
    const definition = graph.nodes.find((node) => node.id === ancestorId);
    if (
      definition?.kind === "approval" &&
      valueAtPath(outputs[ancestorId], "decision.approved") === true
    ) {
      return ancestorId;
    }
  }
  return undefined;
}

function allNodesTerminal(statuses: Record<string, AgentNodeStatus>): boolean {
  const values = Object.values(statuses);
  return (
    values.length > 0 &&
    values.every((status) =>
      ["succeeded", "skipped", "cancelled"].includes(status),
    )
  );
}
