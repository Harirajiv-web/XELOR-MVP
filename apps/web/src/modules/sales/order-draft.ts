/**
 * THE NEW-ORDER DRAFT — everything about creating a sales order that is not React.
 *
 * Kept out of the component on purpose. A sales order is a financial document that carries
 * GST, and the rules that decide whether it can be saved are worth reading on their own,
 * without a JSX tree wrapped around them. They are also the rules most likely to be copied
 * into the next create form, and a component is a bad place to copy rules out of.
 *
 * WHAT THIS FILE IS NOT. It is not security, and it is not the tax computation. Every rule
 * below is enforced again by `orderSchema` in `sales.controller.ts`, by `SalesService`, and
 * in two cases by a database trigger. If this file were deleted, nothing would become
 * possible that is not possible now — the requests would simply be refused a few hundred
 * milliseconds later, one at a time, in the server's words rather than next to the field.
 *
 * That difference is the whole point. A clerk who submits five times and collects five
 * different server errors stops believing the software knows what it wants. Validating here
 * means the form asks once, completely, in the same place the mistake was made.
 *
 * Every rule here mirrors a named rule on the server. The mirror is annotated at each site,
 * so when the server's rule moves, the search that finds it finds this too.
 */

import { AppError } from "@spine/api/errors";

/* -------------------------------------------------------------------------- */
/* What the user is editing                                                    */
/* -------------------------------------------------------------------------- */

export interface OrderLineDraft {
  /** React key only. Never sent — the server keys lines by position. */
  key: string;
  itemId: string;
  /**
   * Carried from the item master when an item is picked, and sent with the line.
   * The server stores the unit AGREED ON THE LINE and prefers it over the master's
   * afterwards, so an order taken in boxes stays in boxes if Engineering later restates
   * the item in pieces.
   */
  uom: string;
  qty: string;
  rate: string;
  hsn: string;
  gstRatePct: string;
  discountPct: string;
  /** Blank means "use the order-level promise" — see `effectiveDeliveryDate`. */
  requestedDeliveryDate: string;
}

export interface OrderDraft {
  customerId: string;
  custPoNo: string;
  orderDate: string;
  /**
   * The promise that applies to every line unless a line overrides it.
   *
   * BLANK IS A REAL ANSWER and the default, which is a deliberate choice against the more
   * obvious one of pre-filling a date a fortnight out. `orderSchema` makes this optional
   * with a comment explaining why: orders are genuinely taken with no promised date, and an
   * invented one is indistinguishable from a promise somebody actually made to a customer.
   * Planning treats a null as demand in the current bucket and raises a `data_warning`;
   * it has no way at all to un-invent a date this form guessed.
   */
  requestedDeliveryDate: string;
  supplierGstin: string;
  shipToStateCode: string;
  shipToGstin: string;
  shipToAddress: string;
  fgWarehouseId: string;
  lines: OrderLineDraft[];
}

/** Just enough of the chosen customer to validate against. */
export interface DraftContext {
  customerStateCode: string | null;
  customerGstin: string | null;
}

/* -------------------------------------------------------------------------- */
/* What goes on the wire — `orderSchema`, field for field                      */
/* -------------------------------------------------------------------------- */

export interface CreateOrderLineBody {
  itemId: string;
  qty: number;
  rate: number;
  hsn: string;
  gstRatePct: number;
  discountPct?: number;
  uom?: string;
  requestedDeliveryDate?: string;
}

export interface CreateOrderBody {
  customerId: string;
  custPoNo: string;
  orderDate?: string;
  supplierGstin: string;
  shipToStateCode?: string;
  shipToGstin?: string;
  shipToAddress?: string;
  fgWarehouseId?: string;
  lines: CreateOrderLineBody[];
}

/* -------------------------------------------------------------------------- */
/* Shapes the server checks, mirrored                                          */
/* -------------------------------------------------------------------------- */

/** `orderSchema.orderDate` / `.requestedDeliveryDate`: /^\d{4}-\d{2}-\d{2}$/. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `orderSchema.lines[].hsn`: 4, 6 or 8 digits — 6 is mandatory above ₹5 crore AATO. */
const HSN_SHAPE = /^(\d{4}|\d{6}|\d{8})$/;

/** `orderSchema.shipToStateCode`: /^\d{2}$/. */
const STATE_CODE_SHAPE = /^\d{2}$/;

/**
 * The GSTIN shape, copied from `isValidGstinFormat` in `packages/platform/src/tax/gst.ts`.
 *
 * COPIED, NOT IMPORTED, and that is a real cost worth naming: the web app may not import
 * from another module's folder or from the API's packages, so this regex now exists twice.
 * It is copied rather than approximated — a looser client check would let a malformed GSTIN
 * reach the server and come back as a field error anyway, which is the failure this file
 * exists to prevent. The CHECK DIGIT is deliberately not verified here: the platform leaves
 * checksum enforcement to per-tenant config precisely because the §7 demo GSTINs are
 * well-formed and fictional, and a client that rejected them would make the demo unusable.
 */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The literal the IRP expects when the consignee has no registration. */
const URP = "URP";

/* -------------------------------------------------------------------------- */
/* Building a draft                                                            */
/* -------------------------------------------------------------------------- */

let lineSeq = 0;

export function newLineDraft(): OrderLineDraft {
  lineSeq += 1;
  return {
    key: `line-${lineSeq}`,
    itemId: "",
    uom: "",
    qty: "",
    rate: "",
    hsn: "",
    gstRatePct: "",
    discountPct: "",
    requestedDeliveryDate: "",
  };
}

/** Today, in the ISO form the API wants, from the LOCAL day rather than UTC. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A fresh draft: today's date, and exactly ONE line.
 *
 * One line, because the overwhelming majority of orders are one line and a form that opens
 * with an empty list and a "+ Add line" button makes every one of them a two-step job.
 */
export function emptyOrderDraft(): OrderDraft {
  return {
    customerId: "",
    custPoNo: "",
    orderDate: todayIso(),
    requestedDeliveryDate: "",
    supplierGstin: "",
    shipToStateCode: "",
    shipToGstin: "",
    shipToAddress: "",
    fgWarehouseId: "",
    lines: [newLineDraft()],
  };
}

/** The promise that actually applies to a line: its own, or the order's. */
export function effectiveDeliveryDate(draft: OrderDraft, line: OrderLineDraft): string {
  return line.requestedDeliveryDate.trim() || draft.requestedDeliveryDate.trim();
}

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

function toNumber(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** `round2` from the platform's tax brain, so the ex-GST figure matches its `subtotal`. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * One line's taxable value: qty × rate less the line discount.
 *
 * The same arithmetic as `computeLineTax`, in the same order, rounded at the same point.
 * Doing it differently would produce a running total that disagrees with the saved order by
 * a rupee, and a total that is nearly right is worse than no total at all.
 */
export function lineTaxableValue(line: OrderLineDraft): number | null {
  const qty = toNumber(line.qty);
  const rate = toNumber(line.rate);
  if (qty === null || rate === null) return null;
  const disc = toNumber(line.discountPct) ?? 0;
  if (qty <= 0 || rate < 0 || disc < 0 || disc >= 100) return null;
  return round2(qty * rate * (1 - disc / 100));
}

export interface DraftTotals {
  /** Sum of the priced lines' taxable values. Ex-GST, and labelled as such on screen. */
  subtotal: number;
  /** Ex-GST value the user has not finished pricing — why the total may look low. */
  incompleteLines: number;
  /**
   * GST at the rates typed on the lines. INDICATIVE ONLY.
   *
   * The server recomputes tax from the order date's rate table, decides intra- vs
   * inter-state once for the whole document, and rounds the grand total to the rupee. This
   * figure is here so a clerk can sanity-check an order against a customer's PO, and it is
   * never presented as the amount the order will carry.
   */
  indicativeTax: number;
  /**
   * Whether this will be an IGST supply, guessed from the supplier's registration state and
   * the ship-to state. Null when either is not yet known. Indicative, like the tax.
   */
  interState: boolean | null;
}

export function draftTotals(draft: OrderDraft, ctx: DraftContext): DraftTotals {
  let subtotal = 0;
  let indicativeTax = 0;
  let incompleteLines = 0;

  for (const line of draft.lines) {
    const taxable = lineTaxableValue(line);
    if (taxable === null) {
      incompleteLines += 1;
      continue;
    }
    subtotal += taxable;
    const rate = toNumber(line.gstRatePct);
    if (rate !== null && rate >= 0) indicativeTax += round2((taxable * rate) / 100);
  }

  const supplierState = draft.supplierGstin.trim().slice(0, 2);
  const shipState = draft.shipToStateCode.trim() || ctx.customerStateCode || "";
  const interState =
    STATE_CODE_SHAPE.test(supplierState) && STATE_CODE_SHAPE.test(shipState)
      ? supplierState !== shipState
      : null;

  return {
    subtotal: round2(subtotal),
    incompleteLines,
    indicativeTax: round2(indicativeTax),
    interState,
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Field-keyed problems with the draft. Empty means the server should accept it.
 *
 * The keys match the server's own field paths — `custPoNo`, `supplierGstin`,
 * `lines.0.hsn` — so a validation envelope coming back from the API drops straight onto the
 * same inputs without a translation table in between.
 */
export function validateOrderDraft(draft: OrderDraft, ctx: DraftContext): Record<string, string> {
  const errors: Record<string, string> = {};

  // --- customer -----------------------------------------------------------
  if (!draft.customerId) {
    errors.customerId = "Choose the customer this order is for.";
  }

  // --- their PO number ----------------------------------------------------
  // `custPoNo: z.string().min(1)`. The DUPLICATE check is the server's — it needs to look
  // at every order this customer has ever placed, which a form cannot.
  if (!draft.custPoNo.trim()) {
    errors.custPoNo = "Enter the customer's purchase order number — it is how they will refer to this.";
  }

  // --- order date ---------------------------------------------------------
  if (!ISO_DATE.test(draft.orderDate)) {
    errors.orderDate = "Enter the order date as a real date.";
  }

  // --- who is selling -----------------------------------------------------
  // `supplierGstin: z.string().min(15).max(15)`, then `validateGstin` in the service. The
  // registration decides the place of supply, which decides IGST vs CGST+SGST — it is not
  // a formality, it is the field the tax hangs off.
  const supplier = draft.supplierGstin.trim().toUpperCase();
  if (!supplier) {
    errors.supplierGstin = "Choose which of your GST registrations is selling — it decides the tax.";
  } else if (!GSTIN_SHAPE.test(supplier)) {
    errors.supplierGstin = "That is not a valid GSTIN — 15 characters, e.g. 27AABCT1234F1Z5.";
  }

  // --- where it ships -----------------------------------------------------
  // Place of supply for GOODS is the shipping destination. The server falls back to the
  // customer's own state, and refuses the order when there is nothing to fall back to.
  const shipStateTyped = draft.shipToStateCode.trim();
  if (shipStateTyped && !STATE_CODE_SHAPE.test(shipStateTyped)) {
    errors.shipToStateCode = "A GST state code is two digits, e.g. 27 for Maharashtra.";
  }
  const shipState = shipStateTyped || ctx.customerStateCode || "";
  if (!shipState) {
    errors.shipToStateCode =
      "Required — this customer has no GSTIN to take the delivery state from, so it has to be said here.";
  }

  // `checkShipToGstin` in the service, and the state cross-check right after it.
  const shipGstin = draft.shipToGstin.trim().toUpperCase();
  if (shipGstin && shipGstin !== URP) {
    if (!GSTIN_SHAPE.test(shipGstin)) {
      errors.shipToGstin = `“${draft.shipToGstin.trim()}” is not a valid GSTIN. Use ${URP} if the consignee is unregistered.`;
    } else if (STATE_CODE_SHAPE.test(shipState) && shipGstin.slice(0, 2) !== shipState) {
      errors.shipToGstin = `This GSTIN is registered in state ${shipGstin.slice(0, 2)} but the delivery state is ${shipState}. One of the two is wrong.`;
    }
  }

  // --- the order-level promise -------------------------------------------
  if (draft.requestedDeliveryDate.trim()) {
    const promised = draft.requestedDeliveryDate.trim();
    if (!ISO_DATE.test(promised)) {
      errors.requestedDeliveryDate = "Enter the promised delivery as a real date, or leave it blank.";
    } else if (ISO_DATE.test(draft.orderDate) && promised < draft.orderDate) {
      errors.requestedDeliveryDate = deliveryBeforeOrder(promised, draft.orderDate);
    }
  }

  // --- the lines ----------------------------------------------------------
  if (draft.lines.length === 0) {
    errors.lines = "A sales order needs at least one line.";
  }

  draft.lines.forEach((line, i) => {
    const at = (field: string): string => `lines.${i}.${field}`;

    if (!line.itemId) errors[at("itemId")] = "Choose the item.";

    const qty = toNumber(line.qty);
    if (qty === null) errors[at("qty")] = "Enter a quantity.";
    else if (qty <= 0) errors[at("qty")] = "Quantity must be more than zero.";

    const rate = toNumber(line.rate);
    if (rate === null) errors[at("rate")] = "Enter the agreed unit price.";
    else if (rate < 0) errors[at("rate")] = "A rate cannot be negative.";

    // `isValidHsn` — and the server throws GST_INPUT_INVALID rather than a field error for
    // this one, which arrives as a banner naming a line number. Catching it here is what
    // keeps it next to the input the person typed it into.
    const hsn = line.hsn.trim();
    if (!hsn) errors[at("hsn")] = "HSN is required on a taxable line.";
    else if (!HSN_SHAPE.test(hsn)) errors[at("hsn")] = "HSN must be 4, 6 or 8 digits.";

    const gst = toNumber(line.gstRatePct);
    if (gst === null) errors[at("gstRatePct")] = "Enter the GST rate for this item.";
    else if (gst < 0 || gst > 28) errors[at("gstRatePct")] = "The GST rate must be between 0 and 28.";

    if (line.discountPct.trim()) {
      const disc = toNumber(line.discountPct);
      if (disc === null) errors[at("discountPct")] = "Enter the discount as a percentage, or leave it blank.";
      else if (disc < 0 || disc > 99.99) errors[at("discountPct")] = "A discount must be between 0 and 99.99%.";
    }

    // Migration 0033 puts a TRIGGER behind this, and `doCreateOrder` checks it first so the
    // caller gets a domain error instead of a raw check_violation. The form checks it before
    // either, because it is a typo and the person who made it is still looking at the field.
    const promised = line.requestedDeliveryDate.trim();
    if (promised) {
      if (!ISO_DATE.test(promised)) {
        errors[at("requestedDeliveryDate")] = "Enter a real date, or leave it blank to use the order's date.";
      } else if (ISO_DATE.test(draft.orderDate) && promised < draft.orderDate) {
        errors[at("requestedDeliveryDate")] = deliveryBeforeOrder(promised, draft.orderDate);
      }
    }
  });

  return errors;
}

function deliveryBeforeOrder(promised: string, orderDate: string): string {
  return `${promised} is before the order date ${orderDate}. A delivery cannot be promised for a date that has already passed — planning would file it in a bucket nothing can clear.`;
}

/* -------------------------------------------------------------------------- */
/* Draft → request body                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Turn the draft into the body `POST /sales/orders` expects.
 *
 * Blank optionals are OMITTED rather than sent as empty strings: `orderSchema` would reject
 * `""` against a uuid or a date regex, and an empty string is not what "the customer did not
 * give us one" means.
 */
export function toCreateOrderBody(draft: OrderDraft): CreateOrderBody {
  const body: CreateOrderBody = {
    customerId: draft.customerId,
    custPoNo: draft.custPoNo.trim(),
    orderDate: draft.orderDate,
    supplierGstin: draft.supplierGstin.trim().toUpperCase(),
    lines: draft.lines.map((line) => {
      const out: CreateOrderLineBody = {
        itemId: line.itemId,
        qty: Number(line.qty),
        rate: Number(line.rate),
        hsn: line.hsn.trim(),
        gstRatePct: Number(line.gstRatePct),
      };
      if (line.discountPct.trim()) out.discountPct = Number(line.discountPct);
      if (line.uom.trim()) out.uom = line.uom.trim();
      const promised = effectiveDeliveryDate(draft, line);
      if (promised) out.requestedDeliveryDate = promised;
      return out;
    }),
  };

  if (draft.shipToStateCode.trim()) body.shipToStateCode = draft.shipToStateCode.trim();
  if (draft.shipToGstin.trim()) body.shipToGstin = draft.shipToGstin.trim().toUpperCase();
  if (draft.shipToAddress.trim()) body.shipToAddress = draft.shipToAddress.trim();
  if (draft.fgWarehouseId) body.fgWarehouseId = draft.fgWarehouseId;

  return body;
}

/* -------------------------------------------------------------------------- */
/* When the server refuses                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateFailure {
  /** The headline. A sentence about THIS order, never "an error occurred". */
  title: string;
  /** What to do about it. */
  body: string;
  /** Messages to hang next to specific inputs, keyed the same way as validation. */
  fields: Record<string, string>;
  /** Present when the only useful next step is a support call. */
  traceId?: string;
  /** Named on a 403, because a permission with a name is something you can go and ask for. */
  missingPermission?: string;
}

/**
 * The canonical error envelope, turned into something a person can act on.
 *
 * Every branch below exists because the alternative — one grey "something went wrong" — sends
 * the user to the wrong place. A duplicate PO is a question for the customer, a 403 is a
 * question for the administrator, a bad HSN is a question for nobody because they can fix it
 * themselves in the field it came from.
 *
 * The final branch is the honest one: an unrecognised code keeps the server's own message and
 * the trace id, which is the shortest possible support call.
 */
export function describeCreateFailure(error: unknown): CreateFailure {
  if (!(error instanceof AppError)) {
    return {
      title: "The order was not saved",
      body: error instanceof Error ? error.message : "Something unexpected happened before the request was sent.",
      fields: {},
    };
  }

  const traceId = error.traceId;
  const fields = error.byField();

  switch (error.code) {
    /**
     * The unique index is the backstop; `doCreateOrder` turns it into this code so the
     * message can name the order the PO is already on. Almost always a re-key of an order
     * somebody else already entered — which means the useful response is to go and look at
     * it, not to try again.
     */
    case "DUPLICATE_CUSTOMER_PO":
      return {
        title: "This customer's PO number is already on an order",
        body: error.message,
        fields: { custPoNo: error.message },
        traceId,
      };

    case "VALIDATION_FAILED":
      return {
        title: "Some details need correcting",
        body:
          Object.keys(fields).length > 0
            ? "The fields below were refused. Each one is marked."
            : error.message,
        fields,
        traceId,
      };

    case "CUSTOMER_NOT_FOUND":
      return {
        title: "That customer no longer exists",
        body: "Somebody removed or deactivated the customer while this form was open. Pick another, or ask for the customer master to be checked.",
        fields: { customerId: "This customer is no longer in the master." },
        traceId,
      };

    /**
     * The 1 Aug 2026 mandate. The DATE lives in the platform's GST config, not here — which
     * is exactly why the server's own message is passed through verbatim: it names the date
     * from configuration, and a client that repeated the date would be a statutory constant
     * hiding in a screen.
     */
    case "SHIP_TO_GSTIN_REQUIRED":
      return {
        title: "This order needs a ship-to GSTIN",
        body: `${error.message} This is the last point at which somebody can still ask the customer for it.`,
        fields: { shipToGstin: error.message },
        traceId,
      };

    /**
     * The tax brain refused the inputs — a bad HSN or an unknown state code. Its message
     * names the line ("line 2: HSN '123' must be 4, 6 or 8 digits"), so it is shown whole
     * rather than dissected into a field the parse might get wrong.
     */
    case "GST_INPUT_INVALID":
      return {
        title: "The tax could not be worked out from these lines",
        body: error.message,
        fields,
        traceId,
      };

    /**
     * Reachable BECAUSE the form pins one Idempotency-Key for as long as it is open.
     *
     * It means the first submission from this form already succeeded — the server has the
     * answer recorded against this key — and what has just been sent is a DIFFERENT order
     * body under the same key. In practice: the reply to the first attempt was lost, the
     * user edited something and pressed Save again. The order exists. Saying "something went
     * wrong" here would invite them to enter it a third time.
     */
    case "IDEMPOTENCY_KEY_MISMATCH":
      return {
        title: "An order was already raised from this form",
        body: "The first save went through even if the reply did not come back, and what is on screen now is different from what was saved. Check the sales order list before entering it again — then close this form and start a new one if it really is a second order.",
        fields: {},
        traceId,
      };

    /**
     * The same key is mid-flight — the previous request is still running somewhere. Not a
     * failure, and emphatically not a reason to press Save again with a different key.
     */
    case "IDEMPOTENCY_IN_PROGRESS":
      return {
        title: "This order is still being saved",
        body: "The previous attempt has not finished. Wait a moment and press Save again — the same order will be returned rather than a second one created.",
        fields: {},
        traceId,
      };

    default:
      break;
  }

  switch (error.kind) {
    case "forbidden": {
      const needs = error.missingPermission ?? "sales.order.create";
      return {
        title: "You are not allowed to create sales orders",
        body: `Ask your administrator for ${needs}. Nothing was saved.`,
        fields: {},
        traceId,
        missingPermission: needs,
      };
    }
    case "network":
      return {
        title: "The order did not reach the server",
        body: "Check the connection and press Save again. Nothing was created — if it had been, the order would be on the list.",
        fields: {},
      };
    case "validation":
      return {
        title: "Some details need correcting",
        body: Object.keys(fields).length > 0 ? "The fields below were refused." : error.message,
        fields,
        traceId,
      };
    case "conflict":
      return { title: "The order was refused", body: error.message, fields, traceId };
    default:
      return {
        title: "The order was not saved",
        body: error.message,
        fields,
        traceId,
      };
  }
}
