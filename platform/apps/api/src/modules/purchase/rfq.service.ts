import {
  assertOpenDeadline,
  awardBlockers,
  landedUnitCost,
  lockCommercialInTx,
} from "../../common/commercial-rules.js";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  encodeCursor,
  decodeCursor,
  AppError,
  Errors,
  type CursorPage,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { NumberingService, fyCode } from "../../common/numbering.service.js";
import { PurchaseService } from "./purchase.service.js";

const {
  sourcingRfq,
  sourcingRfqInvitation,
  sourcingSupplierQuote,
  sourcingAward,
  vendor,
  item,
  outboxEvent,
} = schema;

import type {
  CreateRfqInput,
  RecordQuoteInput,
  RfqView,
  RfqSummary,
} from "../../ports/sourcing-types.js";
export type {
  CreateRfqInput,
  RecordQuoteInput,
  RfqView,
  RfqSummary,
} from "../../ports/sourcing-types.js";

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;
const m2 = (n: number): string => round2(n).toFixed(2);

/**
 * SOURCING — how the supplier was chosen, kept next to what was bought.
 *
 * This is the MANUAL version, and deliberately so. Nothing here fetches a quote, ranks a
 * vendor or recommends a winner: a buyer records what suppliers actually sent, marks each
 * response against the released specification, and a second person awards. The intelligence
 * layer is a separate product that reads these records; an ERP whose sourcing only works
 * when a model is available is not a system of record.
 *
 * Three rules worth stating because each one costs money when it is missing:
 *
 *   The TECHNICAL GATE is set before any comparison. A quote that cannot meet the
 *   specification is excluded however cheap it is — ranking on price first is how a factory
 *   ends up with a supplier who was never able to deliver.
 *
 *   LANDED COST is stored, not recomputed. The number the buyer compared has to be the
 *   number the award is later judged against, and a formula that changes in a later release
 *   would silently rewrite every historical decision.
 *
 *   The AWARDER IS NOT THE RAISER. A permission cannot express "somebody else", so the
 *   check lives here.
 */
@Injectable()
export class RfqService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly purchase: PurchaseService,
  ) {}

  async createRfq(
    input: CreateRfqInput,
    idempotencyKey: string,
  ): Promise<RfqView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ ...input, op: "create-rfq" }),
      async () => ({ status: 201, body: await this.doCreateRfq(input) }),
    );
    return result.body;
  }

  private async doCreateRfq(input: CreateRfqInput): Promise<RfqView> {
    return withTenant((tx) => this.createRfqInTx(tx, input));
  }

  async createRfqInTx(tx: Tx, input: CreateRfqInput): Promise<RfqView> {
    await lockCommercialInTx(tx);
    assertOpenDeadline(input.quoteDeadline);
    landedUnitCost(input.qty, 0);
    if (input.vendorIds.length === 0) {
      throw Errors.validation([
        {
          field: "vendorIds",
          message:
            "invite at least one supplier — an RFQ with nobody to answer it is a note",
        },
      ]);
    }
    if (input.quoteDeadline > input.needDate) {
      throw Errors.validation([
        {
          field: "quoteDeadline",
          message: "the quote deadline must fall on or before the need date",
        },
      ]);
    }
    const { tenantId, actorId } = currentTenant();
    const now = new Date();

    const [it] = await tx
      .select({ id: item.id })
      .from(item)
      .where(eq(item.id, input.itemId))
      .limit(1);
    if (!it) throw Errors.notFound(`item '${input.itemId}'`);

    const vendors = await tx
      .select({ id: vendor.id })
      .from(vendor)
      .where(
        and(inArray(vendor.id, input.vendorIds), eq(vendor.isActive, true)),
      );
    const known = new Set(vendors.map((v) => v.id));
    const unknown = input.vendorIds.filter((v) => !known.has(v));
    if (unknown.length > 0) throw Errors.notFound(`vendor '${unknown[0]}'`);

    const id = newId();
    const rfqNo = await this.numbering.next(
      tx,
      "sourcing_rfq",
      fyCode(now.toISOString()),
    );

    await tx.insert(sourcingRfq).values({
      id,
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      rfqNo,
      title: input.title,
      itemId: input.itemId,
      qty: String(input.qty),
      uom: input.uom,
      drawingRev: input.drawingRev ?? null,
      needDate: input.needDate,
      quoteDeadline: input.quoteDeadline,
      deliveryPlant: input.deliveryPlant,
      originRef: input.originRef ?? null,
      notes: input.notes ?? null,
      status: "draft",
      tenderId: input.tenderId ?? null,
      tenderLineNo: input.tenderLineNo ?? null,
    });
    await tx.insert(sourcingRfqInvitation).values(
      [...new Set(input.vendorIds)].map((vendorId) => ({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        rfqId: id,
        vendorId,
        responseStatus: "invited",
      })),
    );
    await this.audit.appendInTx(tx, {
      action: "purchase.rfq.created",
      entityType: "sourcing_rfq",
      entityId: id,
      data: {
        rfqNo,
        itemId: input.itemId,
        qty: String(input.qty),
        invited: input.vendorIds.length,
      },
    });
    return this.viewInTx(tx, id);
  }

  /** draft → issued. After this the RFQ is a thing suppliers were actually asked. */
  async issue(rfqId: string, idempotencyKey: string): Promise<RfqView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ rfqId, op: "issue-rfq" }),
      async () => ({ status: 200, body: await this.doIssue(rfqId) }),
    );
    return result.body;
  }

  private async doIssue(rfqId: string): Promise<RfqView> {
    return withTenant(async (tx) => {
      const rfq = await this.load(tx, rfqId, true);
      if (rfq.tenderId)
        throw new AppError(
          "TENDER_PUBLICATION_REQUIRED",
          409,
          "Publish the parent tender to issue its lines together.",
        );
      return this.issueInTx(tx, rfqId);
    });
  }

  async issueInTx(tx: Tx, rfqId: string): Promise<RfqView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    const rfq = await this.load(tx, rfqId, true);
    assertOpenDeadline(rfq.quoteDeadline);
    if (rfq.status !== "draft") {
      throw new AppError(
        "RFQ_NOT_DRAFT",
        409,
        `${rfq.rfqNo} is ${rfq.status}; only a draft can be issued.`,
      );
    }
    await tx
      .update(sourcingRfq)
      .set({ status: "issued", updatedAt: now, updatedBy: actorId })
      .where(eq(sourcingRfq.id, rfqId));
    await this.audit.appendInTx(tx, {
      action: "purchase.rfq.issued",
      entityType: "sourcing_rfq",
      entityId: rfqId,
      data: { rfqNo: rfq.rfqNo },
    });
    await tx.insert(outboxEvent).values({
      id: newId(),
      tenantId,
      name: eventName("purchase", "rfq", "issued"),
      payload: { id: rfqId, rfqNo: rfq.rfqNo },
      createdAt: now,
    });
    return this.viewInTx(tx, rfqId);
  }

  /**
   * Record what a supplier sent. A second quote from the same supplier SUPERSEDES the first
   * rather than replacing it, so a price that moved after a conversation is visible as
   * having moved.
   */
  async recordQuote(
    rfqId: string,
    input: RecordQuoteInput,
    idempotencyKey: string,
  ): Promise<RfqView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ rfqId, ...input, op: "record-quote" }),
      async () => ({
        status: 201,
        body: await this.doRecordQuote(rfqId, input),
      }),
    );
    return result.body;
  }

  private async doRecordQuote(
    rfqId: string,
    input: RecordQuoteInput,
  ): Promise<RfqView> {
    return withTenant((tx) => this.recordQuoteInTx(tx, rfqId, input));
  }

  async recordQuoteInTx(
    tx: Tx,
    rfqId: string,
    input: RecordQuoteInput,
    receivedOn?: string,
  ): Promise<RfqView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    const rfq = await this.load(tx, rfqId, true);
    if (rfq.status !== "issued" && rfq.status !== "evaluation") {
      throw new AppError(
        "RFQ_NOT_OPEN",
        409,
        `${rfq.rfqNo} is ${rfq.status}; quotes can only be recorded against an issued RFQ.`,
      );
    }
    assertOpenDeadline(rfq.quoteDeadline, receivedOn);
    if (rfq.tenderId && !receivedOn) {
      const [tender] = await tx
        .select()
        .from(schema.sourcingTender)
        .where(eq(schema.sourcingTender.id, rfq.tenderId));
      if (tender?.status !== "published")
        throw new AppError(
          "TENDER_BIDDING_CLOSED",
          409,
          "Tender bidding is closed.",
        );
    }
    if (
      input.validUntil &&
      input.validUntil < (receivedOn ?? new Date().toISOString().slice(0, 10))
    )
      throw new AppError(
        "QUOTE_EXPIRED",
        409,
        "The submitted price is already expired.",
      );
    const [invited] = await tx
      .select({ id: sourcingRfqInvitation.id })
      .from(sourcingRfqInvitation)
      .where(
        and(
          eq(sourcingRfqInvitation.rfqId, rfqId),
          eq(sourcingRfqInvitation.vendorId, input.vendorId),
        ),
      )
      .limit(1);
    if (!invited) {
      throw new AppError(
        "VENDOR_NOT_INVITED",
        409,
        "That supplier was not invited to this RFQ. Invite them before recording a quote.",
      );
    }

    const prior = await tx
      .select()
      .from(sourcingSupplierQuote)
      .where(
        and(
          eq(sourcingSupplierQuote.rfqId, rfqId),
          eq(sourcingSupplierQuote.vendorId, input.vendorId),
        ),
      );
    const nextRevision =
      prior.reduce((max, q) => Math.max(max, q.revisionNo), 0) + 1;
    const live = prior.find((q) => q.status === "submitted");
    if (live) {
      await tx
        .update(sourcingSupplierQuote)
        .set({ status: "superseded", updatedAt: now, updatedBy: actorId })
        .where(eq(sourcingSupplierQuote.id, live.id));
    }

    // Landed cost is what the company actually pays to have the material on the floor:
    // the price, the one-off tooling, the freight and any tax it cannot reclaim. Creditable
    // GST is deliberately absent — it comes back, so counting it would favour whichever
    // supplier happened to charge less of something that costs nothing.
    const landed = landedUnitCost(
      Number(rfq.qty),
      input.unitPrice,
      input.toolingCost,
      input.freightCost,
      input.nonCreditableTax,
    );

    const quoteId = newId();
    await tx.insert(sourcingSupplierQuote).values({
      id: quoteId,
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      rfqId,
      vendorId: input.vendorId,
      revisionNo: nextRevision,
      unitPrice: m2(input.unitPrice),
      toolingCost: m2(input.toolingCost ?? 0),
      freightCost: m2(input.freightCost ?? 0),
      nonCreditableTax: m2(input.nonCreditableTax ?? 0),
      landedCost: landed,
      moq: input.moq === undefined ? null : String(input.moq),
      leadTimeDays: input.leadTimeDays ?? null,
      promisedDate: input.promisedDate ?? null,
      validUntil: input.validUntil ?? null,
      technicalGate: "pending",
      status: "submitted",
    });
    await tx
      .update(sourcingRfqInvitation)
      .set({ responseStatus: "quoted", updatedAt: now, updatedBy: actorId })
      .where(eq(sourcingRfqInvitation.id, invited.id));
    if (rfq.status === "issued") {
      await tx
        .update(sourcingRfq)
        .set({ status: "evaluation", updatedAt: now, updatedBy: actorId })
        .where(eq(sourcingRfq.id, rfqId));
    }
    await this.audit.appendInTx(tx, {
      action: "purchase.rfq.quoted",
      entityType: "sourcing_rfq",
      entityId: rfqId,
      data: {
        rfqNo: rfq.rfqNo,
        vendorId: input.vendorId,
        revisionNo: nextRevision,
        landedCost: landed,
      },
    });
    return this.viewInTx(tx, rfqId);
  }

  /**
   * The technical gate — a person's judgement against the released specification, recorded
   * BEFORE anything is compared on price.
   */
  async setGate(
    rfqId: string,
    quoteId: string,
    gate: "pass" | "conditional" | "fail",
    note: string | undefined,
    idempotencyKey: string,
  ): Promise<RfqView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ rfqId, quoteId, gate, note, op: "gate-quote" }),
      async () => ({
        status: 200,
        body: await this.doSetGate(rfqId, quoteId, gate, note),
      }),
    );
    return result.body;
  }

  private async doSetGate(
    rfqId: string,
    quoteId: string,
    gate: "pass" | "conditional" | "fail",
    note?: string,
  ): Promise<RfqView> {
    const { actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const rfq = await this.load(tx, rfqId, true);
      const [q] = await tx
        .select()
        .from(sourcingSupplierQuote)
        .where(
          and(
            eq(sourcingSupplierQuote.id, quoteId),
            eq(sourcingSupplierQuote.rfqId, rfqId),
          ),
        )
        .limit(1);
      if (!q) throw Errors.notFound(`quote '${quoteId}' on ${rfq.rfqNo}`);
      if (
        !["issued", "evaluation"].includes(rfq.status) ||
        q.status !== "submitted"
      )
        throw new AppError(
          "RFQ_NOT_EVALUATING",
          409,
          "Only live quotes on an open evaluation can be reviewed.",
        );
      if (gate === "conditional" && !note?.trim()) {
        throw Errors.validation([
          {
            field: "note",
            message: "a conditional pass needs the deviation written down",
          },
        ]);
      }
      await tx
        .update(sourcingSupplierQuote)
        .set({
          technicalGate: gate,
          gateNote: note ?? null,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(eq(sourcingSupplierQuote.id, quoteId));
      await this.audit.appendInTx(tx, {
        action: "purchase.rfq.gated",
        entityType: "sourcing_rfq",
        entityId: rfqId,
        data: { rfqNo: rfq.rfqNo, quoteId, gate, ...(note ? { note } : {}) },
      });
      return this.viewInTx(tx, rfqId);
    });
  }

  /**
   * Award, then raise the purchase order through PURCHASE's own service.
   *
   * Refuses three things, each of which is a real way this goes wrong: awarding a quote that
   * failed the specification, awarding without saying why, and awarding your own RFQ.
   */
  async award(
    rfqId: string,
    input: { quoteId: string; awardReason: string; expectedDate?: string },
    idempotencyKey: string,
  ): Promise<RfqView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ rfqId, ...input, op: "award-rfq" }),
      async () => ({
        status: 201,
        body: await withTenant((tx) => this.awardInTx(tx, rfqId, input)),
      }),
    );
    return result.body;
  }

  async awardInTx(
    tx: Tx,
    rfqId: string,
    input: { quoteId: string; awardReason: string; expectedDate?: string },
    parentTenderId?: string,
  ): Promise<RfqView> {
    const { tenantId, actorId } = currentTenant();

    const prepared = await (async () => {
      const rfq = await this.load(tx, rfqId, true);
      if (rfq.status === "awarded") {
        throw new AppError(
          "RFQ_ALREADY_AWARDED",
          409,
          `${rfq.rfqNo} has already been awarded.`,
        );
      }
      if (rfq.status !== "evaluation" && rfq.status !== "issued") {
        throw new AppError(
          "RFQ_NOT_AWARDABLE",
          409,
          `${rfq.rfqNo} is ${rfq.status}.`,
        );
      }
      // Separation of duties. W1 cannot express "somebody other than the raiser", and a
      // buyer who can both invite and award is a buyer nobody can check.
      if (rfq.createdBy === actorId) {
        throw new AppError(
          "SEGREGATION_OF_DUTIES",
          403,
          `${rfq.rfqNo} was raised by this user; the award requires a different person.`,
        );
      }
      const [q] = await tx
        .select()
        .from(sourcingSupplierQuote)
        .where(
          and(
            eq(sourcingSupplierQuote.id, input.quoteId),
            eq(sourcingSupplierQuote.rfqId, rfqId),
          ),
        )
        .limit(1);
      if (!q) throw Errors.notFound(`quote '${input.quoteId}' on ${rfq.rfqNo}`);
      if (q.status !== "submitted") {
        throw new AppError(
          "QUOTE_SUPERSEDED",
          409,
          "That quote revision has been superseded or withdrawn.",
        );
      }
      if (q.technicalGate === "fail") {
        throw new AppError(
          "QUOTE_FAILED_TECHNICAL_GATE",
          409,
          "That quote failed the technical gate and cannot be awarded, whatever it costs.",
        );
      }
      if (q.technicalGate === "pending") {
        throw new AppError(
          "QUOTE_NOT_GATED",
          409,
          "Mark this quote against the specification before awarding it.",
        );
      }
      const blockers = awardBlockers(rfq, q, input.expectedDate);
      if (blockers.length)
        throw new AppError("QUOTE_NOT_AWARDABLE", 409, blockers.join(" "));
      if (!input.awardReason.trim())
        throw Errors.validation([
          { field: "awardReason", message: "Record the award reason." },
        ]);
      if (rfq.tenderId) {
        if (parentTenderId !== rfq.tenderId)
          throw new AppError(
            "TENDER_AWARD_REQUIRED",
            409,
            "Award this line through its parent tender so all lines commit together.",
          );
        const [tender] = await tx
          .select()
          .from(schema.sourcingTender)
          .where(eq(schema.sourcingTender.id, rfq.tenderId))
          .limit(1);
        if (tender?.status !== "evaluation")
          throw new AppError(
            "TENDER_NOT_EVALUATING",
            409,
            "Close the tender before awarding its lines.",
          );
      }
      return { rfq, quote: q };
    })();

    const po = await this.purchase.createPoInTx(tx, {
      vendorId: prepared.quote.vendorId,
      additionalCharges:
        Number(prepared.quote.toolingCost) +
        Number(prepared.quote.freightCost) +
        Number(prepared.quote.nonCreditableTax),
      ...((input.expectedDate ?? prepared.quote.promisedDate)
        ? { expectedDate: input.expectedDate ?? prepared.quote.promisedDate! }
        : {}),
      remarks: `Awarded from ${prepared.rfq.rfqNo}. ${input.awardReason} One-off charges: tooling ${prepared.quote.toolingCost}; freight ${prepared.quote.freightCost}; non-creditable tax ${prepared.quote.nonCreditableTax}.`,
      lines: [
        {
          itemId: prepared.rfq.itemId,
          qty: Number(prepared.rfq.qty),
          rate: Number(prepared.quote.unitPrice),
        },
      ],
    });

    const now = new Date();
    await tx.insert(sourcingAward).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      rfqId,
      quoteId: input.quoteId,
      vendorId: prepared.quote.vendorId,
      awardReason: input.awardReason,
      landedCost: prepared.quote.landedCost,
      convertedPoId: po.id,
      convertedPoNo: po.poNo,
      status: "converted",
    });
    await tx
      .update(sourcingRfq)
      .set({ status: "awarded", updatedAt: now, updatedBy: actorId })
      .where(eq(sourcingRfq.id, rfqId));
    await this.audit.appendInTx(tx, {
      action: "purchase.rfq.awarded",
      entityType: "sourcing_rfq",
      entityId: rfqId,
      data: {
        rfqNo: prepared.rfq.rfqNo,
        vendorId: prepared.quote.vendorId,
        landedCost: prepared.quote.landedCost,
        poNo: po.poNo,
        reason: input.awardReason,
      },
    });
    await tx.insert(outboxEvent).values({
      id: newId(),
      tenantId,
      name: eventName("purchase", "rfq", "awarded"),
      payload: {
        id: rfqId,
        rfqNo: prepared.rfq.rfqNo,
        poId: po.id,
        poNo: po.poNo,
      },
      createdAt: now,
    });
    return this.viewInTx(tx, rfqId);
  }

  async list(limit: number, cursor?: string): Promise<CursorPage<RfqSummary>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select()
        .from(sourcingRfq)
        .where(
          keyset
            ? or(
                gt(sourcingRfq.createdAt, new Date(keyset.createdAt)),
                and(
                  eq(sourcingRfq.createdAt, new Date(keyset.createdAt)),
                  gt(sourcingRfq.id, keyset.id),
                ),
              )
            : undefined,
        )
        .orderBy(asc(sourcingRfq.createdAt), asc(sourcingRfq.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const ids = page.map((r) => r.id);

      // Three queries regardless of page size — a per-row count is how a list screen becomes
      // two hundred round trips.
      const invites = ids.length
        ? await tx
            .select()
            .from(sourcingRfqInvitation)
            .where(inArray(sourcingRfqInvitation.rfqId, ids))
        : [];
      const awards = ids.length
        ? await tx
            .select()
            .from(sourcingAward)
            .where(inArray(sourcingAward.rfqId, ids))
        : [];
      const vendorIds = [...new Set(awards.map((a) => a.vendorId))];
      const vendors = vendorIds.length
        ? await tx
            .select({ id: vendor.id, name: vendor.name })
            .from(vendor)
            .where(inArray(vendor.id, vendorIds))
        : [];
      const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

      const last = page[page.length - 1];
      return {
        items: page.map((r) => {
          const mine = invites.filter((i) => i.rfqId === r.id);
          const award = awards.find((a) => a.rfqId === r.id);
          return {
            id: r.id,
            rfqNo: r.rfqNo,
            title: r.title,
            qty: r.qty,
            uom: r.uom,
            needDate: r.needDate,
            quoteDeadline: r.quoteDeadline,
            status: r.status,
            invitedCount: mine.length,
            quotedCount: mine.filter((i) => i.responseStatus === "quoted")
              .length,
            awardedVendorName: award
              ? (vendorName.get(award.vendorId) ?? null)
              : null,
          };
        }),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor(last.createdAt.toISOString(), last.id)
            : null,
      };
    });
  }

  async view(rfqId: string): Promise<RfqView> {
    return withTenant((tx) => this.viewInTx(tx, rfqId));
  }

  // ---- internals ----------------------------------------------------------

  private async load(
    tx: Tx,
    rfqId: string,
    lock = false,
  ): Promise<typeof sourcingRfq.$inferSelect> {
    if (lock) await lockCommercialInTx(tx);
    const query = tx
      .select()
      .from(sourcingRfq)
      .where(eq(sourcingRfq.id, rfqId))
      .limit(1);
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw Errors.notFound(`RFQ '${rfqId}'`);
    return row;
  }

  async viewInTx(tx: Tx, rfqId: string): Promise<RfqView> {
    const head = await this.load(tx, rfqId);
    const [it] = await tx
      .select({ code: item.itemCode, name: item.name })
      .from(item)
      .where(eq(item.id, head.itemId))
      .limit(1);

    const invitations = await tx
      .select()
      .from(sourcingRfqInvitation)
      .where(eq(sourcingRfqInvitation.rfqId, rfqId));
    const quotes = await tx
      .select()
      .from(sourcingSupplierQuote)
      .where(eq(sourcingSupplierQuote.rfqId, rfqId))
      .orderBy(asc(sourcingSupplierQuote.createdAt));
    const [award] = await tx
      .select()
      .from(sourcingAward)
      .where(eq(sourcingAward.rfqId, rfqId))
      .limit(1);

    const vendorIds = [
      ...new Set([
        ...invitations.map((i) => i.vendorId),
        ...quotes.map((q) => q.vendorId),
      ]),
    ];
    const vendors = vendorIds.length
      ? await tx
          .select({ id: vendor.id, name: vendor.name })
          .from(vendor)
          .where(inArray(vendor.id, vendorIds))
      : [];
    const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

    return {
      id: head.id,
      rfqNo: head.rfqNo,
      title: head.title,
      itemId: head.itemId,
      itemCode: it?.code ?? null,
      itemName: it?.name ?? null,
      qty: head.qty,
      uom: head.uom,
      drawingRev: head.drawingRev,
      needDate: head.needDate,
      quoteDeadline: head.quoteDeadline,
      deliveryPlant: head.deliveryPlant,
      originRef: head.originRef,
      notes: head.notes,
      status: head.status,
      createdBy: head.createdBy,
      invitations: invitations.map((i) => ({
        vendorId: i.vendorId,
        vendorName: vendorName.get(i.vendorId) ?? null,
        responseStatus: i.responseStatus,
      })),
      quotes: quotes.map((q) => ({
        id: q.id,
        vendorId: q.vendorId,
        vendorName: vendorName.get(q.vendorId) ?? null,
        revisionNo: q.revisionNo,
        unitPrice: q.unitPrice,
        toolingCost: q.toolingCost,
        freightCost: q.freightCost,
        nonCreditableTax: q.nonCreditableTax,
        landedCost: q.landedCost,
        moq: q.moq,
        leadTimeDays: q.leadTimeDays,
        promisedDate: q.promisedDate,
        validUntil: q.validUntil,
        technicalGate: q.technicalGate,
        gateNote: q.gateNote,
        status: q.status,
        meetsNeedDate: q.promisedDate ? q.promisedDate <= head.needDate : null,
      })),
      award: award
        ? {
            id: award.id,
            quoteId: award.quoteId,
            vendorId: award.vendorId,
            vendorName: vendorName.get(award.vendorId) ?? null,
            awardReason: award.awardReason,
            landedCost: award.landedCost,
            convertedPoId: award.convertedPoId,
            convertedPoNo: award.convertedPoNo,
            status: award.status,
          }
        : null,
    };
  }
}
