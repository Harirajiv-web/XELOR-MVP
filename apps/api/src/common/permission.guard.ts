import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { currentTenant, Errors, type PermissionKey } from "@ind-core/platform";

/**
 * ADMINISTRATION's in-app RBAC gate (DECISIONS-V2 §1.5). Authorization lives in
 * NestJS guards + RLS, never in a token scope or a header. A route declares the
 * permission it needs with @RequirePermission; this guard resolves the AUTHENTICATED
 * user's effective permissions from the tenant-fenced role tables and allows or 403s.
 *
 * The argument is a `PermissionKey`, not a string: a permission that is not declared in
 * PERMISSION_REGISTRY will not compile. A mistyped permission used to produce a route
 * that every user — administrators included — could only ever receive a 403 from, and
 * nothing failed until somebody clicked it.
 */
export const PERMISSION_KEY = "required_permission";

/**
 * Declare the permission — or permissions, ALL of which are required — a route needs.
 *
 * The variadic form exists because stacking two `@RequirePermission` decorators does NOT
 * mean "both". `SetMetadata` writes one metadata key, so a second decorator overwrites the
 * first and the route silently enforces only one of the two. That failure is invisible: the
 * route works, the tests pass, and the permission nobody checked is the one that was
 * supposed to stop somebody. A route that genuinely spans two capabilities — writing a
 * sales order AND running an agent — must say so in a single call:
 *
 *     @RequirePermission("sales.order.create", "agentos.run.operate")
 */
export const RequirePermission = (...permissions: PermissionKey[]): MethodDecorator =>
  SetMetadata(PERMISSION_KEY, permissions);

const { role, userRole, rolePermission } = schema;

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declared = this.reflector.getAllAndOverride<string | string[] | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Tolerates the pre-variadic single-string shape so a stale compiled route cannot end
    // up unguarded on the strength of a signature change.
    const required = declared === undefined ? [] : Array.isArray(declared) ? declared : [declared];
    if (required.length === 0) return true; // unguarded route

    // actorId (Keycloak subject) + tenant were established by TenantMiddleware from
    // the verified token; this guard runs inside that same tenant context.
    const { actorId } = currentTenant();

    const perms = await withTenant(async (tx) => {
      const rows = await tx
        .select({ permission: rolePermission.permission })
        .from(userRole)
        .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
        .innerJoin(role, eq(role.id, userRole.roleId))
        .where(
          and(
            eq(userRole.subject, actorId),
            eq(userRole.isActive, true),
            eq(rolePermission.isActive, true),
            eq(role.isActive, true),
          ),
        );
      return new Set(rows.map((r) => r.permission));
    });

    // ALL of them. Reported one at a time, in declaration order, so the message names a
    // permission an administrator can actually go and grant.
    for (const permission of required) {
      if (!perms.has(permission)) throw Errors.forbidden(permission);
    }
    return true;
  }
}
