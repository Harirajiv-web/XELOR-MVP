import { Injectable } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  computeEntryHash,
  GENESIS_HASH,
  type AuditEntry,
} from "@ind-core/platform";

const { auditLog } = schema;

export interface AuditAppend {
  action: string; // e.g. ai.governance.kill_switch.engaged
  entityType: string; // e.g. ai_feature_state
  entityId: string;
  data: unknown; // already PII-masked by the caller
}

/**
 * Shared hash-chained audit append (§3.3), used by any write that must leave a
 * tamper-evident trail. Appends WITHIN the caller's transaction so the state change
 * and its audit row commit atomically. Same mechanism GENERAL's create-company path
 * uses inline; centralised here for the modules that came after.
 */
@Injectable()
export class AuditLogService {
  async appendInTx(tx: Tx, e: AuditAppend): Promise<{ seq: number; hash: string }> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    // Serialise this tenant's chain (append-only table -> no SELECT ... FOR UPDATE).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);
    const [last] = await tx
      .select({ seq: auditLog.seq, hash: auditLog.hash })
      .from(auditLog)
      .where(eq(auditLog.tenantId, tenantId))
      .orderBy(desc(auditLog.seq))
      .limit(1);
    const seq = (last?.seq ?? -1) + 1;
    const prevHash = last?.hash ?? GENESIS_HASH;
    const entry: AuditEntry = {
      tenantId,
      seq,
      actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      data: e.data,
      at: now.toISOString(),
    };
    const hash = computeEntryHash(prevHash, entry);
    await tx.insert(auditLog).values({
      id: newId(),
      tenantId,
      seq,
      actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      data: e.data as object,
      at: now,
      prevHash,
      hash,
    });
    return { seq, hash };
  }
}
