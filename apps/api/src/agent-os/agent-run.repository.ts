import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  currentTenant,
  newId,
  type AgentGraphDefinition,
  type AgentNodeStatus,
} from "@ind-core/platform";
import { AuditLogService } from "../common/audit-log.service.js";

const {
  agentGraphDefinition,
  agentRun,
  agentNodeRun,
  agentCheckpoint,
  agentApproval,
  agentRunEvent,
} = schema;

export interface AgentRunState {
  run: typeof agentRun.$inferSelect;
  nodes: Array<typeof agentNodeRun.$inferSelect>;
  approvals: Array<typeof agentApproval.$inferSelect>;
  events: Array<typeof agentRunEvent.$inferSelect>;
  checkpoints: Array<typeof agentCheckpoint.$inferSelect>;
}

@Injectable()
export class AgentRunRepository {
  constructor(private readonly audit: AuditLogService) {}

  async create(input: {
    graph: AgentGraphDefinition;
    graphHash: string;
    goal: string;
    missionInput: Record<string, unknown>;
    idempotencyKey: string;
    requestFingerprint: string;
    providerMode: string;
  }): Promise<{ runId: string; replayed: boolean }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [existing] = await tx
        .select()
        .from(agentRun)
        .where(
          and(
            eq(agentRun.tenantId, tenantId),
            eq(agentRun.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.requestFingerprint !== input.requestFingerprint)
          throw Errors.idempotencyMismatch();
        return { runId: existing.id, replayed: true };
      }

      const [persistedGraph] = await tx
        .select({
          id: agentGraphDefinition.id,
          contentHash: agentGraphDefinition.contentHash,
        })
        .from(agentGraphDefinition)
        .where(
          and(
            eq(agentGraphDefinition.graphKey, input.graph.key),
            eq(agentGraphDefinition.version, input.graph.version),
          ),
        )
        .limit(1);
      if (persistedGraph && persistedGraph.contentHash !== input.graphHash) {
        throw new AppError(
          "AGENT_GRAPH_VERSION_CONFLICT",
          409,
          `Graph '${input.graph.key}' version ${input.graph.version} has different persisted content.`,
        );
      }
      if (!persistedGraph) {
        await tx.insert(agentGraphDefinition).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          graphKey: input.graph.key,
          version: input.graph.version,
          name: input.graph.name,
          description: input.graph.description,
          spec: input.graph as unknown as Record<string, unknown>,
          contentHash: input.graphHash,
          status: "active",
        });
      }

      const runId = newId();
      const now = new Date();
      await tx.insert(agentRun).values({
        id: runId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        graphKey: input.graph.key,
        graphVersion: input.graph.version,
        goal: input.goal,
        input: input.missionInput,
        graphSnapshot: input.graph as unknown as Record<string, unknown>,
        status: "pending",
        providerMode: input.providerMode,
        maxSteps: input.graph.maxSteps,
        consumedSteps: 0,
        timeoutAt: new Date(now.getTime() + input.graph.timeoutSeconds * 1000),
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
      });
      await tx.insert(agentNodeRun).values(
        input.graph.nodes.map((node) => ({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          runId,
          nodeId: node.id,
          nodeName: node.name,
          nodeKind: node.kind,
          agentKey: "agentKey" in node ? node.agentKey : null,
          capabilityKey: node.kind === "capability" ? node.capabilityKey : null,
          status: "pending",
          attempt: 0,
          input: {},
        })),
      );
      await this.appendEventInTx(tx, runId, "run.created", null, {
        graphKey: input.graph.key,
        graphVersion: input.graph.version,
        providerMode: input.providerMode,
      });
      await this.appendCheckpointInTx(tx, runId, "run_created");
      await this.audit.appendInTx(tx, {
        action: "agentos.run.created",
        entityType: "agent_run",
        entityId: runId,
        data: { graphKey: input.graph.key, graphVersion: input.graph.version },
      });
      return { runId, replayed: false };
    });
  }

  async get(runId: string): Promise<AgentRunState> {
    return withTenant(async (tx) => {
      const [run] = await tx
        .select()
        .from(agentRun)
        .where(eq(agentRun.id, runId))
        .limit(1);
      if (!run) throw Errors.notFound(`agent run ${runId}`);
      // `withTenant` pins these reads to one PostgreSQL client so the tenant setting and
      // transaction remain atomic. A pg Client cannot execute concurrent queries safely;
      // keep them sequential instead of triggering pg's concurrent-query deprecation.
      const nodes = await tx
        .select()
        .from(agentNodeRun)
        .where(eq(agentNodeRun.runId, runId))
        .orderBy(asc(agentNodeRun.createdAt));
      const approvals = await tx
        .select()
        .from(agentApproval)
        .where(eq(agentApproval.runId, runId))
        .orderBy(asc(agentApproval.createdAt));
      const events = await tx
        .select()
        .from(agentRunEvent)
        .where(eq(agentRunEvent.runId, runId))
        .orderBy(asc(agentRunEvent.sequence));
      const checkpoints = await tx
        .select()
        .from(agentCheckpoint)
        .where(eq(agentCheckpoint.runId, runId))
        .orderBy(asc(agentCheckpoint.sequence));
      return { run, nodes, approvals, events, checkpoints };
    });
  }

  async list(limit: number): Promise<Array<typeof agentRun.$inferSelect>> {
    return withTenant((tx) =>
      tx.select().from(agentRun).orderBy(desc(agentRun.createdAt)).limit(limit),
    );
  }

  async pendingApprovals(): Promise<Array<typeof agentApproval.$inferSelect>> {
    return withTenant((tx) =>
      tx
        .select()
        .from(agentApproval)
        .where(eq(agentApproval.status, "pending"))
        .orderBy(asc(agentApproval.createdAt)),
    );
  }

  async markRunRunning(runId: string): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      const changed = await tx
        .update(agentRun)
        .set({
          status: "running",
          startedAt: sql`coalesce(${agentRun.startedAt}, now())`,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentRun.id, runId),
            sql`${agentRun.status} in ('pending','waiting_approval')`,
          ),
        )
        .returning({ id: agentRun.id });
      if (changed.length > 0) {
        await this.appendEventInTx(tx, runId, "run.running", null, {});
      }
    });
  }

  /**
   * A process can disappear after persisting `running` and before persisting the result.
   * On resume, reclaim those nodes as pending attempts. The engine's in-process run lock
   * prevents this from racing a healthy execution in the modular-monolith deployment.
   */
  async recoverInterruptedNodes(runId: string): Promise<number> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const recovered = await tx
        .update(agentNodeRun)
        .set({
          status: "pending",
          startedAt: null,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.status, "running"),
          ),
        )
        .returning({ nodeId: agentNodeRun.nodeId });
      if (recovered.length > 0) {
        await this.appendEventInTx(tx, runId, "run.recovered", null, {
          nodeIds: recovered.map((node) => node.nodeId),
        });
      }
      return recovered.length;
    });
  }

  async startNode(
    runId: string,
    nodeId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      const updated = await tx
        .update(agentNodeRun)
        .set({
          status: "running",
          input,
          attempt: sql`${agentNodeRun.attempt} + 1`,
          startedAt: new Date(),
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            eq(agentNodeRun.status, "pending"),
          ),
        )
        .returning({ id: agentNodeRun.id });
      if (updated.length === 0) {
        throw new AppError(
          "AGENT_NODE_NOT_READY",
          409,
          `Node '${nodeId}' is not pending.`,
        );
      }
      const budget = await tx
        .update(agentRun)
        .set({
          consumedSteps: sql`${agentRun.consumedSteps} + 1`,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentRun.id, runId),
            sql`${agentRun.consumedSteps} < ${agentRun.maxSteps}`,
          ),
        )
        .returning({ id: agentRun.id });
      if (budget.length === 0) {
        throw new AppError(
          "AGENT_STEP_BUDGET_EXHAUSTED",
          409,
          "The mission step budget is exhausted.",
        );
      }
      await this.appendEventInTx(tx, runId, "node.started", nodeId, {});
    });
  }

  async succeedNode(
    runId: string,
    nodeId: string,
    output: unknown,
  ): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      await tx
        .update(agentNodeRun)
        .set({
          status: "succeeded",
          output: output as object,
          completedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            eq(agentNodeRun.status, "running"),
          ),
        );
      await this.appendEventInTx(tx, runId, "node.succeeded", nodeId, {});
    });
  }

  async skipNode(runId: string, nodeId: string, reason: string): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      await tx
        .update(agentNodeRun)
        .set({
          status: "skipped",
          output: { reason },
          completedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            eq(agentNodeRun.status, "pending"),
          ),
        );
      await this.appendEventInTx(tx, runId, "node.skipped", nodeId, { reason });
    });
  }

  async failNode(runId: string, nodeId: string, error: unknown): Promise<void> {
    const { actorId } = currentTenant();
    const detail = safeError(error);
    await withTenant(async (tx) => {
      await tx
        .update(agentNodeRun)
        .set({
          status: "failed",
          errorCode: detail.code,
          errorMessage: detail.message,
          completedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(eq(agentNodeRun.runId, runId), eq(agentNodeRun.nodeId, nodeId)),
        );
      await this.appendEventInTx(tx, runId, "node.failed", nodeId, detail);
    });
  }

  async retryNode(
    runId: string,
    nodeId: string,
    error: unknown,
  ): Promise<void> {
    const { actorId } = currentTenant();
    const detail = safeError(error);
    await withTenant(async (tx) => {
      await tx
        .update(agentNodeRun)
        .set({
          status: "pending",
          errorCode: detail.code,
          errorMessage: detail.message,
          completedAt: null,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            eq(agentNodeRun.status, "running"),
          ),
        );
      await this.appendEventInTx(
        tx,
        runId,
        "node.retry_scheduled",
        nodeId,
        detail,
      );
    });
  }

  async waitForApproval(
    runId: string,
    nodeId: string,
    request: {
      title: string;
      risk: string;
      proposedAction: string;
      proposed: unknown;
    },
  ): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    await withTenant(async (tx) => {
      const existing = await tx
        .select({ id: agentApproval.id })
        .from(agentApproval)
        .where(
          and(eq(agentApproval.runId, runId), eq(agentApproval.nodeId, nodeId)),
        )
        .limit(1);
      if (existing.length === 0) {
        await tx.insert(agentApproval).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          runId,
          nodeId,
          title: request.title,
          risk: request.risk,
          proposedAction: request.proposedAction,
          proposed: request.proposed as object,
          status: "pending",
        });
      }
      await tx
        .update(agentNodeRun)
        .set({
          status: "waiting_approval",
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(eq(agentNodeRun.runId, runId), eq(agentNodeRun.nodeId, nodeId)),
        );
      await tx
        .update(agentRun)
        .set({
          status: "waiting_approval",
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(eq(agentRun.id, runId));
      await this.appendEventInTx(tx, runId, "approval.requested", nodeId, {
        title: request.title,
        risk: request.risk,
      });
      await this.appendCheckpointInTx(tx, runId, "waiting_for_approval");
    });
  }

  async decideApproval(
    approvalId: string,
    decision: "approved" | "rejected",
    note: string,
  ): Promise<{ runId: string; nodeId: string; approved: boolean }> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [approval] = await tx
        .select()
        .from(agentApproval)
        .where(eq(agentApproval.id, approvalId))
        .limit(1);
      if (!approval) throw Errors.notFound(`agent approval ${approvalId}`);
      if (approval.status !== "pending") {
        throw new AppError(
          "APPROVAL_ALREADY_DECIDED",
          409,
          "This approval has already been decided.",
        );
      }
      const approved = decision === "approved";
      const now = new Date();
      await tx
        .update(agentApproval)
        .set({
          status: decision,
          decisionNote: note,
          decidedBy: actorId,
          decidedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(eq(agentApproval.id, approvalId));
      await tx
        .update(agentNodeRun)
        .set({
          status: approved ? "succeeded" : "cancelled",
          output: {
            decision: {
              approved,
              note,
              decidedBy: actorId,
              decidedAt: now.toISOString(),
            },
          },
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, approval.runId),
            eq(agentNodeRun.nodeId, approval.nodeId),
          ),
        );
      await this.appendEventInTx(
        tx,
        approval.runId,
        `approval.${decision}`,
        approval.nodeId,
        { note },
      );
      await this.audit.appendInTx(tx, {
        action: `agentos.approval.${decision}`,
        entityType: "agent_approval",
        entityId: approval.id,
        data: { runId: approval.runId, nodeId: approval.nodeId, note },
      });
      if (!approved) {
        await tx
          .update(agentRun)
          .set({
            status: "cancelled",
            completedAt: now,
            updatedAt: now,
            updatedBy: actorId,
          })
          .where(eq(agentRun.id, approval.runId));
        await this.appendEventInTx(
          tx,
          approval.runId,
          "run.cancelled",
          approval.nodeId,
          {
            reason: "approval_rejected",
          },
        );
      }
      return { runId: approval.runId, nodeId: approval.nodeId, approved };
    });
  }

  async checkpoint(runId: string, reason: string): Promise<void> {
    await withTenant((tx) => this.appendCheckpointInTx(tx, runId, reason));
  }

  async completeRun(runId: string, output: unknown): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      const now = new Date();
      await tx
        .update(agentRun)
        .set({
          status: "completed",
          output: output as object,
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(eq(agentRun.id, runId));
      await this.appendEventInTx(tx, runId, "run.completed", null, {});
      await this.appendCheckpointInTx(tx, runId, "run_completed");
      await this.audit.appendInTx(tx, {
        action: "agentos.run.completed",
        entityType: "agent_run",
        entityId: runId,
        data: {},
      });
    });
  }

  async failRun(runId: string, error: unknown): Promise<void> {
    const { actorId } = currentTenant();
    const detail = safeError(error);
    await withTenant(async (tx) => {
      const now = new Date();
      await tx
        .update(agentRun)
        .set({
          status: "failed",
          errorCode: detail.code,
          errorMessage: detail.message,
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(eq(agentRun.id, runId));
      await this.appendEventInTx(tx, runId, "run.failed", null, detail);
      await this.appendCheckpointInTx(tx, runId, "run_failed");
    });
  }

  async cancelRun(runId: string, reason: string): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      const [run] = await tx
        .select({ status: agentRun.status })
        .from(agentRun)
        .where(eq(agentRun.id, runId))
        .limit(1);
      if (!run) throw Errors.notFound(`agent run ${runId}`);
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        throw new AppError(
          "AGENT_RUN_TERMINAL",
          409,
          "A terminal run cannot be cancelled.",
        );
      }
      const now = new Date();
      await tx
        .update(agentRun)
        .set({
          status: "cancelled",
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(eq(agentRun.id, runId));
      await tx
        .update(agentNodeRun)
        .set({
          status: "cancelled",
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            sql`${agentNodeRun.status} in ('pending','running','waiting_approval')`,
          ),
        );
      await this.appendEventInTx(tx, runId, "run.cancelled", null, { reason });
      await this.audit.appendInTx(tx, {
        action: "agentos.run.cancelled",
        entityType: "agent_run",
        entityId: runId,
        data: { reason },
      });
    });
  }

  statusRecord(state: AgentRunState): Record<string, AgentNodeStatus> {
    return Object.fromEntries(
      state.nodes.map((node) => [node.nodeId, node.status as AgentNodeStatus]),
    );
  }

  outputRecord(state: AgentRunState): Record<string, unknown> {
    return Object.fromEntries(
      state.nodes.map((node) => [node.nodeId, node.output]),
    );
  }

  private async appendEventInTx(
    tx: Tx,
    runId: string,
    eventType: string,
    nodeId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${runId}))`);
    const [last] = await tx
      .select({ sequence: agentRunEvent.sequence })
      .from(agentRunEvent)
      .where(eq(agentRunEvent.runId, runId))
      .orderBy(desc(agentRunEvent.sequence))
      .limit(1);
    await tx.insert(agentRunEvent).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      runId,
      sequence: (last?.sequence ?? 0) + 1,
      eventType,
      nodeId,
      payload,
    });
  }

  private async appendCheckpointInTx(
    tx: Tx,
    runId: string,
    reason: string,
  ): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${runId}:checkpoint`}))`,
    );
    const [last] = await tx
      .select({ sequence: agentCheckpoint.sequence })
      .from(agentCheckpoint)
      .where(eq(agentCheckpoint.runId, runId))
      .orderBy(desc(agentCheckpoint.sequence))
      .limit(1);
    const [run] = await tx
      .select()
      .from(agentRun)
      .where(eq(agentRun.id, runId))
      .limit(1);
    const nodes = await tx
      .select({
        nodeId: agentNodeRun.nodeId,
        status: agentNodeRun.status,
        attempt: agentNodeRun.attempt,
        output: agentNodeRun.output,
      })
      .from(agentNodeRun)
      .where(eq(agentNodeRun.runId, runId))
      .orderBy(asc(agentNodeRun.createdAt));
    await tx.insert(agentCheckpoint).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      runId,
      sequence: (last?.sequence ?? 0) + 1,
      reason,
      state: {
        run: { status: run?.status, consumedSteps: run?.consumedSteps },
        nodes,
      },
    });
  }
}

function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError)
    return { code: error.code, message: error.message };
  if (error instanceof Error)
    return { code: "AGENT_NODE_ERROR", message: error.message };
  return { code: "AGENT_NODE_ERROR", message: "Unknown node failure." };
}
