import {
  assertOpenDeadline,
  awardBlockers,
  landedUnitCost,
  lockCommercialInTx,
} from "../../common/commercial-rules.js";
import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import { newId, currentTenant, AppError, Errors } from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import {
  SOURCING_QUOTE_SINK,
  type SourcingQuoteSink,
} from "../../ports/sourcing.port.js";
import {
  NotifyService,
  renderRfqCard,
  renderQuoteReceivedCard,
  type OutboundMessage,
} from "./notify.service.js";

const {
  networkSupplier,
  rfqBroadcast,
  rfqInvite,
  notificationOutbox,
  networkQuoteSubmission,
  sourcingRfq,
  sourcingRfqInvitation,
  sourcingTender,
  vendor,
  company,
  sourcingSupplierQuote,
  item,
} = schema;

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;
const m2 = (n: number): string => round2(n).toFixed(2);
const hashToken = (raw: string): string =>
  createHash("sha256").update(raw, "utf8").digest("hex");

export interface SupplierInput {
  supplierCode: string;
  name: string;
  categories?: string[];
  city?: string;
  stateCode?: string;
  gstin?: string;
  contactName?: string;
  whatsappE164?: string;
  email?: string;
  vendorId?: string;
  notes?: string;
}

export interface SubmitQuoteInput {
  unitPrice: number;
  toolingCost?: number;
  freightCost?: number;
  promisedDate?: string;
  leadTimeDays?: number;
  moq?: number;
  supplierNote?: string;
}

export interface RankedQuote {
  submissionId: string;
  supplierId: string;
  supplierName: string;
  landedCost: string;
  promisedDate: string | null;
  leadTimeDays: number | null;
  meetsNeedDate: boolean | null;
  costScore: number;
  speedScore: number;
  score: number;
  rank: number;
  /** Why it sits where it sits, in a sentence a buyer can repeat to their manager. */
  explanation: string;
  /** Set when the answer cannot be used at all, whatever it costs. */
  disqualified: string | null;
}

/**
 * THE SUPPLIER NETWORK.
 *
 * Sourcing knows how to compare quotes; this knows how to GO AND GET THEM. A request is
 * published to matching suppliers, each is messaged a link, and the link opens a page where
 * they answer without an account. Their answer comes back as a submission, and a submission
 * accepted by the buyer becomes an ordinary sourcing quote — from which point every rule
 * that already existed applies to it unchanged.
 *
 * Three decisions worth stating:
 *
 *   THE LINK IS THE IDENTITY. A supplier is a workshop with a phone; if answering costs a
 *   registration they do not answer. So the token is random, single-purpose, expiring, and
 *   stored only as a hash — the same shape as a password reset, for the same reasons.
 *
 *   A SUBMISSION IS NOT A QUOTE. What arrives from outside the building is held in its own
 *   table until the buyer accepts it. `sourcing_supplier_quote` is a record inside the
 *   buyer's books and must not be writable by a stranger holding a URL.
 *
 *   THE RANKING EXPLAINS AND DOES NOT DECIDE. It is arithmetic over cost and delivery, and
 *   it says its reasoning in words. It cannot award, cannot exclude a supplier, and cannot
 *   move a quote that failed the specification back into contention (DECISIONS-V2 §4).
 */
@Injectable()
export class NetworkService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly notify: NotifyService,
    @Inject(SOURCING_QUOTE_SINK) private readonly rfqs: SourcingQuoteSink,
  ) {}

  // ---- suppliers ----------------------------------------------------------

  async upsertSupplier(
    input: SupplierInput,
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ ...input, op: "upsert-network-supplier" }),
      async () => ({ status: 201, body: await this.doUpsertSupplier(input) }),
    );
    return result.body;
  }

  private async doUpsertSupplier(
    input: SupplierInput,
  ): Promise<{ id: string }> {
    if (!input.whatsappE164 && !input.email) {
      throw Errors.validation([
        {
          field: "whatsappE164",
          message:
            "a supplier needs a WhatsApp number or an email address, or they cannot be asked",
        },
      ]);
    }
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      if (input.vendorId) {
        const [approved] = await tx
          .select()
          .from(vendor)
          .where(and(eq(vendor.id, input.vendorId), eq(vendor.isActive, true)));
        if (!approved) throw Errors.notFound("active approved vendor");
      }
      const [existing] = await tx
        .select({ id: networkSupplier.id })
        .from(networkSupplier)
        .where(eq(networkSupplier.supplierCode, input.supplierCode))
        .limit(1);

      const values = {
        name: input.name,
        categories: input.categories ?? [],
        city: input.city ?? null,
        stateCode: input.stateCode ?? null,
        gstin: input.gstin ?? null,
        contactName: input.contactName ?? null,
        whatsappE164: input.whatsappE164 ?? null,
        email: input.email ?? null,
        vendorId: input.vendorId ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
        updatedBy: actorId,
      };

      if (existing) {
        await tx
          .update(networkSupplier)
          .set(values)
          .where(eq(networkSupplier.id, existing.id));
        return { id: existing.id };
      }
      const id = newId();
      await tx.insert(networkSupplier).values({
        id,
        tenantId,
        createdBy: actorId,
        supplierCode: input.supplierCode,
        status: "active",
        ...values,
      });
      await this.audit.appendInTx(tx, {
        action: "purchase.network.supplier_added",
        entityType: "network_supplier",
        entityId: id,
        data: { supplierCode: input.supplierCode, name: input.name },
      });
      return { id };
    });
  }

  async listSuppliers(): Promise<(typeof networkSupplier.$inferSelect)[]> {
    return withTenant((tx) =>
      tx.select().from(networkSupplier).orderBy(asc(networkSupplier.name)),
    );
  }

  // ---- broadcast ----------------------------------------------------------

  /**
   * Publish an RFQ to the network. Suppliers are chosen by CATEGORY, not by a search box —
   * a request sent to everybody is spam, and a network that sends spam stops being answered.
   */
  async broadcast(
    rfqId: string,
    input: { supplierIds?: string[]; category?: string },
    idempotencyKey: string,
  ): Promise<{ broadcastId: string; invited: number; messages: number }> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ rfqId, ...input, op: "broadcast-rfq" }),
      async () => ({ status: 201, body: await this.doBroadcast(rfqId, input) }),
    );
    return result.body;
  }

  private async doBroadcast(
    rfqId: string,
    input: { supplierIds?: string[]; category?: string },
  ): Promise<{ broadcastId: string; invited: number; messages: number }> {
    const { tenantId, actorId } = currentTenant();
    const base = process.env.SOURCE_PORTAL_BASE_URL ?? "http://localhost:4301";
    const ttlHours = Math.min(
      336,
      Math.max(1, Number(process.env.SOURCE_INVITE_TTL_HOURS ?? 336) || 336),
    );

    const queued: string[] = [];
    const out = await withTenant(async (tx) => {
      await lockCommercialInTx(tx);
      const [rfq] = await tx
        .select()
        .from(sourcingRfq)
        .where(eq(sourcingRfq.id, rfqId))
        .limit(1);
      if (!rfq) throw Errors.notFound(`RFQ '${rfqId}'`);
      assertOpenDeadline(rfq.quoteDeadline);
      if (rfq.status !== "issued" && rfq.status !== "evaluation") {
        throw new AppError(
          "RFQ_NOT_OPEN",
          409,
          `${rfq.rfqNo} is ${rfq.status} and cannot be published.`,
        );
      }

      if (rfq.tenderId) {
        const [tender] = await tx
          .select()
          .from(sourcingTender)
          .where(eq(sourcingTender.id, rfq.tenderId));
        if (tender?.status !== "published")
          throw new AppError(
            "TENDER_BIDDING_CLOSED",
            409,
            "This tender is not accepting bids.",
          );
      }
      const all = await tx
        .select()
        .from(networkSupplier)
        .where(eq(networkSupplier.status, "active"));
      const chosen = input.supplierIds?.length
        ? all.filter((s) => input.supplierIds!.includes(s.id))
        : input.category
          ? all.filter((s) =>
              (s.categories as string[]).includes(input.category!),
            )
          : all;
      if (chosen.length === 0) {
        throw new AppError(
          "NO_SUPPLIERS_MATCHED",
          409,
          "No active supplier on the network matches this request. Add one, or widen the category.",
        );
      }

      const [it] = await tx
        .select({ code: item.itemCode, name: item.name })
        .from(item)
        .where(eq(item.id, rfq.itemId))
        .limit(1);
      const itemLabel = it ? `${it.code} — ${it.name}` : rfq.title;

      const broadcastId = newId();
      const [buyer] = await tx.select().from(company).limit(1);
      const cardPayload = {
        buyerName: buyer?.legalName ?? "Manufacturing sourcing desk",
        rfqNo: rfq.rfqNo,
        itemLabel,
        qty: rfq.qty,
        uom: rfq.uom,
        needDate: rfq.needDate,
        quoteDeadline: rfq.quoteDeadline,
        drawingRev: rfq.drawingRev,
        deliveryPlant: rfq.deliveryPlant,
        notes: rfq.notes,
      };

      await tx.insert(rfqBroadcast).values({
        id: broadcastId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        rfqId,
        rfqNo: rfq.rfqNo,
        cardPayload,
        supplierCount: chosen.length,
        status: "published",
        closesAt: new Date(`${rfq.quoteDeadline}T23:59:59Z`),
      });

      let messages = 0;
      for (const supplier of chosen) {
        // 32 random bytes: the link is the only credential, so it must not be guessable or
        // derivable from anything a stranger could reconstruct. Only the hash of THIS part is
        // stored. The tenant id is prefixed onto the link so the request can be fenced before
        // any query runs (see the supplier zone in tenant.middleware.ts) — it is not a secret,
        // and the secret is everything after the tilde.
        const raw = randomBytes(32).toString("base64url");
        const linkToken = `${tenantId}~${raw}`;
        const inviteId = newId();
        await tx.insert(rfqInvite).values({
          id: inviteId,
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          broadcastId,
          rfqId,
          supplierId: supplier.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(
            Math.min(
              Date.now() + ttlHours * 3_600_000,
              Date.parse(`${rfq.quoteDeadline}T23:59:59.999Z`),
            ),
          ),
          state: "sent",
        });

        const link = `${base}/supplier/${linkToken}`;
        const body = renderRfqCard({ ...cardPayload, link });
        const common = {
          template: "rfq_invitation" as const,
          body,
          variables: { ...cardPayload, link },
          linkUrl: link,
          relatedType: "rfq_invite",
          relatedId: inviteId,
          recipientName: supplier.name,
        };

        // Both channels when we have both. A workshop that ignores email answers WhatsApp,
        // and the one that ignores WhatsApp answers email; guessing which costs a quote.
        const targets: OutboundMessage[] = [];
        if (supplier.whatsappE164) {
          targets.push({
            ...common,
            channel: "whatsapp",
            recipient: supplier.whatsappE164,
          });
        }
        if (supplier.email) {
          targets.push({
            ...common,
            channel: "email",
            recipient: supplier.email,
            subject: `${cardPayload.buyerName} — request for quotation ${rfq.rfqNo}`,
          });
        }
        for (const t of targets) {
          queued.push(await this.notify.queueInTx(tx, t));
          messages += 1;
        }
      }

      await this.audit.appendInTx(tx, {
        action: "purchase.network.broadcast",
        entityType: "rfq_broadcast",
        entityId: broadcastId,
        data: { rfqNo: rfq.rfqNo, suppliers: chosen.length, messages },
      });
      return { broadcastId, invited: chosen.length, messages };
    });

    // Delivery happens AFTER the write committed: a message must never be sent for a request
    // that then rolled back.
    for (const id of queued) await this.notify.flush(id);
    return out;
  }

  // ---- the supplier's side ------------------------------------------------

  /** What the supplier sees when they open the link. No account, no password, no app. */
  async openInvite(token: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const invite = await this.loadInvite(tx, token);
      const [supplier] = await tx
        .select()
        .from(networkSupplier)
        .where(eq(networkSupplier.id, invite.supplierId))
        .limit(1);
      const [broadcast] = await tx
        .select()
        .from(rfqBroadcast)
        .where(eq(rfqBroadcast.id, invite.broadcastId))
        .limit(1);
      const [submission] = await tx
        .select()
        .from(networkQuoteSubmission)
        .where(eq(networkQuoteSubmission.inviteId, invite.id))
        .limit(1);

      if (!invite.openedAt) {
        await tx
          .update(rfqInvite)
          .set({
            openedAt: new Date(),
            state: invite.state === "sent" ? "opened" : invite.state,
          })
          .where(eq(rfqInvite.id, invite.id));
      }

      return {
        supplierName: supplier?.name ?? "Supplier",
        contactName: supplier?.contactName ?? null,
        card: broadcast?.cardPayload ?? {},
        expiresAt: invite.expiresAt.toISOString(),
        state: submission
          ? "quoted"
          : invite.state === "sent"
            ? "opened"
            : invite.state,
        submitted: submission
          ? {
              unitPrice: submission.unitPrice,
              landedCost: submission.landedCost,
              promisedDate: submission.promisedDate,
              submittedAt: submission.createdAt.toISOString(),
            }
          : null,
      };
    });
  }

  /** The supplier's answer. Four fields matter; the rest are optional on purpose. */
  async submitQuote(
    token: string,
    input: SubmitQuoteInput,
  ): Promise<{ ok: true; landedCost: string }> {
    const { tenantId, actorId } = currentTenant();
    const queued: string[] = [];

    const out = await withTenant(async (tx) => {
      await lockCommercialInTx(tx);
      const invite = await this.loadInvite(tx, token);
      const [request] = await tx
        .select()
        .from(sourcingRfq)
        .where(eq(sourcingRfq.id, invite.rfqId))
        .limit(1);
      if (!request) throw Errors.notFound("this request");
      assertOpenDeadline(request.quoteDeadline);
      if (!["issued", "evaluation"].includes(request.status))
        throw new AppError(
          "RFQ_NOT_OPEN",
          409,
          "This request no longer accepts bids.",
        );
      const [broadcast] = await tx
        .select()
        .from(rfqBroadcast)
        .where(eq(rfqBroadcast.id, invite.broadcastId));
      if (broadcast?.status !== "published")
        throw new AppError("BIDDING_CLOSED", 409, "This invitation is closed.");
      if (request.tenderId) {
        const [tender] = await tx
          .select()
          .from(sourcingTender)
          .where(eq(sourcingTender.id, request.tenderId));
        if (tender?.status !== "published")
          throw new AppError(
            "TENDER_BIDDING_CLOSED",
            409,
            "Tender bidding is closed.",
          );
      }
      const [existing] = await tx
        .select({ id: networkQuoteSubmission.id })
        .from(networkQuoteSubmission)
        .where(eq(networkQuoteSubmission.inviteId, invite.id))
        .limit(1);
      if (existing) {
        throw new AppError(
          "ALREADY_ANSWERED",
          409,
          "You have already sent a price for this request. Contact the buyer to change it.",
        );
      }

      const landed = landedUnitCost(
        Number(request.qty),
        input.unitPrice,
        input.toolingCost,
        input.freightCost,
      );

      const submissionId = newId();
      await tx.insert(networkQuoteSubmission).values({
        id: submissionId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        inviteId: invite.id,
        rfqId: invite.rfqId,
        supplierId: invite.supplierId,
        unitPrice: m2(input.unitPrice),
        toolingCost: m2(input.toolingCost ?? 0),
        freightCost: m2(input.freightCost ?? 0),
        landedCost: landed,
        promisedDate: input.promisedDate ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        moq: input.moq === undefined ? null : String(input.moq),
        supplierNote: input.supplierNote ?? null,
        status: "received",
      });
      await tx
        .update(rfqInvite)
        .set({ state: "quoted", respondedAt: new Date() })
        .where(eq(rfqInvite.id, invite.id));

      const [supplier] = await tx
        .select()
        .from(networkSupplier)
        .where(eq(networkSupplier.id, invite.supplierId))
        .limit(1);
      const [rfq] = await tx
        .select()
        .from(sourcingRfq)
        .where(eq(sourcingRfq.id, invite.rfqId))
        .limit(1);

      // Tell the buyer at once. The value of a network is the speed of the answer, and an
      // answer sitting unread in a screen nobody opened is not an answer.
      if (rfq && process.env.SOURCE_BUYER_WHATSAPP) {
        const link = `${process.env.SOURCE_PORTAL_BASE_URL ?? "http://localhost:4301"}/sourcing/detail/${rfq.id}`;
        const body = renderQuoteReceivedCard({
          supplierName: supplier?.name ?? "A supplier",
          rfqNo: rfq.rfqNo,
          itemLabel: rfq.title,
          landedCost: landed,
          promisedDate: input.promisedDate ?? null,
          meetsNeedDate: input.promisedDate
            ? input.promisedDate <= rfq.needDate
            : null,
          link,
        });
        queued.push(
          await this.notify.queueInTx(tx, {
            channel: "whatsapp",
            recipient: process.env.SOURCE_BUYER_WHATSAPP!,
            recipientName: "Sourcing desk",
            template: "quote_received",
            body,
            variables: {
              rfqNo: rfq.rfqNo,
              supplier: supplier?.name,
              landedCost: landed,
            },
            linkUrl: link,
            relatedType: "sourcing_rfq",
            relatedId: rfq.id,
          }),
        );
      }
      return { ok: true as const, landedCost: landed };
    });

    for (const id of queued) await this.notify.flush(id);
    return out;
  }

  private async loadInvite(
    tx: Tx,
    token: string,
  ): Promise<typeof rfqInvite.$inferSelect> {
    // The link is `<tenantId>~<secret>`; the tenant half already did its job in the
    // middleware, and only the secret half was ever hashed into the row.
    const secret = token.includes("~")
      ? token.slice(token.indexOf("~") + 1)
      : token;
    const [invite] = await tx
      .select()
      .from(rfqInvite)
      .where(eq(rfqInvite.tokenHash, hashToken(secret)))
      .limit(1);
    // A bad token and an expired one are both "this link does not work" — never a hint that
    // the token was real, which is the whole of the enumeration attack.
    if (!invite) throw Errors.notFound("this invitation");
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new AppError(
        "INVITE_EXPIRED",
        410,
        "This invitation has expired. Ask the buyer for a new link.",
      );
    }
    return invite;
  }

  // ---- bringing answers into the buyer's books ----------------------------

  /**
   * Copy a submission into a real sourcing quote. Deliberately a buyer action: what arrived
   * from outside the building becomes a record inside it only when somebody inside says so.
   */
  async acceptSubmission(
    submissionId: string,
    idempotencyKey: string,
  ): Promise<{ quoteId: string }> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ submissionId, op: "accept-submission" }),
      async () => ({ status: 201, body: await this.doAccept(submissionId) }),
    );
    return result.body;
  }

  private async doAccept(submissionId: string): Promise<{ quoteId: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      await lockCommercialInTx(tx);
      const [s] = await tx
        .select()
        .from(networkQuoteSubmission)
        .where(eq(networkQuoteSubmission.id, submissionId))
        .for("update");
      if (!s) throw Errors.notFound(`submission '${submissionId}'`);
      if (s.sourcingQuoteId) return { quoteId: s.sourcingQuoteId };
      const [supplier] = await tx
        .select()
        .from(networkSupplier)
        .where(eq(networkSupplier.id, s.supplierId));
      if (!supplier?.vendorId || supplier.status !== "active")
        throw new AppError(
          "SUPPLIER_NOT_A_VENDOR",
          409,
          "Link this active network supplier to an approved vendor before accepting a quote.",
        );
      const [approved] = await tx
        .select()
        .from(vendor)
        .where(
          and(eq(vendor.id, supplier.vendorId), eq(vendor.isActive, true)),
        );
      if (!approved)
        throw new AppError(
          "SUPPLIER_NOT_A_VENDOR",
          409,
          "The linked vendor must exist and be active.",
        );
      // A network invitation is explicit buyer consent to receive this approved vendor's
      // answer. Establish its ordinary RFQ invitation in the same transaction.
      await tx
        .insert(sourcingRfqInvitation)
        .values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          rfqId: s.rfqId,
          vendorId: supplier.vendorId,
          responseStatus: "invited",
        })
        .onConflictDoNothing();
      const view = await this.rfqs.recordQuoteInTx(
        tx,
        s.rfqId,
        {
          vendorId: supplier.vendorId,
          unitPrice: Number(s.unitPrice),
          toolingCost: Number(s.toolingCost),
          freightCost: Number(s.freightCost),
          ...(s.promisedDate ? { promisedDate: s.promisedDate } : {}),
          ...(s.leadTimeDays !== null ? { leadTimeDays: s.leadTimeDays } : {}),
          ...(s.moq !== null ? { moq: Number(s.moq) } : {}),
        },
        s.createdAt.toISOString().slice(0, 10),
      );
      const live = view.quotes.find(
        (q) => q.vendorId === supplier.vendorId && q.status === "submitted",
      );
      if (!live)
        throw new AppError(
          "QUOTE_NOT_RECORDED",
          500,
          "The quote was not recorded.",
        );
      await tx
        .update(networkQuoteSubmission)
        .set({
          sourcingQuoteId: live.id,
          status: "accepted_into_sourcing",
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(eq(networkQuoteSubmission.id, submissionId));
      await this.audit.appendInTx(tx, {
        action: "purchase.network.quote.accepted",
        entityType: "network_quote_submission",
        entityId: submissionId,
        data: { quoteId: live.id, vendorId: supplier.vendorId },
      });
      return { quoteId: live.id };
    });
  }

  async listSubmissions(rfqId: string): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(networkQuoteSubmission)
        .where(eq(networkQuoteSubmission.rfqId, rfqId))
        .orderBy(asc(networkQuoteSubmission.createdAt));
      const ids = [...new Set(rows.map((r) => r.supplierId))];
      const suppliers = ids.length
        ? await tx
            .select()
            .from(networkSupplier)
            .where(inArray(networkSupplier.id, ids))
        : [];
      const byId = new Map(suppliers.map((s) => [s.id, s]));
      return rows.map((r) => ({
        id: r.id,
        supplierId: r.supplierId,
        supplierName: byId.get(r.supplierId)?.name ?? null,
        supplierIsVendor: Boolean(byId.get(r.supplierId)?.vendorId),
        unitPrice: r.unitPrice,
        toolingCost: r.toolingCost,
        freightCost: r.freightCost,
        landedCost: r.landedCost,
        promisedDate: r.promisedDate,
        leadTimeDays: r.leadTimeDays,
        moq: r.moq,
        supplierNote: r.supplierNote,
        status: r.status,
        sourcingQuoteId: r.sourcingQuoteId,
        receivedAt: r.createdAt.toISOString(),
      }));
    });
  }

  // ---- the ranking --------------------------------------------------------

  /**
   * ORDER THE ANSWERS BY WHAT THE BUYER ACTUALLY WANTS: soon enough, and cheap.
   *
   * Both halves are normalised against the best answer on the page, so the score says "how
   * close to the best available", not "how good in the abstract" — a 60% on a page where
   * everything is late is a different fact from a 60% where everything is early, and the
   * explanation says which.
   *
   * It is ARITHMETIC, and it EXPLAINS. It does not award, cannot exclude a supplier, and a
   * quote that misses the need date is marked as unusable rather than quietly ranked last:
   * a buyer who scrolls past the marker must still meet a refusal at the award (§4).
   */
  async rank(
    rfqId: string,
  ): Promise<{ needDate: string; quotes: RankedQuote[] }> {
    return withTenant(async (tx) => {
      const [rfq] = await tx
        .select()
        .from(sourcingRfq)
        .where(eq(sourcingRfq.id, rfqId))
        .limit(1);
      if (!rfq) throw Errors.notFound(`RFQ '${rfqId}'`);

      const rows = await tx
        .select()
        .from(networkQuoteSubmission)
        .where(eq(networkQuoteSubmission.rfqId, rfqId));
      const ids = [...new Set(rows.map((r) => r.supplierId))];
      const suppliers = ids.length
        ? await tx
            .select()
            .from(networkSupplier)
            .where(inArray(networkSupplier.id, ids))
        : [];
      const nameOf = new Map(suppliers.map((s) => [s.id, s.name]));

      if (rows.length === 0) return { needDate: rfq.needDate, quotes: [] };

      const formalQuotes = await tx
        .select()
        .from(sourcingSupplierQuote)
        .where(eq(sourcingSupplierQuote.rfqId, rfqId));
      const formalById = new Map(formalQuotes.map((q) => [q.id, q]));
      const costs = rows.map((r) => Number(r.landedCost));
      const cheapest = Math.min(...costs);
      const dearest = Math.max(...costs);
      const days = (iso: string | null): number | null => {
        if (!iso) return null;
        const t = Date.parse(`${iso}T00:00:00Z`);
        return Number.isFinite(t)
          ? Math.round((t - Date.now()) / 86_400_000)
          : null;
      };
      const promised = rows
        .map((r) => days(r.promisedDate))
        .filter((d): d is number => d !== null);
      const soonest = promised.length ? Math.min(...promised) : 0;
      const latest = promised.length ? Math.max(...promised) : 0;

      const scored = rows.map((r) => {
        const formal = r.sourcingQuoteId
          ? formalById.get(r.sourcingQuoteId)
          : undefined;
        const blockers = formal
          ? awardBlockers(rfq, formal)
          : ["Buyer acceptance and technical approval are still required."];
        if (formal && formal.status !== "submitted")
          blockers.push("This quote revision is no longer current.");
        if (!r.promisedDate)
          blockers.push("A supplier delivery date is required.");
        if (r.promisedDate && r.promisedDate > rfq.needDate)
          blockers.push("Cannot deliver before the material is needed.");
        if (r.moq && Number(r.moq) > Number(rfq.qty))
          blockers.push(
            "Supplier minimum order exceeds the requested quantity.",
          );
        const cost = Number(r.landedCost);
        // 1 when cheapest, 0 when dearest. A single answer scores 1 rather than dividing by nought.
        const costScore =
          dearest === cheapest ? 1 : (dearest - cost) / (dearest - cheapest);
        const d = days(r.promisedDate);
        const speedScore =
          d === null
            ? 0
            : latest === soonest
              ? 1
              : (latest - d) / (latest - soonest);
        const meets = r.promisedDate ? r.promisedDate <= rfq.needDate : null;
        // Delivery slightly ahead of price: a cheap part that arrives after the build has
        // cost more than the difference, every time.
        const score = round2(speedScore * 0.55 + costScore * 0.45);

        const money = `₹${Number(r.landedCost).toLocaleString("en-IN")}`;
        const explanation =
          meets === false
            ? `${money} landed, but promises ${r.promisedDate} against a need date of ${rfq.needDate}. It cannot be used at this price or any other.`
            : meets === null
              ? `${money} landed, with no delivery date given — the one fact this ranking cannot weigh.`
              : cost === cheapest
                ? `Cheapest at ${money}, and delivers by ${r.promisedDate}, inside the need date.`
                : `${money} landed${cheapest > 0 ? ` — ${Math.round(((cost - cheapest) / cheapest) * 100)}% above the cheapest answer` : ""}, delivering ${r.promisedDate}.`;

        return {
          submissionId: r.id,
          supplierId: r.supplierId,
          supplierName: nameOf.get(r.supplierId) ?? "Supplier",
          landedCost: r.landedCost,
          promisedDate: r.promisedDate,
          leadTimeDays: r.leadTimeDays,
          meetsNeedDate: meets,
          costScore: round2(costScore),
          speedScore: round2(speedScore),
          score,
          rank: 0,
          explanation: `${explanation}${blockers.length ? ` Review required: ${[...new Set(blockers)].join(" ")}` : " Technical and commercial checks passed."}`,
          disqualified: blockers.length
            ? [...new Set(blockers)].join(" ")
            : null,
        };
      });

      // Anything that cannot arrive in time sinks, whatever it costs — the ordering must not
      // put an unusable answer at the top just because it was cheap.
      scored.sort((a, b) => {
        if (Boolean(a.disqualified) !== Boolean(b.disqualified))
          return a.disqualified ? 1 : -1;
        if (a.meetsNeedDate !== b.meetsNeedDate)
          return a.meetsNeedDate === true
            ? -1
            : b.meetsNeedDate === true
              ? 1
              : 0;
        return b.score - a.score;
      });
      scored.forEach((q, i) => {
        q.rank = i + 1;
      });
      return { needDate: rfq.needDate, quotes: scored };
    });
  }

  // ---- the message outbox -------------------------------------------------

  /** Every message this system meant to send, newest first, fully rendered. */
  async listOutbox(
    limit = 100,
  ): Promise<(typeof notificationOutbox.$inferSelect)[]> {
    const rows = await withTenant((tx) =>
      tx
        .select()
        .from(notificationOutbox)
        .orderBy(desc(notificationOutbox.createdAt))
        .limit(limit),
    );
    return rows.map((row) => this.notify.decode(row));
  }

  async listBroadcasts(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(rfqBroadcast)
        .orderBy(desc(rfqBroadcast.createdAt));
      const ids = rows.map((r) => r.id);
      const invites = ids.length
        ? await tx
            .select()
            .from(rfqInvite)
            .where(inArray(rfqInvite.broadcastId, ids))
        : [];
      return rows.map((b) => {
        const mine = invites.filter((i) => i.broadcastId === b.id);
        return {
          id: b.id,
          rfqId: b.rfqId,
          rfqNo: b.rfqNo,
          supplierCount: b.supplierCount,
          opened: mine.filter((i) => i.openedAt !== null).length,
          quoted: mine.filter((i) => i.state === "quoted").length,
          status: b.status,
          publishedAt: b.createdAt.toISOString(),
          card: b.cardPayload,
        };
      });
    });
  }
}
