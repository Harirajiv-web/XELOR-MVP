import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import {
  AppError,
  currentTenant,
  type PermissionKey,
} from "@ind-core/platform";

const { userRole, rolePermission } = schema;

/**
 * Internal tool calls do not pass through a controller guard, so they repeat the actor's
 * RBAC check here. An agent can narrow a user's authority; it can never widen it.
 */
@Injectable()
export class AgentAuthorizationService {
  async require(permission: PermissionKey): Promise<void> {
    const { actorId } = currentTenant();
    const found = await withTenant(async (tx) => {
      const rows = await tx
        .select({ permission: rolePermission.permission })
        .from(userRole)
        .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
        .where(eq(userRole.subject, actorId));
      return rows.some((row) => row.permission === permission);
    });
    if (!found) {
      throw new AppError(
        "AGENT_TOOL_FORBIDDEN",
        403,
        `The requesting user is not permitted to use capability '${permission}'.`,
      );
    }
  }
}
