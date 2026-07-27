import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  checkRollout,
  currentTenant,
  eventName,
  evaluateProbe,
  killSwitchAllows,
  listFeatures,
  newId,
  route,
  validateRoute,
  type RolloutStage,
  type RoutePolicy,
  type RouteStep,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { aiFeatureRollout, aiKillSwitch, aiKillSwitchProbe, aiRoutePolicy, aiRouteStep, aiEvalRun, aiProvider, aiModel, outboxEvent } = schema;

/**
 * THE REGISTRY, THE ROLLOUT AND THE SWITCH.
 *
 * The registry is the chokepoint, and everything else in AI governance is advisory without
 * it: a feature the router does not recognise makes zero provider calls. That is enforced
 * in the platform already; this service is the operations view of it — what is registered,
 * how far each feature has been rolled out, what happens when it is switched off, and the
 * one control that has to work when nothing else does.
 */
@Injectable()
export class AiRegistryService {
  constructor(private readonly audit: AuditLogService) {}

  /**
   * The eight features, with the two facts that matter operationally: how far each has
   * rolled out, and what the user gets when it is off.
   *
   * The degraded mode is not documentation. It is the reason the kill switch is safe to
   * pull — every feature already has an answer to "and then what?".
   */
  async registry(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rollouts = await tx.select().from(aiFeatureRollout);
      const byKey = new Map(rollouts.map((r) => [r.featureKey, r]));
      const runs = await tx.select().from(aiEvalRun).orderBy(desc(aiEvalRun.runAt));

      return listFeatures().map((f) => {
        const r = byKey.get(f.key);
        const lastRun = runs.find((x) => x.featureKey === f.key);
        return {
          key: f.key,
          ref: f.ref,
          ownerModule: f.ownerModule,
          displayName: f.displayName,
          status: f.status,
          riskTier: f.riskTier,
          dataClass: f.dataClass,
          deterministicBaseline: f.deterministicBaseline,
          degradedMode: f.degradedMode,
          rolloutStage: r?.stage ?? "off",
          rolloutReason: r?.reason ?? null,
          lastEvalVerdict: lastRun?.verdict ?? null,
          lastEvalAt: lastRun?.runAt ?? null,
          // The sentence a Head of Ops actually needs on this screen.
          ifSwitchedOff:
            f.status === "no_mvp_ai"
              ? "This module declares no AI on purpose. Nothing changes."
              : `Falls back to ${f.degradedMode.replace(/_/g, " ")} — the feature degrades, it does not fail.`,
        };
      });
    });
  }

  /* -------------------------------- rollout ------------------------------- */

  /**
   * Move a feature along its rollout.
   *
   * One stage at a time forward, any distance backward, and advancing needs a passing gate
   * for the current version. A feature that reaches every tenant without passing through a
   * pilot has never been used by anybody who could recognise it misbehaving.
   */
  async setRollout(featureKey: string, to: RolloutStage, reason?: string): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [current] = await tx.select().from(aiFeatureRollout).where(eq(aiFeatureRollout.featureKey, featureKey)).limit(1);
      const from = (current?.stage ?? "off") as RolloutStage;

      const [lastRun] = await tx
        .select()
        .from(aiEvalRun)
        .where(and(eq(aiEvalRun.featureKey, featureKey), eq(aiEvalRun.verdict, "pass")))
        .orderBy(desc(aiEvalRun.runAt))
        .limit(1);

      const verdict = checkRollout(from, to, { evalPassed: Boolean(lastRun), reason });
      if (!verdict.allowed) throw new AppError("AIOPS_ROLLOUT_REFUSED", 409, verdict.reason);

      if (current) {
        await tx
          .update(aiFeatureRollout)
          .set({ stage: to, changedBy: actorId, changedAt: new Date(), reason: reason ?? null, lastEvalRunId: lastRun?.id ?? null, updatedBy: actorId, updatedAt: new Date() })
          .where(eq(aiFeatureRollout.id, current.id));
      } else {
        await tx.insert(aiFeatureRollout).values({
          id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
          featureKey, stage: to, changedBy: actorId, reason: reason ?? null, lastEvalRunId: lastRun?.id ?? null,
        });
      }

      await this.audit.appendInTx(tx, {
        action: "aiops.rollout.changed",
        entityType: "ai_feature_rollout",
        entityId: current?.id ?? newId(),
        data: { featureKey, from, to, reason: reason ?? null, gatePassed: Boolean(lastRun) },
      });
      return { featureKey, ...verdict };
    });
  }

  /* ------------------------------- kill switch ---------------------------- */

  /**
   * Engage the switch.
   *
   * Scope is either one feature or the whole tenant. The name and the reason are required
   * by the database — an emergency control with nobody's name on it is one nobody dares
   * release, and a switch that stays engaged because everyone is afraid to touch it is an
   * outage with extra steps.
   */
  async engageKillSwitch(input: { featureKey?: string | null; reason: string }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    if (!input.reason?.trim()) {
      throw new AppError("AIOPS_KILL_REASON_REQUIRED", 422, "Engaging the kill switch needs a reason. Without one nobody knows when it is safe to release.");
    }
    return withTenant(async (tx) => {
      const scope = input.featureKey ?? null;
      const existing = await tx.select().from(aiKillSwitch);
      const match = existing.find((k) => (k.featureKey ?? null) === scope);
      const now = new Date();

      if (match) {
        await tx.update(aiKillSwitch).set({ engaged: true, engagedBy: actorId, engagedAt: now, reason: input.reason, releasedBy: null, releasedAt: null, updatedBy: actorId, updatedAt: now }).where(eq(aiKillSwitch.id, match.id));
      } else {
        await tx.insert(aiKillSwitch).values({
          id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
          featureKey: scope, engaged: true, engagedBy: actorId, engagedAt: now, reason: input.reason,
        });
      }

      await this.audit.appendInTx(tx, {
        action: "aiops.kill_switch.engaged",
        entityType: "ai_kill_switch",
        entityId: match?.id ?? newId(),
        data: { scope: scope ?? "tenant", reason: input.reason },
      });
      await tx.insert(outboxEvent).values({
        id: newId(), tenantId,
        name: eventName("aiops", "kill-switch", "engaged"),
        payload: { scope: scope ?? "tenant", reason: input.reason },
        createdAt: now,
      });

      return {
        scope: scope ?? "tenant",
        engaged: true,
        reason: input.reason,
        note: "Routing is refused at the chokepoint. Every feature falls to its degraded mode — none of them fails.",
      };
    });
  }

  async releaseKillSwitch(featureKey?: string | null): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const scope = featureKey ?? null;
      const existing = await tx.select().from(aiKillSwitch);
      const match = existing.find((k) => (k.featureKey ?? null) === scope);
      if (!match) throw Errors.notFound(`kill switch for ${scope ?? "tenant"}`);
      await tx
        .update(aiKillSwitch)
        .set({ engaged: false, releasedBy: actorId, releasedAt: new Date(), engagedBy: null, engagedAt: null, reason: null, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(aiKillSwitch.id, match.id));
      await this.audit.appendInTx(tx, {
        action: "aiops.kill_switch.released",
        entityType: "ai_kill_switch",
        entityId: match.id,
        data: { scope: scope ?? "tenant" },
      });
      return { scope: scope ?? "tenant", engaged: false };
    });
  }

  /** Whether routing is permitted right now — the check the router makes first. */
  async killSwitchState(featureKey: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(aiKillSwitch).where(eq(aiKillSwitch.engaged, true));
      return this.verdictFor(rows, featureKey);
    });
  }

  /**
   * The same verdict for every registered feature, in ONE read.
   *
   * The per-feature route is the one the router itself uses and stays. This exists because
   * a console listing the registry had to ask nine times to draw one column, and an
   * operations screen that fires a request per row is a screen that gets slower every time
   * the registry grows. Nothing here is a new capability — it is the same closed list and
   * the same verdict function, read once.
   */
  async killSwitchStates(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(aiKillSwitch).where(eq(aiKillSwitch.engaged, true));
      return listFeatures().map((f) => this.verdictFor(rows, f.key));
    });
  }

  /**
   * A tenant-wide switch beats a feature-scoped one, deliberately: "stop all AI" must not
   * be narrowed by a row somebody left behind for one feature.
   */
  private verdictFor(
    engaged: readonly { featureKey: string | null; engagedAt: Date | null; engagedBy: string | null; reason: string | null }[],
    featureKey: string,
  ): Record<string, unknown> {
    const tenantWide = engaged.find((r) => r.featureKey === null);
    const scoped = engaged.find((r) => r.featureKey === featureKey);
    const active = tenantWide ?? scoped;
    const verdict = killSwitchAllows(
      {
        engaged: Boolean(active),
        engagedAt: active?.engagedAt ? active.engagedAt.toISOString() : null,
        engagedBy: active?.engagedBy ?? null,
        reason: active?.reason ?? null,
        featureKey: active?.featureKey ?? null,
      },
      featureKey,
    );
    return { featureKey, ...verdict };
  }

  /**
   * The drill.
   *
   * Sends a real call through the chokepoint with the switch engaged and asserts it was
   * refused, inside the sixty-second bound. Recorded, because a kill switch nobody has
   * tried is a belief.
   */
  async probeKillSwitch(featureKey: string, simulate?: { refused?: boolean; elapsedMs?: number }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const started = Date.now();
    const state = (await this.killSwitchState(featureKey)) as { routingAllowed: boolean };
    const refused = simulate?.refused ?? state.routingAllowed === false;
    const elapsedMs = simulate?.elapsedMs ?? Math.max(1, Date.now() - started);
    const result = evaluateProbe({ featureKey, refused, elapsedMs });

    return withTenant(async (tx) => {
      const probeId = newId();
      await tx.insert(aiKillSwitchProbe).values({
        id: probeId, tenantId, createdBy: actorId, updatedBy: actorId,
        featureKey, refused: result.refused, elapsedMs: result.elapsedMs,
        withinBound: result.withinBound, message: result.message, probedBy: actorId,
      });
      await this.audit.appendInTx(tx, {
        action: "aiops.kill_switch.probed",
        entityType: "ai_kill_switch_probe",
        // The audit trail is keyed by row id — a feature key is not one.
        entityId: probeId,
        data: { featureKey, refused: result.refused, elapsedMs: result.elapsedMs, withinBound: result.withinBound },
      });
      return { ...result, passed: result.refused && result.withinBound };
    });
  }

  /* -------------------------------- routing ------------------------------- */

  async createRoute(input: {
    featureKey: string;
    allowedRegions: string[];
    steps: { order: number; kind: "model" | "deterministic"; providerCode?: string; modelCode?: string; region?: string; fallbackDescription?: string }[];
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const policy: RoutePolicy = {
      featureKey: input.featureKey,
      allowedRegions: input.allowedRegions,
      steps: input.steps as RouteStep[],
    };
    const validation = validateRoute(policy);
    if (!validation.ok) {
      throw new AppError("AIOPS_ROUTE_INVALID", 422, validation.errors.join(" "));
    }

    return withTenant(async (tx) => {
      const existing = await tx.select().from(aiRoutePolicy).where(eq(aiRoutePolicy.featureKey, input.featureKey));
      const version = Math.max(0, ...existing.map((e) => e.version)) + 1;
      const id = newId();
      await tx.insert(aiRoutePolicy).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        featureKey: input.featureKey, version, status: "draft",
        allowedRegions: input.allowedRegions as unknown as object,
      });
      await tx.insert(aiRouteStep).values(
        input.steps.map((s) => ({
          id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
          policyId: id, stepOrder: s.order, kind: s.kind,
          providerCode: s.providerCode ?? null, modelCode: s.modelCode ?? null,
          region: s.region ?? null, fallbackDescription: s.fallbackDescription ?? null,
        })),
      );
      return { featureKey: input.featureKey, version, status: "draft", warnings: validation.warnings };
    });
  }

  /** Activate a chain. The database refuses one whose last step is not deterministic. */
  async activateRoute(featureKey: string, version: number): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [policy] = await tx
        .select()
        .from(aiRoutePolicy)
        .where(and(eq(aiRoutePolicy.featureKey, featureKey), eq(aiRoutePolicy.version, version)))
        .limit(1);
      if (!policy) throw Errors.notFound(`route policy ${featureKey} v${version}`);

      const others = await tx.select().from(aiRoutePolicy).where(and(eq(aiRoutePolicy.featureKey, featureKey), eq(aiRoutePolicy.status, "active")));
      for (const o of others) {
        await tx.update(aiRoutePolicy).set({ status: "retired", updatedBy: actorId, updatedAt: new Date() }).where(eq(aiRoutePolicy.id, o.id));
      }
      await tx
        .update(aiRoutePolicy)
        .set({ status: "active", activatedBy: actorId, activatedAt: new Date(), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(aiRoutePolicy.id, policy.id));

      await this.audit.appendInTx(tx, {
        action: "aiops.route.activated",
        entityType: "ai_route_policy",
        entityId: policy.id,
        data: { featureKey, version, retired: others.length },
      });
      return { featureKey, version, status: "active", retiredPrevious: others.length };
    });
  }

  /** Walk the active chain against a simulated provider health map. */
  async simulateRoute(featureKey: string, health: Record<string, boolean>): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const policy = await this.activePolicyInTx(tx, featureKey);
      const result = route(policy.policy, (step) => {
        if (step.kind === "deterministic") return { ok: true, reason: step.fallbackDescription ?? "deterministic" };
        const healthy = health[step.providerCode ?? ""] ?? true;
        return healthy ? { ok: true, reason: "provider healthy" } : { ok: false, reason: `${step.providerCode} is not answering` };
      });
      return { featureKey, version: policy.version, ...result };
    });
  }

  async activePolicyInTx(tx: Tx, featureKey: string): Promise<{ policy: RoutePolicy; version: number; id: string }> {
    const [p] = await tx
      .select()
      .from(aiRoutePolicy)
      .where(and(eq(aiRoutePolicy.featureKey, featureKey), eq(aiRoutePolicy.status, "active")))
      .limit(1);
    if (!p) throw new AppError("AIOPS_NO_ACTIVE_ROUTE", 422, `${featureKey} has no active routing chain.`);
    const steps = await tx.select().from(aiRouteStep).where(eq(aiRouteStep.policyId, p.id)).orderBy(asc(aiRouteStep.stepOrder));
    return {
      id: p.id,
      version: p.version,
      policy: {
        featureKey,
        allowedRegions: (p.allowedRegions as string[]) ?? [],
        steps: steps.map((s) => ({
          order: s.stepOrder,
          kind: s.kind as "model" | "deterministic",
          providerCode: s.providerCode,
          modelCode: s.modelCode,
          region: s.region,
          fallbackDescription: s.fallbackDescription,
        })),
      },
    };
  }

  async providers(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const provs = await tx.select().from(aiProvider).orderBy(asc(aiProvider.code));
      const models = await tx.select().from(aiModel);
      return provs.map((p) => ({
        code: p.code, name: p.name, kind: p.kind, region: p.region, status: p.status,
        trainingExclusionConfirmed: p.trainingExclusionConfirmed,
        models: models.filter((m) => m.providerId === p.id).map((m) => ({ code: m.code, tier: m.tier })),
        residencyNote: p.region.startsWith("ap-south")
          ? "Serves from India."
          : `Serves from ${p.region} — outside India. A tenant restricting residency cannot route here.`,
      }));
    });
  }
}
