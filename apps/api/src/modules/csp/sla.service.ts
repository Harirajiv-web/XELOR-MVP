import { Injectable } from "@nestjs/common";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  computeSlaClocks,
  currentTenant,
  describeAllowance,
  evaluateSla,
  eventName,
  newId,
  recomputeDueOnPriorityChange,
  resolveSlaPolicy,
  slaChip,
  tiersToFire,
  DEFAULT_CALENDAR,
  type BusinessCalendar,
  type EscalationTier,
  type PauseWindow,
  type TicketPriority,
  type SlaEvaluation,
  type SlaPolicy,
} from "@ind-core/platform";

const { cspSlaPolicy, cspBusinessCalendar, cspTicket, cspTicketPause, cspTicketEvent, outboxEvent } = schema;

export interface SlaAttachment {
  policyId: string;
  policyName: string;
  calendarId: string;
  firstResponseDue: Date;
  resolutionDue: Date;
  responseAllowanceMins: number;
  resolutionAllowanceMins: number;
  pauseOnPending: boolean;
  promise: string;
}

/**
 * THE SLA ENGINE, wired to the database.
 *
 * The arithmetic itself lives in `@ind-core/platform` and is pure — this service does the
 * three things that need a database and nothing more:
 *
 *   1. Load the tenant's policies and calendar so the pure functions can decide.
 *   2. Persist the outcome (`sla_state`, the two deadlines, the fired-tier markers).
 *   3. Record every clock event on the append-only timeline, because an SLA verdict a
 *      customer disputes has to be reconstructible from stored rows by somebody who was
 *      not there when it happened.
 *
 * What it deliberately does NOT do is keep a running total of consumed minutes. Consumption
 * is recomputed from the pause intervals every time it is asked for. A counter is cheaper
 * and is wrong the first time a pause is back-dated, a policy is corrected, or a job runs
 * twice — and by then the number has already been on a report.
 */
@Injectable()
export class SlaService {
  /* ------------------------------ configuration ---------------------------- */

  async policiesInTx(tx: Tx): Promise<SlaPolicy[]> {
    const rows = await tx.select().from(cspSlaPolicy);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      appliesTo: r.appliesTo as SlaPolicy["appliesTo"],
      matchValue: r.matchValue,
      responseMins: r.responseMins,
      resolutionMins: r.resolutionMins,
      pauseOnPending: r.pauseOnPending,
      escalationMatrix: (r.escalationMatrix ?? []) as EscalationTier[],
      active: r.active,
    }));
  }

  async calendarInTx(tx: Tx, calendarId: string | null): Promise<BusinessCalendar> {
    if (!calendarId) return DEFAULT_CALENDAR;
    const [c] = await tx.select().from(cspBusinessCalendar).where(eq(cspBusinessCalendar.id, calendarId)).limit(1);
    if (!c) return DEFAULT_CALENDAR;
    return {
      code: c.code,
      workingWeekdays: (c.workingWeekdays ?? []) as number[],
      dayStartMinutes: c.dayStartMinutes,
      dayEndMinutes: c.dayEndMinutes,
      holidays: (c.holidays ?? []) as string[],
      utcOffsetMinutes: c.utcOffsetMinutes,
    };
  }

  /** The calendar attached to a policy — resolved through the policy row so a tenant can
   *  run a 24×7 contract clock and a Mon–Sat default clock side by side. */
  private async calendarForPolicy(tx: Tx, policyId: string): Promise<{ id: string; calendar: BusinessCalendar }> {
    const [p] = await tx.select().from(cspSlaPolicy).where(eq(cspSlaPolicy.id, policyId)).limit(1);
    const calendar = await this.calendarInTx(tx, p?.calendarId ?? null);
    return { id: p?.calendarId ?? "", calendar };
  }

  /* -------------------------------- attaching ------------------------------ */

  /**
   * Match a policy and compute both clocks, in business time, from the moment the customer
   * raised the request — not from the moment an agent got round to opening the queue.
   */
  async attach(
    tx: Tx,
    match: { priority: TicketPriority; categoryCode?: string | null; contractRef?: string | null },
    startedAt: string,
  ): Promise<SlaAttachment> {
    const policies = await this.policiesInTx(tx);
    const policy = resolveSlaPolicy(policies, match); // throws SlaPolicyNotFound
    const { id: calendarId, calendar } = await this.calendarForPolicy(tx, policy.id);
    const clocks = computeSlaClocks(policy, startedAt, calendar);
    return {
      policyId: policy.id,
      policyName: policy.name,
      calendarId,
      firstResponseDue: new Date(clocks.firstResponseDue),
      resolutionDue: new Date(clocks.resolutionDue),
      responseAllowanceMins: clocks.responseAllowanceMins,
      resolutionAllowanceMins: clocks.resolutionAllowanceMins,
      pauseOnPending: policy.pauseOnPending,
      promise: clocks.promise,
    };
  }

  /**
   * Re-derive both deadlines after a priority change.
   *
   * This is the subtle one, and getting it wrong is how SLA reports quietly become
   * fiction. A ticket raised at 09:00 as medium and escalated to urgent at 12:00 has
   * already spent three business hours. Recomputing the clock from *now* would hand the
   * agent a fresh four hours and record a "met" response that took seven. The new
   * allowance is therefore measured from the ORIGINAL start, and a ticket escalated past
   * its new allowance is already breached — which is the honest answer.
   */
  async recompute(
    tx: Tx,
    ticketId: string,
    match: { priority: TicketPriority; categoryCode?: string | null; contractRef?: string | null },
    changedAt: string,
  ): Promise<SlaAttachment & { alreadyExhausted: boolean; consumedMins: number }> {
    const [t] = await tx.select().from(cspTicket).where(eq(cspTicket.id, ticketId)).limit(1);
    if (!t) throw new Error(`ticket ${ticketId} vanished mid-transaction`);

    const policies = await this.policiesInTx(tx);
    const policy = resolveSlaPolicy(policies, match);
    const { id: calendarId, calendar } = await this.calendarForPolicy(tx, policy.id);
    const pauseWindows = await this.pauseWindows(tx, ticketId);
    const startedAt = t.createdAt.toISOString();

    // Elapsed time is PRESERVED, not refunded. Note that this differs from recomputing
    // both clocks from the original start whenever the ticket has ever been paused: time
    // the customer held the ticket is not time the agent spent, and must not be charged
    // back to them by a policy change.
    const response = recomputeDueOnPriorityChange({
      startedAt,
      changedAt,
      pauseWindows,
      newAllowanceMinutes: policy.responseMins,
      calendar,
    });
    const resolution = recomputeDueOnPriorityChange({
      startedAt,
      changedAt,
      pauseWindows,
      newAllowanceMinutes: policy.resolutionMins,
      calendar,
    });

    return {
      policyId: policy.id,
      policyName: policy.name,
      calendarId,
      firstResponseDue: new Date(response.dueAt),
      resolutionDue: new Date(resolution.dueAt),
      responseAllowanceMins: policy.responseMins,
      resolutionAllowanceMins: policy.resolutionMins,
      pauseOnPending: policy.pauseOnPending,
      promise: `First response within ${describeAllowance(policy.responseMins)}`,
      alreadyExhausted: response.alreadyExhausted,
      consumedMins: response.consumedMinutes,
    };
  }

  /* ------------------------------- pause/resume ---------------------------- */

  async pause(tx: Tx, ticket: { id: string; customerAccountId: string }, at: string, reason = "pending_customer"): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    const open = await this.openPause(tx, ticket.id);
    if (open) return; // already stopped; pausing twice is a no-op, not an error
    await tx.insert(cspTicketPause).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      customerAccountId: ticket.customerAccountId,
      ticketId: ticket.id,
      pausedAt: new Date(at),
      reason,
    });
  }

  async resume(tx: Tx, ticketId: string, at: string): Promise<void> {
    const open = await this.openPause(tx, ticketId);
    if (!open) return;
    await tx.update(cspTicketPause).set({ resumedAt: new Date(at) }).where(eq(cspTicketPause.id, open.id));
  }

  private async openPause(tx: Tx, ticketId: string): Promise<{ id: string } | null> {
    const [row] = await tx
      .select({ id: cspTicketPause.id })
      .from(cspTicketPause)
      .where(and(eq(cspTicketPause.ticketId, ticketId), isNull(cspTicketPause.resumedAt)))
      .limit(1);
    return row ?? null;
  }

  async pauseWindows(tx: Tx, ticketId: string): Promise<PauseWindow[]> {
    const rows = await tx.select().from(cspTicketPause).where(eq(cspTicketPause.ticketId, ticketId));
    return rows.map((r) => ({
      from: r.pausedAt.toISOString(),
      to: r.resumedAt ? r.resumedAt.toISOString() : null,
    }));
  }

  /* -------------------------------- evaluation ----------------------------- */

  /**
   * Derive the state, persist it if it changed, and fire any escalation tier that has come
   * due. Safe to run every minute for ever: `escalation_fired` makes each tier once-only,
   * so a scanner that runs sixty times in an hour sends one notification.
   */
  async evaluate(
    tx: Tx,
    ticketId: string,
    asOf: string,
  ): Promise<SlaEvaluation & { chip: { label: string; tone: string }; escalated: string[] }> {
    const { tenantId, actorId } = currentTenant();
    const [t] = await tx.select().from(cspTicket).where(eq(cspTicket.id, ticketId)).limit(1);
    if (!t) throw new Error(`ticket ${ticketId} not found for SLA evaluation`);

    // A ticket that has not been triaged has no policy and therefore no verdict. Reporting
    // "on_track" for it would be an assertion nobody made.
    if (t.responseAllowanceMins == null || t.resolutionAllowanceMins == null) {
      return {
        state: "on_track",
        consumedMins: 0,
        responseRemainingMins: 0,
        resolutionRemainingMins: 0,
        responseBreached: false,
        resolutionBreached: false,
        reason: "No SLA policy is attached yet — the ticket has not been triaged.",
        chip: { label: "Not triaged", tone: "grey" },
        escalated: [],
      };
    }

    const calendar = await this.calendarInTx(tx, t.slaCalendarId);
    const windows = await this.pauseWindows(tx, ticketId);
    const isPaused = windows.some((w) => w.to == null);

    const evaluation = evaluateSla({
      startedAt: t.createdAt.toISOString(),
      asOf,
      pauseWindows: windows,
      calendar,
      responseAllowanceMins: t.responseAllowanceMins,
      resolutionAllowanceMins: t.resolutionAllowanceMins,
      firstRespondedAt: t.firstRespondedAt?.toISOString() ?? null,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      isPaused,
    });

    // Escalation tiers, from the policy that was matched at triage — not from whatever the
    // policy says today. A tenant editing their escalation ladder must not retroactively
    // change who should have been told about a breach last week.
    const escalated: string[] = [];
    if (t.slaPolicyId) {
      const [p] = await tx.select().from(cspSlaPolicy).where(eq(cspSlaPolicy.id, t.slaPolicyId)).limit(1);
      const tiers = ((p?.escalationMatrix ?? []) as EscalationTier[]) ?? [];
      const alreadyFired = (t.escalationFired ?? []) as string[];
      const due = tiersToFire({
        tiers,
        consumedMins: evaluation.consumedMins,
        responseAllowanceMins: t.responseAllowanceMins,
        resolutionAllowanceMins: t.resolutionAllowanceMins,
        alreadyFired,
        isPaused,
      });
      for (const d of due) {
        // A resolved response clock does not escalate: the tier exists to chase a response
        // that has not happened, and chasing one that has is how people learn to ignore it.
        if (d.clock === "response" && t.firstRespondedAt) continue;
        if (d.clock === "resolution" && t.resolvedAt) continue;
        escalated.push(d.tier);
        await tx.insert(cspTicketEvent).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          customerAccountId: t.customerAccountId,
          ticketId,
          eventType: "sla.escalated",
          fromValue: null,
          toValue: d.tier,
          actorType: "system",
          detail: { clock: d.clock, notifyRole: d.notifyRole, atMinutes: d.atMinutes },
          occurredAt: new Date(asOf),
        });
        await tx.insert(outboxEvent).values({
          id: newId(),
          tenantId,
          name: eventName("csp", "sla", "escalated"),
          payload: {
            ticketNo: t.ticketNo,
            tier: d.tier,
            clock: d.clock,
            notifyRole: d.notifyRole,
            state: evaluation.state,
          },
          createdAt: new Date(),
        });
      }
      if (escalated.length > 0) {
        await tx
          .update(cspTicket)
          .set({ escalationFired: [...alreadyFired, ...escalated], updatedBy: actorId, updatedAt: new Date() })
          .where(eq(cspTicket.id, ticketId));
      }
    }

    if (t.slaState !== evaluation.state) {
      await tx
        .update(cspTicket)
        .set({ slaState: evaluation.state, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(cspTicket.id, ticketId));
      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId,
        eventType: "sla.state_changed",
        fromValue: t.slaState,
        toValue: evaluation.state,
        actorType: "system",
        detail: { reason: evaluation.reason, consumedMins: evaluation.consumedMins },
        occurredAt: new Date(asOf),
      });
    }

    return { ...evaluation, chip: slaChip(evaluation.state), escalated };
  }

  /**
   * The scanner. In production this is a BullMQ repeatable job on a worker-role instance
   * of the same image; here it is a method so the demo can advance the clock explicitly
   * rather than waiting for one.
   *
   * `asOf` is a parameter for the same reason the verdict is derived rather than timed: a
   * scan that can only ever run at "now" cannot be tested, and an SLA engine that cannot be
   * time-travelled is an SLA engine nobody has checked.
   */
  async scanOpen(asOf: string): Promise<Array<{ ticketNo: string; state: string; consumedMins: number; escalated: string[] }>> {
    return withTenant(async (tx) => {
      const open = await tx
        .select({ id: cspTicket.id, ticketNo: cspTicket.ticketNo })
        .from(cspTicket)
        .where(notInArray(cspTicket.status, ["closed"]));
      const out: Array<{ ticketNo: string; state: string; consumedMins: number; escalated: string[] }> = [];
      for (const t of open) {
        const e = await this.evaluate(tx, t.id, asOf);
        out.push({ ticketNo: t.ticketNo, state: e.state, consumedMins: e.consumedMins, escalated: e.escalated });
      }
      return out;
    });
  }
}
