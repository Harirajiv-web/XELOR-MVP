import { Injectable } from "@nestjs/common";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import type { WorkflowStep } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  computeEntryHash,
  GENESIS_HASH,
  AppError,
  Errors,
  type AuditEntry,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import type {
  StartWorkflowInput,
  WorkflowDecision,
  WorkflowExecutor,
  WorkflowInstanceView,
  WorkflowActionView,
} from "../../ports/workflow.port.js";

const { workflowDefinition, workflowInstance, workflowAction, userRole, role, outboxEvent } = schema;

const HOUR_MS = 3_600_000;

/**
 * W1 — the built-in approval engine (DECISIONS-V2 §1.3). Straight-line steps only:
 * states, transitions, role/user approver resolution, SLA timers. State changes are
 * synchronous in one transaction (§5.5); every action is appended to a hash-chained,
 * append-only trail so the record of who signed off cannot be altered.
 */
@Injectable()
export class W1Service implements WorkflowExecutor {
  async start(input: StartWorkflowInput, idempotencyKey: string): Promise<WorkflowInstanceView> {
    const r = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doStart(input),
    }));
    return r.body;
  }

  private async doStart(input: StartWorkflowInput): Promise<WorkflowInstanceView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const [def] = await tx
        .select()
        .from(workflowDefinition)
        .where(
          and(
            eq(workflowDefinition.code, input.definitionCode),
            eq(workflowDefinition.isActive, true),
          ),
        )
        .orderBy(desc(workflowDefinition.version))
        .limit(1);
      if (!def) throw Errors.notFound(`workflow template '${input.definitionCode}'`);

      const steps = sortSteps(def.steps);
      const first = steps[0];
      if (!first) throw new AppError("WORKFLOW_EMPTY", 422, "Template has no steps.");

      const id = newId();
      const slaDueAt = new Date(now.getTime() + first.slaHours * HOUR_MS);
      await tx.insert(workflowInstance).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        definitionId: def.id, // pins this version — future versions never touch this instance
        definitionCode: def.code,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        currentStepSeq: first.seq,
        status: "pending",
        slaDueAt,
        initiatedBy: actorId,
      });
      await this.append(tx, tenantId, id, "submit", first.seq, actorId, undefined, now);
      await this.emit(tx, tenantId, eventName("workflow", "instance", "started"), {
        instanceId: id,
        definitionCode: def.code,
        subjectId: input.subjectId,
      }, now);

      return view(
        { id, definitionCode: def.code, subjectType: input.subjectType, subjectId: input.subjectId, currentStepSeq: first.seq, status: "pending", slaDueAt },
        steps,
      );
    });
  }

  async act(
    instanceId: string,
    decision: WorkflowDecision,
    comment: string | undefined,
  ): Promise<WorkflowInstanceView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const [inst] = await tx
        .select()
        .from(workflowInstance)
        .where(eq(workflowInstance.id, instanceId))
        .limit(1);
      if (!inst) throw Errors.notFound("approval request");
      if (inst.status !== "pending") {
        throw new AppError(
          "WORKFLOW_NOT_PENDING",
          409,
          `This request is ${inst.status}, not awaiting approval.`,
        );
      }

      const [def] = await tx
        .select()
        .from(workflowDefinition)
        .where(eq(workflowDefinition.id, inst.definitionId))
        .limit(1);
      const steps = sortSteps(def?.steps ?? []);
      const current = steps.find((s) => s.seq === inst.currentStepSeq);
      if (!current) throw new AppError("WORKFLOW_CORRUPT", 500, "Current step missing from template.");

      // Approver resolution: only the right role/user may act on this step.
      const authorized = await this.isApprover(tx, actorId, current);
      if (!authorized) {
        throw new AppError(
          "NOT_AN_APPROVER",
          403,
          `You are not an approver for step ${current.seq} (${current.name}).`,
        );
      }

      // Record the decision on the tamper-proof trail first.
      await this.append(tx, tenantId, instanceId, decision, current.seq, actorId, comment, now);

      // Transition the state machine.
      let status: string = inst.status;
      let currentStepSeq = inst.currentStepSeq;
      let slaDueAt: Date | null = inst.slaDueAt;
      if (decision === "reject") {
        status = "rejected";
        slaDueAt = null;
        await this.emit(tx, tenantId, eventName("workflow", "instance", "rejected"), { instanceId, stepSeq: current.seq }, now);
      } else {
        const next = steps.find((s) => s.seq === current.seq + 1);
        if (next) {
          currentStepSeq = next.seq;
          slaDueAt = new Date(now.getTime() + next.slaHours * HOUR_MS);
          await this.emit(tx, tenantId, eventName("workflow", "step", "approved"), { instanceId, stepSeq: current.seq, nextStepSeq: next.seq }, now);
        } else {
          status = "approved";
          slaDueAt = null;
          await this.emit(tx, tenantId, eventName("workflow", "instance", "approved"), { instanceId }, now);
        }
      }
      await tx
        .update(workflowInstance)
        .set({ status, currentStepSeq, slaDueAt, updatedBy: actorId, updatedAt: now })
        .where(eq(workflowInstance.id, instanceId));

      return view(
        { id: instanceId, definitionCode: inst.definitionCode, subjectType: inst.subjectType, subjectId: inst.subjectId, currentStepSeq, status, slaDueAt },
        steps,
      );
    });
  }

  async get(
    instanceId: string,
  ): Promise<{ instance: WorkflowInstanceView; actions: WorkflowActionView[] }> {
    return withTenant(async (tx) => {
      const [inst] = await tx
        .select()
        .from(workflowInstance)
        .where(eq(workflowInstance.id, instanceId))
        .limit(1);
      if (!inst) throw Errors.notFound("approval request");
      const [def] = await tx
        .select()
        .from(workflowDefinition)
        .where(eq(workflowDefinition.id, inst.definitionId))
        .limit(1);
      const steps = sortSteps(def?.steps ?? []);
      const actions = await tx
        .select()
        .from(workflowAction)
        .where(eq(workflowAction.instanceId, instanceId))
        .orderBy(workflowAction.seq);
      return {
        instance: view(inst, steps),
        actions: actions.map((a) => ({
          seq: a.seq,
          action: a.action,
          stepSeq: a.stepSeq,
          actorId: a.actorId,
          comment: a.comment,
          at: a.at.toISOString(),
          prevHash: a.prevHash,
          hash: a.hash,
        })),
      };
    });
  }

  async overdue(): Promise<WorkflowInstanceView[]> {
    const now = new Date();
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(workflowInstance)
        .where(and(eq(workflowInstance.status, "pending"), lt(workflowInstance.slaDueAt, now)));
      const out: WorkflowInstanceView[] = [];
      for (const r of rows) {
        const [def] = await tx
          .select({ steps: workflowDefinition.steps })
          .from(workflowDefinition)
          .where(eq(workflowDefinition.id, r.definitionId))
          .limit(1);
        out.push(view(r, sortSteps(def?.steps ?? [])));
      }
      return out;
    });
  }

  // ---- internals ----

  private async isApprover(tx: Tx, actorId: string, step: WorkflowStep): Promise<boolean> {
    if (step.approverType === "user") return actorId === step.approverRef;
    const rows = await tx
      .select({ id: userRole.id })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(and(eq(userRole.subject, actorId), eq(role.code, step.approverRef)))
      .limit(1);
    return rows.length > 0;
  }

  private async append(
    tx: Tx,
    tenantId: string,
    instanceId: string,
    action: string,
    stepSeq: number,
    actorId: string,
    comment: string | undefined,
    now: Date,
  ): Promise<void> {
    // Serialise this instance's chain (append-only table -> no FOR UPDATE right).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${instanceId}))`);
    const [last] = await tx
      .select({ seq: workflowAction.seq, hash: workflowAction.hash })
      .from(workflowAction)
      .where(eq(workflowAction.instanceId, instanceId))
      .orderBy(desc(workflowAction.seq))
      .limit(1);
    const seq = (last?.seq ?? -1) + 1;
    const prevHash = last?.hash ?? GENESIS_HASH;
    const entry: AuditEntry = {
      tenantId,
      seq,
      actorId,
      action: `workflow.${action}`,
      entityType: "workflow_action",
      entityId: instanceId,
      data: { action, stepSeq, comment: comment ?? null },
      at: now.toISOString(),
    };
    await tx.insert(workflowAction).values({
      id: newId(),
      tenantId,
      instanceId,
      seq,
      action,
      stepSeq,
      actorId,
      comment: comment ?? null,
      at: now,
      prevHash,
      hash: computeEntryHash(prevHash, entry),
    });
  }

  private async emit(
    tx: Tx,
    tenantId: string,
    name: string,
    payload: unknown,
    now: Date,
  ): Promise<void> {
    await tx.insert(outboxEvent).values({ id: newId(), tenantId, name, payload, createdAt: now });
  }
}

function sortSteps(steps: WorkflowStep[]): WorkflowStep[] {
  return [...steps].sort((a, b) => a.seq - b.seq);
}

function view(
  row: {
    id: string;
    definitionCode: string;
    subjectType: string;
    subjectId: string;
    currentStepSeq: number;
    status: string;
    slaDueAt: Date | null;
  },
  steps: WorkflowStep[],
): WorkflowInstanceView {
  const step = steps.find((s) => s.seq === row.currentStepSeq);
  return {
    id: row.id,
    definitionCode: row.definitionCode,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    currentStepSeq: row.currentStepSeq,
    currentStepName: step?.name ?? null,
    status: row.status as WorkflowInstanceView["status"],
    slaDueAt: row.slaDueAt ? row.slaDueAt.toISOString() : null,
  };
}
