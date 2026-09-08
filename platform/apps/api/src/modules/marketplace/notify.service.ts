import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { deliverMessage, DeliveryError } from "./notify-provider.js";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@ind-core/db";
import { newId, currentTenant } from "@ind-core/platform";

const { notificationOutbox } = schema;

export type NotifyChannel = "whatsapp" | "email";
export type NotifyTemplate =
  "rfq_invitation" | "quote_received" | "award_notice";

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

/** Transactional outbox with explicit preview, sent, failed and uncertain delivery states.
 * Live payloads (including bearer links) are AES-GCM encrypted before database storage.
 * Preview installations may omit the key; their database then contains invitation secrets. */
@Injectable()
export class NotifyService {
  private providerFor(channel: NotifyChannel): string {
    return (
      (channel === "email"
        ? process.env.NOTIFY_EMAIL_PROVIDER
        : process.env.NOTIFY_WHATSAPP_PROVIDER) ??
      process.env.NOTIFY_PROVIDER ??
      "preview"
    );
  }
  private encryptionKey(): Buffer | null {
    const value = process.env.NOTIFY_ENCRYPTION_KEY;
    if (!value) return null;
    if (!/^[0-9a-f]{64}$/i.test(value))
      throw new Error(
        "NOTIFY_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.",
      );
    return Buffer.from(value, "hex");
  }
  async queueInTx(tx: Tx, message: OutboundMessage): Promise<string> {
    const { tenantId, actorId } = currentTenant();
    const id = newId();
    const provider = this.providerFor(message.channel);
    const previewOnly = provider === "preview";
    const key = this.encryptionKey();
    if (!previewOnly && !key)
      throw new Error(
        "Live notification delivery requires NOTIFY_ENCRYPTION_KEY to protect invitation links at rest.",
      );
    let encryptedPayload: string | null = null;
    if (key) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(`${tenantId}:${id}`));
      const ciphertext = Buffer.concat([
        cipher.update(
          JSON.stringify({
            body: message.body,
            variables: message.variables,
            linkUrl: message.linkUrl ?? null,
          }),
          "utf8",
        ),
        cipher.final(),
      ]);
      encryptedPayload = [iv, cipher.getAuthTag(), ciphertext]
        .map((v) => v.toString("base64url"))
        .join(".");
    }
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
      body: encryptedPayload ? "Protected notification payload" : message.body,
      variables: encryptedPayload ? {} : message.variables,
      linkUrl: encryptedPayload ? null : (message.linkUrl ?? null),
      encryptedPayload,
      relatedType: message.relatedType ?? null,
      relatedId: message.relatedId ?? null,
      provider,
      status: previewOnly ? "previewed" : "pending",
      sentAt: null,
    });
    return id;
  }
  decode(
    row: typeof notificationOutbox.$inferSelect,
  ): typeof notificationOutbox.$inferSelect {
    if (!row.encryptedPayload) return row;
    const key = this.encryptionKey();
    if (!key)
      throw new Error(
        "NOTIFY_ENCRYPTION_KEY is required to read this protected message.",
      );
    const [iv, tag, ciphertext] = row.encryptedPayload
      .split(".")
      .map((value) => Buffer.from(value, "base64url"));
    if (!iv || !tag || !ciphertext)
      throw new Error("Invalid encrypted notification payload.");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(`${row.tenantId}:${row.id}`));
    decipher.setAuthTag(tag);
    const payload = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        "utf8",
      ),
    ) as { body: string; variables: unknown; linkUrl: string | null };
    return { ...row, ...payload, encryptedPayload: null };
  }
  /** Atomically claim, commit, then call the provider with no open transaction.
   * A crashed/uncertain sender is not automatically retried: that could send twice. */
  async flush(outboxId: string): Promise<void> {
    const { actorId } = currentTenant();
    const [row] = await withTenant((tx) =>
      tx
        .update(notificationOutbox)
        .set({ status: "sending", updatedAt: new Date(), updatedBy: actorId })
        .where(
          and(
            eq(notificationOutbox.id, outboxId),
            eq(notificationOutbox.status, "pending"),
          ),
        )
        .returning(),
    );
    if (!row) return;
    try {
      const providerMessageId = await deliverMessage(this.decode(row));
      await withTenant((tx) =>
        tx
          .update(notificationOutbox)
          .set({
            status: "sent",
            providerMessageId,
            sentAt: new Date(),
            updatedAt: new Date(),
            updatedBy: actorId,
          })
          .where(eq(notificationOutbox.id, outboxId)),
      );
    } catch (error) {
      const uncertain = error instanceof DeliveryError && error.uncertain;
      await withTenant((tx) =>
        tx
          .update(notificationOutbox)
          .set({
            status: uncertain ? "delivery_unknown" : "failed",
            failureReason:
              error instanceof Error ? error.message : "Delivery failed",
            updatedAt: new Date(),
            updatedBy: actorId,
          })
          .where(eq(notificationOutbox.id, outboxId)),
      );
    }
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
