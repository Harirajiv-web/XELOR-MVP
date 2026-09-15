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
import { summarizeSupplierEvidence } from "../../common/supplier-performance.js";
export { summarizeSupplierEvidence } from "../../common/supplier-performance.js";
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
