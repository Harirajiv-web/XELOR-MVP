import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * ORGANISATION (HEXA, GENERAL).
 *
 * The tenant's own identity: the legal entities every document in the system is issued by.
 * It is first in the sidebar because nothing else is meaningful until the company exists —
 * an invoice with no issuer is not a document, it is a note.
 */
export const generalManifest: ModuleManifest = {
  key: "general",
  name: "Organisation",
  summary: "The legal entities this company trades as, and the identity every document is issued under.",
  department: "HEXA",
  icon: "Building2",
  licenceKey: "general",
  order: 10,
  nav: [
    {
      label: "Companies",
      path: "companies",
      permission: "general.company.read",
      icon: "Building2",
    },
  ],
  screens: {
    companies: () => import("./screens/companies"),
  },
};
