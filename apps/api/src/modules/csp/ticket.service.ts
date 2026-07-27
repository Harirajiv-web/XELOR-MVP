import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  canReopen,
  canTransitionTicket,
  currentTenant,
  detectPromptInjection,
  eventName,
  isCustomerVisible,
  newId,
  pausesClock,
  toPublicTicketView,
  type ActorType,
  type TicketPriority,
  type TicketStatus,
  type TriageSuggestion,
} from "@ind-core/platform";
import { createHash } from "node:crypto";
import { AuditLogService } from "../../common/audit-log.service.js";
import { TicketTriage } from "../../ai/ticket-triage.js";
import { NumberingService, fyCodeFor } from "./numbering.service.js";
import { SlaService } from "./sla.service.js";

const {
  cspTicket,
  cspTicketComment,
  cspTicketEvent,
  cspTicketCategory,
  cspPortalUser,
  cspAmcContract,
  cspAmcContractAsset,
  cspComplaint,
  cspCsatSurvey,
  cspAbuseEvent,
  outboxEvent,
} = schema;

export interface CreateTicketInput {
  /** Staff callers name the account; a portal caller's is minted from their token and any
   *  value they send is ignored — see `resolveAccount`. */
  customerAccountId?: string;
  portalUserId?: string;
  contactRef?: string;
  productSerialNo?: string;
  itemRef?: string;
  channel?: "portal" | "phone" | "email" | "whatsapp";
  subject: string;
  description: string;
  categoryCode?: string;
  priority?: TicketPriority;
  /**
   * When the customer actually raised it. Present because phone, email and WhatsApp
   * tickets are logged AFTER the fact — sometimes hours after — and the SLA clock must run
   * from when they called, not from when an agent found a minute to type it in. Defaults
   * to now for the portal channel, where the two are the same instant.
   */
  at?: string;
  idempotencyKey: string;
}

export interface TicketView {
  ticketNo: string;
  status: TicketStatus;
  customerAccountId: string;
  subject: string;
  description: string;
  priority: string;
  categoryCode: string | null;
  channel: string;
  productSerialNo: string | null;
  sla: {
    state: string;
    chip: { label: string; tone: string };
    firstResponseDue: string | null;
    resolutionDue: string | null;
    consumedMins: number;
    reason: string;
    promise: string | null;
    policyName: string | null;
  };
  owner: string | null;
  teamId: string | null;
  assignedVersion: number;
  entitlement: { verdict: string | null; checkedAt: string | null };
  aiTriage: Record<string, unknown> | null;
  complaintNo: string | null;
  reopenCount: number;
  createdAt: string;
}

/**
 * TICKETS — the case record every other part of CSP hangs off.
 *
 * Four decisions in here are worth reading before the code:
 *
 *  1. **The SLA clock starts when the CUSTOMER raised the request**, not when an agent
 *     opened the queue. Anything else lets the party being measured reset the measurement.
 *
 *  2. **Triage is SUGGESTED, never applied.** AI #3's output is written to `ai_triage` and
 *     nothing else moves. The category, the priority and therefore the SLA policy change
 *     only when a human accepts — and the acceptance, the edits and the dismissals are
 *     recorded, because the override rate is the metric that says the model has drifted
 *     before a customer does.
 *
 *  3. **A ticket body is DATA, never an instruction.** An attempt to steer the classifier
 *     is logged to the security ledger and the classification proceeds unchanged: every
 *     output field is a closed enum, so the worst a prompt-injection can achieve is a value
 *     that was already legal and that an agent then overrides.
 *
 *  4. **Assignment is version-checked.** Two agents pressing "assign to me" produce one
 *     owner and one 409 carrying the winner's name — not a silent last-write-wins that both
 *     of them believe they won.
 */
@Injectable()
export class TicketService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly sla: SlaService,
    private readonly triage: TicketTriage,
  ) {}

  /* --------------------------------- create -------------------------------- */

  async create(input: CreateTicketInput): Promise<TicketView & { suggestedArticles: string[] }> {
    const { tenantId, actorId, customerAccountId: portalAccount, principal } = currentTenant();
    const isPortal = principal === "portal";
    const accountId = isPortal ? portalAccount : input.customerAccountId;
    if (!accountId) {
      throw Errors.validation([
        { field: "customerAccountId", message: "a ticket must belong to a customer account" },
      ]);
    }

    const keyHash = createHash("sha256").update(input.idempotencyKey).digest("hex");

    return withTenant(async (tx) => {
      // Replay returns the ORIGINAL resource. A customer double-tapping submit on a phone
      // with one bar of signal must not open two tickets against the same breakdown.
      const [existing] = await tx
        .select({ id: cspTicket.id })
        .from(cspTicket)
        .where(eq(cspTicket.idempotencyKeyHash, keyHash))
        .limit(1);
      if (existing) {
        const view = await this.viewInTx(tx, existing.id);
        return { ...view, suggestedArticles: [] };
      }

      const now = input.at ? new Date(input.at) : new Date();
      const category = input.categoryCode
        ? await this.categoryByCode(tx, input.categoryCode)
        : null;
      const priority: TicketPriority = input.priority ?? (category?.defaultPriority as TicketPriority) ?? "medium";

      // A ticket body attempting to steer the classifier is a security signal, not a
      // support request. It is recorded and then ignored.
      const injection = detectPromptInjection(`${input.subject}\n${input.description}`);
      if (injection.detected) {
        await tx.insert(cspAbuseEvent).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          eventType: "prompt_injection_attempt",
          principalType: isPortal ? "portal" : "staff",
          principalRef: actorId,
          details: { pattern: injection.pattern, subject: input.subject.slice(0, 120) },
        });
      }

      const id = newId();
      const ticketNo = await this.numbering.next(tx, "ticket", fyCodeFor(now.toISOString()));

      // The contract band of the SLA precedence: if this customer holds an AMC covering the
      // named machine, its contractual response time outranks the priority default.
      const contractRef = input.productSerialNo
        ? await this.contractRefForSerial(tx, input.productSerialNo)
        : null;
      const attachment = await this.sla.attach(
        tx,
        { priority, categoryCode: category?.code ?? null, contractRef },
        now.toISOString(),
      );

      await tx.insert(cspTicket).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: accountId,
        ticketNo,
        // The clock is anchored here, and every SLA figure derives from it.
        createdAt: now,
        updatedAt: now,
        contactRef: input.contactRef ?? null,
        portalUserId: input.portalUserId ?? null,
        productSerialNo: input.productSerialNo ?? null,
        itemRef: input.itemRef ?? null,
        channel: input.channel ?? (isPortal ? "portal" : "phone"),
        subject: input.subject,
        description: input.description,
        categoryId: category?.id ?? null,
        priority,
        status: "new",
        slaPolicyId: attachment.policyId,
        slaCalendarId: attachment.calendarId || null,
        slaState: "on_track",
        responseAllowanceMins: attachment.responseAllowanceMins,
        resolutionAllowanceMins: attachment.resolutionAllowanceMins,
        firstResponseDue: attachment.firstResponseDue,
        resolutionDue: attachment.resolutionDue,
        teamId: category?.defaultTeamId ?? null,
        idempotencyKeyHash: keyHash,
      });

      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: accountId,
        ticketId: id,
        eventType: "ticket.created",
        toValue: "new",
        actorType: isPortal ? "portal" : "staff",
        actorRef: actorId,
        detail: { channel: input.channel ?? (isPortal ? "portal" : "phone"), priority, slaPolicy: attachment.policyName },
        occurredAt: now,
      });

      // AI #3, on the way in. It writes a SUGGESTION and touches nothing else.
      const suggestion = await this.triage.suggest({
        subject: input.subject,
        description: input.description,
        categoryHint: (category?.code as TriageSuggestion["suggestedCategory"] | undefined) ?? null,
        hasSerial: Boolean(input.productSerialNo),
      });
      if (suggestion) {
        await tx.update(cspTicket).set({ aiTriage: suggestion }).where(eq(cspTicket.id, id));
        await tx.insert(cspTicketEvent).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          customerAccountId: accountId,
          ticketId: id,
          eventType: "ai.triage_suggested",
          toValue: suggestion.suggestedCategory,
          actorType: "ai",
          detail: { ...suggestion },
          occurredAt: now,
        });
      }

      await this.audit.appendInTx(tx, {
        action: "csp.ticket.created",
        entityType: "csp_ticket",
        entityId: id,
        data: { ticketNo, customerAccountId: accountId, priority, channel: input.channel ?? "portal" },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("csp", "ticket", "created"),
        payload: { ticketNo, customerAccountId: accountId, priority, categoryCode: category?.code ?? null },
        createdAt: now,
      });

      const view = await this.viewInTx(tx, id, now.toISOString());
      return { ...view, suggestedArticles: [] };
    });
  }

  /* -------------------------------- comments ------------------------------- */

  /**
   * Add a comment.
   *
   * Two side effects live here because they are the same decision as the comment itself:
   * the first PUBLIC staff reply stamps `first_responded_at` (that is what the response
   * clock measures), and a customer reply on a paused ticket resumes the clock and returns
   * the ticket to `in_progress` — the pause exists because the desk was waiting on them,
   * and they have stopped being waited on.
   */
  async addComment(
    ticketNo: string,
    input: { body: string; visibility?: "public" | "internal"; authorType?: "staff" | "portal" | "system"; at?: string },
  ): Promise<{ commentId: string; slaState: string; firstResponse: boolean }> {
    const { tenantId, actorId, principal } = currentTenant();
    const isPortal = principal === "portal";
    const authorType = input.authorType ?? (isPortal ? "portal" : "staff");
    const visibility = isPortal ? "public" : (input.visibility ?? "public");

    return withTenant(async (tx) => {
      const t = await this.byNoInTx(tx, ticketNo);
      const at = input.at ? new Date(input.at) : new Date();

      const commentId = newId();
      await tx.insert(cspTicketComment).values({
        id: commentId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        body: input.body,
        visibility,
        authorType,
        authorRef: actorId,
        ...(authorType === "staff" && visibility === "public" ? { sentAt: at, sentByRef: actorId } : {}),
      });

      let firstResponse = false;
      const patch: Record<string, unknown> = { updatedBy: actorId, updatedAt: at };

      if (authorType === "staff" && visibility === "public" && t.firstRespondedAt == null) {
        patch.firstRespondedAt = at;
        firstResponse = true;
      }

      if (isPortal && t.status === "pending_customer") {
        await this.sla.resume(tx, t.id, at.toISOString());
        patch.status = "in_progress";
        await tx.insert(cspTicketEvent).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          customerAccountId: t.customerAccountId,
          ticketId: t.id,
          eventType: "sla.resumed",
          fromValue: "pending_customer",
          toValue: "in_progress",
          actorType: "portal",
          actorRef: actorId,
          detail: { trigger: "customer_reply" },
          occurredAt: at,
        });
      }

      await tx.update(cspTicket).set(patch).where(eq(cspTicket.id, t.id));
      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        eventType: "comment.added",
        toValue: visibility,
        actorType: authorType,
        actorRef: actorId,
        detail: { firstResponse },
        occurredAt: at,
      });

      // A mutation, already writing in this transaction, so the derived state is made
      // durable here — `record`, not `evaluate`. Reads never reach this method.
      const evaluation = await this.sla.record(tx, t.id, at.toISOString());
      return { commentId, slaState: evaluation.state, firstResponse };
    });
  }

  /* ------------------------------- transitions ----------------------------- */

  async transition(
    ticketNo: string,
    to: TicketStatus,
    opts: { at?: string; actorType?: ActorType; reason?: string } = {},
  ): Promise<TicketView> {
    const { tenantId, actorId, principal } = currentTenant();
    const actor: ActorType = opts.actorType ?? (principal === "portal" ? "portal" : "staff");

    return withTenant(async (tx) => {
      const t = await this.byNoInTx(tx, ticketNo);
      const at = opts.at ? new Date(opts.at) : new Date();
      const from = t.status as TicketStatus;

      const check = canTransitionTicket(from, to, actor);
      if (!check.allowed) throw new AppError(check.code!, 422, check.reason!);

      const patch: Record<string, unknown> = { status: to, updatedBy: actorId, updatedAt: at };

      // The clock stops only for `pending_customer`, and only if the matched policy says
      // so — a tenant that does not pause is a valid configuration, not a bug.
      if (pausesClock(to, await this.policyPauses(tx, t.slaPolicyId))) {
        await this.sla.pause(tx, { id: t.id, customerAccountId: t.customerAccountId }, at.toISOString(), opts.reason ?? "pending_customer");
      }
      if (from === "pending_customer" && to !== "pending_customer") {
        await this.sla.resume(tx, t.id, at.toISOString());
      }
      if (to === "resolved") patch.resolvedAt = at;
      if (to === "closed") patch.closedAt = at;
      if (to === "reopened") {
        patch.reopenCount = t.reopenCount + 1;
        patch.resolvedAt = null;
        patch.closedAt = null;
        const [survey] = await tx.select().from(cspCsatSurvey).where(eq(cspCsatSurvey.ticketId, t.id)).limit(1);
        if (survey?.respondedAt) patch.reopenedAfterCsat = true;
      }

      await tx.update(cspTicket).set(patch).where(eq(cspTicket.id, t.id));
      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        eventType: "status.changed",
        fromValue: from,
        toValue: to,
        actorType: actor,
        actorRef: actorId,
        detail: { note: check.note, reason: opts.reason ?? null },
        occurredAt: at,
      });

      // Durable: a status change is exactly when the stored `sla_state` must catch up, or
      // the queue's SLA filter would keep showing a resolved ticket as breached.
      await this.sla.record(tx, t.id, at.toISOString());

      if (to === "closed") {
        await tx.insert(outboxEvent).values({
          id: newId(),
          tenantId,
          name: eventName("csp", "ticket", "closed"),
          payload: { ticketNo, customerAccountId: t.customerAccountId, slaState: t.slaState, reopenCount: t.reopenCount },
          createdAt: at,
        });
      }
      return this.viewInTx(tx, t.id, at.toISOString());
    });
  }

  /** Reopen, window-guarded for the customer and unlimited for a manager. A refusal carries
   *  the linked-ticket path, so the customer does not file an unlinked duplicate instead. */
  async reopen(ticketNo: string, opts: { at?: string; isManager?: boolean } = {}): Promise<TicketView> {
    const { principal } = currentTenant();
    const actor: ActorType = principal === "portal" ? "portal" : "staff";
    const now = opts.at ?? new Date().toISOString();

    const closedAt = await withTenant(async (tx) => {
      const t = await this.byNoInTx(tx, ticketNo);
      return t.closedAt?.toISOString() ?? null;
    });
    if (!closedAt) throw new AppError("TICKET_NOT_CLOSED", 422, `${ticketNo} is not closed, so it cannot be reopened.`);

    const verdict = canReopen({ closedAt, now, actor, isManager: opts.isManager });
    if (!verdict.allowed) {
      throw new AppError(verdict.code!, 409, `${verdict.reason} Raise a linked follow-up request instead.`);
    }
    return this.transition(ticketNo, "reopened", { at: now, actorType: actor });
  }

  /* -------------------------------- assignment ----------------------------- */

  /**
   * Claim or assign, with an optimistic version check.
   *
   * The 409 names the winner. A conflict that says only "conflict" leaves two agents both
   * believing they have the ticket; one that says "Kavita Rao already owns this" ends the
   * question without a conversation.
   */
  async assign(
    ticketNo: string,
    input: { ownerEmployeeRef: string; teamId?: string; expectedVersion?: number },
  ): Promise<TicketView> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [locked] = await tx
        .execute<{ id: string; assigned_version: number; owner_employee_ref: string | null }>(
          sql`select id, assigned_version, owner_employee_ref from csp_ticket where ticket_no = ${ticketNo} for update`,
        )
        .then((r) => r.rows);
      if (!locked) throw Errors.notFound(`ticket ${ticketNo}`);
      if (input.expectedVersion != null && locked.assigned_version !== input.expectedVersion) {
        throw new AppError(
          "TICKET_ASSIGNMENT_CONFLICT",
          409,
          `${ticketNo} was claimed by someone else while you were looking at it (owner ${locked.owner_employee_ref ?? "unassigned"}, version ${locked.assigned_version}).`,
        );
      }
      const t = await this.byNoInTx(tx, ticketNo);
      const now = new Date();
      await tx
        .update(cspTicket)
        .set({
          ownerEmployeeRef: input.ownerEmployeeRef,
          ...(input.teamId ? { teamId: input.teamId } : {}),
          assignedVersion: locked.assigned_version + 1,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(cspTicket.id, t.id));
      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        eventType: "assignment.changed",
        fromValue: t.ownerEmployeeRef,
        toValue: input.ownerEmployeeRef,
        actorType: "staff",
        actorRef: actorId,
        occurredAt: now,
      });
      return this.viewInTx(tx, t.id, now.toISOString());
    });
  }

  /* ------------------------------ triage outcome --------------------------- */

  /**
   * Accept, edit or dismiss the AI suggestion.
   *
   * Whatever the agent does is recorded on the ticket AND on the timeline, because the
   * override rate computed from these rows is the feature's honesty metric — the number
   * that reveals drift before a customer does. Accepting a category or a priority
   * recomputes the SLA against the ORIGINAL start, preserving elapsed time.
   */
  async applyTriage(
    ticketNo: string,
    decision: {
      action: "accepted" | "edited" | "dismissed";
      categoryCode?: string;
      priority?: TicketPriority;
      at?: string;
    },
  ): Promise<TicketView & { slaRecomputed: boolean }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const t = await this.byNoInTx(tx, ticketNo);
      const at = decision.at ? new Date(decision.at) : new Date();
      const suggestion = (t.aiTriage ?? null) as (TriageSuggestion & Record<string, unknown>) | null;

      let categoryCode = decision.categoryCode ?? null;
      let priority = decision.priority ?? null;
      if (decision.action === "accepted" && suggestion) {
        categoryCode = categoryCode ?? suggestion.suggestedCategory;
        priority = priority ?? suggestion.suggestedPriority;
      }

      const overridden: string[] = [];
      if (suggestion && categoryCode && categoryCode !== suggestion.suggestedCategory) overridden.push("category");
      if (suggestion && priority && priority !== suggestion.suggestedPriority) overridden.push("priority");

      const category = categoryCode ? await this.categoryByCode(tx, categoryCode) : null;
      const newPriority = (priority ?? t.priority) as TicketPriority;

      let slaRecomputed = false;
      const patch: Record<string, unknown> = {
        status: t.status === "new" ? "triaged" : t.status,
        priority: newPriority,
        updatedBy: actorId,
        updatedAt: at,
        aiTriage: suggestion
          ? { ...suggestion, acceptedBy: actorId, action: decision.action, overriddenFields: overridden }
          : t.aiTriage,
      };
      if (category) {
        patch.categoryId = category.id;
        if (!t.teamId && category.defaultTeamId) patch.teamId = category.defaultTeamId;
      }

      if (decision.action !== "dismissed" && (category || priority)) {
        const contractRef = t.productSerialNo ? await this.contractRefForSerial(tx, t.productSerialNo) : null;
        const re = await this.sla.recompute(
          tx,
          t.id,
          { priority: newPriority, categoryCode: category?.code ?? null, contractRef },
          at.toISOString(),
        );
        patch.slaPolicyId = re.policyId;
        patch.slaCalendarId = re.calendarId || null;
        patch.responseAllowanceMins = re.responseAllowanceMins;
        patch.resolutionAllowanceMins = re.resolutionAllowanceMins;
        patch.firstResponseDue = re.firstResponseDue;
        patch.resolutionDue = re.resolutionDue;
        slaRecomputed = true;
      }

      await tx.update(cspTicket).set(patch).where(eq(cspTicket.id, t.id));
      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        eventType: "ai.triage_outcome",
        fromValue: suggestion?.suggestedCategory ?? null,
        toValue: categoryCode,
        actorType: "staff",
        actorRef: actorId,
        detail: { action: decision.action, overriddenFields: overridden, priority: newPriority, slaRecomputed },
        occurredAt: at,
      });

      // Accepting a triage attaches a policy where there may have been none, so this is the
      // moment the stored state stops being "not triaged" — durable, in this transaction.
      await this.sla.record(tx, t.id, at.toISOString());
      const view = await this.viewInTx(tx, t.id, at.toISOString());
      return { ...view, slaRecomputed };
    });
  }

  /* --------------------------------- reads --------------------------------- */

  async queue(
    filter: { status?: TicketStatus[]; teamId?: string; slaState?: string } = {},
    asOf?: string,
  ): Promise<TicketView[]> {
    return withTenant(async (tx) => {
      const clauses = [];
      if (filter.status?.length) clauses.push(inArray(cspTicket.status, filter.status));
      if (filter.teamId) clauses.push(eq(cspTicket.teamId, filter.teamId));
      if (filter.slaState) clauses.push(eq(cspTicket.slaState, filter.slaState));
      const rows = await tx
        .select({ id: cspTicket.id })
        .from(cspTicket)
        .where(clauses.length ? and(...clauses) : undefined)
        .orderBy(desc(cspTicket.createdAt));
      const out: TicketView[] = [];
      for (const r of rows) out.push(await this.viewInTx(tx, r.id, asOf));
      return out;
    });
  }

  async detail(ticketNo: string, asOf?: string): Promise<
    TicketView & {
      comments: Array<{ body: string; visibility: string; authorType: string; sentAt: string | null; createdAt: string }>;
      timeline: Array<{ eventType: string; fromValue: string | null; toValue: string | null; actorType: string; occurredAt: string }>;
    }
  > {
    return withTenant(async (tx) => {
      const t = await this.byNoInTx(tx, ticketNo);
      const view = await this.viewInTx(tx, t.id, asOf);
      const comments = await tx
        .select()
        .from(cspTicketComment)
        .where(eq(cspTicketComment.ticketId, t.id))
        .orderBy(cspTicketComment.createdAt);
      const events = await tx
        .select()
        .from(cspTicketEvent)
        .where(eq(cspTicketEvent.ticketId, t.id))
        .orderBy(cspTicketEvent.occurredAt);
      return {
        ...view,
        comments: comments.map((c) => ({
          body: c.body,
          visibility: c.visibility,
          authorType: c.authorType,
          sentAt: c.sentAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
        timeline: events.map((e) => ({
          eventType: e.eventType,
          fromValue: e.fromValue,
          toValue: e.toValue,
          actorType: e.actorType,
          occurredAt: e.occurredAt.toISOString(),
        })),
      };
    });
  }

  /**
   * Just the clock.
   *
   * This is the one CSP endpoint a queue screen may poll, and it used to be served by
   * `detail()` — loading every comment and every timeline row for the ticket and then
   * discarding all but the `sla` field. It now reads the ticket row and the policy list and
   * nothing else, and it honours `asOf` instead of accepting it and ignoring it: an
   * argument that is silently dropped is worse than one that was never offered, because a
   * caller passing it believes it worked.
   */
  async slaOf(ticketNo: string, asOf?: string): Promise<TicketView["sla"]> {
    return withTenant(async (tx) => {
      const t = await this.byNoInTx(tx, ticketNo);
      const evaluation = await this.sla.evaluate(tx, t.id, asOf ?? new Date().toISOString());
      const policies = await this.sla.policiesInTx(tx);
      const policy = policies.find((p) => p.id === t.slaPolicyId) ?? null;
      return {
        state: evaluation.state,
        chip: evaluation.chip,
        firstResponseDue: t.firstResponseDue?.toISOString() ?? null,
        resolutionDue: t.resolutionDue?.toISOString() ?? null,
        consumedMins: evaluation.consumedMins,
        reason: evaluation.reason,
        promise: policy ? `First response within ${policy.responseMins} business minutes` : null,
        policyName: policy?.name ?? null,
      };
    });
  }

  /**
   * The customer's face. Note what is NOT selected: the owning agent, internal notes, the
   * AI suggestion, the NCR reference, the cost of anything. The complaint reads as "Under
   * investigation by Quality", which is true, useful, and reveals nothing.
   */
  async portalDetail(ticketNo: string, asOf?: string): Promise<Record<string, unknown>> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const t = await this.byNoInTx(tx, ticketNo);
      const [complaint] = t.complaintId
        ? await tx.select().from(cspComplaint).where(eq(cspComplaint.id, t.complaintId)).limit(1)
        : [null];
      const [survey] = await tx.select().from(cspCsatSurvey).where(eq(cspCsatSurvey.ticketId, t.id)).limit(1);
      const evaluation = await this.sla.evaluate(tx, t.id, now);

      const comments = await tx
        .select()
        .from(cspTicketComment)
        .where(eq(cspTicketComment.ticketId, t.id))
        .orderBy(cspTicketComment.createdAt);

      const publicView = toPublicTicketView({
        ticketNo: t.ticketNo,
        subject: t.subject,
        status: t.status as TicketStatus,
        slaState: evaluation.state,
        firstResponseDue: t.firstResponseDue?.toISOString() ?? null,
        resolutionDue: t.resolutionDue?.toISOString() ?? null,
        complaintStatus: complaint?.status ?? null,
        closedAt: t.closedAt?.toISOString() ?? null,
        csatResponded: Boolean(survey?.respondedAt),
        now,
      });

      return {
        ...publicView,
        slaChip: evaluation.chip,
        thread: comments
          .filter((c) => isCustomerVisible({ visibility: c.visibility as "public" | "internal", authorType: c.authorType as never }))
          .map((c) => ({
            from: c.authorType === "portal" ? "you" : "Trishul service desk",
            body: c.body,
            at: (c.sentAt ?? c.createdAt).toISOString(),
          })),
      };
    });
  }

  async portalList(asOf?: string): Promise<Array<Record<string, unknown>>> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const rows = await tx.select({ ticketNo: cspTicket.ticketNo }).from(cspTicket).orderBy(desc(cspTicket.createdAt));
      const out: Array<Record<string, unknown>> = [];
      for (const r of rows) out.push(await this.portalDetail(r.ticketNo, now));
      return out;
    });
  }

  /* -------------------------------- helpers -------------------------------- */

  async byNoInTx(tx: Tx, ticketNo: string) {
    const [t] = await tx.select().from(cspTicket).where(eq(cspTicket.ticketNo, ticketNo)).limit(1);
    if (!t) throw Errors.notFound(`ticket ${ticketNo}`);
    return t;
  }

  private async categoryByCode(tx: Tx, code: string) {
    const [c] = await tx.select().from(cspTicketCategory).where(eq(cspTicketCategory.code, code)).limit(1);
    if (!c) throw Errors.notFound(`ticket category '${code}'`);
    return c;
  }

  private async policyPauses(tx: Tx, policyId: string | null): Promise<boolean> {
    if (!policyId) return true;
    const policies = await this.sla.policiesInTx(tx);
    return policies.find((p) => p.id === policyId)?.pauseOnPending ?? true;
  }

  /** The AMC contract number covering this serial, which is what the contract band of the
   *  SLA precedence matches on. */
  private async contractRefForSerial(tx: Tx, serialNo: string): Promise<string | null> {
    const [asset] = await tx
      .select({ contractId: cspAmcContractAsset.contractId })
      .from(cspAmcContractAsset)
      .where(eq(cspAmcContractAsset.serialNo, serialNo))
      .limit(1);
    if (!asset) return null;
    const [c] = await tx
      .select({ contractNo: cspAmcContract.contractNo, status: cspAmcContract.status })
      .from(cspAmcContract)
      .where(eq(cspAmcContract.id, asset.contractId))
      .limit(1);
    if (!c || !["active", "expiring"].includes(c.status)) return null;
    return c.contractNo;
  }

  /**
   * `asOf` is threaded through every read so a view can be rendered AS AT a moment — which
   * is what makes a back-dated demo, and an SLA dispute six weeks later, reproducible.
   *
   * It used to carry a second, worse job: `evaluate` persisted what it derived, so a view
   * rendered at the wall clock silently restamped a back-dated ticket's SLA state and the
   * demo breached its own history merely by being looked at. `evaluate` is pure now, so
   * `asOf` only decides what this call REPORTS. Nothing below writes.
   */
  async viewInTx(tx: Tx, id: string, asOf?: string): Promise<TicketView> {
    const [t] = await tx.select().from(cspTicket).where(eq(cspTicket.id, id)).limit(1);
    if (!t) throw Errors.notFound("ticket");
    const [category] = t.categoryId
      ? await tx.select().from(cspTicketCategory).where(eq(cspTicketCategory.id, t.categoryId)).limit(1)
      : [null];
    const [complaint] = t.complaintId
      ? await tx.select().from(cspComplaint).where(eq(cspComplaint.id, t.complaintId)).limit(1)
      : [null];
    const evaluation = await this.sla.evaluate(tx, t.id, asOf ?? new Date().toISOString());
    const policies = await this.sla.policiesInTx(tx);
    const policy = policies.find((p) => p.id === t.slaPolicyId) ?? null;

    return {
      ticketNo: t.ticketNo,
      status: t.status as TicketStatus,
      customerAccountId: t.customerAccountId,
      subject: t.subject,
      description: t.description,
      priority: t.priority,
      categoryCode: category?.code ?? null,
      channel: t.channel,
      productSerialNo: t.productSerialNo,
      sla: {
        state: evaluation.state,
        chip: evaluation.chip,
        firstResponseDue: t.firstResponseDue?.toISOString() ?? null,
        resolutionDue: t.resolutionDue?.toISOString() ?? null,
        consumedMins: evaluation.consumedMins,
        reason: evaluation.reason,
        promise: policy ? `First response within ${policy.responseMins} business minutes` : null,
        policyName: policy?.name ?? null,
      },
      owner: t.ownerEmployeeRef,
      teamId: t.teamId,
      assignedVersion: t.assignedVersion,
      entitlement: { verdict: t.entitlementResult, checkedAt: t.entitlementCheckedAt?.toISOString() ?? null },
      aiTriage: (t.aiTriage ?? null) as Record<string, unknown> | null,
      complaintNo: complaint?.complaintNo ?? null,
      reopenCount: t.reopenCount,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
