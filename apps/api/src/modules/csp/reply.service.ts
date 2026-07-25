import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  currentTenant,
  isCustomerVisible,
  newId,
  type ReplyContext,
} from "@ind-core/platform";
import { ReplyDrafter, type TemplateKind } from "../../ai/reply-drafter.js";
import { TicketService } from "./ticket.service.js";

const { cspTicket, cspTicketComment, cspTicketEvent, cspSlaPolicy } = schema;

/**
 * AI #6 wired to the record.
 *
 * The whole feature is two methods, and the boundary between them is the point:
 *
 *   `suggest()` writes a comment with `author_type = 'ai_draft'`. The
 *   customer-visibility rule excludes that value and a database CHECK constraint forbids
 *   such a row from ever carrying a `sent_at`. It is a suggestion sitting on the ticket.
 *
 *   `send()` is the human act. It rewrites the author to `staff`, stamps who sent it and
 *   when, and only then is the text a statement the company has made — at which point a
 *   trigger freezes it, because a reply the customer has already read cannot be edited
 *   into something they did not receive.
 *
 * The context handed to the drafter is built from PUBLIC comments only. An internal note
 * cannot reach a drafting prompt, which is the difference between a model that might leak
 * an internal note and a model that has never seen one.
 */
@Injectable()
export class ReplyService {
  constructor(
    private readonly drafter: ReplyDrafter,
    private readonly tickets: TicketService,
  ) {}

  async suggest(
    ticketNo: string,
    kind: TemplateKind = "acknowledge",
  ): Promise<{
    commentId: string;
    body: string;
    source: string;
    sent: boolean;
    banner: string;
    degraded: boolean;
    refusedReason?: string;
    summary: string;
  }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const t = await this.tickets.byNoInTx(tx, ticketNo);
      const ctx = await this.contextFor(tx, t.id);
      const draft = await this.drafter.draft(ctx, kind);

      const commentId = newId();
      await tx.insert(cspTicketComment).values({
        id: commentId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        body: draft.body,
        visibility: "public",
        // Not a message. A message is what this becomes when a human presses send.
        authorType: "ai_draft",
        authorRef: actorId,
        aiProvenance: {
          source: draft.source,
          degraded: draft.degraded,
          refusedReason: draft.refusedReason ?? null,
          template: kind,
          banner: draft.banner,
        },
      });
      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        eventType: "ai.reply_drafted",
        toValue: draft.source,
        actorType: "ai",
        detail: { degraded: draft.degraded, refusedReason: draft.refusedReason ?? null, template: kind },
        occurredAt: new Date(),
      });

      return { commentId, ...draft };
    });
  }

  /**
   * Send a draft. The agent may edit the text first — that is the entire point of an
   * assistive draft — and the edited text is what is sent and what is frozen.
   */
  async send(commentId: string, editedBody?: string): Promise<{ commentId: string; sentAt: string; edited: boolean }> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [c] = await tx.select().from(cspTicketComment).where(eq(cspTicketComment.id, commentId)).limit(1);
      if (!c) throw Errors.notFound("draft");
      if (c.authorType !== "ai_draft") {
        throw new AppError("REPLY_NOT_A_DRAFT", 422, "That comment has already been sent; drafts are sent once.");
      }
      const now = new Date();
      const body = editedBody?.trim() ? editedBody.trim() : c.body;
      await tx
        .update(cspTicketComment)
        .set({
          body,
          authorType: "staff",
          sentAt: now,
          sentByRef: actorId,
          aiProvenance: { ...(c.aiProvenance as Record<string, unknown>), editedBeforeSending: body !== c.body, sentBy: actorId },
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(cspTicketComment.id, commentId));

      // Sending a public reply IS the first response, if there has not been one.
      const [t] = await tx.select().from(cspTicket).where(eq(cspTicket.id, c.ticketId)).limit(1);
      if (t && t.firstRespondedAt == null) {
        await tx.update(cspTicket).set({ firstRespondedAt: now, updatedBy: actorId, updatedAt: now }).where(eq(cspTicket.id, t.id));
      }
      return { commentId, sentAt: now.toISOString(), edited: body !== c.body };
    });
  }

  /** The context a drafter is allowed to see. PUBLIC comments only. */
  private async contextFor(tx: Tx, ticketId: string): Promise<ReplyContext> {
    const [t] = await tx.select().from(cspTicket).where(eq(cspTicket.id, ticketId)).limit(1);
    if (!t) throw Errors.notFound("ticket");
    const comments = await tx
      .select()
      .from(cspTicketComment)
      .where(eq(cspTicketComment.ticketId, ticketId))
      .orderBy(cspTicketComment.createdAt);
    const [policy] = t.slaPolicyId
      ? await tx.select().from(cspSlaPolicy).where(eq(cspSlaPolicy.id, t.slaPolicyId)).limit(1)
      : [null];

    const publicThread = comments
      .filter((c) => isCustomerVisible({ visibility: c.visibility as "public" | "internal", authorType: c.authorType as never }))
      .map((c) => ({ author: (c.authorType === "portal" ? "customer" : "agent") as "customer" | "agent", body: c.body }));

    // Every figure on the ticket the customer can already see. The gate rejects any other
    // number the model produces, so this list is what makes a legitimate figure quotable.
    const knownNumbers: number[] = [];
    for (const src of [t.subject, t.description, ...publicThread.map((c) => c.body)]) {
      for (const m of src.matchAll(/\d+(?:\.\d+)?/g)) knownNumbers.push(Number(m[0]));
    }

    return {
      ticketNo: t.ticketNo,
      subject: t.subject,
      customerName: "the customer",
      status: t.status,
      slaPromise: policy ? `First response within ${policy.responseMins} business minutes` : null,
      publicThread,
      entitlementResult: t.entitlementResult,
      knownNumbers,
    };
  }
}
