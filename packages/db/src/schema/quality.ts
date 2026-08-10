import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { amendableColumns, tenantScopedColumns } from "./columns.js";

/**
 * INSPECTION / QMS (KILN, Module 06) — the quality system of record.
 *
 * Boundary rules from the blueprint, enforced here and in the service:
 *  - The transactional GATE stays with the module that owns the transaction (Purchase's
 *    GRN, Production's manufacture). Quality owns the DEFINITION and the RECORD, and
 *    exposes requestInspection()/gateStatus() through the INSPECTION_GATE port (§1.2).
 *  - Rejected stock is INVENTORY's: a disposition never writes the stock ledger, it posts
 *    through the STOCK_POSTER port and stores the returned entry id (§1.4).
 *  - item/warehouse/supplier/ref ids are cross-module LOGICAL refs — no FK across a
 *    module boundary (§1.1).
 */

/** Spec master. EFFECTIVE-DATED: a spec change is a new row, never an update, so a
 *  two-year-old inspection still resolves the spec that applied on its date. */
export const qmsCharacteristic = pgTable(
  "qms_characteristic",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    itemRef: uuid("item_ref"), // logical -> Engineering item; NULL = generic
    charType: text("char_type").notNull(), // variable | attribute
    nominal: numeric("nominal", { precision: 18, scale: 6 }),
    usl: numeric("usl", { precision: 18, scale: 6 }),
    lsl: numeric("lsl", { precision: 18, scale: 6 }),
    uom: text("uom"),
    defectClass: text("defect_class").notNull().default("major"), // critical | major | minor
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [
    unique("uq_qmschar_code_from").on(t.tenantId, t.code, t.effectiveFrom),
    index("ix_qmschar_tenant_item").on(t.tenantId, t.itemRef),
  ],
);

/** Sampling tables are CONFIGURATION, not code — a tenant loads a customer-mandated plan
 *  without a release. plan_table holds the lot-size bands (see platform/quality/sampling). */
export const qmsSamplingPlan = pgTable(
  "qms_sampling_plan",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    standard: text("standard").notNull(), // iso_2859_1_style | fixed_n | percentage | hundred_percent | c_equals_zero
    inspectionLevel: text("inspection_level"),
    aql: numeric("aql", { precision: 6, scale: 3 }),
    fixedN: integer("fixed_n"),
    percentage: numeric("percentage", { precision: 6, scale: 3 }),
    planTable: jsonb("plan_table").notNull().default([]),
  },
  (t) => [unique("uq_qmsplan_code").on(t.tenantId, t.code)],
);

/** Versioned inspection template. Only ONE active template per (type, item) scope —
 *  ambiguity becomes a constraint violation at activation, not a surprise at the bay. */
export const qmsInspectionTemplate = pgTable(
  "qms_inspection_template",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    inspectionType: text("inspection_type").notNull(), // incoming | in_process | final | pre_dispatch | ...
    itemRef: uuid("item_ref"), // logical
    samplingPlanId: uuid("sampling_plan_id"), // intra-module FK
    versionNo: integer("version_no").notNull().default(1),
    status: text("status").notNull().default("draft"), // draft | active | superseded | obsolete
  },
  (t) => [unique("uq_qmstmpl_code_version").on(t.tenantId, t.code, t.versionNo)],
);

/** Template line: which characteristic, in what order, with optional limit overrides. */
export const qmsTemplateCharacteristic = pgTable(
  "qms_template_characteristic",
  {
    ...tenantScopedColumns,
    templateId: uuid("template_id").notNull(), // intra-module FK
    characteristicId: uuid("characteristic_id").notNull(), // intra-module FK
    seq: integer("seq").notNull(),
    overrideUsl: numeric("override_usl", { precision: 18, scale: 6 }),
    overrideLsl: numeric("override_lsl", { precision: 18, scale: 6 }),
    isMandatory: boolean("is_mandatory").notNull().default(true),
  },
  (t) => [unique("uq_qmstmplchar_seq").on(t.tenantId, t.templateId, t.seq)],
);

/** The inspection record — system of record for every inspection in the suite. */
export const qmsInspection = pgTable(
  "qms_inspection",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    inspectionNo: text("inspection_no").notNull(),
    templateId: uuid("template_id"),
    templateVersion: integer("template_version"),
    inspectionType: text("inspection_type").notNull(),
    refType: text("ref_type").notNull(), // grn | manufacture | subcontract_receipt | job_card | standalone | ...
    refId: text("ref_id"), // logical id in the OWNING module
    itemRef: uuid("item_ref"),
    sourceWarehouseRef: uuid("source_warehouse_ref"), // where the lot physically sits
    lotQty: numeric("lot_qty", { precision: 18, scale: 3 }),
    samplingPlanId: uuid("sampling_plan_id"),
    sampleSize: integer("sample_size"),
    acceptNumber: integer("accept_number"),
    rejectNumber: integer("reject_number"),
    samplingRationale: text("sampling_rationale"), // the derivation, in words, stored
    verdictRationale: text("verdict_rationale"),
    inspectorRef: uuid("inspector_ref"),
    completedAt: text("completed_at"),
    result: text("result").notNull().default("pending"), // pending | accepted | rejected | cancelled
    status: text("status").notNull().default("pending"), // pending | in_progress | completed | cancelled
    qtyAccepted: numeric("qty_accepted", { precision: 18, scale: 3 }),
    qtyRejected: numeric("qty_rejected", { precision: 18, scale: 3 }),
  },
  (t) => [
    unique("uq_qmsinsp_tenant_no").on(t.tenantId, t.inspectionNo),
    index("ix_qmsinsp_tenant_status").on(t.tenantId, t.status),
    index("ix_qmsinsp_tenant_item").on(t.tenantId, t.itemRef),
  ],
);

/** One measurement. Spec limits are SNAPSHOTTED here: a later spec revision must never
 *  silently change the pass/fail verdict of a historical inspection. */
export const qmsInspectionReading = pgTable(
  "qms_inspection_reading",
  {
    ...tenantScopedColumns,
    inspectionId: uuid("inspection_id").notNull(), // intra-module FK
    characteristicId: uuid("characteristic_id").notNull(),
    sampleNo: integer("sample_no").notNull(),
    readingNumeric: numeric("reading_numeric", { precision: 18, scale: 6 }),
    readingBool: boolean("reading_bool"),
    appliedUsl: numeric("applied_usl", { precision: 18, scale: 6 }),
    appliedLsl: numeric("applied_lsl", { precision: 18, scale: 6 }),
    appliedDefectClass: text("applied_defect_class"),
    isWithinSpec: boolean("is_within_spec").notNull(),
    deviation: numeric("deviation", { precision: 18, scale: 6 }).notNull().default("0"),
  },
  (t) => [
    unique("uq_qmsreading_sample").on(t.tenantId, t.inspectionId, t.characteristicId, t.sampleNo),
    index("ix_qmsreading_tenant_insp").on(t.tenantId, t.inspectionId),
  ],
);

/** What happens to the rejected quantity. `executed` is impossible without a stock entry —
 *  Quality never writes the ledger, Inventory does (§1.4). */
export const qmsDisposition = pgTable(
  "qms_disposition",
  {
    ...tenantScopedColumns,
    dispositionNo: text("disposition_no").notNull(),
    inspectionId: uuid("inspection_id").notNull(), // intra-module FK
    dispositionType: text("disposition_type").notNull(), // scrap | return_to_supplier | rework | quarantine | accept
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    reason: text("reason").notNull(),
    fromWarehouseRef: uuid("from_warehouse_ref"),
    targetWarehouseRef: uuid("target_warehouse_ref"),
    status: text("status").notNull().default("proposed"), // proposed | executed | movement_failed
    inventoryMovementRef: text("inventory_movement_ref"), // the stock entry id Inventory returned
  },
  (t) => [
    unique("uq_qmsdisp_tenant_no").on(t.tenantId, t.dispositionNo),
    index("ix_qmsdisp_tenant_insp").on(t.tenantId, t.inspectionId),
  ],
);

/** A real non-conformance record linked back to the evidence that raised it. */
export const qmsFinding = pgTable(
  "qms_finding",
  {
    ...tenantScopedColumns,
    findingNo: text("finding_no").notNull(),
    sourceType: text("source_type").notNull(), // inspection | audit | complaint | supplier | manual
    sourceRef: text("source_ref").notNull(),
    inspectionId: uuid("inspection_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull(), // critical | major | minor
    status: text("status").notNull().default("new"),
    ownerRef: text("owner_ref").notNull(),
    dueDate: date("due_date"),
    containment: text("containment"),
    containedAt: timestamp("contained_at", { withTimezone: true }),
    rootCause: text("root_cause"),
    rootCauseConfirmedBy: uuid("root_cause_confirmed_by"),
    rootCauseConfirmedAt: timestamp("root_cause_confirmed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by"),
    closureReason: text("closure_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    unique("uq_qmsfinding_no").on(t.tenantId, t.findingNo),
    unique("uq_qmsfinding_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_qmsfinding_status").on(t.tenantId, t.status, t.dueDate),
    index("ix_qmsfinding_source").on(t.tenantId, t.sourceType, t.sourceRef),
  ],
);

/** Corrective action with an explicit effectiveness decision; completion is not closure. */
export const qmsCorrectiveAction = pgTable(
  "qms_corrective_action",
  {
    ...tenantScopedColumns,
    capaNo: text("capa_no").notNull(),
    findingId: uuid("finding_id").notNull(),
    title: text("title").notNull(),
    actionPlan: text("action_plan").notNull(),
    ownerRef: text("owner_ref").notNull(),
    dueDate: date("due_date").notNull(),
    status: text("status").notNull().default("planned"),
    effectivenessCriteria: text("effectiveness_criteria").notNull(),
    completionEvidence: text("completion_evidence"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    effectivenessResult: text("effectiveness_result").notNull().default("pending"),
    effectivenessEvidence: text("effectiveness_evidence"),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    unique("uq_qmscapa_no").on(t.tenantId, t.capaNo),
    unique("uq_qmscapa_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_qmscapa_status").on(t.tenantId, t.status, t.dueDate),
    index("ix_qmscapa_finding").on(t.tenantId, t.findingId),
  ],
);
