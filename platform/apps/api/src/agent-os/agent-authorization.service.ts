import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import {
  AppError,
  currentTenant,
  type PermissionKey,
} from "@ind-core/platform";

const { role, userRole, rolePermission } = schema;

/**
 * Internal tool calls do not pass through a controller guard, so they repeat the actor's
 * RBAC check here. An agent can narrow a user's authority; it can never widen it.
 */
@Injectable()
export class AgentAuthorizationService {
  async permissions(): Promise<ReadonlySet<string>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
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
      return new Set(rows.map((row) => row.permission));
    });
  }

  async require(permission: PermissionKey): Promise<void> {
    const found = (await this.permissions()).has(permission);
    if (!found) {
      throw new AppError(
        "AGENT_TOOL_FORBIDDEN",
        403,
        `The requesting user is not permitted to use capability '${permission}'.`,
      );
    }
  }
}
