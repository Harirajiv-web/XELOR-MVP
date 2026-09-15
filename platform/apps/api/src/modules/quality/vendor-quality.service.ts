import { Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import { currentTenant } from "@ind-core/platform";
import type { VendorInspectionEvidence, VendorQualityEvidence } from "../../ports/vendor-quality.port.js";

@Injectable()
export class VendorQualityService implements VendorQualityEvidence {
  async completedForReceipts(receiptIds: readonly string[]): Promise<VendorInspectionEvidence[]> {
    if (!receiptIds.length) return [];
    const { tenantId } = currentTenant();
    const t = schema.qmsInspection;
    return withTenant(async (tx) => {
      const rows = await tx.select({ tenantId: t.tenantId, id: t.id, inspectionNo: t.inspectionNo, receiptId: t.refId, itemId: t.itemRef, acceptedQty: t.qtyAccepted, rejectedQty: t.qtyRejected })
        .from(t).where(and(eq(t.tenantId, tenantId), eq(t.refType, "grn"), eq(t.inspectionType, "incoming"), eq(t.status, "completed"), inArray(t.refId, [...receiptIds])));
      return rows.filter((row): row is VendorInspectionEvidence => row.receiptId !== null);
    });
  }
}
