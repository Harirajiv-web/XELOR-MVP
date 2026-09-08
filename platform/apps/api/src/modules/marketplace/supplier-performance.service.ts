import { Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { Errors } from "@ind-core/platform";

const {
  networkSupplier,
  purchaseOrder,
  purchaseOrderLine,
  grn,
  grnLine,
  qmsInspection,
} = schema;
const percent = (n: number, d: number): number | null =>
  d ? Math.round((n / d) * 10000) / 100 : null;
export function summarizeSupplierEvidence(
  orders: {
    id: string;
    poNo: string;
    expectedDate: Date | null;
    status: string;
  }[],
  receipts: { id: string; poId: string; grnDate: Date }[],
  receiptLines: { grnId: string; qty: string }[],
  inspections: {
    refId: string | null;
    qtyAccepted: string | null;
    qtyRejected: string | null;
  }[],
) {
  const evidence = orders.map((order) => {
    const own = receipts.filter((r) => r.poId === order.id);
    const dates = own.map((r) => r.grnDate.toISOString()).sort();
    const receiptIds = new Set(own.map((r) => r.id));
    return {
      poNo: order.poNo,
      expectedDate: order.expectedDate?.toISOString() ?? null,
      lastReceiptDate: dates.at(-1) ?? null,
      receivedQty: receiptLines
        .filter((l) => receiptIds.has(l.grnId))
        .reduce((n, l) => n + Number(l.qty), 0),
      status: order.status,
    };
  });
  const measurable = evidence.filter(
    (e) => e.status === "received" && e.expectedDate && e.lastReceiptDate,
  );
  const onTime = measurable.filter(
    (e) => e.lastReceiptDate!.slice(0, 10) <= e.expectedDate!.slice(0, 10),
  ).length;
  const receivedQty = receiptLines.reduce((n, l) => n + Number(l.qty), 0);
  const acceptedQty = inspections.reduce(
    (n, i) => n + Number(i.qtyAccepted ?? 0),
    0,
  );
  const rejectedQty = inspections.reduce(
    (n, i) => n + Number(i.qtyRejected ?? 0),
    0,
  );
  return {
    evidenceStatus:
      receipts.length || inspections.length
        ? ("measured" as const)
        : ("unknown" as const),
    orders: orders.length,
    completedOrders: orders.filter((o) => o.status === "received").length,
    deliverySampleSize: measurable.length,
    onTimeDeliveries: onTime,
    onTimeRate: percent(onTime, measurable.length),
    receivedQty,
    inspectedQty: acceptedQty + rejectedQty,
    acceptedQty,
    rejectedQty,
    rejectionRate: percent(rejectedQty, acceptedQty + rejectedQty),
    inspectionSampleSize: inspections.length,
    evidence,
    method:
      "On-time rate uses completed purchase orders with both a promised date and a posted receipt. Quality rates use completed incoming GRN inspections. Missing evidence stays unknown; receipt quantities can span different units and must not be treated as a quality denominator.",
  };
}
@Injectable()
export class SupplierPerformanceService {
  async get(id: string) {
    return withTenant(async (tx) => {
      const [supplier] = await tx
        .select()
        .from(networkSupplier)
        .where(eq(networkSupplier.id, id))
        .limit(1);
      if (!supplier) throw Errors.notFound(`supplier '${id}'`);
      const orders = supplier.vendorId
        ? await tx
            .select()
            .from(purchaseOrder)
            .where(eq(purchaseOrder.vendorId, supplier.vendorId))
        : [];
      const receipts = supplier.vendorId
        ? await tx
            .select()
            .from(grn)
            .where(
              and(
                eq(grn.vendorId, supplier.vendorId),
                eq(grn.status, "posted"),
              ),
            )
        : [];
      const ids = receipts.map((r) => r.id);
      const lines = ids.length
        ? await tx.select().from(grnLine).where(inArray(grnLine.grnId, ids))
        : [];
      const inspections = ids.length
        ? await tx
            .select()
            .from(qmsInspection)
            .where(
              and(
                eq(qmsInspection.refType, "grn"),
                inArray(qmsInspection.refId, ids),
                eq(qmsInspection.status, "completed"),
              ),
            )
        : [];
      // Include part-level receipt evidence so mixed units are never silently combined into a score.
      const poLines = orders.length
        ? await tx
            .select()
            .from(purchaseOrderLine)
            .where(
              inArray(
                purchaseOrderLine.poId,
                orders.map((o) => o.id),
              ),
            )
        : [];
      return {
        supplierId: id,
        vendorId: supplier.vendorId,
        ...summarizeSupplierEvidence(orders, receipts, lines, inspections),
        materials: [...new Set(poLines.map((l) => l.itemId))].map((itemId) => ({
          itemId,
          orderedQty: poLines
            .filter((l) => l.itemId === itemId)
            .reduce((n, l) => n + Number(l.qty), 0),
          receivedQty: lines
            .filter((l) => l.itemId === itemId)
            .reduce((n, l) => n + Number(l.qty), 0),
        })),
      };
    });
  }
}
