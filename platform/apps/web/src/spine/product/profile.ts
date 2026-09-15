export type ProductPhase = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

/**
 * THE FOUR FAMILIES — how ten products are presented as a range rather than a list.
 *
 * With four products a flat list was fine. At ten it stops working: the sidebar's own
 * grouping file puts the workable ceiling at about eight before findability goes, and a
 * launcher showing ten undifferentiated rows makes a customer read all ten to find the one
 * they use every day.
 *
 * Every serious product range solves this the same way — a small number of families, each
 * answering "what KIND of thing is this", with the products inside them. So:
 *
 *   core      the system of record. There is exactly one, and everything else attaches to it.
 *   package   the six connected packages. Extend the core; useless without it.
 *   companion whole products in their own right that work WITH the core (ONYX's intelligence,
 *             AIKYANTRA's supplier network, which reaches outside the company entirely).
 *   combined  the one workspace that shows several at once.
 *
 * The order of families is the order a person meets them: what you run the business on,
 * what you add to it, what you connect it to, and then everything at once.
 */
export type ProductFamily = "core" | "package" | "companion" | "combined";

export const PRODUCT_FAMILIES: ReadonlyArray<{ id: ProductFamily; name: string; purpose: string }> = [
  { id: "core", name: "The business core", purpose: "Your system of record. Everything else reads from it." },
  { id: "package", name: "Connected packages", purpose: "Add a department's depth without changing the core." },
  { id: "companion", name: "Companion products", purpose: "Whole products that work alongside the core." },
  { id: "combined", name: "Everything together", purpose: "One workspace across several products." },
];

export interface ProductProfile {
  phase: ProductPhase;
  name: string;
  label: string;
  family: ProductFamily;
  description: string;
  home: string;
  modules: readonly string[];
  accent: string;
  themeColor: string;
  backgroundColor: string;
  icon: string;
  port: number;
}

const ERP_MODULES = ["general", "engineering", "sourcing", "purchase", "inventory", "planning", "quotation", "sales", "production", "csp", "quality", "maintenance", "hrm", "accounts", "expenditure", "working-capital", "administration", "integration", "dataimport"];
// The product edition is phase 2; the established ERP runtime profile remains 1.
// Optional applications remain available in their existing combined profile.
const XELOR_CORE_MODULES = ["general", "engineering", "purchase", "inventory", "planning", "quotation", "sales", "production", "quality", "hrm", "accounts", "expenditure", "administration", "dataimport"];
const AI_MODULES = ["connectivity", "decisionworkspace", "copilot", "agentos", "fulfilment", "aiops", "aicontrol", "platform-health", "integration", "administration"];
const NETWORK_MODULES = ["network", "sourcing", "purchase", "general", "engineering", "connectivity", "administration"];

// The six connected packages. Each is its own product with its own runtime,
// palette and navigation — deliberately NOT a single bundle that contains
// everything. Every one of them reads from and writes to the XELOR ERP, so a
// change made here shows up there; the shared database is what connects them.
// Each package pairs the ERP modules it extends with one module of its own.
const PLANT_MODULES = ["plantops", "maintenance", "production", "general", "administration"];
const COMPLIANCE_MODULES = ["safety", "quality", "general", "administration"];
const WAREHOUSE_MODULES = ["warehouse", "inventory", "general", "administration"];
const ENGINEERING_MODULES = ["engchange", "planning", "engineering", "general", "administration"];
const REVENUE_MODULES = ["costing", "quotation", "sales", "csp", "general", "administration"];
const DELIVERY_MODULES = ["delivery", "integration", "dataimport", "platform-health", "general", "administration"];

export const ALL_PRODUCT_PROFILES: readonly ProductProfile[] = [
  { phase: "1", family: "core", name: "XELOR phase 2", label: "ERP", description: "Your core business, clearly connected. Configure your workspace and manage orders, purchasing, inventory, operations, finance and people.", home: "/home", modules: XELOR_CORE_MODULES, accent: "#7a2945", themeColor: "#4b1d30", backgroundColor: "#f8f4ef", icon: "/icons/xelor.svg", port: 4001 },
  { phase: "2", family: "companion", name: "ONYX", label: "AI intelligence", description: "Connect your existing systems. Understand your next best decision.", home: "/home", modules: AI_MODULES, accent: "#842f4c", themeColor: "#1e3048", backgroundColor: "#f7f5ef", icon: "/icons/onyx.svg", port: 4101 },
  { phase: "3", family: "companion", name: "AIKYANTRA", label: "Supplier network", description: "Bring your suppliers, requests and sourcing decisions together.", home: "/home", modules: NETWORK_MODULES, accent: "#775717", themeColor: "#f2e6c9", backgroundColor: "#fbf8ef", icon: "/icons/aikyantra.svg", port: 4201 },
  { phase: "4", family: "combined", name: "Integrated workspace", label: "ERP, AI intelligence and supplier network", description: "Use XELOR ERP, ONYX AI intelligence and the AIKYANTRA supplier network in one workspace.", home: "/home", modules: [...new Set([...ERP_MODULES, ...AI_MODULES, ...NETWORK_MODULES, "managed-services"])], accent: "#205fa8", themeColor: "#102846", backgroundColor: "#f3f7fc", icon: "/icons/integrated.svg", port: 4301 },
  // Profiles 5-10 are the six connected packages. Append only — getProductProfile()
  // falls back to ALL_PRODUCT_PROFILES[3], so inserting above would silently move
  // the default away from the integrated workspace.
  { phase: "5", family: "package", name: "Plant Operations", label: "Machines, maintenance and energy", description: "Run the shop floor on one asset register: operator jobs, machine signals, OEE and downtime, maintenance work orders and energy per line.", home: "/home", modules: PLANT_MODULES, accent: "#214c52", themeColor: "#173034", backgroundColor: "#eff6f7", icon: "/icons/plant-operations.svg", port: 4401 },
  { phase: "6", family: "package", name: "Quality, Safety & Compliance", label: "Inspection, action and evidence", description: "One corrective-action engine for defects and incidents: inspections, containment, CAPA, calibration, permits and the evidence an auditor asks for.", home: "/home", modules: COMPLIANCE_MODULES, accent: "#224e3a", themeColor: "#183226", backgroundColor: "#eff6f3", icon: "/icons/quality-safety.svg", port: 4501 },
  { phase: "7", family: "package", name: "Warehouse & Dispatch", label: "Scan, store, pick and load", description: "One handling unit from gate to truck: scan receiving, bins and put-away, cycle counts, kitting, mobile picking and loading.", home: "/home", modules: WAREHOUSE_MODULES, accent: "#653c24", themeColor: "#3f271a", backgroundColor: "#f9f4f1", icon: "/icons/warehouse-dispatch.svg", port: 4601 },
  { phase: "8", family: "package", name: "Planning & Engineering", label: "What to make, and with which revision", description: "One bill of materials and capacity model: demand, constraints and what-if scenarios alongside engineering changes and new-product gates.", home: "/home", modules: ENGINEERING_MODULES, accent: "#403c89", themeColor: "#2a2852", backgroundColor: "#f4f4f9", icon: "/icons/planning-engineering.svg", port: 4701 },
  { phase: "9", family: "package", name: "Revenue & Service", label: "Quote it, then stand behind it", description: "The configuration you quote becomes the machine you service: enquiry intake, cost sheets and margin approval, then warranty, spares and field visits.", home: "/home", modules: REVENUE_MODULES, accent: "#64336c", themeColor: "#3e2243", backgroundColor: "#f8f3f8", icon: "/icons/revenue-service.svg", port: 4801 },
  { phase: "10", family: "package", name: "Delivery & Managed Services", label: "Getting it live, and keeping it live", description: "The people work around the software: discovery and migration, connectors and data operations, commissioning evidence and ongoing support.", home: "/home", modules: DELIVERY_MODULES, accent: "#3c4851", themeColor: "#272e33", backgroundColor: "#f3f5f6", icon: "/icons/delivery-services.svg", port: 4901 },
];

export function getProductProfile(phase: string | undefined = process.env.NEXT_PUBLIC_PRODUCT_PHASE): ProductProfile {
  return ALL_PRODUCT_PROFILES.find((profile) => profile.phase === phase) ?? ALL_PRODUCT_PROFILES[3]!;
}

export const PRODUCT_PROFILE = getProductProfile();

export function isModuleEnabled(key: string): boolean {
  return PRODUCT_PROFILE.modules.includes(key);
}
