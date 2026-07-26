/**
 * PERMISSION RESOLUTION (ADMINISTRATION §9.4, §11).
 *
 * Deny by default. A permission that was never granted is refused, and the refusal says
 * which grant was missing — because "403 Forbidden" with nothing else is the reason
 * administrators end up handing out the admin role to make a problem go away.
 *
 * The 13 actions are a closed set. An action outside it is a typo, and a typo in a
 * permission string is indistinguishable from a permission nobody has: the grant silently
 * matches nothing and the user is silently denied. So it is rejected at the grant, loudly,
 * where somebody is still looking at the screen.
 */

/**
 * The 13 DOCUMENT actions from the blueprint (§9.4).
 *
 * They are the recommended vocabulary for ordinary create/read/write/submit lifecycles,
 * and they are inherited from a Frappe-style doctype permission model.
 *
 * They are NOT the closed set of permissible actions, and treating them as one was a real
 * mistake worth recording: this system enforces 112 permissions, and 46 of them use
 * operational verbs the 13 do not contain — `hrm.payroll.approve`, `inventory.stock.post`,
 * `quality.disposition.decide`, `planning.mrp.run`. Renaming those to `amend` and `write`
 * would make every one of them less clear about what it actually guards.
 *
 * So the authority on which permissions exist is the tenant's `permission_catalogue`, not
 * a list compiled into the platform. That is strictly stronger: a hard-coded list cannot
 * catch `purchase.po.aprove` when `aprove` is spelt correctly for some other module, and
 * the catalogue catches it always, because nothing registered it.
 */
export const DOCUMENT_ACTIONS = [
  "create",
  "read",
  "write",
  "delete",
  "submit",
  "cancel",
  "amend",
  "print",
  "export",
  "email",
  "import",
  "report",
  "share",
] as const;

export type DocumentAction = (typeof DOCUMENT_ACTIONS)[number];

/** `module.entity.action` — e.g. `purchase.po.submit`, `hrm.payroll.approve`. */
export interface ParsedPermission {
  module: string;
  entity: string;
  action: string;
  /** True when the action is one of the 13 document actions rather than an operational verb. */
  isDocumentAction: boolean;
}

const PERM_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export function parsePermission(value: string): ParsedPermission | null {
  if (!PERM_RE.test(value)) return null;
  const [module, entity, action] = value.split(".") as [string, string, string];
  return {
    module,
    entity,
    action,
    isDocumentAction: (DOCUMENT_ACTIONS as readonly string[]).includes(action),
  };
}

export function isValidPermission(value: string): boolean {
  return parsePermission(value) !== null;
}

/** Why a permission string was refused, in words a person can act on. */
export function explainInvalidPermission(value: string): string {
  if (!value.includes(".")) {
    return `'${value}' is not a permission. Permissions are 'module.entity.action', e.g. 'purchase.po.submit'.`;
  }
  const parts = value.split(".");
  if (parts.length !== 3) {
    return `'${value}' has ${parts.length} part(s); a permission has exactly three: module.entity.action.`;
  }
  return `'${value}' is malformed. Use lowercase module.entity.action — letters, digits and underscores only.`;
}

export interface RoleGrant {
  roleId: string;
  roleCode: string;
  roleName: string;
  isPrivileged: boolean;
  permissions: readonly string[];
}

export interface EffectivePermission {
  permission: string;
  /** Every role that grants it — a permission usually arrives by more than one route. */
  viaRoles: string[];
}

/**
 * What a user may actually do, and by which role.
 *
 * The `viaRoles` list is the part that matters operationally: revoking one role rarely
 * removes a permission, because the same permission usually arrives through two. An
 * access review that shows only the permission list produces confident revocations that
 * change nothing.
 */
export function effectivePermissions(grants: readonly RoleGrant[]): EffectivePermission[] {
  const byPerm = new Map<string, Set<string>>();
  for (const g of grants) {
    for (const p of g.permissions) {
      if (!byPerm.has(p)) byPerm.set(p, new Set());
      byPerm.get(p)!.add(g.roleCode);
    }
  }
  return [...byPerm.entries()]
    .map(([permission, roles]) => ({ permission, viaRoles: [...roles].sort() }))
    .sort((a, b) => a.permission.localeCompare(b.permission));
}

export interface AccessDecision {
  allowed: boolean;
  permission: string;
  viaRoles: string[];
  reason: string;
  /** Roles that would grant it, when the answer is no — the actionable half of a denial. */
  wouldBeGrantedBy: string[];
}

/**
 * The "Explain access" simulator (§7, §11).
 *
 * This is the same function the guard uses, run with the cache bypassed. That identity is
 * the whole point: a simulator that answers from a different code path can tell an
 * administrator the access is fine while the guard is denying it, and the two are then
 * debugged against each other for an afternoon.
 */
export function explainAccess(
  permission: string,
  grants: readonly RoleGrant[],
  catalogue: readonly { permission: string; grantedByRoles: readonly string[] }[] = [],
): AccessDecision {
  const parsed = parsePermission(permission);
  if (!parsed) {
    return {
      allowed: false,
      permission,
      viaRoles: [],
      reason: explainInvalidPermission(permission),
      wouldBeGrantedBy: [],
    };
  }

  const via = grants.filter((g) => g.permissions.includes(permission)).map((g) => g.roleCode).sort();
  if (via.length > 0) {
    return {
      allowed: true,
      permission,
      viaRoles: via,
      reason:
        via.length === 1
          ? `Allowed by the ${via[0]} role.`
          : `Allowed by ${via.length} roles (${via.join(", ")}) — revoking one of them will not remove this permission.`,
      wouldBeGrantedBy: [],
    };
  }

  const wouldBe = catalogue.find((c) => c.permission === permission)?.grantedByRoles ?? [];
  const held = grants.map((g) => g.roleCode).sort();
  return {
    allowed: false,
    permission,
    viaRoles: [],
    reason:
      held.length === 0
        ? `Denied: this user holds no roles at all, and nothing is granted by default.`
        : `Denied: none of this user's roles (${held.join(", ")}) grants ${permission}.`,
    wouldBeGrantedBy: [...wouldBe].sort(),
  };
}

/**
 * A permission version stamp, bumped whenever a grant, role or scope changes.
 *
 * Caches key on this. Without it a revoked permission stays live in a warm cache until it
 * expires — which is a revocation that did not revoke anything, at exactly the moment
 * somebody needed it to.
 */
export function nextPermVersion(current: number): number {
  return current + 1;
}
