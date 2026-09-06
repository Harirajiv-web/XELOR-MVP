import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { date, humanise, inr, inrShort } from "@spine/format";
import { EXPIRING_SOON_DAYS, daysUntil, sumAmounts } from "./api";

/* ---------------------- what the dashboard tiles read ----------------------- */

/**
 * A quotation stops being anybody's problem once it has been answered or converted. The same
 * set the list screen treats as live — a dashboard and the list it links to must not disagree
 * about what "still out there" means.
 */
const SETTLED = new Set(["accepted", "rejected", "superseded", "converted"]);

/** The journey a price makes, so a composition reads in the order work travels. */
const PIPELINE = ["draft", "sent", "accepted", "converted", "rejected", "superseded"];

function stage(status: string): number {
  const i = PIPELINE.indexOf(status);
  return i === -1 ? PIPELINE.length : i;
}

/**
 * Only what the tiles and the watches actually read, so nothing here depends on a field it
 * does not use. Every one of these is a column `GET /sales/quotations` genuinely returns —
 * `QuotationService.list` builds exactly this row and nothing more.
 */
interface QuoteFact {
  id: string;
  quoteNo: string;
  customerName: string | null;
  quoteDate: string | null;
  validUntil: string | null;
  status: string;
  grandTotal: string;
  convertedSoNo: string | null;
  expired: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * The cursor envelope, in all three spellings that exist in this codebase (`items`, `data`,
 * or a bare array). `reduce` is handed `unknown`, and a shape it does not recognise must
 * produce `null` rather than a guess — the tile then vanishes instead of showing a wrong
 * number, which is the right trade for something decorative.
 */
function pageRows(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data as unknown[];
  if (!isRecord(data)) return null;
  if (Array.isArray(data.items)) return data.items as unknown[];
  if (Array.isArray(data.data)) return data.data as unknown[];
  return null;
}

function hasMorePages(data: unknown): boolean {
  return isRecord(data) && typeof data.nextCursor === "string" && data.nextCursor !== "";
}

function quoteFacts(data: unknown): QuoteFact[] | null {
  const raw = pageRows(data);
  if (raw === null) return null;
  const out: QuoteFact[] = [];
  for (const row of raw) {
    // One unrecognisable row means the endpoint is not what this tile was written against, so
    // the whole figure is abandoned rather than quietly computed from a subset of it.
    if (!isRecord(row) || typeof row.status !== "string") return null;
    out.push({
      id: typeof row.id === "string" ? row.id : "",
      quoteNo: typeof row.quoteNo === "string" ? row.quoteNo : "",
      customerName: typeof row.customerName === "string" ? row.customerName : null,
      quoteDate: typeof row.quoteDate === "string" ? row.quoteDate : null,
      validUntil: typeof row.validUntil === "string" ? row.validUntil : null,
      status: row.status,
      grandTotal: typeof row.grandTotal === "string" ? row.grandTotal : "0",
      convertedSoNo: typeof row.convertedSoNo === "string" ? row.convertedSoNo : null,
      expired: row.expired === true,
    });
  }
  return out;
}

/* ------------------------- what the watches read ---------------------------- */

/**
 * WHAT QUOTATIONS WATCHES FOR, AND WHY IT IS ARITHMETIC.
 *
 * Two watches, both reading the endpoint the list screen reads, both gated on the permission
 * that endpoint enforces. The alert centre issues ONE request for the pair, because it
 * deduplicates by path and query before it fetches.
 *
 * Every verdict below is a comparison, in this file, against a date or a status column:
 *
 *   THE PRICE IS ABOUT TO LAPSE   `daysUntil(validUntil)` between 0 and seven on a quotation
 *                                 still in `sent`. After that date the server refuses the
 *                                 customer's acceptance outright, so this is the window in
 *                                 which a phone call is still worth making.
 *   THE PRICE HAS LAPSED          the same date, behind us. Nothing can be done to the
 *                                 document; it needs re-pricing, and somebody should know
 *                                 that a live conversation quietly ended.
 *   AGREED BUT NOT ORDERED        `status === "accepted"` with no `convertedSoNo`. The
 *                                 customer has said yes and the plant has not started: no
 *                                 demand, no plan, no material, and a delivery date being
 *                                 spent while nobody is making anything.
 *
 * No model is asked whether a quotation is about to expire (DECISIONS-V2 §4). A model asked
 * to judge will occasionally decide a thing is fine because the sentence read better, and an
 * alert that is wrong in the reassuring direction is worse than no alert.
 *
 * ONE HONEST LIMIT, stated rather than hidden: the endpoint caps `limit` at 100, so a tenant
 * with more quotations is watched on its first page. It orders OLDEST FIRST, which happens to
 * be the right page — the oldest quotations are where the lapsed prices are — and the summary
 * line says so when the page is full.
 */
const ALERT_CAP = 8;

/** Enough of a row to name a document and link to it. Anything less cannot be an alert. */
function isNameable(q: QuoteFact): boolean {
  return q.quoteNo !== "" && q.id !== "";
}

/** "3S Precision Parts" — or an honest stand-in when the name did not come. */
function who(q: QuoteFact): string {
  return q.customerName ?? "the customer";
}

/** The row this was read from, named so a person can go and check it. */
function quoteEvidence(q: QuoteFact): string {
  const holds = q.validUntil ? `price held until ${date(q.validUntil)}` : "no validity date on file";
  return `Quotation ${q.quoteNo} for ${who(q)}, ${holds}, ${inr(q.grandTotal)} incl. GST.`;
}

/**
 * The worst few, plus one line admitting how many more there are.
 *
 * NEVER A SILENT TRUNCATION. A panel that shows eight of twenty-three and says nothing is
 * teaching somebody that eight is the whole problem, and they will plan their day on it.
 */
function capped(
  all: readonly ModuleAlert[],
  summary: { id: string; title: (total: number) => string; body: string; href: string },
): readonly ModuleAlert[] {
  if (all.length <= ALERT_CAP) return all;
  return [
    ...all.slice(0, ALERT_CAP),
    {
      id: summary.id,
      severity: "attention",
      title: summary.title(all.length),
      body: summary.body,
      href: summary.href,
      evidence: `Counted across the ${all.length} matching quotations on this page of GET /sales/quotations.`,
    },
  ];
}

/**
 * QUOTATIONS (MICA).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * It sits immediately before Sales on purpose: a quotation is the step before an order, and
 * the sidebar reads in the order the work actually travels. It is licensed under `sales`
 * rather than a key of its own, because nobody buys the ability to quote a price without the
 * ability to take the order it becomes.
 *
 * `detail` is hidden: it is reached by clicking a row on `list`, so it needs a route but not
 * a menu entry. `/quotation/detail/<id>` resolves to it with the id arriving as
 * `props.params[0]`.
 */
export const quotationManifest: ModuleManifest = {
  key: "quotation",
  name: "Quotations",
  summary: "Prices offered to customers, how long each one holds, and which of them became orders.",
  department: "MICA",
  icon: "FileText",
  licenceKey: "sales",
  order: 38,
  nav: [
    {
      label: "Quotations",
      path: "list",
      permission: "sales.quotation.read",
      icon: "FileText",
      description:
        "Every price this plant has offered a customer, one row each, with the date the price stops being valid, how far the quotation has travelled and the order number it became. The expiry is worked out from the date on each read rather than stored, so a quotation goes stale by a day passing and not by anyone doing anything. You can raise and send a quotation here; the price on a sent one is never edited — re-pricing creates a new revision, so what the customer was actually shown stays readable.",
    },
    {
      label: "Quotation",
      path: "detail",
      permission: "sales.quotation.read",
      icon: "FileText",
      hidden: true,
    },
  ],
  screens: {
    list: () => import("./screens/list"),
    detail: () => import("./screens/detail"),
  },
  /**
   * WHAT THE DEPARTMENT DASHBOARD SHOWS FOR QUOTATIONS.
   *
   * Somebody glancing at MICA is asking one question of this module — WHAT HAVE WE OFFERED
   * AND IS IT ABOUT TO GO COLD. So the two headlines are the value still out for decision and
   * the count whose price lapses within the week, with the pipeline underneath as a shape.
   *
   * All three read `GET /sales/quotations`, the same endpoint the list screen reads, under
   * the same permission the endpoint enforces. Nothing here is a new query invented for a tile.
   */
  signals: [
    {
      label: "Out for decision",
      permission: "sales.quotation.read",
      path: "/sales/quotations",
      // The API caps `limit` at 100 and rejects more. It orders OLDEST first, so on a tenant
      // with more than a hundred quotations this is the first page and not the whole book —
      // the hint says "the first N" in that case rather than implying it counted everything.
      query: { limit: 100 },
      reduce: (data): SignalValue | null => {
        const rows = quoteFacts(data);
        if (rows === null) return null;
        if (rows.length === 0) {
          return { value: "0", hint: "No quotations raised yet", tone: "neutral" };
        }
        const live = rows.filter((q) => !SETTLED.has(q.status));
        const value = inrShort(sumAmounts(live.map((q) => q.grandTotal)));
        const scope = hasMorePages(data) ? `of the first ${rows.length}` : `of ${rows.length}`;
        return {
          value: String(live.length),
          hint: `${scope} quotations · ${value} incl. GST awaiting an answer`,
          tone: "neutral",
          fraction: live.length / rows.length,
        };
      },
    },
    {
      label: "Price about to lapse",
      permission: "sales.quotation.read",
      path: "/sales/quotations",
      query: { limit: 100 },
      reduce: (data): SignalValue | null => {
        const rows = quoteFacts(data);
        if (rows === null) return null;
        const sent = rows.filter((q) => q.status === "sent");
        if (sent.length === 0) {
          return { value: "0", hint: "Nothing sent and waiting", tone: "neutral" };
        }
        // Already gone is counted separately from about to go: one is a phone call today,
        // the other is a re-price, and a single amber number would hide which.
        const lapsed = sent.filter((q) => q.expired).length;
        const soon = sent.filter((q) => {
          if (q.expired) return false;
          const days = daysUntil(q.validUntil);
          return days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS;
        }).length;
        return {
          value: String(soon),
          hint:
            lapsed > 0
              ? `within ${EXPIRING_SOON_DAYS} days · ${lapsed} already lapsed unanswered`
              : soon > 0
                ? `of ${sent.length} sent — after the date the customer cannot accept`
                : `All ${sent.length} sent quotations still hold for more than ${EXPIRING_SOON_DAYS} days`,
          tone: lapsed > 0 ? "bad" : soon > 0 ? "warn" : "ok",
          fraction: (soon + lapsed) / sent.length,
        };
      },
    },
    {
      label: "Quotations by status",
      permission: "sales.quotation.read",
      path: "/sales/quotations",
      query: { limit: 100 },
      reduce: (data): SignalValue | null => {
        const rows = quoteFacts(data);
        if (rows === null || rows.length === 0) return null;
        const counts = new Map<string, number>();
        for (const q of rows) counts.set(q.status, (counts.get(q.status) ?? 0) + 1);
        // Pipeline order, not count order: this is a composition of one journey, and reading
        // it in the sequence work actually travels is the whole point of drawing it.
        const series = [...counts.entries()]
          .sort(([sa, ca], [sb, cb]) => stage(sa) - stage(sb) || cb - ca)
          .map(([status, value]) => ({ label: humanise(status), value }));
        return { value: String(rows.length), hint: "quotations loaded", series };
      },
    },
  ],
  /**
   * WHAT QUOTATIONS TELLS EVERYBODY ABOUT, WHETHER OR NOT THEY OPEN IT.
   *
   * See the block above `ALERT_CAP` for the arithmetic. Each `id` is built from the QUOTE
   * NUMBER, so the same lapsing price is the same alert on every poll and "I have read this"
   * survives a refresh — an id carrying a timestamp would re-announce the same quotation
   * every ninety seconds until somebody muted the bell.
   */
  alerts: [
    {
      /**
       * THE PRICE IS RUNNING OUT, OR HAS RUN OUT. Both come from one comparison against
       * `valid_until`, and they are ranked with the ones already gone at the top: those are
       * conversations that ended without anybody noticing.
       */
      permission: "sales.quotation.read",
      path: "/sales/quotations",
      query: { limit: 100 },
      reduce: (data): readonly ModuleAlert[] => {
        const rows = quoteFacts(data);
        if (rows === null) return [];
        const watched = rows
          .filter(isNameable)
          .filter((q) => q.status === "sent")
          .map((q) => ({ q, days: daysUntil(q.validUntil) }))
          .filter(
            (r): r is { q: QuoteFact; days: number } =>
              r.days !== null && r.days <= EXPIRING_SOON_DAYS,
          )
          .sort((a, b) => a.days - b.days);

        const alerts = watched.map(({ q, days }): ModuleAlert => {
          const lapsed = days < 0;
          return {
            id: `sales.quotation.validity.${q.quoteNo}`,
            // Already gone is worth knowing today but cannot be fixed today; running out
            // inside a working day is the one where a phone call still changes the outcome.
            severity: lapsed ? "attention" : days <= 1 ? "urgent" : "attention",
            title: lapsed
              ? `${q.quoteNo} lapsed ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago without an answer`
              : days === 0
                ? `${q.quoteNo} stops being valid today`
                : `${q.quoteNo} stops being valid in ${days} ${days === 1 ? "day" : "days"}`,
            body: lapsed
              ? `${inrShort(Number(q.grandTotal))} offered to ${who(q)} can no longer be accepted — the server refuses an acceptance after the validity date. Re-price it if the conversation is still alive.`
              : `${inrShort(Number(q.grandTotal))} offered to ${who(q)}. After ${date(q.validUntil)} they cannot accept it and the price has to be raised again.`,
            href: `/quotation/detail/${q.id}`,
            // The stamp of the EVENT — the day the price stops holding — never the poll.
            at: q.validUntil ?? undefined,
            evidence: quoteEvidence(q),
          };
        });

        return capped(alerts, {
          id: "sales.quotation.validity.more",
          title: (total) => `${total} quotations are at or past their validity date`,
          body: `The ${ALERT_CAP} closest to lapsing are listed above. The quotations screen shows every one of them with the days remaining.`,
          href: "/quotation/list",
        });
      },
    },
    {
      /**
       * AGREED AND NOT STARTED.
       *
       * The customer has said yes and no order exists, which means planning has never seen
       * the demand, nothing has been bought and nothing is being made — while whatever
       * delivery date was discussed carries on being spent. This is the most expensive gap
       * this module can see, and it is a two-column comparison: status and one null field.
       */
      permission: "sales.quotation.read",
      path: "/sales/quotations",
      query: { limit: 100 },
      reduce: (data): readonly ModuleAlert[] => {
        const rows = quoteFacts(data);
        if (rows === null) return [];
        const agreed = rows
          .filter(isNameable)
          .filter((q) => q.status === "accepted" && q.convertedSoNo === null)
          // Longest agreed first: the one that has been sitting the longest is the one
          // somebody is most likely to be waiting on.
          .sort((a, b) => (a.quoteDate ?? "").localeCompare(b.quoteDate ?? ""));

        const alerts = agreed.map(
          (q): ModuleAlert => ({
            id: `sales.quotation.unconverted.${q.quoteNo}`,
            severity: "urgent",
            title: `${q.quoteNo} was accepted and has not become an order`,
            body: `${who(q)} agreed to ${inrShort(Number(q.grandTotal))} and there is no sales order against it, so planning has never seen the demand and nothing is being made.`,
            href: `/quotation/detail/${q.id}`,
            // When the price was quoted — the clock that has been running on this one.
            at: q.quoteDate ?? undefined,
            evidence: quoteEvidence(q),
          }),
        );

        return capped(alerts, {
          id: "sales.quotation.unconverted.more",
          title: (total) => `${total} accepted quotations have not become orders`,
          body: `The ${ALERT_CAP} oldest are listed above. Every one of them is work this plant has agreed to do and has not started.`,
          href: "/quotation/list",
        });
      },
    },
  ],
};
