import { boolean, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The §5.1 column conventions, applied to EVERY tenant-scoped table so no module
 * re-invents them:
 *  - UUIDv7 PK (app-supplied via @ind-core/platform newId()).
 *  - tenant_id on every row; composite indexes must lead with it (see migration).
 *  - created_at/by, updated_at/by, is_active soft delete.
 *  - No hard DELETE on masters/financial/statutory rows (enforced by convention +
 *    RLS/trigger for audit; masters use is_active).
 */
export const tenantScopedColumns = {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").notNull(),
  isActive: boolean("is_active").notNull().default(true),
};

/**
 * The four columns that make an amendment a fact rather than an overwrite (migration 0089).
 *
 * Spread into any document that can be changed AFTER someone has relied on it — an
 * approved PO the vendor is holding, a confirmed order the customer was promised. Masters
 * and drafts do not carry these: their edits are fully described by the audit change set,
 * and a revision number nobody quotes is a column nobody maintains.
 *
 * Deliberately absent from `journal_voucher`, `grn`, `stock_ledger` and `stock_entry_line`.
 * Those are corrected by a reversing entry; giving them an `amend_reason` would advertise
 * an edit path that must not exist.
 */
export const amendableColumns = {
  /** 0 on creation, +1 per amendment. The number a vendor quotes back at you. */
  revisionNo: integer("revision_no").notNull().default(0),
  amendedAt: timestamp("amended_at", { withTimezone: true }),
  amendedBy: uuid("amended_by"),
  /** Why. Enforced non-empty whenever revision_no > 0 by a row-level CHECK. */
  amendReason: text("amend_reason"),
};
