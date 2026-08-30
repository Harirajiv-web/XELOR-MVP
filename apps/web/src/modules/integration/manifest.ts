import type { ModuleAlert, ModuleManifest } from "@spine/registry/manifest";
import { integrationApi } from "./api";

/**
 * Two envelope shapes appear here and they are NOT interchangeable: the list endpoints answer
 * `{data: […]}`, while `/integration/dlq` and the window watch answer a summary object. Every
 * reducer narrows rather than casts — a dashboard tile is decorative, so an unexpected shape
 * returns null and the tile disappears instead of throwing on the page it decorates.
 */
function envelopeRows(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    const inner = data as { data?: unknown; items?: unknown };
    if (Array.isArray(inner.data)) return inner.data;
    if (Array.isArray(inner.items)) return inner.items;
  }
  return null;
}

function field(row: unknown, key: string): unknown {
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>)[key] : undefined;
}

function str(row: unknown, key: string): string {
  const v = field(row, key);
  return typeof v === "string" ? v : "";
}

/** A number from a summary object, or null when the field is missing or is not one. */
function count(row: unknown, key: string): number | null {
  const v = field(row, key);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * A list nested under a named key of a summary object — `entries` on the DLQ, `rows` on the
 * window watch. Narrowed the same way as the `{data}` envelopes above, because a watch that
 * throws on an unexpected shape is a hazard rather than a warning.
 */
function listUnder(data: unknown, key: string): readonly unknown[] | null {
  const v = field(data, key);
  return Array.isArray(v) ? v : null;
}

/**
 * The eight worst, plus one line accounting for the rest.
 *
 * Silent truncation is the failure that turns a warning system into a liar: showing eight
 * blocked invoices when there are seventeen tells somebody the problem is half the size it
 * is. The overflow is said out loud, at `attention`, under an id that is stable for "there
 * are more of these" rather than for any single document.
 */
const ALERT_CAP = 8;

function capped(
  all: readonly ModuleAlert[],
  overflow: { id: string; title: (total: number) => string; body: string; href: string },
): readonly ModuleAlert[] {
  if (all.length <= ALERT_CAP) return all;
  return [
    ...all.slice(0, ALERT_CAP),
    {
      id: overflow.id,
      severity: "attention",
      title: overflow.title(all.length),
      body: overflow.body,
      href: overflow.href,
    },
  ];
}

/**
 * `snake_case` category codes as words, without pulling the spine's formatter into a manifest.
 * Deliberately dumb: it lowercases nothing and invents nothing, so an unfamiliar category
 * still reads as itself rather than as a guess.
 */
function words(code: string): string {
  const spaced = code.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * INTEGRATION (HEXA).
 *
 * The edge: everything that leaves the building or arrives from outside it. Two of these
 * screens — Connections and Dead letters — are where an operations person actually lives on
 * a bad morning, which is why both are built to be readable at a glance rather than
 * explored.
 */
export const integrationManifest: ModuleManifest = {
  key: "integration",
  name: "Integration",
  summary: "Connections to the outside world, the flows that use them, and everything that failed to arrive.",
  department: "HEXA",
  icon: "Plug",
  licenceKey: "integration",
  order: 110,
  nav: [
    {
      label: "Connections",
      path: "connections",
      permission: "integration.connector.read",
      icon: "Cable",
      description:
        "Every outside system this plant is wired to, with the circuit breaker's state and the run of consecutive failures that moved it, read straight off the connection record. A connection marked \"fake\" runs the whole pipeline and sends nothing outside the building, and it says so. Below it, the connectors this build ships that nobody has configured yet.",
    },
    {
      label: "Flows",
      path: "flows",
      permission: "integration.flow.read",
      icon: "Workflow",
      description:
        "Each route a document takes out of this system or into it — a sales invoice going for an IRN, punches coming back from the biometric reader — with what triggers it, whether it is a statutory filing, and how many field mappings it carries. A paused flow always shows the reason it was paused, because one with no reason is one nobody dares restart. Flows are started and stopped through the API, not from this screen.",
    },
    {
      label: "Dead letters",
      path: "dead-letters",
      permission: "integration.message.read",
      icon: "MailWarning",
      description:
        "Messages that failed to reach the other end and have stopped being retried. Nothing is discarded — each one arrives here with the reason it failed, what a person should do about it, and whether a replay would be allowed, all decided by a fixed table against the error category rather than by a model. This screen shows the verdict; it deliberately does not offer the replay button.",
    },
    {
      label: "Statutory filings",
      path: "filings",
      permission: "integration.statutory.read",
      icon: "FileCheck",
      description:
        "Invoices still waiting for an IRN, counted against the thirty days each has to get one, and every e-way bill with the validity left on it for the distance it covers. Past thirty days the portal refuses an invoice permanently and the only remedy is a credit note and a re-issue, so this is where that is seen coming. Read-only — filings go out through the flows, not from here.",
    },
    {
      label: "Webhooks",
      path: "webhooks",
      permission: "integration.webhook.manage",
      icon: "Webhook",
      description:
        "Outside systems that have asked to be told when something happens here, with the events each is sent, how many deliveries it has had, and whether it has been auto-paused after a run of failures. There is no column for the signing secret and no field on this endpoint that could carry one — a secret is shown once, at subscription or rotation, and never again.",
    },
    {
      label: "Factory Connect",
      path: "factory-connect",
      permission: "integration.factory-connect.read",
      icon: "RadioTower",
      description:
        "The governed edge between ONYX and robots, AMRs, PLCs and factory sensors. It shows configured gateway and asset bindings, their latest reported heartbeat and evidence, each asset's explicit capability allowlist, and whether the binding is a simulator or an edge deployment. A configured binding or heartbeat is not proof of a physical controller connection; safety-rated control remains inside the controller and safety PLC.",
    },
  ],
  screens: {
    "factory-connect": () => import("./screens/factory-connect"),
    connections: () => import("./screens/connections"),
    flows: () => import("./screens/flows"),
    "dead-letters": () => import("./screens/dead-letters"),
    filings: () => import("./screens/filings"),
    webhooks: () => import("./screens/webhooks"),
  },
  /**
   * What an operations person watches on a bad morning: what did not arrive, whether anything
   * has stopped calling out, and whether an invoice is running out of days to be reported.
   * The dead-letter chart splits the queue by CAUSE because the cause is what decides who
   * fixes it — a validation failure is a data problem, an auth failure is a credential one,
   * and a total on its own tells you neither.
   */
  signals: [
    {
      label: "Dead letters",
      permission: "integration.message.read",
      path: integrationApi.dlqPath,
      // The same default the Dead letters screen opens on: the ones still needing attention.
      query: { status: "new" },
      reduce: (data) => {
        // This endpoint answers the summary object itself, not a `{data}` envelope.
        const total = count(data, "total");
        if (total === null) return null;
        const needsHuman = count(data, "needsHumanFirst") ?? 0;
        const byCategory = field(data, "byCategory");
        const series =
          typeof byCategory === "object" && byCategory !== null && !Array.isArray(byCategory)
            ? Object.entries(byCategory as Record<string, unknown>)
                .flatMap(([code, n]) =>
                  typeof n === "number" && Number.isFinite(n)
                    ? [{ label: words(code), value: n }]
                    : [],
                )
                .sort((a, b) => b.value - a.value)
            : [];
        return {
          value: String(total),
          hint:
            total === 0
              ? "Everything sent has arrived"
              : needsHuman > 0
                ? `${needsHuman} need a person before any replay`
                : `${count(data, "replayableNow") ?? 0} safe to replay`,
          tone: needsHuman > 0 ? "bad" : total > 0 ? "warn" : "ok",
          series,
        };
      },
    },
    {
      label: "Circuits open",
      permission: "integration.connector.read",
      path: integrationApi.connectionsPath,
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows) return null;
        // `open` is the counter-intuitive one: the circuit is open, so nothing is flowing.
        const open = rows.filter((r) => str(r, "circuitState") === "open").length;
        const trialling = rows.filter((r) => str(r, "circuitState") === "half_open").length;
        return {
          value: String(open),
          hint:
            open > 0
              ? `of ${rows.length} connection${rows.length === 1 ? "" : "s"} — calls blocked`
              : trialling > 0
                ? `${trialling} trialling after a failure`
                : `All ${rows.length} calling out normally`,
          tone: open > 0 ? "bad" : trialling > 0 ? "warn" : "ok",
          ...(rows.length > 0 ? { fraction: (open + trialling) / rows.length } : {}),
        };
      },
    },
    {
      label: "Awaiting IRN",
      permission: "integration.statutory.read",
      path: integrationApi.windowWatchPath,
      reduce: (data) => {
        // Also a summary object: `{asOf, watching, blocked, critical, rows, headline}`.
        const watching = count(data, "watching");
        if (watching === null) return null;
        const blocked = count(data, "blocked") ?? 0;
        const critical = count(data, "critical") ?? 0;
        return {
          value: String(watching),
          // `blocked` is the one that cannot be recovered by hurrying: past thirty days an
          // invoice can never be reported, and it needs a credit note and a re-issue.
          hint:
            blocked > 0
              ? `${blocked} past the 30-day window`
              : critical > 0
                ? `${critical} in the last two days`
                : watching === 0
                  ? "Every invoice in scope has an IRN"
                  : "None urgent",
          tone: blocked > 0 ? "bad" : critical > 0 ? "warn" : "ok",
        };
      },
    },
  ],
  /* ========================================================================
     WHAT THIS MODULE INTERRUPTS SOMEBODY FOR.
     ========================================================================

     Integration is the edge, and the edge is where a silent failure costs the most: a
     message that did not arrive looks exactly like a message that was never sent, and
     nobody notices until a customer or a tax officer does.

     Four watches, and each one is a comparison this module can make without asking anybody
     anything. A boolean read off a row (`blocked`, `expired`, `replayAllowed`), a string
     compared to a known state (`circuitState === "open"`), a level the server already
     computed from the invoice date. No model is consulted, and none could be — DECISIONS-V2
     §4 is explicit that AI explains and never decides, and INTEGRATION is the one module in
     the registry that declares no AI feature at all.

     What is deliberately NOT here: a paused flow (it was paused by a person, with a reason,
     and it is on its own screen), a webhook subscriber that auto-paused (nobody in this
     factory is worse off this afternoon), and a licence that has lapsed (enforcement is
     soft on purpose). None of those has a clock, and a bell that rings for things without
     clocks is a bell people turn off.
     ======================================================================== */
  alerts: [
    {
      /* MESSAGES THAT WILL NOT CLEAR THEMSELVES.
         The DLQ is only the messages that already exhausted their retries, so everything
         here is stuck by definition. What is alerted is the subset that a person has to
         touch: a statutory filing that did not go out, an entry the replay guard refuses,
         and one that timed out against a system which may already have acted on it. A
         message that IS safely replayable is left to the queue screen — it has an owner and
         a button, and putting it in the bell would bury the three that do not. */
      permission: "integration.message.read",
      path: integrationApi.dlqPath,
      query: { status: "new" },
      reduce: (data) => {
        // This endpoint answers the summary object itself; the rows are under `entries`.
        const entries = listUnder(data, "entries");
        if (entries === null) return [];
        const stuck = entries.filter(
          (e) =>
            field(e, "isStatutory") === true ||
            field(e, "replayAllowed") === false ||
            field(e, "sideEffectPossible") === true,
        );
        // Statutory first — those are the ones with a regulator at the other end.
        const weight = (e: unknown): number =>
          field(e, "isStatutory") === true
            ? 0
            : field(e, "sideEffectPossible") === true
              ? 1
              : 2;
        const ordered = [...stuck].sort((a, b) => weight(a) - weight(b));
        const alerts = ordered.flatMap((e): readonly ModuleAlert[] => {
          const id = str(e, "id");
          if (!id) return [];
          const flow = str(e, "flowCode") || "an integration flow";
          const category = words(str(e, "category") || "unknown").toLowerCase();
          const statutory = field(e, "isStatutory") === true;
          const mayHaveLanded = field(e, "sideEffectPossible") === true;
          return [
            {
              // The dead-letter row's own id. One stuck message is one alert for as long as
              // it stays stuck, and it goes when somebody replays or resolves it.
              id: `integration.dlq.${id}`,
              severity: statutory ? "critical" : "urgent",
              title: statutory
                ? `A statutory filing on ${flow} never went out`
                : mayHaveLanded
                  ? `${flow} timed out — the far side may already have it`
                  : `${flow} message is stuck and cannot be replayed as it stands`,
              body: statutory
                ? "It failed and has stopped retrying. Statutory deadlines keep running whether the message went or not."
                : mayHaveLanded
                  ? "Check the other end before anything is sent again. A blind replay here is how one document becomes two."
                  : "Retrying will fail identically until the cause is fixed — the queue is holding it rather than hammering the far side.",
              href: "/integration/dead-letters",
              evidence: `Dead letter on flow ${flow}, correlation ${str(e, "correlationId") || "unknown"} — ${category} failure.`,
            },
          ];
        });
        return capped(alerts, {
          id: "integration.dlq.more",
          title: (total) =>
            `${total} dead-lettered messages need a person — the ${ALERT_CAP} most serious are listed above`,
          body: "The rest are on the Dead letters screen with the same triage attached.",
          href: "/integration/dead-letters",
        });
      },
    },
    {
      /* A CONNECTION THAT HAS STOPPED ANSWERING.
         `open` is the counter-intuitive word: the circuit is open, so nothing flows. The
         breaker only reaches that state after a run of consecutive failures, so this is a
         measurement rather than a guess. `half_open` is left alone — that is the breaker
         letting a trial call through, which is recovery, not an outage. */
      permission: "integration.connector.read",
      path: integrationApi.connectionsPath,
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows) return [];
        const down = rows.filter((r) => str(r, "circuitState") === "open");
        const ordered = [...down].sort(
          (a, b) => (count(b, "consecutiveFailures") ?? 0) - (count(a, "consecutiveFailures") ?? 0),
        );
        const alerts = ordered.flatMap((r): readonly ModuleAlert[] => {
          const name = str(r, "name");
          if (!name) return [];
          const fails = count(r, "consecutiveFailures");
          const fake = str(r, "adapterMode") === "fake";
          return [
            {
              // The connection's own name — one per connection, stable while it is down.
              id: `integration.circuit.${name}`,
              severity: "urgent",
              title: `${name} has tripped its circuit — calls are blocked`,
              body: "Nothing is going out to this system. Anything queued for it will sit until the breaker closes or somebody fixes the far end.",
              href: "/integration/connections",
              evidence: `Connection ${name} (${str(r, "connector") || "connector unknown"}${fake ? ", fake adapter" : ""}) — ${fails ?? "several"} consecutive failures, health ${str(r, "healthStatus") || "unknown"}.`,
            },
          ];
        });
        return capped(alerts, {
          id: "integration.circuit.more",
          title: (total) =>
            `${total} connections have tripped their circuits — the ${ALERT_CAP} with the most failures are listed above`,
          body: "The rest are on the Connections screen with their breaker state.",
          href: "/integration/connections",
        });
      },
    },
    {
      /* THE THIRTY-DAY E-INVOICE CLIFF.
         `blocked` and `alertLevel` are both computed server-side from the invoice's own
         document date against thirty days. Blocked is not a worse warning, it is a different
         outcome: the portal will refuse the invoice for ever and the remedy is a credit note
         and a re-issue, which is a conversation with the customer. Levels 0 and 1 — more
         than five days left — are not put in the bell. */
      permission: "integration.statutory.read",
      path: integrationApi.windowWatchPath,
      reduce: (data) => {
        // Also a summary object: the invoices are under `rows`.
        const rows = listUnder(data, "rows");
        if (rows === null) return [];
        const pressing = rows.filter(
          (r) => field(r, "blocked") === true || (count(r, "alertLevel") ?? 0) >= 2,
        );
        const ordered = [...pressing].sort(
          (a, b) => (count(a, "daysRemaining") ?? 0) - (count(b, "daysRemaining") ?? 0),
        );
        const alerts = ordered.flatMap((r): readonly ModuleAlert[] => {
          const ref = str(r, "invoiceRef");
          if (!ref) return [];
          const blocked = field(r, "blocked") === true;
          const level = count(r, "alertLevel") ?? 0;
          const days = count(r, "daysRemaining");
          return [
            {
              // The invoice number, which is what somebody quotes on the phone.
              id: `integration.einvoice.${ref}`,
              severity: blocked ? "critical" : level >= 3 ? "urgent" : "attention",
              title: blocked
                ? `${ref} can no longer be reported — the thirty-day window has closed`
                : `${ref} has ${days ?? "under 5"} days left to get an IRN`,
              body: blocked
                ? "The portal will refuse it. The only remedy is a credit note and a re-issue, which needs the customer's agreement."
                : "After the window closes the portal refuses the invoice permanently. Fixing a rejection can need the customer, so it does not fit in the last afternoon.",
              href: "/integration/filings",
              // The invoice's own document date — the event the thirty days run from.
              at: str(r, "docDate") || undefined,
              evidence: `Invoice ${ref} dated ${str(r, "docDate").slice(0, 10)}, reportable until ${str(r, "deadlineAt").slice(0, 10) || "—"}, currently ${str(r, "status") || "unreported"}.`,
            },
          ];
        });
        return capped(alerts, {
          id: "integration.einvoice.more",
          title: (total) =>
            `${total} invoices are near or past their reporting window — the ${ALERT_CAP} closest to the cliff are listed above`,
          body: "The full window watch is on the Statutory filings screen.",
          href: "/integration/filings",
        });
      },
    },
    {
      /* AN E-WAY BILL THAT HAS RUN OUT WHILE THE TRUCK IS STILL OUT.
         `expired` is computed from the bill's own generation date and the distance it was
         raised for. It only matters while the bill is still live, so a cancelled one and a
         closed one are excluded — closure is the record that the goods arrived. What is
         left is a consignment whose paperwork has lapsed in transit, which is a detention
         risk today, and an extension is only possible while a bill is still valid. */
      permission: "integration.statutory.read",
      path: integrationApi.ewayBillPath,
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows) return [];
        const lapsed = rows.filter(
          (r) =>
            field(r, "expired") === true &&
            str(r, "closureStatus") !== "closed" &&
            str(r, "status") !== "cancelled",
        );
        const ordered = [...lapsed].sort(
          (a, b) => Date.parse(str(a, "validUpto")) - Date.parse(str(b, "validUpto")),
        );
        const alerts = ordered.flatMap((r): readonly ModuleAlert[] => {
          const ref = str(r, "shipmentRef");
          if (!ref) return [];
          return [
            {
              // The shipment reference — stable, and the number the driver is carrying.
              id: `integration.ewb.${ref}`,
              severity: "critical",
              title: `E-way bill for ${ref} has expired and the trip is not closed`,
              body: "A vehicle moving on an expired e-way bill can be detained and the consignment penalised. Extension is only possible while a bill is still valid, so this one cannot be extended.",
              href: "/integration/filings",
              // When it lapsed, not when we noticed.
              at: str(r, "validUpto") || undefined,
              evidence: `Shipment ${ref}, bill ${str(r, "ewbNo") || "no number"} on ${str(r, "portalUsed") === "ewb2" ? "the secondary portal" : "the primary portal"}, ${count(r, "distanceKm") ?? "?"} km, valid until ${str(r, "validUpto").slice(0, 10)}.`,
            },
          ];
        });
        return capped(alerts, {
          id: "integration.ewb.more",
          title: (total) =>
            `${total} e-way bills have expired without being closed — the ${ALERT_CAP} oldest are listed above`,
          body: "The rest are on the Statutory filings screen with their validity.",
          href: "/integration/filings",
        });
      },
    },
  ],
};
