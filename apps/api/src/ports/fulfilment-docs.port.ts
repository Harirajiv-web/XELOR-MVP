/**
 * THE FULFILMENT DOCUMENT-WRITING PORTS.
 *
 * The mission runtime reasons about buying and making, and at the end of that reasoning two
 * real documents have to exist: a purchase order the vendor can be held to, and a work order
 * the shop floor can pick up. Until these ports existed it wrote neither — it recorded a
 * `fulfilment_action` saying it had, which is the one kind of untruth this product cannot
 * afford, because the whole claim is that the agent's account of itself is checkable.
 *
 * Why a port rather than an injected PurchaseService / ProductionService: the mission is the
 * module with the widest reach in the system, so it is the one where a boundary is most
 * likely to dissolve "just this once". Given a direct handle it would eventually reach past
 * `createPo` into vendor lookups, PO amendments and status transitions, and every rule those
 * modules enforce would have a second, unpoliced entrance. Named for the ACT rather than the
 * module (§1.1, and the same reasoning as `PRODUCTION_ORDER_CREATOR` in
 * `planning-inputs.port.ts`), so that "the mission raises purchase orders" stays a false
 * statement: it asks PURCHASE to, and PURCHASE decides how.
 *
 * ---------------------------------------------------------------------------
 * BOTH METHODS OPEN THEIR OWN TRANSACTION — NEVER CALL THEM INSIDE `withTenant`
 * ---------------------------------------------------------------------------
 * Unlike `STOCK_POSTER.postInTx` and `ACCOUNTS_POSTER.raiseSalesInvoiceInTx`, these take no
 * `Tx`. That is deliberate and it is the opposite trade-off, for a reason worth stating:
 *
 *   A stock movement and the document that caused it are ledger-critical and must commit
 *   together (§5.5), so those ports run inside the caller's transaction.
 *
 *   A purchase order is a document in ANOTHER module's own right, with its own numbering,
 *   its own idempotency ticket and its own approval workflow ahead of it. It commits when
 *   it commits. Threading the mission's transaction through it would put the mission in
 *   charge of when PURCHASE's documents become durable — and would drag the mission's whole
 *   read transaction along for the ride.
 *
 * So the caller must READ first (one transaction), CALL these (their own transaction), then
 * WRITE its own record of what happened (a third). Calling them from inside an open
 * `withTenant` block takes a second connection out of a pool of ten while the first is still
 * held mid-transaction, which is a deadlock waiting for a busy afternoon.
 *
 * ------------------------------------------------------------------
 * IDEMPOTENCY IS THE CALLER'S TO GET RIGHT, AND IT IS NOT OPTIONAL
 * ------------------------------------------------------------------
 * Both methods take an idempotency key and honour it exactly as the HTTP write paths do: the
 * same key with the same request replays the first answer, the same key with a DIFFERENT
 * request is rejected outright. The caller must therefore derive the key from the decision,
 * not from the clock — mission + plan version + vendor, never `Date.now()`. A step that dies
 * after raising two of three purchase orders is then safe to re-run: the two replay, the
 * third is raised, and the vendor never receives the same order twice.
 */

// ---------------------------------------------------------------------------
// Purchase orders — PURCHASE
// ---------------------------------------------------------------------------

export const PURCHASE_ORDER_WRITER = Symbol("PurchaseOrderWriter");

export interface FulfilmentPoLineInput {
  itemId: string;
  qty: number;
  /** Per unit, in rupees. The price the plan was scored on, not a fresh quote. */
  rate: number;
  /**
   * The customer-order line whose shortage caused this buy.
   *
   * Mandatory on this port (although nullable on PURCHASE's general-purpose schema): a
   * fulfilment mission always starts from a customer commitment, so losing the peg here
   * would make the goods receipt impossible to trace back to the order it serves.
   */
  salesOrderLineId: string;
}

/**
 * ONE VENDOR, ONE PURCHASE ORDER.
 *
 * The shape enforces the grouping rather than trusting the caller to remember it: a vendor
 * receives one document listing everything ordered from them, because that is what a
 * purchase order IS. A plan that sources five components from three vendors is three
 * purchase orders, not one with three suppliers on it and not five with one line each — the
 * first is not a document any vendor can act on, and the second is three phone calls where
 * one would do.
 */
export interface CreateFulfilmentPoInput {
  vendorId: string;
  /** When the plan needs the material on site. Becomes the PO's expected date. */
  expectedDate?: string;
  /** Why this order exists, in the vendor-visible remarks — the mission and the SO number. */
  remarks?: string;
  lines: FulfilmentPoLineInput[];
}

export interface CreatedPurchaseOrder {
  id: string;
  poNo: string;
  /** The order's total as PURCHASE computed it. Mirrored, never recomputed by the caller. */
  totalValue: number;
  /**
   * Where the document actually stands. Carried back because the honest narration depends
   * on it: a PO raised by a mission is a DRAFT awaiting the stores→admin approval workflow,
   * and telling a presenter it was "committed" would overstate what the agent just did.
   */
  status: string;
}

export interface PurchaseOrderWriter {
  /**
   * Raise one purchase order on one vendor. Opens its own transaction — see the note above.
   */
  createPurchaseOrder(input: CreateFulfilmentPoInput, idempotencyKey: string): Promise<CreatedPurchaseOrder>;
}

// ---------------------------------------------------------------------------
// Work orders — PRODUCTION
// ---------------------------------------------------------------------------

export const PRODUCTION_ORDER_WRITER = Symbol("ProductionOrderWriter");

export interface CreateFulfilmentProductionOrderInput {
  itemId: string;
  qty: number;
  /**
   * The trace spine (migration 0093). The customer commitment this build exists to serve,
   * so a supervisor looking at the job knows who is waiting for it. Without it every work
   * order is equally urgent, which is the same as none of them being urgent.
   */
  salesOrderLineId?: string | null;
  /** When the plan says it has to be finished. NOT the wall clock. */
  needDate?: string | null;
}

export interface CreatedProductionOrder {
  id: string;
  orderNo: string;
  status: string;
}

export interface ProductionOrderWriter {
  /**
   * Release one work order for the finished good.
   *
   * PRODUCTION decides the BOM version, snapshots the components and picks the warehouses —
   * the mission supplies only the what, the how many, the by-when and the who-for, which is
   * all a plan ever knew. Opens its own transaction — see the note above.
   */
  createProductionOrder(
    input: CreateFulfilmentProductionOrderInput,
    idempotencyKey: string,
  ): Promise<CreatedProductionOrder>;
}
