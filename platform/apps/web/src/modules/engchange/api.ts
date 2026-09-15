/**
 * ENGINEERING CHANGE — this module's own slice of the API.
 *
 * Nothing outside this folder imports it, and it imports nothing from another module — which
 * is what makes the folder deletable. Planning and Engineering are both AXLE's and both are
 * still off limits: the item, BOM and planned-order fields this module needs are RE-DECLARED
 * here rather than reached for, because a shared type is a dependency wearing a helpful face.
 *
 * ============================================================================
 * THE HONEST PART, AND IT IS THE MOST IMPORTANT COMMENT IN THIS MODULE.
 * ============================================================================
 *
 * There is no engineering-change table in this system. The schema behind an engineering
 * change is exactly three tables — `item`, `bom`, `bom_line` — and a BOM carries a `version`
 * integer and a `notes` string. That is enough to record the RESULT of a change. It is not
 * enough to record the change:
 *
 *   NO `change_request`      — an ECR cannot be raised, numbered, or given a state.
 *   NO `change_impact`       — an assessment cannot be saved; it is recomputed on every view.
 *   NO `change_approval`     — nobody can sign. There is no approver column to write to.
 *   NO `effectivity_date`    — a revision is active or it is not; it cannot become active
 *                              on the 1st of next month, or at serial number 4501.
 *   NO `change_disposition`  — "use up, then scrap the rest" has nowhere to live, so stock
 *                              built to the old revision cannot be dispositioned.
 *   NO `change_ack`          — a shop-floor acknowledgement cannot be recorded.
 *
 * So this module does NOT persist an engineering change, and it never pretends to. Every
 * screen here is a READ over records that genuinely exist, plus arithmetic over them. Where
 * a step of the ECR journey has no table, the screen says so in the interface, in those
 * words, rather than showing a plausible-looking form that silently writes nothing. A
 * fabricated approval on a change-control screen is not a cosmetic defect; it is the exact
 * failure this product is sold on not having.
 *
 * WHAT IS GENUINELY ANSWERABLE, and what each answer is read from:
 *
 *   "What does changing this part touch?"    where-used closure + open orders + stock.
 *   "Which revision is current?"             the item's highest ACTIVE BOM version.
 *   "Which revision went into that build?"   the production order's PINNED `bomId`.
 *   "What changed between two revisions?"    a line-by-line diff of two real BOMs.
 *
 * That last pair is the whole point. A production order pins a `bom_id` at creation and the
 * BOM controller REFUSES to edit an active BOM in place, so the revision a build was made to
 * is a fact the database preserves. "Which revision was in the unit we shipped in August" is
 * answerable through the production order — and only through the production order, because
 * nothing downstream of it carries a revision.
 *
 * ---------------------------------------------------------------------------
 * NO NEW ROUTES AND NO NEW PERMISSIONS.
 * ---------------------------------------------------------------------------
 * Every path below already exists and is already enforced. `pnpm perm-check` fails on a
 * permission with no route behind it, so this module mints none: it borrows Engineering's,
 * Planning's, Production's, Sales' and Inventory's read permissions, and the API refuses per
 * request exactly as it would anywhere else. Someone who may read BOMs but not production
 * orders sees the BOM half of the impact assessment and a stated gap where the other half
 * would be — never a silent zero.
 *
 * ONE CONSEQUENCE WORTH NAMING: this module holds NO purchase permission, so open purchase
 * orders are NOT shown on the impact screen even though they are part of a real impact
 * assessment. Planned BUY orders from the last MRP run are shown instead, under
 * `planning.mrp.read`, and the screen states the difference. Showing nothing and calling the
 * assessment complete would be the worse of the two.
 *
 * Numerics arrive as STRINGS — NUMERIC(18,3) is not safe through a JS float — and are
 * formatted for display. Where arithmetic is unavoidable (a quantity delta between two BOM
 * revisions, a standard-cost total) it is done on `Number(...)` at the point of use and the
 * result is labelled as indicative, never as an accounting figure.
 */

/* ========================================================================== */
/* ENGINEERING — items and bills of material                                  */
/* ========================================================================== */

/**
 * One row of the item master. `GET /engineering/items` is cursor-paged and answers the
 * platform's `CursorPage<T>` envelope, which `useCursorList` reads directly.
 *
 * `defaultBomId` is the HIGHEST ACTIVE version, which is what everybody means when they say
 * "the BOM". `bomCount` counts ACTIVE BOMs only — a superseded revision is not counted, and
 * that matters here more than anywhere else in the product (see `discoverableRevisions`).
 */
export interface ItemRow {
  id: string;
  itemCode: string;
  name: string;
  description: string | null;
  itemType: string;
  uom: string;
  /** NUMERIC(18,2) over the wire as a string — parsed only for an explicitly indicative total. */
  standardCost: string | null;
  bomCount: number;
  defaultBomId: string | null;
  createdAt: string;
}

export interface BomLineRow {
  lineNo: number;
  componentItemId: string;
  componentCode: string;
  componentName: string;
  qty: string;
  uom: string;
  scrapPct: string;
}

/**
 * A bill of material as the API serves it.
 *
 * NOTE WHAT IS ABSENT: no `createdAt`, no `createdBy`, no `isActive`. `GET /engineering/boms/:id`
 * selects six columns and the lines, and that is all there is. So a revision history built
 * from this cannot show WHEN a revision was cut or WHO cut it — only what it contains. The
 * revisions screen says that on the screen rather than leaving a blank column that reads as
 * missing data.
 */
export interface BomView {
  id: string;
  itemId: string;
  version: number;
  /** How many of the product one run makes. Every line qty is per THIS, not per one. */
  outputQty: string;
  uom: string;
  notes: string | null;
  lines: BomLineRow[];
}

/**
 * `GET /engineering/boms/:id/edit-policy` — the only endpoint that reveals whether a BOM is
 * ACTIVE or a DRAFT, because `GET /engineering/boms/:id` does not return the flag.
 *
 * That makes it load-bearing here rather than incidental: "is this revision the live one"
 * is the question a change-control screen exists to answer, and this route is the only
 * place the system will answer it.
 */
export interface BomEditPolicy {
  status: string;
  version: number;
  tier?: string;
  editable?: boolean;
  reason?: string;
  correctBy?: string;
}

/**
 * `GET /engineering/items/:id/history` — corrections to the ITEM MASTER, newest first.
 *
 * Worth being precise about, because the name invites a wrong reading: this is the audit
 * trail of `engineering.item.corrected` / `.amended` events on the item record. It is NOT a
 * BOM revision history and it does not contain one. A part renamed or re-costed appears
 * here; a part whose recipe changed does not.
 */
export interface ItemHistoryEntry {
  seq: number;
  at: string;
  actorId: string;
  action: string;
  changeSet: Record<string, { before?: unknown; after?: unknown }> | null;
}

export interface ItemHistoryResponse {
  entries: readonly ItemHistoryEntry[];
}

/* ========================================================================== */
/* PLANNING — where-used, policies, the plan                                  */
/* ========================================================================== */

/**
 * `GET /planning/policies/where-used/:itemId` — THE endpoint this module is built around.
 *
 * It returns every parent that consumes an item AT ANY DEPTH, computed over the whole active
 * BOM graph rather than one level up. That transitive closure is the difference between "this
 * gasket is on the pump BOM" and "this gasket is in four pumps, two skids and the spares kit",
 * and it is the difference between an impact assessment and a guess.
 *
 * TWO LIMITS, both stated on the screen:
 *   - It walks ACTIVE BOM edges only. A parent that used this component on a superseded
 *     revision does not appear, which is correct for "what would I break tomorrow" and wrong
 *     for "what did I ship last year". The second question is answered from production
 *     orders, not from here.
 *   - `parents` is named from the PLANNING POLICY table, so an item with a BOM but no
 *     planning policy comes back as a bare uuid. The screen renders that as the uuid rather
 *     than inventing a code.
 */
export interface WhereUsedResponse {
  itemId: string;
  parents: readonly { itemId: string; itemCode: string }[];
}

/** `GET /planning/policies` — how each item is replenished, and at what level it is planned. */
export interface PlanningPolicyRow {
  id: string;
  itemId: string;
  itemCode: string;
  lowLevelCode: number;
  planningMethod: string;
  sourceType: string;
  lotRule: string;
  lotSize: string | null;
  leadTimeWorkingDays: number;
  safetyStock: string;
  abcClass: string | null;
  reorderPoint: string | null;
  isMpsItem: boolean;
}

/** `GET /planning/mrp/runs/latest` — the whole `mrp_run` row, or null when MRP never ran. */
export interface MrpRunHeader {
  id: string;
  runNo: string;
  planningDate: string;
  horizonBuckets: number;
  firstBucket: string;
  lastBucket: string;
  status: string;
  itemCount: number;
  plannedOrderCount: number;
  exceptionCount: number;
  createdAt: string;
}

/** `GET /planning/planned-orders` — answers `{ data: [...] }`, not a cursor page. */
export interface PlannedOrderRow {
  id: string;
  orderKey: string;
  itemCode: string;
  /** "make" or "buy". The buy rows are what stands in for purchase orders here. */
  sourceType: string;
  qty: string;
  lotRule: string;
  lotReason: string;
  receiptBucket: string;
  needDate: string;
  releaseBucket: string;
  releaseDate: string;
  pastDue: boolean;
  daysLate: number;
  status: string;
  convertedToKind: string | null;
  convertedToRef: string | null;
}

/* ========================================================================== */
/* PLANNING — the schedule board (scenarios)                                  */
/* ========================================================================== */

/**
 * What `POST /planning/schedule/propose` answers.
 *
 * READ THE NEXT PARAGRAPH BEFORE USING THIS TYPE. Propose is a WRITE: it inserts a
 * `plan_schedule` row with status `draft` plus its operations. It does not touch the
 * published schedule — publishing is a separate call that requires `planning.schedule.publish`
 * and stamps an approver — so comparing two proposals genuinely does not disturb the shop's
 * dispatch list. But "without changing the published plan" is not the same as "without
 * writing anything", and the scenarios screen says which of the two it means.
 */
export interface ScheduleProposal {
  scheduleNo: string;
  runNo: string;
  rule: string;
  status: string;
  operationCount: number;
  lateOrderCount: number;
  totalTardinessDays: number;
  makespanDays: number;
  note: string;
  orders: readonly ScheduledOrder[];
  operations: readonly ScheduledOperation[];
  /** All three dispatch rules costed against the same operations, by the server. */
  ruleComparison: readonly RuleComparisonRow[];
  /** Items with no routing. They are MISSING from the board — the board is optimistic by them. */
  itemsWithoutRouting: readonly string[];
  warning: string | null;
}

export interface ScheduledOrder {
  orderRef: string;
  itemCode: string;
  dueDate: string;
  finishDate: string;
  daysLate: number;
  onTime: boolean;
}

export interface ScheduledOperation {
  orderRef: string;
  itemCode: string;
  seq: number;
  workCentreId: string;
  workCentreCode: string;
  hours: number;
  dueDate: string;
  startDate: string;
  endDate: string;
  startHourOfDay: number;
  endHourOfDay: number;
  daysLate: number;
}

export interface RuleComparisonRow {
  rule: string;
  lateOrderCount: number;
  totalTardinessDays: number;
  makespanDays: number;
}

/**
 * `GET /planning/schedule/:scheduleNo` — the stored row plus its operations.
 *
 * Used for ONE thing on the scenarios screen and it is not decoration: re-reading a proposal
 * immediately before publishing it, to find out whether it is still a draft. A later proposal
 * supersedes an earlier one, and publishing a superseded schedule is refused by the API with
 * a 409. Asking first turns that into a sentence on screen instead of a stack trace.
 */
export interface StoredSchedule {
  id: string;
  scheduleNo: string;
  rule: string;
  planningDate: string;
  status: string;
  lateOrderCount: number;
  totalTardinessDays: number;
  makespanDays: string | number;
  note: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  operations?: readonly Record<string, unknown>[];
}

export interface PublishResult {
  scheduleNo: string;
  status: string;
  replay: boolean;
  supersededCount?: number;
  message: string;
}

/* ========================================================================== */
/* PRODUCTION, SALES, INVENTORY — the records a change lands on               */
/* ========================================================================== */

/**
 * `GET /production/orders` — cursor-paged.
 *
 * `bomId` IS THE POINT. A production order pins the exact BOM row it was exploded from, and
 * an active BOM cannot be edited in place, so this column is a permanent record of which
 * revision a build was made to. Every other "which revision" answer in this module is
 * derived from it.
 */
export interface ProductionOrderRow {
  id: string;
  orderNo: string;
  itemId: string;
  bomId: string;
  qtyToProduce: string;
  producedQty: string;
  status: string;
  createdAt: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
}

/** `GET /sales/orders` — cursor-paged. Carries NO item detail; see `SalesOrderDetail`. */
export interface SalesOrderRow {
  id: string;
  soNo: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  /** Earliest promise still outstanding, or null when everything has shipped. */
  requestedDeliveryDate: string | null;
  lineCount: number;
  grandTotal: string;
  creditStatus: string;
  status: string;
}

/**
 * `GET /sales/orders/:id` — the only place a sales order's ITEMS are visible.
 *
 * The list endpoint returns totals and a line COUNT, never the lines. So "which customer
 * orders contain this part" cannot be answered from one request; it needs one detail read
 * per open order. The impact screen does exactly that, for open orders only and up to a
 * stated cap, and it prints the cap rather than quietly truncating — an under-reported
 * impact assessment is the failure mode that gets a change approved that should not have
 * been.
 */
export interface SalesOrderDetail extends SalesOrderRow {
  lines: readonly {
    id: string;
    lineNo: number;
    itemId: string;
    itemCode: string | null;
    itemName: string | null;
    uom: string | null;
    qty: string;
    deliveredQty: string;
    lineTotal: string;
    requestedDeliveryDate: string | null;
  }[];
}

/** `GET /inventory/stock` — a bare ARRAY of non-zero balances, not an envelope. */
export interface StockRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  batch: string;
  qty: string;
}

/* ========================================================================== */
/* PATHS                                                                      */
/* ========================================================================== */

/**
 * Every route this module will ever call. All of them already exist; none was added for it.
 *
 * Collected in one object on purpose — it is the complete, auditable answer to "what does
 * engineering change touch", and a reviewer can check it against the controllers in about a
 * minute. A path built inline in a screen is a path nobody reviews.
 */
export const engChangeApi = {
  /* engineering.item.read */
  itemsPath: "/engineering/items",
  itemHistoryPath: (itemId: string): string =>
    `/engineering/items/${encodeURIComponent(itemId)}/history`,

  /* engineering.bom.read */
  bomPath: (bomId: string): string => `/engineering/boms/${encodeURIComponent(bomId)}`,
  bomEditPolicyPath: (bomId: string): string =>
    `/engineering/boms/${encodeURIComponent(bomId)}/edit-policy`,

  /* planning.policy.read */
  whereUsedPath: (itemId: string): string =>
    `/planning/policies/where-used/${encodeURIComponent(itemId)}`,
  policiesPath: "/planning/policies",

  /* planning.mrp.read */
  latestRunPath: "/planning/mrp/runs/latest",
  plannedOrdersPath: "/planning/planned-orders",

  /* planning.schedule.* */
  scheduleProposePath: "/planning/schedule/propose",
  schedulePath: (scheduleNo: string): string =>
    `/planning/schedule/${encodeURIComponent(scheduleNo)}`,
  schedulePublishPath: (scheduleNo: string): string =>
    `/planning/schedule/${encodeURIComponent(scheduleNo)}/publish`,

  /* production.order.read */
  productionOrdersPath: "/production/orders",

  /* sales.order.read */
  salesOrdersPath: "/sales/orders",
  salesOrderPath: (id: string): string => `/sales/orders/${encodeURIComponent(id)}`,

  /* inventory.stock.read */
  stockPath: "/inventory/stock",

  /** One page of items is 50. Large enough to find a part by filtering, small enough to be quick. */
  pageSize: 50,
  /**
   * How many OPEN sales orders the impact screen will open to read their lines.
   *
   * One request per order, so this is a real cost, not a notional one. Twenty-five covers the
   * open book of the plants this is sold into; past that the screen states how many it did
   * not read instead of pretending it read them all.
   */
  salesOrderProbeCap: 25,
} as const;

/* ========================================================================== */
/* PURE HELPERS — arithmetic only, no judgement delegated anywhere            */
/* ========================================================================== */

/**
 * Whether a status means the document is still live and would therefore be affected by a
 * revision change.
 *
 * WRITTEN AS AN EXCLUSION LIST, not an inclusion list, and that is deliberate. An inclusion
 * list silently drops a status somebody adds later, and the direction it fails in is the
 * dangerous one: an order that IS affected quietly disappearing from an impact assessment.
 * Failing the other way shows one row too many, which a person can see and dismiss.
 */
const SETTLED = new Set([
  "completed",
  "complete",
  "closed",
  "cancelled",
  "canceled",
  "delivered",
  "dispatched",
  "rejected",
  "void",
  "superseded",
]);

export function isOpenStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return !SETTLED.has(status.toLowerCase().replace(/[\s-]+/g, "_"));
}

/** The settled half of the same question — used for "what has already been built". */
export function isSettledStatus(status: string | null | undefined): boolean {
  return !isOpenStatus(status);
}

/**
 * A line-by-line difference between two bills of material.
 *
 * Matched on `componentItemId`, never on component CODE or line number. A line can be
 * renumbered and a part can be re-coded without the recipe changing at all, and either would
 * show up as a removal plus an addition — a diff that cries wolf on a re-numbered BOM is a
 * diff nobody reads by the third time.
 *
 * Quantities are compared PER UNIT OF OUTPUT (`qty / outputQty`), because a revision that
 * changes the batch size from 1 to 10 changes every line quantity without changing the
 * recipe. Comparing raw line quantities there would report twelve changes where there are
 * none, which is worse than reporting nothing.
 */
export type BomDiffKind = "added" | "removed" | "qty_changed" | "scrap_changed" | "unchanged";

export interface BomDiffRow {
  componentItemId: string;
  componentCode: string;
  componentName: string;
  kind: BomDiffKind;
  /** Per one unit of output, on the FROM revision. Null when the line did not exist. */
  fromQtyPer: number | null;
  toQtyPer: number | null;
  fromScrapPct: number | null;
  toScrapPct: number | null;
  uom: string;
}

function perUnit(line: BomLineRow, outputQty: string): number {
  const output = Number(outputQty);
  const qty = Number(line.qty);
  if (!Number.isFinite(qty)) return 0;
  return Number.isFinite(output) && output > 0 ? qty / output : qty;
}

/** Tolerance for a per-unit quantity comparison. The column is NUMERIC(18,3). */
const QTY_EPSILON = 1e-6;

export function diffBoms(from: BomView, to: BomView): readonly BomDiffRow[] {
  const fromLines = new Map(from.lines.map((l) => [l.componentItemId, l]));
  const toLines = new Map(to.lines.map((l) => [l.componentItemId, l]));
  const ids = [...new Set([...fromLines.keys(), ...toLines.keys()])];

  const rows = ids.map((id): BomDiffRow => {
    const a = fromLines.get(id);
    const b = toLines.get(id);
    const naming = b ?? a;
    const base = {
      componentItemId: id,
      componentCode: naming?.componentCode ?? id,
      componentName: naming?.componentName ?? "",
      uom: naming?.uom ?? "",
      fromQtyPer: a ? perUnit(a, from.outputQty) : null,
      toQtyPer: b ? perUnit(b, to.outputQty) : null,
      fromScrapPct: a ? Number(a.scrapPct) : null,
      toScrapPct: b ? Number(b.scrapPct) : null,
    };
    if (!a) return { ...base, kind: "added" };
    if (!b) return { ...base, kind: "removed" };
    if (Math.abs((base.fromQtyPer ?? 0) - (base.toQtyPer ?? 0)) > QTY_EPSILON) {
      return { ...base, kind: "qty_changed" };
    }
    if (Math.abs((base.fromScrapPct ?? 0) - (base.toScrapPct ?? 0)) > QTY_EPSILON) {
      return { ...base, kind: "scrap_changed" };
    }
    return { ...base, kind: "unchanged" };
  });

  // Changes first, then alphabetical inside each group. A diff whose changed lines are
  // scattered through forty unchanged ones is a list, not a diff.
  const rank: Record<BomDiffKind, number> = {
    added: 0,
    removed: 1,
    qty_changed: 2,
    scrap_changed: 3,
    unchanged: 4,
  };
  return [...rows].sort(
    (x, y) => rank[x.kind] - rank[y.kind] || x.componentCode.localeCompare(y.componentCode),
  );
}

export function diffKindLabel(kind: BomDiffKind): string {
  switch (kind) {
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    case "qty_changed":
      return "Quantity changed";
    case "scrap_changed":
      return "Scrap allowance changed";
    case "unchanged":
      return "Unchanged";
  }
}

/**
 * How a diff row is coloured.
 *
 * An addition is NOT "good" and a removal is NOT "bad" — a revision that deletes a part is
 * routine and a revision that adds one is not a success. Both are simply CHANGES, and both
 * get the same attention-seeking tone. Colouring them green and red would make a reader
 * skim the green ones, which on a change-control screen is exactly wrong.
 */
export function diffTone(kind: BomDiffKind): "pending" | "unknown" {
  return kind === "unchanged" ? "unknown" : "pending";
}

/**
 * Indicative value of a quantity at standard cost, or null when there is no cost to use.
 *
 * Returns NULL rather than 0 for a missing cost, and every caller is obliged to count the
 * nulls and print the count. A zero silently folded into a total is how a valuation comes to
 * be wrong by exactly the items nobody had costed.
 */
export function valueAtStandardCost(qty: string | number, standardCost: string | null): number | null {
  if (standardCost === null) return null;
  const cost = Number(standardCost);
  const quantity = Number(qty);
  if (!Number.isFinite(cost) || !Number.isFinite(quantity)) return null;
  return cost * quantity;
}
