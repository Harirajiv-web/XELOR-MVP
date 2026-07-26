/**
 * THE COPILOT'S QUESTION CATALOGUE — the closed list of things it can be asked.
 *
 * This file is the entire safety argument, so it is worth stating plainly.
 *
 * The obvious way to build a copilot over an ERP is to let a model write SQL. It is also
 * the way that cannot be made safe: a generated query can join across tenants, can be
 * coaxed into a write by text hidden in a vendor's address field, can scan a hundred
 * million ledger rows, and — worst — can be WRONG in a way that still returns a number,
 * which a finance user will then act on. Every mitigation for that is a filter over an
 * unbounded space, and filters over unbounded spaces leak.
 *
 * So the model does not write queries here. It does not see data here. Its ONLY job is to
 * decide WHICH of the questions below is being asked and what the parameters are — a
 * classification with a fixed output vocabulary. Everything after that is ordinary code:
 * a hand-written, reviewed, read-only query, run under the asker's own tenant and their
 * own permissions.
 *
 * The consequences are worth spelling out, because they are guarantees rather than hopes:
 *
 *   - THE COPILOT CANNOT WRITE. Not "is instructed not to" — there is no write path in the
 *     module at all, and every query is a SELECT somebody reviewed.
 *   - THE COPILOT CANNOT SHOW YOU ANYTHING A SCREEN WOULD NOT. Each question declares a
 *     permission from the platform's own registry, and the same guard that protects the
 *     screen protects the question. A stores clerk asking about payroll is refused by the
 *     same rule that hides the payroll menu.
 *   - THE COPILOT CANNOT CROSS TENANTS. The queries run through `withTenant`, so the
 *     database's row-level fence applies exactly as it does everywhere else.
 *   - AN UNKNOWN QUESTION IS REFUSED, NOT GUESSED. "I don't know how to answer that" is a
 *     first-class outcome. A copilot that always produces something is a copilot that
 *     invents.
 *   - IT WORKS WITH THE AI SWITCHED OFF. Routing is deterministic first; the model is a
 *     tie-breaker, not the mechanism. Pulling the kill switch degrades phrasing, not
 *     function.
 *
 * Adding a question is deliberately a code change with a review, not configuration. That
 * is the point: the blast radius of this feature is exactly the list below.
 */

/** What the answer looks like, which decides how it is rendered and cited. */
export type IntentShape =
  | "list" // many rows — a table
  | "single" // one row — a document's detail
  | "scalar"; // one number — a count or a total

export interface IntentParamSpec {
  name: string;
  kind: "docNo" | "itemCode" | "warehouseCode" | "partyName" | "days";
  required: boolean;
  description: string;
}

export interface CopilotIntent {
  /** Stable key. The model's output vocabulary is exactly this set. */
  key: string;
  /** One line, shown in "here is what you can ask me". */
  question: string;
  /** Extra phrasings a person actually uses, for the deterministic router. */
  examples: readonly string[];
  /**
   * The permission the asker must hold — a key from PERMISSION_REGISTRY. The copilot can
   * never widen access; it can only ask on your behalf what you could already open.
   */
  permission: string;
  shape: IntentShape;
  params: readonly IntentParamSpec[];
  /** Words that pull TOWARDS this intent, scored by the router. */
  keywords: readonly string[];
  /** Words that push AWAY — how `stock` and `stock movements` stay distinguishable. */
  antiKeywords?: readonly string[];
  /** Hard ceiling on rows returned. An unbounded answer is an unusable one. */
  rowCap: number;
  /** Module, for grouping in help and in the question log. */
  module: string;
}

export const COPILOT_INTENTS = [
  /* ------------------------------- inventory ------------------------------- */
  {
    key: "stock.on_hand",
    question: "How much of an item do we have in stock?",
    examples: ["how much PMP-CP50 do we have", "stock of impellers", "do we have any casings left", "current stock"],
    permission: "inventory.stock.read",
    shape: "list",
    params: [{ name: "itemCode", kind: "itemCode", required: false, description: "Item code, e.g. PMP-CP50. Omit for everything." }],
    // "how much X do we have" is THE stock question, and without these as phrases it scored
    // 2.0 against a 2.5 floor and got refused — an absurd thing for a stock copilot to do.
    keywords: ["how much", "how many", "do we have", "in stock", "stock", "on hand", "onhand", "have", "available", "inventory", "balance", "left", "qty", "quantity"],
    antiKeywords: ["movement", "moved", "ledger", "history", "transaction"],
    rowCap: 100,
    module: "inventory",
  },
  {
    key: "stock.by_warehouse",
    question: "What is sitting in a particular warehouse?",
    examples: ["what is in WH-ACC", "show me the finished goods store", "stock in Pune stores"],
    permission: "inventory.stock.read",
    shape: "list",
    params: [{ name: "warehouseCode", kind: "warehouseCode", required: false, description: "Warehouse code, e.g. WH-FG." }],
    keywords: ["warehouse", "store", "stores", "godown", "wh-", "location", "bin"],
    rowCap: 200,
    module: "inventory",
  },
  {
    key: "stock.recent_movements",
    question: "What stock has moved recently?",
    examples: ["recent stock movements", "what moved for PMP-CP50", "stock ledger for bolts", "movement history"],
    permission: "inventory.stock.read",
    shape: "list",
    params: [
      { name: "itemCode", kind: "itemCode", required: false, description: "Restrict to one item." },
      { name: "days", kind: "days", required: false, description: "How far back. Default 30 days." },
    ],
    keywords: ["movement", "moved", "ledger", "history", "transactions", "issued", "received", "consumed"],
    rowCap: 100,
    module: "inventory",
  },

  /* --------------------------------- sales --------------------------------- */
  {
    key: "sales.open_orders",
    question: "Which customer orders are still open?",
    examples: ["open sales orders", "which orders are pending", "what have customers ordered", "order book"],
    permission: "sales.order.read",
    shape: "list",
    params: [],
    keywords: ["sales order", "customer order", "order book", "open order", "pending order", "so", "orders"],
    antiKeywords: ["purchase", "po", "vendor", "supplier", "production", "work order"],
    rowCap: 100,
    module: "sales",
  },
  {
    key: "sales.order_status",
    question: "What is the status of one sales order?",
    examples: ["status of SO-2627-00001", "where is SO-2627-00002", "show me sales order 1"],
    permission: "sales.order.read",
    shape: "single",
    params: [{ name: "docNo", kind: "docNo", required: true, description: "The order number, e.g. SO-2627-00001." }],
    keywords: ["status", "where is", "show me", "detail", "so-"],
    rowCap: 50,
    module: "sales",
  },
  {
    key: "sales.due_soon",
    question: "What is due to ship soon?",
    examples: ["what is due this week", "deliveries due", "what do we owe customers", "due dates coming up"],
    permission: "sales.order.read",
    shape: "list",
    params: [{ name: "days", kind: "days", required: false, description: "Window in days. Default 14." }],
    keywords: ["due", "deliver", "delivery", "ship", "dispatch", "promised", "this week", "next week", "overdue"],
    antiKeywords: ["purchase", "vendor", "supplier", "receive"],
    rowCap: 100,
    module: "sales",
  },

  /* ------------------------------- purchase -------------------------------- */
  {
    key: "purchase.open_orders",
    question: "Which purchase orders are open?",
    examples: ["open purchase orders", "what have we ordered", "pending POs", "purchase orders awaiting approval"],
    permission: "purchase.po.read",
    shape: "list",
    params: [],
    // "purchase" and "approved" as bare words matter: "show me approved purchase orders" is
    // an ordinary thing to ask and scored a single phrase hit without them, landing just
    // under the confidence floor and being refused. The anti-keywords keep them from
    // pulling sales questions across.
    keywords: ["purchase order", "po", "purchase", "approved", "awaiting approval", "supplier order", "vendor order", "ordered", "procurement", "buying", "raised"],
    antiKeywords: ["sales", "customer", "so-", "production"],
    rowCap: 100,
    module: "purchase",
  },
  {
    key: "purchase.order_status",
    question: "What is the status of one purchase order?",
    examples: ["status of PO-2627-00001", "where is PO-2627-00002"],
    permission: "purchase.po.read",
    shape: "single",
    params: [{ name: "docNo", kind: "docNo", required: true, description: "The PO number, e.g. PO-2627-00001." }],
    keywords: ["status", "where is", "detail", "po-"],
    rowCap: 50,
    module: "purchase",
  },
  {
    key: "purchase.awaiting_receipt",
    question: "What have we ordered that has not arrived?",
    examples: ["what is still to come in", "pending deliveries from suppliers", "not yet received", "incoming material"],
    permission: "purchase.po.read",
    shape: "list",
    params: [],
    keywords: ["not received", "awaiting", "incoming", "still to come", "pending receipt", "arrive", "arriving", "inward"],
    rowCap: 100,
    module: "purchase",
  },

  /* ------------------------------ production ------------------------------- */
  {
    key: "production.open_orders",
    question: "What is on the shop floor right now?",
    examples: ["open production orders", "what are we making", "work in progress", "shop floor"],
    permission: "production.order.read",
    shape: "list",
    params: [],
    keywords: ["production", "manufacturing", "making", "shop floor", "work order", "wip", "mo", "build"],
    antiKeywords: ["maintenance", "breakdown", "mwo"],
    rowCap: 100,
    module: "production",
  },
  {
    key: "production.order_status",
    question: "What is the status of one production order?",
    examples: ["status of MO-2627-00001", "how far is MO-2627-00001"],
    permission: "production.order.read",
    shape: "single",
    params: [{ name: "docNo", kind: "docNo", required: true, description: "The production order number, e.g. MO-2627-00001." }],
    keywords: ["status", "how far", "progress", "mo-"],
    rowCap: 50,
    module: "production",
  },

  /* -------------------------------- planning ------------------------------- */
  {
    key: "planning.what_to_buy",
    question: "What does the plan say we should buy?",
    examples: ["what should I buy", "what do we need to purchase", "buy list", "purchase suggestions"],
    permission: "planning.mrp.read",
    shape: "list",
    params: [],
    keywords: ["should buy", "need to buy", "to purchase", "buy list", "procure", "raise po", "purchase suggestion"],
    rowCap: 100,
    module: "planning",
  },
  {
    key: "planning.what_to_make",
    question: "What does the plan say we should make?",
    examples: ["what should we make", "production plan", "what to manufacture"],
    permission: "planning.mrp.read",
    shape: "list",
    params: [],
    keywords: ["should make", "to make", "manufacture", "production plan", "planned production", "make list"],
    rowCap: 100,
    module: "planning",
  },
  {
    key: "planning.past_due",
    question: "What is already late according to the plan?",
    examples: ["what is late", "past due", "what have we missed", "behind schedule"],
    permission: "planning.mrp.read",
    shape: "list",
    params: [],
    keywords: ["late", "past due", "overdue", "behind", "missed", "slipped", "delayed"],
    rowCap: 100,
    module: "planning",
  },
  {
    key: "planning.shortages",
    question: "What are we short of?",
    examples: ["what are we short of", "shortages", "what is going to run out", "material shortage"],
    permission: "planning.mrp.read",
    shape: "list",
    params: [],
    keywords: ["short", "shortage", "run out", "running out", "insufficient", "not enough", "deficit"],
    rowCap: 100,
    module: "planning",
  },

  /* ------------------------------ maintenance ------------------------------ */
  {
    key: "maintenance.open_work_orders",
    question: "Which maintenance jobs are open?",
    examples: ["open maintenance work orders", "what is broken", "breakdowns", "maintenance backlog"],
    permission: "mnt.mwo.read",
    shape: "list",
    params: [],
    keywords: ["maintenance", "breakdown", "repair", "mwo", "machine down", "fault", "servicing"],
    antiKeywords: ["production", "mo-"],
    rowCap: 100,
    module: "maintenance",
  },

  /* -------------------------------- quality -------------------------------- */
  {
    key: "quality.pending_inspections",
    question: "What is waiting for inspection?",
    examples: ["pending inspections", "what needs checking", "quality queue", "awaiting QC"],
    permission: "quality.inspection.read",
    shape: "list",
    params: [],
    keywords: ["inspection", "quality", "qc", "checking", "reject", "accepted", "test"],
    rowCap: 100,
    module: "quality",
  },

  /* -------------------------------- accounts ------------------------------- */
  {
    key: "accounts.outstanding",
    question: "Who owes us money?",
    examples: ["outstanding receivables", "who owes us", "unpaid invoices", "debtors"],
    permission: "accounts.ledger.read",
    shape: "list",
    params: [],
    keywords: ["outstanding", "receivable", "owes", "owed", "unpaid", "debtor", "collection", "overdue payment"],
    rowCap: 100,
    module: "accounts",
  },

  /* --------------------------------- masters -------------------------------- */
  {
    key: "master.find_item",
    question: "What is this item?",
    examples: ["what is PMP-CP50", "find item impeller", "look up casing"],
    permission: "engineering.item.read",
    shape: "list",
    params: [{ name: "itemCode", kind: "itemCode", required: false, description: "Code or part of a name." }],
    keywords: ["what is", "item", "part", "material", "look up", "find item", "describe"],
    antiKeywords: ["stock", "how much", "vendor", "customer"],
    rowCap: 50,
    module: "engineering",
  },
  {
    key: "master.find_vendor",
    question: "Who are our vendors?",
    examples: ["list vendors", "who supplies castings", "find vendor Sundaram", "supplier details"],
    permission: "purchase.vendor.read",
    shape: "list",
    params: [{ name: "partyName", kind: "partyName", required: false, description: "Part of the vendor's name." }],
    keywords: ["vendor", "supplier", "who supplies", "suppliers"],
    rowCap: 100,
    module: "purchase",
  },
  {
    key: "master.find_customer",
    question: "Who are our customers?",
    examples: ["list customers", "find customer Bharat", "customer details"],
    permission: "sales.customer.read",
    shape: "list",
    params: [{ name: "partyName", kind: "partyName", required: false, description: "Part of the customer's name." }],
    keywords: ["customer", "buyer", "client", "customers"],
    antiKeywords: ["order", "vendor", "supplier"],
    rowCap: 100,
    module: "sales",
  },
] as const satisfies readonly CopilotIntent[];

/** The model's entire output vocabulary. Anything else is a refusal. */
export type IntentKey = (typeof COPILOT_INTENTS)[number]["key"];

const BY_KEY = new Map<string, CopilotIntent>(COPILOT_INTENTS.map((i) => [i.key, i]));

export function getIntent(key: string): CopilotIntent | undefined {
  return BY_KEY.get(key);
}

export function isKnownIntent(key: string): key is IntentKey {
  return BY_KEY.has(key);
}

export function listIntents(): readonly CopilotIntent[] {
  return COPILOT_INTENTS;
}

/** Every permission the catalogue can require — used to prove none is unregistered. */
export function intentPermissions(): readonly string[] {
  return [...new Set(COPILOT_INTENTS.map((i) => i.permission))];
}
