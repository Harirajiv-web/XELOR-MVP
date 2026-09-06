/**
 * Quotations' own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * Every field below was read off `apps/api/src/modules/sales/quotation.service.ts` rather
 * than inferred from the table names. Money and quantities arrive as STRINGS: the columns are
 * `NUMERIC(18,2)` and a float would not survive the trip.
 *
 * The one import is the spine's `AppError` — the platform's error envelope, not another
 * module's code. The folder is still deletable.
 */

import { AppError } from "@spine/api/errors";

/** One priced line of a quotation. `itemCode`/`itemName` are left-joined and can be null. */
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

/**
 * A row on the list. Summaries only — no lines, and the list has no use for them.
 *
 * `expired` is COMPUTED BY THE SERVER on every read (`valid_until < today`), never stored.
 * That matters to this screen: a quotation does not become expired by anybody doing
 * anything, it becomes expired by a day passing, and a stored flag would have to be swept.
 */
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
  /** The sales order this quotation became, once it has become one. */
  convertedSoNo: string | null;
  expired: boolean;
}

export interface QuotationView {
  id: string;
  quoteNo: string;
  revisionNo: number;
  /** The revision this one replaced. Present from revision 2 onwards. */
  supersedesId: string | null;
  customerId: string;
  customerName: string | null;
  enquiryRef: string | null;
  quoteDate: string;
  validUntil: string;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  status: string;
  /** Why it was lost, when the customer said no. Recorded as their answer, not ours. */
  lostReason: string | null;
  convertedOrderId: string | null;
  convertedSoNo: string | null;
  expired: boolean;
  lines: QuotationLineView[];
}

/** A customer, from SALES' own master — the list the New-quotation form picks from. */
export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  creditLimit: string;
}

/**
 * An item as the New-quotation form needs it, from ENGINEERING's list endpoint.
 *
 * A QUOTATION SCREEN CALLING AN ENGINEERING ENDPOINT IS FINE. The boundary rule this app
 * enforces is about IMPORTS between module FOLDERS — `modules/quotation/` may not import
 * `modules/engineering/`, because that is what would stop either folder from being deletable.
 * It says nothing about HTTP: a quoted line names an item, the item master is Engineering's
 * system of record, and the sanctioned way to read somebody else's master is to ask their
 * endpoint for it. This module keeping its own copy of the item list would be the actual
 * violation.
 *
 * `GET /engineering/items` does NOT return an HSN code, so HSN is typed on the line — see
 * the note on the form.
 */
export interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  uom: string;
}

/** One of the tenant's own GST registrations — GENERAL's `GstRegistrationRow`. */
export interface GstRegistrationOption {
  id: string;
  gstin: string;
  stateCode: string;
  /** "Pune-Chakan", "Coimbatore" — the registered place of business, i.e. the plant. */
  placeName: string;
}

/** A company with the places it is registered to trade from — GENERAL's list row. */
export interface CompanyOption {
  id: string;
  legalName: string;
  registrations: GstRegistrationOption[];
}

/** One line of `POST /sales/quotations`, exactly as the zod schema accepts it. */
export interface CreateQuotationLine {
  itemId: string;
  qty: number;
  rate: number;
  hsn: string;
  gstRatePct: number;
  uom?: string;
  description?: string;
  requestedDeliveryDate?: string;
}

/**
 * The body of `POST /sales/quotations`, transcribed field by field from `createSchema` in
 * `apps/api/src/modules/sales/quotation.controller.ts`:
 *
 *   customerId     uuid, REQUIRED
 *   enquiryRef     string, max 120, optional
 *   quoteDate      date, optional (the service defaults it to today)
 *   validUntil     date, REQUIRED — a quotation without an expiry is a promise without an end
 *   paymentTerms   string, max 240, optional
 *   deliveryTerms  string, max 240, optional
 *   notes          string, max 2000, optional
 *   lines          at least one { itemId, qty > 0, rate >= 0, hsn, gstRatePct 0–100 }
 */
export interface CreateQuotationBody {
  customerId: string;
  enquiryRef?: string;
  quoteDate?: string;
  validUntil: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
  lines: CreateQuotationLine[];
}

export const quotationApi = {
  listPath: "/sales/quotations",
  quotationPath: (id: string): string => `/sales/quotations/${id}`,
  sendPath: (id: string): string => `/sales/quotations/${id}/send`,
  decidePath: (id: string): string => `/sales/quotations/${id}/decide`,
  convertPath: (id: string): string => `/sales/quotations/${id}/convert`,
  /**
   * Endpoints the New-quotation form reads to fill its pickers. Other modules' HTTP
   * surfaces, deliberately — see `ItemOption` above for why that is not a boundary breach.
   */
  customersPath: "/sales/customers",
  itemsPath: "/engineering/items",
  companiesPath: "/general/companies",
  /** `listQuerySchema` caps `limit` at 100 and answers 422 to anything above it. */
  pageSize: 50,
  /** Pickers pull the largest page the API allows, then filter what has been loaded. */
  pickerPageSize: 100,
} as const;

/* --------------------------- the state machine ----------------------------- */

/**
 * WHICH BUTTON MAY BE DRAWN, AND WHY EACH RULE IS HERE RATHER THAN IN THE SCREEN.
 *
 * `QuotationService.transition` refuses anything out of state with `QUOTATION_NOT_IN_STATE`
 * (409) before it writes a row, and `doConvert` refuses a quotation that is not `accepted`
 * with `QUOTATION_NOT_ACCEPTED`. So a Send button on a sent quotation has exactly one
 * reachable outcome — a refusal — and a control whose only result is an error teaches people
 * that this software's buttons are guesses.
 *
 * The rules live next to the endpoints they guard so the button and the failure message are
 * reasoning from one statement of them. The API's guard is what actually enforces this; these
 * three functions only decide what to DRAW.
 */
export function canSend(status: string): boolean {
  return status === "draft";
}

export function canDecide(status: string): boolean {
  return status === "sent";
}

/** Convert needs `accepted` AND no order already made from it — the second is a unique key. */
export function canConvert(q: { status: string; convertedOrderId: string | null }): boolean {
  return q.status === "accepted" && q.convertedOrderId === null;
}

/**
 * An ACCEPTED quotation whose price has expired is a genuine trap, and the server closes it:
 * `transition` refuses `accepted` when `valid_until` has passed. Conversion itself does not
 * re-check the date — the acceptance did — so an expired-but-accepted quotation still
 * converts, and the screen says the price is old rather than pretending it is not.
 */
export function isPriceStale(q: { expired: boolean; status: string }): boolean {
  return q.expired && q.status !== "converted";
}

/* ------------------------------- arithmetic -------------------------------- */

/**
 * WHOLE DAYS FROM TODAY TO A DATE. Negative when the date is behind us, `null` when there is
 * no date or it cannot be read — which is a different answer from zero, and callers treat it
 * that way rather than assuming "today".
 *
 * TWO THINGS ARE DELIBERATE. A `date` column arrives as the bare string `2026-09-30`, and
 * `new Date("2026-09-30")` is parsed as MIDNIGHT UTC — the 29th in any timezone west of
 * Greenwich. So a plain `YYYY-MM-DD` is split and rebuilt as a LOCAL date. And the comparison
 * is at DAY granularity against the BROWSER'S today: a quotation valid until today has not
 * expired at nine in the morning, and a screen that says it has teaches people to ignore the
 * column by lunchtime.
 */
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysUntil(isoDate: string | null | undefined, from: Date = new Date()): number | null {
  if (!isoDate) return null;
  const parts = YMD.exec(isoDate.slice(0, 10));
  const due = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(isoDate);
  if (Number.isNaN(due.getTime())) return null;
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((dueDay - today) / 86_400_000);
}

/** How long a price has left to run, in days. Used by the list, the tile and the watch. */
export const EXPIRING_SOON_DAYS = 7;

/** Still live, still ours to chase: sent, not yet answered, and the price still stands. */
export function isAwaitingAnswer(q: { status: string; expired: boolean }): boolean {
  return q.status === "sent" && !q.expired;
}

/** Sum a column of `NUMERIC` strings without letting one bad row poison the total. */
export function sumAmounts(values: readonly string[]): number {
  return values.reduce((total, v) => {
    const n = Number(v);
    return Number.isFinite(n) ? total + n : total;
  }, 0);
}

/**
 * Parse a number typed into a field.
 *
 * Returns null for anything that is not a finite number, INCLUDING an empty string — which
 * `Number("")` helpfully turns into 0. On a rate field that silent zero is a price quoted at
 * nothing, so "nothing typed" and "zero" stay different answers.
 */
export function parseNumeric(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Today, as the API writes dates. Used as the default quote date on a new form. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------------------------
   FAILURES, TURNED INTO SOMETHING A SALESPERSON CAN ACT ON.

   Every code below means a genuinely different next step: fix a field, reload the page
   because somebody else moved the document on, raise a revision, or ring support with a
   reference. Rendering them all as the server's raw message would be honest and useless —
   "QT-2627-00007 is sent" tells a salesperson what happened but not that the page in front
   of them is stale.
   ------------------------------------------------------------------------------------ */

export interface FailureNotice {
  /** One line, in the user's terms. */
  title: string;
  /** What to do about it. Empty when the title is the whole story. */
  body: string;
  /** Per-field messages keyed as the API names them — `validUntil`, `lines.0.qty`. */
  fields: Record<string, string>;
  /** Present only on a 403, and it is the name of the permission to go and ask for. */
  missingPermission: string | null;
  /** Present when the server gave one. What makes a support call one query long. */
  traceId: string | null;
  /** True when the document moved on and the screen should be reloaded, not retried. */
  stale: boolean;
}

export type QuotationAction = "create" | "send" | "decide" | "convert";

const ACTION_WORDS: Record<QuotationAction, string> = {
  create: "raise quotations",
  send: "send this quotation",
  decide: "record the customer's answer",
  convert: "turn this quotation into an order",
};

export function describeFailure(error: unknown, action: QuotationAction): FailureNotice {
  const app = error instanceof AppError ? error : null;
  const base: FailureNotice = {
    title: "The request was refused.",
    body: "",
    fields: {},
    missingPermission: null,
    traceId: null,
    stale: false,
  };
  if (!app) {
    return { ...base, title: error instanceof Error ? error.message : "Something went wrong." };
  }
  const notice: FailureNotice = { ...base, traceId: app.traceId ?? null };

  switch (app.code) {
    // The state machine said no. To the reader all three mean the same thing — you are
    // looking at a version of this quotation that no longer exists — and reloading is the
    // fix, not clicking again.
    case "QUOTATION_NOT_IN_STATE":
      return {
        ...notice,
        stale: true,
        title: "This quotation has already moved on.",
        body: `${app.message} Somebody else has acted on it since this page was opened — reload to see where it has got to.`,
      };
    case "QUOTATION_NOT_ACCEPTED":
      return {
        ...notice,
        stale: true,
        title: "Only an accepted quotation becomes an order.",
        body: `${app.message} Reload the quotation to see its current state.`,
      };
    case "QUOTATION_ALREADY_CONVERTED":
      return {
        ...notice,
        stale: true,
        title: "This quotation has already become an order.",
        body: `${app.message} A quotation converts once — that is a unique constraint in the database, not a check somebody can be talked past.`,
      };
    case "QUOTATION_EXPIRED":
      return {
        ...notice,
        title: "The price on this quotation has expired.",
        body: `${app.message} Accepting an expired price months later commits the plant to a number nobody re-checked, so the system will not do it quietly.`,
      };
    case "IDEMPOTENCY_KEY_MISMATCH":
      return {
        ...notice,
        stale: true,
        title: "This form has already been submitted once.",
        body: "An earlier attempt went through with different details, even if the answer never reached this browser. Close this form and check the list before trying again.",
      };
    case "IDEMPOTENCY_IN_PROGRESS":
      return {
        ...notice,
        title: "This is still going through.",
        body: "The previous attempt has not finished yet. Wait a moment and try once more — it will not create a second document.",
      };
    case "VALIDATION_FAILED": {
      const fields: Record<string, string> = {};
      for (const d of app.details) fields[d.field] = d.message;
      return {
        ...notice,
        fields,
        title: "Some details need fixing.",
        body:
          app.details.length === 0
            ? app.message
            : app.details.map((d) => `${d.field}: ${d.message}`).join(" · "),
      };
    }
    case "NOT_FOUND":
      return {
        ...notice,
        title: app.message,
        body:
          action === "create"
            ? "The customer chosen here no longer resolves. Reopen the form so the customer list is read again."
            : "This quotation could not be found. It may have been opened from a stale link.",
      };
    default:
      break;
  }

  if (app.kind === "forbidden") {
    const perm = app.missingPermission;
    return {
      ...notice,
      missingPermission: perm,
      title: `You are not allowed to ${ACTION_WORDS[action]}.`,
      body: perm ? `Ask your administrator to grant ${perm}.` : "Ask your administrator for access.",
    };
  }
  if (app.kind === "network") {
    return {
      ...notice,
      title: "Could not reach the server.",
      // True, and worth saying: every request from these forms carries a stable
      // Idempotency-Key, so pressing again replays the first attempt rather than repeating it.
      body: "The request may or may not have reached the server. Trying again is safe — the same idempotency key is reused, so a request that did get through will be replayed rather than repeated.",
    };
  }
  if (app.kind === "conflict") {
    return { ...notice, stale: true, title: app.message, body: "Reload and try again." };
  }
  return {
    ...notice,
    title: app.message,
    body: app.traceId
      ? "Quote the reference below to support and they can find this exact request."
      : "",
  };
}
