/**
 * Purchase's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * Every field below was read off `apps/api/src/modules/purchase/purchase.service.ts`
 * rather than inferred from the table names. The lists come back as `{ items, nextCursor }`
 * — the platform's `CursorPage<T>`, which `useCursorList` reads directly, so both list
 * screens are ordinary paged tables with a real "Load more".
 *
 * It now covers the WRITES as well — the create body, the state-machine rule that decides
 * whether a Submit button may be drawn, the rounding the server uses, and the mapping from
 * the canonical error envelope to something a buyer can act on. All of it lives here rather
 * than in the screens, so the contract with `po.controller.ts` is stated once and both the
 * form and the detail screen reason from the same statement of it.
 *
 * The one import is the spine's `AppError` — the platform's error envelope, not another
 * module's code. The folder is still deletable.
 */

import { AppError } from "@spine/api/errors";

/** `GET /purchase/orders` — one row, carrying everything the list needs to render. */
export interface PoSummaryRow {
  id: string;
  poNo: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  status: string;
  /** When the vendor promised it. Null when the buyer gave no date. */
  expectedDate: string | null;
  totalAmount: string;
  createdAt: string;
}

/**
 * A line on `GET /purchase/orders/:id`. `receivedQty` is what has actually arrived.
 *
 * The item fields are nullable because `item_id` is a cross-module logical reference with
 * no foreign key behind it — the API left-joins so a line can never vanish from a financial
 * document, which means a line can arrive with its label missing.
 */
export interface PoLineRow {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  qty: string;
  rate: string;
  amount: string;
  receivedQty: string;
}

export interface PoDetail {
  id: string;
  poNo: string;
  vendorId: string;
  vendorName: string;
  status: string;
  poDate: string;
  expectedDate: string | null;
  currency: string;
  /** Sum of line amounts. Tax-exclusive — the order holds no GST fields at all. */
  totalAmount: string;
  remarks: string | null;
  /** 0 until amended. Shown beside the PO number so a vendor call has something to match. */
  revisionNo: number;
  amendReason: string | null;
  workflowInstanceId: string | null;
  lines: PoLineRow[];
}

export interface VendorRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  createdAt: string;
}

/** `batch` is a NOT NULL column defaulting to "" — an unbatched receipt is "", never null. */
export interface GrnLineRow {
  lineNo: number;
  poLineId: string;
  itemId: string;
  qty: string;
  batch: string;
}

export interface GrnDetail {
  id: string;
  grnNo: string;
  poId: string;
  poNo: string;
  vendorId: string;
  warehouseId: string;
  grnDate: string;
  status: string;
  /** The PO's status *after* this receipt: partially_received or received. */
  poStatus: string;
  lines: GrnLineRow[];
  /**
   * Only ever populated on the POST that creates the receipt. `GET /purchase/grns/:id`
   * does not re-derive it, so on this screen it is normally absent — and is rendered only
   * when present rather than faked from the lines.
   */
  stockMovements?: Array<{
    itemId: string;
    warehouseId: string;
    delta: number;
    balanceAfter: number;
  }>;
}

/**
 * An item, as the new-order form needs it.
 *
 * Read from `GET /engineering/items`, which is ENGINEERING's endpoint, not ours. That is
 * deliberate and it mirrors what the API already does: `purchase.service.ts` left-joins the
 * `item` table to put a code and a unit on a PO line, describing it as a read-only logical
 * reference with no foreign key. A picker that invented its own item list would be a second
 * item master, which is the one thing an ERP must never have.
 *
 * It carries its own permission — `engineering.item.read` — which a buyer may not hold. The
 * form handles that case explicitly rather than rendering an empty dropdown.
 */
export interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  uom: string;
  itemType: string;
  standardCost: string | null;
}

/** One line on `POST /purchase/orders`. Exactly the three fields the zod schema accepts. */
export interface CreatePoLine {
  itemId: string;
  qty: number;
  rate: number;
}

/**
 * The body of `POST /purchase/orders`, transcribed field by field from `createPoSchema` in
 * `apps/api/src/modules/purchase/po.controller.ts`:
 *
 *   vendorId     uuid, REQUIRED
 *   expectedDate string, optional
 *   currency     string, max 3, optional (the service defaults it to INR)
 *   remarks      string, max 500, optional
 *   lines        at least one { itemId uuid, qty > 0, rate >= 0 }
 *
 * There is nothing else. No tax rate, no payment terms, no delivery address, no charges —
 * and the form says so on screen rather than letting a reader assume a landed cost.
 */
export interface CreatePoBody {
  vendorId: string;
  expectedDate?: string;
  currency?: string;
  remarks?: string;
  lines: CreatePoLine[];
}

/** What `POST /purchase/orders/:id/submit` answers with. */
export interface PoSubmitResult {
  po: PoDetail;
  workflow: {
    id: string;
    definitionCode: string;
    currentStepSeq: number;
    currentStepName: string | null;
    status: string;
    slaDueAt: string | null;
  };
}

export const purchaseApi = {
  ordersPath: "/purchase/orders",
  orderPath: (id: string): string => `/purchase/orders/${id}`,
  /** Whether this PO may be edited right now — asked before the button lights up. */
  orderEditPolicyPath: (id: string): string => `/purchase/orders/${id}/edit-policy`,
  /** Every correction ever made to this PO, from the hash-chained audit trail. */
  orderHistoryPath: (id: string): string => `/purchase/orders/${id}/history`,
  submitPath: (id: string): string => `/purchase/orders/${id}/submit`,
  vendorsPath: "/purchase/vendors",
  /** ENGINEERING's item master — see `ItemOption`. Read-only, and never written from here. */
  itemsPath: "/engineering/items",
  /** No list endpoint exists for goods receipts — only this by-id read. */
  grnPath: (id: string): string => `/purchase/grns/${id}`,
  /** Rows per page. The API caps `limit` at 100; asking for more is a 422, not a bigger page. */
  pageSize: 50,
  /** The picker pages. 100 is the API's hard cap on `limit`. */
  pickerPageSize: 100,
} as const;

/**
 * ONLY A DRAFT CAN BE SUBMITTED.
 *
 * `PurchaseService.submitPo` reads the order, and if `status !== "draft"` it throws
 * `PO_NOT_DRAFT` with a 409 before touching the workflow engine. A Submit button offered on
 * an approved order can therefore do exactly one thing — fail — so it is not drawn at all.
 * The check lives here, next to the endpoint it guards, so both the button and its error
 * message are reasoning from the same rule.
 */
export function canSubmitForApproval(status: string): boolean {
  return status === "draft";
}

/**
 * The value of one line, rounded the way the SERVER rounds it.
 *
 * `purchase.service.ts` does `round2(qty * rate)` per line, sums those, and rounds the total
 * again. Doing anything else here — summing at full precision and rounding once, say —
 * produces a live total that can differ from the stored one by a paisa on a long order. A
 * figure on a create screen that does not match the document it creates is worse than no
 * figure, because somebody will trust it.
 */
export function lineAmount(qty: number, rate: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(rate)) return 0;
  return Math.round(qty * rate * 100) / 100;
}

/** The order's value: the sum of the line amounts, rounded again. No tax. See `PoDetail`. */
export function poTotal(lines: ReadonlyArray<{ qty: number; rate: number }>): number {
  const sum = lines.reduce((acc, l) => acc + lineAmount(l.qty, l.rate), 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Parse a number typed into a field.
 *
 * Returns null for anything that is not a finite number, INCLUDING an empty string — which
 * `Number("")` helpfully turns into 0. On a rate field that silent zero is a purchase order
 * placed at no charge, so the distinction between "nothing typed" and "zero" is kept.
 */
export function parseNumeric(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * An order is late when the vendor has promised a date that has passed and the goods are
 * not all in. Rejected and cancelled orders are never late — nobody is waiting for them.
 */
export function isLate(expectedDate: string | null, status: string): boolean {
  if (!expectedDate) return false;
  if (["received", "rejected", "cancelled", "draft"].includes(status)) return false;
  const due = new Date(expectedDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  return (
    new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() <
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  );
}

/**
 * A short, stable stand-in for an id we have no human label for.
 *
 * Purchase returns bare `item_id` UUIDs on its lines — the item code and description live
 * in Engineering and are not joined in. Showing the first segment keeps rows scannable and
 * comparable without pretending it is a part number.
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/* ------------------------------------------------------------------------------------
   FAILURES, TURNED INTO SOMETHING A BUYER CAN ACT ON.

   Purchase is where money leaves the company, and every one of the codes below means a
   genuinely different next step: fix a field, reload the page, phone the approver, or ring
   support with a reference. Rendering them all as the server's raw message would technically
   be honest and practically useless — "PO is approved; only a draft can be submitted." tells
   a buyer what happened but not that the page in front of them is stale.
   ------------------------------------------------------------------------------------ */

export interface FailureNotice {
  /** One line, in the user's terms. */
  title: string;
  /** What to do about it. Empty when the title is the whole story. */
  body: string;
  /** Per-field messages keyed as the API names them — `vendorId`, `lines.0.qty`. */
  fields: Record<string, string>;
  /** Present only on a 403, and it is the name of the permission to go and ask for. */
  missingPermission: string | null;
  /** Present when the server gave one. The thing that makes a support call one query long. */
  traceId: string | null;
  /** True when the document moved on and the screen should be reloaded, not retried. */
  stale: boolean;
}

export function describeFailure(error: unknown, action: "create" | "submit"): FailureNotice {
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
    return {
      ...base,
      title: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
  const notice: FailureNotice = { ...base, traceId: app.traceId ?? null };

  switch (app.code) {
    // The state machine said no. Both of these mean the same thing to the reader — you are
    // looking at a version of this order that no longer exists — and reloading is the fix,
    // not clicking again.
    case "PO_NOT_DRAFT":
      return {
        ...notice,
        stale: true,
        title: "This order is no longer a draft.",
        body: `${app.message} Somebody else has moved it on since this page was opened — reload to see where it has got to.`,
      };
    case "PO_NOT_PENDING":
      return {
        ...notice,
        stale: true,
        title: "This order is not waiting for approval.",
        body: `${app.message} Reload the order to see its current state.`,
      };
    case "IDEMPOTENCY_KEY_MISMATCH":
      return {
        ...notice,
        stale: true,
        title: "An order was already raised from this form.",
        body: "An earlier attempt went through with different details, even if the answer never reached this browser. Close this form and check the order list before raising it again — otherwise you will place the same order twice.",
      };
    case "IDEMPOTENCY_IN_PROGRESS":
      return {
        ...notice,
        title: "This is still going through.",
        body: "The previous attempt has not finished yet. Wait a moment and try once more — it will not create a second order.",
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
            ? "The vendor chosen here no longer resolves. Reopen the form so the vendor list is read again."
            : "This order could not be found. It may have been opened from a stale link.",
      };
    default:
      break;
  }

  if (app.kind === "forbidden") {
    const perm = app.missingPermission;
    return {
      ...notice,
      missingPermission: perm,
      title:
        action === "create"
          ? "You are not allowed to raise purchase orders."
          : "You are not allowed to submit this order for approval.",
      body: perm
        ? `Ask your administrator to grant ${perm}.`
        : "Ask your administrator for access.",
    };
  }
  if (app.kind === "network") {
    return {
      ...notice,
      title: "Could not reach the server.",
      // True, and worth saying: the request carries a stable Idempotency-Key, so pressing
      // the button again replays the first attempt rather than repeating it.
      body: "The request may or may not have reached the server. Trying again is safe — this form reuses the same idempotency key, so a request that did get through will be replayed rather than repeated.",
    };
  }
  if (app.kind === "conflict") {
    return { ...notice, stale: true, title: app.message, body: "Reload and try again." };
  }
  return {
    ...notice,
    title: app.message,
    body: app.traceId ? "Quote the reference below to support and they can find this exact request." : "",
  };
}
