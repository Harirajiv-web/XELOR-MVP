import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { AppError, Errors, currentTenant, eventName, newId } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { TicketService } from "./ticket.service.js";

const { cspCsatSurvey, cspCsatResponse, cspTicket, cspTicketEvent, outboxEvent } = schema;

const NEGATIVE = [/\breopen/i, /\bagain\b/i, /\bpoor\b/i, /\bslow\b/i, /\bunacceptab/i, /\bdisappoint/i, /\bno response\b/i];
const POSITIVE = [/\bthank/i, /\bexcellent\b/i, /\bquick/i, /\bhelpful\b/i, /\bno chasing\b/i, /\bprompt\b/i];

/**
 * CSAT.
 *
 * Three deliberate properties:
 *
 *  - **The token is a bearer credential** to write on a ticket, so only its hash is stored
 *    and the comparison is on the hash. A survey link in a mailbox that has been forwarded
 *    is still single-use.
 *  - **One response per survey**, enforced by a unique key and an append-only trigger, not
 *    by the UI hiding a button. A satisfaction score the organisation being scored can
 *    revise is not a measurement.
 *  - **A low score creates work.** Two stars raises a manager follow-up flag on the row;
 *    a score that is recorded and never acted on is a number, not a feedback loop.
 */
@Injectable()
export class CsatService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly tickets: TicketService,
  ) {}

  /** Issue a survey when a ticket closes. Returns the CLEAR token exactly once — it is
   *  never retrievable afterwards, because the database only ever held the hash. */
  async issue(ticketNo: string, opts: { at?: string; portalUserId?: string } = {}): Promise<{ ticketNo: string; token: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const t = await this.tickets.byNoInTx(tx, ticketNo);
      const at = opts.at ? new Date(opts.at) : new Date();
      const [existing] = await tx.select().from(cspCsatSurvey).where(eq(cspCsatSurvey.ticketId, t.id)).limit(1);
      if (existing) throw new AppError("CSAT_ALREADY_SENT", 409, `A survey has already been sent for ${ticketNo}.`);

      const token = randomBytes(24).toString("hex");
      await tx.insert(cspCsatSurvey).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        portalUserId: opts.portalUserId ?? t.portalUserId ?? null,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        sentAt: at,
        expiresAt: new Date(at.getTime() + 30 * 86_400_000),
      });
      return { ticketNo, token };
    });
  }

  /**
   * Submit a response. The sentiment tag is deterministic here — the same class of model
   * would tag it in production, and the tag only ROUTES a follow-up; it never changes the
   * score the customer gave.
   */
  async submit(token: string, input: { score: number; comment?: string; at?: string }): Promise<{
    ticketNo: string;
    score: number;
    sentiment: string;
    followupCreated: boolean;
  }> {
    const { tenantId, actorId } = currentTenant();
    const hash = createHash("sha256").update(token).digest("hex");
    return withTenant(async (tx) => {
      const [survey] = await tx.select().from(cspCsatSurvey).where(eq(cspCsatSurvey.tokenHash, hash)).limit(1);
      if (!survey) throw Errors.notFound("survey");
      const at = input.at ? new Date(input.at) : new Date();
      if (survey.respondedAt) throw new AppError("CSAT_ALREADY_ANSWERED", 409, "This survey has already been answered.");
      if (at > survey.expiresAt) throw new AppError("CSAT_EXPIRED", 410, "This survey link has expired.");

      const comment = input.comment ?? "";
      const negative = NEGATIVE.filter((p) => p.test(comment)).length;
      const positive = POSITIVE.filter((p) => p.test(comment)).length;
      const sentiment = negative > positive ? "negative" : positive > negative ? "positive" : "neutral";
      // A follow-up is opened on the SCORE, not on the sentiment: a 2★ with a polite
      // comment is still a 2★, and routing on tone would lose exactly the customers who
      // are too courteous to complain.
      const followupCreated = input.score <= 3;

      await tx.insert(cspCsatResponse).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: survey.customerAccountId,
        surveyId: survey.id,
        ticketId: survey.ticketId,
        csatScore: input.score,
        comment: input.comment ?? null,
        sentiment,
        followupTaskCreated: followupCreated,
      });
      await tx.update(cspCsatSurvey).set({ respondedAt: at }).where(eq(cspCsatSurvey.id, survey.id));

      const [t] = await tx.select().from(cspTicket).where(eq(cspTicket.id, survey.ticketId)).limit(1);
      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: survey.customerAccountId,
        ticketId: survey.ticketId,
        eventType: "csat.received",
        toValue: String(input.score),
        actorType: "portal",
        detail: { sentiment, followupCreated },
        occurredAt: at,
      });
      await this.audit.appendInTx(tx, {
        action: "csp.csat.received",
        entityType: "csp_ticket",
        entityId: survey.ticketId,
        data: { ticketNo: t?.ticketNo, score: input.score, sentiment },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("csp", "csat", "received"),
        payload: { ticketNo: t?.ticketNo, score: input.score, sentiment, followupCreated },
        createdAt: at,
      });

      return { ticketNo: t?.ticketNo ?? "", score: input.score, sentiment, followupCreated };
    });
  }

  /** The manager's CSAT panel: response rate, average, distribution, open follow-ups. */
  async summary(): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const surveys = await tx.select().from(cspCsatSurvey);
      const responses = await tx.select().from(cspCsatResponse);
      const scores = responses.map((r) => r.csatScore);
      const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
      for (const s of scores) distribution[String(s)] = (distribution[String(s)] ?? 0) + 1;
      return {
        sent: surveys.length,
        responded: responses.length,
        responseRatePct: surveys.length === 0 ? 0 : Math.round((responses.length / surveys.length) * 1000) / 10,
        averageCsat: scores.length === 0 ? null : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        distribution,
        openFollowUps: responses.filter((r) => r.followupTaskCreated).length,
        negativeVerbatims: responses.filter((r) => r.sentiment === "negative").length,
      };
    });
  }
}
