import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { date } from "@spine/format";

/**
 * Only the columns the tiles and the watches read. Every one is returned by
 * `GET /purchase/rfqs` — `RfqService.list` builds exactly this row and nothing more.
 */
interface RfqFact {
  id: string;
  rfqNo: string;
  title: string;
  needDate: string | null;
  quoteDeadline: string | null;
  status: string;
  invitedCount: number;
  quotedCount: number;
  awardedVendorName: string | null;
}

const OPEN = new Set(["draft", "issued", "evaluation"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pageRows(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data as unknown[];
  if (!isRecord(data)) return null;
  if (Array.isArray(data.items)) return data.items as unknown[];
  if (Array.isArray(data.data)) return data.data as unknown[];
  return null;
}

/** One unrecognisable row abandons the whole figure rather than computing it from a subset. */
function rfqFacts(data: unknown): RfqFact[] | null {
  const raw = pageRows(data);
  if (raw === null) return null;
  const out: RfqFact[] = [];
  for (const row of raw) {
    if (!isRecord(row) || typeof row.status !== "string") return null;
    out.push({
      id: typeof row.id === "string" ? row.id : "",
      rfqNo: typeof row.rfqNo === "string" ? row.rfqNo : "",
      title: typeof row.title === "string" ? row.title : "",
      needDate: typeof row.needDate === "string" ? row.needDate : null,
      quoteDeadline: typeof row.quoteDeadline === "string" ? row.quoteDeadline : null,
      status: row.status,
      invitedCount: typeof row.invitedCount === "number" ? row.invitedCount : 0,
      quotedCount: typeof row.quotedCount === "number" ? row.quotedCount : 0,
      awardedVendorName: typeof row.awardedVendorName === "string" ? row.awardedVendorName : null,
    });
  }
  return out;
}

const daysUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const then = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((then - today) / 86_400_000);
};

const ALERT_CAP = 8;

/**
 * SOURCING (SPAR).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles and runs with one fewer sidebar
 * item — no route file to clean up and no import left dangling.
 *
 * It sits immediately before Purchase, because a request for quotation is the step before a
 * purchase order, and the sidebar reads in the order work travels. Licensed under `purchase`
 * rather than a key of its own: nobody buys the ability to compare suppliers without the
 * ability to raise the order it becomes.
 */
export const sourcingManifest: ModuleManifest = {
  key: "sourcing",
  name: "Sourcing",
  summary:
    "Requests for quotation, what each supplier answered, and the recorded reason one of them was awarded the order.",
  department: "SPAR",
  icon: "Search",
  licenceKey: "purchase",
  order: 24,
  nav: [
    {
      label: "Requests for quotation",
      path: "rfqs",
      permission: "purchase.rfq.read",
      icon: "Search",
      description:
        "Every request this plant has put to its suppliers, with how many were invited, how many answered, and which supplier won. This is where the buying decision itself is kept — a purchase order records what was bought, and until now how the supplier was chosen lived in somebody's mailbox. Each request carries the part, the quantity, the drawing revision and the date the material is actually needed, so a supplier is answering a question rather than guessing at one.",
    },
    {
      label: "Request",
      path: "detail",
      permission: "purchase.rfq.read",
      icon: "Search",
      hidden: true,
    },
  ],
  screens: {
    rfqs: () => import("./screens/rfqs"),
    detail: () => import("./screens/detail"),
  },
  /**
   * Somebody glancing at SPAR asks one thing of this module: WHAT AM I STILL WAITING ON.
   * Both tiles read `GET /purchase/rfqs`, the endpoint the list screen reads, under the
   * permission that endpoint enforces. Nothing here is a query invented for a tile.
   */
  signals: [
    {
      label: "Open requests",
      permission: "purchase.rfq.read",
      path: "/purchase/rfqs",
      query: { limit: 100 },
      reduce: (data): SignalValue | null => {
        const rows = rfqFacts(data);
        if (rows === null) return null;
        if (rows.length === 0) {
          return { value: "0", hint: "No requests raised yet", tone: "neutral" };
        }
        const open = rows.filter((r) => OPEN.has(r.status));
        const silent = open.filter((r) => r.quotedCount === 0).length;
        return {
          value: String(open.length),
          hint:
            silent > 0
              ? `of ${rows.length} · ${silent} with no supplier answer yet`
              : `of ${rows.length} requests still being decided`,
          tone: silent > 0 ? "warn" : "neutral",
          fraction: open.length / rows.length,
        };
      },
    },
    {
      label: "Awarded",
      permission: "purchase.rfq.read",
      path: "/purchase/rfqs",
      query: { limit: 100 },
      reduce: (data): SignalValue | null => {
        const rows = rfqFacts(data);
        if (rows === null || rows.length === 0) return null;
        const awarded = rows.filter((r) => r.status === "awarded").length;
        return {
          value: String(awarded),
          hint: `of ${rows.length} requests have a supplier and a purchase order`,
          tone: "ok",
          fraction: awarded / rows.length,
        };
      },
    },
  ],
  /**
   * WHAT SOURCING WATCHES FOR, AND WHY IT IS ARITHMETIC.
   *
   * Both verdicts below are date and count comparisons made in this file. No model is asked
   * whether a request is running late (DECISIONS-V2 §4): a model asked to judge will
   * occasionally decide a thing is fine because the sentence read better, and an alert that
   * is wrong in the reassuring direction is worse than no alert at all.
   *
   * Ids are built from the RFQ NUMBER so the same problem is the same alert on every poll and
   * "I have read this" survives a refresh.
   */
  alerts: [
    {
      /**
       * NOBODY HAS ANSWERED AND THE DEADLINE HAS PASSED. The buyer is waiting on a reply that
       * is not coming, and the need date carries on approaching while they wait.
       */
      permission: "purchase.rfq.read",
      path: "/purchase/rfqs",
      query: { limit: 100 },
      reduce: (data): readonly ModuleAlert[] => {
        const rows = rfqFacts(data);
        if (rows === null) return [];
        const stalled = rows
          .filter((r) => r.rfqNo !== "" && r.id !== "")
          .filter((r) => OPEN.has(r.status))
          .map((r) => ({ r, days: daysUntil(r.quoteDeadline) }))
          .filter((x): x is { r: RfqFact; days: number } => x.days !== null && x.days < 0)
          .filter((x) => x.r.quotedCount < x.r.invitedCount)
          .sort((a, b) => a.days - b.days);

        const alerts = stalled.map(({ r, days }): ModuleAlert => {
          const missing = r.invitedCount - r.quotedCount;
          return {
            id: `purchase.rfq.silent.${r.rfqNo}`,
            severity: r.quotedCount === 0 ? "urgent" : "attention",
            title:
              r.quotedCount === 0
                ? `${r.rfqNo} closed ${Math.abs(days)} days ago with no answers at all`
                : `${r.rfqNo} is short ${missing} of ${r.invitedCount} answers`,
            body:
              r.quotedCount === 0
                ? `${r.title} — the quote deadline has passed and not one invited supplier has responded. Nothing can be awarded and the need date is still coming.`
                : `${r.title} — ${r.quotedCount} of ${r.invitedCount} suppliers answered before the deadline. A comparison on a thin field is a comparison worth knowing is thin.`,
            href: `/sourcing/detail/${r.id}`,
            at: r.quoteDeadline ?? undefined,
            evidence: `Request ${r.rfqNo}: ${r.quotedCount} of ${r.invitedCount} invited suppliers answered; quote deadline ${date(r.quoteDeadline)}.`,
          };
        });

        if (alerts.length <= ALERT_CAP) return alerts;
        return [
          ...alerts.slice(0, ALERT_CAP),
          {
            id: "purchase.rfq.silent.more",
            severity: "attention",
            title: `${alerts.length} requests are past their deadline without a full set of answers`,
            body: `The ${ALERT_CAP} longest overdue are listed above. The sourcing screen shows every one of them.`,
            href: "/sourcing/rfqs",
            evidence: `Counted across the ${alerts.length} matching requests on this page of GET /purchase/rfqs.`,
          },
        ];
      },
    },
    {
      /**
       * QUOTES ARE IN AND NOBODY HAS DECIDED. The suppliers have done their part; every day
       * this sits is a day taken out of the lead time the winner will be asked to meet.
       */
      permission: "purchase.rfq.read",
      path: "/purchase/rfqs",
      query: { limit: 100 },
      reduce: (data): readonly ModuleAlert[] => {
        const rows = rfqFacts(data);
        if (rows === null) return [];
        const undecided = rows
          .filter((r) => r.rfqNo !== "" && r.id !== "")
          .filter((r) => r.status === "evaluation" && r.quotedCount > 0)
          .map((r) => ({ r, days: daysUntil(r.needDate) }))
          .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

        const alerts = undecided.map(({ r, days }): ModuleAlert => ({
          id: `purchase.rfq.undecided.${r.rfqNo}`,
          // Inside the need date it is urgent: the material now cannot arrive on time even
          // if the award is signed this afternoon.
          severity: days !== null && days <= 7 ? "urgent" : "attention",
          title:
            days !== null && days < 0
              ? `${r.rfqNo} is unawarded and the need date has passed`
              : `${r.rfqNo} has ${r.quotedCount} quotes and no award`,
          body: `${r.title} — ${r.quotedCount} of ${r.invitedCount} suppliers have answered and nobody has been chosen. Material is needed ${date(r.needDate)}.`,
          href: `/sourcing/detail/${r.id}`,
          at: r.needDate ?? undefined,
          evidence: `Request ${r.rfqNo} is in evaluation with ${r.quotedCount} recorded quote(s); need date ${date(r.needDate)}.`,
        }));

        if (alerts.length <= ALERT_CAP) return alerts;
        return [
          ...alerts.slice(0, ALERT_CAP),
          {
            id: "purchase.rfq.undecided.more",
            severity: "attention",
            title: `${alerts.length} requests have quotes and no award`,
            body: `The ${ALERT_CAP} closest to their need date are listed above.`,
            href: "/sourcing/rfqs",
            evidence: `Counted across the ${alerts.length} matching requests on this page of GET /purchase/rfqs.`,
          },
        ];
      },
    },
  ],
};
