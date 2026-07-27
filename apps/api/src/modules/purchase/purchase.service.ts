import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  encodeCursor,
  decodeCursor,
  detectDuplicates,
  AppError,
  Errors,
  type DuplicateMatch,
  type MasterRecord,
  type CursorPage,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { NumberingService, fyCode } from "../../common/numbering.service.js";
import type { SupplySource, OpenSupplyLine } from "../../ports/planning-inputs.port.js";
import { DedupExplainer } from "../../ai/dedup-explainer.js";
import {
  WORKFLOW_EXECUTOR,
  type WorkflowExecutor,
  type WorkflowInstanceView,
} from "../../ports/workflow.port.js";
import { STOCK_POSTER, type StockPoster } from "../../ports/stock.port.js";

// `item` is ENGINEERING's table, read here only to put a code and a unit on a PO line. A
// read-only join across a logical reference — no FK is declared and none is implied (§1.1);
// Purchase still never writes it.
const { vendor, purchaseOrder, purchaseOrderLine, grn, grnLine, item, outboxEvent } = schema;

export interface CreateVendorInput {
  code: string;
  name: string;
  gstin?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  paymentTerms?: string;
}
export interface VendorRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  createdAt: string;
}
export type CreateVendorResult =
  | { outcome: "created"; vendor: VendorRow }
  | {
      outcome: "duplicate_suspected";
      candidate: MasterRecord;
      matches: DuplicateMatch[];
      explanation: string;
      degraded: boolean;
    };

export interface CreatePoLineInput {
  itemId: string;
  qty: number;
  rate: number;
}
export interface CreatePoInput {
  vendorId: string;
  expectedDate?: string;
  currency?: string;
  remarks?: string;
  lines: CreatePoLineInput[];
}
export interface PoLineView {
  id: string;
  lineNo: number;
  itemId: string;
  /**
   * The item as a human reads it. `item_id` alone is an internal reference, and a purchase
   * order line that cannot say WHAT is being ordered is not a purchase order line — it is a
   * price against a uuid. Null only if the referenced item has gone (see the left join).
   */
  itemCode: string | null;
  itemName: string | null;
  /** So the quantity can be printed with its unit, as every other quantity in the product is. */
  uom: string | null;
  qty: string;
  rate: string;
  amount: string;
  receivedQty: string;
}
export interface PoView {
  id: string;
  poNo: string;
  vendorId: string;
  vendorName: string;
  status: string;
  poDate: string;
  expectedDate: string | null;
  currency: string;
  totalAmount: string;
  workflowInstanceId: string | null;
  lines: PoLineView[];
}
export interface PoSummary {
  id: string;
  poNo: string;
  vendorId: string;
  /**
   * The vendor as a human reads it, carried ON the summary.
   *
   * A list screen that has to call the vendor master to render a name couples two modules
   * for the sake of a string, doubles the requests, and fails awkwardly for a user who may
   * read orders but not vendors. The join belongs here, once, in the module that owns both
   * tables.
   */
  vendorCode: string;
  vendorName: string;
  status: string;
  /**
   * When the vendor promised it. Without this the list cannot say what is LATE, which is
   * half the reason a buyer opens it — and "late" derived from the created date would be a
   * confident wrong answer.
   */
  expectedDate: string | null;
  totalAmount: string;
  createdAt: string;
}
export interface PoActionResult {
  po: PoView;
  workflow: WorkflowInstanceView;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface CreateGrnLineInput {
  poLineId: string;
  qty: number;
  batch?: string;
}
export interface CreateGrnInput {
  poId: string;
  warehouseId: string;
  grnDate?: string;
  lines: CreateGrnLineInput[];
}
export interface GrnLineView {
  lineNo: number;
  poLineId: string;
  itemId: string;
  qty: string;
  batch: string;
}
export interface GrnView {
  id: string;
  grnNo: string;
  poId: string;
  poNo: string;
  vendorId: string;
  warehouseId: string;
  grnDate: string;
  status: string;
  poStatus: string; // the PO's status after this receipt
  lines: GrnLineView[];
  stockMovements?: Array<{ itemId: string; warehouseId: string; delta: number; balanceAfter: number }>;
}

/**
 * PURCHASE — vendor master (this file), plus purchase orders and goods receipts (added
 * alongside). Vendor creation reuses the shared master-dedup brain exactly like GENERAL
 * companies and ENGINEERING items: draft a duplicate concern for a human, then write in
 * one tenant-fenced transaction with hash-chained audit + outbox event.
 */
@Injectable()
export class PurchaseService implements SupplySource {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly dedup: DedupExplainer,
    @Inject(WORKFLOW_EXECUTOR) private readonly wf: WorkflowExecutor,
    @Inject(STOCK_POSTER) private readonly stock: StockPoster,
  ) {}

  async createVendor(
    input: CreateVendorInput,
    idempotencyKey: string,
    acknowledgeDuplicates = false,
  ): Promise<CreateVendorResult> {
    if (!acknowledgeDuplicates) {
      const { candidate, matches } = await this.findDuplicateVendors(input);
      if (matches.length > 0) {
        const { text, degraded } = await this.dedup.explain({
          candidate,
          matches,
          fieldLabels: { gstin: "GSTIN", cin: "vendor code", legal_name: "name" },
        });
        return { outcome: "duplicate_suspected", candidate, matches, explanation: text, degraded };
      }
    }
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doCreateVendor(input),
    }));
    return { outcome: "created", vendor: result.body };
  }

  /** A vendor maps onto MasterRecord as { name, gstin, code }. */
  private async findDuplicateVendors(
    input: CreateVendorInput,
  ): Promise<{ candidate: MasterRecord; matches: DuplicateMatch[] }> {
    const candidate: MasterRecord = {
      legalName: input.name,
      gstin: input.gstin ?? null,
      cin: input.code,
    };
    const rows = await withTenant(async (tx) => {
      const res = await tx.execute<{ id: string; code: string; name: string; gstin: string | null }>(sql`
        select id, code, name, gstin from vendor
        where is_active = true
          and ( code = ${input.code}
                or (${input.gstin ?? null}::text is not null and gstin = ${input.gstin ?? null})
                or similarity(name, ${input.name}) > 0.3 )
        limit 25
      `);
      return res.rows;
    });
    const existing: MasterRecord[] = rows.map((r) => ({
      id: r.id,
      legalName: r.name,
      gstin: r.gstin,
      cin: r.code,
    }));
    return { candidate, matches: detectDuplicates(candidate, existing) };
  }

  private async doCreateVendor(input: CreateVendorInput): Promise<VendorRow> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(vendor).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        code: input.code,
        name: input.name,
        gstin: input.gstin ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        address: input.address ?? null,
        paymentTerms: input.paymentTerms ?? null,
      });
      await this.audit.appendInTx(tx, {
        action: "purchase.vendor.created",
        entityType: "vendor",
        entityId: id,
        data: { code: input.code, name: input.name },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("purchase", "vendor", "created"),
        payload: { id, code: input.code, name: input.name },
        createdAt: now,
      });
      return { id, code: input.code, name: input.name, gstin: input.gstin ?? null, createdAt: now.toISOString() };
    });
  }

  async listVendors(limit: number, cursor?: string): Promise<CursorPage<VendorRow>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({ id: vendor.id, code: vendor.code, name: vendor.name, gstin: vendor.gstin, createdAt: vendor.createdAt })
        .from(vendor)
        .where(
          keyset
            ? and(
                eq(vendor.isActive, true),
                or(
                  gt(vendor.createdAt, new Date(keyset.createdAt)),
                  and(eq(vendor.createdAt, new Date(keyset.createdAt)), gt(vendor.id, keyset.id)),
                ),
              )
            : eq(vendor.isActive, true),
        )
        .orderBy(asc(vendor.createdAt), asc(vendor.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null;
      return {
        items: page.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          gstin: r.gstin,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor,
      };
    });
  }

  // ---- Purchase orders ----

  async createPo(input: CreatePoInput, idempotencyKey: string): Promise<PoView> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "a purchase order needs at least one line" }]);
    }
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doCreatePo(input),
    }));
    return result.body;
  }

  private async doCreatePo(input: CreatePoInput): Promise<PoView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const [v] = await tx.select({ id: vendor.id }).from(vendor).where(eq(vendor.id, input.vendorId)).limit(1);
      if (!v) throw Errors.notFound(`vendor '${input.vendorId}'`);

      const id = newId();
      const poNo = await this.numbering.next(tx, "purchase_order", fyCode(now.toISOString()));
      let total = 0;
      const lines = input.lines.map((l, i) => {
        const amount = round2(l.qty * l.rate);
        total += amount;
        return {
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          poId: id,
          lineNo: i + 1,
          itemId: l.itemId,
          qty: l.qty.toFixed(3),
          rate: l.rate.toFixed(2),
          amount: amount.toFixed(2),
        };
      });
      await tx.insert(purchaseOrder).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        poNo,
        vendorId: input.vendorId,
        status: "draft",
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        currency: input.currency ?? "INR",
        totalAmount: round2(total).toFixed(2),
        remarks: input.remarks ?? null,
      });
      await tx.insert(purchaseOrderLine).values(lines);
      await this.audit.appendInTx(tx, {
        action: "purchase.po.created",
        entityType: "purchase_order",
        entityId: id,
        data: { poNo, vendorId: input.vendorId, total: round2(total).toFixed(2) },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("purchase", "po", "created"),
        payload: { id, poNo },
        createdAt: now,
      });
      return this.viewPoInTx(tx, id);
    });
  }

  /** Submit a draft PO into the W1 approval engine (po_approval: stores → admin). */
  async submitPo(poId: string, idempotencyKey: string): Promise<PoActionResult> {
    const { actorId, tenantId } = currentTenant();
    const before = await withTenant((tx) => this.loadPo(tx, poId));
    if (before.status !== "draft") {
      throw new AppError("PO_NOT_DRAFT", 409, `PO is ${before.status}; only a draft can be submitted.`);
    }
    // Start the approval instance (idempotent on the key) — runs in its own transaction.
    const instance = await this.wf.start(
      { definitionCode: "po_approval", subjectType: "purchase_order", subjectId: poId },
      idempotencyKey,
    );
    const po = await withTenant(async (tx) => {
      await tx
        .update(purchaseOrder)
        .set({ status: "pending_approval", workflowInstanceId: instance.id, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(purchaseOrder.id, poId));
      await this.audit.appendInTx(tx, {
        action: "purchase.po.submitted",
        entityType: "purchase_order",
        entityId: poId,
        data: { workflowInstanceId: instance.id },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("purchase", "po", "submitted"),
        payload: { id: poId, workflowInstanceId: instance.id },
        createdAt: new Date(),
      });
      return this.viewPoInTx(tx, poId);
    });
    return { po, workflow: instance };
  }

  /**
   * Approve or reject the PO's current approval step. The decision is delegated to the
   * W1 engine, which enforces that the actor is the right approver for the step; the PO
   * status is then synced from the workflow outcome (approved only when the final step
   * signs off).
   */
  async actOnPo(
    poId: string,
    decision: "approve" | "reject",
    comment: string | undefined,
  ): Promise<PoActionResult> {
    const { actorId, tenantId } = currentTenant();
    const before = await withTenant((tx) => this.loadPo(tx, poId));
    if (!before.workflowInstanceId || before.status !== "pending_approval") {
      throw new AppError("PO_NOT_PENDING", 409, `PO is ${before.status}, not awaiting approval.`);
    }
    // Delegate to W1 — it verifies the approver and advances/finishes the instance.
    const instance = await this.wf.act(before.workflowInstanceId, decision, comment);
    const nextStatus =
      instance.status === "approved" ? "approved" : instance.status === "rejected" ? "rejected" : "pending_approval";

    const po = await withTenant(async (tx) => {
      if (nextStatus !== before.status) {
        await tx
          .update(purchaseOrder)
          .set({ status: nextStatus, updatedBy: actorId, updatedAt: new Date() })
          .where(eq(purchaseOrder.id, poId));
        if (nextStatus === "approved" || nextStatus === "rejected") {
          await this.audit.appendInTx(tx, {
            action: `purchase.po.${nextStatus}`,
            entityType: "purchase_order",
            entityId: poId,
            data: { workflowInstanceId: before.workflowInstanceId },
          });
          await tx.insert(outboxEvent).values({
            id: newId(),
            tenantId,
            name: eventName("purchase", "po", nextStatus),
            payload: { id: poId },
            createdAt: new Date(),
          });
        }
      }
      return this.viewPoInTx(tx, poId);
    });
    return { po, workflow: instance };
  }

  // ---- SupplySource port (read by PLANNING) ----

  /**
   * Purchase orders that are approved and not yet fully received.
   *
   * Planning treats every row here as FACT at the date it carries and will never redate
   * one — a purchase order is a commitment a buyer made to a supplier, and moving it is a
   * phone call, not a database write. Where the plan disagrees with the date, Planning
   * raises a reschedule exception for a human to act on (FR-PLN-024).
   *
   * Draft and pending-approval orders are excluded: nobody has promised to supply them.
   * Counting them as incoming stock is how a plant discovers in week four that the order
   * it was relying on was never actually placed.
   */
  async openSupply(): Promise<OpenSupplyLine[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({
          itemId: purchaseOrderLine.itemId,
          qty: purchaseOrderLine.qty,
          receivedQty: purchaseOrderLine.receivedQty,
          poNo: purchaseOrder.poNo,
          expectedDate: purchaseOrder.expectedDate,
        })
        .from(purchaseOrderLine)
        .innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.poId))
        .where(
          and(
            inArray(purchaseOrder.status, ["approved", "partially_received"]),
            eq(purchaseOrderLine.isActive, true),
            sql`${purchaseOrderLine.qty} > ${purchaseOrderLine.receivedQty}`,
          ),
        )
        .orderBy(asc(purchaseOrder.poNo));

      return rows.map((r) => ({
        itemId: r.itemId,
        qty: Number(r.qty) - Number(r.receivedQty),
        dueDate: r.expectedDate ? r.expectedDate.toISOString().slice(0, 10) : null,
        ref: r.poNo,
        kind: "purchase_order" as const,
      }));
    });
  }

  async getPo(poId: string): Promise<PoView> {
    return withTenant((tx) => this.viewPoInTx(tx, poId));
  }

  async listPos(limit: number, cursor?: string): Promise<CursorPage<PoSummary>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({
          id: purchaseOrder.id,
          poNo: purchaseOrder.poNo,
          vendorId: purchaseOrder.vendorId,
          vendorCode: vendor.code,
          vendorName: vendor.name,
          status: purchaseOrder.status,
          expectedDate: purchaseOrder.expectedDate,
          totalAmount: purchaseOrder.totalAmount,
          createdAt: purchaseOrder.createdAt,
        })
        .from(purchaseOrder)
        // INNER, not left: a purchase order without a vendor is not a thing this system can
        // create, and vendors are never hard-deleted (§5.1), so a missing row would mean the
        // order is corrupt rather than merely unlabelled.
        .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
        .where(
          keyset
            ? and(
                eq(purchaseOrder.isActive, true),
                or(
                  gt(purchaseOrder.createdAt, new Date(keyset.createdAt)),
                  and(eq(purchaseOrder.createdAt, new Date(keyset.createdAt)), gt(purchaseOrder.id, keyset.id)),
                ),
              )
            : eq(purchaseOrder.isActive, true),
        )
        .orderBy(asc(purchaseOrder.createdAt), asc(purchaseOrder.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null;
      return {
        items: page.map((r) => ({
          id: r.id,
          poNo: r.poNo,
          vendorId: r.vendorId,
          vendorCode: r.vendorCode,
          vendorName: r.vendorName,
          status: r.status,
          expectedDate: r.expectedDate ? r.expectedDate.toISOString() : null,
          totalAmount: r.totalAmount,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor,
      };
    });
  }

  // ---- Goods receipts (GRN) ----

  async createGrn(input: CreateGrnInput, idempotencyKey: string): Promise<GrnView> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "a goods receipt needs at least one line" }]);
    }
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doCreateGrn(input),
    }));
    return result.body;
  }

  /**
   * Receive goods against an approved PO. The stock receipt is posted through Inventory's
   * STOCK_POSTER port IN THIS SAME TRANSACTION, so the GRN doc, the PO line received-qty
   * updates, and the stock ledger commit atomically (§5.5/§5.6). No over-receipt.
   */
  private async doCreateGrn(input: CreateGrnInput): Promise<GrnView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const [po] = await tx
        .select({ id: purchaseOrder.id, poNo: purchaseOrder.poNo, status: purchaseOrder.status, vendorId: purchaseOrder.vendorId })
        .from(purchaseOrder)
        .where(eq(purchaseOrder.id, input.poId))
        .limit(1);
      if (!po) throw Errors.notFound("purchase order");
      if (po.status !== "approved" && po.status !== "partially_received") {
        throw new AppError("PO_NOT_RECEIVABLE", 409, `PO is ${po.status}; only an approved PO can be received.`);
      }

      const poLines = await tx
        .select({ id: purchaseOrderLine.id, itemId: purchaseOrderLine.itemId, qty: purchaseOrderLine.qty, receivedQty: purchaseOrderLine.receivedQty })
        .from(purchaseOrderLine)
        .where(eq(purchaseOrderLine.poId, input.poId));
      const byId = new Map(poLines.map((l) => [l.id, l]));

      // Validate every GRN line against its PO line (belongs to the PO; no over-receipt).
      const stockLines: Array<{ itemId: string; toWarehouseId: string; qty: number; batch: string }> = [];
      const grnLinesData: Array<{ poLineId: string; itemId: string; qty: number; batch: string }> = [];
      input.lines.forEach((l, i) => {
        const pl = byId.get(l.poLineId);
        if (!pl) throw new AppError("GRN_LINE_INVALID", 422, `line ${i + 1}: poLineId is not on this PO`);
        const remaining = Number(pl.qty) - Number(pl.receivedQty);
        if (l.qty > remaining + 1e-9) {
          throw new AppError("OVER_RECEIPT", 422, `line ${i + 1}: receiving ${l.qty} exceeds remaining ${remaining}`);
        }
        const batch = l.batch ?? "";
        stockLines.push({ itemId: pl.itemId, toWarehouseId: input.warehouseId, qty: l.qty, batch });
        grnLinesData.push({ poLineId: l.poLineId, itemId: pl.itemId, qty: l.qty, batch });
      });

      // ATOMIC stock write — Inventory's single write path, inside this GRN transaction.
      const post = await this.stock.postInTx(tx, { entryType: "receipt", remarks: "GRN", lines: stockLines });

      const grnId = newId();
      const grnDate = input.grnDate ? new Date(input.grnDate) : now;
      // The GRN's own date decides its series — goods received on 31 March belong to that
      // year even when the paperwork is keyed on 2 April.
      const grnNo = await this.numbering.next(tx, "goods_receipt", fyCode(grnDate.toISOString()));
      await tx.insert(grn).values({
        id: grnId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        grnNo,
        poId: input.poId,
        vendorId: po.vendorId,
        warehouseId: input.warehouseId,
        grnDate,
        status: "posted",
      });
      await tx.insert(grnLine).values(
        grnLinesData.map((g, i) => ({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          grnId,
          lineNo: i + 1,
          poLineId: g.poLineId,
          itemId: g.itemId,
          qty: g.qty.toFixed(3),
          batch: g.batch,
        })),
      );

      // Bump received_qty on each PO line, then recompute the PO status.
      let allReceived = true;
      for (const pl of poLines) {
        const recvThis = input.lines.filter((x) => x.poLineId === pl.id).reduce((s, x) => s + x.qty, 0);
        const newReceived = Number(pl.receivedQty) + recvThis;
        if (recvThis > 0) {
          await tx
            .update(purchaseOrderLine)
            .set({ receivedQty: newReceived.toFixed(3), updatedBy: actorId, updatedAt: now })
            .where(eq(purchaseOrderLine.id, pl.id));
        }
        if (newReceived + 1e-9 < Number(pl.qty)) allReceived = false;
      }
      const poStatus = allReceived ? "received" : "partially_received";
      await tx
        .update(purchaseOrder)
        .set({ status: poStatus, updatedBy: actorId, updatedAt: now })
        .where(eq(purchaseOrder.id, input.poId));

      await this.audit.appendInTx(tx, {
        action: "purchase.grn.created",
        entityType: "grn",
        entityId: grnId,
        data: { grnNo, poId: input.poId, poStatus, lines: grnLinesData.length },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("purchase", "grn", "created"),
        payload: { id: grnId, grnNo, poId: input.poId },
        createdAt: now,
      });

      return {
        id: grnId,
        grnNo,
        poId: input.poId,
        poNo: po.poNo,
        vendorId: po.vendorId,
        warehouseId: input.warehouseId,
        grnDate: grnDate.toISOString(),
        status: "posted",
        poStatus,
        lines: grnLinesData.map((g, i) => ({
          lineNo: i + 1,
          poLineId: g.poLineId,
          itemId: g.itemId,
          qty: g.qty.toFixed(3),
          batch: g.batch,
        })),
        stockMovements: post.movements.map((m) => ({
          itemId: m.itemId,
          warehouseId: m.warehouseId,
          delta: m.delta,
          balanceAfter: m.balanceAfter,
        })),
      };
    });
  }

  async getGrn(grnId: string): Promise<GrnView> {
    return withTenant(async (tx) => {
      const [g] = await tx
        .select({
          id: grn.id,
          grnNo: grn.grnNo,
          poId: grn.poId,
          poNo: purchaseOrder.poNo,
          poStatus: purchaseOrder.status,
          vendorId: grn.vendorId,
          warehouseId: grn.warehouseId,
          grnDate: grn.grnDate,
          status: grn.status,
        })
        .from(grn)
        .innerJoin(purchaseOrder, eq(purchaseOrder.id, grn.poId))
        .where(eq(grn.id, grnId))
        .limit(1);
      if (!g) throw Errors.notFound("GRN");
      const lines = await tx
        .select({
          lineNo: grnLine.lineNo,
          poLineId: grnLine.poLineId,
          itemId: grnLine.itemId,
          qty: grnLine.qty,
          batch: grnLine.batch,
        })
        .from(grnLine)
        .where(eq(grnLine.grnId, grnId))
        .orderBy(asc(grnLine.lineNo));
      return { ...g, grnDate: g.grnDate.toISOString(), lines };
    });
  }

  private async loadPo(
    tx: Tx,
    poId: string,
  ): Promise<{ id: string; status: string; workflowInstanceId: string | null }> {
    const [po] = await tx
      .select({ id: purchaseOrder.id, status: purchaseOrder.status, workflowInstanceId: purchaseOrder.workflowInstanceId })
      .from(purchaseOrder)
      .where(eq(purchaseOrder.id, poId))
      .limit(1);
    if (!po) throw Errors.notFound("purchase order");
    return po;
  }

  private async viewPoInTx(tx: Tx, poId: string): Promise<PoView> {
    const [po] = await tx
      .select({
        id: purchaseOrder.id,
        poNo: purchaseOrder.poNo,
        vendorId: purchaseOrder.vendorId,
        vendorName: vendor.name,
        status: purchaseOrder.status,
        poDate: purchaseOrder.poDate,
        expectedDate: purchaseOrder.expectedDate,
        currency: purchaseOrder.currency,
        totalAmount: purchaseOrder.totalAmount,
        workflowInstanceId: purchaseOrder.workflowInstanceId,
      })
      .from(purchaseOrder)
      .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
      .where(eq(purchaseOrder.id, poId))
      .limit(1);
    if (!po) throw Errors.notFound("purchase order");
    const lines = await tx
      .select({
        id: purchaseOrderLine.id,
        lineNo: purchaseOrderLine.lineNo,
        itemId: purchaseOrderLine.itemId,
        itemCode: item.itemCode,
        itemName: item.name,
        uom: item.uom,
        qty: purchaseOrderLine.qty,
        rate: purchaseOrderLine.rate,
        amount: purchaseOrderLine.amount,
        receivedQty: purchaseOrderLine.receivedQty,
      })
      .from(purchaseOrderLine)
      // LEFT, deliberately. `item_id` is a cross-module LOGICAL reference with no foreign
      // key (§1.1), so nothing at the database level guarantees the item still exists. An
      // inner join would silently DROP a line from a financial document — an order whose
      // total no longer matches its lines — where a left join loses only the label.
      .leftJoin(item, eq(item.id, purchaseOrderLine.itemId))
      .where(eq(purchaseOrderLine.poId, poId))
      .orderBy(asc(purchaseOrderLine.lineNo));
    return {
      ...po,
      poDate: po.poDate.toISOString(),
      expectedDate: po.expectedDate ? po.expectedDate.toISOString() : null,
      lines,
    };
  }
}
