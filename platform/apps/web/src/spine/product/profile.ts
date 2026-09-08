export type ProductPhase = "1" | "2" | "3" | "4";

export interface ProductProfile {
  phase: ProductPhase;
  name: string;
  label: string;
  description: string;
  home: string;
  modules: readonly string[];
  accent: string;
  port: number;
}

const ERP_MODULES = ["general", "engineering", "sourcing", "purchase", "inventory", "planning", "quotation", "sales", "production", "csp", "quality", "maintenance", "hrm", "accounts", "expenditure", "working-capital", "administration", "integration", "dataimport"];
const AI_MODULES = ["connectivity", "decisionworkspace", "copilot", "agentos", "fulfilment", "aiops", "aicontrol", "platform-health", "integration", "administration"];
const NETWORK_MODULES = ["network", "sourcing", "purchase", "general", "engineering", "connectivity", "administration"];

export const ALL_PRODUCT_PROFILES: readonly ProductProfile[] = [
  { phase: "1", name: "ONYX", label: "ERP", description: "Run your factory, from the first quotation to the final delivery.", home: "/home", modules: ERP_MODULES, accent: "#107c70", port: 4001 },
  { phase: "2", name: "XELOR", label: "Manufacturing intelligence", description: "Connect your existing systems. Understand your next best decision.", home: "/home", modules: AI_MODULES, accent: "#6366a5", port: 4101 },
  { phase: "3", name: "SOURCE", label: "Supplier network", description: "Bring your suppliers, requests and sourcing decisions together.", home: "/home", modules: NETWORK_MODULES, accent: "#b57727", port: 4201 },
  { phase: "4", name: "AIKYANTRA", label: "Connected manufacturing", description: "One workspace for your factory, intelligence and supplier network.", home: "/home", modules: [...new Set([...ERP_MODULES, ...AI_MODULES, ...NETWORK_MODULES, "managed-services"])], accent: "#107c70", port: 4301 },
];

export function getProductProfile(phase: string | undefined = process.env.NEXT_PUBLIC_PRODUCT_PHASE): ProductProfile {
  return ALL_PRODUCT_PROFILES.find((profile) => profile.phase === phase) ?? ALL_PRODUCT_PROFILES[3]!;
}

export const PRODUCT_PROFILE = getProductProfile();

export function isModuleEnabled(key: string): boolean {
  return PRODUCT_PROFILE.modules.includes(key);
}
