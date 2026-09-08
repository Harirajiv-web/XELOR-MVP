import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import {
  AppError,
  MAX_FACTORY_APPROVAL_AGE_MS,
  MAX_MACHINE_STATE_AGE_MS,
  currentTenant,
  factoryCommandExecutionBoundary,
  machineCommandVerdict,
  newId,
  normalizeMachineCommandIntent,
  projectFactoryOperations,
  type FactoryOperationsAssetInput,
  type MachineCommandIntent,
  type MachineCommandPolicy,
  type MachineCommandRequest,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { AI_GOVERNANCE } from "../../ai/ai.tokens.js";
import type { AiGovernance } from "../../ai/governance.port.js";
import {
  assertFactoryAutomationActive,
  canonicalFactoryApprovalRef,
  factoryCommandIntentDigest,
} from "./factory-command-approval.js";
import {
  projectFactoryCommandEvidence,
  projectFactoryOperationsView,
  projectFactoryOverview,
} from "./factory-overview-projection.js";
import { canonicalFactoryStateReplay } from "./factory-telemetry-integrity.js";
import {
  factoryWorkroomAlternateEvidence,
  factoryWorkroomReplayMatches,
  factoryWorkroomSafetyState,
  factoryWorkroomScenarioIdentity,
  type FactoryWorkroomScenarioAction,
} from "./factory-workroom-scenario.js";

const {
  factoryEdgeGateway,
  industrialAssetBinding,
  assetStateEvent,
  assetLocationEvent,
  materialDwellInterval,
  machineCommand,
  agentApproval,
  agentRun,
} = schema;

const MAX_SIMULATOR_STATE_AGE_MS = 24 * 60 * 60_000;
const MAX_TELEMETRY_FUTURE_SKEW_MS = 60_000;
const THREE_S_TENANT_ID = "0192a8c0-0000-7000-8000-000000000001";
const THREE_S_WORKROOM_ASSET_CODE = "AST-PNQ-TRN-01";
const THREE_S_WORKROOM_ALTERNATE_ASSET_CODE = "AST-PNQ-LTH-02";

export interface ThreeSWorkroomScenarioInput {
  action: FactoryWorkroomScenarioAction;
  idempotencyKey: string;
}

interface StateInput {
  assetCode: string;
  sourceEventId: string;
  observedAt: string;
  state: "running" | "idle" | "blocked" | "faulted" | "protective_stop" | "offline";
  safetyState: string;
  activeProgram?: string;
  productionOrderRef?: string;
  materialRef?: string;
  cycleTimeSeconds?: number;
  goodCount?: number;
  rejectCount?: number;
  energyKwh?: number;
  alarmCode?: string;
  evidence?: Record<string, unknown>;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function policyOf(value: unknown): MachineCommandPolicy {
  if (typeof value !== "object" || value === null) {
    return { allowlistedCapabilities: [], requiresApproval: true };
  }
  const raw = value as Record<string, unknown>;
  return {
    allowlistedCapabilities: Array.isArray(raw.allowlistedCapabilities)
      ? raw.allowlistedCapabilities.filter((v): v is string => typeof v === "string")
      : [],
    requiresApproval: raw.requiresApproval !== false,
    forbidden: Array.isArray(raw.forbidden)
      ? raw.forbidden.filter((v): v is string => typeof v === "string")
      : [],
  };
}

function requestFingerprint(intent: MachineCommandIntent, approvalRef: string): string {
  return createHash("sha256")
    .update(`${factoryCommandIntentDigest(intent)}\n${approvalRef}`, "utf8")
    .digest("hex");
}

function gatewayHeartbeat(
  gateway: { deploymentMode: string; healthStatus: string; lastHeartbeatAt: Date | null },
  now: Date,
): { stale: boolean; effectiveHealthStatus: string; freshnessWindowMs: number } {
  const freshnessWindowMs = gateway.deploymentMode === "simulator"
    ? MAX_SIMULATOR_STATE_AGE_MS
    : MAX_MACHINE_STATE_AGE_MS;
  const heartbeatAge = gateway.lastHeartbeatAt
    ? now.getTime() - gateway.lastHeartbeatAt.getTime()
    : Number.POSITIVE_INFINITY;
  const stale = heartbeatAge > freshnessWindowMs || heartbeatAge < -MAX_TELEMETRY_FUTURE_SKEW_MS;
  return {
    stale,
    effectiveHealthStatus: stale ? "stale" : gateway.healthStatus,
    freshnessWindowMs,
  };
}

/**
 * Provider-neutral operational boundary for robots, AMRs and factory sensors. Simulator
 * commands complete only a policy simulation. Real edge dispatch is fail-closed until a
 * mutually authenticated claim/ack transport exists.
 */
@Injectable()
export class FactoryConnectService {
  constructor(
    private readonly audit: AuditLogService,
    @Inject(AI_GOVERNANCE) private readonly governance: AiGovernance,
  ) {}

  async integrationView(): Promise<Record<string, unknown>> {
    return projectFactoryOverview(await this.overview(), "integration");
  }

  async productionView(): Promise<Record<string, unknown>> {
    return projectFactoryOverview(await this.overview(), "production");
  }

  async operationsView(): Promise<Record<string, unknown>> {
    if (currentTenant().tenantId !== THREE_S_TENANT_ID) {
      throw new AppError(
        "FACTORY_WORKROOM_SCENARIO_UNAVAILABLE",
        404,
        "Factory Operations is not configured for this tenant.",
      );
    }
    return projectFactoryOperationsView(await this.overview());
  }

  async planningView(): Promise<Record<string, unknown>> {
    return projectFactoryOverview(await this.overview(), "planning");
  }

  async commandEvidence(approvalRefInput: string): Promise<Record<string, unknown>> {
    const approvalRef = canonicalFactoryApprovalRef(approvalRefInput);
    return withTenant(async (tx) => {
      const [command] = await tx
        .select()
        .from(machineCommand)
        .where(and(eq(machineCommand.approvalRef, approvalRef), eq(machineCommand.isActive, true)))
        .limit(1);
      return { command: projectFactoryCommandEvidence(command ?? null) };
    });
  }

  async overview(): Promise<Record<string, unknown>> {
    const { tenantId } = currentTenant();
    return withTenant(async (tx) => {
      // `withTenant` pins one PostgreSQL client so SET LOCAL and RLS stay inseparable from
      // every read. Keep the queries sequential on that client.
      const nowDate = new Date();
      const latestPlausibleObservation = new Date(nowDate.getTime() + MAX_TELEMETRY_FUTURE_SKEW_MS);
      const gateways = await tx.select().from(factoryEdgeGateway).where(eq(factoryEdgeGateway.isActive, true)).orderBy(asc(factoryEdgeGateway.code)).limit(500);
      const assets = await tx.select().from(industrialAssetBinding).where(eq(industrialAssetBinding.isActive, true)).orderBy(asc(industrialAssetBinding.assetCode)).limit(2_000);
      const states = assets.length === 0
        ? []
        : await tx
            .selectDistinctOn([assetStateEvent.assetId])
            .from(assetStateEvent)
            .where(and(
              eq(assetStateEvent.isActive, true),
              inArray(assetStateEvent.assetId, assets.map((asset) => asset.id)),
              lte(assetStateEvent.observedAt, latestPlausibleObservation),
            ))
            .orderBy(assetStateEvent.assetId, desc(assetStateEvent.observedAt), desc(assetStateEvent.id));
      const dwell = await tx.select().from(materialDwellInterval).where(eq(materialDwellInterval.isActive, true)).orderBy(desc(materialDwellInterval.enteredAt)).limit(200);
      const trackedRefs = [...new Set(dwell.map((row) => row.trackedRef))];
      const locations = trackedRefs.length === 0
        ? []
        : await tx
            .selectDistinctOn([assetLocationEvent.trackedRef])
            .from(assetLocationEvent)
            .where(and(
              eq(assetLocationEvent.isActive, true),
              inArray(assetLocationEvent.trackedRef, trackedRefs),
              lte(assetLocationEvent.observedAt, latestPlausibleObservation),
            ))
            .orderBy(assetLocationEvent.trackedRef, desc(assetLocationEvent.observedAt), desc(assetLocationEvent.id));
      const commands = await tx.select().from(machineCommand).where(eq(machineCommand.isActive, true)).orderBy(desc(machineCommand.createdAt)).limit(20);

      const latestState = new Map<string, (typeof states)[number]>();
      for (const state of states) if (!latestState.has(state.assetId)) latestState.set(state.assetId, state);
      const latestLocation = new Map<string, (typeof locations)[number]>();
      for (const location of locations) if (!latestLocation.has(location.trackedRef)) latestLocation.set(location.trackedRef, location);
      const gatewayById = new Map(gateways.map((gateway) => [gateway.id, gateway]));
      const now = nowDate.getTime();

      const assetRows = assets.map((asset) => {
        const state = latestState.get(asset.id);
        const gateway = gatewayById.get(asset.gatewayId);
        const evidenceFreshnessWindowMs = gateway?.deploymentMode === "simulator"
          ? MAX_SIMULATOR_STATE_AGE_MS
          : MAX_MACHINE_STATE_AGE_MS;
        return {
          assetCode: asset.assetCode,
          name: asset.name,
          assetKind: asset.assetKind,
          siteCode: asset.siteCode,
          zoneCode: asset.zoneCode,
          connectorCode: asset.connectorCode,
          manufacturer: asset.manufacturer,
          model: asset.model,
          gatewayCode: gateway?.code ?? null,
          maintenanceAssetRef: asset.maintenanceAssetRef,
          workCenterRef: asset.workCenterRef,
          adapterMode: gateway?.deploymentMode ?? "unknown",
          commandMode: gateway?.commandMode ?? "read_only",
          state: state?.state ?? "unknown",
          safetyState: state?.safetyState ?? "unknown",
          observedAt: state?.observedAt?.toISOString() ?? null,
          evidenceAgeSeconds: state?.observedAt
            ? Math.max(0, Math.round((now - state.observedAt.getTime()) / 1_000))
            : null,
          evidenceStale: state?.observedAt
            ? now - state.observedAt.getTime() > evidenceFreshnessWindowMs
            : true,
          evidenceFreshnessWindowMs,
          activeProgram: state?.activeProgram ?? null,
          productionOrderRef: state?.workRef ?? null,
          materialRef: state?.materialRef ?? null,
          cycleTimeSeconds: state?.cycleTimeSeconds ?? null,
          goodCount: state?.goodCount ?? null,
          rejectCount: state?.rejectCount ?? null,
          energyKwh: state?.energyKwh ?? null,
          alarmCode: state?.alarmCode ?? null,
          commandPolicy: policyOf(asset.commandPolicy),
          attributes: asset.attributes,
        };
      });

      const dwellRows = dwell.map((row) => {
        const until = row.exitedAt?.getTime() ?? now;
        const minutes = Math.max(0, Math.round((until - row.enteredAt.getTime()) / 60_000));
        const effectiveStatus = row.exitedAt || row.status === "cleared"
          ? "cleared"
          : minutes > row.expectedMaxMinutes || row.status === "exceeded"
            ? "exceeded"
            : "active";
        const location = latestLocation.get(row.trackedRef);
        return {
          id: row.id,
          trackedRef: row.trackedRef,
          materialRef: row.materialRef,
          batchRef: row.batchRef,
          productionOrderRef: row.workRef,
          zoneCode: row.zoneCode,
          enteredAt: row.enteredAt.toISOString(),
          dwellMinutes: minutes,
          expectedMaxMinutes: row.expectedMaxMinutes,
          exceededByMinutes: Math.max(0, minutes - row.expectedMaxMinutes),
          status: effectiveStatus,
          causeCode: row.causeCode,
          location: location
            ? { zoneCode: location.zoneCode, x: location.x, y: location.y, confidence: location.confidence, source: location.source }
            : null,
        };
      });

      const constrained = assetRows.filter((row) => ["blocked", "faulted", "protective_stop", "offline"].includes(row.state));
      const exceeded = dwellRows.filter((row) => row.status === "exceeded");
      const generatedAt = new Date(now).toISOString();
      const operationAssets: FactoryOperationsAssetInput[] = assets.map((asset) => {
        const state = latestState.get(asset.id);
        const gateway = gatewayById.get(asset.gatewayId);
        const evidenceFreshnessWindowMs = gateway?.deploymentMode === "simulator"
          ? MAX_SIMULATOR_STATE_AGE_MS
          : MAX_MACHINE_STATE_AGE_MS;
        return {
          assetCode: asset.assetCode,
          name: asset.name,
          assetKind: asset.assetKind,
          siteCode: asset.siteCode,
          zoneCode: asset.zoneCode,
          maintenanceAssetRef: asset.maintenanceAssetRef,
          workCenterRef: asset.workCenterRef,
          state: state?.state ?? "unknown",
          safetyState: state?.safetyState ?? "unknown",
          observedAt: state?.observedAt?.toISOString() ?? null,
          evidenceAgeSeconds: state?.observedAt
            ? Math.max(0, Math.round((now - state.observedAt.getTime()) / 1_000))
            : null,
          evidenceStale: state?.observedAt
            ? now - state.observedAt.getTime() > evidenceFreshnessWindowMs
            : true,
          adapterMode: gateway?.deploymentMode ?? "unknown",
          actualCycleSeconds: finiteNumberOf(state?.cycleTimeSeconds),
          goodCount: state?.goodCount ?? null,
          rejectCount: state?.rejectCount ?? null,
          attributes: recordOf(asset.attributes) ?? {},
          stateEvidence: recordOf(state?.evidence) ?? {},
        };
      });
      const operations = tenantId === THREE_S_TENANT_ID
        ? projectFactoryOperations({
            generatedAt,
            customer: { tenantId, code: "3S", name: "3S Precision Parts Pvt Ltd" },
            assets: operationAssets,
          })
        : null;
      return {
        generatedAt,
        boundary: "Simulator evidence is explicit. No physical controller is connected and no safety function is remotely controlled.",
        gateways: gateways.map((gateway) => {
          const heartbeat = gatewayHeartbeat(gateway, nowDate);
          return {
          code: gateway.code,
          name: gateway.name,
          siteCode: gateway.siteCode,
          zoneCode: gateway.zoneCode,
          deploymentMode: gateway.deploymentMode,
          softwareVersion: gateway.softwareVersion,
          healthStatus: heartbeat.effectiveHealthStatus,
          reportedHealthStatus: gateway.healthStatus,
          heartbeatStale: heartbeat.stale,
          heartbeatSource: gateway.deploymentMode === "simulator"
            ? "stored simulator scenario activity; not a physical heartbeat"
            : "gateway-reported heartbeat",
          lastHeartbeatAt: gateway.lastHeartbeatAt?.toISOString() ?? null,
          commandMode: gateway.commandMode,
          capabilities: gateway.capabilities,
          };
        }),
        assets: assetRows,
        dwell: dwellRows,
        commands: commands.map((command) => ({
          commandKey: command.commandKey,
          capability: command.capability,
          status: command.status,
          simulated: command.simulated,
          approvalRef: command.approvalRef,
          createdAt: command.createdAt.toISOString(),
          result: command.result,
        })),
        operations,
        summary: {
          assets: assetRows.length,
          constrained: constrained.length,
          exceededDwell: exceeded.length,
          headline: constrained.length > 0 || exceeded.length > 0
            ? `${constrained.length} bound asset${constrained.length === 1 ? " needs" : "s need"} attention; ${exceeded.length} material movement${exceeded.length === 1 ? " is" : "s are"} beyond the dwell target.`
            : "Bound factory assets and current material dwell are reporting normally.",
        },
        mission: this.recoveryMission(constrained, exceeded),
      };
    });
  }

  async ingestState(input: StateInput): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const observedAt = new Date(input.observedAt);
    if (
      !Number.isFinite(observedAt.getTime()) ||
      observedAt.getTime() > Date.now() + MAX_TELEMETRY_FUTURE_SKEW_MS
    ) {
      throw new AppError(
        "FACTORY_TELEMETRY_TIME_INVALID",
        422,
        "Factory telemetry has an invalid or implausibly future-dated observation time.",
      );
    }
    return withTenant(async (tx) => {
      const [asset] = await tx
        .select()
        .from(industrialAssetBinding)
        .where(and(eq(industrialAssetBinding.assetCode, input.assetCode), eq(industrialAssetBinding.isActive, true)))
        .limit(1);
      if (!asset) throw new AppError("FACTORY_ASSET_NOT_FOUND", 404, `Factory asset '${input.assetCode}' was not found.`);

      const id = newId();
      const inserted = await tx
        .insert(assetStateEvent)
        .values({
          id, tenantId, createdBy: actorId, updatedBy: actorId,
          assetId: asset.id,
          sourceEventId: input.sourceEventId,
          observedAt,
          state: input.state,
          safetyState: input.safetyState.trim().toLowerCase(),
          activeProgram: input.activeProgram ?? null,
          workRef: input.productionOrderRef ?? null,
          materialRef: input.materialRef ?? null,
          cycleTimeSeconds: input.cycleTimeSeconds?.toString() ?? null,
          goodCount: input.goodCount ?? null,
          rejectCount: input.rejectCount ?? null,
          energyKwh: input.energyKwh?.toString() ?? null,
          alarmCode: input.alarmCode ?? null,
          evidence: { ...(input.evidence ?? {}), ingestedBy: "factory-connect" },
        })
        .onConflictDoNothing({
          target: [assetStateEvent.tenantId, assetStateEvent.assetId, assetStateEvent.sourceEventId],
        })
        .returning({ id: assetStateEvent.id });
      if (inserted[0]) {
        await tx
          .update(factoryEdgeGateway)
          .set({ lastHeartbeatAt: new Date(), updatedAt: new Date(), updatedBy: actorId })
          .where(and(
            eq(factoryEdgeGateway.id, asset.gatewayId),
            eq(factoryEdgeGateway.deploymentMode, "simulator"),
            eq(factoryEdgeGateway.isActive, true),
          ));
        return { id: inserted[0].id, status: "accepted", sourceEventId: input.sourceEventId };
      }

      const [existing] = await tx
        .select()
        .from(assetStateEvent)
        .where(and(eq(assetStateEvent.assetId, asset.id), eq(assetStateEvent.sourceEventId, input.sourceEventId)))
        .limit(1);
      if (!existing) throw new AppError("FACTORY_TELEMETRY_CONFLICT", 409, "Factory telemetry could not be persisted idempotently.");
      const expectedReplay = canonicalFactoryStateReplay({
        ...input,
        observedAt,
        evidence: { ...(input.evidence ?? {}), ingestedBy: "factory-connect" },
      });
      const storedReplay = canonicalFactoryStateReplay({
        sourceEventId: existing.sourceEventId,
        observedAt: existing.observedAt,
        state: existing.state,
        safetyState: existing.safetyState,
        activeProgram: existing.activeProgram,
        productionOrderRef: existing.workRef,
        materialRef: existing.materialRef,
        cycleTimeSeconds: existing.cycleTimeSeconds,
        goodCount: existing.goodCount,
        rejectCount: existing.rejectCount,
        energyKwh: existing.energyKwh,
        alarmCode: existing.alarmCode,
        evidence: existing.evidence,
      });
      if (storedReplay !== expectedReplay) {
        throw new AppError(
          "FACTORY_TELEMETRY_IDEMPOTENCY_MISMATCH",
          409,
          "The source event ID was already used for different telemetry evidence.",
        );
      }
      // An exact replay is still an authenticated simulator request, but it does not make
      // the old machine observation fresh: command policy separately checks observedAt.
      await tx
        .update(factoryEdgeGateway)
        .set({ lastHeartbeatAt: new Date(), updatedAt: new Date(), updatedBy: actorId })
        .where(and(
          eq(factoryEdgeGateway.id, asset.gatewayId),
          eq(factoryEdgeGateway.deploymentMode, "simulator"),
          eq(factoryEdgeGateway.isActive, true),
        ));
      return { id: existing.id, status: "duplicate", sourceEventId: input.sourceEventId };
    });
  }

  /**
   * Toggle one explicit 3S POC machine between running and faulted evidence.
   * This writes an append-only simulator observation; it never calls the command path,
   * contacts a controller, changes a Production order, or publishes a Planning schedule.
   */
  async simulate3sWorkroom(
    input: ThreeSWorkroomScenarioInput,
  ): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    if (tenantId !== THREE_S_TENANT_ID) {
      throw new AppError(
        "FACTORY_WORKROOM_SCENARIO_UNAVAILABLE",
        404,
        "The 3S Workroom simulator scenario is not available for this tenant.",
      );
    }

    const { idempotencyDigest, sourceEventId, alternateSourceEventId } =
      factoryWorkroomScenarioIdentity(input.idempotencyKey);
    const result = await withTenant(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`factory-workroom:${tenantId}:${input.idempotencyKey}`}))`,
      );

      const [asset] = await tx
        .select()
        .from(industrialAssetBinding)
        .where(and(
          eq(industrialAssetBinding.assetCode, THREE_S_WORKROOM_ASSET_CODE),
          eq(industrialAssetBinding.isActive, true),
        ))
        .limit(1);
      if (!asset) {
        throw new AppError(
          "FACTORY_WORKROOM_SCENARIO_UNAVAILABLE",
          404,
          "The configured 3S Workroom simulator asset was not found.",
        );
      }

      const [alternate] = await tx
        .select()
        .from(industrialAssetBinding)
        .where(and(
          eq(industrialAssetBinding.assetCode, THREE_S_WORKROOM_ALTERNATE_ASSET_CODE),
          eq(industrialAssetBinding.isActive, true),
        ))
        .limit(1);
      if (!alternate) {
        throw new AppError(
          "FACTORY_WORKROOM_SCENARIO_UNAVAILABLE",
          404,
          "The configured 3S Workroom alternate simulator asset was not found.",
        );
      }

      const [gateway] = await tx
        .select()
        .from(factoryEdgeGateway)
        .where(and(
          eq(factoryEdgeGateway.id, asset.gatewayId),
          eq(factoryEdgeGateway.isActive, true),
        ))
        .limit(1);
      const [alternateGateway] = await tx
        .select()
        .from(factoryEdgeGateway)
        .where(and(
          eq(factoryEdgeGateway.id, alternate.gatewayId),
          eq(factoryEdgeGateway.isActive, true),
        ))
        .limit(1);
      const workroom = recordOf(recordOf(asset.attributes)?.workroom);
      const alternateWorkroom = recordOf(recordOf(alternate.attributes)?.workroom);
      const explicitAlternates = Array.isArray(workroom?.alternateAssetCodes)
        ? workroom.alternateAssetCodes.filter((code): code is string => typeof code === "string")
        : [];
      if (
        !gateway ||
        !alternateGateway ||
        gateway.deploymentMode !== "simulator" ||
        alternateGateway.deploymentMode !== "simulator" ||
        workroom?.mockOnly !== true ||
        alternateWorkroom?.mockOnly !== true ||
        alternateWorkroom.workCenterCode !== "WC-LTH02" ||
        !explicitAlternates.includes(alternate.assetCode)
      ) {
        throw new AppError(
          "FACTORY_WORKROOM_SIMULATOR_REQUIRED",
          403,
          "The scenario is restricted to the configured mock-only 3S lathe and its explicit WC-LTH02 alternate.",
        );
      }

      const [existing] = await tx
        .select()
        .from(assetStateEvent)
        .where(and(
          eq(assetStateEvent.assetId, asset.id),
          eq(assetStateEvent.sourceEventId, sourceEventId),
        ))
        .limit(1);
      const [existingAlternate] = await tx
        .select()
        .from(assetStateEvent)
        .where(and(
          eq(assetStateEvent.assetId, alternate.id),
          eq(assetStateEvent.sourceEventId, alternateSourceEventId),
        ))
        .limit(1);
      if (existing || existingAlternate) {
        if (!existing || !existingAlternate) {
          throw new AppError(
            "FACTORY_WORKROOM_IDEMPOTENCY_CONFLICT",
            409,
            "The Workroom scenario replay evidence is incomplete; neither simulator event was duplicated.",
          );
        }
        if (
          !factoryWorkroomReplayMatches(existing.evidence, {
            action: input.action,
            idempotencyDigest,
            scenarioRole: "constrained_machine",
          }) ||
          !factoryWorkroomReplayMatches(existingAlternate.evidence, {
            action: input.action,
            idempotencyDigest,
            scenarioRole: "explicit_alternate_freshness",
          })
        ) {
          throw new AppError(
            "FACTORY_WORKROOM_IDEMPOTENCY_MISMATCH",
            409,
            "The idempotency key was already used for a different Workroom scenario action.",
          );
        }
        return {
          id: existing.id,
          status: "duplicate",
          changed: false,
          action: input.action,
          assetCode: asset.assetCode,
          sourceEventId,
          alternateAssetCode: alternate.assetCode,
          alternateSourceEventId,
          mockOnly: true,
          physicalControllerContacted: false,
          autoPublished: false,
        };
      }

      const [latest] = await tx
        .select()
        .from(assetStateEvent)
        .where(and(
          eq(assetStateEvent.assetId, asset.id),
          eq(assetStateEvent.isActive, true),
        ))
        .orderBy(desc(assetStateEvent.observedAt), desc(assetStateEvent.id))
        .limit(1);
      const [latestAlternate] = await tx
        .select()
        .from(assetStateEvent)
        .where(and(
          eq(assetStateEvent.assetId, alternate.id),
          eq(assetStateEvent.isActive, true),
        ))
        .orderBy(desc(assetStateEvent.observedAt), desc(assetStateEvent.id))
        .limit(1);
      const targetState = input.action === "breakdown" ? "faulted" : "running";
      const changed = latest?.state !== targetState;
      const now = new Date();
      const id = newId();
      const alternateId = newId();
      const mockShift = {
        code: "B",
        label: "Shift B · deterministic POC scenario",
        source: "configured_3s_mock_shift",
        plannedProductionSeconds: 27_000,
        runSeconds: input.action === "breakdown" ? 20_500 : 23_800,
        idealCycleSeconds: 1_260,
      };
      const latestAlternateEvidence = recordOf(latestAlternate?.evidence) ?? {};
      const inserted = await tx
        .insert(assetStateEvent)
        .values([
          {
            id,
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            assetId: asset.id,
            sourceEventId,
            observedAt: now,
            state: targetState,
            safetyState: factoryWorkroomSafetyState(input.action, latest?.safetyState),
            activeProgram: latest?.activeProgram ?? "PX400_SHAFT_OP10",
            workRef: latest?.workRef ?? "MO-2627-00003",
            materialRef: latest?.materialRef ?? "CMP-PX4-SFT",
            cycleTimeSeconds: latest?.cycleTimeSeconds ?? "1320",
            goodCount: latest?.goodCount ?? 18,
            rejectCount: latest?.rejectCount ?? 0,
            energyKwh: latest?.energyKwh ?? "38.6700",
            alarmCode: input.action === "breakdown" ? "POC_SIMULATED_SPINDLE_TRIP" : null,
            evidence: {
              source: "3s_workroom_scenario",
              mockOnly: true,
              scenario: "3s-workroom-poc",
              scenarioAction: input.action,
              scenarioRole: "constrained_machine",
              idempotencyDigest,
              physicalControllerContacted: false,
              autoPublished: false,
              boundary: "Mock observation only; no physical controller or schedule was contacted.",
              mockShift,
            },
          },
          {
            id: alternateId,
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            assetId: alternate.id,
            sourceEventId: alternateSourceEventId,
            observedAt: now,
            state: "idle",
            safetyState: "normal",
            activeProgram: latestAlternate?.activeProgram ?? null,
            workRef: latestAlternate?.workRef ?? null,
            materialRef: latestAlternate?.materialRef ?? null,
            cycleTimeSeconds: latestAlternate?.cycleTimeSeconds ?? null,
            goodCount: latestAlternate?.goodCount ?? 0,
            rejectCount: latestAlternate?.rejectCount ?? 0,
            energyKwh: latestAlternate?.energyKwh ?? "2.1100",
            alarmCode: null,
            evidence: factoryWorkroomAlternateEvidence({
              latestEvidence: latestAlternateEvidence,
              action: input.action,
              idempotencyDigest,
              preservedFromStateEventId: latestAlternate?.id ?? null,
            }),
          },
        ])
        .onConflictDoNothing({
          target: [assetStateEvent.tenantId, assetStateEvent.assetId, assetStateEvent.sourceEventId],
        })
        .returning({ id: assetStateEvent.id });
      if (inserted.length !== 2) {
        throw new AppError(
          "FACTORY_WORKROOM_IDEMPOTENCY_CONFLICT",
          409,
          "The Workroom scenario could not be persisted idempotently.",
        );
      }

      await tx
        .update(factoryEdgeGateway)
        .set({ lastHeartbeatAt: now, updatedAt: now, updatedBy: actorId })
        .where(and(
          inArray(factoryEdgeGateway.id, [gateway.id, alternateGateway.id]),
          eq(factoryEdgeGateway.deploymentMode, "simulator"),
          eq(factoryEdgeGateway.isActive, true),
        ));
      await this.audit.appendInTx(tx, {
        action: `factory.workroom.${input.action}_simulated`,
        entityType: "asset_state_event",
        entityId: id,
        data: {
          assetCode: asset.assetCode,
          sourceEventId,
          alternateAssetCode: alternate.assetCode,
          alternateSourceEventId,
          alternateResultingState: "idle",
          previousState: latest?.state ?? null,
          resultingState: targetState,
          changed,
          mockOnly: true,
          physicalControllerContacted: false,
          autoPublished: false,
        },
      });
      return {
        id,
        status: changed ? "accepted" : "no_change",
        changed,
        action: input.action,
        assetCode: asset.assetCode,
        sourceEventId,
        alternateAssetCode: alternate.assetCode,
        alternateSourceEventId,
        mockOnly: true,
        physicalControllerContacted: false,
        autoPublished: false,
      };
    });

    return { ...result, operations: await this.operationsView() };
  }

  async requestCommand(input: MachineCommandRequest): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    assertFactoryAutomationActive(
      await this.governance.check("agent-os.runtime"),
    );
    const approvalRef = canonicalFactoryApprovalRef(input.approvalRef);
    const normalized = normalizeMachineCommandIntent(
      {
        assetCode: input.assetCode,
        capability: input.capability,
        parameters: input.parameters,
        requiredState: input.requiredState,
        expiresAt: input.expiresAt,
      },
      { now: now.toISOString() },
    );
    if (!normalized.valid) {
      throw new AppError("FACTORY_COMMAND_REJECTED", 422, normalized.reason);
    }
    const intent = normalized.value;
    const intentHash = factoryCommandIntentDigest(intent);
    const fingerprint = requestFingerprint(intent, approvalRef);

    return withTenant(async (tx) => {
      // Transaction-scoped locks serialize both idempotency replay and one-time approval
      // consumption. Database uniqueness remains the final invariant.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`factory-idempotency:${tenantId}:${input.idempotencyKey}`}))`);
      const [existing] = await tx
        .select()
        .from(machineCommand)
        .where(eq(machineCommand.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new AppError(
            "FACTORY_IDEMPOTENCY_MISMATCH",
            409,
            "The idempotency key was already used for a different approved command.",
          );
        }
        return {
          commandKey: existing.commandKey,
          status: existing.status,
          simulated: existing.simulated,
          replayed: true,
          result: existing.result,
        };
      }

      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`factory-approval:${tenantId}:${approvalRef}`}))`);
      const [approval] = await tx
        .select({
          id: agentApproval.id,
          status: agentApproval.status,
          isActive: agentApproval.isActive,
          nodeId: agentApproval.nodeId,
          proposed: agentApproval.proposed,
          decidedAt: agentApproval.decidedAt,
          decidedBy: agentApproval.decidedBy,
          graphKey: agentRun.graphKey,
          graphVersion: agentRun.graphVersion,
          runStatus: agentRun.status,
          runInput: agentRun.input,
          runActive: agentRun.isActive,
        })
        .from(agentApproval)
        .innerJoin(agentRun, eq(agentRun.id, agentApproval.runId))
        .where(eq(agentApproval.id, approvalRef))
        .limit(1);
      if (
        !approval ||
        !approval.isActive ||
        !approval.runActive ||
        approval.status !== "approved" ||
        approval.nodeId !== "human-approval" ||
        approval.graphKey !== "factory.flow-recovery" ||
        approval.graphVersion !== 2 ||
        approval.runStatus !== "completed" ||
        !approval.decidedAt ||
        !approval.decidedBy
      ) {
        throw new AppError(
          "FACTORY_APPROVAL_INVALID",
          403,
          "The command must reference an active, completed and approved Factory Flow recovery gate.",
        );
      }
      const approvalAge = now.getTime() - approval.decidedAt.getTime();
      if (approvalAge < -MAX_TELEMETRY_FUTURE_SKEW_MS || approvalAge > MAX_FACTORY_APPROVAL_AGE_MS) {
        throw new AppError("FACTORY_APPROVAL_STALE", 403, "The Factory Flow approval is no longer fresh enough to authorize a command.");
      }
      // A simulator evaluates policy and never contacts hardware, so the one-person public
      // demo may approve and evaluate its own proposal. Any future physical edge path must
      // retain the two-person boundary below before transport is enabled.
      const approvalExecutorSeparated = approval.decidedBy !== actorId;

      const proposed = recordOf(approval.proposed);
      const proposedIntent = normalizeMachineCommandIntent(proposed?.factoryCommand, { enforceExpiryWindow: false });
      const proposedDigest = proposed?.factoryCommandDigest;
      const runInput = recordOf(approval.runInput);
      const runIntent = normalizeMachineCommandIntent(runInput?.factoryCommand, { enforceExpiryWindow: false });
      if (
        !proposedIntent.valid ||
        !runIntent.valid ||
        typeof proposedDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(proposedDigest) ||
        factoryCommandIntentDigest(proposedIntent.value) !== proposedDigest ||
        factoryCommandIntentDigest(runIntent.value) !== proposedDigest ||
        intentHash !== proposedDigest
      ) {
        throw new AppError(
          "FACTORY_APPROVAL_INTENT_MISMATCH",
          403,
          "The approved Factory Flow intent does not exactly match this command request.",
        );
      }

      const [approvalUse] = await tx
        .select({ idempotencyKey: machineCommand.idempotencyKey })
        .from(machineCommand)
        .where(eq(machineCommand.approvalRef, approvalRef))
        .limit(1);
      if (approvalUse) {
        throw new AppError("FACTORY_APPROVAL_ALREADY_USED", 409, "This approval already authorized a machine command.");
      }

      const [asset] = await tx
        .select()
        .from(industrialAssetBinding)
        .where(and(eq(industrialAssetBinding.assetCode, intent.assetCode), eq(industrialAssetBinding.isActive, true)))
        .limit(1);
      if (!asset) throw new AppError("FACTORY_ASSET_NOT_FOUND", 404, `Factory asset '${intent.assetCode}' was not found.`);
      const [gateway] = await tx
        .select()
        .from(factoryEdgeGateway)
        .where(and(eq(factoryEdgeGateway.id, asset.gatewayId), eq(factoryEdgeGateway.isActive, true)))
        .limit(1);
      if (!gateway || gateway.commandMode !== "governed") {
        throw new AppError("FACTORY_COMMAND_READ_ONLY", 409, `Factory asset '${intent.assetCode}' is read-only.`);
      }
      const executionBoundary = factoryCommandExecutionBoundary(
        gateway.deploymentMode,
        approvalExecutorSeparated,
      );
      if (!executionBoundary.allowed) {
        throw new AppError(
          executionBoundary.code,
          executionBoundary.httpStatus,
          executionBoundary.reason,
        );
      }
      const heartbeat = gatewayHeartbeat(gateway, now);
      const gatewayHealthAllowed = gateway.deploymentMode === "simulator"
        ? gateway.healthStatus === "healthy"
        : heartbeat.effectiveHealthStatus === "healthy";
      if (!gatewayHealthAllowed) {
        throw new AppError(
          "FACTORY_GATEWAY_UNHEALTHY",
          409,
          `Factory gateway '${gateway.code}' is '${heartbeat.effectiveHealthStatus}' (reported '${gateway.healthStatus}').`,
        );
      }
      const gatewayCapabilities = Array.isArray(gateway.capabilities)
        ? gateway.capabilities.filter((value): value is string => typeof value === "string")
        : [];
      if (!gatewayCapabilities.includes(intent.capability)) {
        throw new AppError("FACTORY_GATEWAY_CAPABILITY_MISSING", 422, `Factory gateway '${gateway.code}' does not advertise '${intent.capability}'.`);
      }

      const [state] = await tx
        .select()
        .from(assetStateEvent)
        .where(and(eq(assetStateEvent.assetId, asset.id), eq(assetStateEvent.isActive, true)))
        .orderBy(desc(assetStateEvent.observedAt), desc(assetStateEvent.id))
        .limit(1);
      const policy = policyOf(asset.commandPolicy);
      const verdict = machineCommandVerdict({
        capability: intent.capability,
        policy,
        approvalRef,
        expiresAt: intent.expiresAt,
        now: now.toISOString(),
        requiredState: intent.requiredState,
        observedState: state?.state,
        observedAt: state?.observedAt.toISOString(),
        safetyState: state?.safetyState,
        // The simulator is a durable scenario model, not a controller. It still must be
        // refreshed daily; a real controller path (currently refused) uses two minutes.
        maxStateAgeMs: gateway.deploymentMode === "simulator"
          ? Number.POSITIVE_INFINITY
          : MAX_MACHINE_STATE_AGE_MS,
      });
      if (!verdict.allowed) throw new AppError("FACTORY_COMMAND_REJECTED", 422, verdict.reason);

      const id = newId();
      const commandKey = `MC-${id.slice(-12).toUpperCase()}`;
      const result = {
        outcome: "simulated_policy_evaluation",
        physicalControllerContacted: false,
        edgeExecutionAttempted: false,
        controllerAcknowledgementReceived: false,
        localControllerRemainsSafetyAuthority: true,
        approvalExecutorSeparated,
        separationOfDutiesRequired: false,
        note: "The approved command passed ONYX policy gates in the simulator; no physical action was attempted.",
      };
      const policySnapshot = {
        evaluatedAt: now.toISOString(),
        verdict: verdict.reason,
        gatewayCode: gateway.code,
        gatewayDeploymentMode: gateway.deploymentMode,
        gatewayCapabilities,
        assetPolicy: policy,
        observedState: state?.state ?? null,
        observedSafetyState: state?.safetyState ?? null,
        observedAt: state?.observedAt.toISOString() ?? null,
        stateFreshnessWindowMs: gateway.deploymentMode === "simulator"
          ? null
          : MAX_MACHINE_STATE_AGE_MS,
        simulatorFreshnessMode: gateway.deploymentMode === "simulator"
          ? "stored_scenario_snapshot; timestamp age is disclosed but no physical heartbeat is claimed"
          : null,
        gatewayHeartbeatStale: heartbeat.stale,
        gatewayHeartbeatFreshnessWindowMs: heartbeat.freshnessWindowMs,
        approvalExecutorSeparated,
        separationOfDutiesRequired: false,
        localControllerRemainsAuthority: true,
      };
      await tx.insert(machineCommand).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        commandKey,
        assetId: asset.id,
        capability: intent.capability,
        parameters: intent.parameters,
        requiredState: intent.requiredState,
        approvalRef,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: fingerprint,
        approvalIntentHash: intentHash,
        sourceStateEventId: state?.id ?? null,
        policySnapshot,
        approvalDecidedBy: approval.decidedBy,
        approvalDecidedAt: approval.decidedAt,
        expiresAt: new Date(intent.expiresAt),
        status: "completed",
        simulated: true,
        dispatchedAt: null,
        acknowledgedAt: null,
        result,
      });
      await this.audit.appendInTx(tx, {
        action: "factory.machine_command.simulated",
        entityType: "machine_command",
        entityId: id,
        data: {
          commandKey,
          assetCode: asset.assetCode,
          capability: intent.capability,
          approvalRef,
          approvalIntentHash: intentHash,
          sourceStateEventId: state?.id ?? null,
          physicalControllerContacted: false,
        },
      });
      return { commandKey, status: "completed", simulated: true, verdict: verdict.reason, result };
    });
  }

  private recoveryMission(
    constrained: readonly { assetCode: string; state: string; productionOrderRef: string | null; materialRef: string | null }[],
    exceeded: readonly { trackedRef: string; productionOrderRef: string | null; exceededByMinutes: number }[],
  ): Record<string, unknown> {
    const firstAsset = constrained[0];
    const firstDwell = exceeded[0];
    return {
      graphKey: "factory.flow-recovery",
      triggerReady: Boolean(firstAsset || firstDwell),
      goal: firstAsset
        ? `Recover ${firstAsset.assetCode} from ${firstAsset.state} without bypassing local safety controls.`
        : firstDwell
          ? `Recover material flow for ${firstDwell.trackedRef}, which is ${firstDwell.exceededByMinutes} minutes beyond its dwell target.`
          : "No factory-flow recovery mission is currently required.",
      evidence: { constrainedAsset: firstAsset ?? null, exceededDwell: firstDwell ?? null },
      specialists: ["HEXA", "MICA", "SPAR", "AXLE", "KILN", "RASP", "RELAY", "ACHILES"],
      approvalBoundary: "Any simulator command evaluation requires an attributable exact-intent approval. Physical controller execution and acknowledgement are unavailable.",
    };
  }
}
