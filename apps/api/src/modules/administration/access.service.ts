import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  applyFieldRules,
  currentTenant,
  describeScope,
  effectivePermissions,
  explainAccess,
  explainInvalidPermission,
  isValidPermission,
  newId,
  resolveFieldRules,
  rowInScope,
  scopeFor,
  type FieldAccess,
  type FieldRule,
  type RoleGrant,
  type ScopeDimension,
  type ScopeGrant,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { role, rolePermission, userRole, appUser, userPermissionScope, fieldPermission, permissionCatalogue } = schema;

/**
 * ACCESS — who may do what, to which rows, and how much of each row.
 *
 * The three questions are separate and all three must be answered. A correct permission
 * grid with no row scope is how a shop-floor operator ends up able to read every plant's
 * costs; correct rows with no field mask is how they read the margin on them.
 *
 * `explain()` is the same function the guard uses, run with nothing cached. That identity
 * is deliberate: a simulator answering from a second code path will eventually tell an
 * administrator the access is fine while the guard denies it, and then the two get debugged
 * against each other instead of the problem.
 */
@Injectable()
export class AccessService {
  constructor(private readonly audit: AuditLogService) {}

  /** Every role a subject holds, with the permissions each one carries. */
  async grantsFor(subject: string): Promise<RoleGrant[]> {
    return withTenant((tx) => this.grantsInTx(tx, subject));
  }

  private async grantsInTx(tx: Tx, subject: string): Promise<RoleGrant[]> {
    const roles = await tx
      .select({
        id: role.id,
        code: role.code,
        name: role.name,
        isPrivileged: role.isPrivileged,
        isRowUnrestricted: role.isRowUnrestricted,
      })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(and(eq(userRole.subject, subject), eq(userRole.isActive, true), eq(role.isActive, true)))
      .orderBy(asc(role.code));

    if (roles.length === 0) return [];
    const perms = await tx
      .select({ roleId: rolePermission.roleId, permission: rolePermission.permission })
      .from(rolePermission)
      .where(and(inArray(rolePermission.roleId, roles.map((r) => r.id)), eq(rolePermission.isActive, true)));

    return roles.map((r) => ({
      roleId: r.id,
      roleCode: r.code,
      roleName: r.name,
      isPrivileged: r.isPrivileged,
      permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission).sort(),
    }));
  }

  async effective(subject: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const grants = await this.grantsInTx(tx, subject);
      const user = await this.userInTx(tx, subject);
      const eff = effectivePermissions(grants);
      return {
        subject,
        fullName: user?.fullName ?? null,
        permVersion: user?.permVersion ?? null,
        roles: grants.map((g) => ({ code: g.roleCode, name: g.roleName, isPrivileged: g.isPrivileged, permissionCount: g.permissions.length })),
        permissions: eff,
        // The count of permissions arriving by more than one route is the number an access
        // review gets wrong: revoking one role removes none of them.
        multiplyGranted: eff.filter((e) => e.viaRoles.length > 1).length,
      };
    });
  }

  /** The "Explain access" simulator. */
  async explain(subject: string, permission: string, docType?: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const grants = await this.grantsInTx(tx, subject);
      const catalogueRows = await tx.select().from(permissionCatalogue).where(eq(permissionCatalogue.isActive, true));

      // Which roles WOULD grant it — the actionable half of a denial.
      const allGrants = await tx
        .select({ roleCode: role.code, permission: rolePermission.permission })
        .from(rolePermission)
        .innerJoin(role, eq(role.id, rolePermission.roleId))
        .where(eq(rolePermission.isActive, true));
      const catalogue = catalogueRows.map((c) => ({
        permission: c.permission,
        grantedByRoles: allGrants.filter((g) => g.permission === c.permission).map((g) => g.roleCode),
      }));

      const decision = explainAccess(permission, grants, catalogue);
      const result: Record<string, unknown> = { subject, ...decision };

      if (docType) {
        const scope = await this.scopeInTx(tx, subject, docType, grants);
        result.rowScope = { ...scope, description: describeScope(docType, scope) };
        const masks = await this.fieldRulesInTx(tx, grants.map((g) => g.roleId), docType);
        const resolved = resolveFieldRules(docType, masks);
        result.fieldRules = [...resolved.entries()].map(([field, r]) => ({ field, access: r.access, maskFormat: r.maskFormat ?? null }));
      }
      return result;
    });
  }

  /** The row predicate for one doctype — the same call a list query composes into its WHERE. */
  async scope(subject: string, docType: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const grants = await this.grantsInTx(tx, subject);
      const s = await this.scopeInTx(tx, subject, docType, grants);
      return { subject, docType, ...s, description: describeScope(docType, s) };
    });
  }

  private async scopeInTx(tx: Tx, subject: string, docType: string, grants: RoleGrant[]) {
    const rows = await tx
      .select()
      .from(userPermissionScope)
      .where(and(eq(userPermissionScope.subject, subject), eq(userPermissionScope.isActive, true)));
    const scopeGrants: ScopeGrant[] = rows.map((r) => ({
      dimension: r.scopeDimension as ScopeDimension,
      valueId: r.scopeValueId,
      applyToDocType: r.applyToDocType,
      isDefault: r.isDefault,
    }));

    const unrestricted = await tx
      .select({ id: role.id })
      .from(role)
      .where(and(inArray(role.id, grants.length ? grants.map((g) => g.roleId) : ["00000000-0000-0000-0000-000000000000"]), eq(role.isRowUnrestricted, true)));

    return scopeFor(docType, scopeGrants, { hasUnrestrictedRole: unrestricted.length > 0 });
  }

  private async fieldRulesInTx(tx: Tx, roleIds: string[], docType: string): Promise<FieldRule[]> {
    if (roleIds.length === 0) return [];
    const rows = await tx
      .select()
      .from(fieldPermission)
      .where(and(inArray(fieldPermission.roleId, roleIds), eq(fieldPermission.docType, docType), eq(fieldPermission.isActive, true)));
    return rows.map((r) => ({ docType: r.docType, fieldName: r.fieldName, access: r.access as FieldAccess, maskFormat: r.maskFormat }));
  }

  /**
   * Apply this subject's row scope and field masks to a set of rows.
   *
   * This is what a module's list endpoint calls before serialising. It is deliberately a
   * post-filter here rather than a SQL predicate: the predicate composition is the
   * optimisation, and the correctness has to be demonstrable without it.
   */
  async filterAndMask(
    subject: string,
    docType: string,
    rows: readonly Record<string, unknown>[],
  ): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const grants = await this.grantsInTx(tx, subject);
      const scope = await this.scopeInTx(tx, subject, docType, grants);
      const resolved = resolveFieldRules(docType, await this.fieldRulesInTx(tx, grants.map((g) => g.roleId), docType));

      const visible = rows.filter((r) => rowInScope(r as never, scope));
      const masked = visible.map((r) => applyFieldRules(r, resolved));
      return {
        subject,
        docType,
        totalRows: rows.length,
        visibleRows: visible.length,
        withheldRows: rows.length - visible.length,
        hiddenFields: masked[0]?.hidden ?? [],
        maskedFields: masked[0]?.masked ?? [],
        rows: masked.map((m) => m.row),
        scopeDescription: describeScope(docType, scope),
      };
    });
  }

  /* ------------------------------- mutations ------------------------------ */

  /**
   * Grant a permission to a role.
   *
   * The permission must exist in the catalogue. A grant referencing a permission nothing
   * checks is indistinguishable, from the console, from a grant that works — and it denies
   * silently forever.
   */
  async grantPermission(roleCode: string, permission: string): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    if (!isValidPermission(permission)) {
      throw new AppError("ADMIN_PERMISSION_MALFORMED", 422, explainInvalidPermission(permission));
    }
    return withTenant(async (tx) => {
      const [r] = await tx.select().from(role).where(eq(role.code, roleCode)).limit(1);
      if (!r) throw Errors.notFound(`role ${roleCode}`);

      const [known] = await tx.select().from(permissionCatalogue).where(eq(permissionCatalogue.permission, permission)).limit(1);
      if (!known) {
        throw new AppError(
          "ADMIN_PERMISSION_UNKNOWN",
          422,
          `'${permission}' is not in the permission catalogue. Granting it would look exactly like a grant and check nothing.`,
        );
      }

      const existing = await tx
        .select()
        .from(rolePermission)
        .where(and(eq(rolePermission.roleId, r.id), eq(rolePermission.permission, permission)))
        .limit(1);
      if (existing.length > 0) return { roleCode, permission, outcome: "already_granted" };

      await tx.insert(rolePermission).values({
        id: newId(), tenantId, createdBy: actorId, updatedBy: actorId, roleId: r.id, permission,
      });
      await this.bumpPermVersionForRole(tx, r.id);
      await this.audit.appendInTx(tx, {
        action: "admin.access.granted",
        entityType: "role_permission",
        entityId: r.id,
        data: { roleCode, permission },
      });
      return { roleCode, permission, outcome: "granted" };
    });
  }

  async revokePermission(roleCode: string, permission: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [r] = await tx.select().from(role).where(eq(role.code, roleCode)).limit(1);
      if (!r) throw Errors.notFound(`role ${roleCode}`);
      const [grant] = await tx
        .select()
        .from(rolePermission)
        .where(and(eq(rolePermission.roleId, r.id), eq(rolePermission.permission, permission)))
        .limit(1);
      if (!grant) return { roleCode, permission, outcome: "not_granted" };

      await tx.update(rolePermission).set({ isActive: false, updatedBy: actorId, updatedAt: new Date() }).where(eq(rolePermission.id, grant.id));
      await this.bumpPermVersionForRole(tx, r.id);
      await this.audit.appendInTx(tx, {
        action: "admin.access.revoked",
        entityType: "role_permission",
        entityId: r.id,
        data: { roleCode, permission },
      });
      return { roleCode, permission, outcome: "revoked" };
    });
  }

  /**
   * Bump `perm_version` for every user the change touches.
   *
   * Without this a revoked permission stays live in a warm cache until it expires — which
   * is a revocation that did not revoke anything, at exactly the moment somebody needed it
   * to.
   */
  private async bumpPermVersionForRole(tx: Tx, roleId: string): Promise<number> {
    const { actorId } = currentTenant();
    const holders = await tx.select({ subject: userRole.subject }).from(userRole).where(and(eq(userRole.roleId, roleId), eq(userRole.isActive, true)));
    if (holders.length === 0) return 0;
    const subjects = holders.map((h) => h.subject);
    const users = await tx.select().from(appUser).where(inArray(appUser.keycloakSub, subjects));
    for (const u of users) {
      await tx.update(appUser).set({ permVersion: u.permVersion + 1, updatedBy: actorId, updatedAt: new Date() }).where(eq(appUser.id, u.id));
    }
    return users.length;
  }

  async addScope(input: {
    subject: string;
    dimension: ScopeDimension;
    valueId: string;
    applyToDocType?: string;
    justification?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      await tx.insert(userPermissionScope).values({
        id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
        subject: input.subject,
        scopeDimension: input.dimension,
        scopeValueId: input.valueId,
        applyToDocType: input.applyToDocType ?? null,
        grantedBy: actorId,
        justification: input.justification ?? null,
      });
      await this.audit.appendInTx(tx, {
        action: "admin.scope.granted",
        entityType: "user_permission_scope",
        entityId: input.subject,
        data: { ...input },
      });
      return { ...input, outcome: "granted" };
    });
  }

  private async userInTx(tx: Tx, subject: string) {
    const [u] = await tx.select().from(appUser).where(eq(appUser.keycloakSub, subject)).limit(1);
    return u ?? null;
  }

  async listRoles(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(role).where(eq(role.isActive, true)).orderBy(asc(role.code));
      const perms = await tx.select().from(rolePermission).where(eq(rolePermission.isActive, true));
      const holders = await tx.select().from(userRole).where(eq(userRole.isActive, true));
      return rows.map((r) => ({
        code: r.code,
        name: r.name,
        description: r.description,
        category: r.category,
        isPrivileged: r.isPrivileged,
        isRowUnrestricted: r.isRowUnrestricted,
        permissionCount: perms.filter((p) => p.roleId === r.id).length,
        holderCount: holders.filter((h) => h.roleId === r.id).length,
      }));
    });
  }
}
