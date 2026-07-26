import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * PLANNING / MRP (AXLE, Module 13) — what to make, what to buy, and by when.
 *
 * This module owns no masters that another module already owns. The item master and the
 * bill of materials belong to ENGINEERING; stock belongs to INVENTORY; sales orders to
 * SMBD; purchase orders to PURCHASE; work orders to PRODUCTION. Planning reads all of them
 * through app-level ports (§1.1) and writes exactly one thing of its own: a PLAN.
 *
 * That has one consequence worth stating, because it is a deliberate divergence from the
 * blueprint. PLANNING §11.1 persists the low-level code onto `item.low_level_code` — a
 * column on ENGINEERING's table. This module cannot add a column to another module's
 * system of record, so the planning attributes of an item (its level, lot rule, lead time,
 * safety stock, ABC class) live here, in `item_planning_policy`, keyed by a bare item_id
 * with no cross-module FK. Engineering describes what a part IS; Planning describes how it
 * is REPLENISHED. They were always two different things wearing one table.
 *
 * A planning run is treated as a financial document, not as a cache. Every run keeps its
 * inputs, its per-bucket arithmetic and its output, and none of it can be edited
 * afterwards — because the only question ever asked of a plan is "why did we buy fifty of
 * these in July?", and it is asked in November.
 */

// ---------------------------------------------------------------------------
// Calendars and capacity
// ---------------------------------------------------------------------------

// The working-day calendar a lead time is offset over. Mon–Sat is the ordinary Indian
// factory week; the offset walks working days, so a calendar edit changes every date in
// the plan — which is why it is a first-class row and not a constant.
export const planCalendar = pgTable(
  "plan_calendar",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    // ISO day numbers, 1 = Monday … 7 = Sunday.
    workingDays: jsonb("working_days").notNull().default([1, 2, 3, 4, 5, 6]),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [unique("uq_plancal_tenant_code").on(t.tenantId, t.code)],
);

export const planHoliday = pgTable(
  "plan_holiday",
  {
    ...tenantScopedColumns,
    calendarId: uuid("calendar_id").notNull(), // intra-module FK -> plan_calendar
    holidayDate: date("holiday_date").notNull(),
    name: text("name").notNull(),
  },
  (t) => [unique("uq_planhol_cal_date").on(t.tenantId, t.calendarId, t.holidayDate)],
);

// A machine, a bench, a cell — anything with a finite number of hours a week.
export const planWorkCentre = pgTable(
  "plan_work_centre",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    calendarId: uuid("calendar_id"), // intra-module FK -> plan_calendar; null = tenant default
    machineCount: integer("machine_count").notNull().default(1),
    // Stored as fractions, 0–1. See migration: both are constrained to (0, 1].
    utilisationPct: numeric("utilisation_pct", { precision: 5, scale: 4 }).notNull().default("0.85"),
    efficiencyPct: numeric("efficiency_pct", { precision: 5, scale: 4 }).notNull().default("0.9"),
    isBottleneck: boolean("is_bottleneck").notNull().default(false),
    costCentreRef: text("cost_centre_ref"),
  },
  (t) => [unique("uq_planwc_tenant_code").on(t.tenantId, t.code)],
);

export const planShift = pgTable(
  "plan_shift",
  {
    ...tenantScopedColumns,
    workCentreId: uuid("work_centre_id").notNull(), // intra-module FK -> plan_work_centre
    name: text("name").notNull(),
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
    days: jsonb("days").notNull().default([1, 2, 3, 4, 5, 6]),
  },
  (t) => [unique("uq_planshift_wc_name").on(t.tenantId, t.workCentreId, t.name)],
);

// Hours a centre will NOT have in a given week — a maintenance block, a shutdown. Removed
// after the utilisation and efficiency factors, because it costs real machine time.
export const planWcDowntime = pgTable(
  "plan_wc_downtime",
  {
    ...tenantScopedColumns,
    workCentreId: uuid("work_centre_id").notNull(),
    bucket: text("bucket").notNull(), // ISO week label, e.g. 2026-W30
    hours: numeric("hours", { precision: 8, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [unique("uq_planwcdt_wc_bucket").on(t.tenantId, t.workCentreId, t.bucket)],
);

// How an item is made: which centre, how long to set up, how long per unit. Capacity load
// is this table multiplied by the plan.
export const planRoutingOperation = pgTable(
  "plan_routing_operation",
  {
    ...tenantScopedColumns,
    itemId: uuid("item_id").notNull(), // cross-module logical ref (ENGINEERING owns the item)
    itemCode: text("item_code").notNull(), // denormalised so a load report reads without a join across the boundary
    operationSeq: integer("operation_seq").notNull(),
    workCentreId: uuid("work_centre_id").notNull(),
    alternateWorkCentreId: uuid("alternate_work_centre_id"),
    description: text("description").notNull(),
    setupHours: numeric("setup_hours", { precision: 8, scale: 3 }).notNull().default("0"),
    runHoursPerUnit: numeric("run_hours_per_unit", { precision: 10, scale: 4 }).notNull().default("0"),
  },
  (t) => [
    unique("uq_planrouting_item_seq").on(t.tenantId, t.itemId, t.operationSeq),
    index("ix_planrouting_tenant_wc").on(t.tenantId, t.workCentreId),
  ],
);

// ---------------------------------------------------------------------------
// Planning policy — how each item is replenished
// ---------------------------------------------------------------------------

export const itemPlanningPolicy = pgTable(
  "item_planning_policy",
  {
    ...tenantScopedColumns,
    itemId: uuid("item_id").notNull(), // cross-module logical ref, no FK (§1.1)
    itemCode: text("item_code").notNull(),
    // Computed from the BOM graph on every run; stored so a plan can be explained without
    // recomputing the whole product structure.
    lowLevelCode: integer("low_level_code").notNull().default(0),
    planningMethod: text("planning_method").notNull().default("mrp"), // mrp | reorder_point | min_max | none
    sourceType: text("source_type").notNull(), // make | buy
    lotRule: text("lot_rule").notNull().default("L4L"), // L4L | FOQ | MOQ | MULT | EOQ | POQ
    lotSize: numeric("lot_size", { precision: 18, scale: 3 }),
    minOrderQty: numeric("min_order_qty", { precision: 18, scale: 3 }),
    leadTimeWorkingDays: integer("lead_time_working_days").notNull().default(0),
    safetyStock: numeric("safety_stock", { precision: 18, scale: 3 }).notNull().default("0"),
    serviceLevel: numeric("service_level", { precision: 4, scale: 3 }),
    abcClass: text("abc_class"), // A | B | C
    uomPrecision: integer("uom_precision").notNull().default(0),
    // EOQ inputs — kept beside the rule that uses them so a planner can see why a number is 283.
    annualDemand: numeric("annual_demand", { precision: 18, scale: 3 }),
    orderCost: numeric("order_cost", { precision: 18, scale: 2 }),
    holdingCost: numeric("holding_cost", { precision: 18, scale: 2 }),
    // Reorder-point items only. A row carrying BOTH this and planning_method='mrp' is
    // refused by the database — that combination orders everything twice.
    reorderPoint: numeric("reorder_point", { precision: 18, scale: 3 }),
    maxLevel: numeric("max_level", { precision: 18, scale: 3 }),
    isMpsItem: boolean("is_mps_item").notNull().default(false),
    demandTimeFenceBuckets: integer("demand_time_fence_buckets").notNull().default(0),
    planningTimeFenceBuckets: integer("planning_time_fence_buckets").notNull().default(0),
    plannerRef: text("planner_ref"), // who owns this item's plan
  },
  (t) => [
    unique("uq_planpolicy_tenant_item").on(t.tenantId, t.itemId),
    index("ix_planpolicy_tenant_llc").on(t.tenantId, t.lowLevelCode),
    index("ix_planpolicy_tenant_method").on(t.tenantId, t.planningMethod),
  ],
);

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------

// The planner's forecast, by item and bucket. Real orders CONSUME this rather than adding
// to it — see the forecast-consumption brain.
export const planForecast = pgTable(
  "plan_forecast",
  {
    ...tenantScopedColumns,
    itemId: uuid("item_id").notNull(),
    itemCode: text("item_code").notNull(),
    bucket: text("bucket").notNull(),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    source: text("source").notNull().default("manual"), // manual | csv_import | copy_last_year
    note: text("note"),
  },
  (t) => [unique("uq_planfc_item_bucket").on(t.tenantId, t.itemId, t.bucket)],
);

// Independent demand that is not a sales order and not a forecast: spares, service,
// inter-plant. Sales-order demand is read through the demand port at run time and
// snapshotted onto the run, never copied into a master here.
export const planDemandLine = pgTable(
  "plan_demand_line",
  {
    ...tenantScopedColumns,
    itemId: uuid("item_id").notNull(),
    itemCode: text("item_code").notNull(),
    bucket: text("bucket").notNull(),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    demandKind: text("demand_kind").notNull().default("spares"), // spares | service | interplant
    ref: text("ref").notNull(),
  },
  (t) => [index("ix_plandemand_tenant_item").on(t.tenantId, t.itemId, t.bucket)],
);

// The master production schedule: one row per MPS item per bucket, with the projected
// on-hand and the available-to-promise the sales desk quotes from.
export const mpsRow = pgTable(
  "mps_row",
  {
    ...tenantScopedColumns,
    itemId: uuid("item_id").notNull(),
    itemCode: text("item_code").notNull(),
    bucket: text("bucket").notNull(),
    mpsReceiptQty: numeric("mps_receipt_qty", { precision: 18, scale: 3 }).notNull().default("0"),
    forecastQty: numeric("forecast_qty", { precision: 18, scale: 3 }).notNull().default("0"),
    orderQty: numeric("order_qty", { precision: 18, scale: 3 }).notNull().default("0"),
    demandQty: numeric("demand_qty", { precision: 18, scale: 3 }).notNull().default("0"),
    projectedOnHand: numeric("projected_on_hand", { precision: 18, scale: 3 }).notNull().default("0"),
    atp: numeric("atp", { precision: 18, scale: 3 }),
    fence: text("fence").notNull().default("free"), // frozen | firm | free
    // Set only when a frozen bucket was changed — the reason IS the record.
    overrideBy: uuid("override_by"),
    overrideReason: text("override_reason"),
  },
  (t) => [unique("uq_mpsrow_item_bucket").on(t.tenantId, t.itemId, t.bucket)],
);

// ---------------------------------------------------------------------------
// The run and its output
// ---------------------------------------------------------------------------

export const mrpRun = pgTable(
  "mrp_run",
  {
    ...tenantScopedColumns,
    runNo: text("run_no").notNull(),
    runType: text("run_type").notNull().default("regenerative"), // regenerative | net_change
    // The date the plan was computed AS OF. Not the same as created_at: a run can be made
    // for a Monday on the preceding Friday, and every past-due flag depends on which.
    planningDate: date("planning_date").notNull(),
    horizonBuckets: integer("horizon_buckets").notNull(),
    firstBucket: text("first_bucket").notNull(),
    lastBucket: text("last_bucket").notNull(),
    status: text("status").notNull().default("completed"), // running | completed | failed
    itemCount: integer("item_count").notNull().default(0),
    plannedOrderCount: integer("planned_order_count").notNull().default(0),
    exceptionCount: integer("exception_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    // Every input that could change the answer, so a run can be re-derived exactly.
    params: jsonb("params").notNull().default({}),
    warnings: jsonb("warnings").notNull().default([]),
    failureReason: text("failure_reason"),
  },
  (t) => [
    unique("uq_mrprun_tenant_no").on(t.tenantId, t.runNo),
    index("ix_mrprun_tenant_date").on(t.tenantId, t.planningDate),
  ],
);

export const mrpRunItem = pgTable(
  "mrp_run_item",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(), // intra-module FK -> mrp_run
    itemId: uuid("item_id").notNull(),
    itemCode: text("item_code").notNull(),
    lowLevelCode: integer("low_level_code").notNull(),
    sourceType: text("source_type").notNull(),
    openingAvailable: numeric("opening_available", { precision: 18, scale: 3 }).notNull(),
    safetyStock: numeric("safety_stock", { precision: 18, scale: 3 }).notNull(),
    warnings: jsonb("warnings").notNull().default([]),
  },
  (t) => [unique("uq_mrprunitem_run_item").on(t.tenantId, t.runId, t.itemId)],
);

// The per-bucket arithmetic, kept. This is the working, and it is what makes "why fifty?"
// answerable without re-running anything.
export const mrpRunBucket = pgTable(
  "mrp_run_bucket",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    itemId: uuid("item_id").notNull(),
    bucket: text("bucket").notNull(),
    bucketSeq: integer("bucket_seq").notNull(),
    grossRequirement: numeric("gross_requirement", { precision: 18, scale: 3 }).notNull(),
    scheduledReceipts: numeric("scheduled_receipts", { precision: 18, scale: 3 }).notNull(),
    projectedAvailableOpening: numeric("projected_available_opening", { precision: 18, scale: 3 }).notNull(),
    netRequirement: numeric("net_requirement", { precision: 18, scale: 3 }).notNull(),
    plannedReceipt: numeric("planned_receipt", { precision: 18, scale: 3 }).notNull(),
    projectedAvailable: numeric("projected_available", { precision: 18, scale: 3 }).notNull(),
  },
  (t) => [
    unique("uq_mrprunbucket").on(t.tenantId, t.runId, t.itemId, t.bucket),
    index("ix_mrprunbucket_tenant_run").on(t.tenantId, t.runId, t.itemId),
  ],
);

export const plannedOrder = pgTable(
  "planned_order",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    orderKey: text("order_key").notNull(), // ITEM@BUCKET — deterministic within a run
    itemId: uuid("item_id").notNull(),
    itemCode: text("item_code").notNull(),
    sourceType: text("source_type").notNull(), // make | buy
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    netRequirement: numeric("net_requirement", { precision: 18, scale: 3 }).notNull(),
    lotRule: text("lot_rule").notNull(),
    lotReason: text("lot_reason").notNull(),
    receiptBucket: text("receipt_bucket").notNull(),
    needDate: date("need_date").notNull(),
    releaseBucket: text("release_bucket").notNull(),
    releaseDate: date("release_date").notNull(),
    // What the lead time actually asked for, before clamping to today. Keeping both is the
    // difference between "this is late" and a back-dated order that hides it.
    computedReleaseBucket: text("computed_release_bucket").notNull(),
    computedReleaseDate: date("computed_release_date").notNull(),
    pastDue: boolean("past_due").notNull().default(false),
    daysLate: integer("days_late").notNull().default(0),
    status: text("status").notNull().default("planned"), // planned | firmed | converted | cancelled
    firmedBy: uuid("firmed_by"),
    firmedAt: timestamp("firmed_at", { withTimezone: true }),
    // Where it went when a human turned it into a real document.
    convertedToKind: text("converted_to_kind"), // production_order | purchase_requisition
    convertedToRef: text("converted_to_ref"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_plannedorder_run_key").on(t.tenantId, t.runId, t.orderKey),
    index("ix_plannedorder_tenant_status").on(t.tenantId, t.status),
    index("ix_plannedorder_tenant_release").on(t.tenantId, t.releaseBucket),
  ],
);

// Why this order exists. Written once, with the order, and never edited — the pegging
// graph is the plan's reasoning and a reasoning that can be revised is not one.
export const plannedOrderPeg = pgTable(
  "planned_order_peg",
  {
    ...tenantScopedColumns,
    plannedOrderId: uuid("planned_order_id").notNull(), // intra-module FK
    runId: uuid("run_id").notNull(),
    sourceKind: text("source_kind").notNull(), // planned_order | sales_order | forecast | spares
    sourceRef: text("source_ref").notNull(),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
  },
  (t) => [index("ix_plannedorderpeg_tenant_order").on(t.tenantId, t.plannedOrderId)],
);

export const planException = pgTable(
  "plan_exception",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    exceptionType: text("exception_type").notNull(),
    severity: text("severity").notNull(), // critical | high | medium | low
    itemId: uuid("item_id").notNull(),
    itemCode: text("item_code").notNull(),
    ref: text("ref").notNull(),
    message: text("message").notNull(),
    suggestion: text("suggestion").notNull(),
    currentBucket: text("current_bucket"),
    suggestedBucket: text("suggested_bucket"),
    bucketsMoved: integer("buckets_moved"),
    pegKind: text("peg_kind").notNull().default("none"),
    pegRef: text("peg_ref"),
    status: text("status").notNull().default("open"), // open | accepted | snoozed | closed
    snoozedUntil: date("snoozed_until"),
    actionedBy: uuid("actioned_by"),
    actionedAt: timestamp("actioned_at", { withTimezone: true }),
    actionNote: text("action_note"),
  },
  (t) => [
    index("ix_planexc_tenant_status_sev").on(t.tenantId, t.status, t.severity),
    index("ix_planexc_tenant_run").on(t.tenantId, t.runId),
  ],
);

export const planCapacityLoad = pgTable(
  "plan_capacity_load",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    workCentreId: uuid("work_centre_id").notNull(),
    workCentreCode: text("work_centre_code").notNull(),
    bucket: text("bucket").notNull(),
    availableHours: numeric("available_hours", { precision: 10, scale: 2 }).notNull(),
    loadHours: numeric("load_hours", { precision: 10, scale: 2 }).notNull(),
    loadPct: numeric("load_pct", { precision: 8, scale: 2 }),
    status: text("status").notNull(), // idle | green | amber | red | no_capacity
    overloadHours: numeric("overload_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  },
  (t) => [unique("uq_plancapload").on(t.tenantId, t.runId, t.workCentreId, t.bucket)],
);

// A scheduling PROPOSAL. It never auto-publishes: a planner runs it, a manager approves it.
export const planSchedule = pgTable(
  "plan_schedule",
  {
    ...tenantScopedColumns,
    scheduleNo: text("schedule_no").notNull(),
    rule: text("rule").notNull(), // EDD | SPT | CR
    planningDate: date("planning_date").notNull(),
    status: text("status").notNull().default("draft"), // draft | published | superseded
    lateOrderCount: integer("late_order_count").notNull().default(0),
    totalTardinessDays: integer("total_tardiness_days").notNull().default(0),
    makespanDays: integer("makespan_days").notNull().default(0),
    note: text("note").notNull().default(""),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [unique("uq_planschedule_tenant_no").on(t.tenantId, t.scheduleNo)],
);

export const planScheduleOp = pgTable(
  "plan_schedule_op",
  {
    ...tenantScopedColumns,
    scheduleId: uuid("schedule_id").notNull(), // intra-module FK
    orderRef: text("order_ref").notNull(),
    itemCode: text("item_code").notNull(),
    operationSeq: integer("operation_seq").notNull(),
    workCentreId: uuid("work_centre_id").notNull(),
    workCentreCode: text("work_centre_code").notNull(),
    hours: numeric("hours", { precision: 10, scale: 2 }).notNull(),
    dueDate: date("due_date").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    startHourOfDay: numeric("start_hour_of_day", { precision: 6, scale: 2 }).notNull(),
    endHourOfDay: numeric("end_hour_of_day", { precision: 6, scale: 2 }).notNull(),
    daysLate: integer("days_late").notNull().default(0),
    isLocked: boolean("is_locked").notNull().default(false),
  },
  (t) => [unique("uq_planschedop").on(t.tenantId, t.scheduleId, t.orderRef, t.operationSeq)],
);

export const planNumberSeries = pgTable(
  "plan_number_series",
  {
    ...tenantScopedColumns,
    seriesKey: text("series_key").notNull(), // mrp_run | schedule | requisition
    fiscalYear: text("fiscal_year").notNull(),
    prefix: text("prefix").notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    width: integer("width").notNull().default(5),
  },
  (t) => [unique("uq_plannumseries").on(t.tenantId, t.seriesKey, t.fiscalYear)],
);

// A planned buy order a human has approved for procurement to act on. Planning does not
// raise purchase orders — PURCHASE owns those — so this is the hand-off document, and it
// carries the planned order it came from so the pegging chain survives conversion.
export const purchaseRequisition = pgTable(
  "purchase_requisition",
  {
    ...tenantScopedColumns,
    reqNo: text("req_no").notNull(),
    plannedOrderId: uuid("planned_order_id").notNull(), // intra-module FK -> planned_order
    itemId: uuid("item_id").notNull(),
    itemCode: text("item_code").notNull(),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    needDate: date("need_date").notNull(),
    releaseDate: date("release_date").notNull(),
    suggestedVendorRef: text("suggested_vendor_ref"),
    status: text("status").notNull().default("open"), // open | ordered | cancelled
    purchaseOrderRef: text("purchase_order_ref"),
    note: text("note"),
  },
  (t) => [
    unique("uq_purchreq_tenant_no").on(t.tenantId, t.reqNo),
    index("ix_purchreq_tenant_status").on(t.tenantId, t.status),
  ],
);
