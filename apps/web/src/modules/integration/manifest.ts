import type { ModuleManifest } from "@spine/registry/manifest";
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
    },
    {
      label: "Flows",
      path: "flows",
      permission: "integration.flow.read",
      icon: "Workflow",
    },
    {
      label: "Dead letters",
      path: "dead-letters",
      permission: "integration.message.read",
      icon: "MailWarning",
    },
    {
      label: "Statutory filings",
      path: "filings",
      permission: "integration.statutory.read",
      icon: "FileCheck",
    },
    {
      label: "Webhooks",
      path: "webhooks",
      permission: "integration.webhook.manage",
      icon: "Webhook",
    },
  ],
  screens: {
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
};
