/**
 * COSTING & SERVICE — this module's own slice of the API, and the arithmetic it performs.
 *
 * Nothing outside this folder imports it, and it imports nothing from another module, which
 * is what keeps the folder deletable. It calls ONLY endpoints that already exist: every path
 * below was read off a controller in `apps/api/src/modules/` and carries the permission that
 * controller's `@RequirePermission` actually enforces. No route here is new, and none is
 * invented — a path this file guessed would 404 at the worst possible moment, in front of a
 * customer, on a screen about money.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE ONE THING TO KNOW BEFORE READING FURTHER: A COST SHEET IS NOT STORED ANYWHERE.
 *
 * There is no `cost_sheet` table, no `cost_sheet_line`, no margin policy row and no approval
 * limit row in this database, and this module adds none — it ships no migration. So the cost
 * build-up on the Cost sheet screen is COMPUTED IN THE BROWSER, from real records plus
 * assumptions a person types, and it disappears when the tab closes. Every screen that shows
 * one says so on the screen itself, not only here.
 *
 * That is deliberately worse than pretending. A "Saved" toast over a figure that was never
 * written is the single most expensive lie an ERP can tell, because the next person to look
 * for the number will not find it and will not know it was never there.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * A MODEL NEVER SETS A PRICE HERE, AND THIS BUILD CONTAINS NO MODEL CALL AT ALL. There is no
 * fetch to any inference endpoint anywhere in this folder. Where the product specification
 * asks for "AI extraction" of an enquiry, what it actually needs is a structured intake form
 * with the source document named and a page-anchored note against each extracted figure — so
 * that is what `SourceAttribution` below is, and every critical number on the cost sheet
 * carries one. A number traces to a record or to a named human correction. There is no third
 * category.
 *
 * Money and quantities arrive from the API as STRINGS. The columns are `NUMERIC(18,2)` and a
 * float would not survive the trip, so nothing here parses one until the moment it does
 * arithmetic, and `toNum` returns `null` rather than `0` for an absent value — a cost of zero
 * and a cost nobody has recorded are different facts, and rounding the second into the first
 * is how a margin screen ends up flattering a loss-making job.
 */

/* ============================================================================
   THE ENDPOINTS. Each line names the controller it was read from.
   ============================================================================ */

export const costingApi = {
  /* ENGINEERING — the item master and the bills of material behind a cost build-up.
     `engineering/engineering.controller.ts` @Get()      → engineering.item.read
     `engineering/bom.controller.ts`         @Get(":id") → engineering.bom.read

     NOTE A GAP, because it shapes the Cost sheet screen: there is NO list-BOMs endpoint.
     A BOM can only be fetched by id, and the id comes from the item row's `defaultBomId`.
     That is why the cost sheet starts from an ITEM and not from a BOM. */
  itemsPath: "/engineering/items",
  bomPath: (bomId: string): string => `/engineering/boms/${encodeURIComponent(bomId)}`,

  /* SALES — quotations, orders and the customer master.
     `sales/quotation.controller.ts` @Get() / @Get(":id") → sales.quotation.read
     `sales/sales.controller.ts`     @Get("orders")       → sales.order.read
                                     @Get("orders/:id")   → sales.order.read
                                     @Get("customers")    → sales.customer.read */
  quotationsPath: "/sales/quotations",
  quotationPath: (id: string): string => `/sales/quotations/${encodeURIComponent(id)}`,
  ordersPath: "/sales/orders",
  orderPath: (id: string): string => `/sales/orders/${encodeURIComponent(id)}`,
  customersPath: "/sales/customers",

  /* PRODUCTION — where the estimate meets what the job actually consumed.
     `production/production.controller.ts` @Get() / @Get(":id") → production.order.read */
  productionOrdersPath: "/production/orders",
  productionOrderPath: (id: string): string =>
    `/production/orders/${encodeURIComponent(id)}`,

  /* CSP — the service desk, its clock, and the coverage determination.
     `csp/csp.controller.ts` @Get("tickets")                        → csp.ticket.read
                             @Get("tickets/:ticketNo")              → csp.ticket.read
                             @Get("tickets/:ticketNo/sla")          → csp.ticket.read
                             @Post("tickets/:ticketNo/comments")    → csp.ticket.update
                             @Patch("tickets/:ticketNo/status")     → csp.ticket.update
                             @Post("tickets/:ticketNo/entitlement-check")
                                                                    → csp.ticket.update
                             @Get("spare-requests")                 → csp.ticket.read
                             @Get("dashboards/service")             → csp.dashboard.read */
  ticketsPath: "/csp/tickets",
  ticketPath: (ticketNo: string): string => `/csp/tickets/${encodeURIComponent(ticketNo)}`,
  ticketSlaPath: (ticketNo: string): string =>
    `/csp/tickets/${encodeURIComponent(ticketNo)}/sla`,
  ticketCommentsPath: (ticketNo: string): string =>
    `/csp/tickets/${encodeURIComponent(ticketNo)}/comments`,
  ticketStatusPath: (ticketNo: string): string =>
    `/csp/tickets/${encodeURIComponent(ticketNo)}/status`,
  entitlementCheckPath: (ticketNo: string): string =>
    `/csp/tickets/${encodeURIComponent(ticketNo)}/entitlement-check`,
  spareRequestsPath: "/csp/spare-requests",

  /** 100 is the API's own ceiling on `limit` — asking for more is a 400, not a bigger page. */
  pageSize: 100,
} as const;

/* ============================================================================
   WIRE SHAPES. Copied from the services, not inferred from table names.
   ============================================================================ */

/** `engineering.service.ts` → `ItemRow`. `standardCost` is nullable and often IS null. */
export interface ItemRow {
  id: string;
  itemCode: string;
  name: string;
  description: string | null;
  itemType: string;
  uom: string;
  /**
   * The item master's standard cost, as a `NUMERIC(18,2)` string, or null.
   *
   * READ THE LIMITATION, because the Cost sheet and Margin screens both depend on it: this
   * is ONE number per item with no breakdown and — this is the important part — NO AS-OF
   * DATE. The master does not record when it was set or which supplier quotation it came
   * from. A cost sheet built on it is therefore built on a price of unknown age, which is
   * exactly the failure mode the supplier-price fields on the cost sheet exist to expose.
   */
  standardCost: string | null;
  bomCount: number;
  /** The highest active BOM version, or null. The only way to reach a BOM at all. */
  defaultBomId: string | null;
  createdAt: string;
}

/** `engineering.service.ts` → `BomView`. Line quantities are per `outputQty`, not per one. */
export interface BomLineRow {
  lineNo: number;
  componentItemId: string;
  componentCode: string;
  componentName: string;
  qty: string;
  uom: string;
  scrapPct: string;
}

export interface BomView {
  id: string;
  itemId: string;
  version: number;
  outputQty: string;
  uom: string;
  notes: string | null;
  lines: BomLineRow[];
}

/** `quotation.service.ts` → `QuotationSummary`. `expired` is computed server-side per read. */
export interface QuotationSummary {
  id: string;
  quoteNo: string;
  revisionNo: number;
  customerId: string;
  customerName: string | null;
  quoteDate: string;
  validUntil: string;
  grandTotal: string;
  status: string;
  convertedSoNo: string | null;
  expired: boolean;
}

export interface QuotationLineView {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  description: string | null;
  qty: string;
  uom: string;
  rate: string;
  hsn: string;
  gstRatePct: string;
  lineTotal: string;
  requestedDeliveryDate: string | null;
}

export interface QuotationView extends QuotationSummary {
  supersedesId: string | null;
  enquiryRef: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  /** Taxable value. THIS is what margin is measured against — GST is not margin. */
  subtotal: string;
  taxTotal: string;
  lostReason: string | null;
  convertedOrderId: string | null;
  lines: QuotationLineView[];
}

/**
 * `sales.service.ts` → `CustomerRow`, from `GET /sales/customers`.
 *
 * THIS IS THE JOIN THAT MAKES THE INSTALLED BASE COHERENT. A service ticket's
 * `customerAccountId` is documented in `packages/db/src/schema/csp.ts` as a logical
 * reference to the SMBD customer — "logical ref → SMBD customer", line 183 — so the same
 * uuid names the company on a sales order and on a warranty claim. It is a logical
 * reference, not a foreign key, which is why both sides are read through their own
 * module's endpoint and matched here rather than joined in the database.
 */
export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  creditLimit: string;
}

/** `sales.service.ts` → `SalesOrderSummary`. */
export interface SalesOrderSummary {
  id: string;
  soNo: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  requestedDeliveryDate: string | null;
  lineCount: number;
  isInterState: boolean;
  grandTotal: string;
  creditStatus: string;
  status: string;
}

/** `sales.service.ts` → `SalesOrderLineView`. `deliveredQty` is the only shipment evidence. */
export interface SalesOrderLineView {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  qty: string;
  rate: string;
  hsn: string;
  gstRatePct: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  lineTotal: string;
  deliveredQty: string;
  requestedDeliveryDate: string | null;
}

export interface SalesOrderView {
  id: string;
  soNo: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  requestedDeliveryDate: string | null;
  supplierGstin: string;
  billToGstin: string | null;
  shipToGstin: string | null;
  shipToStateCode: string;
  placeOfSupply: string;
  isInterState: boolean;
  subtotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  roundOff: string;
  grandTotal: string;
  creditStatus: string;
  creditLimitSnapshot: string | null;
  creditExposureSnapshot: string | null;
  status: string;
  lines: SalesOrderLineView[];
}

/** `production.service.ts` → the list row: the order without its components or operations. */
export interface ProductionOrderRow {
  id: string;
  orderNo: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  bomId: string;
  qtyToProduce: string;
  producedQty: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** `production.service.ts` → `ProdComponentView`. `issuedQty` is the ACTUAL consumption. */
export interface ProdComponentView {
  lineNo: number;
  componentItemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  requiredQty: string;
  issuedQty: string;
}

export interface ProductionOrderView extends ProductionOrderRow {
  components: ProdComponentView[];
  operations: Array<{
    sequence: number;
    operationCode: string;
    operationName: string;
    workCenterRef: string | null;
    status: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    operatorRef: string | null;
    inputQty: string | null;
    outputQty: string;
    rejectedQty: string;
    evidenceNote: string | null;
  }>;
}

/** `ticket.service.ts` → `TicketView["sla"]`. The engine's verdict, never a recomputation. */
export interface TicketSla {
  state: string;
  chip: { label: string; tone: string };
  firstResponseDue: string | null;
  resolutionDue: string | null;
  consumedMins: number;
  reason: string;
  promise: string | null;
  policyName: string | null;
}

export interface TicketView {
  ticketNo: string;
  status: string;
  customerAccountId: string;
  subject: string;
  description: string;
  priority: string;
  categoryCode: string | null;
  channel: string;
  productSerialNo: string | null;
  sla: TicketSla;
  owner: string | null;
  teamId: string | null;
  assignedVersion: number;
  /** The CACHED verdict. `checkedAt` is what makes it readable — see `coverageAge`. */
  entitlement: { verdict: string | null; checkedAt: string | null };
  aiTriage: Record<string, unknown> | null;
  complaintNo: string | null;
  reopenCount: number;
  createdAt: string;
}

export interface TicketComment {
  body: string;
  /** `public` reaches the customer. `internal` never leaves the building. */
  visibility: string;
  authorType: string;
  sentAt: string | null;
  createdAt: string;
}

export interface TicketTimelineEvent {
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  actorType: string;
  occurredAt: string;
}

export interface TicketDetail extends TicketView {
  comments: TicketComment[];
  timeline: TicketTimelineEvent[];
}

/** `entitlement.ts` → `EntitlementResult`. The coverage answer, with its reasons. */
export interface EntitlementResult {
  verdict: string;
  reasons: string[];
  warrantyExpiresOn: string | null;
  amcExpiresOn: string | null;
  partsChargeable: boolean;
  anomalies: Array<{ code: string; detail: string }>;
  summary: string;
  serialNo?: string;
}

/** `spare.service.ts` → `list()`. `coverage` is the entitlement engine's own word. */
export interface SpareRequestRow {
  requestNo: string;
  ticketNo: string | null;
  itemCode: string;
  qty: number;
  uom: string | null;
  coverage: string;
  unitPrice: number | null;
  lineAmount: number | null;
  status: string;
  reservationRef: string | null;
}

/** `csp.controller.ts` @Get("tickets") answers a BARE ARRAY — no cursor envelope. */
export type TicketQueue = TicketView[];

/* ============================================================================
   INDIA: the statutory facts these screens surface. Constants, not prose, so a
   threshold cannot drift between the warning and the explanation beside it.
   ============================================================================ */

/**
 * An e-way bill is required for a consignment above ₹50,000.
 *
 * The screen warns on the value; it CANNOT confirm the number. `POST
 * /sales/orders/:id/dispatch` accepts `ewayBillNo` and stores it, but no GET in this build
 * returns it — `SalesOrderView` has no such field. So the honest thing a screen can say is
 * "this consignment needs one and this software cannot show you whether it has one", which
 * sends somebody to look. Printing "e-way bill: none" would be a claim we cannot support.
 */
export const EWAY_BILL_THRESHOLD_INR = 50_000;

/** e-invoicing applies from ₹5 crore aggregate annual turnover. */
export const EINVOICE_AATO_THRESHOLD_INR = 5_00_00_000;

/** An IRN may be cancelled on the portal for 24 hours. After that, never. */
export const IRN_CANCELLATION_WINDOW_HOURS = 24;

/**
 * THE 30-DAY CLIFF. An invoice must be reported to the IRP within 30 days of its date.
 *
 * Past it the portal refuses permanently — there is no late window, no penalty route, no
 * appeal. The only remedy left is a credit note and a fresh invoice, which changes the
 * customer's paperwork and their input credit timing. It is the one date in Indian invoicing
 * where being one day late is qualitatively different from being one day early, which is why
 * it is a named constant rather than a sentence somebody might reword.
 */
export const IRN_REPORTING_WINDOW_DAYS = 30;

/* ============================================================================
   ARITHMETIC. Deterministic, pure, and visible line by line on the screen.
   ============================================================================ */

/**
 * A `NUMERIC` string to a number, or null.
 *
 * `null` for absent, NEVER `0`. "This component has no standard cost" and "this component is
 * free" are different facts, and a screen that rounds the first into the second reports a
 * margin that does not exist.
 */
export function toNum(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Two decimals, the way the database rounds, so the screen and a voucher can agree. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * WHERE A NUMBER CAME FROM. Attached to every figure the cost sheet treats as critical.
 *
 * Three kinds and no others, because the third is what the specification's "AI extraction"
 * actually requires and the first two are what makes it checkable:
 *
 *   record — read from an API response. `ref` names the document it was read from.
 *   entered — a person typed it on this screen. `ref` is who/what they were reading from,
 *             and `note` is the page-anchored note: "supplier quote SQ-118, page 2, line 4".
 *   absent — nothing is known. Rendered as a gap, never as zero.
 *
 * There is no `inferred` and there is no `suggested`. If a value did not come from a record
 * and no person typed it, it does not appear.
 */
export type SourceKind = "record" | "entered" | "absent";

export interface SourceAttribution {
  kind: SourceKind;
  /** The document, endpoint or person the value traces to. */
  ref: string;
  /** A page-anchored note for an entered value: where in the source document it was read. */
  note?: string;
}

/** One visible line of the cost build-up. Nothing is summed that is not also shown. */
export interface CostLine {
  key: string;
  label: string;
  /** The arithmetic, written out, so the total can be checked without reading this file. */
  workings: string;
  amount: number | null;
  source: SourceAttribution;
}

/** What a person types on the cost sheet. Every one of these is an ASSUMPTION, not a record. */
export interface CostAssumptions {
  /** How many pieces this sheet costs. Tooling amortisation and setup depend on it. */
  batchQty: number;
  setupMins: number;
  cycleMinsPerPiece: number;
  labourRatePerHour: number;
  machineRatePerHour: number;
  toolingCost: number;
  /** Tooling is charged across this many pieces, not all onto this batch. */
  toolingAmortiseOverQty: number;
  outsourcedPerPiece: number;
  freightForBatch: number;
  overheadPct: number;
  /** The price being tested. Per piece, excluding GST — margin is measured on taxable value. */
  sellingPricePerPiece: number;
}

export const EMPTY_ASSUMPTIONS: CostAssumptions = {
  batchQty: 1,
  setupMins: 0,
  cycleMinsPerPiece: 0,
  labourRatePerHour: 0,
  machineRatePerHour: 0,
  toolingCost: 0,
  toolingAmortiseOverQty: 1,
  outsourcedPerPiece: 0,
  freightForBatch: 0,
  overheadPct: 0,
  sellingPricePerPiece: 0,
};

/**
 * HOW OLD IS THE PRICE THIS COST IS BUILT ON, AND HAS IT EXPIRED?
 *
 * The one question a cost sheet exists to answer and the one nothing in this database can
 * answer on its own: the item master's `standard_cost` carries no date. So the person enters
 * the supplier quotation's date and its validity, and this function turns the pair into a
 * verdict. Stale is computed from a date comparison, never judged — the same rule the
 * manifest's alerts follow.
 */
export interface PriceFreshness {
  state: "unknown" | "fresh" | "expiring" | "expired";
  /** Days until the quoted price stops holding. Negative once it has stopped. */
  daysLeft: number | null;
  /** How old the quotation itself is, in days. */
  ageDays: number | null;
  message: string;
}

/** Inside this many days of expiry, a price is worth re-confirming before it is quoted. */
export const PRICE_EXPIRING_SOON_DAYS = 14;

export function priceFreshness(
  quotedOn: string,
  validUntil: string,
  today: Date = new Date(),
): PriceFreshness {
  const start = parseDay(quotedOn);
  const end = parseDay(validUntil);
  if (!start && !end) {
    return {
      state: "unknown",
      daysLeft: null,
      ageDays: null,
      message:
        "No supplier-price date has been entered, so the age of this cost is unknown. The item master stores a standard cost but no date, and an undated price is the one a plant discovers is six months old after it has quoted against it.",
    };
  }
  const now = startOfDay(today);
  const ageDays = start ? Math.round((now.getTime() - start.getTime()) / 86_400_000) : null;
  const daysLeft = end ? Math.round((end.getTime() - now.getTime()) / 86_400_000) : null;

  if (daysLeft === null) {
    return {
      state: "unknown",
      daysLeft: null,
      ageDays,
      message:
        ageDays === null
          ? "No validity date has been entered for the supplier price."
          : `The supplier price is ${ageDays} day${ageDays === 1 ? "" : "s"} old and carries no stated validity, so nothing here can say whether it still holds.`,
    };
  }
  if (daysLeft < 0) {
    return {
      state: "expired",
      daysLeft,
      ageDays,
      message: `This supplier price stopped holding ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago. Re-confirm it before this cost is quoted against.`,
    };
  }
  if (daysLeft <= PRICE_EXPIRING_SOON_DAYS) {
    return {
      state: "expiring",
      daysLeft,
      ageDays,
      message: `This supplier price holds for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}. A quotation valid for longer than the cost behind it is a margin nobody has agreed to.`,
    };
  }
  return {
    state: "fresh",
    daysLeft,
    ageDays,
    message: `This supplier price holds for ${daysLeft} more days.`,
  };
}

/**
 * The material lines of a cost build-up, exploded from a real BOM.
 *
 * Two pieces of arithmetic are Engineering's facts rather than this screen's choices, and
 * both are applied here rather than left to a reader:
 *
 *   PER-UNIT. A BOM line's `qty` is per `outputQty` of the parent, not per one. A BOM that
 *   makes 10 impellers from 10.5 castings means 1.05 castings per impeller, and a screen
 *   that multiplies 10.5 by the batch quantity overstates the material cost tenfold.
 *
 *   SCRAP. `scrapPct` is the material you buy and do not ship. It is added, not deducted —
 *   costing the net quantity is how a job that was priced at break-even loses money.
 *
 * A component with no `standardCost` in the item master yields `amount: null` and an `absent`
 * source. It is NOT treated as free, and the caller must decide what to do with a total that
 * is missing a line — `sumLines` refuses to add it up.
 */
export function materialLines(
  bom: BomView,
  batchQty: number,
  costOf: (itemId: string) => string | null | undefined,
): CostLine[] {
  const output = toNum(bom.outputQty) ?? 1;
  const perParent = output > 0 ? output : 1;
  return bom.lines.map((line) => {
    const qty = toNum(line.qty) ?? 0;
    const scrap = toNum(line.scrapPct) ?? 0;
    const perUnit = (qty / perParent) * (1 + scrap / 100);
    const needed = perUnit * batchQty;
    const unitCost = toNum(costOf(line.componentItemId) ?? null);
    const amount = unitCost === null ? null : round2(needed * unitCost);
    return {
      key: `material.${line.lineNo}`,
      label: `${line.componentCode} — ${line.componentName}`,
      workings:
        unitCost === null
          ? `${qty} ${line.uom} per ${bom.outputQty} → ${perUnit.toFixed(4)} per piece (scrap ${scrap}%) × ${batchQty} = ${needed.toFixed(3)} ${line.uom}; no standard cost on the item master`
          : `${qty} ${line.uom} per ${bom.outputQty} → ${perUnit.toFixed(4)} per piece (scrap ${scrap}%) × ${batchQty} = ${needed.toFixed(3)} ${line.uom} × ₹${unitCost.toFixed(2)}`,
      amount,
      source:
        unitCost === null
          ? {
              kind: "absent",
              ref: `Item master has no standard cost for ${line.componentCode}`,
            }
          : {
              kind: "record",
              ref: `BOM v${bom.version} line ${line.lineNo} · item master standard cost`,
            },
    };
  });
}

/**
 * The conversion, tooling and delivery lines, from the assumptions a person entered.
 *
 * Every one of these is `entered`, and the screen labels them as such. The database holds no
 * routing times, no labour rate and no overhead recovery rate — `production_operation` stores
 * actual start and end timestamps but no standard, and there is no work-centre rate table.
 * So these are assumptions, they are shown as assumptions, and the total is an estimate that
 * says so.
 */
export function conversionLines(
  a: CostAssumptions,
  attribution: SourceAttribution,
): CostLine[] {
  const runMins = a.setupMins + a.cycleMinsPerPiece * a.batchQty;
  const runHours = runMins / 60;
  const toolingBase = a.toolingAmortiseOverQty > 0 ? a.toolingAmortiseOverQty : 1;
  return [
    {
      key: "process",
      label: "Process / machine time",
      workings: `setup ${a.setupMins} min + ${a.cycleMinsPerPiece} min × ${a.batchQty} = ${runMins.toFixed(1)} min (${runHours.toFixed(2)} h) × ₹${a.machineRatePerHour.toFixed(2)}/h`,
      amount: round2(runHours * a.machineRatePerHour),
      source: attribution,
    },
    {
      key: "labour",
      label: "Labour",
      workings: `${runHours.toFixed(2)} h × ₹${a.labourRatePerHour.toFixed(2)}/h — the same measured time as the process line, not a second estimate of it`,
      amount: round2(runHours * a.labourRatePerHour),
      source: attribution,
    },
    {
      key: "tooling",
      label: "Tooling",
      workings: `₹${a.toolingCost.toFixed(2)} amortised over ${toolingBase} pieces × ${a.batchQty} in this batch`,
      amount: round2((a.toolingCost / toolingBase) * a.batchQty),
      source: attribution,
    },
    {
      key: "outsourced",
      label: "Outsourced work",
      workings: `₹${a.outsourcedPerPiece.toFixed(2)} per piece × ${a.batchQty}`,
      amount: round2(a.outsourcedPerPiece * a.batchQty),
      source: attribution,
    },
    {
      key: "freight",
      label: "Freight & packing",
      workings: `₹${a.freightForBatch.toFixed(2)} for the batch, not per piece`,
      amount: round2(a.freightForBatch),
      source: attribution,
    },
  ];
}

export interface CostTotals {
  /** Everything before overhead recovery. */
  worksCost: number | null;
  overhead: number | null;
  totalCost: number | null;
  perPiece: number | null;
  /** How many lines could not be costed. A total with any of these is not a total. */
  missingLines: number;
}

/**
 * Add the lines up — or refuse to.
 *
 * A line with `amount: null` is a hole, and a sum that skipped it would be a smaller, more
 * attractive and completely wrong number. So `worksCost` is null whenever ANY line is
 * uncosted, and `missingLines` says how many. The screen then shows the priced lines, shows
 * the holes, and declines to print a total — which is the answer, not a failure to produce
 * one.
 */
export function sumLines(lines: readonly CostLine[], overheadPct: number, batchQty: number): CostTotals {
  const missingLines = lines.filter((l) => l.amount === null).length;
  if (missingLines > 0) {
    return { worksCost: null, overhead: null, totalCost: null, perPiece: null, missingLines };
  }
  const worksCost = round2(lines.reduce((total, l) => total + (l.amount ?? 0), 0));
  const overhead = round2((worksCost * overheadPct) / 100);
  const totalCost = round2(worksCost + overhead);
  const pieces = batchQty > 0 ? batchQty : 1;
  return {
    worksCost,
    overhead,
    totalCost,
    perPiece: round2(totalCost / pieces),
    missingLines: 0,
  };
}

export interface MarginResult {
  revenue: number;
  cost: number;
  amount: number;
  /** Margin on REVENUE, the convention every Indian sales office already reads. */
  pct: number;
}

/** Margin on revenue. Null revenue yields null rather than a division by zero. */
export function marginOf(revenue: number, cost: number): MarginResult | null {
  if (!Number.isFinite(revenue) || revenue <= 0) return null;
  const amount = round2(revenue - cost);
  return { revenue: round2(revenue), cost: round2(cost), amount, pct: round2((amount / revenue) * 100) };
}

/**
 * WHO HAS TO SAY YES.
 *
 * There is no approval-limit table in this database and this module adds none, so this does
 * NOT invent an approver hierarchy with names and bands. It reports the one thing that is
 * actually true and actually enforced: recording a customer's answer to a quotation requires
 * `sales.quotation.decide`, and `@RequirePermission` on `POST /sales/quotations/:id/decide`
 * refuses without it — whatever any screen draws.
 *
 * A margin below the floor therefore produces a REVIEW REQUIREMENT stated in words, not a
 * workflow. The screen says the figure is below the floor somebody typed, says who the API
 * will accept a decision from, and stops. Drawing an approval chain that nothing enforces
 * would be the most dangerous thing on this screen.
 */
export type FloorVerdict = "above" | "at" | "below" | "unknown";

export function floorVerdict(margin: MarginResult | null, floorPct: number): FloorVerdict {
  if (!margin) return "unknown";
  if (margin.pct > floorPct) return "above";
  if (Math.abs(margin.pct - floorPct) < 0.005) return "at";
  return "below";
}

/* ============================================================================
   SERVICE-SIDE HELPERS. Same rule: a verdict is computed, never judged.
   ============================================================================ */

/** The SLA engine's own state string mapped to the badge vocabulary. Never recomputed. */
export function slaTone(state: string): "done" | "progress" | "hold" | "overdue" | "unknown" {
  if (state === "met") return "done";
  if (state === "on_track") return "progress";
  if (state === "paused") return "hold";
  if (state.startsWith("breached") || state === "at_risk") return "overdue";
  return "unknown";
}

export function isOpenTicket(status: string): boolean {
  return status !== "closed" && status !== "resolved";
}

/**
 * How old is the cached coverage verdict?
 *
 * `entitlement.checkedAt` is not decoration. A verdict without its timestamp cannot be told
 * apart from one computed a year ago against cover that has since run out — which is why the
 * table has a CHECK constraint refusing one without the other, and why this screen never
 * prints a verdict without saying when it was reached.
 */
export function coverageAge(
  checkedAt: string | null,
  today: Date = new Date(),
): { days: number; stale: boolean } | null {
  const when = checkedAt ? new Date(checkedAt) : null;
  if (!when || Number.isNaN(when.getTime())) return null;
  const days = Math.max(
    0,
    Math.round((startOfDay(today).getTime() - startOfDay(when).getTime()) / 86_400_000),
  );
  return { days, stale: days > 30 };
}

export function coverageTone(verdict: string | null): "done" | "pending" | "rejected" | "unknown" {
  if (!verdict) return "unknown";
  if (verdict.startsWith("covered")) return "done";
  if (verdict === "partial") return "pending";
  if (verdict === "not_covered") return "rejected";
  return "unknown";
}

/**
 * Does this consignment need an e-way bill?
 *
 * A value comparison and nothing else — the kind of decision that belongs in code. It says
 * "required", never "missing": no read endpoint in this build returns the `ewayBillNo` the
 * dispatch stored, so "missing" is a claim the software cannot make.
 */
export function needsEwayBill(consignmentValue: string | number | null | undefined): boolean {
  const n = toNum(consignmentValue ?? null);
  return n !== null && n > EWAY_BILL_THRESHOLD_INR;
}

/* --------------------------------- internals -------------------------------- */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}
