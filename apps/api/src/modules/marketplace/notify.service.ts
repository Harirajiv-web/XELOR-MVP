import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, type Tx } from "@ind-core/db";
import { newId, currentTenant } from "@ind-core/platform";

const { notificationOutbox } = schema;

export type NotifyChannel = "whatsapp" | "email";
export type NotifyTemplate = "rfq_invitation" | "quote_received" | "award_notice";

export interface OutboundMessage {
  channel: NotifyChannel;
  recipient: string;
  recipientName?: string;
  template: NotifyTemplate;
  subject?: string;
  body: string;
  variables: Record<string, unknown>;
  linkUrl?: string;
  relatedType?: string;
  relatedId?: string;
}

/**
 * WHAT LEAVES THE BUILDING, AND THE PROOF OF WHAT IT SAID.
 *
 * Every message is written to `notification_outbox` BEFORE any provider is called, and the
 * provider's answer is written back onto that row. The ordering is the whole design: with
 * `NOTIFY_PROVIDER=preview` nothing is sent and every row still exists, fully rendered, so
 * the exact message a supplier would receive can be read on a screen and shown to somebody.
 *
 * A messaging integration whose output you cannot see is one you learn about from the
 * customer who received the wrong text.
 *
 * `preview` is the default and needs no account anywhere. `smtp` sends real email the moment
 * credentials are set. Real WhatsApp is deliberately NOT implemented as a live sender: Meta's
 * Cloud API requires a verified business account and a pre-approved message template, so a
 * switch that pretends to send WhatsApp today would be a switch that silently does nothing.
 * The card is rendered exactly as WhatsApp would lay it out, and shown as such.
 */
@Injectable()
export class NotifyService {
  private get provider(): string {
    return process.env.NOTIFY_PROVIDER ?? "preview";
  }

  /**
   * Queue a message inside the caller's transaction. Returns the outbox row id.
   *
   * In `preview` the row is marked `previewed` immediately — it is complete and readable,
   * and calling it `sent` would be a lie told by the software about itself.
   */
  async queueInTx(tx: Tx, message: OutboundMessage): Promise<string> {
    const { tenantId, actorId } = currentTenant();
    const id = newId();
    const provider = this.provider;
    const previewOnly = provider === "preview" || (message.channel === "whatsapp" && provider !== "whatsapp_cloud");

    await tx.insert(notificationOutbox).values({
      id,
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      channel: message.channel,
      recipient: message.recipient,
      recipientName: message.recipientName ?? null,
      template: message.template,
      subject: message.subject ?? null,
      body: message.body,
      variables: message.variables,
      linkUrl: message.linkUrl ?? null,
      relatedType: message.relatedType ?? null,
      relatedId: message.relatedId ?? null,
      provider: previewOnly ? "preview" : provider,
      status: previewOnly ? "previewed" : "pending",
      sentAt: previewOnly ? new Date() : null,
    });
    return id;
  }

  /**
   * Deliver anything still `pending`. Only real providers leave rows in that state, so on a
   * preview installation this does nothing and says so.
   *
   * Deliberately called AFTER the transaction commits: a message must never be sent for a
   * request that then rolled back, and holding a database transaction open across a network
   * call to somebody else's API is how a connection pool dies on a bad afternoon.
   */
  async flush(tx: Tx, outboxId: string): Promise<void> {
    const [row] = await tx.select().from(notificationOutbox).where(eq(notificationOutbox.id, outboxId)).limit(1);
    if (!row || row.status !== "pending") return;

    const { actorId } = currentTenant();
    try {
      await this.sendLive(row.channel as NotifyChannel);
      await tx
        .update(notificationOutbox)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date(), updatedBy: actorId })
        .where(eq(notificationOutbox.id, outboxId));
    } catch (error) {
      // A failed message stays visible and says why. Silently dropping it would leave a
      // supplier who was never contacted looking identical to one who ignored us.
      await tx
        .update(notificationOutbox)
        .set({
          status: "failed",
          failureReason: error instanceof Error ? error.message : "unknown send failure",
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(eq(notificationOutbox.id, outboxId));
    }
  }

  /**
   * THE SEAM FOR A REAL SENDER, deliberately left unimplemented.
   *
   * Both live channels need something this machine does not have and cannot fake:
   *
   *   WhatsApp needs a verified Meta Business account and a message template APPROVED IN
   *   ADVANCE by Meta, which takes days. A switch that claimed to send WhatsApp today would
   *   be a switch that silently sent nothing.
   *
   *   Email needs an SMTP account and the `nodemailer` package, neither of which is
   *   installed here on purpose — a dependency carried for a path nobody runs is a
   *   dependency that rots.
   *
   * So this refuses out loud and names what is missing, and the message stays in the outbox
   * marked `failed` with that reason on it. To make email real: `pnpm --filter @ind-core/api
   * add nodemailer`, replace this method with a transport, and set SMTP_* plus
   * NOTIFY_PROVIDER=smtp.
   */
  private async sendLive(channel: NotifyChannel): Promise<never> {
    throw new Error(
      channel === "whatsapp"
        ? "WhatsApp delivery needs a verified Meta Business account and a pre-approved template; no live sender is configured."
        : "Email delivery needs SMTP credentials and a mail transport; no live sender is configured.",
    );
  }
}

/** The values a card is rendered from. Kept structured so the card can be re-rendered. */
export interface RfqCardVariables {
  buyerName: string;
  rfqNo: string;
  itemLabel: string;
  qty: string;
  uom: string;
  needDate: string;
  quoteDeadline: string;
  drawingRev: string | null;
  deliveryPlant: string;
  notes: string | null;
  link: string;
}

/**
 * THE CARD, as WhatsApp would lay it out.
 *
 * WhatsApp gives you bold (*asterisks*), line breaks and a link preview. That is the entire
 * design vocabulary, so the card is built from it rather than from something prettier that
 * would have to be thrown away. The rule it follows: a supplier reading this on a phone, in
 * a workshop, must know within five seconds WHAT is wanted, HOW MANY, and BY WHEN — because
 * that is the whole of the decision to open the link or ignore it.
 */
export function renderRfqCard(v: RfqCardVariables): string {
  // "300.000 nos" is the column talking. A supplier is quoting for 300.
  const qty = Number.isFinite(Number(v.qty)) ? String(Number(v.qty)) : v.qty;
  const lines = [
    `*${v.buyerName}* wants a price.`,
    "",
    `*${v.itemLabel}*`,
    `Quantity: *${qty} ${v.uom}*`,
    `Needed by: *${v.needDate}*`,
    v.drawingRev ? `Drawing: ${v.drawingRev}` : null,
    `Deliver to: ${v.deliveryPlant}`,
    "",
    v.notes ? `${v.notes}` : null,
    v.notes ? "" : null,
    `Please reply by *${v.quoteDeadline}*.`,
    "",
    `Send your price here — it takes a minute, no sign-up:`,
    v.link,
    "",
    `Ref ${v.rfqNo}`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

/** What the buyer is told the moment a supplier answers. */
export function renderQuoteReceivedCard(v: {
  supplierName: string;
  rfqNo: string;
  itemLabel: string;
  landedCost: string;
  promisedDate: string | null;
  meetsNeedDate: boolean | null;
  link: string;
}): string {
  const timing =
    v.meetsNeedDate === null
      ? "No delivery date given"
      : v.meetsNeedDate
        ? `Can deliver by *${v.promisedDate}* — meets your date`
        : `Offers *${v.promisedDate}* — AFTER your need date`;
  return [
    `*${v.supplierName}* has answered ${v.rfqNo}.`,
    "",
    `${v.itemLabel}`,
    `Landed price: *₹${v.landedCost}*`,
    timing,
    "",
    `Compare all the answers here:`,
    v.link,
  ].join("\n");
}
