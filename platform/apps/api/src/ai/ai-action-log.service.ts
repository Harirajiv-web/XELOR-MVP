import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import {
  newId,
  currentTenant,
  canonicalize,
  computeEntryHash,
  GENESIS_HASH,
  type AuditEntry,
  type AiModelTier,
  type AiUsage,
} from "@ind-core/platform";

const { aiActionLog } = schema;

/** sha256 of the canonical (key-sorted) JSON — stable content hash, no PII stored. */
function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export interface AiActionRecord {
  featureKey: string;
  input: unknown;
  output: unknown | null;
  model: string | null;
  tier: AiModelTier;
  usage: AiUsage;
  degraded: boolean;
  /** optional compact decision summary (never raw prompt/PII). */
  decision?: unknown;
}

/**
 * Appends a hash-chained record for EVERY AI call (§4.3) — successes and refusals.
 * Same tamper-evidence as the audit log: a per-tenant monotonic seq whose hash chains
 * off the previous one, serialised by a transaction-scoped advisory lock (the table is
 * append-only, so the app role has no UPDATE right and cannot SELECT ... FOR UPDATE).
 * Only content HASHES are stored, never the prompt or PII.
 */
@Injectable()
export class AiActionLogService {
  async append(rec: AiActionRecord): Promise<{ seq: number; hash: string }> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    const inputHash = contentHash(rec.input);
    const outputHash = rec.output === null ? null : contentHash(rec.output);

    return withTenant(async (tx) => {
      // Serialise this tenant's AI chain (distinct lock key from the audit chain).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId + ":ai"}))`);
      const [last] = await tx
        .select({ seq: aiActionLog.seq, hash: aiActionLog.hash })
        .from(aiActionLog)
        .where(eq(aiActionLog.tenantId, tenantId))
        .orderBy(desc(aiActionLog.seq))
        .limit(1);
      const seq = (last?.seq ?? -1) + 1;
      const prevHash = last?.hash ?? GENESIS_HASH;

      // The chain hashes over content hashes + the decision, never the raw payload.
      const entry: AuditEntry = {
        tenantId,
        seq,
        actorId,
        action: `ai.${rec.featureKey}`,
        entityType: "ai_action",
        entityId: rec.featureKey,
        data: {
          inputHash,
          outputHash,
          model: rec.model,
          tier: rec.tier,
          degraded: rec.degraded,
          decision: rec.decision ?? null,
        },
        at: now.toISOString(),
      };
      const hash = computeEntryHash(prevHash, entry);

      await tx.insert(aiActionLog).values({
        id: newId(),
        tenantId,
        seq,
        featureKey: rec.featureKey,
        actorId,
        inputHash,
        outputHash,
        decision: (rec.decision ?? null) as object | null,
        model: rec.model,
        tier: rec.tier,
        inputTokens: rec.usage.inputTokens,
        outputTokens: rec.usage.outputTokens,
        degraded: rec.degraded,
        at: now,
        prevHash,
        hash,
      });
      return { seq, hash };
    });
  }
}
