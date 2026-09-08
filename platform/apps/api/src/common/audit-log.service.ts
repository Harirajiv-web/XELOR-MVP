import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  computeEntryHash,
  GENESIS_HASH,
  buildChangeSet,
  type AuditEntry,
  type ChangeSet,
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

  /**
   * Record a CORRECTION — the audit append every edit endpoint makes.
   *
   * Differs from `appendInTx` in three ways that matter, and exists so no module has to
   * remember them:
   *
   *   1. It diffs, so the trail holds what the document said BEFORE. An audit row that
   *      records only "edited" answers none of the questions an edit raises.
   *   2. It returns `null` and writes NOTHING when no field moved. Saving an unchanged
   *      form is not an event; a chain padded with them hides the real corrections.
   *   3. The action name carries the tier — `.corrected` for a draft, `.amended` for a
   *      document someone had already relied on — so a reviewer can filter for the second
   *      kind without reading every row.
   *
   * Runs inside the caller's transaction, so the change and its record commit together or
   * not at all. An edit that succeeded while its audit row failed is the one outcome this
   * whole mechanism exists to make impossible.
   */
  async appendEditInTx(
    tx: Tx,
    e: {
      /** `module.entity`, matching the edit policy's key. */
      docType: string;
      entityId: string;
      /** The row as it was, straight from the SELECT. */
      before: Record<string, unknown>;
      /** Only the fields the caller is changing. */
      after: Record<string, unknown>;
      /** Which fields to compare — keeps updated_at out of every change set. */
      fields: readonly string[];
      /** "open" writes `.corrected`; "amend" writes `.amended`. */
      tier: "open" | "amend";
      reason?: string | null;
      revisionNo?: number;
    },
  ): Promise<{ seq: number; hash: string; changeSet: ChangeSet } | null> {
    const changeSet = buildChangeSet(e.before, e.after, e.fields, {
      reason: e.reason,
      revisionNo: e.revisionNo,
    });
    if (!changeSet) return null;

    const written = await this.appendInTx(tx, {
      action: `${e.docType}.${e.tier === "amend" ? "amended" : "corrected"}`,
      entityType: e.docType,
      entityId: e.entityId,
      data: changeSet,
    });

    return { ...written, changeSet };
  }

  /**
   * Every correction ever made to one document, newest first — the History tab's source.
   *
   * Reads only this tenant's chain (RLS enforces that independently) and only the two
   * edit actions, so a document's history is its corrections rather than every event that
   * ever touched it.
   */
  async historyFor(
    docType: string,
    entityId: string,
    limit = 50,
  ): Promise<
    Array<{ seq: number; at: Date; actorId: string; action: string; changeSet: ChangeSet }>
  > {
    const { tenantId } = currentTenant();
    // `withTenant`, NOT the bare `db` client. This read is fenced by FORCE RLS keyed on
    // `app.current_tenant`, which `withTenant` sets transaction-locally; the raw client
    // leaves it unset, the policy matches nothing, and the endpoint answers an empty list.
    //
    // That failure is worth naming because of how it presents: not an error, not a 403 —
    // "this document has never been changed", on a document that had just been changed.
    // The only reason it was caught is that the amendment and the history were checked in
    // the same breath.
    const rows = await withTenant((tx) =>
      tx
      .select({
        seq: auditLog.seq,
        at: auditLog.at,
        actorId: auditLog.actorId,
        action: auditLog.action,
        data: auditLog.data,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, tenantId),
          eq(auditLog.entityType, docType),
          eq(auditLog.entityId, entityId),
          inArray(auditLog.action, [`${docType}.corrected`, `${docType}.amended`]),
        ),
      )
      .orderBy(desc(auditLog.seq))
      .limit(limit),
    );

    return rows.map((r) => ({
      seq: r.seq,
      at: r.at,
      actorId: r.actorId,
      action: r.action,
      changeSet: r.data as ChangeSet,
    }));
  }
}
