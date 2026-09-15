import type { ModuleAlert, ModuleManifest } from "@spine/registry/manifest";
import { costingApi } from "./api";

/**
 * COSTING & SERVICE — the costing half of quoting, joined to the machine it becomes.
 *
 * WHY THESE FOUR SCREENS ARE ONE MODULE. Revenue & Service (product profile 9) merges
 * Quoting & Costing with After-sales & Service, and the merge is not a packaging convenience:
 * the configuration you quote IS the machine you later service. The same customer, the same
 * item, the same serial. Split across two products they become two customer records, two
 * product-configuration records and two support queues, and the plant discovers on the day of
 * a warranty claim that the two disagree about what was shipped.
 *
 * So: the cost that justified the price, the margin that had to clear a floor, the serial
 * that left the building, and the case the customer opened about it — one folder, one join.
 *
 * WHAT THIS MODULE DOES NOT ADD, and it is most of what an ERP brochure would claim here:
 *
 *   NO NEW PERMISSION. Every nav entry below names a permission that already exists in
 *   `packages/platform/src/access/permission-registry.ts` and that a real route already
 *   enforces with `@RequirePermission`. `pnpm perm-check` fails on a permission no route
 *   enforces, and it is right to — a grant that confers nothing is worse than no grant,
 *   because somebody will be given it and believe they have access.
 *
 *   NO NEW ENDPOINT AND NO MIGRATION. Every path this module calls was read off an existing
 *   controller. Where a screen wants to persist something and no table exists — the cost
 *   sheet, the margin floor, the approval limit — it computes and displays, and SAYS on the
 *   screen that nothing was stored. See the block comment in `api.ts`.
 *
 *   NO MODEL CALL. Not a rate limit, not a budget: there is no inference request anywhere in
 *   this folder. A model must never set a price, and the safest way to guarantee that in a
 *   costing module is to give it no way to speak.
 *
 * `licenceKey: "sales"` — the same key `quotation` and `sales` carry. Cost sheets and margin
 * approval are part of what a customer buys when they buy the sell side; this is not a
 * separately-sold product, and minting a licence key for it would create an entitlement
 * nobody sells. The service screens ride the same key because the whole premise of profile 9
 * is that they are one purchase.
 *
 * `department: "MICA"` — Sales & Product Care, alongside Quotations, Sales and Customer Care.
 * `order: 45` puts it between Sales (40) and Customer Care & Warranty (50), which is where it
 * sits in the work: after the order is priced, before the machine is supported.
 */

/* ---------------------- reading the responses defensively ------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function field(row: unknown, key: string): unknown {
  return isRecord(row) ? row[key] : undefined;
}

function str(row: unknown, key: string): string {
  const v = field(row, key);
  return typeof v === "string" ? v : "";
}

/**
 * The paged envelope in every spelling that exists in this codebase, plus the bare array CSP
 * answers with. A shape `reduce` does not recognise yields `null`, and the tile vanishes
 * rather than showing a guess — the right trade for something decorative.
 */
function rowsOf(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return null;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  return null;
}

/** A quotation nobody is waiting on any more. Matches what the Margin screen calls settled. */
const SETTLED_QUOTES = new Set(["accepted", "rejected", "superseded", "converted"]);

function isOpenTicketRow(row: unknown): boolean {
  const status = str(row, "status");
  return status !== "" && status !== "closed" && status !== "resolved";
}

function slaStateOf(row: unknown): string {
  const sla = field(row, "sla");
  return str(sla, "state");
}

function coverageVerdictOf(row: unknown): string {
  const entitlement = field(row, "entitlement");
  return str(entitlement, "verdict");
}

/** The eight most recent, plus one line accounting for the rest. Same cap as Data import. */
const ALERT_CAP = 8;

export const costingManifest: ModuleManifest = {
  key: "costing",
  name: "Costing & Service",
  summary:
    "Build up what a job costs, check the margin against a floor before the price goes out, then follow the serial you shipped into the service case the customer opens about it.",
  department: "MICA",
  icon: "Calculator",
  licenceKey: "sales",
  order: 45,
  nav: [
    {
      label: "Cost sheet",
      path: "cost-sheet",
      permission: "sales.quotation.read",
      icon: "Calculator",
      description:
        "Build up what one job costs: materials exploded from the item's own bill of material with its scrap allowance, then the setup, cycle, labour, tooling, outsourced work, freight and overhead you enter. Every line shows its arithmetic, and a component with no standard cost in the item master leaves a visible hole rather than being counted as free — so the total is withheld instead of being quietly wrong. Enter the supplier quotation's date and validity: the item master stores a cost but no date, and a price of unknown age is what this screen exists to expose. NOTHING IS SAVED — there is no cost-sheet table in this database, so the build-up lives in this browser tab and is gone when you close it.",
    },
    {
      label: "Margin & approval",
      path: "margin",
      permission: "sales.quotation.read",
      icon: "Percent",
      description:
        "What margin a quotation actually carries, measured on its taxable value rather than its GST-inclusive total, against a floor you type. Costs come from the item master's standard cost, and lines whose cost is unknown are counted and excluded rather than treated as zero. Where a production order exists for the same item you can compare what the job was estimated to consume against what it actually consumed. There is no approval-limit table in this system, so this screen names the permission the API will genuinely require — sales.quotation.decide — and does not draw an approval chain that nothing enforces.",
    },
    {
      label: "Installed base",
      path: "installed-base",
      permission: "sales.order.read",
      icon: "PackageCheck",
      description:
        "What was shipped, to whom, and whether it is still covered. Dispatched order lines come from Sales; the machine serials come from the service cases raised against them, because this build has no serial register endpoint — a dispatched line records a quantity, not a serial. Coverage is the entitlement engine's cached verdict with the date it was reached, never a fresh guess. Consignments above ₹50,000 are flagged as needing an e-way bill; the number recorded at dispatch is not returned by any read endpoint, so the screen says the bill is required and does not claim to know whether one exists.",
    },
    {
      label: "Service desk",
      path: "service-desk",
      permission: "csp.ticket.read",
      icon: "Headset",
      description:
        "Customer cases with a reply box — the gap this screen exists to close, since the ticket view elsewhere is deliberately read-only. Write a public reply that reaches the customer or an internal note that does not, move the case on, and run the warranty and AMC check against the date of failure. The response clock and its reason are the SLA engine's verdict, shown as it was computed. The software records a service commitment; it does not staff one, and a clock running here does not mean an engineer is on the way.",
    },
  ],
  screens: {
    "cost-sheet": () => import("./screens/cost-sheet"),
    margin: () => import("./screens/margin"),
    "installed-base": () => import("./screens/installed-base"),
    "service-desk": () => import("./screens/service-desk"),
  },

  /* ==========================================================================
     TWO FIGURES, BOTH COUNTS OF ROWS.

     Neither is a projection, a forecast or an "attractive sample". The database behind this
     build has been wiped to zero, so the normal reading of both tiles is 0 with a hint that
     explains what would put a number there — which is the honest state of a new tenant and
     should look like one rather than like a broken tile.
     ========================================================================== */
  signals: [
    {
      label: "Quotes to cost",
      permission: "sales.quotation.read",
      path: costingApi.quotationsPath,
      query: { limit: 50 },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        const live = rows.filter((r) => !SETTLED_QUOTES.has(str(r, "status")));
        const expired = live.filter((r) => field(r, "expired") === true).length;
        return {
          value: String(live.length),
          hint:
            rows.length === 0
              ? "No quotation has been raised yet"
              : expired > 0
                ? `${expired} of them ${expired === 1 ? "is" : "are"} past the validity date`
                : "Cost sheets are computed on the screen and not stored anywhere",
          tone: expired > 0 ? "warn" : "neutral",
        };
      },
    },
    {
      label: "Cover unknown",
      permission: "csp.ticket.read",
      path: costingApi.ticketsPath,
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        // A case that names a machine but carries no entitlement verdict. Counted, not
        // judged: the verdict field is either populated or it is not.
        const unchecked = rows.filter(
          (r) => str(r, "productSerialNo") !== "" && coverageVerdictOf(r) === "",
        ).length;
        return {
          value: String(unchecked),
          hint:
            rows.length === 0
              ? "No service case has been raised yet"
              : unchecked === 0
                ? `Every case naming a machine has a coverage verdict (${rows.length} cases)`
                : `cases naming a machine with no warranty or AMC check run, of ${rows.length}`,
          tone: unchecked > 0 ? "warn" : "ok",
        };
      },
    },
  ],

  /* ==========================================================================
     WHAT THIS MODULE INTERRUPTS SOMEBODY FOR.

     Two things, and both are decided by arithmetic over rows this module's own screens show.
     No model is consulted and none could be: one is a string comparison against the SLA
     engine's own verdict, the other is a null check. An alert that is wrong in the
     reassuring direction is worse than no alert at all.

     DELIBERATELY NOT ALERTED, because another module already owns them and a bell that rings
     twice for one fact gets muted: quotation validity and unconverted quotations (Quotations),
     overdue and credit-held orders (Sales). Also not alerted: a margin below floor — the floor
     is typed on a screen and stored nowhere, so there is no tenant-wide threshold to test
     against, and inventing one would make the bell ring on somebody else's opinion.
     ========================================================================== */
  alerts: [
    {
      permission: "csp.ticket.read",
      path: costingApi.ticketsPath,
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return [];
        const breached = rows.filter(
          (r) => isOpenTicketRow(r) && slaStateOf(r).startsWith("breached"),
        );
        const alerts = breached.flatMap((r): readonly ModuleAlert[] => {
          const ticketNo = str(r, "ticketNo");
          if (!ticketNo) return [];
          const state = slaStateOf(r);
          const sla = field(r, "sla");
          return [
            {
              // The ticket number: one alert per case, stable until the case moves, and gone
              // once it is resolved. No timestamp in the id — an id that changed every poll
              // would re-announce the same breach every sixty seconds.
              id: `costing.sla.${ticketNo}`,
              severity: state === "breached_resolution" ? "critical" : "urgent",
              title:
                state === "breached_resolution"
                  ? `${ticketNo} has passed its resolution commitment`
                  : `${ticketNo} has passed its first-response commitment`,
              body: "The commitment recorded against this case has been missed. Open the service desk to reply and move it on — the software records the promise, it does not staff it.",
              href: "/costing/service-desk",
              at: str(r, "createdAt") || undefined,
              evidence: `${ticketNo} — ${str(r, "subject") || "no subject recorded"}; SLA engine state ${state}${str(sla, "reason") ? `, ${str(sla, "reason")}` : ""}.`,
            },
          ];
        });
        if (alerts.length <= ALERT_CAP) return alerts;
        return [
          ...alerts.slice(0, ALERT_CAP),
          {
            id: "costing.sla.more",
            severity: "urgent",
            title: `${alerts.length} cases have missed their commitment — the ${ALERT_CAP} most recent are listed above`,
            body: "The rest are on the service desk, filtered by response state.",
            href: "/costing/service-desk",
          },
        ];
      },
    },
    {
      permission: "csp.ticket.read",
      path: costingApi.ticketsPath,
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return [];
        // A machine named, no coverage verdict, case still open. This is the state in which
        // somebody promises a free repair on a machine whose warranty ran out in March.
        const unchecked = rows.filter(
          (r) =>
            isOpenTicketRow(r) &&
            str(r, "productSerialNo") !== "" &&
            coverageVerdictOf(r) === "",
        );
        const alerts = unchecked.flatMap((r): readonly ModuleAlert[] => {
          const ticketNo = str(r, "ticketNo");
          const serial = str(r, "productSerialNo");
          if (!ticketNo) return [];
          return [
            {
              id: `costing.coverage.${ticketNo}`,
              severity: "attention",
              title: `Coverage on ${serial} has not been checked for ${ticketNo}`,
              body: "Nobody has run the warranty and AMC check on this machine, so whether the work is chargeable is currently unknown. The check is judged on the date of failure, not on today.",
              href: "/costing/installed-base",
              at: str(r, "createdAt") || undefined,
              evidence: `${ticketNo} names machine ${serial}; the entitlement verdict on the case is empty.`,
            },
          ];
        });
        if (alerts.length <= ALERT_CAP) return alerts;
        return [
          ...alerts.slice(0, ALERT_CAP),
          {
            id: "costing.coverage.more",
            severity: "attention",
            title: `${alerts.length} machines under an open case have no coverage verdict — the ${ALERT_CAP} most recent are listed above`,
            body: "The rest are on the installed base, where the check can be run against the date of failure.",
            href: "/costing/installed-base",
          },
        ];
      },
    },
  ],
};
