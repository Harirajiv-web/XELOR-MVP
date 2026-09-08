import { boolean, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * ADMINISTRATION (Module 05) — the in-app RBAC engine (DECISIONS-V2 §1.5:
 * "Application RBAC/ABAC stays in-app"). Keycloak authenticates the user and
 * carries the tenant; the app decides what that user may DO, per tenant.
 *
 * A permission is a string like `general.company.create`. Roles group permissions;
 * users (by Keycloak subject) are assigned roles. All tenant-scoped (a tenant owns
 * its own roles + assignments), so RLS fences them like everything else.
 */

export const role = pgTable(
  "role",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(), // e.g. admin, stores_incharge
    name: text("name").notNull(),
    // Added by ADMINISTRATION (migration 0036) — the attributes the control plane needs.
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("functional"),
    /** Forces MFA; removing the role revokes the holder's live sessions. */
    isPrivileged: boolean("is_privileged").notNull().default(false),
    /**
     * Unrestricted ROW access, granted explicitly and therefore visible in any role
     * listing. It is never the consequence of a missing scope — an unscoped user sees
     * nothing, because "unconfigured" and "unrestricted" must not be the same state.
     */
    isRowUnrestricted: boolean("is_row_unrestricted").notNull().default(false),
  },
  (t) => [unique("uq_role_tenant_code").on(t.tenantId, t.code)],
);

export const rolePermission = pgTable(
  "role_permission",
  {
    ...tenantScopedColumns,
    roleId: uuid("role_id").notNull(), // intra-module FK -> role
    permission: text("permission").notNull(), // module.entity.verb
  },
  (t) => [unique("uq_roleperm").on(t.tenantId, t.roleId, t.permission)],
);

export const userRole = pgTable(
  "user_role",
  {
    ...tenantScopedColumns,
    subject: uuid("subject").notNull(), // Keycloak user id (token `sub`)
    roleId: uuid("role_id").notNull(), // intra-module FK -> role
  },
  (t) => [
    unique("uq_userrole").on(t.tenantId, t.subject, t.roleId),
    index("ix_userrole_subject").on(t.tenantId, t.subject),
  ],
);
