import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantScopedColumns } from "./columns.js";
import { agentApproval } from "./agent-os.js";

/**
 * FACTORY CONNECT — the governed boundary between ONYX and operational technology.
 *
 * These tables hold operational events and command evidence, never high-frequency motion
 * telemetry. Axis streams remain in the controller/historian; ONYX keeps the facts needed
 * to explain production, maintenance, quality and material-flow consequences.
 */
export const factoryEdgeGateway = pgTable(
  "factory_edge_gateway",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    siteCode: text("site_code").notNull(),
    zoneCode: text("zone_code"),
    deploymentMode: text("deployment_mode").notNull().default("simulator"), // simulator | edge
    softwareVersion: text("software_version").notNull(),
    healthStatus: text("health_status").notNull().default("unknown"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    commandMode: text("command_mode").notNull().default("read_only"), // read_only | governed
    capabilities: jsonb("capabilities").notNull().default([]),
  },
  (t) => [
    unique("uq_factory_gateway_code").on(t.tenantId, t.code),
    unique("uq_factory_gateway_tenant_id").on(t.tenantId, t.id),
    check("ck_factory_gateway_mode", sql`${t.deploymentMode} in ('simulator','edge')`),
    check("ck_factory_gateway_command", sql`${t.commandMode} in ('read_only','governed')`),
  ],
);

export const industrialAssetBinding = pgTable(
  "industrial_asset_binding",
  {
    ...tenantScopedColumns,
    assetCode: text("asset_code").notNull(),
    name: text("name").notNull(),
    assetKind: text("asset_kind").notNull(), // robot_arm | cobot | amr | plc | machine | sensor
    siteCode: text("site_code").notNull(),
    zoneCode: text("zone_code").notNull(),
    gatewayId: uuid("gateway_id").notNull(),
    connectorCode: text("connector_code").notNull(),
    externalRef: text("external_ref").notNull(),
    maintenanceAssetRef: uuid("maintenance_asset_ref"),
    workCenterRef: uuid("work_center_ref"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    controllerVersion: text("controller_version"),
    commandPolicy: jsonb("command_policy").notNull().default({}),
    attributes: jsonb("attributes").notNull().default({}),
  },
  (t) => [
    unique("uq_industrial_asset_code").on(t.tenantId, t.assetCode),
    unique("uq_industrial_asset_tenant_id").on(t.tenantId, t.id),
    unique("uq_industrial_asset_external").on(t.tenantId, t.gatewayId, t.externalRef),
    index("ix_industrial_asset_zone").on(t.tenantId, t.siteCode, t.zoneCode),
    foreignKey({
      name: "fk_industrial_asset_gateway_tenant",
      columns: [t.tenantId, t.gatewayId],
      foreignColumns: [factoryEdgeGateway.tenantId, factoryEdgeGateway.id],
    }),
  ],
);

export const assetStateEvent = pgTable(
  "asset_state_event",
  {
    ...tenantScopedColumns,
    assetId: uuid("asset_id").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    state: text("state").notNull(), // running | idle | blocked | faulted | protective_stop | offline
    safetyState: text("safety_state").notNull().default("unknown"),
    activeProgram: text("active_program"),
    workRef: text("work_ref"), // human-readable external work reference; never a cross-module FK
    materialRef: text("material_ref"),
    cycleTimeSeconds: numeric("cycle_time_seconds", { precision: 12, scale: 3 }),
    goodCount: integer("good_count"),
    rejectCount: integer("reject_count"),
    energyKwh: numeric("energy_kwh", { precision: 14, scale: 4 }),
    alarmCode: text("alarm_code"),
    evidence: jsonb("evidence").notNull().default({}),
  },
  (t) => [
    unique("uq_asset_state_source_event").on(t.tenantId, t.assetId, t.sourceEventId),
    unique("uq_asset_state_tenant_id").on(t.tenantId, t.id),
    index("ix_asset_state_time").on(t.tenantId, t.assetId, t.observedAt),
    foreignKey({
      name: "fk_asset_state_asset_tenant",
      columns: [t.tenantId, t.assetId],
      foreignColumns: [industrialAssetBinding.tenantId, industrialAssetBinding.id],
    }),
    check("ck_asset_state_value", sql`${t.state} in ('running','idle','blocked','faulted','protective_stop','offline')`),
    check("ck_asset_state_cycle", sql`${t.cycleTimeSeconds} is null or ${t.cycleTimeSeconds} >= 0`),
    check("ck_asset_state_counts", sql`(${t.goodCount} is null or ${t.goodCount} >= 0) and (${t.rejectCount} is null or ${t.rejectCount} >= 0)`),
    check("ck_asset_state_energy", sql`${t.energyKwh} is null or ${t.energyKwh} >= 0`),
  ],
);

export const assetLocationEvent = pgTable(
  "asset_location_event",
  {
    ...tenantScopedColumns,
    trackedRef: text("tracked_ref").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    siteCode: text("site_code").notNull(),
    zoneCode: text("zone_code").notNull(),
    x: numeric("x", { precision: 12, scale: 4 }),
    y: numeric("y", { precision: 12, scale: 4 }),
    confidence: numeric("confidence", { precision: 7, scale: 4 }),
    source: text("source").notNull(), // cisco_spaces | uwb | ble | amr | manual
    payloadRedacted: jsonb("payload_redacted").notNull().default({}),
  },
  (t) => [
    unique("uq_asset_location_source_event").on(t.tenantId, t.source, t.sourceEventId),
    index("ix_asset_location_time").on(t.tenantId, t.trackedRef, t.observedAt),
    check("ck_asset_location_confidence", sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`),
  ],
);

export const materialDwellInterval = pgTable(
  "material_dwell_interval",
  {
    ...tenantScopedColumns,
    trackedRef: text("tracked_ref").notNull(),
    materialRef: text("material_ref"),
    batchRef: text("batch_ref"),
    workRef: text("work_ref"),
    zoneCode: text("zone_code").notNull(),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull(),
    exitedAt: timestamp("exited_at", { withTimezone: true }),
    expectedMaxMinutes: integer("expected_max_minutes").notNull(),
    status: text("status").notNull().default("active"), // active | exceeded | cleared
    causeCode: text("cause_code"),
  },
  (t) => [
    index("ix_material_dwell_status").on(t.tenantId, t.status, t.enteredAt),
    uniqueIndex("uq_material_dwell_active_ref").on(t.tenantId, t.trackedRef).where(sql`${t.exitedAt} is null and ${t.isActive} = true`),
    check("ck_material_dwell_value", sql`${t.status} in ('active','exceeded','cleared')`),
    check("ck_material_dwell_expected", sql`${t.expectedMaxMinutes} > 0`),
    check("ck_material_dwell_time", sql`${t.exitedAt} is null or ${t.exitedAt} >= ${t.enteredAt}`),
  ],
);

export const machineCommand = pgTable(
  "machine_command",
  {
    ...tenantScopedColumns,
    commandKey: text("command_key").notNull(),
    assetId: uuid("asset_id").notNull(),
    capability: text("capability").notNull(),
    parameters: jsonb("parameters").notNull().default({}),
    requiredState: text("required_state").notNull(),
    approvalRef: uuid("approval_ref").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    approvalIntentHash: text("approval_intent_hash").notNull(),
    sourceStateEventId: uuid("source_state_event_id"),
    policySnapshot: jsonb("policy_snapshot").notNull().default({}),
    approvalDecidedBy: uuid("approval_decided_by"),
    approvalDecidedAt: timestamp("approval_decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"), // pending | accepted | completed | rejected | expired
    simulated: boolean("simulated").notNull().default(true),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    result: jsonb("result"),
  },
  (t) => [
    unique("uq_machine_command_key").on(t.tenantId, t.commandKey),
    unique("uq_machine_command_idempotency").on(t.tenantId, t.idempotencyKey),
    unique("uq_machine_command_approval").on(t.tenantId, t.approvalRef),
    index("ix_machine_command_asset_time").on(t.tenantId, t.assetId, t.createdAt),
    foreignKey({
      name: "fk_machine_command_asset_tenant",
      columns: [t.tenantId, t.assetId],
      foreignColumns: [industrialAssetBinding.tenantId, industrialAssetBinding.id],
    }),
    foreignKey({
      name: "fk_machine_command_state_tenant",
      columns: [t.tenantId, t.sourceStateEventId],
      foreignColumns: [assetStateEvent.tenantId, assetStateEvent.id],
    }),
    foreignKey({
      name: "fk_machine_command_approval_tenant",
      columns: [t.tenantId, t.approvalRef],
      foreignColumns: [agentApproval.tenantId, agentApproval.id],
    }),
    check("ck_machine_command_capability", sql`${t.capability} in ('robot.job.enqueue','robot.program.select_approved','robot.pause_after_cycle','amr.route.dispatch','quality.output.quarantine','maintenance.inspection.request')`),
    check("ck_machine_command_state", sql`${t.requiredState} in ('running','idle','blocked','faulted','protective_stop','offline')`),
    check("ck_machine_command_status_value", sql`${t.status} in ('pending','accepted','completed','rejected','expired')`),
    check("ck_machine_command_hashes", sql`${t.requestFingerprint} ~ '^[a-f0-9]{64}$' and ${t.approvalIntentHash} ~ '^[a-f0-9]{64}$'`),
    check("ck_machine_command_ttl", sql`${t.status} = 'rejected' or (${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '15 minutes')`),
    check("ck_machine_command_simulation_truth", sql`${t.dispatchedAt} is null and ${t.acknowledgedAt} is null and (${t.simulated} = true or ${t.status} = 'rejected')`),
    check("ck_machine_command_completed_state_evidence", sql`${t.status} <> 'completed' or ${t.sourceStateEventId} is not null`),
  ],
);
