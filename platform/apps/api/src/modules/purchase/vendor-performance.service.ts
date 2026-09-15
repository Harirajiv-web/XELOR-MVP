import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import { currentTenant, Errors } from "@ind-core/platform";
import { ITEM_PROVIDER, type ItemProvider } from "../../ports/item.port.js";
import { VENDOR_QUALITY_EVIDENCE, type VendorQualityEvidence } from "../../ports/vendor-quality.port.js";
import { buildVendorPerformance } from "./vendor-performance.js";

@Injectable()
export class VendorPerformanceService {
  constructor(
    @Inject(ITEM_PROVIDER) private readonly items: ItemProvider,
    @Inject(VENDOR_QUALITY_EVIDENCE) private readonly quality: VendorQualityEvidence,
  ) {}

  async get(vendorId: string) {
    const { tenantId } = currentTenant();
    const { vendor, purchaseOrder, grn, grnLine } = schema;
    const data = await withTenant(async (tx) => {
      const [found] = await tx.select({ id: vendor.id, tenantId: vendor.tenantId, code: vendor.code, name: vendor.name }).from(vendor).where(and(eq(vendor.tenantId, tenantId), eq(vendor.id, vendorId))).limit(1);
      if (!found) throw Errors.notFound("vendor");
      const orders = await tx.select().from(purchaseOrder).where(and(eq(purchaseOrder.tenantId, tenantId), eq(purchaseOrder.vendorId, vendorId))).orderBy(asc(purchaseOrder.poDate));
      const receipts = orders.length ? await tx.select().from(grn).where(and(eq(grn.tenantId, tenantId), eq(grn.vendorId, vendorId), eq(grn.status, "posted"), inArray(grn.poId, orders.map((row) => row.id)))) : [];
      const lines = receipts.length ? await tx.select({ tenantId: grnLine.tenantId, grnId: grnLine.grnId, itemId: grnLine.itemId, qty: grnLine.qty }).from(grnLine).where(and(eq(grnLine.tenantId, tenantId), inArray(grnLine.grnId, receipts.map((row) => row.id)))) : [];
      return { vendor: found, orders, receipts, lines };
    });
    // Release the purchase connection before owner ports obtain theirs.
    const [inspections, items] = await Promise.all([
      this.quality.completedForReceipts(data.receipts.map((row) => row.id)),
      this.items.getItems([...new Set(data.lines.map((row) => row.itemId))]),
    ]);
    return buildVendorPerformance({ ...data, tenantId, inspections, items });
  }
}
