import type { ModuleManifest } from "@spine/registry/manifest";
import { generalApi, stateName } from "./api";

/**
 * `GET /general/companies` is a §5.3 cursor page: `{items, nextCursor}`. A dashboard tile is
 * decorative, so this narrows rather than casts — an unexpected shape returns null and the
 * tile disappears instead of throwing on the department page it decorates.
 */
function pageItems(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items;
  }
  return null;
}

/** The GST registrations on one company row, or an empty list if the row is not what we expect. */
function registrationsOf(row: unknown): readonly { stateCode: string }[] {
  if (typeof row !== "object" || row === null) return [];
  const regs = (row as { registrations?: unknown }).registrations;
  if (!Array.isArray(regs)) return [];
  return regs.flatMap((r) => {
    if (typeof r !== "object" || r === null) return [];
    const code = (r as { stateCode?: unknown }).stateCode;
    return typeof code === "string" ? [{ stateCode: code }] : [];
  });
}

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
  summary:
    "The legal entities this company trades as, and the identity every document is issued under.",
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
      description:
        "Every legal entity this tenant trades as, read from the company master, with each GSTIN it holds and the place that registration covers. These are the exact name, CIN and GSTIN that print on your invoices, e-way bills and returns. Nothing can be added or edited here — a company is registered during setup.",
    },
    {
      // The organisation that builds and owns the system, beside the organisation that
      // uses it. Anyone who may see the company masters may see how the platform behind
      // them is organised — it describes structure, not a single row of anybody's data.
      label: "Departments & agents",
      path: "departments",
      permission: "general.company.read",
      icon: "Users",
      description:
        "The seven departments and one component that build and own this system, and the written contract at every seam between two of them. The module list under each card is read from the live registry of this build, so a module that was specified and then left out says so rather than being quietly listed. Nothing on this page is about your factory's own data.",
    },
  ],
  screens: {
    companies: () => import("./screens/companies"),
    departments: () => import("./screens/departments"),
  },
  /**
   * Two figures, both read off the same endpoint the Companies screen already uses.
   *
   * The headline is the count of REGISTERED PLACES OF BUSINESS rather than the count of
   * companies, because that is the number that is surprising: one legal entity holding a
   * GSTIN per state is the ordinary shape of an Indian manufacturer, and it is the fact a
   * foreign ERP models badly. The chart splits them by state for the same reason — each
   * slice files its own return.
   */
  signals: [
    {
      label: "Registered places",
      permission: "general.company.read",
      path: generalApi.companiesPath,
      // One page is enough for a headline: a tenant with more than a hundred legal entities
      // is not reading this tile, it is reading the screen.
      query: { limit: 100 },
      reduce: (data) => {
        const items = pageItems(data);
        if (!items || items.length === 0) return null;
        const byState = new Map<string, number>();
        let total = 0;
        for (const row of items) {
          for (const reg of registrationsOf(row)) {
            total += 1;
            byState.set(reg.stateCode, (byState.get(reg.stateCode) ?? 0) + 1);
          }
        }
        return {
          value: String(total),
          hint: `GST registrations across ${byState.size} state${byState.size === 1 ? "" : "s"}`,
          tone: total === 0 ? "warn" : "neutral",
          series: [...byState.entries()]
            .map(([code, count]) => ({ label: stateName(code), value: count }))
            .sort((a, b) => b.value - a.value),
        };
      },
    },
    {
      label: "Legal entities",
      permission: "general.company.read",
      path: generalApi.companiesPath,
      query: { limit: 100 },
      reduce: (data) => {
        const items = pageItems(data);
        if (!items) return null;
        // An entity with no GSTIN cannot legally raise a tax invoice. That is a finding, not
        // a blank — so it is what the hint says whenever it is true.
        const withoutGstin = items.filter(
          (row) => registrationsOf(row).length === 0,
        ).length;
        return {
          value: String(items.length),
          hint:
            items.length === 0
              ? "No company on record yet"
              : withoutGstin > 0
                ? `${withoutGstin} with no GSTIN — cannot raise a tax invoice`
                : "All can raise a tax invoice",
          tone:
            items.length === 0 ? "warn" : withoutGstin > 0 ? "bad" : "neutral",
        };
      },
    },
  ],
};
