import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
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
import { DedupExplainer } from "../../ai/dedup-explainer.js";
import {
  WORKFLOW_EXECUTOR,
  type WorkflowExecutor,
  type WorkflowInstanceView,
} from "../../ports/workflow.port.js";

const { vendor, purchaseOrder, purchaseOrderLine, outboxEvent } = schema;

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
  lineNo: number;
  itemId: string;
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
  status: string;
  totalAmount: string;
  createdAt: string;
}
export interface PoActionResult {
  po: PoView;
  workflow: WorkflowInstanceView;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * PURCHASE — vendor master (this file), plus purchase orders and goods receipts (added
 * alongside). Vendor creation reuses the shared master-dedup brain exactly like GENERAL
 * companies and ENGINEERING items: draft a duplicate concern for a human, then write in
 * one tenant-fenced transaction with hash-chained audit + outbox event.
 */
@Injectable()
export class PurchaseService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly dedup: DedupExplainer,
    @Inject(WORKFLOW_EXECUTOR) private readonly wf: WorkflowExecutor,
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
      // Use the RANDOM tail of the UUIDv7 (its high bits are a shared ms timestamp, so
      // POs created moments apart would collide on the first hex chars).
      const poNo = `PO-${(id.split("-").pop() ?? id).toUpperCase()}`;
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
          status: purchaseOrder.status,
          totalAmount: purchaseOrder.totalAmount,
          createdAt: purchaseOrder.createdAt,
        })
        .from(purchaseOrder)
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
          status: r.status,
          totalAmount: r.totalAmount,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor,
      };
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
        lineNo: purchaseOrderLine.lineNo,
        itemId: purchaseOrderLine.itemId,
        qty: purchaseOrderLine.qty,
        rate: purchaseOrderLine.rate,
        amount: purchaseOrderLine.amount,
        receivedQty: purchaseOrderLine.receivedQty,
      })
      .from(purchaseOrderLine)
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
