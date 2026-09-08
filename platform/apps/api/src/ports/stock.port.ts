import type { Tx } from "@ind-core/db";

/**
 * The stock-posting port (DECISIONS-V2 §5.6). Inventory owns the ONE write path to
 * stock; other modules (Purchase's GRN, Production) post through this shared interface
 * — never by touching stock tables or importing the Inventory module (§1.1).
 */
export const STOCK_POSTER = Symbol("StockPoster");

export type StockEntryType = "receipt" | "issue" | "transfer" | "adjustment";

export interface StockEntryLineInput {
  itemId: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  batch?: string;
  qty: number;
}
export interface PostStockEntryInput {
  entryType: StockEntryType;
  reasonCode?: string;
  remarks?: string;
  lines: StockEntryLineInput[];
}
export interface StockMovement {
  itemId: string;
  warehouseId: string;
  batch: string;
  delta: number;
  balanceAfter: number;
  /**
   * What Inventory valued this movement at, and on what basis.
   *
   * Consumers MIRROR these figures; they never recompute them. That is what lets
   * Maintenance state honestly that it holds no valuation logic — the number on an MWO's
   * spare line is Inventory's answer, carried across the boundary intact.
   */
  valuationRate: number;
  valuedAmount: number;
  valuationBasis: "standard_cost";
}
export interface PostStockEntryResult {
  entryId: string;
  entryType: StockEntryType;
  lineCount: number;
  movements: StockMovement[];
}

export interface StockPoster {
  /**
   * Post a stock entry INSIDE the caller's transaction, so a document (e.g. a GRN) and
   * its stock movement commit atomically. Ledger-critical + race-safe (§5.5).
   */
  postInTx(tx: Tx, input: PostStockEntryInput): Promise<PostStockEntryResult>;
  /** Post a stock entry standalone, idempotent on the key — the HTTP write path. */
  post(input: PostStockEntryInput, idempotencyKey: string): Promise<PostStockEntryResult>;
}
