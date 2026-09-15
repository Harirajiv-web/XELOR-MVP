import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import { currentTenant, eventName, newId } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { fingerprint, runIdempotent } from "../../common/idempotency.js";
import {
  WORKSPACE_CONFIG_KEY,
  parseWorkspaceConfig,
  requireWorkspaceIdempotencyKey,
  workspaceConfigResponse,
  type WorkspaceConfig,
  type WorkspaceConfigResponse,
} from "./workspace-config.js";

const { systemSetting, outboxEvent } = schema;
const WORKSPACE_CONFIG_EVENT = eventName("general", "workspace-config", "updated");

/** Stored by ADMINISTRATION, the system_setting owner; the public route is a GENERAL workspace concern. */
@Injectable()
export class WorkspaceConfigService {
  constructor(private readonly audit: AuditLogService) {}

  async get(): Promise<WorkspaceConfigResponse> {
    const { tenantId } = currentTenant();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(systemSetting).where(and(
        eq(systemSetting.tenantId, tenantId),
        eq(systemSetting.settingKey, WORKSPACE_CONFIG_KEY),
        eq(systemSetting.isActive, true),
      )).limit(1);
      return workspaceConfigResponse(row);
    });
  }

  async save(input: unknown, idempotencyKey: string | undefined): Promise<WorkspaceConfigResponse> {
    const key = requireWorkspaceIdempotencyKey(idempotencyKey);
    const config = parseWorkspaceConfig(input);
    const result = await runIdempotent(key, fingerprint({
      operation: "general.workspace-config.save.v1", config,
    }), async () => ({ status: 200, body: await this.persist(config) }));
    return result.body;
  }

  private async persist(config: WorkspaceConfig): Promise<WorkspaceConfigResponse> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      // A missing row cannot be locked. This tenant/key lock serializes first insert as well as updates.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${WORKSPACE_CONFIG_KEY}))`);
      const scope = and(eq(systemSetting.tenantId, tenantId), eq(systemSetting.settingKey, WORKSPACE_CONFIG_KEY));
      const [before] = await tx.select().from(systemSetting).where(scope).limit(1);
      const id = before?.id ?? newId();
      const updatedAt = new Date();
      const value = JSON.stringify(config);
      const values = {
        valueType: "json", value, updatedAt, updatedBy: actorId, isActive: true,
        isSecret: false, statutoryFloor: null, floorSource: null,
        description: "XELOR workspace presentation: industry labels, departments and shortcuts. Does not change permissions, licences or business rules.",
      };
      if (before) {
        await tx.update(systemSetting).set(values).where(and(scope, eq(systemSetting.id, id)));
      } else {
        await tx.insert(systemSetting).values({
          ...values, id, tenantId, settingKey: WORKSPACE_CONFIG_KEY, createdAt: updatedAt, createdBy: actorId,
        });
      }
      await this.audit.appendInTx(tx, {
        action: "general.workspace-config.updated", entityType: "system_setting", entityId: id,
        data: { key: WORKSPACE_CONFIG_KEY, before: before?.value ?? null, after: value },
      });
      await tx.insert(outboxEvent).values({
        id: newId(), tenantId, name: WORKSPACE_CONFIG_EVENT,
        payload: { id, schemaVersion: config.schemaVersion, updatedAt: updatedAt.toISOString() }, createdAt: updatedAt,
      });
      return { config, updatedAt: updatedAt.toISOString() };
    });
  }
}
