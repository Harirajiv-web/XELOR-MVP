import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import {
  currentTenant,
  newId,
  type AgentKey,
} from "@ind-core/platform";
import { AuditLogService } from "../common/audit-log.service.js";

const { agentActionDispatch } = schema;

export interface DispatchActionInput {
  runId: string;
  nodeId: string;
  approvalNodeId: string;
  agentKey: AgentKey;
  targetDomain: string;
  actionType: string;
  title: string;
  risk: "low" | "medium" | "high";
  payload: Record<string, unknown>;
}

@Injectable()
export class AgentActionService {
  constructor(private readonly audit: AuditLogService) {}

  async dispatch(input: DispatchActionInput) {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
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
        approvedBy: actorId,
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
