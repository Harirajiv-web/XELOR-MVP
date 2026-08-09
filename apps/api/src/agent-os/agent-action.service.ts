import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import {
  AppError,
  canonicalize,
  currentTenant,
  newId,
  type AgentKey,
} from "@ind-core/platform";
import { AuditLogService } from "../common/audit-log.service.js";

const { agentActionDispatch, agentApproval, agentNodeRun, agentRun } = schema;

export interface DispatchActionInput {
  runId: string;
  nodeId: string;
  approvalNodeId: string;
  executionToken: string;
  agentKey: AgentKey;
  targetDomain: string;
  actionType: string;
  title: string;
  risk: "low" | "medium" | "high";
  payload: Record<string, unknown>;
}

type ExistingDispatch = Pick<
  typeof agentActionDispatch.$inferSelect,
  | "approvalNodeId"
  | "agentKey"
  | "targetDomain"
  | "actionType"
  | "title"
  | "risk"
  | "executionMode"
  | "payload"
  | "status"
  | "approvedBy"
>;

export function actionDispatchMatchesApproval(
  existing: ExistingDispatch,
  input: DispatchActionInput,
  approvedBy: string,
): boolean {
  return canonicalize({
    approvalNodeId: existing.approvalNodeId,
    agentKey: existing.agentKey,
    targetDomain: existing.targetDomain,
    actionType: existing.actionType,
    title: existing.title,
    risk: existing.risk,
    executionMode: existing.executionMode,
    payload: existing.payload,
    status: existing.status,
    approvedBy: existing.approvedBy,
  }) === canonicalize({
    approvalNodeId: input.approvalNodeId,
    agentKey: input.agentKey,
    targetDomain: input.targetDomain,
    actionType: input.actionType,
    title: input.title,
    risk: input.risk,
    executionMode: "governed_work_item",
    payload: input.payload,
    status: "dispatched",
    approvedBy,
  });
}

export function actionDispatchDeadlineIsOpen(timeoutAt: Date, now = new Date()): boolean {
  return timeoutAt.getTime() > now.getTime();
}

@Injectable()
export class AgentActionService {
  constructor(private readonly audit: AuditLogService) {}

  async dispatch(input: DispatchActionInput) {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.runId}:${input.nodeId}:action-dispatch`}))`);
      // The row lock serializes this irreversible evidence insert with cancel/halt/fail.
      // Whichever transition commits first wins; a dispatch can never appear after a run
      // has already left `running`.
      const [liveRun] = await tx
        .select({ id: agentRun.id, timeoutAt: agentRun.timeoutAt })
        .from(agentRun)
        .where(and(
          eq(agentRun.id, input.runId),
          eq(agentRun.status, "running"),
          eq(agentRun.isActive, true),
          sql`${agentRun.timeoutAt} > now()`,
        ))
        // Status transitions take PostgreSQL's NO KEY UPDATE row lock. Matching that
        // strength still serializes cancel/halt/fail against dispatch, while remaining
        // compatible with the KEY SHARE checks taken by tenant-safe event foreign keys.
        // FOR UPDATE here deadlocked parallel post-approval branches against their own
        // append-only run events.
        .for("no key update")
        .limit(1);
      if (!liveRun) {
        throw new AppError(
          "AGENT_ACTION_RUN_NOT_RUNNING",
          409,
          "The mission stopped before its approved action could be dispatched.",
        );
      }
      // Repeat the deadline check in application code for an explicit refusal even if a
      // future query refactor accidentally weakens the SQL predicate. The row remains
      // locked until insert/commit.
      if (!actionDispatchDeadlineIsOpen(liveRun.timeoutAt)) {
        throw new AppError(
          "AGENT_ACTION_RUN_EXPIRED",
          409,
          "The mission deadline passed before its approved action could be dispatched.",
        );
      }
      const [ownedAttempt] = await tx
        .select({ id: agentNodeRun.id })
        .from(agentNodeRun)
        .where(and(
          eq(agentNodeRun.runId, input.runId),
          eq(agentNodeRun.nodeId, input.nodeId),
          eq(agentNodeRun.status, "running"),
          eq(agentNodeRun.executionToken, input.executionToken),
          sql`${agentNodeRun.executionLeaseExpiresAt} > now()`,
        ))
        .limit(1);
      if (!ownedAttempt) {
        throw new AppError(
          "AGENT_ACTION_ATTEMPT_NOT_OWNED",
          409,
          "This executor no longer owns the action-dispatch attempt.",
        );
      }
      const [approval] = await tx
        .select({ decidedBy: agentApproval.decidedBy })
        .from(agentApproval)
        .where(and(
          eq(agentApproval.runId, input.runId),
          eq(agentApproval.nodeId, input.approvalNodeId),
          eq(agentApproval.status, "approved"),
          eq(agentApproval.isActive, true),
        ))
        .limit(1);
      if (!approval?.decidedBy) {
        throw new AppError(
          "AGENT_ACTION_APPROVAL_INVALID",
          409,
          "The governed action has no active approved human gate.",
        );
      }
      const [existing] = await tx
        .select()
        .from(agentActionDispatch)
        .where(
          and(
            eq(agentActionDispatch.runId, input.runId),
            eq(agentActionDispatch.nodeId, input.nodeId),
          ),
        )
        .limit(1);
      if (existing) {
        if (!actionDispatchMatchesApproval(existing, input, approval.decidedBy)) {
          throw new AppError(
            "AGENT_ACTION_REPLAY_MISMATCH",
            409,
            "The existing action evidence does not match this approved dispatch.",
          );
        }
        return {
          actionId: existing.id,
          status: existing.status,
          executionMode: existing.executionMode,
          replayed: true,
        };
      }

      const id = newId();
      await tx.insert(agentActionDispatch).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        runId: input.runId,
        nodeId: input.nodeId,
        approvalNodeId: input.approvalNodeId,
        agentKey: input.agentKey,
        targetDomain: input.targetDomain,
        actionType: input.actionType,
        title: input.title,
        risk: input.risk,
        executionMode: "governed_work_item",
        payload: input.payload,
        status: "dispatched",
        approvedBy: approval.decidedBy,
      });
      await this.audit.appendInTx(tx, {
        action: "agentos.action.dispatched",
        entityType: "agent_action_dispatch",
        entityId: id,
        data: {
          runId: input.runId,
          nodeId: input.nodeId,
          approvalNodeId: input.approvalNodeId,
          agentKey: input.agentKey,
          targetDomain: input.targetDomain,
          actionType: input.actionType,
        },
      });
      return {
        actionId: id,
        status: "dispatched",
        executionMode: "governed_work_item",
        replayed: false,
      };
    });
  }

  async list(limit: number, runId?: string) {
    return withTenant((tx) =>
      tx
        .select()
        .from(agentActionDispatch)
        .where(runId ? eq(agentActionDispatch.runId, runId) : undefined)
        .orderBy(desc(agentActionDispatch.dispatchedAt))
        .limit(limit),
    );
  }
}
