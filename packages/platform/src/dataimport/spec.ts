/**
 * WHAT A SPREADSHEET IS ALLOWED TO BECOME.
 *
 * Most factories this product is sold into already hold their operational truth in Excel —
 * the customer list, the part master, the opening stock somebody counted on a Saturday.
 * Typing that in again is not a migration plan, it is a reason not to buy. So an import is
 * a first-class way into the system, and this file is the contract it imports against.
 *
 * A TARGET is "the thing one row becomes": a customer, an item, a line of opening stock.
 * Each names its fields, their type, whether they are required, and the spellings that
 * appear on real headers. That last part is not decoration — a plant's sheet says "Part
 * No.", "GST No" and "Rate/unit", never `itemCode`, `gstin` and `rate`, and a mapping step
 * that starts blank makes the operator do the machine's job forty times.
 *
 * WHY THE SPEC LIVES IN PLATFORM AND NOT IN THE API MODULE.
 * Three readers need the identical answer to "what does `items` accept?": the validator
 * that rejects a row, the API that builds the payload, and the wizard that draws the
 * mapping controls. Written down three times, they drift, and the drift shows up as a file
 * that validates cleanly and then fails on commit — which is the single worst outcome an
 * import can produce, because the operator has already been told it was fine.
 *
 * The web app cannot import this package's barrel (it pulls `node:async_hooks` in through
 * the tenant context and will not bundle), so the wizard reads the same specs over the API
 * from `GET /dataimport/targets`. One definition, three consumers, no copy.
 *
 * WHAT IS DELIBERATELY NOT HERE: anything that needs the database. "Is CUST-BAC a real
 * customer" cannot be answered by a pure function and is not attempted here — the API adds
 * those reference checks on top, and marks them as a different kind of problem, because
 * "you spelled the column wrong" and "that part number does not exist yet" are fixed by
 * different people.
 */

/** The five things a spreadsheet may become in this build. */
export type ImportTargetKey =
  | "customers"
  | "items"
  | "vendors"
  | "stock_opening"
  | "sales_orders";

export type ImportFieldType = "text" | "number" | "integer" | "boolean" | "date" | "enum";

export interface ImportFieldSpec {
  /** The name the domain endpoint expects in its JSON body. */
  field: string;
  /** What a person calls it. Shown against the column picker. */
  label: string;
  type: ImportFieldType;
  required: boolean;
  /** For `enum`. Compared case- and separator-insensitively, so "Finished Good" lands. */
  enumValues?: readonly string[];
  /**
   * Header spellings seen on real factory sheets. Used only to PRE-SELECT a mapping the
   * operator can then correct — a guess that is easy to overrule, never a silent decision.
   */
  aliases?: readonly string[];
  /** One line under the control. Say what the value means, not that it is a text field. */
  help?: string;
  /** Text: maximum length. Number: maximum value. Both mirror the domain endpoint's own limit. */
  max?: number;
  min?: number;
}

export interface ImportTargetSpec {
  key: ImportTargetKey;
  label: string;
  /** One line: what one row becomes, in the words of the person doing the import. */
  creates: string;
  description: string;
  /**
   * The fields that identify the DOCUMENT a row belongs to.
   *
   * A sales order is a header with lines, and a spreadsheet has no way to say that except
   * by repeating the order's details on every line. Rows sharing these values are committed
   * as ONE document with many lines. Absent means one row is one document, which is the
   * right answer for a master and for opening stock.
   */
  groupBy?: readonly string[];
  /** Fields that belong to the document rather than the line. Read off the FIRST row of a group. */
  headerFields?: readonly string[];
  fields: readonly ImportFieldSpec[];
}

/* -------------------------------------------------------------------------
 * The targets.
 *
 * Every field below mirrors a field the domain endpoint already accepts — this file adds
 * no column to any master. Where the endpoint takes a uuid (`customerId`, `itemId`,
 * `fgWarehouseId`) the spec takes the CODE instead, because a uuid is not a thing anybody
 * has in a spreadsheet, and the API resolves the code against the live master and says so
 * by name when it cannot.
 * ------------------------------------------------------------------------- */

const CUSTOMERS: ImportTargetSpec = {
  key: "customers",
  label: "Customers",
  creates: "One customer in the sales master per row.",
  description:
    "Goes through the same customer-create endpoint the form uses, so the GSTIN is validated " +
    "against the state code and the duplicate check still runs.",
  fields: [
    {
      field: "code",
      label: "Customer code",
      type: "text",
      required: true,
      max: 60,
      aliases: ["customer code", "cust code", "code", "customer id", "party code", "ledger code"],
      help: "Your own short reference for this customer. Must be unique.",
    },
    {
      field: "name",
      label: "Name",
      type: "text",
      required: true,
      max: 200,
      aliases: ["customer name", "name", "party name", "legal name", "company"],
    },
    {
      field: "gstin",
      label: "GSTIN",
      type: "text",
      required: false,
      max: 15,
      aliases: ["gstin", "gst no", "gst number", "gst"],
      help: "Leave blank for an unregistered customer — a blank here is a real answer, not missing data.",
    },
    {
      field: "contactEmail",
      label: "Email",
      type: "text",
      required: false,
      max: 200,
      aliases: ["email", "email id", "e-mail", "contact email"],
    },
    {
      field: "contactPhone",
      label: "Phone",
      type: "text",
      required: false,
      max: 20,
      aliases: ["phone", "mobile", "contact no", "phone no", "contact number"],
    },
    {
      field: "billingAddress",
      label: "Billing address",
      type: "text",
      required: false,
      max: 500,
      aliases: ["address", "billing address", "bill to"],
    },
    {
      field: "creditLimit",
      label: "Credit limit",
      type: "number",
      required: false,
      min: 0,
      aliases: ["credit limit", "limit", "credit"],
      help: "In rupees. Blank means no limit has been agreed yet.",
    },
    {
      field: "creditDays",
      label: "Credit days",
      type: "integer",
      required: false,
      min: 0,
      max: 365,
      aliases: ["credit days", "payment terms days", "days"],
    },
  ],
};

const ITEMS: ImportTargetSpec = {
  key: "items",
  label: "Items",
  creates: "One item in the part master per row.",
  description:
    "Goes through the item-create endpoint, so the duplicate brain still compares each new " +
    "part against what is already in the master before anything is written.",
  fields: [
    {
      field: "itemCode",
      label: "Item code",
      type: "text",
      required: true,
      max: 60,
      aliases: ["item code", "part no", "part number", "code", "material code", "sku"],
    },
    {
      field: "name",
      label: "Name",
      type: "text",
      required: true,
      max: 200,
      aliases: ["item name", "name", "description", "part name", "material description"],
    },
    {
      field: "itemType",
      label: "Item type",
      type: "enum",
      required: true,
      enumValues: ["raw_material", "component", "sub_assembly", "finished_good", "consumable"],
      aliases: ["item type", "type", "category", "material type"],
      help: "Raw material, component, sub assembly, finished good or consumable.",
    },
    {
      field: "uom",
      label: "Unit",
      type: "text",
      required: true,
      max: 20,
      aliases: ["uom", "unit", "unit of measure", "units"],
    },
    {
      field: "description",
      label: "Long description",
      type: "text",
      required: false,
      max: 1000,
      aliases: ["long description", "specification", "spec", "remarks"],
    },
    {
      field: "hsnCode",
      label: "HSN code",
      type: "text",
      required: false,
      max: 10,
      aliases: ["hsn", "hsn code", "hsn/sac"],
    },
    {
      field: "itemGroup",
      label: "Item group",
      type: "text",
      required: false,
      max: 100,
      aliases: ["item group", "group", "family"],
    },
    {
      field: "standardCost",
      label: "Standard cost",
      type: "number",
      required: false,
      min: 0,
      aliases: ["standard cost", "cost", "rate", "std cost", "valuation rate"],
    },
    {
      field: "isPurchasable",
      label: "Purchased",
      type: "boolean",
      required: false,
      aliases: ["purchasable", "purchased", "buy", "is purchased"],
    },
    {
      field: "isManufacturable",
      label: "Manufactured",
      type: "boolean",
      required: false,
      aliases: ["manufacturable", "manufactured", "make", "is manufactured"],
    },
    {
      field: "isSellable",
      label: "Sold",
      type: "boolean",
      required: false,
      aliases: ["sellable", "sold", "sale", "is sold"],
    },
  ],
};

const VENDORS: ImportTargetSpec = {
  key: "vendors",
  label: "Vendors",
  creates: "One supplier in the vendor master per row.",
  description:
    "Goes through the vendor-create endpoint, duplicate check included. A vendor code is " +
    "quoted on every purchase order ever raised against it, so it cannot be edited later.",
  fields: [
    {
      field: "code",
      label: "Vendor code",
      type: "text",
      required: true,
      max: 60,
      aliases: ["vendor code", "supplier code", "code", "party code"],
    },
    {
      field: "name",
      label: "Name",
      type: "text",
      required: true,
      max: 200,
      aliases: ["vendor name", "supplier name", "name", "party name"],
    },
    {
      field: "gstin",
      label: "GSTIN",
      type: "text",
      required: false,
      max: 15,
      aliases: ["gstin", "gst no", "gst number", "gst"],
    },
    {
      field: "contactEmail",
      label: "Email",
      type: "text",
      required: false,
      max: 200,
      aliases: ["email", "email id", "e-mail"],
    },
    {
      field: "contactPhone",
      label: "Phone",
      type: "text",
      required: false,
      max: 20,
      aliases: ["phone", "mobile", "contact no"],
    },
    {
      field: "address",
      label: "Address",
      type: "text",
      required: false,
      max: 500,
      aliases: ["address", "supplier address"],
    },
    {
      field: "paymentTerms",
      label: "Payment terms",
      type: "text",
      required: false,
      max: 60,
      aliases: ["payment terms", "terms", "credit terms"],
    },
  ],
};

const STOCK_OPENING: ImportTargetSpec = {
  key: "stock_opening",
  label: "Opening stock",
  creates: "One stock receipt per row, posted through the single stock write path.",
  description:
    "Every row becomes its own receipt rather than one large entry, so a part-completed " +
    "import leaves a ledger that is exactly true: the lines that landed are posted and the " +
    "ones that failed are not hidden inside a half-written document.",
  fields: [
    {
      field: "itemCode",
      label: "Item code",
      type: "text",
      required: true,
      max: 60,
      aliases: ["item code", "part no", "part number", "code", "material code"],
      help: "Must already exist in the part master. Import the items first if it does not.",
    },
    {
      field: "warehouseCode",
      label: "Warehouse",
      type: "text",
      required: true,
      max: 60,
      aliases: ["warehouse", "warehouse code", "store", "location", "godown"],
    },
    {
      field: "qty",
      label: "Quantity",
      type: "number",
      required: true,
      aliases: ["qty", "quantity", "closing qty", "stock", "balance", "on hand"],
      help: "The counted quantity. Must be greater than zero — a zero row moves nothing.",
    },
    {
      field: "batch",
      label: "Batch",
      type: "text",
      required: false,
      max: 60,
      aliases: ["batch", "batch no", "lot", "lot no", "heat no"],
    },
    {
      field: "remarks",
      label: "Remarks",
      type: "text",
      required: false,
      max: 500,
      aliases: ["remarks", "note", "notes", "comment"],
    },
  ],
};

const SALES_ORDERS: ImportTargetSpec = {
  key: "sales_orders",
  label: "Sales orders",
  creates: "One order per customer PO number; every row with that PO number becomes a line on it.",
  description:
    "The one target where rows are not independent. A spreadsheet cannot nest, so an order " +
    "with three lines is three rows repeating the customer and the PO number — those rows are " +
    "grouped back into one document, and the group succeeds or fails together.",
  groupBy: ["customerCode", "custPoNo"],
  headerFields: [
    "customerCode",
    "custPoNo",
    "orderDate",
    "supplierGstin",
    "shipToStateCode",
    "shipToGstin",
  ],
  fields: [
    {
      field: "customerCode",
      label: "Customer code",
      type: "text",
      required: true,
      max: 60,
      aliases: ["customer code", "cust code", "customer", "party code"],
      help: "Must already exist in the customer master.",
    },
    {
      field: "custPoNo",
      label: "Customer PO number",
      type: "text",
      required: true,
      max: 60,
      aliases: ["po no", "customer po", "po number", "cust po no", "order no", "po"],
      help: "Rows sharing this and the customer code become one order.",
    },
    {
      field: "supplierGstin",
      label: "Selling GSTIN",
      type: "text",
      required: true,
      max: 15,
      aliases: ["supplier gstin", "our gstin", "selling gstin", "gstin"],
      help: "Which of your own registrations is selling. It decides the place of supply.",
    },
    {
      field: "orderDate",
      label: "Order date",
      type: "date",
      required: false,
      aliases: ["order date", "date", "po date", "so date"],
    },
    {
      field: "shipToStateCode",
      label: "Ship-to state code",
      type: "text",
      required: false,
      max: 2,
      aliases: ["ship to state", "state code", "place of supply"],
      help: "Two digits. Leave blank to use the customer's own state.",
    },
    {
      field: "shipToGstin",
      label: "Ship-to GSTIN",
      type: "text",
      required: false,
      max: 15,
      aliases: ["ship to gstin", "consignee gstin"],
    },
    {
      field: "itemCode",
      label: "Item code",
      type: "text",
      required: true,
      max: 60,
      aliases: ["item code", "part no", "part number", "material code"],
    },
    {
      field: "qty",
      label: "Quantity",
      type: "number",
      required: true,
      aliases: ["qty", "quantity", "order qty"],
    },
    {
      field: "rate",
      label: "Rate",
      type: "number",
      required: true,
      min: 0,
      aliases: ["rate", "unit price", "price", "rate/unit"],
    },
    {
      field: "hsn",
      label: "HSN",
      type: "text",
      required: true,
      max: 8,
      aliases: ["hsn", "hsn code", "hsn/sac"],
      help: "4, 6 or 8 digits. The tax endpoint refuses anything else.",
    },
    {
      field: "gstRatePct",
      label: "GST %",
      type: "number",
      required: true,
      min: 0,
      max: 28,
      aliases: ["gst", "gst %", "gst rate", "tax %", "gst rate %"],
    },
    {
      field: "discountPct",
      label: "Discount %",
      type: "number",
      required: false,
      min: 0,
      max: 99.99,
      aliases: ["discount", "discount %", "disc %"],
    },
    {
      field: "uom",
      label: "Unit",
      type: "text",
      required: false,
      max: 20,
      aliases: ["uom", "unit"],
    },
    {
      field: "requestedDeliveryDate",
      label: "Wanted by",
      type: "date",
      required: false,
      aliases: ["delivery date", "required date", "wanted by", "due date", "schedule date"],
      help: "When the customer asked for THIS line. Blank is honest if no date was promised.",
    },
  ],
};

export const IMPORT_TARGETS: readonly ImportTargetSpec[] = [
  CUSTOMERS,
  ITEMS,
  VENDORS,
  STOCK_OPENING,
  SALES_ORDERS,
];

export const IMPORT_TARGET_KEYS: readonly ImportTargetKey[] = IMPORT_TARGETS.map((t) => t.key);

/** The spec for a target, or undefined for a key this build does not import. */
export function importTarget(key: string): ImportTargetSpec | undefined {
  return IMPORT_TARGETS.find((t) => t.key === key);
}

/** The spec for one field of a target. */
export function importField(
  target: ImportTargetSpec,
  field: string,
): ImportFieldSpec | undefined {
  return target.fields.find((f) => f.field === field);
}
