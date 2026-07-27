import type { ModuleManifest } from "@spine/registry/manifest";
import { administrationApi } from "./api";

/**
 * Administration's list endpoints answer `{data: […]}`. A dashboard tile is decorative, so
 * every reducer below narrows rather than casts: an unexpected shape returns null and the
 * tile silently disappears rather than throwing on the page it decorates.
 */
function envelopeRows(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    const inner = (data as { data?: unknown; items?: unknown });
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

/**
 * ADMINISTRATION (HEXA).
 *
 * The control plane: who may do what, what the law is counting down, and the evidence that
 * the record has not been edited. It sits late in the sidebar (order 100) because almost
 * nobody opens it daily — and everything in it is privileged, so almost nobody can.
 */
export const administrationManifest: ModuleManifest = {
  key: "administration",
  name: "Administration",
  summary: "Access, statutory clocks, tamper-evidence and the platform's own settings.",
  department: "HEXA",
  icon: "Settings",
  licenceKey: "administration",
  order: 100,
  nav: [
    {
      label: "Roles & access",
      path: "roles",
      permission: "admin.access.read",
      icon: "KeyRound",
    },
    {
      label: "Segregation of duties",
      path: "segregation",
      permission: "admin.access.read",
      icon: "Split",
    },
    {
      label: "Security posture",
      path: "posture",
      permission: "admin.access.read",
      icon: "ShieldCheck",
    },
    {
      label: "Security incidents",
      path: "incidents",
      permission: "admin.incident.write",
      icon: "ShieldAlert",
    },
    {
      label: "Privacy requests",
      path: "privacy",
      permission: "admin.dsr.write",
      icon: "UserCog",
    },
    {
      label: "Audit trail",
      path: "audit",
      permission: "admin.audit.read",
      icon: "ScrollText",
    },
    {
      label: "Licence & settings",
      path: "licence",
      permission: "admin.settings.write",
      icon: "BadgeCheck",
    },
  ],
  screens: {
    roles: () => import("./screens/roles"),
    segregation: () => import("./screens/segregation"),
    posture: () => import("./screens/posture"),
    incidents: () => import("./screens/incidents"),
    privacy: () => import("./screens/privacy"),
    audit: () => import("./screens/audit"),
    licence: () => import("./screens/licence"),
  },
  /**
   * The three things a compliance officer checks before opening anything: is a statutory
   * clock running, is anybody holding two roles they should not, and did the record last
   * verify as unedited. Everything else in this module is looked at when there is a reason.
   *
   * Each tile carries the permission the endpoint itself enforces, so an operator who cannot
   * open Incidents never causes the request — the figure is not fetched and not drawn.
   */
  signals: [
    {
      label: "Clocks running",
      // Exactly what GET /admin/incidents enforces. Reading the incident register is a
      // privileged act: it is the list of the times this company was attacked.
      permission: "admin.incident.write",
      path: administrationApi.incidentsPath,
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows) return null;
        // `status` is the CLOCK's verdict, computed server-side against the six-hour CERT-In
        // deadline — not the handling status. `on_track` and `urgent` both mean a deadline is
        // still ahead and unmet.
        const running = rows.filter((r) => {
          const s = str(r, "status");
          return s === "on_track" || s === "urgent";
        }).length;
        const breached = rows.filter((r) => field(r, "breached") === true).length;
        return {
          value: String(running),
          hint:
            breached > 0
              ? `${breached} past the CERT-In deadline`
              : rows.length === 0
                ? "No incident on record"
                : `${rows.length} incident${rows.length === 1 ? "" : "s"} on record`,
          tone: breached > 0 ? "bad" : running > 0 ? "warn" : "ok",
        };
      },
    },
    {
      label: "SoD conflicts",
      permission: "admin.access.read",
      path: administrationApi.sodFindingsPath,
      // The same default the Segregation screen opens on: unresolved ones only. A closed
      // finding is history, not a headline.
      query: { status: "open" },
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows) return null;
        const critical = rows.filter((r) => str(r, "riskLevel") === "critical").length;
        return {
          value: String(rows.length),
          hint:
            critical > 0
              ? `${critical} critical — one person, both halves`
              : rows.length === 0
                ? "Nobody holds a conflicting pair"
                : "None critical",
          tone: critical > 0 ? "bad" : rows.length > 0 ? "warn" : "ok",
        };
      },
    },
    {
      label: "Audit chain",
      permission: "admin.audit.read",
      path: administrationApi.verificationsPath,
      // The tamper-evident log itself, not the AI action chain — they are separate chains and
      // averaging their verdicts would hide a break in either.
      query: { chain: "audit_log" },
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows) return null;
        // The endpoint returns newest first, so the head is the last verification run.
        const latest = rows[0];
        if (latest === undefined) {
          // Never checked is a real answer, and a different one from "checked and intact".
          return {
            value: "Unverified",
            hint: "No verification on record yet",
            tone: "warn",
          };
        }
        const intact = field(latest, "intact") === true;
        const checked = field(latest, "rowsChecked");
        const breakKind = str(latest, "breakKind").replace(/_/g, " ");
        return {
          value: intact ? "Intact" : "Broken",
          hint: intact
            ? `${typeof checked === "number" ? checked : "?"} rows re-hashed, no break`
            : breakKind
              ? `${breakKind} — the record was edited`
              : "A break was found in the chain",
          tone: intact ? "ok" : "bad",
        };
      },
    },
  ],
};
