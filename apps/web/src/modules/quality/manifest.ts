import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * QUALITY / INSPECTION (KILN, Module 06).
 *
 * Read-only in this pass. Recording readings and deciding the disposition of rejected
 * material are the two acts this module exists to make accountable; neither belongs on a
 * screen somebody opened to look something up.
 */
export const qualityManifest: ModuleManifest = {
  key: "quality",
  name: "Quality",
  summary: "Inspections, the readings behind each verdict, and what was accepted or rejected.",
  department: "KILN",
  icon: "ShieldCheck",
  licenceKey: "quality",
  order: 55,
  nav: [
    {
      label: "Inspections",
      path: "inspections",
      permission: "quality.inspection.read",
      icon: "ClipboardCheck",
    },
    {
      label: "Inspection",
      path: "inspection",
      permission: "quality.inspection.read",
      icon: "ClipboardCheck",
      hidden: true,
    },
  ],
  screens: {
    inspections: () => import("./screens/inspections"),
    inspection: () => import("./screens/inspection"),
  },
};
