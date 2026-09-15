export type IndustryPreset = "general" | "precision" | "machinery" | "assembly" | "distribution";
export type DepartmentKey = "sales" | "purchasing" | "inventory" | "operations" | "finance" | "people";
export type FocusRole = "owner" | "sales" | "buyer" | "operations" | "finance" | "people";
export interface WorkspaceConfig {
  schemaVersion: 1;
  industryPreset: IndustryPreset;
  businessLabel: string;
  terminology: { customer: string; supplier: string; item: string; workOrder: string };
  visibleDepartments: DepartmentKey[];
  quickActionOrder: string[];
}
export interface WorkspaceConfiguration { config: WorkspaceConfig; updatedAt: string | null }
export const DEFAULT_CONFIG: WorkspaceConfig = {
  schemaVersion: 1, industryPreset: "general", businessLabel: "",
  terminology: { customer: "Customers", supplier: "Suppliers", item: "Items", workOrder: "Work orders" },
  visibleDepartments: ["sales", "purchasing", "inventory", "operations", "finance", "people"], quickActionOrder: [],
};
export const DEPARTMENTS: readonly { key: DepartmentKey | "company"; label: string; description: string; icon: string }[] = [
  { key: "sales", label: "Sales & customers", description: "Quotes, commitments and delivery", icon: "ShoppingBag" },
  { key: "purchasing", label: "Purchasing", description: "Orders, suppliers and receipts", icon: "ShoppingCart" },
  { key: "inventory", label: "Inventory", description: "Items, stock and locations", icon: "Boxes" },
  { key: "operations", label: "Operations", description: "Materials, production and inspection", icon: "Factory" },
  { key: "finance", label: "Finance", description: "Posted accounts and expense claims", icon: "Landmark" },
  { key: "people", label: "People", description: "Employees, attendance and leave", icon: "Users" },
  { key: "company", label: "Company", description: "Setup, access, imports and audit", icon: "Settings2" },
];
export interface ErpAction { id: string; label: string; description: string; href: string; department: DepartmentKey | "company"; icon: string; keywords: string; term?: keyof WorkspaceConfig["terminology"] }
export const ERP_ACTIONS: readonly ErpAction[] = [
  { id: "quotes", label: "Quotations", description: "Prepare quotes, compare revisions and convert accepted quotes to orders.", href: "/quotation/list", department: "sales", icon: "FileText", keywords: "quote enquiry estimate revision acceptance order" },
  { id: "sales-orders", label: "Sales orders", description: "Customer commitments, delivery dates and dispatch progress.", href: "/sales/orders", department: "sales", icon: "ShoppingBag", keywords: "sell customer order delivery dispatch credit hold" },
  { id: "customers", label: "Customers", description: "Customer records and the accounts behind your orders.", href: "/sales/customers", department: "sales", icon: "Contact", keywords: "buyer client customer master", term: "customer" },
  { id: "purchase-orders", label: "Purchase orders", description: "Raise orders, submit for approval and receive goods against them.", href: "/purchase/orders", department: "purchasing", icon: "ShoppingCart", keywords: "buy po receive grn receipt approval supplier commitment" },
  { id: "suppliers", label: "Suppliers & performance", description: "Your supplier master, delivery reliability and receipt evidence.", href: "/purchase/vendors", department: "purchasing", icon: "Truck", keywords: "supplier vendor performance quality evidence delivery gstin", term: "supplier" },
  { id: "stock", label: "Stock on hand", description: "Available quantities by item, warehouse and batch.", href: "/inventory/stock", department: "inventory", icon: "Boxes", keywords: "inventory stock batch lot balance quantity material" },
  { id: "warehouses", label: "Warehouses", description: "Storage locations and their operating purpose.", href: "/inventory/warehouses", department: "inventory", icon: "Warehouse", keywords: "warehouse store location" },
  { id: "items", label: "Items & bills of material", description: "Open an item to review its BOM and versions, or maintain item records.", href: "/engineering/items", department: "inventory", icon: "Package", keywords: "item product sku material engineering bom bill of material revision", term: "item" },
  { id: "mrp", label: "Material planning", description: "Check demand, stock and open supply before buying or making.", href: "/planning/mrp", department: "operations", icon: "Layers3", keywords: "mrp material requirements plan netting shortage bom" },
  { id: "planned-orders", label: "Planned orders", description: "Review the buy and make proposals from a planning run.", href: "/planning/planned-orders", department: "operations", icon: "ClipboardList", keywords: "planned orders release buy make" },
  { id: "planning-exceptions", label: "Planning exceptions", description: "Find shortages, missing inputs and decisions that need a planner.", href: "/planning/exceptions", department: "operations", icon: "TriangleAlert", keywords: "exceptions shortage missing planning late warning" },
  { id: "demand", label: "Demand", description: "Review demand used by material planning.", href: "/planning/demand", department: "operations", icon: "CalendarDays", keywords: "forecast demand orders material" },
  { id: "policies", label: "Planning policies", description: "Review item planning parameters and replenishment rules.", href: "/planning/policies", department: "operations", icon: "SlidersHorizontal", keywords: "policy planning parameters safety stock lot size lead time" },
  { id: "work-orders", label: "Work orders", description: "Start work, issue components and record production completion.", href: "/production/orders", department: "operations", icon: "Factory", keywords: "job production work order issue component completion operator", term: "workOrder" },
  { id: "inspections", label: "Inspections", description: "Review material checks, results and stock-disposition evidence.", href: "/quality/inspections", department: "operations", icon: "ClipboardCheck", keywords: "quality inspection hold rejection readings disposition" },
  { id: "ledger", label: "Trial balance", description: "Check debit and credit totals at an explicit reporting date.", href: "/accounts/trial-balance", department: "finance", icon: "Landmark", keywords: "accounts accounting finance trial balance ledger debit credit" },
  { id: "vouchers", label: "Accounting vouchers", description: "Trace posted amounts back to their journal lines.", href: "/accounts/vouchers", department: "finance", icon: "ReceiptText", keywords: "voucher journal ledger accounting entry posting" },
  { id: "expenses", label: "Expense claims", description: "Claims, supporting records and reimbursement status.", href: "/expenditure/claims", department: "finance", icon: "Wallet", keywords: "expenses claims reimburse approval spend" },
  { id: "employees", label: "Employees", description: "Employee records and organisational details.", href: "/hrm/employees", department: "people", icon: "Users", keywords: "hr people staff employees person" },
  { id: "attendance", label: "Attendance", description: "Review the attendance muster for the selected period.", href: "/hrm/muster", department: "people", icon: "CalendarCheck", keywords: "attendance shift muster employee hours" },
  { id: "leave", label: "Leave balances", description: "Review employee leave entitlements and balances.", href: "/hrm/leave", department: "people", icon: "CalendarDays", keywords: "leave holiday people hr balance" },
  { id: "companies", label: "Company records", description: "Legal company details and registered entities.", href: "/general/companies", department: "company", icon: "Building2", keywords: "company legal entity master setup" },
  { id: "roles", label: "Roles & access", description: "Review roles, permissions and access responsibilities.", href: "/administration/roles", department: "company", icon: "ShieldCheck", keywords: "permissions roles access users security approval" },
  { id: "audit", label: "Audit trail", description: "Review recorded actions and the evidence of changes.", href: "/administration/audit", department: "company", icon: "History", keywords: "audit trail log changes history evidence" },
  { id: "import", label: "Import records", description: "Validate a spreadsheet and review it before importing.", href: "/dataimport/run", department: "company", icon: "Upload", keywords: "upload import migrate csv excel spreadsheet data" },
];
export const INDUSTRIES: readonly { id: IndustryPreset; name: string; description: string; departments: DepartmentKey[]; terminology: WorkspaceConfig["terminology"]; actions: string[] }[] = [
  { id: "general", name: "General business", description: "A balanced view across sales, purchasing, stock, operations, finance and people.", departments: [...DEFAULT_CONFIG.visibleDepartments], terminology: DEFAULT_CONFIG.terminology, actions: ["sales-orders", "purchase-orders", "stock", "ledger"] },
  { id: "precision", name: "Precision & job work", description: "Bring quotations, item revisions, material readiness and jobs to the front.", departments: [...DEFAULT_CONFIG.visibleDepartments], terminology: { customer: "Customers", supplier: "Suppliers", item: "Parts", workOrder: "Job orders" }, actions: ["quotes", "items", "mrp", "work-orders", "inspections"] },
  { id: "machinery", name: "Machinery & equipment", description: "Keep BOMs, purchased components, production and customer orders close together.", departments: [...DEFAULT_CONFIG.visibleDepartments], terminology: { customer: "Customers", supplier: "Vendors", item: "Components", workOrder: "Build orders" }, actions: ["sales-orders", "items", "purchase-orders", "work-orders", "suppliers"] },
  { id: "assembly", name: "Repetitive assembly", description: "Focus on demand, replenishment, work orders and inspection.", departments: [...DEFAULT_CONFIG.visibleDepartments], terminology: { customer: "Customers", supplier: "Suppliers", item: "Components", workOrder: "Production orders" }, actions: ["demand", "mrp", "stock", "work-orders", "inspections"] },
  { id: "distribution", name: "Trading & distribution", description: "Prioritise customer orders, purchasing, stock and accounts.", departments: ["sales", "purchasing", "inventory", "finance", "people"], terminology: { customer: "Customers", supplier: "Suppliers", item: "Products", workOrder: "Work orders" }, actions: ["sales-orders", "purchase-orders", "stock", "suppliers", "ledger"] },
];
export const ROLES: readonly { id: FocusRole; name: string; description: string; departments: (DepartmentKey | "company")[]; actions: string[]; signals: string[] }[] = [
  { id: "owner", name: "Business owner", description: "Commitments, exceptions and the overall picture", departments: ["sales", "purchasing", "inventory", "operations", "finance", "people", "company"], actions: ["sales-orders", "purchase-orders", "stock", "work-orders", "ledger", "suppliers"], signals: ["sales", "purchase", "inventory", "production", "quality", "accounts"] },
  { id: "sales", name: "Sales team", description: "Quotes, customers and delivery commitments", departments: ["sales", "inventory", "purchasing", "operations", "finance", "people", "company"], actions: ["quotes", "sales-orders", "customers", "stock"], signals: ["quotation", "sales", "inventory", "production", "purchase", "accounts"] },
  { id: "buyer", name: "Buyer & stores", description: "Purchase commitments, suppliers and stock", departments: ["purchasing", "inventory", "operations", "sales", "finance", "people", "company"], actions: ["purchase-orders", "suppliers", "stock", "planning-exceptions", "warehouses"], signals: ["purchase", "inventory", "planning", "quality", "sales", "accounts"] },
  { id: "operations", name: "Operations team", description: "Materials, work orders and inspections", departments: ["operations", "inventory", "purchasing", "sales", "people", "finance", "company"], actions: ["work-orders", "mrp", "planning-exceptions", "stock", "inspections"], signals: ["production", "planning", "quality", "inventory", "purchase", "sales"] },
  { id: "finance", name: "Finance team", description: "Posted accounts, expenses and commitments", departments: ["finance", "sales", "purchasing", "inventory", "people", "operations", "company"], actions: ["ledger", "vouchers", "expenses", "sales-orders", "purchase-orders"], signals: ["accounts", "expenditure", "sales", "purchase", "inventory", "production"] },
  { id: "people", name: "People team", description: "Employees, attendance and leave", departments: ["people", "finance", "company", "operations", "sales", "purchasing", "inventory"], actions: ["employees", "attendance", "leave", "expenses"], signals: ["hrm", "expenditure", "production", "accounts", "sales", "purchase"] },
];
export const WORKFLOWS = [
  { id: "order-delivery", title: "Quote to delivery", description: "Keep the accepted quote, customer commitment and delivery work connected.", department: "sales", steps: [{ action: "quotes", detail: "Prepare, revise and record the customer's decision." }, { action: "sales-orders", detail: "Confirm the accepted quantities and delivery commitment." }, { action: "stock", detail: "Check available stock and the items to fulfil." }, { action: "sales-orders", detail: "Open the order to dispatch and review fulfilment." }] },
  { id: "buy-receive", title: "Purchase to receipt", description: "Start with the supplier, approve the commitment and receive against the order.", department: "purchasing", steps: [{ action: "suppliers", detail: "Review the vendor and its internal performance evidence." }, { action: "purchase-orders", detail: "Create an order and submit it through the existing approval flow." }, { action: "purchase-orders", detail: "Open the approved PO to record its goods receipt." }, { action: "stock", detail: "Check the resulting warehouse and batch balance." }] },
  { id: "plan-produce", title: "Plan to production", description: "Check requirements before releasing work and issuing material.", department: "operations", steps: [{ action: "items", detail: "Open the item and verify its bill of material." }, { action: "mrp", detail: "Run material planning with demand and current supply." }, { action: "planned-orders", detail: "Review the buy and make proposals and exceptions." }, { action: "work-orders", detail: "Open a job to start, issue components and complete production." }] },
  { id: "quality-release", title: "Inspect and review", description: "Find the inspection result and the material evidence behind it.", department: "operations", steps: [{ action: "inspections", detail: "Select the material or product inspection." }, { action: "inspections", detail: "Review readings, result and recorded stock disposition." }, { action: "stock", detail: "Review the relevant item, warehouse and batch balance." }] },
  { id: "finance-review", title: "Review the books", description: "Use an explicit reporting date and follow totals into recorded entries.", department: "finance", steps: [{ action: "ledger", detail: "Select the reporting date and review debit and credit totals." }, { action: "vouchers", detail: "Open journal entries and the posted supporting details." }, { action: "expenses", detail: "Review claim evidence and reimbursement status separately." }] },
  { id: "people-work", title: "People and attendance", description: "Keep daily people records within reach of the team that uses them.", department: "people", steps: [{ action: "employees", detail: "Open the employee record." }, { action: "attendance", detail: "Review attendance for the selected month." }, { action: "leave", detail: "Check recorded leave balances." }] },
] as const;
export function actionLabel(action: ErpAction, config: WorkspaceConfig): string {
  if (!action.term) return action.label;
  const label = config.terminology[action.term];
  return action.id === "items" ? `${label} & bills of material` : action.id === "suppliers" ? `${label} & performance` : label;
}
export function searchActions(actions: readonly ErpAction[], query: string, config: WorkspaceConfig): ErpAction[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return actions.filter(action => words.every(word => `${actionLabel(action, config)} ${action.label} ${action.description} ${action.keywords}`.toLocaleLowerCase().includes(word)));
}
