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

// ---------------------------------------------------------------------------
// The customer's order — SALES
// ---------------------------------------------------------------------------

/**
 * TAKING AN ORDER, so a mission has something to be about.
 *
 * The two ports above are the documents a mission PRODUCES. This is the one it starts from,
 * and it exists because the demo used to begin by picking a pre-seeded order off a list —
 * which answers "can it run?" but never "is this real, or is it a recording?". A presenter
 * who types a customer's PO number in front of the room and watches ONYX pick it up has
 * answered the second question in a way no seeded row can.
 *
 * Named for the ACT, like its neighbours: the mission does not create sales orders. It asks
 * SALES to take an order, and SALES decides what that means — the numbering, the credit
 * gate, the tax treatment, the confirmation. Given a direct `SalesService` handle the
 * mission would eventually reach past this into amendments and dispatch, and every rule
 * Sales enforces would have a second, unpoliced entrance.
 *
 * OPENS ITS OWN TRANSACTION — never call it inside `withTenant`. Same reasoning as the two
 * ports above: a sales order is SALES' document, and it commits when SALES commits it.
 */
export const CUSTOMER_ORDER_WRITER = Symbol("CustomerOrderWriter");

export interface FulfilmentCustomerOrderLineInput {
  itemId: string;
  qty: number;
  /** What the customer was promised. This is what the whole plan is scheduled backwards from. */
  requestedDeliveryDate?: string;
  /**
   * Commercial terms, OPTIONAL — and when omitted, SALES derives them from the last
   * confirmed line for this item rather than defaulting.
   *
   * There is no rate card and no HSN master in the MVP: every existing order carries its
   * price and its tax treatment on the line. So a caller that omits these is saying "the
   * usual terms for this part", and SALES answers with the terms this part was actually
   * last sold on. If it has never been sold, SALES REFUSES rather than inventing a number —
   * a GST rate guessed in code is exactly the constant the platform rules forbid, and an
   * invented selling price is worse than an error message.
   */
  rate?: number;
  hsn?: string;
  gstRatePct?: number;
}

export interface CreateFulfilmentCustomerOrderInput {
  customerId: string;
  /** The customer's own PO number — the piece of paper the commitment actually arrives on. */
  custPoNo: string;
  lines: FulfilmentCustomerOrderLineInput[];
}

export interface CreatedCustomerOrder {
  id: string;
  soNo: string;
  /**
   * Where the order stands after SALES has finished with it.
   *
   * Carried back because it is not always `confirmed`: the credit gate is real, and an
   * order that trips it stays on hold. A mission cannot start on one, and the honest thing
   * is to say which gate stopped it rather than to report a mission that does not exist.
   */
  status: string;
  /** What SALES actually charged, per line, after deriving anything the caller omitted. */
  lines: Array<{ itemId: string; qty: number; rate: number; hsn: string; gstRatePct: number }>;
  grandTotal: number;
}

export interface CustomerOrderWriter {
  /**
   * Take an order and confirm it, in that order, through SALES' own rules.
   *
   * Confirmation is included rather than left to the caller because a draft is not a
   * commitment: `MissionService.start` refuses a draft outright, so a port that returned one
   * would only ever be half a step. If the credit gate holds the order, the returned status
   * says so and no mission is opened.
   */
  createConfirmedOrder(
    input: CreateFulfilmentCustomerOrderInput,
    idempotencyKey: string,
  ): Promise<CreatedCustomerOrder>;

  /** Customers this tenant can raise an order against, for the form that calls the above. */
  listOrderableCustomers(): Promise<Array<{ id: string; code: string; name: string }>>;

  /** Items that can be sold, with the terms they were last sold on. Null = never sold. */
  listSellableItems(): Promise<Array<{
    id: string; itemCode: string; name: string; uom: string;
    lastRate: number | null; lastHsn: string | null; lastGstRatePct: number | null;
  }>>;
}
