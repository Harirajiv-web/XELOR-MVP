import type { ModuleManifest } from "@spine/registry/manifest";
import { humanise } from "@spine/format";

/* ---------------------- what the dashboard tiles read ----------------------- */

/** Everything the desk still owes somebody an answer on — the queue screen's own filter. */
const OPEN_STATUSES = "new,triaged,in_progress,pending_customer,reopened";

/**
 * Worst first. A chart of clocks should open with the ones already broken, not with
 * whichever bucket happens to be biggest.
 *
 * These are the SLA ENGINE'S OWN WORDS (`slaChip`), not a vocabulary invented here — which
 * matters most for "Not triaged": an untriaged ticket carries no policy and therefore no
 * promise, and its stored state reads `on_track` even though nobody has made that
 * assertion. Bucketing by the engine's label keeps those tickets out of "On track" instead
 * of flattering the picture with them.
 */
const SEVERITY = [
  "Response overdue",
  "Resolution overdue",
  "At risk",
  "On track",
  "Paused — awaiting your reply",
  "Met",
  "Not triaged",
];

function severity(label: string): number {
  const i = SEVERITY.indexOf(label);
  return i === -1 ? SEVERITY.length : i;
}

/** Only what the tiles actually read. */
interface TicketFact {
  slaState: string;
  slaLabel: string;
  owner: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * `GET /csp/tickets` answers with a BARE ARRAY — every CSP list endpoint does. `reduce` is
 * handed `unknown`, so anything that is not the shape this was written against returns
 * `null` and the tile simply does not appear. A decorative figure must never be able to
 * break the page it decorates, and a wrong figure is worse than an absent one.
 */
function ticketFacts(data: unknown): TicketFact[] | null {
  if (!Array.isArray(data)) return null;
  const out: TicketFact[] = [];
  for (const row of data as unknown[]) {
    if (!isRecord(row)) return null;
    const sla = row.sla;
    if (!isRecord(sla) || typeof sla.state !== "string") return null;
    const chip = sla.chip;
    const label =
      isRecord(chip) && typeof chip.label === "string" && chip.label !== ""
        ? chip.label
        : humanise(sla.state);
    out.push({
      slaState: sla.state,
      slaLabel: label,
      owner: typeof row.owner === "string" && row.owner !== "" ? row.owner : null,
    });
  }
  return out;
}

/**
 * SERVICE / CSP (MICA, Module 08).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * `ticket` is hidden: it is reached by clicking a row on `tickets`, so it needs a route but
 * not a menu entry. `/csp/ticket/TKT-2627-00031` resolves to it with the ticket number
 * arriving as `props.params[0]`.
 *
 * The spare-request screen is keyed `spares`, not `spare-requests`. A hyphenated key must
 * be quoted to be legal JavaScript, and `module-check` matches screen keys with a regular
 * expression that only accepts an UNQUOTED identifier — so a hyphenated nav path silently
 * reports as "has no screen registered". The label is what users read; the key is what the
 * gate can see.
 */
export const cspManifest: ModuleManifest = {
  key: "csp",
  name: "Service",
  summary: "Service tickets, their SLA clocks, spare requests and what customers said afterwards.",
  department: "MICA",
  icon: "Headset",
  licenceKey: "csp",
  order: 50,
  nav: [
    {
      label: "Tickets",
      path: "tickets",
      permission: "csp.ticket.read",
      icon: "Ticket",
      description:
        "Every service request the desk is holding, with the clock the customer was promised. The clock starts when the customer called, not when somebody got round to typing it in — so a ticket entered late is already showing time spent, which is the honest figure.",
    },
    {
      label: "Ticket",
      path: "ticket",
      permission: "csp.ticket.read",
      icon: "Ticket",
      hidden: true,
    },
    {
      label: "Spare requests",
      path: "spares",
      permission: "csp.ticket.read",
      icon: "PackageSearch",
      description:
        "Parts asked for on service jobs, with the entitlement engine's verdict on whether the customer pays or the warranty does. The verdict is worked out from the contract dates and the part, not decided by whoever raised the request.",
    },
    {
      label: "Service dashboard",
      path: "dashboard",
      permission: "csp.dashboard.read",
      icon: "Gauge",
      description:
        "How the desk is doing right now: what is open, what is past its promise, what keeps breaking, and how often the assistant's suggestions have to be corrected. That last figure is deliberately on the same screen as the rest — a suggestion engine nobody is scoring is a suggestion engine nobody should trust.",
    },
    {
      label: "Customer satisfaction",
      path: "csat",
      permission: "csp.dashboard.read",
      icon: "Smile",
      description:
        "What customers said after their ticket was closed, how many of them bothered to reply, and how many low scores are still waiting on somebody. The response rate is shown beside the score because an excellent average from four replies is not an excellent service.",
    },
  ],
  screens: {
    tickets: () => import("./screens/tickets"),
    ticket: () => import("./screens/ticket"),
    spares: () => import("./screens/spares"),
    dashboard: () => import("./screens/dashboard"),
    csat: () => import("./screens/csat"),
  },
  /**
   * WHAT THE DEPARTMENT DASHBOARD SHOWS FOR SERVICE.
   *
   * A service manager glancing at MICA is asking one question — WHAT IS BREACHING. So the
   * two headlines are how much is open and how much of it is already past its promise, with
   * the spread of the clocks underneath.
   *
   * THE ENDPOINT CHOICE IS THE HONEST ONE, and it is not the obvious one. The service
   * dashboard endpoint hands over a ready-made breach count, but that number is read from
   * the stored `sla_state` column — a PROJECTION refreshed by the SLA scanner and by ticket
   * mutations, so between scans it lags reality. The ticket queue, by contrast, evaluates
   * every clock as it answers (`SlaService.evaluate` is pure and writes nothing). These
   * tiles therefore read the queue, and the hints say "as at now" rather than implying a
   * freshness a stored column could not deliver.
   *
   * All three read `GET /csp/tickets` filtered to the open statuses, under `csp.ticket.read`
   * — the permission that endpoint actually enforces, and one an agent holds, so the figures
   * are not reserved to whoever happens to have the dashboard permission.
   */
  signals: [
    {
      label: "Open tickets",
      permission: "csp.ticket.read",
      path: "/csp/tickets",
      query: { status: OPEN_STATUSES },
      reduce: (data) => {
        const rows = ticketFacts(data);
        if (rows === null) return null;
        const unowned = rows.filter((t) => t.owner === null).length;
        return {
          value: String(rows.length),
          hint:
            rows.length === 0
              ? "Nothing open on the desk"
              : unowned > 0
                ? `Not yet resolved or closed · ${unowned} with nobody on them`
                : "Not yet resolved or closed · all have an owner",
          tone: "neutral",
        };
      },
    },
    {
      label: "Past their promise",
      permission: "csp.ticket.read",
      path: "/csp/tickets",
      query: { status: OPEN_STATUSES },
      reduce: (data) => {
        const rows = ticketFacts(data);
        if (rows === null) return null;
        if (rows.length === 0) {
          return { value: "0", hint: "Nothing open on the desk", tone: "ok" };
        }
        // The engine's verdict, never a recomputation of it here: a promise a customer can
        // dispute has to be reconstructible from stored rows, not from a dashboard's guess.
        const breached = rows.filter((t) => t.slaState.startsWith("breached")).length;
        const atRisk = rows.filter((t) => t.slaState === "at_risk").length;
        return {
          value: String(breached),
          hint:
            breached > 0
              ? `of ${rows.length} open · clocks read as at now, not the last scan`
              : atRisk > 0
                ? `${atRisk} of ${rows.length} open are approaching their promise`
                : `All ${rows.length} open clocks inside their promise as at now`,
          tone: breached > 0 ? "bad" : "ok",
          fraction: breached / rows.length,
        };
      },
    },
    {
      label: "Where the clocks stand",
      permission: "csp.ticket.read",
      path: "/csp/tickets",
      query: { status: OPEN_STATUSES },
      reduce: (data) => {
        const rows = ticketFacts(data);
        if (rows === null || rows.length === 0) return null;
        const counts = new Map<string, number>();
        for (const t of rows) counts.set(t.slaLabel, (counts.get(t.slaLabel) ?? 0) + 1);
        const series = [...counts.entries()]
          .sort(([la, ca], [lb, cb]) => severity(la) - severity(lb) || cb - ca)
          .map(([label, value]) => ({ label, value }));
        return { value: String(rows.length), hint: "open tickets", series };
      },
    },
  ],
};
