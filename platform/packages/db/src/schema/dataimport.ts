import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * SPREADSHEET IMPORT (migration 0096).
 *
 * See the migration for the reasoning. The short version: the factories this is sold into
 * already hold their operational truth in Excel, so an import is a permanent integration
 * path and needs the same evidence trail as every other inbound route — what arrived, what
 * was accepted, what was refused, and why.
 *
 * The two columns worth noticing from a reader's point of view:
 *
 *   `content_hash`    the same bytes, mapped the same way, to the same target is ONE
 *                     import. A re-post resumes it. This is what stops the classic
 *                     duplicate-master afternoon, where a dropped connection is followed by
 *                     an operator re-uploading the whole file.
 *   `idempotency_key` on the ROW, not the batch. Each row is committed through the domain
 *                     endpoint under a deterministic key, so a resume after a crash between
 *                     the domain write and the bookkeeping replays the first answer instead
 *                     of creating a second customer.
 */

/** One upload: the file, the sheet, the mapping, the target, and how it went. */
export const dataImportBatch = pgTable(
  "data_import_batch",
  {
    ...tenantScopedColumns,
    /**
     * Where this data came from. Only `uploaded_file` exists today, and the column exists
     * anyway: the UI distinguishes a connected source, an uploaded file and demo data, and
     * that promise is only keepable if provenance is recorded rather than inferred.
     */
    sourceKind: text("source_kind").notNull().default("uploaded_file"),
    filename: text("filename").notNull(),
    /** csv | xlsx | xls — what the parser actually read, not what the extension claimed. */
    fileKind: text("file_kind").notNull(),
    byteSize: integer("byte_size").notNull(),
    /** sha256 over the bytes + sheet + target + canonical mapping. Unique per tenant. */
    contentHash: text("content_hash").notNull(),
    sheetName: text("sheet_name").notNull(),
    target: text("target").notNull(),
    mapping: jsonb("mapping").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    /** skip | import_anyway. Defaults to skip so an import never talks past a duplicate warning. */
    onDuplicate: text("on_duplicate").notNull().default("skip"),
    /** running | completed | partial | failed */
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_dibatch_tenant_id").on(t.tenantId, t.id),
    unique("uq_dibatch_tenant_content").on(t.tenantId, t.contentHash),
    index("ix_dibatch_tenant_started").on(t.tenantId, t.startedAt),
  ],
);

/** One spreadsheet row and what became of it — kept whether it succeeded or not. */
export const dataImportRow = pgTable(
  "data_import_row",
  {
    ...tenantScopedColumns,
    batchId: uuid("batch_id").notNull(),
    /** The 1-based row number as displayed in Excel, so an error points at what they see. */
    rowNo: integer("row_no").notNull(),
    /** Rows sharing this become one document — three lines of one sales order. */
    groupKey: text("group_key"),
    /** The cells as read, before coercion. The evidence behind every rejection. */
    raw: jsonb("raw").notNull(),
    /** The coerced values that were sent, or would have been. */
    mapped: jsonb("mapped"),
    issues: jsonb("issues"),
    /** accepted | rejected | imported | failed | duplicate_suspected | skipped */
    status: text("status").notNull().default("accepted"),
    idempotencyKey: text("idempotency_key").notNull(),
    resultId: uuid("result_id"),
    /** The number a person would quote back: SO-0007, or the code that was created. */
    resultRef: text("result_ref"),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
  },
  (t) => [
    unique("uq_dirow_batch_rowno").on(t.tenantId, t.batchId, t.rowNo),
    unique("uq_dirow_tenant_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_dirow_tenant_batch").on(t.tenantId, t.batchId, t.rowNo),
    index("ix_dirow_tenant_batch_status").on(t.tenantId, t.batchId, t.status),
    foreignKey({
      name: "fk_dirow_batch_tenant",
      columns: [t.tenantId, t.batchId],
      foreignColumns: [dataImportBatch.tenantId, dataImportBatch.id],
    }).onDelete("restrict"),
  ],
);
