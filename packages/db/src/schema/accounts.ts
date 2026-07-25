import { sql } from "drizzle-orm";
import { boolean, date, index, integer, numeric, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * ACCOUNTS (RASP, Module 08) — the general ledger and the AR subledger.
 *
 * The governing rule (ACCOUNTS §1.3): **never re-post what a sibling already valued.**
 * Accounts validates that a journal BALANCES, that its period is OPEN, that its accounts
 * EXIST and are POSTABLE, and that the instruction is NOT A DUPLICATE — nothing else.
 *
 * The journal is append-only and guarded in three independent layers (§9.4): a deferred
 * constraint trigger asserting the balance, BEFORE UPDATE/DELETE triggers, and a REVOKED
 * grant. Correction is a reversal voucher, never a mutation.
 */

export const glAccount = pgTable(
  "gl_account",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(), // asset | liability | equity | income | expense
    /** Only postable accounts accept journal lines; headers exist to group. */
    isPostable: boolean("is_postable").notNull().default(true),
    parentCode: text("parent_code"),
  },
  (t) => [unique("uq_glaccount_tenant_code").on(t.tenantId, t.code)],
);

/** A journal may only post into an OPEN period — the close is what makes a book final. */
export const accPeriod = pgTable(
  "acc_period",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(), // 2026-07
    fiscalYear: text("fiscal_year").notNull(), // 2026-27
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: text("status").notNull().default("open"), // open | closed
  },
  (t) => [unique("uq_accperiod_tenant_code").on(t.tenantId, t.code)],
);

export const journalVoucher = pgTable(
  "journal_voucher",
  {
    ...tenantScopedColumns,
    voucherNo: text("voucher_no").notNull(),
    voucherType: text("voucher_type").notNull(), // journal | ar_invoice | receipt | reversal | ...
    postingDate: date("posting_date").notNull(),
    periodId: uuid("period_id").notNull(),
    narration: text("narration"),
    status: text("status").notNull().default("posted"), // posted | reversed
    postingMode: text("posting_mode").notNull(), // sync | async | manual | system
    /** Provenance: which sibling produced this, and which of its documents. */
    sourceModule: text("source_module"),
    sourceDocType: text("source_doc_type"),
    sourceDocId: text("source_doc_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    reversesVoucherId: uuid("reverses_voucher_id"),
    reversedByVoucherId: uuid("reversed_by_voucher_id"),
    reversalReason: text("reversal_reason"),
    totalDebit: numeric("total_debit", { precision: 18, scale: 2 }).notNull(),
    totalCredit: numeric("total_credit", { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [
    unique("uq_voucher_tenant_no").on(t.tenantId, t.voucherNo),
    unique("uq_voucher_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_voucher_tenant_period").on(t.tenantId, t.periodId),
  ],
);

export const journalLine = pgTable(
  "journal_line",
  {
    ...tenantScopedColumns,
    voucherId: uuid("voucher_id").notNull(),
    lineNo: integer("line_no").notNull(),
    accountCode: text("account_code").notNull(),
    debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
    // Dimensions, carried on the line so registers are QUERIES, not reconstructions.
    customerRef: uuid("customer_ref"),
    vendorRef: uuid("vendor_ref"),
    taxHead: text("tax_head"), // cgst | sgst | igst | cess
    taxDirection: text("tax_direction"), // input | output | rcm
    hsnSac: text("hsn_sac"),
    memo: text("memo"),
  },
  (t) => [
    unique("uq_jl_voucher_line").on(t.tenantId, t.voucherId, t.lineNo),
    index("ix_jl_tenant_voucher").on(t.tenantId, t.voucherId),
    index("ix_jl_tenant_account").on(t.tenantId, t.accountCode),
  ],
);

/** The AR subledger. `outstanding` is GENERATED — it can never drift from its inputs. */
export const arOpenItem = pgTable(
  "ar_open_item",
  {
    ...tenantScopedColumns,
    invoiceNo: text("invoice_no").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    customerRef: uuid("customer_ref").notNull(), // logical ref: SMBD.customer
    customerNameCache: text("customer_name_cache"),
    soRef: text("so_ref"),
    dispatchRef: text("dispatch_ref"),
    voucherId: uuid("voucher_id").notNull(),
    taxableValue: numeric("taxable_value", { precision: 18, scale: 2 }).notNull(),
    taxCgst: numeric("tax_cgst", { precision: 18, scale: 2 }).notNull().default("0"),
    taxSgst: numeric("tax_sgst", { precision: 18, scale: 2 }).notNull().default("0"),
    taxIgst: numeric("tax_igst", { precision: 18, scale: 2 }).notNull().default("0"),
    grossReceivable: numeric("gross_receivable", { precision: 18, scale: 2 }).notNull(),
    receivedAmount: numeric("received_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    /** GENERATED in the database — it can never drift from the figures it derives from. */
    outstanding: numeric("outstanding", { precision: 18, scale: 2 }).generatedAlwaysAs(
      sql`gross_receivable - received_amount`,
    ),
    dueDate: date("due_date").notNull(),
    status: text("status").notNull().default("open"), // open | partly_paid | settled
  },
  (t) => [
    unique("uq_ar_tenant_invoice").on(t.tenantId, t.invoiceNo),
    index("ix_ar_tenant_customer").on(t.tenantId, t.customerRef),
  ],
);

/** A receipt and how it was allocated across open invoices. */
export const settlement = pgTable(
  "settlement",
  {
    ...tenantScopedColumns,
    settlementNo: text("settlement_no").notNull(),
    settlementType: text("settlement_type").notNull(), // receipt | payment
    settlementDate: date("settlement_date").notNull(),
    partyRef: uuid("party_ref").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    bankAccountCode: text("bank_account_code").notNull(),
    reference: text("reference"),
    voucherId: uuid("voucher_id").notNull(),
  },
  (t) => [
    unique("uq_settlement_tenant_no").on(t.tenantId, t.settlementNo),
    index("ix_settlement_tenant_party").on(t.tenantId, t.partyRef),
  ],
);

export const settlementAllocation = pgTable(
  "settlement_allocation",
  {
    ...tenantScopedColumns,
    settlementId: uuid("settlement_id").notNull(),
    arOpenItemId: uuid("ar_open_item_id").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [index("ix_settlementalloc_tenant_settlement").on(t.tenantId, t.settlementId)],
);
