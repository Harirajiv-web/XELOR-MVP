import type { Tx } from "@ind-core/db";

/**
 * The ledger port (ACCOUNTS §1.2 contracts #2 and #6).
 *
 * Direction matters and is deliberate: modules depend on ACCOUNTS, never the reverse.
 * Accounts does not read Sales, Inventory or HRM tables to work out what happened — the
 * owning module hands over amounts it has ALREADY VALUED, and Accounts records them. That
 * is §1.3's one rule ("never re-post what a sibling already valued") expressed as a
 * dependency arrow, which also keeps the module graph acyclic.
 */
export const ACCOUNTS_POSTER = Symbol("AccountsPoster");

export interface InvoiceAmountsInput {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff?: number;
  grossReceivable: number;
}

export interface RaiseSalesInvoiceInput {
  customerId: string;
  customerName?: string;
  soRef?: string;
  dispatchRef?: string;
  /** Already computed by SMBD from its own GST brain. Accounts records, never recomputes. */
  amounts: InvoiceAmountsInput;
  paymentTermsDays?: number;
  invoiceDate?: string;
  /** Ties the invoice to its source document so a replay yields exactly one voucher. */
  sourceDocType: string;
  sourceDocId: string;
}

export interface RaiseSalesInvoiceResult {
  invoiceNo: string;
  voucherNo: string;
  voucherId: string;
  grossReceivable: number;
  dueDate: string;
}

export interface CustomerOutstanding {
  customerId: string;
  /** Gross value of open + partly-paid invoices, net of receipts allocated to them. */
  outstanding: number;
  openInvoices: number;
  oldestDueDate: string | null;
}

export interface AccountsPoster {
  /**
   * Raise a sales invoice INSIDE the caller's transaction, so the dispatch, the stock
   * movement and the ledger commit together or not at all (§5.5). Idempotent on the
   * source document: a replay returns the original invoice, never a second one.
   */
  raiseSalesInvoiceInTx(tx: Tx, input: RaiseSalesInvoiceInput): Promise<RaiseSalesInvoiceResult>;
  /** What SMBD's credit gate asks before confirming an order. */
  getCustomerOutstanding(customerId: string): Promise<CustomerOutstanding>;
  /** Same question, inside a transaction the caller already holds. */
  getCustomerOutstandingInTx(tx: Tx, customerId: string): Promise<CustomerOutstanding>;
}
