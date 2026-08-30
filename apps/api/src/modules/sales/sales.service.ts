import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  encodeCursor,
  decodeCursor,
  detectDuplicates,
  computeOrderTax,
  checkShipToGstin,
  stateCodeOfGstin,
  validateGstin,
  DEFAULT_GST_CONFIG,
  AppError,
  Errors,
  type CursorPage,
  type DuplicateMatch,
  type GstConfig,
  type MasterRecord,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DocumentEditService } from "../../common/document-edit.service.js";
import { NumberingService, fyCode } from "../../common/numbering.service.js";
import { DedupExplainer } from "../../ai/dedup-explainer.js";
import { STOCK_POSTER, type StockPoster } from "../../ports/stock.port.js";
import { ACCOUNTS_POSTER, type AccountsPoster } from "../../ports/accounts.port.js";
import { ITEM_PROVIDER, type ItemProvider } from "../../ports/item.port.js";

import type { DemandSource, OpenDemandLine } from "../../ports/planning-inputs.port.js";
import type {
  CreateFulfilmentCustomerOrderInput,
  CreatedCustomerOrder,
  CustomerOrderWriter,
} from "../../ports/fulfilment-docs.port.js";

const { customer, salesOrder, salesOrderLine, dispatch, dispatchLine, outboxEvent } = schema;
const { gstRegistration, warehouse, item: itemTable } = schema;

/**
 * A correction to a sales order. Every field is optional: absent means "leave it alone",
 * which is what makes this safe to call from a form that only knows about two fields.
 *
 * `lines` is all-or-nothing. A partial line list would be ambiguous in the one way that
 * matters — is the missing line being deleted, or simply not mentioned? — so supplying it
 * replaces the whole set and omitting it leaves every line untouched.
 */
export interface EditOrderInput {
  custPoNo?: string;
  orderDate?: string;
  shipToStateCode?: string;
  shipToGstin?: string;
  shipToAddress?: string;
  fgWarehouseId?: string | null;
  lines?: CreateOrderInput["lines"];
  /** Required once the order is confirmed. Recorded on the row and in the audit trail. */
  reason?: string;
}

export interface CreateCustomerInput {
  code: string;
  name: string;
  gstin?: string;
  isRegistered?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  billingAddress?: string;
  creditLimit?: number;
  creditDays?: number;
  acknowledgeDuplicates?: boolean;
}
export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  creditLimit: string;
}
export type CreateCustomerResult =
  | { outcome: "created"; customer: CustomerRow }
  | {
      outcome: "duplicate_suspected";
      candidate: MasterRecord;
      matches: DuplicateMatch[];
      explanation: string;
      degraded: boolean;
    };

export interface CreateOrderLineInput {
  itemId: string;
  qty: number;
  rate: number;
  hsn: string;
  gstRatePct: number;
  discountPct?: number;
  uom?: string;
  /** When the customer wants this line. Optional — an order with no promised date is real. */
  requestedDeliveryDate?: string;
}
export interface CreateOrderInput {
  customerId: string;
  custPoNo: string;
  orderDate?: string;
  /** Which of the tenant's registrations is selling — drives place of supply. */
  supplierGstin: string;
  /** Defaults to the customer's state; set explicitly for a bill-to ≠ ship-to order. */
  shipToStateCode?: string;
  shipToGstin?: string;
  shipToAddress?: string;
  fgWarehouseId?: string;
  lines: CreateOrderLineInput[];
}

/**
 * One order line as a reader needs it.
 *
 * `itemCode`, `itemName` and `uom` are joined from ENGINEERING through `ITEM_PROVIDER` —
 * the item master is not Sales' to own, and it is not Sales' to omit either. Returning a
 * bare `itemId` pushed the join onto every caller, and the honest thing a UI could do with
 * a uuid was print it. They are nullable because an item deleted from the master must not
 * make an old order unreadable; the id it was raised against is always still there.
 */
export interface SalesOrderLineView {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  qty: string;
  rate: string;
  hsn: string;
  gstRatePct: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  lineTotal: string;
  deliveredQty: string;
  /** When the customer asked for it. Null is a real answer: some orders carry no promise. */
  requestedDeliveryDate: string | null;
}

export interface SalesOrderView {
  id: string;
  soNo: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  /** @see SalesOrderSummary.requestedDeliveryDate — the earliest outstanding promise. */
  requestedDeliveryDate: string | null;
  supplierGstin: string;
  billToGstin: string | null;
  shipToGstin: string | null;
  shipToStateCode: string;
  placeOfSupply: string;
  isInterState: boolean;
  subtotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  roundOff: string;
  grandTotal: string;
  creditStatus: string;
  /** The exact figures used by the credit gate at confirmation time. */
  creditLimitSnapshot: string | null;
  creditExposureSnapshot: string | null;
  status: string;
  lines: SalesOrderLineView[];
}

/**
 * A row on the order LIST. Deliberately not `SalesOrderView`.
 *
 * `listOrders` used to build a full view per row — every line of every order, one round
 * trip each — so a hundred-row page was roughly two hundred queries to render a table that
 * shows no lines at all. A list returns what a list displays.
 */
export interface SalesOrderSummary {
  id: string;
  soNo: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  /**
   * The EARLIEST delivery date still outstanding across the order's undelivered lines, or
   * null when every line has shipped or none carried a promise.
   *
   * An order has one promise per line, and the one that matters on a list is the first one
   * that can still be missed. Showing the earliest date overall would keep an order looking
   * late after the late line had actually shipped.
   */
  requestedDeliveryDate: string | null;
  lineCount: number;
  isInterState: boolean;
  grandTotal: string;
  creditStatus: string;
  status: string;
}

export interface DispatchResult {
  dispatchNo: string;
  stockEntryRef: string;
  orderStatus: string;
  movements: unknown[];
  /** Raised by Accounts in the same transaction as the goods movement. */
  invoiceNo: string;
  invoiceTotal: number;
  dueDate: string;
}

/**
 * What a correction may touch, per document. Everything else in the row — the SO number,
 * the customer, the tenant, the credit snapshots, `created_by` — is not editable, and
 * saying so as a list is what makes that true rather than hoping no caller tries.
 *
 * `customerId` is deliberately absent from the order list: re-pointing an order at a
 * different customer changes who owes the money, which is a new order, not an edit.
 */
const EDITABLE_CUSTOMER_FIELDS = [
  "name",
  "gstin",
  "isRegistered",
  "contactEmail",
  "contactPhone",
  "billingAddress",
  "creditLimit",
  "creditDays",
] as const;

const EDITABLE_ORDER_FIELDS = [
  "custPoNo",
  "orderDate",
  "shipToStateCode",
  "shipToGstin",
  "shipToAddress",
  "placeOfSupply",
  "isInterState",
  "fgWarehouseId",
  "subtotal",
  "cgstTotal",
  "sgstTotal",
  "igstTotal",
  "roundOff",
  "grandTotal",
] as const;

const m2 = (n: number): string => n.toFixed(2);
const q3 = (n: number): string => n.toFixed(3);
const numOf = (v: string | null | undefined): number => (v == null ? 0 : Number(v));

/**
 * SMBD (MICA, Module 07) — the sell side: customers, sales orders and dispatch.
 *
 * What it owns, and what it deliberately does not:
 *  - It computes GST through the pure platform brain and STORES the split per line, so an
 *    invoice reproduces the tax agreed on the order date rather than today's rate table.
 *  - It captures **Ship-to GSTIN at order time** — mandatory on the IRP payload from
 *    1 Aug 2026 (§3.4) — because that is the last moment a human can still ask the
 *    customer for it. The effective DATE lives in config, never in a branch here.
 *  - Dispatch issues stock through the STOCK_POSTER port and raises the invoice through the
 *    ACCOUNTS_POSTER port, all in ONE transaction: the goods leaving, the stock ledger and
 *    the receivable commit together or not at all (§5.5, §5.6).
 *  - The credit gate combines the AR outstanding Accounts owns with SMBD's own confirmed-
 *    but-unshipped commitments. Before Accounts existed this summed only the second half,
 *    which understated every customer who already owed money.
 */
@Injectable()
export class SalesService implements DemandSource, CustomerOrderWriter {
  constructor(
    private readonly audit: AuditLogService,
    private readonly edits: DocumentEditService,
    private readonly numbering: NumberingService,
    private readonly dedup: DedupExplainer,
    @Inject(STOCK_POSTER) private readonly stock: StockPoster,
    @Inject(ACCOUNTS_POSTER) private readonly accounts: AccountsPoster,
    // Read-only, and only on the read paths: an order line names an item, and a reader
    // needs its code and unit. Engineering owns the master; this is the sanctioned way to
    // look at it (§1.1) rather than a join across a module boundary.
    @Inject(ITEM_PROVIDER) private readonly items: ItemProvider,
  ) {}

  /** Statutory config is data. A tenant-level override slots in here later. */
  private gstConfig(): GstConfig {
    return DEFAULT_GST_CONFIG;
  }

  /* ------------------------------- customers ------------------------------ */

  async createCustomer(input: CreateCustomerInput, idempotencyKey: string): Promise<CreateCustomerResult> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ ...input, op: "create-customer" }), async () => {
      const body = await this.doCreateCustomer(input);
      return { status: body.outcome === "created" ? 201 : 409, body };
    });
    return result.body;
  }

  private async doCreateCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    const registered = input.isRegistered ?? Boolean(input.gstin);

    if (registered && !input.gstin) {
      throw Errors.validation([{ field: "gstin", message: "a registered customer must have a GSTIN" }]);
    }
    if (!registered && input.gstin) {
      throw Errors.validation([{ field: "gstin", message: "an unregistered customer must not carry a GSTIN" }]);
    }
    let stateCode: string | null = null;
    if (input.gstin) {
      const v = validateGstin(input.gstin, this.gstConfig());
      if (!v.ok) throw Errors.validation([{ field: "gstin", message: v.reason ?? "invalid GSTIN" }]);
      stateCode = v.stateCode;
    }

    return withTenant(async (tx) => {
      // The SHARED dedup brain — the same one GENERAL, ENGINEERING and PURCHASE use.
      const existing = await tx
        .select({ id: customer.id, legalName: customer.name, gstin: customer.gstin })
        .from(customer)
        .where(eq(customer.isActive, true));
      const candidate: MasterRecord = { legalName: input.name, gstin: input.gstin ?? null };
      const matches = detectDuplicates(
        candidate,
        existing.map((e) => ({ id: e.id, legalName: e.legalName, gstin: e.gstin })),
      );
      if (matches.length > 0 && !input.acknowledgeDuplicates) {
        const { text, degraded } = await this.dedup.explain({
          candidate,
          matches,
          fieldLabels: { gstin: "GST number", legal_name: "customer name" },
        });
        return { outcome: "duplicate_suspected", candidate, matches, explanation: text, degraded };
      }

      const id = newId();
      await tx.insert(customer).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        code: input.code,
        name: input.name,
        gstin: input.gstin ?? null,
        stateCode,
        isRegistered: registered,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        billingAddress: input.billingAddress ?? null,
        creditLimit: m2(input.creditLimit ?? 0),
        creditDays: input.creditDays ?? 30,
      });
      await this.audit.appendInTx(tx, {
        action: "sales.customer.created",
        entityType: "customer",
        entityId: id,
        data: { code: input.code, name: input.name, gstin: input.gstin ?? null },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("sales", "customer", "created"),
        payload: { id, code: input.code, name: input.name },
        createdAt: now,
      });
      const row = (await tx.select().from(customer).where(eq(customer.id, id)).limit(1))[0]!;
      return {
        outcome: "created",
        customer: {
          id: row.id,
          code: row.code,
          name: row.name,
          gstin: row.gstin,
          stateCode: row.stateCode,
          creditLimit: row.creditLimit,
        },
      };
    });
  }

  /* ------------------------------ sales orders ---------------------------- */

  async createOrder(input: CreateOrderInput, idempotencyKey: string): Promise<SalesOrderView> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ ...input, op: "create-so" }), async () => ({
      status: 201,
      body: await this.doCreateOrder(input),
    }));
    return result.body;
  }

  private async doCreateOrder(input: CreateOrderInput): Promise<SalesOrderView> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "a sales order needs at least one line" }]);
    }
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    const orderDate = input.orderDate ?? now.toISOString().slice(0, 10);
    const config = this.gstConfig();

    const supplier = validateGstin(input.supplierGstin, config);
    if (!supplier.ok) {
      throw Errors.validation([{ field: "supplierGstin", message: supplier.reason ?? "invalid GSTIN" }]);
    }

    return withTenant(async (tx) => {
      const cust = (await tx.select().from(customer).where(eq(customer.id, input.customerId)).limit(1))[0];
      if (!cust) throw new AppError("CUSTOMER_NOT_FOUND", 422, `No customer ${input.customerId}.`);

      // Place of supply for GOODS is the SHIPPING destination, which is why bill-to and
      // ship-to are separate fields rather than one address.
      const shipToStateCode = input.shipToStateCode ?? cust.stateCode;
      if (!shipToStateCode) {
        throw Errors.validation([
          { field: "shipToStateCode", message: "required — the customer has no GSTIN to derive it from" },
        ]);
      }

      // The 1 Aug 2026 mandate, enforced at ORDER time so it is still fixable by a human.
      const shipTo = checkShipToGstin({
        docDate: orderDate,
        shipToGstin: input.shipToGstin ?? (input.shipToStateCode ? undefined : cust.gstin),
        shipToIsRegistered: cust.isRegistered,
        config,
      });
      if (!shipTo.ok) {
        throw new AppError("SHIP_TO_GSTIN_REQUIRED", 422, shipTo.reason ?? "ship-to GSTIN required");
      }
      if (shipTo.value && shipTo.value !== "URP") {
        const shipState = stateCodeOfGstin(shipTo.value);
        if (shipState && shipState !== shipToStateCode) {
          throw Errors.validation([
            {
              field: "shipToGstin",
              message: `ship-to GSTIN is registered in state ${shipState} but the ship-to state is ${shipToStateCode}`,
            },
          ]);
        }
      }

      // The same customer PO twice is nearly always a re-key. The unique index is the
      // backstop; this check is what turns it into a DOMAIN error instead of a raw
      // Postgres 23505 leaking to the caller (§5 canonical error envelope).
      const dupPo = await tx
        .select({ soNo: salesOrder.soNo })
        .from(salesOrder)
        .where(and(eq(salesOrder.customerId, input.customerId), eq(salesOrder.custPoNo, input.custPoNo)))
        .limit(1);
      if (dupPo[0]) {
        throw new AppError(
          "DUPLICATE_CUSTOMER_PO",
          409,
          `Customer PO '${input.custPoNo}' is already on sales order ${dupPo[0].soNo}.`,
        );
      }

      // A promised date before the order was taken is a typo, and it would place the demand
      // in a bucket that has already passed — a permanent past-due exception no action can
      // clear. A trigger enforces this (migration 0033); this check is what turns it into a
      // DOMAIN error instead of a raw Postgres check_violation reaching the caller, exactly
      // as the duplicate-PO check above does for 23505.
      for (const [i, l] of input.lines.entries()) {
        if (l.requestedDeliveryDate && l.requestedDeliveryDate < orderDate) {
          throw Errors.validation([
            {
              field: `lines.${i}.requestedDeliveryDate`,
              message: `${l.requestedDeliveryDate} is before the order date ${orderDate} — a delivery cannot be promised for a date already past.`,
            },
          ]);
        }
      }

      // The tax itself — one decision drives every line, so a document can never be both.
      // The brain throws plain Errors for bad input (HSN shape, unknown state); they are
      // caller mistakes, so they become 422s with a code rather than escaping as 500s.
      let tax;
      try {
        tax = computeOrderTax({
          supplierGstin: input.supplierGstin,
          placeOfSupplyStateCode: shipToStateCode,
          lines: input.lines.map((l, i) => ({
            lineNo: i + 1,
            qty: l.qty,
            rate: l.rate,
            discountPct: l.discountPct,
            gstRatePct: l.gstRatePct,
            hsn: l.hsn,
          })),
        });
      } catch (e) {
        throw new AppError("GST_INPUT_INVALID", 422, e instanceof Error ? e.message : String(e));
      }

      const id = newId();
      // Numbered from the order's OWN date, not today's: an order back-dated into March
      // belongs to the previous year's series, and that is what a register is read by.
      const soNo = await this.numbering.next(tx, "sales_order", fyCode(orderDate));
      await tx.insert(salesOrder).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        soNo,
        customerId: input.customerId,
        custPoNo: input.custPoNo,
        orderDate,
        supplierGstin: input.supplierGstin,
        billToGstin: cust.gstin,
        shipToGstin: shipTo.value,
        shipToStateCode,
        shipToAddress: input.shipToAddress ?? cust.billingAddress,
        placeOfSupply: shipToStateCode,
        isInterState: tax.interState,
        fgWarehouseId: input.fgWarehouseId ?? null,
        subtotal: m2(tax.subtotal),
        cgstTotal: m2(tax.cgstTotal),
        sgstTotal: m2(tax.sgstTotal),
        igstTotal: m2(tax.igstTotal),
        roundOff: m2(tax.roundOff),
        grandTotal: m2(tax.grandTotal),
        creditStatus: "pending",
        status: "draft",
      });

      for (let i = 0; i < input.lines.length; i++) {
        const src = input.lines[i]!;
        const t = tax.lines[i]!;
        await tx.insert(salesOrderLine).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          orderId: id,
          lineNo: i + 1,
          itemId: src.itemId,
          qty: q3(src.qty),
          uom: src.uom ?? null,
          rate: m2(src.rate),
          discountPct: m2(src.discountPct ?? 0),
          hsn: src.hsn,
          gstRatePct: m2(src.gstRatePct),
          taxableValue: m2(t.taxableValue),
          cgst: m2(t.cgst),
          sgst: m2(t.sgst),
          igst: m2(t.igst),
          lineTotal: m2(t.lineTotal),
          // WHEN the customer wants it. Until now the column existed, PLANNING depended on
          // it and nothing could ever set it — so every order reached MRP with a null need
          // date and the plan was arithmetic against nothing.
          requestedDeliveryDate: src.requestedDeliveryDate ?? null,
        });
      }

      await this.audit.appendInTx(tx, {
        action: "sales.order.created",
        entityType: "sales_order",
        entityId: id,
        data: {
          soNo,
          custPoNo: input.custPoNo,
          placeOfSupply: shipToStateCode,
          interState: tax.interState,
          grandTotal: m2(tax.grandTotal),
        },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("sales", "order", "created"),
        payload: { id, soNo, customerId: input.customerId, grandTotal: m2(tax.grandTotal) },
        createdAt: now,
      });
      return this.viewInTx(tx, id);
    });
  }

  /* ------------------------------ corrections ----------------------------- */

  /**
   * Correct a customer. A master nobody has transacted against yet and a master with two
   * years of orders behind it are edited the same way — what changes is only that the
   * audit trail carries the second one's history, which is exactly the right difference.
   */
  async editCustomer(customerId: string, patch: Partial<CreateCustomerInput>): Promise<MasterRecord> {
    this.edits.requireDocumentId(customerId, "customer");
    return withTenant(async (tx) => {
      await this.edits.lock(tx, "customer", customerId);
      const [before] = await tx.select().from(customer).where(eq(customer.id, customerId)).limit(1);
      if (!before) throw Errors.notFound(`Customer ${customerId}`);

      // A customer has no status column: a master is always in one state. The policy still
      // decides, so the answer lives in one table rather than being assumed here.
      const outcome = await this.edits.apply(tx, {
        docType: "sales.customer",
        id: customerId,
        before: before as unknown as Record<string, unknown>,
        status: before.isActive ? "active" : "inactive",
        patch: patch as Record<string, unknown>,
        editableFields: EDITABLE_CUSTOMER_FIELDS,
      });

      if (outcome.changed) {
        await tx.update(customer).set(outcome.columns).where(eq(customer.id, customerId));
      }
      const [after] = await tx.select().from(customer).where(eq(customer.id, customerId)).limit(1);
      return after as unknown as MasterRecord;
    });
  }

  /**
   * Correct or amend a sales order.
   *
   * One method covers both because the DIFFERENCE is data, not control flow: the policy
   * decides whether this is a free correction or an amendment that needs a reason, and the
   * shared edit service applies whichever it is. Two methods would mean two places to
   * forget the audit append.
   *
   * Three things here are Sales' own business and cannot live in the shared service:
   *
   *   1. TAX IS RECOMPUTED, never patched. A quantity change that left `grand_total`
   *      alone would produce an order whose lines and total disagree — and the total is
   *      what the credit gate reads and what gets invoiced.
   *   2. A DISPATCHED LINE IS FLOOR, not a suggestion. Once 40 of 120 have shipped, the
   *      order may be cut to 40 but not below: the remainder is a fact about a lorry.
   *   3. A VALUE CHANGE RE-OPENS THE CREDIT GATE. Amending a confirmed order upward and
   *      leaving `credit_status = passed` would let an order past a limit it was never
   *      checked against — the one outcome the gate exists to prevent.
   */
  async editOrder(orderId: string, input: EditOrderInput, idempotencyKey: string): Promise<SalesOrderView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ ...input, orderId, op: "edit-so" }),
      async () => ({ status: 200, body: await this.doEditOrder(orderId, input) }),
    );
    return result.body;
  }

  private async doEditOrder(orderId: string, input: EditOrderInput): Promise<SalesOrderView> {
    this.edits.requireDocumentId(orderId, "sales order");
    const { actorId } = currentTenant();
    const config = this.gstConfig();

    return withTenant(async (tx) => {
      await this.edits.lock(tx, "sales_order", orderId);
      const [before] = await tx.select().from(salesOrder).where(eq(salesOrder.id, orderId)).limit(1);
      if (!before) throw Errors.notFound(`Sales order ${orderId}`);

      const existingLines = await tx
        .select()
        .from(salesOrderLine)
        .where(eq(salesOrderLine.orderId, orderId))
        .orderBy(asc(salesOrderLine.lineNo));

      const orderDate = input.orderDate ?? before.orderDate;
      const shipToStateCode = input.shipToStateCode ?? before.shipToStateCode;

      // Header patch, before the lines: the tax computation below reads the state code, so
      // a change to ship-to and a change to quantity in the same request must be applied in
      // that order or the tax is computed against the old destination.
      const header: Record<string, unknown> = {};
      if (input.custPoNo !== undefined) header.custPoNo = input.custPoNo;
      if (input.orderDate !== undefined) header.orderDate = orderDate;
      if (input.shipToStateCode !== undefined) header.shipToStateCode = shipToStateCode;
      if (input.shipToGstin !== undefined) header.shipToGstin = input.shipToGstin;
      if (input.shipToAddress !== undefined) header.shipToAddress = input.shipToAddress;
      if (input.fgWarehouseId !== undefined) header.fgWarehouseId = input.fgWarehouseId;

      if (input.shipToStateCode !== undefined) {
        header.placeOfSupply = shipToStateCode;
        header.isInterState = stateCodeOfGstin(before.supplierGstin) !== shipToStateCode;
      }

      // The 1 Aug 2026 ship-to mandate applies to an EDIT exactly as it does to a create:
      // moving the destination is precisely how an order that satisfied the rule stops
      // satisfying it, and finding that out at e-invoicing time is finding out too late.
      if (input.shipToGstin !== undefined || input.shipToStateCode !== undefined) {
        const [cust] = await tx
          .select({ isRegistered: customer.isRegistered, gstin: customer.gstin })
          .from(customer)
          .where(eq(customer.id, before.customerId))
          .limit(1);
        const shipTo = checkShipToGstin({
          docDate: orderDate,
          shipToGstin: input.shipToGstin ?? before.shipToGstin ?? cust?.gstin,
          shipToIsRegistered: cust?.isRegistered ?? false,
          config,
        });
        if (!shipTo.ok) {
          throw new AppError("SHIP_TO_GSTIN_REQUIRED", 422, shipTo.reason ?? "ship-to GSTIN required");
        }
        if (shipTo.value && shipTo.value !== "URP") {
          const shipState = stateCodeOfGstin(shipTo.value);
          if (shipState && shipState !== shipToStateCode) {
            throw Errors.validation([
              {
                field: "shipToGstin",
                message: `ship-to GSTIN is registered in state ${shipState}, but the order ships to ${shipToStateCode}`,
              },
            ]);
          }
        }
      }

      // A customer PO number is the one header field with a uniqueness rule, and editing
      // into a collision must be a domain error rather than a raw 23505 (§5).
      if (input.custPoNo !== undefined && input.custPoNo !== before.custPoNo) {
        const clash = await tx
          .select({ soNo: salesOrder.soNo })
          .from(salesOrder)
          .where(
            and(
              eq(salesOrder.customerId, before.customerId),
              eq(salesOrder.custPoNo, input.custPoNo),
              ne(salesOrder.id, orderId),
            ),
          )
          .limit(1);
        if (clash[0]) {
          throw new AppError(
            "DUPLICATE_CUSTOMER_PO",
            409,
            `Customer PO '${input.custPoNo}' is already on sales order ${clash[0].soNo}.`,
          );
        }
      }

      // ---- lines, and the tax they imply ------------------------------------
      let tax: ReturnType<typeof computeOrderTax> | null = null;
      if (input.lines) {
        if (input.lines.length === 0) {
          throw Errors.validation([{ field: "lines", message: "a sales order needs at least one line" }]);
        }

        // Rule 2: a shipped quantity is a floor. Checked per ITEM rather than per line
        // number, because an edit legitimately reorders and renumbers lines and the lorry
        // does not care which row the item sat on.
        const shipped = new Map<string, number>();
        for (const l of existingLines) {
          const qty = Number(l.deliveredQty);
          if (qty > 0) shipped.set(l.itemId, (shipped.get(l.itemId) ?? 0) + qty);
        }
        for (const [itemId, deliveredQty] of shipped) {
          const kept = input.lines
            .filter((l) => l.itemId === itemId)
            .reduce((sum, l) => sum + l.qty, 0);
          if (kept < deliveredQty) {
            throw new AppError(
              "DISPATCHED_QTY_EXCEEDS_EDIT",
              409,
              `${deliveredQty} of this item has already been dispatched, so the order cannot be cut to ${kept}. ` +
                `Raise a return or a credit note for the difference.`,
            );
          }
        }

        for (const [i, l] of input.lines.entries()) {
          if (l.requestedDeliveryDate && l.requestedDeliveryDate < orderDate) {
            throw Errors.validation([
              {
                field: `lines.${i}.requestedDeliveryDate`,
                message: `${l.requestedDeliveryDate} is before the order date ${orderDate} — a delivery cannot be promised for a date already past.`,
              },
            ]);
          }
        }

        try {
          tax = computeOrderTax({
            supplierGstin: before.supplierGstin,
            placeOfSupplyStateCode: shipToStateCode,
            lines: input.lines.map((l, i) => ({
              lineNo: i + 1,
              qty: l.qty,
              rate: l.rate,
              discountPct: l.discountPct,
              gstRatePct: l.gstRatePct,
              hsn: l.hsn,
            })),
          });
        } catch (e) {
          throw new AppError("GST_INPUT_INVALID", 422, e instanceof Error ? e.message : String(e));
        }

        header.subtotal = m2(tax.subtotal);
        header.cgstTotal = m2(tax.cgstTotal);
        header.sgstTotal = m2(tax.sgstTotal);
        header.igstTotal = m2(tax.igstTotal);
        header.roundOff = m2(tax.roundOff);
        header.grandTotal = m2(tax.grandTotal);
      }

      // The policy decides, the shared service records. Everything above was Sales working
      // out WHAT the document should say; this is the single place that decides whether it
      // is allowed to say it and writes down that it did.
      const outcome = await this.edits.apply(tx, {
        docType: "sales.order",
        id: orderId,
        before: before as unknown as Record<string, unknown>,
        status: before.status,
        patch: header,
        editableFields: EDITABLE_ORDER_FIELDS,
        reason: input.reason,
      });

      const linesChanged = input.lines !== undefined && this.linesDiffer(existingLines, input.lines);
      if (!outcome.changed && !linesChanged) {
        // Nothing moved. No UPDATE, no event, no revision spent — see DocumentEditService.
        return this.viewInTx(tx, orderId);
      }

      const columns: Record<string, unknown> = { ...outcome.columns };

      // Rule 3. A value change on an order the customer was already promised puts it back
      // in front of the credit gate; leaving the old verdict in place would be a limit
      // check that silently no longer applies to the number it was checking.
      const valueMoved = tax !== null && m2(tax.grandTotal) !== before.grandTotal;
      if (valueMoved && outcome.reapprovalRequired) {
        columns.creditStatus = "pending";
        columns.creditLimitSnapshot = null;
        columns.creditExposureSnapshot = null;
        columns.status = "draft";
      }

      // An amendment always writes, even when only the lines moved: the revision number
      // and the reason belong to the document, not to whichever column happened to change.
      if (Object.keys(columns).length > 0) {
        columns.updatedAt = new Date();
        columns.updatedBy = actorId;
        await tx.update(salesOrder).set(columns).where(eq(salesOrder.id, orderId));
      }

      if (input.lines && tax) {
        // Replace rather than reconcile. Line identity across an edit is not stable — an
        // operator deletes row 2 and adds a new row 4 — so matching by line number would
        // silently attach one line's history to another. The audit change set already
        // holds what the lines used to be.
        await tx.delete(salesOrderLine).where(eq(salesOrderLine.orderId, orderId));
        for (let i = 0; i < input.lines.length; i++) {
          const src = input.lines[i]!;
          const t = tax.lines[i]!;
          const previouslyDelivered = existingLines
            .filter((l) => l.itemId === src.itemId)
            .reduce((sum, l) => sum + Number(l.deliveredQty), 0);
          await tx.insert(salesOrderLine).values({
            id: newId(),
            tenantId: before.tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            orderId,
            lineNo: i + 1,
            itemId: src.itemId,
            qty: q3(src.qty),
            uom: src.uom ?? null,
            rate: m2(src.rate),
            discountPct: m2(src.discountPct ?? 0),
            hsn: src.hsn,
            gstRatePct: m2(src.gstRatePct),
            taxableValue: m2(t.taxableValue),
            cgst: m2(t.cgst),
            sgst: m2(t.sgst),
            igst: m2(t.igst),
            lineTotal: m2(t.lineTotal),
            // Carried forward, not reset. A rebuilt line for an item that has already part
            // shipped must keep that history or the order looks undispatched and the goods
            // get sent twice.
            deliveredQty: q3(Math.min(previouslyDelivered, src.qty)),
            requestedDeliveryDate: src.requestedDeliveryDate ?? null,
          });
        }
      }

      // A downstream module planned against the old numbers. PLANNING nets open demand and
      // CSP quotes promised dates, and neither re-reads an order it has already consumed —
      // so an amendment that stayed inside Sales would leave the plan quietly wrong.
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId: before.tenantId,
        name: eventName("sales", "order", outcome.tier === "amend" ? "amended" : "corrected"),
        payload: {
          id: orderId,
          soNo: before.soNo,
          customerId: before.customerId,
          revisionNo: outcome.revisionNo,
          grandTotal: tax ? m2(tax.grandTotal) : before.grandTotal,
          creditRecheckRequired: valueMoved && outcome.reapprovalRequired,
          changes: outcome.changeSet?.changes.map((c) => c.field) ?? [],
          reason: input.reason ?? null,
        },
        createdAt: new Date(),
      });

      return this.viewInTx(tx, orderId);
    });
  }

  /**
   * Do these two line sets say the same thing?
   *
   * Compared on the fields a customer would notice, in order. Not a deep equality on the
   * rows: the stored lines carry computed tax and delivery columns the input never has, so
   * a naive comparison would report a change on every single save.
   */
  private linesDiffer(
    existing: Array<typeof schema.salesOrderLine.$inferSelect>,
    incoming: NonNullable<EditOrderInput["lines"]>,
  ): boolean {
    if (existing.length !== incoming.length) return true;
    return existing.some((l, i) => {
      const n = incoming[i]!;
      return (
        l.itemId !== n.itemId ||
        Number(l.qty) !== n.qty ||
        Number(l.rate) !== n.rate ||
        Number(l.gstRatePct) !== n.gstRatePct ||
        l.hsn !== n.hsn ||
        Number(l.discountPct) !== (n.discountPct ?? 0) ||
        (l.requestedDeliveryDate ?? null) !== (n.requestedDeliveryDate ?? null)
      );
    });
  }

  /** Every correction made to this order, newest first. */
  async orderHistory(orderId: string) {
    this.edits.requireDocumentId(orderId, "sales order");
    return this.edits.history("sales.order", orderId);
  }

  /** Whether this order may be edited right now, and what to tell the user if not. */
  async orderEditPolicy(orderId: string) {
    this.edits.requireDocumentId(orderId, "sales order");
    const [row] = await withTenant((tx) =>
      tx.select({ status: salesOrder.status, revisionNo: salesOrder.revisionNo })
        .from(salesOrder)
        .where(eq(salesOrder.id, orderId))
        .limit(1),
    );
    if (!row) throw Errors.notFound(`Sales order ${orderId}`);
    return { ...this.edits.policy("sales.order", row.status), status: row.status, revisionNo: row.revisionNo };
  }

  /* ------------------------------ credit gate ----------------------------- */

  /**
   * Confirm the order, subject to the credit gate. Exposure is the value of this tenant's
   * own CONFIRMED-but-undelivered orders for the customer; all three inputs (limit,
   * exposure, order value) are snapshotted onto the order so the decision stays auditable
   * after the numbers move.
   */
  async confirmOrder(
    orderId: string,
    idempotencyKey: string,
    override?: { reason: string },
  ): Promise<SalesOrderView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ orderId, override, op: "confirm-so" }),
      async () => ({ status: 201, body: await this.doConfirmOrder(orderId, override) }),
    );
    return result.body;
  }

  private async doConfirmOrder(orderId: string, override?: { reason: string }): Promise<SalesOrderView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const so = await this.loadOrder(tx, orderId);
      if (so.status !== "draft" && so.status !== "credit_hold") {
        throw new AppError("ORDER_NOT_CONFIRMABLE", 409, `Order ${so.soNo} is ${so.status}.`);
      }
      const cust = (await tx.select().from(customer).where(eq(customer.id, so.customerId)).limit(1))[0]!;

      // Exposure now has TWO parts, and Accounts owns the half that is real money:
      //   * INVOICED and unpaid  -> the AR subledger, read through the ledger port;
      //   * CONFIRMED not yet shipped -> still SMBD's own commitment, no invoice exists.
      // Before Accounts existed this method summed only the second half and called it
      // exposure, which understated every customer who already owed money.
      const ar = await this.accounts.getCustomerOutstandingInTx(tx, so.customerId);
      const openRows = await tx
        .select({ total: salesOrder.grandTotal })
        .from(salesOrder)
        .where(
          and(
            eq(salesOrder.customerId, so.customerId),
            ne(salesOrder.id, orderId),
            inArray(salesOrder.status, ["confirmed", "partially_dispatched"]),
          ),
        );
      const committed = openRows.reduce((a, r) => a + numOf(r.total), 0);
      const exposure = Math.round((ar.outstanding + committed) * 100) / 100;
      const limit = numOf(cust.creditLimit);
      const orderValue = numOf(so.grandTotal);
      const withinLimit = exposure + orderValue <= limit + 1e-9;

      let creditStatus: string;
      let status: string;
      if (withinLimit) {
        creditStatus = "passed";
        status = "confirmed";
      } else if (override) {
        // An override is a decision a human owns: it needs a reason and it is audited.
        creditStatus = "override";
        status = "confirmed";
      } else {
        creditStatus = "hold";
        status = "credit_hold";
      }

      await tx
        .update(salesOrder)
        .set({
          creditStatus,
          status,
          creditLimitSnapshot: m2(limit),
          creditExposureSnapshot: m2(exposure),
          creditOverrideBy: override ? actorId : null,
          creditOverrideReason: override?.reason ?? null,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(salesOrder.id, orderId));

      await this.audit.appendInTx(tx, {
        action: creditStatus === "override" ? "sales.order.credit_overridden" : "sales.order.confirmed",
        entityType: "sales_order",
        entityId: orderId,
        data: {
          soNo: so.soNo,
          creditStatus,
          limit: m2(limit),
          exposure: m2(exposure),
          orderValue: m2(orderValue),
          reason: override?.reason ?? null,
        },
      });

      if (status === "confirmed") {
        // Planning/Production consume this — the SO → make hand-off (§11.6).
        await tx.insert(outboxEvent).values({
          id: newId(),
          tenantId,
          name: eventName("sales", "order", "confirmed"),
          payload: { id: orderId, soNo: so.soNo, customerId: so.customerId, grandTotal: m2(orderValue) },
          createdAt: now,
        });
      }
      return this.viewInTx(tx, orderId);
    });
  }

  /* -------------------------------- dispatch ------------------------------ */

  /**
   * Ship goods. The stock issue runs through Inventory's write path INSIDE this
   * transaction, so the dispatch note, the delivered quantities and the ledger commit
   * together — and a short stock refuses the whole dispatch (§5.5, §5.6).
   */
  async dispatchOrder(
    orderId: string,
    input: { lines: Array<{ orderLineId: string; qty: number }>; transporter?: string; vehicleNo?: string; ewayBillNo?: string },
    idempotencyKey: string,
  ): Promise<DispatchResult> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ orderId, input, op: "dispatch" }),
      async () => ({ status: 201, body: await this.doDispatch(orderId, input) }),
    );
    return result.body;
  }

  private async doDispatch(
    orderId: string,
    input: { lines: Array<{ orderLineId: string; qty: number }>; transporter?: string; vehicleNo?: string; ewayBillNo?: string },
  ): Promise<DispatchResult> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "a dispatch needs at least one line" }]);
    }
    const { tenantId, actorId } = currentTenant();
    const now = new Date();

    return withTenant(async (tx) => {
      const so = await this.loadOrder(tx, orderId);
      if (so.status === "credit_hold") {
        throw new AppError("ORDER_ON_CREDIT_HOLD", 409, `Order ${so.soNo} is on credit hold and cannot ship.`);
      }
      if (so.status !== "confirmed" && so.status !== "partially_dispatched") {
        throw new AppError("ORDER_NOT_DISPATCHABLE", 409, `Order ${so.soNo} is ${so.status}.`);
      }
      if (!so.fgWarehouseId) {
        throw Errors.validation([{ field: "fgWarehouseId", message: "the order has no source warehouse" }]);
      }

      const lines = await tx.select().from(salesOrderLine).where(eq(salesOrderLine.orderId, orderId));
      const byId = new Map(lines.map((l) => [l.id, l]));

      const stockLines: Array<{ itemId: string; fromWarehouseId: string; qty: number }> = [];
      for (const req of input.lines) {
        const line = byId.get(req.orderLineId);
        if (!line) throw new AppError("ORDER_LINE_NOT_FOUND", 422, `Line ${req.orderLineId} is not on ${so.soNo}.`);
        if (req.qty <= 0) throw Errors.validation([{ field: "qty", message: "must be > 0" }]);
        const remaining = numOf(line.qty) - numOf(line.deliveredQty);
        if (req.qty > remaining + 1e-9) {
          throw new AppError(
            "OVER_DISPATCH",
            422,
            `Line ${line.lineNo}: only ${remaining} of ${line.qty} remains to ship on ${so.soNo}.`,
          );
        }
        stockLines.push({ itemId: line.itemId, fromWarehouseId: so.fgWarehouseId, qty: req.qty });
      }

      // SMBD never writes stock — Inventory does, in this same transaction.
      const post = await this.stock.postInTx(tx, {
        entryType: "issue",
        reasonCode: "sales_dispatch",
        remarks: `dispatch against ${so.soNo}`,
        lines: stockLines,
      });

      const dispatchId = newId();
      const dispatchNo = await this.numbering.next(tx, "delivery_note", fyCode(now.toISOString()));
      await tx.insert(dispatch).values({
        id: dispatchId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        dispatchNo,
        orderId,
        dispatchDate: now.toISOString().slice(0, 10),
        transporter: input.transporter ?? null,
        vehicleNo: input.vehicleNo ?? null,
        ewayBillNo: input.ewayBillNo ?? null,
        status: "dispatched",
        stockEntryRef: post.entryId,
      });

      for (const req of input.lines) {
        const line = byId.get(req.orderLineId)!;
        await tx.insert(dispatchLine).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          dispatchId,
          orderLineId: req.orderLineId,
          itemId: line.itemId,
          qty: q3(req.qty),
        });
        await tx
          .update(salesOrderLine)
          .set({
            deliveredQty: q3(numOf(line.deliveredQty) + req.qty),
            updatedBy: actorId,
            updatedAt: now,
          })
          .where(eq(salesOrderLine.id, req.orderLineId));
      }

      // Fully shipped only when EVERY line is satisfied.
      const after = await tx.select().from(salesOrderLine).where(eq(salesOrderLine.orderId, orderId));
      const allDone = after.every((l) => numOf(l.deliveredQty) + 1e-9 >= numOf(l.qty));
      const orderStatus = allDone ? "dispatched" : "partially_dispatched";
      await tx
        .update(salesOrder)
        .set({ status: orderStatus, updatedBy: actorId, updatedAt: now })
        .where(eq(salesOrder.id, orderId));

      // ---- the invoice, raised in THIS transaction (contract #6) ----------------------
      // SMBD values the shipped subset with its own GST brain and hands the figures over;
      // Accounts records them and never recomputes (ACCOUNTS §1.3). Goods leaving, the
      // ledger entry and the receivable therefore commit together or not at all.
      const invoiceTax = computeOrderTax({
        supplierGstin: so.supplierGstin,
        placeOfSupplyStateCode: so.placeOfSupply,
        lines: input.lines.map((req, i) => {
          const l = byId.get(req.orderLineId)!;
          return {
            lineNo: i + 1,
            qty: req.qty,
            rate: numOf(l.rate),
            discountPct: numOf(l.discountPct),
            gstRatePct: numOf(l.gstRatePct),
            hsn: l.hsn,
          };
        }),
      });
      const cust = (await tx.select().from(customer).where(eq(customer.id, so.customerId)).limit(1))[0];
      const invoice = await this.accounts.raiseSalesInvoiceInTx(tx, {
        customerId: so.customerId,
        customerName: cust?.name,
        soRef: so.soNo,
        dispatchRef: dispatchNo,
        amounts: {
          taxableValue: invoiceTax.subtotal,
          cgst: invoiceTax.cgstTotal,
          sgst: invoiceTax.sgstTotal,
          igst: invoiceTax.igstTotal,
          roundOff: invoiceTax.roundOff,
          grossReceivable: invoiceTax.grandTotal,
        },
        paymentTermsDays: cust?.creditDays ?? 30,
        invoiceDate: now.toISOString().slice(0, 10),
        sourceDocType: "dispatch",
        sourceDocId: dispatchId,
      });

      await this.audit.appendInTx(tx, {
        action: "sales.dispatch.executed",
        entityType: "dispatch",
        entityId: dispatchId,
        data: {
          dispatchNo,
          soNo: so.soNo,
          stockEntryRef: post.entryId,
          orderStatus,
          invoiceNo: invoice.invoiceNo,
        },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("sales", "dispatch", "executed"),
        payload: { id: dispatchId, dispatchNo, orderId, soNo: so.soNo, orderStatus },
        createdAt: now,
      });

      return {
        dispatchNo,
        stockEntryRef: post.entryId,
        orderStatus,
        movements: post.movements,
        invoiceNo: invoice.invoiceNo,
        invoiceTotal: invoice.grossReceivable,
        dueDate: invoice.dueDate,
      };
    });
  }

  /* --------------------------------- reads -------------------------------- */

  // ---- DemandSource port (read by PLANNING) ----

  /**
   * Confirmed, undelivered sales-order demand.
   *
   * Three deliberate filters, each of which would corrupt a plan if it were dropped:
   *  - only `confirmed` and `partially_dispatched` orders. A draft is a conversation and a
   *    cancelled order is a memory; planning either builds pumps nobody ordered.
   *  - only the UNDELIVERED balance. Netting against the ordered quantity re-plans what has
   *    already shipped, every run, forever.
   *  - the requested delivery date is passed through as it is, NULL included. Planning
   *    decides what a missing date means; Sales does not get to invent one here, because
   *    the invented date would look exactly like a promise the customer made.
   */
  async openSalesDemand(): Promise<OpenDemandLine[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({
          itemId: salesOrderLine.itemId,
          qty: salesOrderLine.qty,
          deliveredQty: salesOrderLine.deliveredQty,
          requestedDeliveryDate: salesOrderLine.requestedDeliveryDate,
          soNo: salesOrder.soNo,
          status: salesOrder.status,
          customerName: customer.name,
        })
        .from(salesOrderLine)
        .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.orderId))
        .innerJoin(customer, eq(customer.id, salesOrder.customerId))
        .where(
          and(
            inArray(salesOrder.status, ["confirmed", "partially_dispatched"]),
            eq(salesOrderLine.isActive, true),
            sql`${salesOrderLine.qty} > ${salesOrderLine.deliveredQty}`,
          ),
        )
        .orderBy(asc(salesOrder.soNo));

      return rows.map((r) => ({
        itemId: r.itemId,
        qty: Number(r.qty) - Number(r.deliveredQty),
        requestedDeliveryDate: r.requestedDeliveryDate,
        ref: r.soNo,
        customerName: r.customerName,
        orderStatus: r.status,
      }));
    });
  }

  async getOrder(orderId: string): Promise<SalesOrderView> {
    return withTenant((tx) => this.viewInTx(tx, orderId));
  }

  /**
   * A page of orders, in THREE queries regardless of page size.
   *
   * It was one query plus a full `viewInTx` per row, which meant ~200 round trips to draw
   * one screen. The page, the customer names and the line aggregates are now fetched in
   * bulk and stitched in memory: the orders come back joined to their customer, and one
   * `inArray` over the page's ids yields everything needed to count lines and find the
   * earliest outstanding promise.
   */
  async listOrders(limit: number, cursor?: string): Promise<CursorPage<SalesOrderSummary>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({
          id: salesOrder.id,
          createdAt: salesOrder.createdAt,
          soNo: salesOrder.soNo,
          customerId: salesOrder.customerId,
          customerCode: customer.code,
          customerName: customer.name,
          custPoNo: salesOrder.custPoNo,
          orderDate: salesOrder.orderDate,
          isInterState: salesOrder.isInterState,
          grandTotal: salesOrder.grandTotal,
          creditStatus: salesOrder.creditStatus,
          status: salesOrder.status,
        })
        .from(salesOrder)
        // An intra-module join: `customer` and `sales_order` are both SMBD's tables, so
        // this is not a cross-module reach — it is one module reading its own spine.
        .innerJoin(customer, eq(customer.id, salesOrder.customerId))
        .where(
          keyset
            ? and(
                eq(salesOrder.isActive, true),
                or(
                  gt(salesOrder.createdAt, new Date(keyset.createdAt)),
                  and(eq(salesOrder.createdAt, new Date(keyset.createdAt)), gt(salesOrder.id, keyset.id)),
                ),
              )
            : eq(salesOrder.isActive, true),
        )
        .orderBy(asc(salesOrder.createdAt), asc(salesOrder.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const ids = page.map((r) => r.id);

      // Line aggregates for the whole page at once. Reduced in memory rather than in SQL
      // because "earliest date among lines that have not fully shipped" needs the qty vs
      // delivered comparison, and expressing that as a grouped HAVING buys nothing here.
      const lineRows =
        ids.length === 0
          ? []
          : await tx
              .select({
                orderId: salesOrderLine.orderId,
                qty: salesOrderLine.qty,
                deliveredQty: salesOrderLine.deliveredQty,
                requestedDeliveryDate: salesOrderLine.requestedDeliveryDate,
              })
              .from(salesOrderLine)
              .where(and(inArray(salesOrderLine.orderId, ids), eq(salesOrderLine.isActive, true)));

      const lineCount = new Map<string, number>();
      const nextPromise = new Map<string, string>();
      for (const l of lineRows) {
        lineCount.set(l.orderId, (lineCount.get(l.orderId) ?? 0) + 1);
        if (!l.requestedDeliveryDate) continue;
        if (numOf(l.deliveredQty) + 1e-9 >= numOf(l.qty)) continue; // already shipped
        const current = nextPromise.get(l.orderId);
        if (!current || l.requestedDeliveryDate < current) {
          nextPromise.set(l.orderId, l.requestedDeliveryDate);
        }
      }

      const last = page[page.length - 1];
      return {
        items: page.map((r) => ({
          id: r.id,
          soNo: r.soNo,
          customerId: r.customerId,
          customerCode: r.customerCode,
          customerName: r.customerName,
          custPoNo: r.custPoNo,
          orderDate: r.orderDate,
          requestedDeliveryDate: nextPromise.get(r.id) ?? null,
          lineCount: lineCount.get(r.id) ?? 0,
          isInterState: r.isInterState,
          grandTotal: r.grandTotal,
          creditStatus: r.creditStatus,
          status: r.status,
        })),
        nextCursor:
          rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
      };
    });
  }

  async listCustomers(limit: number, cursor?: string): Promise<CursorPage<CustomerRow>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select()
        .from(customer)
        .where(
          keyset
            ? and(
                eq(customer.isActive, true),
                or(
                  gt(customer.createdAt, new Date(keyset.createdAt)),
                  and(eq(customer.createdAt, new Date(keyset.createdAt)), gt(customer.id, keyset.id)),
                ),
              )
            : eq(customer.isActive, true),
        )
        .orderBy(asc(customer.createdAt), asc(customer.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          gstin: r.gstin,
          stateCode: r.stateCode,
          creditLimit: r.creditLimit,
        })),
        nextCursor:
          rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
      };
    });
  }

  /* -------------------------------- helpers ------------------------------- */

  private async loadOrder(tx: Tx, id: string) {
    const rows = await tx.select().from(salesOrder).where(eq(salesOrder.id, id)).limit(1);
    const r = rows[0];
    if (!r) throw new AppError("ORDER_NOT_FOUND", 404, `No sales order ${id}.`);
    return r;
  }

  private async viewInTx(tx: Tx, id: string): Promise<SalesOrderView> {
    const r = await this.loadOrder(tx, id);
    const lines = await tx
      .select()
      .from(salesOrderLine)
      .where(eq(salesOrderLine.orderId, id))
      .orderBy(asc(salesOrderLine.lineNo));

    const cust = (await tx.select().from(customer).where(eq(customer.id, r.customerId)).limit(1))[0];

    // ONE batched call for every distinct item on the order, not one per line. `getItems`
    // exists on the port precisely so a document can resolve its whole parts list at once.
    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const specs = itemIds.length === 0 ? [] : await this.items.getItems(itemIds);
    const itemById = new Map(specs.map((s) => [s.id, s]));

    // The earliest promise still outstanding — the same rule the list uses, so a manager
    // moving from the list to the order does not see two different dates for one fact.
    let nextPromise: string | null = null;
    for (const l of lines) {
      if (!l.requestedDeliveryDate) continue;
      if (numOf(l.deliveredQty) + 1e-9 >= numOf(l.qty)) continue;
      if (!nextPromise || l.requestedDeliveryDate < nextPromise) nextPromise = l.requestedDeliveryDate;
    }

    return {
      id: r.id,
      soNo: r.soNo,
      customerId: r.customerId,
      customerCode: cust?.code ?? null,
      customerName: cust?.name ?? null,
      custPoNo: r.custPoNo,
      orderDate: r.orderDate,
      requestedDeliveryDate: nextPromise,
      supplierGstin: r.supplierGstin,
      billToGstin: r.billToGstin,
      shipToGstin: r.shipToGstin,
      shipToStateCode: r.shipToStateCode,
      placeOfSupply: r.placeOfSupply,
      isInterState: r.isInterState,
      subtotal: r.subtotal,
      cgstTotal: r.cgstTotal,
      sgstTotal: r.sgstTotal,
      igstTotal: r.igstTotal,
      roundOff: r.roundOff,
      grandTotal: r.grandTotal,
      creditStatus: r.creditStatus,
      creditLimitSnapshot: r.creditLimitSnapshot,
      creditExposureSnapshot: r.creditExposureSnapshot,
      status: r.status,
      lines: lines.map((l) => {
        const spec = itemById.get(l.itemId) ?? null;
        return {
          id: l.id,
          lineNo: l.lineNo,
          itemId: l.itemId,
          itemCode: spec?.itemCode ?? null,
          itemName: spec?.name ?? null,
          // The unit agreed on the line wins over the master's: an order taken in boxes
          // stays in boxes even if Engineering later restates the item in pieces.
          uom: l.uom ?? spec?.uom ?? null,
          qty: l.qty,
          rate: l.rate,
          hsn: l.hsn,
          gstRatePct: l.gstRatePct,
          taxableValue: l.taxableValue,
          cgst: l.cgst,
          sgst: l.sgst,
          igst: l.igst,
          lineTotal: l.lineTotal,
          deliveredQty: l.deliveredQty,
          requestedDeliveryDate: l.requestedDeliveryDate,
        };
      }),
    };
  }

  // =========================================================================
  // CUSTOMER_ORDER_WRITER — taking an order so a mission has something to be about.
  // =========================================================================
  // See `ports/fulfilment-docs.port.ts` for why this is a port and not a service handle.
  // Everything below is ordinary Sales behaviour reached through the ordinary Sales
  // methods: this adapter's whole job is to answer "the usual terms for this part" and
  // then call `createOrder` + `confirmOrder` exactly as the HTTP path does.

  /**
   * The terms this item was last actually sold on.
   *
   * There is no rate card and no HSN master in the MVP — price and tax treatment live on
   * the line — so "the usual terms" can only mean "what the last confirmed line said". A
   * derived answer with a real provenance beats a default, and beats a constant in code by
   * more: a GST rate hard-coded here is precisely what the platform rules forbid.
   */
  private async lastSoldTerms(tx: Tx, itemId: string, customerId: string | null): Promise<
    { rate: number; hsn: string; gstRatePct: number } | null
  > {
    // Prefer what THIS customer last paid — two customers legitimately hold different
    // prices for the same part, and quietly charging one of them the other's price is a
    // commercial error the demo would carry into a real conversation.
    // With no customer in hand (the catalogue list is drawn before one is chosen) there is
    // no customer-scoped pass to make — and passing an empty string into a uuid comparison
    // is a 500, not an empty result.
    for (const scoped of customerId ? [true, false] : [false]) {
      const rows = await tx.select({
        rate: salesOrderLine.rate, hsn: salesOrderLine.hsn, gst: salesOrderLine.gstRatePct,
        orderDate: salesOrder.orderDate, createdAt: salesOrderLine.createdAt,
      })
        .from(salesOrderLine)
        .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.orderId))
        .where(and(
          eq(salesOrderLine.itemId, itemId),
          ne(salesOrder.status, "draft"),
          ne(salesOrder.status, "cancelled"),
          ...(scoped && customerId ? [eq(salesOrder.customerId, customerId)] : []),
        ))
        .orderBy(sql`${salesOrder.orderDate} desc, ${salesOrderLine.createdAt} desc`)
        .limit(1);
      const hit = rows[0];
      if (hit) return { rate: Number(hit.rate), hsn: String(hit.hsn), gstRatePct: Number(hit.gst) };
    }
    return null;
  }

  /**
   * Which of the tenant's registrations is selling.
   *
   * Taken from the most recent order rather than from a config flag, because the tenant has
   * two GSTINs and the one that has been selling is a fact already in the data. Falls back
   * to the first registration for a tenant that has never sold anything.
   */
  private async sellingGstin(tx: Tx): Promise<string> {
    const recent = await tx.select({ gstin: salesOrder.supplierGstin })
      .from(salesOrder).orderBy(sql`${salesOrder.orderDate} desc`).limit(1);
    if (recent[0]?.gstin) return String(recent[0].gstin);
    const reg = await tx.select({ gstin: gstRegistration.gstin })
      .from(gstRegistration).orderBy(asc(gstRegistration.gstin)).limit(1);
    if (!reg[0]) {
      throw new AppError("NO_GST_REGISTRATION", 409,
        "This company has no GST registration, so it cannot raise a sales order.");
    }
    return String(reg[0].gstin);
  }

  /** The warehouse a dispatch would come out of. An order with no source cannot ship. */
  private async finishedGoodsWarehouse(tx: Tx): Promise<string | undefined> {
    const recent = await tx.select({ id: salesOrder.fgWarehouseId })
      .from(salesOrder)
      .where(sql`${salesOrder.fgWarehouseId} is not null`)
      .orderBy(sql`${salesOrder.orderDate} desc`).limit(1);
    if (recent[0]?.id) return String(recent[0].id);
    const wh = await tx.select({ id: warehouse.id })
      .from(warehouse).where(eq(warehouse.code, "WH-FG")).limit(1);
    return wh[0]?.id ? String(wh[0].id) : undefined;
  }

  async createConfirmedOrder(
    input: CreateFulfilmentCustomerOrderInput,
    idempotencyKey: string,
  ): Promise<CreatedCustomerOrder> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "an order needs at least one line" }]);
    }

    // READ first, in one transaction, and finish with it before calling createOrder — which
    // opens its own. See the transaction note on the port.
    const resolved = await withTenant(async (tx) => {
      const gstin = await this.sellingGstin(tx);
      const fgWarehouseId = await this.finishedGoodsWarehouse(tx);
      const lines = [];
      for (const line of input.lines) {
        const spec = await this.items.getItem(line.itemId);
        if (!spec) {
          throw new AppError("ITEM_NOT_FOUND", 404, `No item ${line.itemId} in the master.`);
        }
        const supplied = line.rate !== undefined && line.hsn !== undefined && line.gstRatePct !== undefined;
        const terms = supplied
          ? { rate: line.rate as number, hsn: line.hsn as string, gstRatePct: line.gstRatePct as number }
          : await this.lastSoldTerms(tx, line.itemId, input.customerId);
        if (!terms) {
          throw new AppError("NO_TERMS_FOR_ITEM", 422,
            `${spec.itemCode} has never been sold, so there is no price or GST rate to carry forward. `
            + "Supply a rate, an HSN code and a GST rate on the line.");
        }
        lines.push({
          itemId: line.itemId,
          qty: line.qty,
          rate: terms.rate,
          hsn: terms.hsn,
          gstRatePct: terms.gstRatePct,
          uom: spec.uom,
          requestedDeliveryDate: line.requestedDeliveryDate,
        });
      }
      return { gstin, fgWarehouseId, lines };
    });

    const order = await this.createOrder({
      customerId: input.customerId,
      custPoNo: input.custPoNo,
      supplierGstin: resolved.gstin,
      fgWarehouseId: resolved.fgWarehouseId,
      lines: resolved.lines,
    }, `${idempotencyKey}-create`);

    // The credit gate is real and is allowed to stop this. Report where the order actually
    // landed rather than asserting a confirmation that did not happen.
    let status = order.status;
    try {
      const confirmed = await this.confirmOrder(order.id, `${idempotencyKey}-confirm`);
      status = confirmed.status;
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      status = order.status;
    }

    return {
      id: order.id,
      soNo: order.soNo,
      status,
      lines: resolved.lines.map((l) => ({
        itemId: l.itemId, qty: l.qty, rate: l.rate, hsn: l.hsn, gstRatePct: l.gstRatePct,
      })),
      grandTotal: Number(order.grandTotal),
    };
  }

  async listOrderableCustomers(): Promise<Array<{ id: string; code: string; name: string }>> {
    return withTenant(async (tx) => {
      const rows = await tx.select({ id: customer.id, code: customer.code, name: customer.name })
        .from(customer).where(eq(customer.isActive, true)).orderBy(asc(customer.name));
      return rows.map((r) => ({ id: String(r.id), code: String(r.code), name: String(r.name) }));
    });
  }

  async listSellableItems(): Promise<Array<{
    id: string; itemCode: string; name: string; uom: string;
    lastRate: number | null; lastHsn: string | null; lastGstRatePct: number | null;
  }>> {
    return withTenant(async (tx) => {
      const rows = await tx.select({
        id: itemTable.id, itemCode: itemTable.itemCode, name: itemTable.name, uom: itemTable.uom,
      })
        .from(itemTable)
        .where(and(eq(itemTable.isSellable, true), eq(itemTable.isActive, true)))
        .orderBy(asc(itemTable.itemCode));

      const out = [];
      for (const r of rows) {
        // Scoped to nobody in particular: this list is drawn before a customer is chosen,
        // so it shows the last price ANY customer paid. The order itself re-derives per
        // customer, and may therefore land on a different figure — which is correct.
        const terms = await this.lastSoldTerms(tx, String(r.id), null);
        out.push({
          id: String(r.id), itemCode: String(r.itemCode), name: String(r.name), uom: String(r.uom),
          lastRate: terms?.rate ?? null,
          lastHsn: terms?.hsn ?? null,
          lastGstRatePct: terms?.gstRatePct ?? null,
        });
      }
      return out;
    });
  }
}
