import type { ModuleManifest } from "../registry/manifest";

interface CoreView {
  name: string;
  summary?: string;
  paths?: readonly string[];
}

/** Presentation for the ERP edition; technical profile and authorization stay separate. */
const CORE_VIEWS: Readonly<Record<string, CoreView>> = {
  general: { name: "Company", paths: ["companies"] },
  engineering: { name: "Items & BOMs" },
  purchase: { name: "Purchasing" },
  planning: {
    name: "Material planning",
    paths: ["mrp", "planned-orders", "exceptions", "demand", "policies", "explain"],
  },
  production: { name: "Production", paths: ["orders", "order"] },
  quality: {
    name: "Inspections",
    summary: "Material and product inspections, with measured results and disposition records.",
    paths: ["inspections", "inspection"],
  },
};

/**
 * Project a shared manifest into XELOR's core workspace. The caller applies this only
 * to technical profile 1. Both navigation and screen loaders are narrowed so a hidden
 * add-on route cannot remain reachable through a manually entered URL.
 *
 * Keep the original manifests untouched: other products still use their full screens.
 * Domain permissions, licences, dashboard signals and accepted loaders retain their
 * original contracts. This presentation helper does not grant API access.
 */
export function erpCoreManifest(manifest: ModuleManifest): ModuleManifest {
  const view = CORE_VIEWS[manifest.key];
  const included = (path: string): boolean => !view?.paths || view.paths.includes(path);

  return {
    ...manifest,
    name: view?.name ?? manifest.name,
    summary: view?.summary ?? manifest.summary,
    nav: manifest.nav.filter((entry) => included(entry.path)),
    screens: Object.fromEntries(
      Object.entries(manifest.screens).filter(([path]) => included(path)),
    ),
    // The inherited watch assumes production can only issue unbatched stock. That
    // obsolete assumption would falsely flag every batched balance in this workspace.
    ...(manifest.key === "inventory" ? { alerts: [] } : {}),
  };
}
