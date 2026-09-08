import type { ModuleAlert, ModuleManifest } from "@spine/registry/manifest";
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

/** A number from a row, or null when the field is absent or is not a finite number. */
function num(row: unknown, key: string): number | null {
  const v = field(row, key);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The eight worst, plus one line accounting for the rest.
 *
 * Truncating silently is the failure that turns a warning system into a liar: a panel that
 * shows eight overdue filings when there are seventeen has told somebody the problem is
 * half the size it is. So the overflow gets said out loud, at `attention`, with an id that
 * is stable for "there are more of these" rather than for any one document.
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
      description:
        "Every role this company has defined, with the number of permissions each carries and the number of people holding it, both counted from the grant records. Nobody is given a permission directly — access always arrives through a role, so this list is the whole of who can do what. You cannot grant or revoke here; this is the list an access review is read from.",
    },
    {
      label: "Segregation of duties",
      path: "segregation",
      permission: "admin.access.read",
      icon: "Split",
      description:
        "People who hold two roles the rulebook keeps apart — raising a purchase order and approving it, or creating a vendor and paying it. The findings come from the last scan over the role grants; the rulebook below shows which pairs conflict and whether the system refuses the grant or only warns. Every verdict here is produced by the rules, never by a model.",
    },
    {
      label: "Security posture",
      path: "posture",
      permission: "admin.access.read",
      icon: "ShieldCheck",
      description:
        "One reading of whether the parts that protect everything else are working: users signed in without a second factor, live sessions, recent failed logins, the licence, and whether any backup has ever been proved to restore without breaking the audit chain. The healthy-or-not sentence at the top is the server's own verdict, counted from those records — the screen does not re-decide it.",
    },
    {
      label: "Security incidents",
      path: "incidents",
      permission: "admin.incident.write",
      icon: "ShieldAlert",
      description:
        "Every security incident on record with its two statutory clocks: six hours to report to CERT-In and seventy-two to intimate the Data Protection Board when personal data is involved. Both are counted from the moment of detection and run in parallel, so an incident reported late still reads as late — that cannot be edited out. Incidents are recorded through the API; this screen only reads them.",
    },
    {
      label: "Privacy requests",
      path: "privacy",
      permission: "admin.dsr.write",
      icon: "UserCog",
      description:
        "Requests from people about their own data — see it, correct it, erase it — each with the ninety-day statutory window counted from the day it arrived. Below is the consent ledger saying on what basis each person's data is held, which is what decides whether an erasure can lawfully be refused. People appear by reference only, never by name.",
    },
    {
      label: "Audit trail",
      path: "audit",
      permission: "admin.audit.read",
      icon: "ScrollText",
      description:
        "Not the audit trail itself, but the record of every occasion somebody checked it: which entry numbers were re-hashed, how many rows were read, and whether a break was found. A break is named by kind — a row edited in place, a row replaced, or a row deleted — because those are three different conversations. An empty list means nobody has ever verified the chain, not that it is intact.",
    },
    {
      label: "Licence & settings",
      path: "licence",
      permission: "admin.settings.write",
      icon: "BadgeCheck",
      description:
        "What this company has bought and how many of its seats are in use, the platform settings that carry a statutory minimum with the statute named beside the number, which optional features are switched on, and the backup jobs. Licence enforcement is soft: being over seats or past the expiry date is shown here loudly and stops nothing on the shop floor.",
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
  /* ========================================================================
     WHAT THIS MODULE INTERRUPTS SOMEBODY FOR.
     ========================================================================

     Administration is a control plane, and most of what it knows is a STANDING risk rather
     than a today one: somebody holding two conflicting roles, a user without a second
     factor, a licence over its seat count. None of those change between nine and five, and
     none of them are put in the bell — a panel that reports the same unchanging fact every
     morning is a panel people stop opening, and it takes the real warnings with it.

     Three things here genuinely have a clock, and all three are the law's clock rather than
     ours: the six hours CERT-In gives from detection, the ninety days a person's own privacy
     request gets, and the moment a verification says the record itself was altered. Every
     verdict below is a stored date compared with now, or a stored boolean read as it is.
     ======================================================================== */
  alerts: [
    {
      /* THE SIX-HOUR CERT-IN CLOCK.
         `status` is the CLOCK's own verdict, computed server-side from `detectedAt` against
         six hours — not the handling status, which is `recordStatus`. Reading the wrong one
         would show a closed incident as urgent and an open one as settled. */
      permission: "admin.incident.write",
      path: administrationApi.incidentsPath,
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows) return [];
        const open = rows.filter((r) => {
          const s = str(r, "status");
          return s === "breached" || s === "urgent" || s === "on_track";
        });
        // Worst first: past the deadline, then inside the last two hours, then still running.
        const rank: Record<string, number> = { breached: 0, urgent: 1, on_track: 2 };
        const ordered = [...open].sort(
          (a, b) => (rank[str(a, "status")] ?? 9) - (rank[str(b, "status")] ?? 9),
        );
        const alerts = ordered.flatMap((r): readonly ModuleAlert[] => {
          const no = str(r, "incidentNo");
          if (!no) return [];
          const status = str(r, "status");
          const hours = num(r, "certInHoursRemaining");
          const detected = str(r, "detectedAt");
          const pii = field(r, "piiAffected") === true;
          const late = hours !== null ? Math.abs(hours) : null;
          const severity: ModuleAlert["severity"] =
            status === "breached" ? "critical" : status === "urgent" ? "urgent" : "attention";
          return [
            {
              // The incident number. Stable for the life of the incident, which is what lets
              // "I have read this" survive the next poll.
              id: `admin.incident.${no}`,
              severity,
              title:
                status === "breached"
                  ? `${no} is past its CERT-In deadline${late !== null ? ` by ${late} h` : ""}`
                  : status === "urgent"
                    ? `${no} must reach CERT-In within ${late ?? "2"} h`
                    : `${no} — CERT-In clock running, ${late ?? "?"} h left`,
              body:
                status === "breached"
                  ? "Report now and record the delay. The lateness stays in the record and cannot be edited out."
                  : pii
                    ? "Six hours from detection to CERT-In, and personal data is involved, so the Data Protection Board runs its own seventy-two in parallel."
                    : "Six hours from detection, not from confirmation. The clock does not stop while the incident is being understood.",
              href: "/administration/incidents",
              // The event, not the poll: both clocks are measured from detection.
              at: detected || undefined,
              evidence: `Incident ${no} — ${str(r, "title") || str(r, "category")}, detected ${detected.slice(0, 16).replace("T", " ")}.`,
            },
          ];
        });
        return capped(alerts, {
          id: "admin.incident.more",
          title: (total) =>
            `${total} incidents have a CERT-In clock running — the ${ALERT_CAP} nearest their deadline are listed above`,
          body: "The remaining ones are on the Security incidents screen with their own countdowns.",
          href: "/administration/incidents",
        });
      },
    },
    {
      /* THE NINETY-DAY PRIVACY CLOCK.
         `status` is again the clock, computed from `receivedAt`. Only two states are put in
         the bell: past the window, and inside the last week of it. "Approaching" starts at
         thirty days out, which is correct for a work queue and far too early for an alarm. */
      permission: "admin.dsr.write",
      path: administrationApi.dsrPath,
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows) return [];
        const pressing = rows.filter((r) => {
          const status = str(r, "status");
          if (status === "overdue") return true;
          const days = num(r, "daysRemaining");
          return status === "approaching" && days !== null && days <= 7;
        });
        const ordered = [...pressing].sort(
          (a, b) => (num(a, "daysRemaining") ?? 0) - (num(b, "daysRemaining") ?? 0),
        );
        const alerts = ordered.flatMap((r): readonly ModuleAlert[] => {
          const no = str(r, "requestNo");
          if (!no) return [];
          const days = num(r, "daysRemaining");
          const overdue = str(r, "status") === "overdue";
          return [
            {
              // The request number. Never the data-principal's reference — this line is read
              // in a topbar, and who asked about their own privacy is itself personal data.
              id: `admin.dsr.${no}`,
              severity: overdue ? "critical" : "urgent",
              title: overdue
                ? `${no} is past its ninety-day answer date${days !== null ? ` by ${Math.abs(days)} days` : ""}`
                : `${no} must be answered within ${days ?? 7} days`,
              body: overdue
                ? "The statutory window has closed. Answer and record why it was late — a missed data-principal request is a reportable failure under DPDP."
                : "Assembling one person's data across a manufacturing ERP is not a same-day job. Start it now rather than on the last day.",
              href: "/administration/privacy",
              at: str(r, "receivedAt") || undefined,
              evidence: `Request ${no} (${str(r, "requestType") || "request"}) received ${str(r, "receivedAt").slice(0, 10)}, due ${str(r, "dueAt").slice(0, 10)}.`,
            },
          ];
        });
        return capped(alerts, {
          id: "admin.dsr.more",
          title: (total) =>
            `${total} privacy requests are overdue or nearly due — the ${ALERT_CAP} closest are listed above`,
          body: "The rest are on the Privacy requests screen with their own ninety-day clocks.",
          href: "/administration/privacy",
        });
      },
    },
    {
      /* THE RECORD SAYING IT WAS ALTERED.
         Only the MOST RECENT verification of the audit chain is judged. The endpoint answers
         newest first, so `rows[0]` is the current verdict — and judging older rows too would
         keep announcing a break that has since been investigated and re-verified, which is
         precisely how an alarm gets muted. */
      permission: "admin.audit.read",
      path: administrationApi.verificationsPath,
      query: { chain: "audit_log" },
      reduce: (data) => {
        const rows = envelopeRows(data);
        if (!rows || rows.length === 0) return [];
        const latest = rows[0];
        // `intact === true` is the only reassuring answer. Anything else — false, or a field
        // that is not there at all — is not read as "fine".
        if (field(latest, "intact") !== false) return [];
        const id = str(latest, "id");
        const kind = str(latest, "breakKind").replace(/_/g, " ");
        const seq = num(latest, "firstBreakSeq");
        return [
          {
            // The verification row's own id. One check, one alert, however many times it is
            // polled — and a fresh check that finds the chain intact makes it disappear.
            id: `admin.audit.break.${id || "latest"}`,
            severity: "critical",
            title: `The audit trail failed its last check${kind ? ` — ${kind}` : ""}`,
            body: "An entry between the checked numbers was altered, replaced or removed. Statutory retention rests on this chain, so nothing else in the system should be trusted until it is explained.",
            href: "/administration/audit",
            at: str(latest, "verifiedAt") || undefined,
            evidence: `Verification of audit_log, entries ${num(latest, "fromSeq") ?? "?"}–${num(latest, "toSeq") ?? "?"}${seq !== null ? `, first break at ${seq}` : ""}, checked ${str(latest, "verifiedAt").slice(0, 16).replace("T", " ")}.`,
          },
        ];
      },
    },
  ],
};
