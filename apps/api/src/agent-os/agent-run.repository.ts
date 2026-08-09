import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
import {
  AGENT_NODE_EXECUTION_LEASE_MS,
  CANCEL_RUN_SOURCE_STATUSES,
  HALT_RUN_SOURCE_STATUSES,
  LEGACY_AGENT_NODE_STALE_AFTER_MS,
  NODE_EXHAUSTION_SOURCE_STATUS,
  NODE_RESULT_SOURCE_STATUS,
  RUN_COMPLETION_SOURCE_STATUS,
  RUN_FAILURE_SOURCE_STATUSES,
  approvalPausedDeadline,
} from "./agent-transition-policy.js";
import {
  assertFactoryApprovalIntentFresh,
  factoryCommandDigestFromProposal,
} from "../modules/integration/factory-command-approval.js";

const {
  agentGraphDefinition,
  agentRun,
  agentNodeRun,
  agentCheckpoint,
  agentApproval,
  agentRunEvent,
  agentStepGate,
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
    /** Accepted only for replaying rows written by an older fingerprint format. */
    requestFingerprintAliases?: readonly string[];
    providerMode: string;
  }): Promise<{ runId: string; replayed: boolean }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      // Serialize same-key replay and first registration across API replicas. Database
      // uniqueness remains the invariant; these locks make replay/mismatch outcomes
      // deterministic instead of surfacing an incidental unique-constraint error.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`agent-run:${tenantId}:${input.idempotencyKey}`}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`agent-graph:${tenantId}:${input.graph.key}:${input.graph.version}`}))`);
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
        if (
          existing.requestFingerprint !== input.requestFingerprint &&
          !input.requestFingerprintAliases?.includes(existing.requestFingerprint)
        ) {
          throw Errors.idempotencyMismatch();
        }
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

  async runIdsWithStatus(statuses: readonly string[]): Promise<string[]> {
    if (statuses.length === 0) return [];
    return withTenant(async (tx) => {
      const rows = await tx
        .select({ id: agentRun.id })
        .from(agentRun)
        .where(inArray(agentRun.status, [...statuses]));
      return rows.map((row) => row.id);
    });
  }

  /** Bounded metadata-only candidates for the tenant-aware crash-recovery sweep. */
  async recoveryCandidates(limit = 25): Promise<Array<{ id: string; createdBy: string }>> {
    return withTenant((tx) =>
      tx
        .select({ id: agentRun.id, createdBy: agentRun.createdBy })
        .from(agentRun)
        .where(and(
          inArray(agentRun.status, ["pending", "running"]),
          eq(agentRun.isActive, true),
        ))
        .orderBy(asc(agentRun.updatedAt))
        .limit(Math.max(1, Math.min(100, limit))),
    );
  }

  /** A compact, safe operational view for the Control Center — no node payloads. */
  async controlSnapshot(limit = 12) {
    return withTenant(async (tx) => {
      const runs = await tx
        .select()
        .from(agentRun)
        .orderBy(desc(agentRun.createdAt))
        .limit(limit);
      const runIds = runs.map((run) => run.id);
      if (runIds.length === 0) {
        return { runs, nodes: [], approvals: [], stepGates: [], events: [] };
      }
      const nodes = await tx
        .select({
          id: agentNodeRun.id,
          runId: agentNodeRun.runId,
          nodeId: agentNodeRun.nodeId,
          nodeName: agentNodeRun.nodeName,
          nodeKind: agentNodeRun.nodeKind,
          agentKey: agentNodeRun.agentKey,
          capabilityKey: agentNodeRun.capabilityKey,
          status: agentNodeRun.status,
          attempt: agentNodeRun.attempt,
          errorCode: agentNodeRun.errorCode,
          errorMessage: agentNodeRun.errorMessage,
          startedAt: agentNodeRun.startedAt,
          completedAt: agentNodeRun.completedAt,
          createdAt: agentNodeRun.createdAt,
        })
        .from(agentNodeRun)
        .where(inArray(agentNodeRun.runId, runIds))
        .orderBy(asc(agentNodeRun.createdAt));
      const approvals = await tx
        .select({
          id: agentApproval.id,
          runId: agentApproval.runId,
          nodeId: agentApproval.nodeId,
          title: agentApproval.title,
          risk: agentApproval.risk,
          proposedAction: agentApproval.proposedAction,
          status: agentApproval.status,
          createdAt: agentApproval.createdAt,
        })
        .from(agentApproval)
        .where(inArray(agentApproval.runId, runIds))
        .orderBy(desc(agentApproval.createdAt));
      const stepGates = await tx
        .select()
        .from(agentStepGate)
        .where(
          and(
            inArray(agentStepGate.runId, runIds),
            eq(agentStepGate.isActive, true),
          ),
        )
        .orderBy(desc(agentStepGate.requestedAt));
      const events = await tx
        .select({
          id: agentRunEvent.id,
          runId: agentRunEvent.runId,
          sequence: agentRunEvent.sequence,
          eventType: agentRunEvent.eventType,
          nodeId: agentRunEvent.nodeId,
          createdAt: agentRunEvent.createdAt,
        })
        .from(agentRunEvent)
        .where(inArray(agentRunEvent.runId, runIds))
        .orderBy(desc(agentRunEvent.createdAt))
        .limit(80);
      return { runs, nodes, approvals, stepGates, events };
    });
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
            sql`${agentRun.status} in ('pending','waiting_step','waiting_approval','halted')`,
          ),
        )
        .returning({ id: agentRun.id });
      if (changed.length > 0) {
        await this.appendEventInTx(tx, runId, "run.running", null, {});
      }
    });
  }

  async requestStepGate(
    runId: string,
    waveKey: string,
    nodeIds: readonly string[],
  ): Promise<{ approved: boolean; gateId: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${runId}:step-gate`}))`);
      const [existing] = await tx
        .select()
        .from(agentStepGate)
        .where(and(eq(agentStepGate.runId, runId), eq(agentStepGate.waveKey, waveKey)))
        .limit(1);
      if (existing) {
        return { approved: existing.status === "approved", gateId: existing.id };
      }
      const [last] = await tx
        .select({ sequence: agentStepGate.sequence })
        .from(agentStepGate)
        .where(eq(agentStepGate.runId, runId))
        .orderBy(desc(agentStepGate.sequence))
        .limit(1);
      const gateId = newId();
      await tx.insert(agentStepGate).values({
        id: gateId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        runId,
        waveKey,
        sequence: (last?.sequence ?? 0) + 1,
        nodeIds: [...nodeIds],
        status: "pending",
      });
      await tx
        .update(agentRun)
        .set({ status: "waiting_step", updatedAt: new Date(), updatedBy: actorId })
        .where(eq(agentRun.id, runId));
      await this.appendEventInTx(tx, runId, "step.waiting", null, {
        gateId,
        nodeIds: [...nodeIds],
      });
      await this.appendCheckpointInTx(tx, runId, "waiting_for_step_permission");
      return { approved: false, gateId };
    });
  }

  async approveStepGate(gateId: string, note: string): Promise<string> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [gate] = await tx
        .select()
        .from(agentStepGate)
        .where(and(eq(agentStepGate.id, gateId), eq(agentStepGate.isActive, true)))
        .limit(1);
      if (!gate) throw Errors.notFound(`agent step gate ${gateId}`);
      const now = new Date();
      const gateUpdates = await tx
        .update(agentStepGate)
        .set({
          status: "approved",
          decidedBy: actorId,
          decidedAt: now,
          decisionNote: note,
          resumed: true,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(and(
          eq(agentStepGate.id, gateId),
          eq(agentStepGate.status, "pending"),
          eq(agentStepGate.isActive, true),
        ))
        .returning({ id: agentStepGate.id });
      if (gateUpdates.length !== 1) {
        throw new AppError("STEP_ALREADY_PROCEEDED", 409, "This step has already been authorised.");
      }
      const runUpdates = await tx
        .update(agentRun)
        .set({ status: "pending", updatedAt: now, updatedBy: actorId })
        .where(and(eq(agentRun.id, gate.runId), eq(agentRun.status, "waiting_step")))
        .returning({ id: agentRun.id });
      if (runUpdates.length !== 1) {
        // Throwing rolls back the gate CAS above, so a concurrent halt/terminal transition
        // cannot leave a decided Proceed gate on a run that did not resume.
        throw new AppError(
          "STEP_GATE_RUN_STATE_INVALID",
          409,
          "This mission is no longer waiting at this Proceed gate.",
        );
      }
      await this.appendEventInTx(tx, gate.runId, "step.proceeded", null, {
        gateId,
        sequence: gate.sequence,
        note,
      });
      await this.audit.appendInTx(tx, {
        action: "agentos.step.proceeded",
        entityType: "agent_step_gate",
        entityId: gate.id,
        data: { runId: gate.runId, sequence: gate.sequence, note },
      });
      return gate.runId;
    });
  }

  async haltRun(runId: string, reason: string): Promise<boolean> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const now = new Date();
      const changed = await tx
        .update(agentRun)
        .set({ status: "halted", updatedAt: now, updatedBy: actorId })
        .where(and(
          eq(agentRun.id, runId),
          inArray(agentRun.status, [...HALT_RUN_SOURCE_STATUSES]),
        ))
        .returning({ id: agentRun.id });
      if (changed.length === 0) return false;
      await tx
        .update(agentNodeRun)
        .set({
          status: "pending",
          executionToken: null,
          executionLeaseExpiresAt: null,
          startedAt: null,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(and(eq(agentNodeRun.runId, runId), eq(agentNodeRun.status, "running")));
      await this.appendEventInTx(tx, runId, "run.halted", null, { reason });
      await this.appendCheckpointInTx(tx, runId, "kill_switch_halt");
      await this.audit.appendInTx(tx, {
        action: "agentos.run.halted",
        entityType: "agent_run",
        entityId: runId,
        data: { reason },
      });
      return true;
    });
  }

  async haltActiveRuns(reason: string): Promise<number> {
    const ids = await this.runIdsWithStatus(["pending", "running", "waiting_step", "waiting_approval"]);
    let halted = 0;
    for (const id of ids) {
      if (await this.haltRun(id, reason)) halted += 1;
    }
    return halted;
  }

  /** Restore the pre-halt approval lifecycle without changing the waiting node/decision. */
  async restoreApprovalWait(runId: string): Promise<boolean> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const changed = await tx
        .update(agentRun)
        .set({
          status: "waiting_approval",
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(and(eq(agentRun.id, runId), eq(agentRun.status, "halted")))
        .returning({ id: agentRun.id });
      if (changed.length === 0) return false;
      await this.appendEventInTx(tx, runId, "run.approval_wait_restored", null, {});
      return true;
    });
  }

  /**
   * A process can disappear after persisting `running` and before persisting the result.
   * Every new attempt renews a short database lease; reclaim only after that lease expires.
   * The conservative started-at fallback exists solely for pre-lease running rows.
   */
  async recoverInterruptedNodes(runId: string): Promise<number> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const recovered = await tx
        .update(agentNodeRun)
        .set({
          status: "pending",
          executionToken: null,
          executionLeaseExpiresAt: null,
          startedAt: null,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.status, NODE_RESULT_SOURCE_STATUS),
            sql`(
              (${agentNodeRun.executionLeaseExpiresAt} is not null
                and ${agentNodeRun.executionLeaseExpiresAt} < now())
              or
              (${agentNodeRun.executionLeaseExpiresAt} is null
                and ${agentNodeRun.startedAt} < ${new Date(Date.now() - LEGACY_AGENT_NODE_STALE_AFTER_MS)})
            )`,
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
    timeoutAt: Date,
  ): Promise<string> {
    const { actorId } = currentTenant();
    const executionToken = newId();
    return withTenant(async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(agentNodeRun)
        .set({
          status: "running",
          executionToken,
          executionLeaseExpiresAt: new Date(Math.min(
            now.getTime() + AGENT_NODE_EXECUTION_LEASE_MS,
            timeoutAt.getTime(),
          )),
          input,
          attempt: sql`${agentNodeRun.attempt} + 1`,
          startedAt: now,
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
      return executionToken;
    });
  }

  /** Renew only the exact attempt that still owns the running node. */
  async heartbeatNode(
    runId: string,
    nodeId: string,
    executionToken: string,
    timeoutAt: Date,
  ): Promise<boolean> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const now = new Date();
      if (now >= timeoutAt) return false;
      const changed = await tx
        .update(agentNodeRun)
        .set({
          executionLeaseExpiresAt: new Date(Math.min(
            now.getTime() + AGENT_NODE_EXECUTION_LEASE_MS,
            timeoutAt.getTime(),
          )),
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(and(
          eq(agentNodeRun.runId, runId),
          eq(agentNodeRun.nodeId, nodeId),
          eq(agentNodeRun.status, NODE_RESULT_SOURCE_STATUS),
          eq(agentNodeRun.executionToken, executionToken),
        ))
        .returning({ id: agentNodeRun.id });
      return changed.length === 1;
    });
  }

  async succeedNode(
    runId: string,
    nodeId: string,
    output: unknown,
    executionToken: string,
  ): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      const changed = await tx
        .update(agentNodeRun)
        .set({
          status: "succeeded",
          executionToken: null,
          executionLeaseExpiresAt: null,
          output: output as object,
          completedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            eq(agentNodeRun.status, NODE_RESULT_SOURCE_STATUS),
            eq(agentNodeRun.executionToken, executionToken),
          ),
        )
        .returning({ id: agentNodeRun.id });
      if (changed.length > 0) {
        await this.appendEventInTx(tx, runId, "node.succeeded", nodeId, {});
      }
    });
  }

  /**
   * Retire a node that will produce no output, on purpose, with the reason recorded.
   *
   * Both `pending` and `running` are accepted. A node skipped by an unmet `condition` is
   * still pending, but a read-only evidence node the OPERATOR is not entitled to is only
   * discovered to be unavailable after `startNode` has already moved it to `running`.
   * Matching `pending` alone made that second case a silent no-op: the update touched zero
   * rows, the node stayed `running`, and the run deadlocked instead of skipping cleanly.
   */
  async skipNode(
    runId: string,
    nodeId: string,
    reason: string,
    executionToken?: string,
  ): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      const changed = await tx
        .update(agentNodeRun)
        .set({
          status: "skipped",
          executionToken: null,
          executionLeaseExpiresAt: null,
          output: { reason },
          completedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            executionToken
              ? and(
                  eq(agentNodeRun.status, NODE_RESULT_SOURCE_STATUS),
                  eq(agentNodeRun.executionToken, executionToken),
                )
              : eq(agentNodeRun.status, "pending"),
          ),
        )
        .returning({ id: agentNodeRun.id });
      if (changed.length > 0) {
        await this.appendEventInTx(tx, runId, "node.skipped", nodeId, { reason });
      }
    });
  }

  async failNode(
    runId: string,
    nodeId: string,
    error: unknown,
    executionToken: string,
  ): Promise<void> {
    const { actorId } = currentTenant();
    const detail = safeError(error);
    await withTenant(async (tx) => {
      const changed = await tx
        .update(agentNodeRun)
        .set({
          status: "failed",
          executionToken: null,
          executionLeaseExpiresAt: null,
          errorCode: detail.code,
          errorMessage: detail.message,
          completedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            eq(agentNodeRun.status, NODE_RESULT_SOURCE_STATUS),
            eq(agentNodeRun.executionToken, executionToken),
          ),
        )
        .returning({ id: agentNodeRun.id });
      if (changed.length > 0) {
        await this.appendEventInTx(tx, runId, "node.failed", nodeId, detail);
      }
    });
  }

  /** Fail an exhausted retry only while it is still pending; never steal a live attempt. */
  async exhaustPendingNode(
    runId: string,
    nodeId: string,
    error: unknown,
  ): Promise<void> {
    const { actorId } = currentTenant();
    const detail = safeError(error);
    await withTenant(async (tx) => {
      const changed = await tx
        .update(agentNodeRun)
        .set({
          status: "failed",
          executionToken: null,
          executionLeaseExpiresAt: null,
          errorCode: detail.code,
          errorMessage: detail.message,
          completedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            eq(agentNodeRun.status, NODE_EXHAUSTION_SOURCE_STATUS),
          ),
        )
        .returning({ id: agentNodeRun.id });
      if (changed.length > 0) {
        await this.appendEventInTx(tx, runId, "node.failed", nodeId, detail);
      }
    });
  }

  async retryNode(
    runId: string,
    nodeId: string,
    error: unknown,
    executionToken: string,
  ): Promise<void> {
    const { actorId } = currentTenant();
    const detail = safeError(error);
    await withTenant(async (tx) => {
      const changed = await tx
        .update(agentNodeRun)
        .set({
          status: "pending",
          executionToken: null,
          executionLeaseExpiresAt: null,
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
            eq(agentNodeRun.status, NODE_RESULT_SOURCE_STATUS),
            eq(agentNodeRun.executionToken, executionToken),
          ),
        )
        .returning({ id: agentNodeRun.id });
      if (changed.length > 0) {
        await this.appendEventInTx(
          tx,
          runId,
          "node.retry_scheduled",
          nodeId,
          detail,
        );
      }
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
    executionToken: string,
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
      const nodeUpdates = await tx
        .update(agentNodeRun)
        .set({
          status: "waiting_approval",
          executionToken: null,
          executionLeaseExpiresAt: null,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentNodeRun.runId, runId),
            eq(agentNodeRun.nodeId, nodeId),
            eq(agentNodeRun.status, NODE_RESULT_SOURCE_STATUS),
            eq(agentNodeRun.executionToken, executionToken),
          ),
        )
        .returning({ id: agentNodeRun.id });
      if (nodeUpdates.length !== 1) {
        throw new AppError("AGENT_NODE_LEASE_LOST", 409, "The approval node attempt is no longer owned by this executor.");
      }
      const runUpdates = await tx
        .update(agentRun)
        .set({
          status: "waiting_approval",
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(and(eq(agentRun.id, runId), eq(agentRun.status, "running")))
        .returning({ id: agentRun.id });
      if (runUpdates.length !== 1) {
        throw new AppError("AGENT_RUN_STATE_INVALID", 409, "The mission stopped before its approval gate was persisted.");
      }
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
      const approved = decision === "approved";
      const now = new Date();
      const [approval] = await tx
        .update(agentApproval)
        .set({
          status: decision,
          decisionNote: note,
          decidedBy: actorId,
          decidedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentApproval.id, approvalId),
            eq(agentApproval.status, "pending"),
            eq(agentApproval.isActive, true),
          ),
        )
        .returning();
      if (!approval) {
        const [existing] = await tx
          .select({ id: agentApproval.id })
          .from(agentApproval)
          .where(eq(agentApproval.id, approvalId))
          .limit(1);
        if (!existing) throw Errors.notFound(`agent approval ${approvalId}`);
        throw new AppError(
          "APPROVAL_ALREADY_DECIDED",
          409,
          "This approval has already been decided.",
        );
      }
      if (approved) assertFactoryApprovalIntentFresh(approval.proposed, now);
      const factoryCommandDigest = factoryCommandDigestFromProposal(approval.proposed);
      const [run] = await tx
        .select({ id: agentRun.id, timeoutAt: agentRun.timeoutAt })
        .from(agentRun)
        .where(
          and(
            eq(agentRun.id, approval.runId),
            eq(agentRun.status, "waiting_approval"),
            eq(agentRun.isActive, true),
          ),
        )
        .for("update")
        .limit(1);
      if (!run) {
        throw new AppError(
          "APPROVAL_RUN_STATE_INVALID",
          409,
          "The mission is not actively waiting for this approval.",
        );
      }
      const nodeUpdates = await tx
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
            eq(agentNodeRun.status, "waiting_approval"),
            eq(agentNodeRun.isActive, true),
          ),
        )
        .returning({ id: agentNodeRun.id });
      if (nodeUpdates.length !== 1) {
        throw new AppError(
          "APPROVAL_RUN_STATE_INVALID",
          409,
          "The approval node is not actively waiting for a decision.",
        );
      }
      if (approved) {
        const runUpdates = await tx
          .update(agentRun)
          .set({
            timeoutAt: approvalPausedDeadline(run.timeoutAt, approval.createdAt, now),
            updatedAt: now,
            updatedBy: actorId,
          })
          .where(and(eq(agentRun.id, approval.runId), eq(agentRun.status, "waiting_approval")))
          .returning({ id: agentRun.id });
        if (runUpdates.length !== 1) {
          throw new AppError(
            "APPROVAL_RUN_STATE_INVALID",
            409,
            "The mission stopped waiting before the approval could be recorded.",
          );
        }
      }
      await this.appendEventInTx(
        tx,
        approval.runId,
        `approval.${decision}`,
        approval.nodeId,
        { note, factoryCommandDigest },
      );
      await this.audit.appendInTx(tx, {
        action: `agentos.approval.${decision}`,
        entityType: "agent_approval",
        entityId: approval.id,
        data: {
          runId: approval.runId,
          nodeId: approval.nodeId,
          note,
          factoryCommandDigest,
        },
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
      const changed = await tx
        .update(agentRun)
        .set({
          status: "completed",
          output: output as object,
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(and(eq(agentRun.id, runId), eq(agentRun.status, RUN_COMPLETION_SOURCE_STATUS)))
        .returning({ id: agentRun.id });
      if (changed.length === 0) return;
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
      const changed = await tx
        .update(agentRun)
        .set({
          status: "failed",
          errorCode: detail.code,
          errorMessage: detail.message,
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentRun.id, runId),
            inArray(agentRun.status, [...RUN_FAILURE_SOURCE_STATUSES]),
          ),
        )
        .returning({ id: agentRun.id });
      if (changed.length === 0) return;
      await this.appendEventInTx(tx, runId, "run.failed", null, detail);
      await this.appendCheckpointInTx(tx, runId, "run_failed");
    });
  }

  async cancelRun(runId: string, reason: string): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      const now = new Date();
      const changed = await tx
        .update(agentRun)
        .set({
          status: "cancelled",
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(and(
          eq(agentRun.id, runId),
          inArray(agentRun.status, [...CANCEL_RUN_SOURCE_STATUSES]),
        ))
        .returning({ id: agentRun.id });
      if (changed.length === 0) {
        const [existing] = await tx
          .select({ id: agentRun.id })
          .from(agentRun)
          .where(eq(agentRun.id, runId))
          .limit(1);
        if (!existing) throw Errors.notFound(`agent run ${runId}`);
        throw new AppError(
          "AGENT_RUN_TERMINAL",
          409,
          "A terminal run cannot be cancelled.",
        );
      }
      await tx
        .update(agentNodeRun)
        .set({
          status: "cancelled",
          executionToken: null,
          executionLeaseExpiresAt: null,
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
      await tx
        .update(agentStepGate)
        .set({ isActive: false, updatedAt: now, updatedBy: actorId })
        .where(
          and(
            eq(agentStepGate.runId, runId),
            eq(agentStepGate.status, "pending"),
            eq(agentStepGate.isActive, true),
          ),
        );
      await tx
        .update(agentApproval)
        .set({
          status: "cancelled",
          decisionNote: reason,
          decidedBy: actorId,
          decidedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(
          and(
            eq(agentApproval.runId, runId),
            eq(agentApproval.status, "pending"),
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
