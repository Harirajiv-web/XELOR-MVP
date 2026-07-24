import { boolean, timestamp, uuid } from "drizzle-orm/pg-core";

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
