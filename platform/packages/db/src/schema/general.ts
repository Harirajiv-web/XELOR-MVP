import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * GENERAL module masters (the first vertical slice). GENERAL owns the business
 * master data every other module references by logical id (DECISIONS-V2 §1.1).
 *
 * Boundary rule (§1.1): only INTRA-module FKs are declared. gst_registration ->
 * company is fine (same module). A cross-module reference (e.g. a PO's supplier)
 * would be a bare uuid with NO FK.
 */

// A legal/costing entity within a tenant. 3S is one tenant with one company
// carrying TWO GST registrations (Maharashtra + Tamil Nadu) — the multi-GSTIN case
// that is a documented competitor dealbreaker (§7).
export const company = pgTable(
  "company",
  {
    ...tenantScopedColumns,
    legalName: text("legal_name").notNull(),
    cin: text("cin"), // Corporate Identity Number (optional at MVP)
  },
  (t) => [index("ix_company_tenant").on(t.tenantId, t.id)],
);

export const gstRegistration = pgTable(
  "gst_registration",
  {
    ...tenantScopedColumns,
    companyId: uuid("company_id").notNull(), // intra-module FK (declared in migration)
    gstin: text("gstin").notNull(), // 15-char GSTIN
    stateCode: text("state_code").notNull(), // 2-digit GST state code (27=MH, 33=TN)
    placeName: text("place_name").notNull(), // e.g. Pune-Chakan, Coimbatore
  },
  (t) => [
    index("ix_gstreg_tenant_company").on(t.tenantId, t.companyId),
    index("ix_gstreg_tenant_gstin").on(t.tenantId, t.gstin),
  ],
);
