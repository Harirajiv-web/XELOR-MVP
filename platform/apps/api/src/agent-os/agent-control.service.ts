import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import {
  AppError,
  currentTenant,
  newId,
  type AgentGraphDefinition,
} from "@ind-core/platform";
import { AuditLogService } from "../common/audit-log.service.js";
import { AiRegistryService } from "../modules/aiops/registry.service.js";
import { AgentRunRepository } from "./agent-run.repository.js";

const { agentControlPolicy } = schema;

export type AgentAutonomyMode = "autonomous_guarded" | "step_by_step";

@Injectable()
export class AgentControlService {
  constructor(
    private readonly registry: AiRegistryService,
    private readonly repository: AgentRunRepository,
    private readonly audit: AuditLogService,
  ) {}

  async policy(): Promise<{
    mode: AgentAutonomyMode;
    changedReason: string;
    changedAt: Date | null;
    changedBy: string | null;
  }> {
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(agentControlPolicy).limit(1);
      return row
        ? {
            mode: row.mode as AgentAutonomyMode,
            changedReason: row.changedReason,
            changedAt: row.changedAt,
            changedBy: row.changedBy,
          }
        : {
            mode: "autonomous_guarded",
            changedReason: "Default guarded autonomy; mandatory human approvals remain enforced.",
            changedAt: null,
            changedBy: null,
          };
    });
  }

  async setMode(mode: AgentAutonomyMode, reason: string) {
    const { tenantId, actorId } = currentTenant();
    const policyId = newId();
    const now = new Date();
    await withTenant(async (tx) => {
      await tx
        .insert(agentControlPolicy)
        .values({
          id: policyId,
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          mode,
          changedReason: reason,
          changedAt: now,
          changedBy: actorId,
        })
        .onConflictDoUpdate({
          target: [agentControlPolicy.tenantId],
          set: {
            mode,
            changedReason: reason,
            changedAt: now,
            changedBy: actorId,
            updatedAt: now,
            updatedBy: actorId,
          },
        });
      const [saved] = await tx
        .select({ id: agentControlPolicy.id })
        .from(agentControlPolicy)
        .where(eq(agentControlPolicy.tenantId, tenantId))
        .limit(1);
      await this.audit.appendInTx(tx, {
        action: "agentos.control.mode_changed",
        entityType: "agent_control_policy",
        entityId: saved?.id ?? policyId,
        data: { mode, reason },
      });
    });
    return this.policy();
  }

  async runtimeGate(): Promise<{ allowed: boolean; reason: string | null }> {
    const state = (await this.registry.killSwitchState("agent-os.runtime")) as {
      routingAllowed?: boolean;
      reason?: string;
    };
    return {
      allowed: state.routingAllowed !== false,
      reason: typeof state.reason === "string" ? state.reason : null,
    };
  }

  async assertRuntimeActive(): Promise<void> {
    const gate = await this.runtimeGate();
    if (!gate.allowed) {
      throw new AppError(
        "AGENT_AUTOMATION_STOPPED",
        423,
        `Agent automation is stopped by the global kill switch${gate.reason ? `: ${gate.reason}` : "."}`,
      );
    }
  }

  async allowWave(runId: string, nodeIds: readonly string[]): Promise<boolean> {
    const policy = await this.policy();
    if (policy.mode === "autonomous_guarded") return true;
    const waveKey = createHash("sha256")
      .update([...nodeIds].sort().join("|"))
      .digest("hex");
    const gate = await this.repository.requestStepGate(runId, waveKey, nodeIds);
    return gate.approved;
  }

  async engageKillSwitch(reason: string) {
    await this.registry.engageKillSwitch({ featureKey: null, reason });
    const haltedRuns = await this.repository.haltActiveRuns(reason);
    return { haltedRuns, ...(await this.snapshot()) };
  }

  async releaseKillSwitch() {
    await this.registry.releaseKillSwitch(null);
    return this.snapshot();
  }

  async snapshot() {
    const policy = await this.policy();
    const gate = await this.runtimeGate();
    const raw = await this.repository.controlSnapshot(12);

    const runs = raw.runs.map((run) => {
      const graph = run.graphSnapshot as unknown as AgentGraphDefinition;
      const definitions = new Map(graph.nodes.map((node) => [node.id, node]));
      const nodes = raw.nodes
        .filter((node) => node.runId === run.id)
        .map((node) => ({
          ...node,
          dependsOn: definitions.get(node.nodeId)?.dependsOn ?? [],
        }));
      const approvals = raw.approvals.filter((approval) => approval.runId === run.id);
      const stepGates = raw.stepGates.filter((step) => step.runId === run.id);
      const latestEvent = raw.events.find((event) => event.runId === run.id) ?? null;
      return {
        id: run.id,
        graphKey: run.graphKey,
        goal: run.goal,
        status: run.status,
        consumedSteps: run.consumedSteps,
        maxSteps: run.maxSteps,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
        nodes,
        approvals,
        stepGates,
        latestEvent,
      };
    });

    const activeStatuses = new Set(["pending", "running", "waiting_step", "waiting_approval", "halted"]);
    const activeRuns = runs.filter((run) => activeStatuses.has(run.status));
    return {
      checkedAt: new Date().toISOString(),
      automation: {
        status: gate.allowed ? "active" : "stopped",
        manualErpAvailable: true,
        reason: gate.reason,
      },
      policy,
      summary: {
        activeRuns: activeRuns.filter((run) => run.status !== "halted").length,
        haltedRuns: activeRuns.filter((run) => run.status === "halted").length,
        workingAgents: activeRuns.flatMap((run) => run.nodes).filter((node) => node.status === "running").length,
        waitingForProceed: raw.stepGates.filter((step) => step.status === "pending").length,
        mandatoryApprovals: raw.approvals.filter((approval) => approval.status === "pending").length,
      },
      permissions: [
        { key: "agentos.run.read", purpose: "View control state and workflow activity" },
        { key: "agentos.run.operate", purpose: "Choose autonomy mode, proceed and resume missions" },
        { key: "agentos.approval.decide", purpose: "Decide mandatory business approvals" },
        { key: "aiops.killswitch.operate", purpose: "Stop or release all AI automation" },
      ],
      runs,
    };
  }
}
