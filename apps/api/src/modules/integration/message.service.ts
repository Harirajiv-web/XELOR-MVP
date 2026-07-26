import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  applyMapping,
  canReplay,
  classifyFailure,
  currentTenant,
  eventName,
  newId,
  nextRetry,
  redactPayload,
  summariseDlq,
  triage,
  type DlqEntry,
  type ErrorCategory,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { PipelineService, LOOKUPS } from "./pipeline.service.js";

const { messageLog, deliveryAttempt, deadLetter, integrationFlow, outboxEvent } = schema;

export interface DispatchInput {
  flowCode: string;
  correlationId?: string;
  entityRef?: string;
  payload: unknown;
  /** Simulated transport result — the fake adapter's failure-injection surface. */
  simulate?: { httpStatus?: number; timedOut?: boolean; errorCode?: string; message?: string; retryAfterSeconds?: number };
}

/**
 * SENDING A MESSAGE, AND WHAT HAPPENS WHEN IT DOES NOT ARRIVE.
 *
 * The order of operations is the design. Map first, because a message that cannot be
 * transformed must never reach the wire — retrying a broken mapping runs the same broken
 * mapping. Then attempt, classify, and either retry with backoff or dead-letter with a
 * triage already attached.
 *
 * Nothing is dropped. A message that exhausts its retries lands in a queue a person can
 * see, because a message nobody knows vanished is the only outcome worse than a failed one.
 */
@Injectable()
export class MessageService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly pipeline: PipelineService,
  ) {}

  async dispatch(input: DispatchInput): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const correlationId = input.correlationId ?? `cor-${newId().slice(-12)}`;

    return withTenant(async (tx) => {
      const flow = await this.pipeline.flowByCode(tx, input.flowCode);
      if (flow.status !== "active") {
        throw new AppError("INT_FLOW_NOT_ACTIVE", 409, `Flow ${input.flowCode} is ${flow.status}${flow.pauseReason ? `: ${flow.pauseReason}` : ""}.`);
      }

      // 1. TRANSFORM FIRST. A message that cannot be mapped must not reach the wire.
      const mappings = await this.pipeline.mappingsInTx(tx, input.flowCode);
      const mapped = applyMapping(input.payload, mappings, LOOKUPS);

      const msgId = newId();
      await tx.insert(messageLog).values({
        id: msgId, tenantId, createdBy: actorId, updatedBy: actorId,
        flowId: flow.id,
        correlationId,
        direction: "outbound",
        entityRef: input.entityRef ?? null,
        status: mapped.ok ? "in_flight" : "failed",
        payloadRedacted: redactPayload(input.payload) as object,
        attemptCount: 1,
        errorCode: mapped.ok ? null : "TRANSFORM",
        errorMessage: mapped.ok ? null : mapped.summary,
      });

      if (!mapped.ok) {
        const dlq = await this.deadLetterInTx(tx, {
          flowId: flow.id, flowCode: input.flowCode, correlationId,
          sourceRef: input.entityRef ?? null, category: "transform",
          payload: input.payload, attempts: 1,
          sideEffectPossible: false, isStatutory: flow.isStatutory,
        });
        await tx.insert(deliveryAttempt).values({
          id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
          messageLogId: msgId, attemptNo: 1, finishedAt: new Date(),
          outcome: "fatal", errorCategory: "transform", errorDetail: mapped.summary,
        });
        return {
          correlationId, status: "dead_lettered", stage: "transform",
          missingRequired: mapped.missingRequired, errors: mapped.errors,
          dlqId: dlq.id, triage: dlq.triageAction,
          note: "The message never went out. Retrying before the mapping is fixed would run the same broken mapping.",
        };
      }

      // 2. The circuit. An open breaker fails fast and locally rather than spending thirty
      //    seconds per document discovering the same outage.
      const gate = await this.pipeline.circuitCheck(flow.targetConnectionId ? await this.connNameInTx(tx, flow.targetConnectionId) : "", new Date().toISOString()).catch(() => null);
      if (gate && gate.allowRequest === false) {
        await tx.update(messageLog).set({ status: "pending", errorCode: "CIRCUIT_OPEN", errorMessage: String(gate.message), updatedAt: new Date() }).where(eq(messageLog.id, msgId));
        return { correlationId, status: "queued", stage: "circuit", note: gate.message };
      }

      // 3. Attempt. `simulate` is the fake adapter's failure-injection surface.
      const sim = input.simulate ?? {};
      const classification = classifyFailure({
        httpStatus: sim.httpStatus ?? 200,
        timedOut: sim.timedOut,
        errorCode: sim.errorCode,
        message: sim.message,
        retryAfterSeconds: sim.retryAfterSeconds,
      });

      await tx.insert(deliveryAttempt).values({
        id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
        messageLogId: msgId, attemptNo: 1, finishedAt: new Date(),
        outcome: classification.outcome === "success" ? "success" : classification.outcome,
        errorCategory: classification.outcome === "success" ? null : classification.category,
        responseCode: sim.httpStatus ?? 200,
        errorDetail: classification.outcome === "success" ? null : classification.reason,
      });

      if (classification.outcome === "success") {
        await tx.update(messageLog).set({ status: "success", latencyMs: 42, updatedAt: new Date() }).where(eq(messageLog.id, msgId));
        await tx.insert(outboxEvent).values({
          id: newId(), tenantId,
          name: eventName("integration", "message", "delivered"),
          payload: { flowCode: input.flowCode, correlationId, entityRef: input.entityRef ?? null },
          createdAt: new Date(),
        });
        return { correlationId, status: "success", output: mapped.output };
      }

      const decision = nextRetry(classification, 1);
      if (decision.shouldRetry) {
        await tx
          .update(messageLog)
          .set({ status: "pending", errorCode: classification.category, errorMessage: classification.reason, updatedAt: new Date() })
          .where(eq(messageLog.id, msgId));
        return { correlationId, status: "retry_scheduled", ...decision, category: classification.category, reason: classification.reason };
      }

      // A timeout may already have taken effect on the far side; that fact travels with the
      // dead letter, because it is what decides whether a replay is safe.
      const dlq = await this.deadLetterInTx(tx, {
        flowId: flow.id, flowCode: input.flowCode, correlationId,
        sourceRef: input.entityRef ?? null, category: classification.category,
        payload: input.payload, attempts: 1,
        sideEffectPossible: classification.category === "timeout",
        isStatutory: flow.isStatutory,
      });
      await tx.update(messageLog).set({ status: "dead_lettered", errorCode: classification.category, errorMessage: classification.reason, updatedAt: new Date() }).where(eq(messageLog.id, msgId));
      return { correlationId, status: "dead_lettered", category: classification.category, reason: decision.reason, dlqId: dlq.id, triage: dlq.triageAction };
    });
  }

  private async connNameInTx(tx: Tx, connectionId: string): Promise<string> {
    const rows = await tx.select().from(schema.connection).where(eq(schema.connection.id, connectionId)).limit(1);
    return rows[0]?.name ?? "";
  }

  /**
   * Dead-letter a message WITH its triage already attached.
   *
   * The triage comes from the deterministic table. INTEGRATION is the module with an
   * explicit null AI entry, and this is why: the error category already determines what a
   * person should do, and a model guessing at it would be slower, unauditable, and capable
   * of a confident wrong answer about a tax filing.
   */
  private async deadLetterInTx(
    tx: Tx,
    input: {
      flowId: string; flowCode: string; correlationId: string; sourceRef: string | null;
      category: ErrorCategory; payload: unknown; attempts: number;
      sideEffectPossible: boolean; isStatutory: boolean;
    },
  ) {
    const { tenantId, actorId } = currentTenant();
    const rule = triage(input.category);
    const id = newId();
    await tx.insert(deadLetter).values({
      id, tenantId, createdBy: actorId, updatedBy: actorId,
      flowId: input.flowId,
      correlationId: input.correlationId,
      sourceRef: input.sourceRef,
      errorCategory: input.category,
      triageAction: rule.suggestedAction,
      severity: rule.severity,
      replayable: rule.replayable,
      sideEffectPossible: input.sideEffectPossible,
      isStatutory: input.isStatutory,
      payloadRedacted: redactPayload(input.payload) as object,
      attempts: input.attempts,
      status: "new",
    });
    await this.audit.appendInTx(tx, {
      action: "integration.message.dead_lettered",
      entityType: "dead_letter",
      entityId: id,
      data: { flowCode: input.flowCode, correlationId: input.correlationId, category: input.category, severity: rule.severity },
    });
    return { id, triageAction: rule.suggestedAction, severity: rule.severity };
  }

  /* ---------------------------------- DLQ --------------------------------- */

  async dlq(status = "new"): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(deadLetter).where(eq(deadLetter.status, status)).orderBy(desc(deadLetter.createdAt));
      const flows = await tx.select().from(integrationFlow);
      const codeOf = new Map(flows.map((f) => [f.id, f.code]));

      const entries: DlqEntry[] = rows.map((r) => ({
        id: r.id, flowCode: codeOf.get(r.flowId) ?? r.flowId, correlationId: r.correlationId,
        errorCategory: r.errorCategory as ErrorCategory, attempts: r.attempts,
        status: r.status as DlqEntry["status"], sideEffectPossible: r.sideEffectPossible, isStatutory: r.isStatutory,
      }));

      return {
        ...summariseDlq(entries),
        entries: entries.map((e) => {
          const verdict = canReplay(e);
          return {
            id: e.id, flowCode: e.flowCode, correlationId: e.correlationId,
            category: e.errorCategory, severity: triage(e.errorCategory).severity,
            isStatutory: e.isStatutory, sideEffectPossible: e.sideEffectPossible,
            suggestedAction: triage(e.errorCategory).suggestedAction,
            replayAllowed: verdict.allowed,
            replayRequiresConfirmation: verdict.requiresConfirmation,
            replayVerdict: verdict.reason,
          };
        }),
      };
    });
  }

  /**
   * Replay a dead-lettered message.
   *
   * Guard-railed on purpose. A DLQ that replays anything on one click is a way to submit the
   * same invoice to the tax portal four times — and unlike most mistakes in an ERP, that one
   * is visible to a regulator and cannot be quietly undone.
   */
  async replay(dlqId: string, opts: { confirmStatutory?: boolean } = {}): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(deadLetter).where(eq(deadLetter.id, dlqId)).limit(1);
      if (!row) throw Errors.notFound(`dead letter ${dlqId}`);
      const flows = await tx.select().from(integrationFlow).where(eq(integrationFlow.id, row.flowId)).limit(1);
      const flowCode = flows[0]?.code ?? row.flowId;

      const entry: DlqEntry = {
        id: row.id, flowCode, correlationId: row.correlationId,
        errorCategory: row.errorCategory as ErrorCategory, attempts: row.attempts,
        status: row.status as DlqEntry["status"], sideEffectPossible: row.sideEffectPossible, isStatutory: row.isStatutory,
      };
      const verdict = canReplay(entry);
      if (!verdict.allowed) throw new AppError("INT_REPLAY_REFUSED", 409, verdict.reason);
      if (verdict.requiresConfirmation && !opts.confirmStatutory) {
        throw new AppError("INT_REPLAY_NEEDS_CONFIRMATION", 428, verdict.reason);
      }

      await tx.update(deadLetter).set({ status: "retrying", attempts: row.attempts + 1, updatedBy: actorId, updatedAt: new Date() }).where(eq(deadLetter.id, dlqId));
      await this.audit.appendInTx(tx, {
        action: "integration.dlq.replayed",
        entityType: "dead_letter",
        entityId: dlqId,
        data: { flowCode, correlationId: row.correlationId, category: row.errorCategory, confirmed: Boolean(opts.confirmStatutory) },
      });
      return { dlqId, status: "retrying", flowCode, correlationId: row.correlationId, note: verdict.reason };
    });
  }

  async resolve(dlqId: string, note: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (!note?.trim()) {
      throw new AppError("INT_DLQ_NOTE_REQUIRED", 422, "Resolving a dead letter needs a note — without one the same failure is diagnosed from scratch three months later.");
    }
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(deadLetter).where(eq(deadLetter.id, dlqId)).limit(1);
      if (!row) throw Errors.notFound(`dead letter ${dlqId}`);
      await tx
        .update(deadLetter)
        .set({ status: "resolved", resolutionNote: note, resolvedAt: new Date(), assignedTo: actorId, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(deadLetter.id, dlqId));
      return { dlqId, status: "resolved", note };
    });
  }

  /** Trace one correlation id end to end — the message, every attempt, and the dead letter. */
  async trace(correlationId: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const msgs = await tx.select().from(messageLog).where(eq(messageLog.correlationId, correlationId)).orderBy(asc(messageLog.ts));
      if (msgs.length === 0) throw Errors.notFound(`correlation ${correlationId}`);
      const attempts = await tx
        .select()
        .from(deliveryAttempt)
        .where(eq(deliveryAttempt.messageLogId, msgs[0]!.id))
        .orderBy(asc(deliveryAttempt.attemptNo));
      const dlqRows = await tx.select().from(deadLetter).where(eq(deadLetter.correlationId, correlationId));
      const flows = await tx.select().from(integrationFlow);
      const codeOf = new Map(flows.map((f) => [f.id, f.code]));

      return {
        correlationId,
        messages: msgs.map((m) => ({ flowCode: codeOf.get(m.flowId) ?? m.flowId, direction: m.direction, status: m.status, entityRef: m.entityRef, errorCode: m.errorCode, errorMessage: m.errorMessage, ts: m.ts })),
        attempts: attempts.map((a) => ({ attemptNo: a.attemptNo, outcome: a.outcome, category: a.errorCategory, responseCode: a.responseCode, detail: a.errorDetail })),
        deadLetters: dlqRows.map((d) => ({ id: d.id, category: d.errorCategory, severity: d.severity, status: d.status, suggestedAction: d.triageAction })),
      };
    });
  }
}
