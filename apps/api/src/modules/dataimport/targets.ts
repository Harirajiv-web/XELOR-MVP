import type {
  ImportTargetKey,
  RowGroup,
  RowIssue,
} from "@ind-core/platform";

/**
 * WHAT EACH TARGET BECOMES, AND WHICH DOOR IT GOES THROUGH.
 *
 * One handler per target. Each one answers three questions and nothing else:
 *
 *   which masters must be read to turn CODES into IDS   (`lookups`)
 *   what is wrong with this row that only live data can reveal  (`referenceIssues`)
 *   what request does this document become                (`build`)
 *
 * THE CODE-TO-ID PROBLEM IS THE WHOLE REASON THIS FILE EXISTS. Every write endpoint in this
 * product takes uuids — `customerId`, `itemId`, `toWarehouseId` — because that is what a
 * correct API takes. No spreadsheet on earth contains one. So a sheet says "PMP-CP50" and
 * this resolves it against the live part master, using the caller's own read permission,
 * and when it cannot resolve it the row is refused BY NAME: "PMP-CP50 is not in the part
 * master" — not "itemId: Required", which is the same information rendered useless.
 *
 * The reference check is kept apart from the pure per-row validation in `@ind-core/platform`
 * on purpose. "Your quantity column has words in it" is fixed in Excel; "that part number
 * does not exist yet" is fixed by importing the items first. Different problem, different
 * person, different sentence.
 */

/** A master this import can resolve codes against. */
export type LookupKind = "customers" | "items" | "warehouses";

export interface ReferenceEntry {
  id: string;
  code: string;
  name: string;
}

/** Code (lower-cased) -> record, for each master a target needs. */
export type ReferenceBook = Readonly<Record<LookupKind, ReadonlyMap<string, ReferenceEntry>>>;

export interface CommitRequest {
  /** Path under /api/v1 — the same route the form posts to. */
  path: string;
  body: unknown;
}

export interface CommitOutcome {
  id?: string;
  /** What a person would quote back: SO-0007, CUST-BAC, "PMP-CP50 → WH-ACC". */
  ref?: string;
}

export interface TargetHandler {
  key: ImportTargetKey;
  lookups: readonly LookupKind[];
  /**
   * Problems only the live database can see. Returns [] when the row's references all
   * resolve; the row is otherwise refused before anything is written.
   */
  referenceIssues(values: Readonly<Record<string, unknown>>, refs: ReferenceBook): RowIssue[];
  build(group: RowGroup, refs: ReferenceBook, acknowledgeDuplicates: boolean): CommitRequest;
  describe(response: unknown): CommitOutcome;
}

function str(values: Readonly<Record<string, unknown>>, field: string): string {
  const v = values[field];
  return v === undefined || v === null ? "" : String(v);
}

function lookup(refs: ReferenceBook, kind: LookupKind, code: string): ReferenceEntry | undefined {
  return refs[kind].get(code.trim().toLowerCase());
}

/**
 * The refusal a missing reference produces.
 *
 * It names the thing that is missing, says where it should have been, and — when the master
 * is small enough to be helpful — nothing else. Suggesting "did you mean X?" was considered
 * and left out: a near-miss suggestion on a part number is how somebody imports stock
 * against the wrong part.
 */
function missingReference(
  field: string,
  label: string,
  value: string,
  where: string,
): RowIssue {
  return {
    field,
    label,
    kind: "reference",
    message: `"${value}" is not in the ${where}. Import or create it first — an import never ` +
      `creates one master to satisfy another.`,
    value,
  };
}

/** Fields the domain endpoint does not take are dropped rather than sent and rejected. */
function pick(
  values: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (values[f] !== undefined) out[f] = values[f];
  }
  return out;
}

/* ------------------------------------------------------------------ masters ---- */

const customers: TargetHandler = {
  key: "customers",
  lookups: [],
  referenceIssues: () => [],
  build: (group, _refs, acknowledgeDuplicates) => ({
    path: "/sales/customers",
    body: {
      ...pick(group.header, [
        "code",
        "name",
        "gstin",
        "contactEmail",
        "contactPhone",
        "billingAddress",
        "creditLimit",
        "creditDays",
      ]),
      // Sales decides registration from the presence of a GSTIN when the flag is absent,
      // which is exactly right for a spreadsheet: a blank GSTIN column means unregistered,
      // and forcing the operator to also maintain a "registered?" column would produce two
      // fields that disagree.
      ...(acknowledgeDuplicates ? { acknowledgeDuplicates: true } : {}),
    },
  }),
  describe: (response) => {
    const r = response as { id?: string; code?: string };
    return { ...(r?.id ? { id: r.id } : {}), ...(r?.code ? { ref: r.code } : {}) };
  },
};

const items: TargetHandler = {
  key: "items",
  lookups: [],
  referenceIssues: () => [],
  build: (group, _refs, acknowledgeDuplicates) => ({
    path: "/engineering/items",
    body: {
      ...pick(group.header, [
        "itemCode",
        "name",
        "description",
        "itemType",
        "uom",
        "hsnCode",
        "itemGroup",
        "isPurchasable",
        "isManufacturable",
        "isSellable",
        "standardCost",
      ]),
      ...(acknowledgeDuplicates ? { acknowledgeDuplicates: true } : {}),
    },
  }),
  describe: (response) => {
    const r = response as { id?: string; itemCode?: string };
    return { ...(r?.id ? { id: r.id } : {}), ...(r?.itemCode ? { ref: r.itemCode } : {}) };
  },
};

const vendors: TargetHandler = {
  key: "vendors",
  lookups: [],
  referenceIssues: () => [],
  build: (group, _refs, acknowledgeDuplicates) => ({
    path: "/purchase/vendors",
    body: {
      ...pick(group.header, [
        "code",
        "name",
        "gstin",
        "contactEmail",
        "contactPhone",
        "address",
        "paymentTerms",
      ]),
      ...(acknowledgeDuplicates ? { acknowledgeDuplicates: true } : {}),
    },
  }),
  describe: (response) => {
    const r = response as { id?: string; code?: string };
    return { ...(r?.id ? { id: r.id } : {}), ...(r?.code ? { ref: r.code } : {}) };
  },
};

/* ------------------------------------------------------------ opening stock ---- */

const stockOpening: TargetHandler = {
  key: "stock_opening",
  lookups: ["items", "warehouses"],
  referenceIssues: (values, refs) => {
    const issues: RowIssue[] = [];
    const itemCode = str(values, "itemCode");
    if (itemCode && !lookup(refs, "items", itemCode)) {
      issues.push(missingReference("itemCode", "Item code", itemCode, "part master"));
    }
    const warehouseCode = str(values, "warehouseCode");
    if (warehouseCode && !lookup(refs, "warehouses", warehouseCode)) {
      issues.push(
        missingReference("warehouseCode", "Warehouse", warehouseCode, "warehouse list"),
      );
    }
    // Inventory refuses a non-positive receipt line, and it is better to say so here — with
    // the row number attached — than to let four hundred rows fail one at a time.
    const qty = values.qty;
    if (typeof qty === "number" && qty <= 0) {
      issues.push({
        field: "qty",
        label: "Quantity",
        kind: "range",
        message: "Opening stock must be greater than zero. A zero row moves nothing; remove it.",
        value: String(qty),
      });
    }
    return issues;
  },
  build: (group, refs) => {
    const v = group.header;
    const item = lookup(refs, "items", str(v, "itemCode"))!;
    const warehouse = lookup(refs, "warehouses", str(v, "warehouseCode"))!;
    return {
      // THE single stock write path (§5.6). Inventory owns stock; nothing else writes it,
      // and an importer is not an exception to that.
      path: "/stock/entries",
      body: {
        entryType: "receipt",
        remarks: str(v, "remarks") || `Opening stock imported from a spreadsheet`,
        lines: [
          {
            itemId: item.id,
            toWarehouseId: warehouse.id,
            ...(str(v, "batch") ? { batch: str(v, "batch") } : {}),
            qty: v.qty,
          },
        ],
      },
    };
  },
  describe: (response) => {
    const r = response as { entryId?: string };
    return r?.entryId ? { id: r.entryId } : {};
  },
};

/* -------------------------------------------------------------- sales orders ---- */

const salesOrders: TargetHandler = {
  key: "sales_orders",
  lookups: ["customers", "items"],
  referenceIssues: (values, refs) => {
    const issues: RowIssue[] = [];
    const customerCode = str(values, "customerCode");
    if (customerCode && !lookup(refs, "customers", customerCode)) {
      issues.push(
        missingReference("customerCode", "Customer code", customerCode, "customer master"),
      );
    }
    const itemCode = str(values, "itemCode");
    if (itemCode && !lookup(refs, "items", itemCode)) {
      issues.push(missingReference("itemCode", "Item code", itemCode, "part master"));
    }
    return issues;
  },
  build: (group, refs) => {
    const header = group.header;
    const customer = lookup(refs, "customers", str(header, "customerCode"))!;
    return {
      path: "/sales/orders",
      body: {
        customerId: customer.id,
        custPoNo: str(header, "custPoNo"),
        supplierGstin: str(header, "supplierGstin"),
        ...(header.orderDate ? { orderDate: header.orderDate } : {}),
        ...(header.shipToStateCode ? { shipToStateCode: header.shipToStateCode } : {}),
        ...(header.shipToGstin ? { shipToGstin: header.shipToGstin } : {}),
        // Every row of the group is a line, in the order the file presents them, so the
        // line numbers on the order match the rows on the operator's screen.
        lines: group.rows.map((row) => {
          const item = lookup(refs, "items", str(row.values, "itemCode"))!;
          return {
            itemId: item.id,
            qty: row.values.qty,
            rate: row.values.rate,
            hsn: str(row.values, "hsn"),
            gstRatePct: row.values.gstRatePct,
            ...(row.values.discountPct !== undefined
              ? { discountPct: row.values.discountPct }
              : {}),
            ...(row.values.uom !== undefined ? { uom: row.values.uom } : {}),
            ...(row.values.requestedDeliveryDate !== undefined
              ? { requestedDeliveryDate: row.values.requestedDeliveryDate }
              : {}),
          };
        }),
      },
    };
  },
  describe: (response) => {
    const r = response as { id?: string; soNo?: string };
    return { ...(r?.id ? { id: r.id } : {}), ...(r?.soNo ? { ref: r.soNo } : {}) };
  },
};

const HANDLERS: Readonly<Record<ImportTargetKey, TargetHandler>> = {
  customers,
  items,
  vendors,
  stock_opening: stockOpening,
  sales_orders: salesOrders,
};

export function targetHandler(key: ImportTargetKey): TargetHandler {
  return HANDLERS[key];
}

/** Where each lookup's rows come from, and how to read a code out of one. */
export const LOOKUP_SOURCES: Readonly<
  Record<LookupKind, { path: string; codeField: string; nameField: string; label: string }>
> = {
  customers: {
    path: "/sales/customers",
    codeField: "code",
    nameField: "name",
    label: "customer master",
  },
  items: {
    path: "/engineering/items",
    codeField: "itemCode",
    nameField: "name",
    label: "part master",
  },
  warehouses: {
    path: "/inventory/warehouses",
    codeField: "code",
    nameField: "name",
    label: "warehouse list",
  },
};

/** A human sentence for the stock receipt, which has no document number to quote. */
export function stockReceiptRef(
  values: Readonly<Record<string, unknown>>,
): string {
  const item = str(values, "itemCode");
  const warehouse = str(values, "warehouseCode");
  return item && warehouse ? `${item} → ${warehouse}` : item || warehouse;
}
