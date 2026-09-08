import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { amendableColumns, tenantScopedColumns } from "./columns.js";

/**
 * MAINTENANCE / CMMS (KILN, Module 10) — the asset-uptime system of record.
 *
 * Read the naming rule before anything else (MAINTENANCE §1.4, §9.2). The word "work
 * order" is overloaded across this suite:
 *
 *   PRODUCTION owns  `production_order`  — make N of item X against a BOM.
 *   MAINTENANCE owns `maintenance_work_order` (MWO) — restore or service asset Y.
 *
 * Different tables, different numbering series, different permissions (`prod.*` vs
 * `mnt.*`), no FK between them, ever. The only shared vocabulary is the *machine*, and
 * that is a logical `work_center_ref` — a uuid with a comment, not a foreign key.
 *
 * Three boundaries are structural here, not aspirational:
 *   - **Spares are Inventory's stock.** There is no on-hand column, no bin, no valuation
 *     function anywhere in this module. `mwo_spare` mirrors the stock-entry id and the
 *     valued amount INVENTORY returned, read-only.
 *   - **Technicians are HRM's employees.** `employee_ref` is logical; the only thing this
 *     module stores about a person is a trade tag used to price labour.
 *   - **Vendor spend is Expenditure's.** `mwo_external_cost` mirrors actuals that arrive
 *     as events; nothing here can create a payable.
 */

/* ========================= asset master, hierarchy, meters ================= */

/** The maintainable thing. NOT a work center; NOT a fixed asset in the accounting sense. */
export const maintenanceAsset = pgTable(
  "maintenance_asset",
  {
    ...tenantScopedColumns,
    assetCode: text("asset_code").notNull(),
    name: text("name").notNull(),
    assetType: text("asset_type").notNull(), // plant | area | machine | component
    parentAssetId: uuid("parent_asset_id"), // intra-module FK: legal
    path: text("path").notNull(), // materialised '/plant/area/machine/component'
    depth: smallint("depth").notNull(),
    criticality: text("criticality"), // A | B | C — required for machine/component
    criticalityReason: text("criticality_reason"),
    status: text("status").notNull().default("operational"),
    make: text("make"),
    model: text("model"),
    serialNo: text("serial_no"),
    manufactureYear: smallint("manufacture_year"),
    commissionedOn: date("commissioned_on"),
    // ---- logical references to sibling modules: NO foreign keys, by design ----
    locationRef: uuid("location_ref"), // General.gst_registration / location
    costCentreRef: text("cost_centre_ref"), // General.cost_center
    departmentRef: text("department_ref"),
    workCenterRef: uuid("work_center_ref"), // Production.work_center (logical)
    supplierRef: uuid("supplier_ref"), // Purchase.vendor (warranty owner)
    assetFinanceRef: uuid("asset_finance_ref"), // Accounts fixed-asset placeholder (post-MVP)
    warrantyEndDate: date("warranty_end_date"),
    statutoryClass: text("statutory_class").notNull().default("none"),
    competentPersonRef: uuid("competent_person_ref"),
    qrPayload: text("qr_payload"),
    attributes: jsonb("attributes").notNull().default({}),
  },
  (t) => [
    unique("uq_asset_code").on(t.tenantId, t.assetCode),
    index("ix_asset_parent").on(t.tenantId, t.parentAssetId),
    index("ix_asset_crit").on(t.tenantId, t.criticality, t.status),
  ],
);

/** Moves, status and criticality changes APPEND. No destructive edit of an asset's past. */
export const maintenanceAssetHistory = pgTable(
  "maintenance_asset_history",
  {
    ...tenantScopedColumns,
    assetId: uuid("asset_id").notNull(),
    changeType: text("change_type").notNull(), // move|status|criticality|work_center_link|decommission
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value").notNull(),
    reason: text("reason"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
  },
  (t) => [index("ix_asset_hist").on(t.tenantId, t.assetId)],
);

/** `currentValue` is a PROJECTION of the readings, rebuildable — the Inventory ledger
 *  lesson applied to meters. There is no endpoint that writes it directly. */
export const assetMeter = pgTable(
  "asset_meter",
  {
    ...tenantScopedColumns,
    assetId: uuid("asset_id").notNull(),
    meterType: text("meter_type").notNull(), // run_hours | cycles | strokes | km | kwh
    uom: text("uom").notNull(),
    currentValue: numeric("current_value", { precision: 18, scale: 4 }).notNull().default("0"),
    lastReadingAt: timestamp("last_reading_at", { withTimezone: true }),
    lastRealReadingAt: timestamp("last_real_reading_at", { withTimezone: true }),
    rolloverAt: numeric("rollover_at", { precision: 18, scale: 4 }),
    dailyRateEst: numeric("daily_rate_est", { precision: 18, scale: 4 }),
  },
  (t) => [unique("uq_meter").on(t.tenantId, t.assetId, t.meterType)],
);

/** Append-only. An ESTIMATED reading may move a forecast but may never close a PM
 *  occurrence (FR-MNT-006, V-MTR-03). */
export const assetMeterReading = pgTable(
  "asset_meter_reading",
  {
    ...tenantScopedColumns,
    meterId: uuid("meter_id").notNull(),
    readingValue: numeric("reading_value", { precision: 18, scale: 4 }).notNull(),
    readingAt: timestamp("reading_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(), // manual | event | estimated
    sourceRef: text("source_ref"),
    isEstimated: boolean("is_estimated").notNull().default(false),
    isCorrection: boolean("is_correction").notNull().default(false),
    correctionReason: text("correction_reason"),
    photoKey: text("photo_key"),
    note: text("note"),
  },
  (t) => [index("ix_meter_read").on(t.tenantId, t.meterId)],
);

/* ====================== configuration & taxonomy (effective-dated) ========= */

/** ISO 14224-shaped failure taxonomy: mode / cause / detection / action. Retire by
 *  `effectiveTo`; a retired code never rewrites the history that used it. */
export const failureCode = pgTable(
  "failure_code",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    kind: text("kind").notNull(), // mode | cause | detection | action
    label: text("label").notNull(),
    parentCodeId: uuid("parent_code_id"),
    assetClass: text("asset_class"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [unique("uq_failure_code").on(t.tenantId, t.kind, t.code, t.effectiveFrom)],
);

export const downtimeReasonCode = pgTable(
  "downtime_reason_code",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    label: text("label").notNull(),
    defaultKind: text("default_kind").notNull().default("unplanned"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [unique("uq_dt_reason").on(t.tenantId, t.code, t.effectiveFrom)],
);

/** Criticality x severity -> priority + SLA. Effective-dated; NEVER a constant in code
 *  (NFR-14). Resolved as-of the REQUEST date, so a later edit cannot restate a deadline. */
export const criticalitySlaMatrix = pgTable(
  "criticality_sla_matrix",
  {
    ...tenantScopedColumns,
    criticality: text("criticality").notNull(),
    severity: text("severity").notNull(),
    priority: text("priority").notNull(),
    respondMinutes: integer("respond_minutes").notNull(),
    restoreMinutes: integer("restore_minutes").notNull(),
    escalateToRole: text("escalate_to_role").notNull().default("maintenance_manager"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [unique("uq_sla_matrix").on(t.tenantId, t.criticality, t.severity, t.effectiveFrom)],
);

/** Fallback labour rate. Where HRM publishes an employee costing rate it is preferred and
 *  consumed by reference; no employee pay data is ever copied into this module. */
export const maintenanceLabourRate = pgTable(
  "maintenance_labour_rate",
  {
    ...tenantScopedColumns,
    trade: text("trade").notNull(), // fitter | electrician | technician | contractor
    grade: text("grade"),
    ratePerHour: numeric("rate_per_hour", { precision: 18, scale: 2 }).notNull(),
    otMultiplier: numeric("ot_multiplier", { precision: 6, scale: 3 }).notNull().default("1.000"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [unique("uq_labour_rate").on(t.tenantId, t.trade, t.grade, t.effectiveFrom)],
);

/**
 * NOT an employee master (FR-MNT-033). The employee record lives in HRM; this table holds
 * only the *maintenance* facts about a person — which trade and grade prices their time,
 * and which plant they work in — keyed by a logical `employee_ref`. No name, no pay, no
 * identity document.
 */
export const maintenanceTechnician = pgTable(
  "maintenance_technician",
  {
    ...tenantScopedColumns,
    employeeRef: uuid("employee_ref").notNull(), // HRM.employee (logical)
    trade: text("trade").notNull(),
    grade: text("grade"),
    plantRef: uuid("plant_ref"),
    isCompetentPerson: boolean("is_competent_person").notNull().default(false),
    competencyNote: text("competency_note"),
  },
  (t) => [unique("uq_mnt_tech").on(t.tenantId, t.employeeRef)],
);

/* ================================= requests =============================== */

export const maintenanceRequest = pgTable(
  "maintenance_request",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    requestNo: text("request_no").notNull(),
    assetId: uuid("asset_id").notNull(),
    requestedByRef: uuid("requested_by_ref").notNull(), // HRM.employee (logical)
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    severity: text("severity").notNull(), // stopped | degraded | cosmetic
    symptomCode: text("symptom_code").notNull(),
    detail: text("detail"),
    photoKeys: jsonb("photo_keys").notNull().default([]),
    lineStopped: boolean("line_stopped").notNull().default(false),
    status: text("status").notNull().default("submitted"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    triagedBy: uuid("triaged_by"),
    mwoId: uuid("mwo_id"),
    rejectReason: text("reject_reason"),
    downtimeId: uuid("downtime_id"),
    slaRespondBy: timestamp("sla_respond_by", { withTimezone: true }).notNull(),
    slaConfigRef: text("sla_config_ref").notNull(),
    slaBreached: boolean("sla_breached").notNull().default(false),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    unique("uq_request_no").on(t.tenantId, t.requestNo),
    unique("uq_request_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_request_asset").on(t.tenantId, t.assetId),
    index("ix_request_mine").on(t.tenantId, t.requestedByRef),
  ],
);

/* ======================= the MWO and its children ========================= */

/** THE Maintenance Work Order. Distinct doctype from Production's order (§1.4). */
export const maintenanceWorkOrder = pgTable(
  "maintenance_work_order",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    mwoNo: text("mwo_no").notNull(),
    assetId: uuid("asset_id").notNull(),
    mwoType: text("mwo_type").notNull(), // breakdown|corrective|preventive|statutory|improvement
    priority: text("priority").notNull(), // P1..P4
    priorityOverrideReason: text("priority_override_reason"),
    status: text("status").notNull().default("draft"),
    source: text("source").notNull(), // request | pm_occurrence | manual | inspection_finding
    requestId: uuid("request_id"),
    pmOccurrenceId: uuid("pm_occurrence_id"),
    title: text("title").notNull(),
    description: text("description"),
    costCentreRef: text("cost_centre_ref"),
    primaryTechRef: uuid("primary_tech_ref"), // HRM.employee (logical)
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    plannedStart: timestamp("planned_start", { withTimezone: true }),
    plannedEnd: timestamp("planned_end", { withTimezone: true }),
    actualStart: timestamp("actual_start", { withTimezone: true }),
    actualEnd: timestamp("actual_end", { withTimezone: true }),
    slaRespondBy: timestamp("sla_respond_by", { withTimezone: true }),
    slaRestoreBy: timestamp("sla_restore_by", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    slaBreached: boolean("sla_breached").notNull().default(false),
    holdReason: text("hold_reason"),
    holdNote: text("hold_note"),
    heldAt: timestamp("held_at", { withTimezone: true }),
    // failure coding: mandatory at completion for breakdown/corrective (FR-MNT-036)
    failureModeId: uuid("failure_mode_id"),
    failureCauseId: uuid("failure_cause_id"),
    detectionId: uuid("detection_id"),
    failedComponentId: uuid("failed_component_id"),
    isSafetyRelated: boolean("is_safety_related").notNull().default(false),
    incidentRef: text("incident_ref"), // Inspection M08 hand-off (logical)
    competentPersonRef: uuid("competent_person_ref"),
    amcContractId: uuid("amc_contract_id"),
    // cost snapshot: derived, recomputable, idempotent. cost_total is GENERATED in SQL.
    costLabour: numeric("cost_labour", { precision: 18, scale: 2 }).notNull().default("0"),
    costSpares: numeric("cost_spares", { precision: 18, scale: 2 }).notNull().default("0"),
    costExternal: numeric("cost_external", { precision: 18, scale: 2 }).notNull().default("0"),
    costTotal: numeric("cost_total", { precision: 18, scale: 2 }),
    costComputedAt: timestamp("cost_computed_at", { withTimezone: true }),
    workflowInstanceId: uuid("workflow_instance_id"),
    approvalRequiredReason: text("approval_required_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    unique("uq_mwo_no").on(t.tenantId, t.mwoNo),
    unique("uq_mwo_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_mwo_asset").on(t.tenantId, t.assetId),
    index("ix_mwo_tech").on(t.tenantId, t.primaryTechRef, t.status),
    index("ix_mwo_type_w").on(t.tenantId, t.mwoType, t.actualEnd),
  ],
);

export const mwoTask = pgTable(
  "mwo_task",
  {
    ...tenantScopedColumns,
    mwoId: uuid("mwo_id").notNull(),
    sequence: smallint("sequence").notNull(),
    instruction: text("instruction").notNull(),
    safetyNote: text("safety_note"),
    resultType: text("result_type").notNull().default("ok_not_ok"),
    expectedMin: numeric("expected_min", { precision: 18, scale: 4 }),
    expectedMax: numeric("expected_max", { precision: 18, scale: 4 }),
    uom: text("uom"),
    isMandatory: boolean("is_mandatory").notNull().default(true),
    resultValue: text("result_value"),
    resultPhotoKey: text("result_photo_key"),
    isPass: boolean("is_pass"),
    completedBy: uuid("completed_by"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    templateVersion: integer("template_version"),
  },
  (t) => [unique("uq_mwo_task_seq").on(t.tenantId, t.mwoId, t.sequence)],
);

/** `hours` is GENERATED in SQL from the two timestamps, and an EXCLUDE constraint stops a
 *  technician being in two places at once. Neither is application politeness. */
export const mwoLabour = pgTable(
  "mwo_labour",
  {
    ...tenantScopedColumns,
    mwoId: uuid("mwo_id").notNull(),
    employeeRef: uuid("employee_ref").notNull(), // HRM.employee (logical)
    workType: text("work_type").notNull().default("repair"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    hours: numeric("hours", { precision: 9, scale: 3 }),
    trade: text("trade"),
    grade: text("grade"),
    rateSource: text("rate_source"), // hrm | local_config
    rateConfigRef: text("rate_config_ref"),
    ratePerHour: numeric("rate_per_hour", { precision: 18, scale: 2 }),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    isBackdated: boolean("is_backdated").notNull().default(false),
    backdateReason: text("backdate_reason"),
    note: text("note"),
  },
  (t) => [index("ix_labour_mwo").on(t.tenantId, t.mwoId)],
);

/** A READ-ONLY MIRROR of Inventory-owned stock movements. `valuedAmount` is whatever
 *  Inventory returned under its own valuation method — never computed here. */
export const mwoSpare = pgTable(
  "mwo_spare",
  {
    ...tenantScopedColumns,
    mwoId: uuid("mwo_id").notNull(),
    itemRef: uuid("item_ref").notNull(), // Inventory/Engineering item (logical)
    itemCodeCache: text("item_code_cache"), // display cache only
    uom: text("uom").notNull(),
    warehouseRef: uuid("warehouse_ref"), // Inventory.warehouse (logical)
    qtyPlanned: numeric("qty_planned", { precision: 18, scale: 4 }).notNull().default("0"),
    qtyIssued: numeric("qty_issued", { precision: 18, scale: 4 }).notNull().default("0"),
    reservationRef: uuid("reservation_ref"),
    stockEntryRef: uuid("stock_entry_ref"), // Inventory stock entry — the authoritative doc
    valuedAmount: numeric("valued_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    issueStatus: text("issue_status").notNull().default("planned"),
    failureNote: text("failure_note"),
  },
  (t) => [index("ix_spare_mwo").on(t.tenantId, t.mwoId), index("ix_spare_item").on(t.tenantId, t.itemRef)],
);

/** External / AMC actuals mirrored back from Expenditure & Purchase. Read-only here;
 *  no maintenance role can create a payable (§14.3). */
export const mwoExternalCost = pgTable(
  "mwo_external_cost",
  {
    ...tenantScopedColumns,
    mwoId: uuid("mwo_id").notNull(),
    vendorRef: uuid("vendor_ref"),
    sourceModule: text("source_module").notNull(), // expenditure | purchase
    sourceDocRef: text("source_doc_ref").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    description: text("description"),
    recognisedAt: timestamp("recognised_at", { withTimezone: true }).notNull(),
    eventId: uuid("event_id").notNull(), // consumer_inbox dedup key
  },
  (t) => [unique("uq_extcost_event").on(t.tenantId, t.eventId), index("ix_extcost_mwo").on(t.tenantId, t.mwoId)],
);

/* ============================ downtime ==================================== */

/**
 * Downtime as an interval LEDGER, not a field on the asset.
 *
 * Overlap is a database impossibility here — a btree_gist EXCLUDE constraint over
 * (tenant, asset, tstzrange) is the arbiter, so two people reporting the same stop cannot
 * produce two clocks. `durationMinutes` is GENERATED from the endpoints and therefore can
 * never disagree with them.
 */
export const assetDowntime = pgTable(
  "asset_downtime",
  {
    ...tenantScopedColumns,
    assetId: uuid("asset_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    downtimeKind: text("downtime_kind").notNull().default("unplanned"),
    productionImpacting: boolean("production_impacting").notNull().default(true),
    reasonCode: text("reason_code"),
    source: text("source").notNull(), // request | mwo | pm_window | manual
    requestId: uuid("request_id"),
    mwoId: uuid("mwo_id"),
    pmOccurrenceId: uuid("pm_occurrence_id"),
    recordedBy: uuid("recorded_by").notNull(),
    corrected: boolean("corrected").notNull().default(false),
    correctionReason: text("correction_reason"),
    originalStartedAt: timestamp("original_started_at", { withTimezone: true }),
    originalEndedAt: timestamp("original_ended_at", { withTimezone: true }),
    disputed: boolean("disputed").notNull().default(false),
    disputeNote: text("dispute_note"),
    durationMinutes: integer("duration_minutes"),
    supersededBy: uuid("superseded_by"),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    unique("uq_downtime_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_downtime_win").on(t.tenantId, t.assetId, t.startedAt),
    index("ix_downtime_kpi").on(t.tenantId, t.startedAt, t.downtimeKind),
  ],
);

/* ======================= PM schedules & occurrences ======================== */

export const pmSchedule = pgTable(
  "pm_schedule",
  {
    ...tenantScopedColumns,
    pmsCode: text("pms_code").notNull(),
    name: text("name").notNull(),
    assetId: uuid("asset_id"),
    assetClassFilter: jsonb("asset_class_filter"),
    pmType: text("pm_type").notNull(), // calendar | meter | hybrid | statutory
    // calendar rules
    intervalValue: integer("interval_value"),
    intervalUnit: text("interval_unit"),
    anchorDate: date("anchor_date"),
    driftPolicy: text("drift_policy"), // fixed | floating
    // meter rules
    meterType: text("meter_type"),
    intervalMeterValue: numeric("interval_meter_value", { precision: 18, scale: 4 }),
    lastGeneratedMeter: numeric("last_generated_meter", { precision: 18, scale: 4 }),
    generateOnForecast: boolean("generate_on_forecast").notNull().default(true),
    // common
    leadDays: smallint("lead_days").notNull().default(7),
    graceDays: smallint("grace_days").notNull().default(3),
    maxOpenOccurrences: smallint("max_open_occurrences").notNull().default(1),
    estDurationMin: integer("est_duration_min"),
    trade: text("trade"),
    statutoryRef: text("statutory_ref"), // e.g. 'Factories Act 1948 s.29'
    requiresCompetentPerson: boolean("requires_competent_person").notNull().default(false),
    templateVersion: integer("template_version").notNull().default(1),
    ownerRef: uuid("owner_ref"),
    status: text("status").notNull().default("draft"),
    pauseReason: text("pause_reason"),
    pausedUntil: date("paused_until"),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    workflowInstanceId: uuid("workflow_instance_id"),
  },
  (t) => [unique("uq_pms_code").on(t.tenantId, t.pmsCode), index("ix_pms_due").on(t.tenantId, t.status, t.pmType)],
);

/** Versioned: an in-flight MWO keeps the template version it was instantiated from. */
export const pmTaskTemplate = pgTable(
  "pm_task_template",
  {
    ...tenantScopedColumns,
    pmScheduleId: uuid("pm_schedule_id").notNull(),
    version: integer("version").notNull(),
    sequence: smallint("sequence").notNull(),
    instruction: text("instruction").notNull(),
    safetyNote: text("safety_note"),
    resultType: text("result_type").notNull().default("ok_not_ok"),
    expectedMin: numeric("expected_min", { precision: 18, scale: 4 }),
    expectedMax: numeric("expected_max", { precision: 18, scale: 4 }),
    uom: text("uom"),
    isMandatory: boolean("is_mandatory").notNull().default(true),
  },
  (t) => [unique("uq_pm_task").on(t.tenantId, t.pmScheduleId, t.version, t.sequence)],
);

export const pmDefaultSpare = pgTable(
  "pm_default_spare",
  {
    ...tenantScopedColumns,
    pmScheduleId: uuid("pm_schedule_id").notNull(),
    itemRef: uuid("item_ref").notNull(),
    uom: text("uom").notNull(),
    qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
    reserveAhead: boolean("reserve_ahead").notNull().default(true),
  },
  (t) => [unique("uq_pm_spare").on(t.tenantId, t.pmScheduleId, t.itemRef)],
);

/** `UNIQUE (tenant, schedule, occurrence_seq)` is what makes generation idempotent under
 *  retries, redeploys and a manual re-run (NFR-05). */
export const pmOccurrence = pgTable(
  "pm_occurrence",
  {
    ...tenantScopedColumns,
    pmScheduleId: uuid("pm_schedule_id").notNull(),
    assetId: uuid("asset_id").notNull(),
    occurrenceSeq: integer("occurrence_seq").notNull(),
    dueDate: date("due_date"),
    dueMeterValue: numeric("due_meter_value", { precision: 18, scale: 4 }),
    dueBasis: text("due_basis"), // calendar | meter | forecast
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    mwoId: uuid("mwo_id"),
    status: text("status").notNull().default("scheduled"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedWithinGrace: boolean("completed_within_grace"),
    graceDaysSnapshot: smallint("grace_days_snapshot"),
    skipReason: text("skip_reason"),
    sparesReserved: boolean("spares_reserved").notNull().default(false),
    sparesNote: text("spares_note"),
    competentPersonRef: uuid("competent_person_ref"),
  },
  (t) => [
    unique("uq_pm_occ").on(t.tenantId, t.pmScheduleId, t.occurrenceSeq),
    index("ix_pm_occ_due").on(t.tenantId, t.status, t.dueDate),
    index("ix_pm_occ_asset").on(t.tenantId, t.assetId),
  ],
);

/* ============================== AMC & KPI ================================= */

/** A coverage MIRROR for decision support. The contract of record lives in
 *  Purchase/Expenditure and is not editable here. */
export const amcContract = pgTable(
  "amc_contract",
  {
    ...tenantScopedColumns,
    contractRef: text("contract_ref").notNull(),
    vendorRef: uuid("vendor_ref").notNull(),
    vendorNameCache: text("vendor_name_cache"),
    coverageType: text("coverage_type").notNull(), // comprehensive | labour_only | preventive_only
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to").notNull(),
    responseSlaHours: integer("response_sla_hours"),
    visitsContracted: smallint("visits_contracted"),
    visitsUsed: smallint("visits_used").notNull().default(0),
    contractValue: numeric("contract_value", { precision: 18, scale: 2 }),
  },
  (t) => [unique("uq_amc_ref").on(t.tenantId, t.contractRef)],
);

export const amcContractAsset = pgTable(
  "amc_contract_asset",
  {
    ...tenantScopedColumns,
    amcContractId: uuid("amc_contract_id").notNull(),
    assetId: uuid("asset_id").notNull(),
  },
  (t) => [unique("uq_amc_asset").on(t.tenantId, t.amcContractId, t.assetId)],
);

/** Nightly rollup so the dashboard reads a snapshot (NFR-03). Recomputable, never
 *  authoritative — `inputsDigest` is what proves a recompute reproduces it exactly. */
export const maintenanceKpiSnapshot = pgTable(
  "maintenance_kpi_snapshot",
  {
    ...tenantScopedColumns,
    scopeType: text("scope_type").notNull(), // asset | area | plant | criticality | tenant
    scopeRef: uuid("scope_ref"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    scheduledHours: numeric("scheduled_hours", { precision: 18, scale: 3 }),
    downtimeUnplannedHours: numeric("downtime_unplanned_hours", { precision: 18, scale: 3 }).notNull().default("0"),
    downtimePlannedHours: numeric("downtime_planned_hours", { precision: 18, scale: 3 }).notNull().default("0"),
    failureCount: integer("failure_count").notNull().default(0),
    mtbfHours: numeric("mtbf_hours", { precision: 18, scale: 3 }),
    mttrHours: numeric("mttr_hours", { precision: 18, scale: 3 }),
    availabilityPct: numeric("availability_pct", { precision: 7, scale: 4 }),
    pmDueCount: integer("pm_due_count").notNull().default(0),
    pmCompletedInGrace: integer("pm_completed_in_grace").notNull().default(0),
    pmCompliancePct: numeric("pm_compliance_pct", { precision: 7, scale: 4 }),
    scheduleAdherencePct: numeric("schedule_adherence_pct", { precision: 7, scale: 4 }),
    costLabour: numeric("cost_labour", { precision: 18, scale: 2 }).notNull().default("0"),
    costSpares: numeric("cost_spares", { precision: 18, scale: 2 }).notNull().default("0"),
    costExternal: numeric("cost_external", { precision: 18, scale: 2 }).notNull().default("0"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    staleSinceCorrection: boolean("stale_since_correction").notNull().default(false),
    inputsDigest: text("inputs_digest").notNull(),
  },
  (t) => [
    unique("uq_kpi_snap").on(t.tenantId, t.scopeType, t.scopeRef, t.periodStart, t.periodEnd),
    index("ix_kpi_scope").on(t.tenantId, t.scopeType, t.periodStart),
  ],
);
