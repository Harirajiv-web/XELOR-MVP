import { schema, withTenant } from "@ind-core/db";
import { eq, sql } from "drizzle-orm";
import { evidenceSchema } from "./contracts.js";
import type { ReadEvidence } from "./adapters.js";

/** The optional ONYX reader is one adapter. External decisions never call this reader. */
export async function readNativeEvidence(): Promise<ReadEvidence> {
  return withTenant(async (tx) => {
    const inventory = await tx.execute<{ itemCode: string; availableQty: string; uom: string }>(sql`
      WITH balances AS (
        SELECT sb.item_id, sum(sb.qty) AS qty FROM stock_balance sb
        JOIN warehouse w ON w.id = sb.warehouse_id AND w.tenant_id = sb.tenant_id
        WHERE w.is_active = true AND w.warehouse_type IN ('accepted','finished','general') GROUP BY sb.item_id
      ), reserved AS (
        SELECT sl.item_id, sum(sl.reserved_qty) AS qty FROM sales_order_line sl
        JOIN sales_order so ON so.id = sl.order_id AND so.tenant_id = sl.tenant_id
        WHERE sl.is_active = true AND so.is_active = true AND so.status NOT IN ('cancelled','closed','delivered') GROUP BY sl.item_id
      )
      SELECT i.item_code AS "itemCode", greatest(0, coalesce(b.qty,0)-coalesce(r.qty,0))::text AS "availableQty", i.uom
      FROM item i LEFT JOIN balances b ON b.item_id = i.id LEFT JOIN reserved r ON r.item_id = i.id
      WHERE i.is_active = true ORDER BY i.item_code LIMIT 1001
    `);
    const orders = await tx.execute<{ externalId: string; itemCode: string; quantity: string; dueDate: string | null; unitPrice: string }>(sql`
      SELECT so.so_no || '/' || sl.line_no AS "externalId", i.item_code AS "itemCode",
        greatest(0,sl.qty-sl.delivered_qty)::text AS quantity, sl.requested_delivery_date::text AS "dueDate", sl.rate::text AS "unitPrice"
      FROM sales_order_line sl JOIN sales_order so ON so.id = sl.order_id AND so.tenant_id = sl.tenant_id
      JOIN item i ON i.id = sl.item_id AND i.tenant_id = sl.tenant_id
      WHERE sl.is_active = true AND so.is_active = true AND so.status NOT IN ('cancelled','closed','delivered')
      ORDER BY so.so_no,sl.line_no LIMIT 1001
    `);
    const suppliers = await tx.select({ externalId: schema.vendor.code, name: schema.vendor.name }).from(schema.vendor).where(eq(schema.vendor.isActive, true)).limit(1001);
    if ([inventory.rows, orders.rows, suppliers].some((r) => r.length > 1000)) throw new Error("Native evidence exceeds 1,000 records; use a scoped manufacturing export");
    return { evidence: evidenceSchema.parse({
      inventory: inventory.rows.map((r) => ({ ...r, availableQty: Number(r.availableQty) })),
      orders: orders.rows.map((r) => ({ ...r, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice), currency: "INR" })),
      suppliers: suppliers.map((r) => ({ ...r, leadDays: null })),
    }), warnings: ["Native stock excludes quarantine and sales reservations. Production allocations, full BOM capacity and supplier lead times must be verified before a commitment."] };
  });
}
