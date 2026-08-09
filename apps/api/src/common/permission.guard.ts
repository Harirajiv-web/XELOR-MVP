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
export const RequirePermission = (permission: PermissionKey): MethodDecorator =>
  SetMetadata(PERMISSION_KEY, permission);

const { role, userRole, rolePermission } = schema;

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // unguarded route

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

    if (!perms.has(required)) throw Errors.forbidden(required);
    return true;
  }
}
