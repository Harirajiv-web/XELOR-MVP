import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * PURCHASE (SPAR, Module 04) — procurement. Owns the VENDOR master, PURCHASE ORDERS
 * (approved through the W1 engine via the WorkflowExecutor port), and GOODS RECEIPTS
 * (which post stock through Inventory's single write path). item_id / vendor references
 * to other modules are logical uuids (no cross-module FK, §1.1); intra-module FKs
 * (po_line → po, grn → po …) are declared.
 */

// A supplier we buy from. A master — so it reuses the shared master-dedup brain.
export const vendor = pgTable(
  "vendor",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(), // tenant-unique business key
    name: text("name").notNull(),
    gstin: text("gstin"), // 15-char GSTIN (optional at MVP)
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    address: text("address"),
    paymentTerms: text("payment_terms"), // free-form for MVP, e.g. "Net 30"
  },
  (t) => [unique("uq_vendor_tenant_code").on(t.tenantId, t.code)],
);
