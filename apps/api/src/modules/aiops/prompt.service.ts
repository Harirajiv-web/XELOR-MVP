import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  canPromote,
  currentTenant,
  diffPrompts,
  hashPrompt,
  newId,
  planRollback,
  validateTemplate,
  type PromptVersion,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { aiPromptVersion, aiEvalRun, aiCallMetric } = schema;

/**
 * PROMPT LIFECYCLE.
 *
 * A prompt change looks like editing a string and behaves like deploying code: it changes
 * what the system says to every user, and it cannot be reviewed by reading a diff of the
 * output. So it is treated as a release — content-addressed, immutable in production,
 * promoted by a second person, and rollable back with its blast radius stated first.
 *
 * The gate is not a warning. `canPromote` refuses, the database refuses, and there is no
 * force flag — because the one thing that would make all of this decorative is a way to
 * skip it at 6pm on a Friday.
 */
@Injectable()
export class AiPromptService {
  constructor(private readonly audit: AuditLogService) {}

  async create(input: {
    featureKey: string;
    template: string;
    declaredVariables: string[];
    outputSchema?: string;
    changeSummary?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const validation = validateTemplate(input.template, input.declaredVariables);
    if (!validation.ok) {
      throw new AppError("AIOPS_TEMPLATE_INVALID", 422, validation.errors.join(" "));
    }
    const contentHash = hashPrompt(input.template, input.outputSchema ?? null);

    return withTenant(async (tx) => {
      const existing = await tx.select().from(aiPromptVersion).where(eq(aiPromptVersion.featureKey, input.featureKey));
      const sameContent = existing.find((e) => e.contentHash === contentHash);
      if (sameContent) {
        return {
          featureKey: input.featureKey, version: sameContent.version, stage: sameContent.stage, replay: true,
          note: "This exact text already exists as a version. Content-addressing means the same prompt is never two versions.",
        };
      }

      const version = Math.max(0, ...existing.map((e) => e.version)) + 1;
      const id = newId();
      await tx.insert(aiPromptVersion).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        featureKey: input.featureKey,
        version,
        stage: "draft",
        template: input.template,
        declaredVariables: input.declaredVariables as unknown as object,
        outputSchema: input.outputSchema ?? null,
        contentHash,
        authorId: actorId,
        changeSummary: input.changeSummary ?? null,
      });

      await this.audit.appendInTx(tx, {
        action: "aiops.prompt.created",
        entityType: "ai_prompt_version",
        entityId: id,
        data: { featureKey: input.featureKey, version, contentHash, unusedVariables: validation.unused },
      });

      return {
        featureKey: input.featureKey, version, stage: "draft", contentHash,
        unusedVariables: validation.unused,
        note: "Draft created. It needs a passing eval for THIS content and a second person before it can serve anybody.",
      };
    });
  }

  async diff(featureKey: string, fromVersion: number, toVersion: number): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const from = await this.versionInTx(tx, featureKey, fromVersion);
      const to = await this.versionInTx(tx, featureKey, toVersion);
      return { featureKey, from: fromVersion, to: toVersion, ...diffPrompts(this.toDomain(from), this.toDomain(to)) };
    });
  }

  /**
   * Promote to production.
   *
   * Three conditions, all refusals rather than warnings: the template validates, an eval
   * PASSED for this exact content hash, and the approver is not the author.
   */
  async promote(featureKey: string, version: number): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const row = await this.versionInTx(tx, featureKey, version);
      const domain = this.toDomain(row);
      const validation = validateTemplate(row.template, (row.declaredVariables as string[]) ?? []);

      const [passing] = await tx
        .select()
        .from(aiEvalRun)
        .where(and(eq(aiEvalRun.featureKey, featureKey), eq(aiEvalRun.verdict, "pass"), eq(aiEvalRun.promptContentHash, row.contentHash)))
        .orderBy(desc(aiEvalRun.runAt))
        .limit(1);

      // Any passing run, for attribution in the refusal message.
      const [anyPassing] = await tx
        .select()
        .from(aiEvalRun)
        .where(and(eq(aiEvalRun.featureKey, featureKey), eq(aiEvalRun.verdict, "pass")))
        .orderBy(desc(aiEvalRun.runAt))
        .limit(1);

      const verdict = canPromote({
        version: domain,
        templateValid: validation.ok,
        evalPassedForHash: passing ? row.contentHash : (anyPassing?.promptContentHash ?? null),
        approverId: actorId,
      });
      if (!verdict.allowed) throw new AppError("AIOPS_PROMOTION_REFUSED", 409, verdict.reason);

      // Demote whatever is currently in production — the partial unique index enforces one.
      const current = await tx
        .select()
        .from(aiPromptVersion)
        .where(and(eq(aiPromptVersion.featureKey, featureKey), eq(aiPromptVersion.stage, "production")));
      for (const c of current) {
        await tx.update(aiPromptVersion).set({ stage: "retired", updatedBy: actorId, updatedAt: new Date() }).where(eq(aiPromptVersion.id, c.id));
      }

      await tx
        .update(aiPromptVersion)
        .set({ stage: "production", approverId: actorId, promotedAt: new Date(), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(aiPromptVersion.id, row.id));

      await this.audit.appendInTx(tx, {
        action: "aiops.prompt.promoted",
        entityType: "ai_prompt_version",
        entityId: row.id,
        data: { featureKey, version, contentHash: row.contentHash, author: row.authorId, approver: actorId, retired: current.map((c) => c.version) },
      });

      return { featureKey, version, stage: "production", approvedBy: actorId, retiredVersions: current.map((c) => c.version), reason: verdict.reason };
    });
  }

  /** Roll back to a previous version, with the blast radius stated first. */
  async rollback(featureKey: string, toVersion: number, reason: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (!reason?.trim()) throw new AppError("AIOPS_ROLLBACK_REASON_REQUIRED", 422, "A rollback needs a reason — the next person to look will ask what was wrong with it.");

    return withTenant(async (tx) => {
      const [current] = await tx
        .select()
        .from(aiPromptVersion)
        .where(and(eq(aiPromptVersion.featureKey, featureKey), eq(aiPromptVersion.stage, "production")))
        .limit(1);
      if (!current) throw new AppError("AIOPS_NOTHING_IN_PRODUCTION", 409, `${featureKey} has no production prompt to roll back.`);
      const target = await this.versionInTx(tx, featureKey, toVersion);

      const served = await tx.select().from(aiCallMetric).where(eq(aiCallMetric.promptContentHash, current.contentHash));
      const plan = planRollback({
        fromVersion: current.version,
        toVersion,
        callsOnBadVersion: served.length,
        tenantsAffected: new Set(served.map((s) => s.tenantId)).size,
      });

      await tx
        .update(aiPromptVersion)
        .set({ stage: "rolled_back", rolledBackAt: new Date(), rollbackReason: reason, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(aiPromptVersion.id, current.id));
      await tx
        .update(aiPromptVersion)
        .set({ stage: "production", updatedBy: actorId, updatedAt: new Date() })
        .where(eq(aiPromptVersion.id, target.id));

      await this.audit.appendInTx(tx, {
        action: "aiops.prompt.rolled_back",
        entityType: "ai_prompt_version",
        entityId: current.id,
        data: { featureKey, from: current.version, to: toVersion, reason, affectedCalls: plan.affectedCalls },
      });
      return { featureKey, ...plan, reason };
    });
  }

  async versions(featureKey: string): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(aiPromptVersion)
        .where(eq(aiPromptVersion.featureKey, featureKey))
        .orderBy(asc(aiPromptVersion.version));
      return rows.map((r) => ({
        version: r.version, stage: r.stage, contentHash: r.contentHash.slice(0, 12),
        author: r.authorId, approver: r.approverId, promotedAt: r.promotedAt,
        rolledBackAt: r.rolledBackAt, rollbackReason: r.rollbackReason, changeSummary: r.changeSummary,
      }));
    });
  }

  /** The version actually serving right now — what the router resolves at call time. */
  async production(featureKey: string): Promise<Record<string, unknown> | null> {
    return withTenant(async (tx) => {
      const [row] = await tx
        .select()
        .from(aiPromptVersion)
        .where(and(eq(aiPromptVersion.featureKey, featureKey), eq(aiPromptVersion.stage, "production")))
        .limit(1);
      return row ? { featureKey, version: row.version, contentHash: row.contentHash, promotedAt: row.promotedAt, approver: row.approverId } : null;
    });
  }

  private async versionInTx(tx: Tx, featureKey: string, version: number) {
    const [row] = await tx
      .select()
      .from(aiPromptVersion)
      .where(and(eq(aiPromptVersion.featureKey, featureKey), eq(aiPromptVersion.version, version)))
      .limit(1);
    if (!row) throw Errors.notFound(`prompt ${featureKey} v${version}`);
    return row;
  }

  private toDomain(row: typeof aiPromptVersion.$inferSelect): PromptVersion {
    return {
      featureKey: row.featureKey,
      version: row.version,
      stage: row.stage as PromptVersion["stage"],
      template: row.template,
      declaredVariables: (row.declaredVariables as string[]) ?? [],
      outputSchema: row.outputSchema,
      contentHash: row.contentHash,
      authorId: row.authorId,
      approverId: row.approverId,
    };
  }
}
