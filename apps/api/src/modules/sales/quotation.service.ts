import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
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
import { SalesService } from "./sales.service.js";

// `customer` and `item` are read to put names on a quotation a person can read. `item` is
// ENGINEERING's master — a read-only join across a logical reference (§1.1).
const { salesQuotation, salesQuotationLine, customer, item, outboxEvent } = schema;

export interface QuotationLineInput {
  itemId: string;
  qty: number;
  rate: number;
  hsn: string;
  gstRatePct: number;
  uom?: string;
  description?: string;
  requestedDeliveryDate?: string;
}

export interface CreateQuotationInput {
  customerId: string;
  enquiryRef?: string;
  quoteDate?: string;
  /** How long the price holds. A quotation without an expiry is a promise without an end. */
  validUntil: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
  lines: QuotationLineInput[];
}

export interface QuotationLineView {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  description: string | null;
  qty: string;
  uom: string;
  rate: string;
  hsn: string;
  gstRatePct: string;
  lineTotal: string;
  requestedDeliveryDate: string | null;
}

export interface QuotationView {
  id: string;
  quoteNo: string;
  revisionNo: number;
  supersedesId: string | null;
  customerId: string;
  customerName: string | null;
  enquiryRef: string | null;
  quoteDate: string;
  validUntil: string;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  status: string;
  lostReason: string | null;
  convertedOrderId: string | null;
  convertedSoNo: string | null;
  /** True once `valid_until` is in the past — computed, never stored, so it cannot go stale. */
  expired: boolean;
  lines: QuotationLineView[];
}

export interface QuotationSummary {
  id: string;
  quoteNo: string;
  revisionNo: number;
  customerId: string;
  customerName: string | null;
  quoteDate: string;
  validUntil: string;
  grandTotal: string;
  status: string;
  convertedSoNo: string | null;
  expired: boolean;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const m2 = (n: number): string => round2(n).toFixed(2);
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * SALES QUOTATION — the document that used to live in an email.
 *
 * The point of holding it here is not tidiness. Until now the price a customer accepted and
 * the price the company invoiced were connected only by whoever retyped one into the other,
 * so a disagreement about either had no document to settle it. A quotation that converts
 * into its order carries that link in the database.
 *
 * Two rules the rest of this file exists to keep:
 *
 *   A priced revision is IMMUTABLE. Re-pricing supersedes and renumbers; it never rewrites
 *   the revision the customer was shown. Overwriting would make the accepted price
 *   unknowable exactly when somebody needs to know it.
 *
 *   Conversion happens ONCE. The unique constraint on `converted_order_id` is the real
 *   guarantee — a service check alone loses to two API instances and one impatient click.
 */
@Injectable()
export class QuotationService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly sales: SalesService,
  ) {}

  async create(input: CreateQuotationInput, idempotencyKey: string): Promise<QuotationView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ ...input, op: "create-quotation" }),
      async () => ({ status: 201, body: await this.doCreate(input) }),
    );
    return result.body;
  }

  private async doCreate(input: CreateQuotationInput): Promise<QuotationView> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "a quotation needs at least one line" }]);
    }
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    const quoteDate = input.quoteDate ?? today();
    if (input.validUntil < quoteDate) {
      throw Errors.validation([
        { field: "validUntil", message: "a quotation cannot expire before the day it was raised" },
      ]);
    }

    return withTenant(async (tx) => {
      const [cust] = await tx
        .select({ id: customer.id })
        .from(customer)
        .where(eq(customer.id, input.customerId))
        .limit(1);
      if (!cust) throw Errors.notFound(`customer '${input.customerId}'`);

      const id = newId();
      const quoteNo = await this.numbering.next(tx, "sales_quotation", fyCode(quoteDate));
      const { lines, subtotal, taxTotal } = this.priceLines(input.lines, id, tenantId, actorId);

      await tx.insert(salesQuotation).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        quoteNo,
        revisionNo: 1,
        customerId: input.customerId,
        enquiryRef: input.enquiryRef ?? null,
        quoteDate,
        validUntil: input.validUntil,
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        notes: input.notes ?? null,
        subtotal: m2(subtotal),
        taxTotal: m2(taxTotal),
        grandTotal: m2(subtotal + taxTotal),
        status: "draft",
      });
      await tx.insert(salesQuotationLine).values(lines);

      await this.audit.appendInTx(tx, {
        action: "sales.quotation.created",
        entityType: "sales_quotation",
        entityId: id,
        data: { quoteNo, customerId: input.customerId, grandTotal: m2(subtotal + taxTotal) },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("sales", "quotation", "created"),
        payload: { id, quoteNo },
        createdAt: now,
      });
      return this.viewInTx(tx, id);
    });
  }

  /**
   * Re-price. The existing revision is marked `superseded` and a NEW row is written with the
   * same `quote_no` and the next revision number, so "what did we actually quote them in
   * March" survives every later negotiation.
   */
  async revise(
    quotationId: string,
    input: CreateQuotationInput,
    idempotencyKey: string,
  ): Promise<QuotationView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ quotationId, ...input, op: "revise-quotation" }),
      async () => ({ status: 201, body: await this.doRevise(quotationId, input) }),
    );
    return result.body;
  }

  private async doRevise(quotationId: string, input: CreateQuotationInput): Promise<QuotationView> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "a quotation needs at least one line" }]);
    }
    const { tenantId, actorId } = currentTenant();
    const now = new Date();

    return withTenant(async (tx) => {
      const prior = await this.load(tx, quotationId);
      if (prior.status === "converted") {
        throw new AppError(
          "QUOTATION_ALREADY_CONVERTED",
          409,
          `${prior.quoteNo} has become order ${prior.convertedSoNo ?? ""} and can no longer be revised.`,
        );
      }
      const id = newId();
      const quoteDate = input.quoteDate ?? today();
      const { lines, subtotal, taxTotal } = this.priceLines(input.lines, id, tenantId, actorId);

      await tx.insert(salesQuotation).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        quoteNo: prior.quoteNo,
        revisionNo: prior.revisionNo + 1,
        supersedesId: prior.id,
        customerId: prior.customerId,
        enquiryRef: input.enquiryRef ?? prior.enquiryRef,
        quoteDate,
        validUntil: input.validUntil,
        paymentTerms: input.paymentTerms ?? prior.paymentTerms,
        deliveryTerms: input.deliveryTerms ?? prior.deliveryTerms,
        notes: input.notes ?? null,
        subtotal: m2(subtotal),
        taxTotal: m2(taxTotal),
        grandTotal: m2(subtotal + taxTotal),
        status: "draft",
      });
      await tx.insert(salesQuotationLine).values(lines);
      await tx
        .update(salesQuotation)
        .set({ status: "superseded", updatedAt: now, updatedBy: actorId })
        .where(eq(salesQuotation.id, prior.id));

      await this.audit.appendInTx(tx, {
        action: "sales.quotation.revised",
        entityType: "sales_quotation",
        entityId: id,
        data: { quoteNo: prior.quoteNo, revisionNo: prior.revisionNo + 1, supersedes: prior.id },
      });
      return this.viewInTx(tx, id);
    });
  }

  /** draft → sent. The point at which the price stops being ours and becomes theirs. */
  async send(quotationId: string, idempotencyKey: string): Promise<QuotationView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ quotationId, op: "send-quotation" }),
      async () => ({ status: 200, body: await this.transition(quotationId, ["draft"], "sent", "sent") }),
    );
    return result.body;
  }

  /** sent → accepted | rejected, recorded as the customer's answer rather than ours. */
  async decide(
    quotationId: string,
    decision: "accepted" | "rejected",
    idempotencyKey: string,
    lostReason?: string,
  ): Promise<QuotationView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ quotationId, decision, lostReason, op: "decide-quotation" }),
      async () => ({
        status: 200,
        body: await this.transition(quotationId, ["sent"], decision, decision, lostReason),
      }),
    );
    return result.body;
  }

  private async transition(
    quotationId: string,
    from: readonly string[],
    to: string,
    auditVerb: string,
    lostReason?: string,
  ): Promise<QuotationView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const q = await this.load(tx, quotationId);
      if (!from.includes(q.status)) {
        throw new AppError(
          "QUOTATION_NOT_IN_STATE",
          409,
          `${q.quoteNo} is ${q.status}; this action needs it to be ${from.join(" or ")}.`,
        );
      }
      // An expired price must not be silently accepted months later. Revise it instead.
      if (to === "accepted" && q.validUntil < today()) {
        throw new AppError(
          "QUOTATION_EXPIRED",
          409,
          `${q.quoteNo} expired on ${q.validUntil}. Raise a revision before accepting it.`,
        );
      }
      await tx
        .update(salesQuotation)
        .set({
          status: to,
          lostReason: lostReason ?? null,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(eq(salesQuotation.id, quotationId));
      await this.audit.appendInTx(tx, {
        action: `sales.quotation.${auditVerb}`,
        entityType: "sales_quotation",
        entityId: quotationId,
        data: { quoteNo: q.quoteNo, ...(lostReason ? { lostReason } : {}) },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("sales", "quotation", auditVerb),
        payload: { id: quotationId, quoteNo: q.quoteNo, status: to },
        createdAt: now,
      });
      return this.viewInTx(tx, quotationId);
    });
  }

  /**
   * accepted → converted. Raises the sales order through SALES' own service, so the order
   * gets its GST treatment, credit check, numbering and audit exactly as a typed one would.
   * Nothing about the order is special because it came from a quotation, which is the whole
   * point: this removes the retyping, not the rules.
   */
  async convert(
    quotationId: string,
    input: { custPoNo: string; supplierGstin: string; fgWarehouseId?: string },
    idempotencyKey: string,
  ): Promise<QuotationView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ quotationId, ...input, op: "convert-quotation" }),
      async () => ({ status: 201, body: await this.doConvert(quotationId, input, idempotencyKey) }),
    );
    return result.body;
  }

  private async doConvert(
    quotationId: string,
    input: { custPoNo: string; supplierGstin: string; fgWarehouseId?: string },
    idempotencyKey: string,
  ): Promise<QuotationView> {
    const { actorId } = currentTenant();
    const quote = await withTenant((tx) => this.viewInTx(tx, quotationId));
    if (quote.status !== "accepted") {
      throw new AppError(
        "QUOTATION_NOT_ACCEPTED",
        409,
        `${quote.quoteNo} is ${quote.status}; only an accepted quotation becomes an order.`,
      );
    }
    if (quote.convertedOrderId) {
      throw new AppError(
        "QUOTATION_ALREADY_CONVERTED",
        409,
        `${quote.quoteNo} already became ${quote.convertedSoNo}.`,
      );
    }

    const order = await this.sales.createOrder(
      {
        customerId: quote.customerId,
        custPoNo: input.custPoNo,
        supplierGstin: input.supplierGstin,
        ...(input.fgWarehouseId ? { fgWarehouseId: input.fgWarehouseId } : {}),
        lines: quote.lines.map((l) => ({
          itemId: l.itemId,
          qty: Number(l.qty),
          rate: Number(l.rate),
          hsn: l.hsn,
          gstRatePct: Number(l.gstRatePct),
          uom: l.uom,
          ...(l.requestedDeliveryDate ? { requestedDeliveryDate: l.requestedDeliveryDate } : {}),
        })),
      },
      // A distinct key: the order's creation is its own idempotent operation, and reusing
      // this call's key would make the two collide in the idempotency store.
      `${idempotencyKey}:order`,
    );

    return withTenant(async (tx) => {
      const now = new Date();
      await tx
        .update(salesQuotation)
        .set({
          status: "converted",
          convertedOrderId: order.id,
          convertedSoNo: order.soNo,
          updatedAt: now,
          updatedBy: actorId,
        })
        .where(eq(salesQuotation.id, quotationId));
      await this.audit.appendInTx(tx, {
        action: "sales.quotation.converted",
        entityType: "sales_quotation",
        entityId: quotationId,
        data: { quoteNo: quote.quoteNo, soNo: order.soNo, orderId: order.id },
      });
      return this.viewInTx(tx, quotationId);
    });
  }

  async list(limit: number, cursor?: string): Promise<CursorPage<QuotationSummary>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({
          id: salesQuotation.id,
          quoteNo: salesQuotation.quoteNo,
          revisionNo: salesQuotation.revisionNo,
          customerId: salesQuotation.customerId,
          customerName: customer.name,
          quoteDate: salesQuotation.quoteDate,
          validUntil: salesQuotation.validUntil,
          grandTotal: salesQuotation.grandTotal,
          status: salesQuotation.status,
          convertedSoNo: salesQuotation.convertedSoNo,
          createdAt: salesQuotation.createdAt,
        })
        .from(salesQuotation)
        .leftJoin(customer, eq(customer.id, salesQuotation.customerId))
        .where(
          keyset
            ? or(
                gt(salesQuotation.createdAt, new Date(keyset.createdAt)),
                and(
                  eq(salesQuotation.createdAt, new Date(keyset.createdAt)),
                  gt(salesQuotation.id, keyset.id),
                ),
              )
            : undefined,
        )
        .orderBy(asc(salesQuotation.createdAt), asc(salesQuotation.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      const now = today();
      return {
        items: page.map((r) => ({
          id: r.id,
          quoteNo: r.quoteNo,
          revisionNo: r.revisionNo,
          customerId: r.customerId,
          customerName: r.customerName,
          quoteDate: r.quoteDate,
          validUntil: r.validUntil,
          grandTotal: r.grandTotal,
          status: r.status,
          convertedSoNo: r.convertedSoNo,
          expired: r.validUntil < now && r.status !== "converted",
        })),
        nextCursor:
          rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
      };
    });
  }

  async view(quotationId: string): Promise<QuotationView> {
    return withTenant((tx) => this.viewInTx(tx, quotationId));
  }

  // ---- internals ----------------------------------------------------------

  private priceLines(
    input: readonly QuotationLineInput[],
    quotationId: string,
    tenantId: string,
    actorId: string,
  ): { lines: (typeof salesQuotationLine.$inferInsert)[]; subtotal: number; taxTotal: number } {
    let subtotal = 0;
    let taxTotal = 0;
    const lines = input.map((l, i) => {
      if (l.qty <= 0) {
        throw Errors.validation([{ field: `lines.${i}.qty`, message: "quantity must be positive" }]);
      }
      if (l.rate < 0) {
        throw Errors.validation([{ field: `lines.${i}.rate`, message: "rate cannot be negative" }]);
      }
      const lineTotal = round2(l.qty * l.rate);
      subtotal += lineTotal;
      taxTotal += round2((lineTotal * l.gstRatePct) / 100);
      return {
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        quotationId,
        lineNo: i + 1,
        itemId: l.itemId,
        description: l.description ?? null,
        qty: String(l.qty),
        uom: l.uom ?? "nos",
        rate: m2(l.rate),
        hsn: l.hsn,
        gstRatePct: String(l.gstRatePct),
        lineTotal: m2(lineTotal),
        requestedDeliveryDate: l.requestedDeliveryDate ?? null,
      };
    });
    return { lines, subtotal: round2(subtotal), taxTotal: round2(taxTotal) };
  }

  private async load(tx: Tx, quotationId: string): Promise<typeof salesQuotation.$inferSelect> {
    const [row] = await tx
      .select()
      .from(salesQuotation)
      .where(eq(salesQuotation.id, quotationId))
      .limit(1);
    if (!row) throw Errors.notFound(`quotation '${quotationId}'`);
    return row;
  }

  private async viewInTx(tx: Tx, quotationId: string): Promise<QuotationView> {
    const head = await this.load(tx, quotationId);
    const [cust] = await tx
      .select({ name: customer.name })
      .from(customer)
      .where(eq(customer.id, head.customerId))
      .limit(1);

    const lineRows = await tx
      .select()
      .from(salesQuotationLine)
      .where(eq(salesQuotationLine.quotationId, quotationId))
      .orderBy(asc(salesQuotationLine.lineNo));

    // One query for every item on the quotation, not one per line.
    const itemIds = [...new Set(lineRows.map((l) => l.itemId))];
    const items = itemIds.length
      ? await tx
          .select({ id: item.id, code: item.itemCode, name: item.name })
          .from(item)
          .where(inArray(item.id, itemIds))
      : [];
    const byItem = new Map(items.map((i) => [i.id, i]));

    return {
      id: head.id,
      quoteNo: head.quoteNo,
      revisionNo: head.revisionNo,
      supersedesId: head.supersedesId,
      customerId: head.customerId,
      customerName: cust?.name ?? null,
      enquiryRef: head.enquiryRef,
      quoteDate: head.quoteDate,
      validUntil: head.validUntil,
      paymentTerms: head.paymentTerms,
      deliveryTerms: head.deliveryTerms,
      notes: head.notes,
      subtotal: head.subtotal,
      taxTotal: head.taxTotal,
      grandTotal: head.grandTotal,
      status: head.status,
      lostReason: head.lostReason,
      convertedOrderId: head.convertedOrderId,
      convertedSoNo: head.convertedSoNo,
      expired: head.validUntil < today() && head.status !== "converted",
      lines: lineRows.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        itemId: l.itemId,
        itemCode: byItem.get(l.itemId)?.code ?? null,
        itemName: byItem.get(l.itemId)?.name ?? null,
        description: l.description,
        qty: l.qty,
        uom: l.uom,
        rate: l.rate,
        hsn: l.hsn,
        gstRatePct: l.gstRatePct,
        lineTotal: l.lineTotal,
        requestedDeliveryDate: l.requestedDeliveryDate,
      })),
    };
  }
}
