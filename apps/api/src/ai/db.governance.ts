import { Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { newId, currentTenant, type AiUsage } from "@ind-core/platform";
import { AuditLogService } from "../common/audit-log.service.js";
import type { AiGovernance, AiGovernanceDecision } from "./governance.port.js";

const { aiFeatureState, aiOptOut } = schema;

/** Default daily token budget per tenant; a per-tenant override lives in the ledger. */
const DEFAULT_DAILY_LIMIT = Number(process.env.AI_DAILY_TOKEN_BUDGET ?? 2_000_000);

export interface AiGovernanceState {
  optedOut: boolean;
  kills: Array<{ featureKey: string; reason: string | null }>;
  budget: { day: string; used: number; limit: number };
}

/**
 * The real AI governance (DECISIONS-V2 §4.3), backing the AiGovernancePort. Before a
 * model call the router asks check(); the answer is fail-closed and ordered:
 *   1. tenant OPT-OUT (DPDP) → refuse
 *   2. KILL SWITCH for the feature, or the tenant-wide '*' → refuse
 *   3. daily TOKEN BUDGET exhausted → refuse
 * Admin actions (engage/release kill, opt-out, set budget) each require a reason and
 * append a hash-chained audit row — the same posture Administration takes elsewhere.
 */
@Injectable()
export class DbAiGovernance implements AiGovernance {
  constructor(private readonly audit: AuditLogService) {}

  async check(featureKey: string): Promise<AiGovernanceDecision> {
    return withTenant(async (tx) => {
      const [oo] = await tx
        .select({ optedOut: aiOptOut.optedOut })
        .from(aiOptOut)
        .limit(1);
      if (oo?.optedOut) return { allowed: false, reason: "opt_out" };

      const killed = await tx
        .select({ featureKey: aiFeatureState.featureKey })
        .from(aiFeatureState)
        .where(
          and(
            inArray(aiFeatureState.featureKey, [featureKey, "*"]),
            eq(aiFeatureState.killed, true),
          ),
        )
        .limit(1);
      if (killed.length > 0) return { allowed: false, reason: "kill_switch" };

      const led = await tx.execute<{ used_tokens: number; daily_limit: number }>(sql`
        select used_tokens, daily_limit from ai_token_ledger
        where tenant_id = ${currentTenant().tenantId} and budget_day = current_date
      `);
      const row = led.rows[0];
      const used = Number(row?.used_tokens ?? 0);
      const limit = Number(row?.daily_limit ?? DEFAULT_DAILY_LIMIT);
      if (used >= limit) return { allowed: false, reason: "budget_exhausted", budgetRemaining: 0 };

      return { allowed: true, budgetRemaining: limit - used };
    });
  }

  async recordUsage(_featureKey: string, usage: AiUsage): Promise<void> {
    const tokens = usage.inputTokens + usage.outputTokens;
    const { tenantId } = currentTenant();
    await withTenant(async (tx) => {
      // Atomic per-day accumulate; creates today's row (at the default limit) on first use.
      await tx.execute(sql`
        insert into ai_token_ledger (id, tenant_id, budget_day, used_tokens, daily_limit)
        values (${newId()}, ${tenantId}, current_date, ${tokens}, ${DEFAULT_DAILY_LIMIT})
        on conflict (tenant_id, budget_day)
        do update set used_tokens = ai_token_ledger.used_tokens + ${tokens}, updated_at = now()
      `);
    });
  }

  // ---- admin actions (reason-required, audited) ----

  async setKill(featureKey: string, killed: boolean, reason: string): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      await tx
        .insert(aiFeatureState)
        .values({ id: newId(), tenantId: currentTenant().tenantId, featureKey, killed, reason, updatedBy: actorId })
        .onConflictDoUpdate({
          target: [aiFeatureState.tenantId, aiFeatureState.featureKey],
          set: { killed, reason, updatedAt: new Date(), updatedBy: actorId },
        });
      await this.audit.appendInTx(tx, {
        action: killed ? "ai.governance.kill_switch.engaged" : "ai.governance.kill_switch.released",
        entityType: "ai_feature_state",
        entityId: currentTenant().tenantId, // audit entity_id is a uuid; the feature is in data
        data: { featureKey, killed, reason },
      });
    });
  }

  async setOptOut(optedOut: boolean, reason: string): Promise<void> {
    const { actorId, tenantId } = currentTenant();
    await withTenant(async (tx) => {
      await tx
        .insert(aiOptOut)
        .values({ id: newId(), tenantId, optedOut, reason, updatedBy: actorId })
        .onConflictDoUpdate({
          target: [aiOptOut.tenantId],
          set: { optedOut, reason, updatedAt: new Date(), updatedBy: actorId },
        });
      await this.audit.appendInTx(tx, {
        action: optedOut ? "ai.governance.opted_out" : "ai.governance.opted_in",
        entityType: "ai_opt_out",
        entityId: tenantId,
        data: { optedOut, reason },
      });
    });
  }

  async setBudget(dailyLimit: number, reason: string): Promise<void> {
    const { tenantId } = currentTenant();
    await withTenant(async (tx) => {
      await tx.execute(sql`
        insert into ai_token_ledger (id, tenant_id, budget_day, used_tokens, daily_limit)
        values (${newId()}, ${tenantId}, current_date, 0, ${dailyLimit})
        on conflict (tenant_id, budget_day)
        do update set daily_limit = ${dailyLimit}, updated_at = now()
      `);
      await this.audit.appendInTx(tx, {
        action: "ai.governance.budget_set",
        entityType: "ai_token_ledger",
        entityId: tenantId, // audit entity_id is a uuid; the day/limit are in data
        data: { dailyLimit, reason, day: "today" },
      });
    });
  }

  async getState(): Promise<AiGovernanceState> {
    return withTenant(async (tx) => {
      const [oo] = await tx.select({ optedOut: aiOptOut.optedOut }).from(aiOptOut).limit(1);
      const kills = await tx
        .select({ featureKey: aiFeatureState.featureKey, reason: aiFeatureState.reason })
        .from(aiFeatureState)
        .where(eq(aiFeatureState.killed, true));
      const led = await tx.execute<{ used_tokens: number; daily_limit: number; day: string }>(sql`
        select used_tokens, daily_limit, budget_day::text as day from ai_token_ledger
        where tenant_id = ${currentTenant().tenantId} and budget_day = current_date
      `);
      const row = led.rows[0];
      return {
        optedOut: oo?.optedOut ?? false,
        kills,
        budget: {
          day: row?.day ?? new Date().toISOString().slice(0, 10),
          used: Number(row?.used_tokens ?? 0),
          limit: Number(row?.daily_limit ?? DEFAULT_DAILY_LIMIT),
        },
      };
    });
  }
}
