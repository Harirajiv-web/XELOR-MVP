import type { ModuleAlert, ModuleManifest } from "@spine/registry/manifest";
import { deliveryApi, reconcile } from "./api";

/**
 * DELIVERY & MANAGED SERVICES — getting it live, and keeping it live.
 *
 * ---------------------------------------------------------------------------
 * WHY FIVE OFFERINGS ARE ONE MODULE
 * ---------------------------------------------------------------------------
 * Setup & migration, integration & data operations, factory commissioning, ongoing support
 * and managed IT/OT security were scoped as five separate products. Between them they carry
 * twenty-one capabilities, and TWENTY of those are delivery or partner work: a person on a
 * site, a person on a call, a person reconciling a spreadsheet against a stock ledger.
 * Almost none of it is product code.
 *
 * Splitting them into five modules would therefore have produced five folders of screens
 * describing services rather than performing them, and five separate opportunities to
 * present a description as a capability. They are also not five things a customer
 * experiences: they are one engagement lifecycle, in order — migrate, integrate, commission,
 * support, secure — and the same people do all five.
 *
 * So the module is the LIFECYCLE, and its five screens are its five stages plus the
 * commercial shape that pays for them.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE SOFTWARE ACTUALLY IS HERE
 * ---------------------------------------------------------------------------
 * It is the EVIDENCE SPINE that makes people work repeatable and sellable. Not a simulation
 * of the service. The distinction decides every design choice in this folder:
 *
 *   - Where a record exists, the screen reads it and names the endpoint, so a customer can
 *     check the claim. The connector console is almost entirely this, and it is the most
 *     real screen in the package.
 *   - Where no record exists — coverage hours, escalation names, stop criteria, price lines
 *     — the screen presents the STRUCTURE and says, in a standard notice, that nothing on it
 *     is stored. A tidy template of an SLA looks exactly like an SLA, and that resemblance is
 *     the single largest mis-selling risk in the whole product.
 *
 * NO NEW PERMISSIONS, NO NEW ENDPOINTS, NO MIGRATIONS. Every path this module reads already
 * exists and is already enforced; every permission below is already in the registry and
 * already has routes behind it. That is not a constraint that was worked around — it is the
 * honest shape of the thing. A delivery package whose value depended on new tables would be
 * a delivery package that had quietly become a product.
 *
 * `licenceKey: "integration"` because this is sold with the ability to connect XELOR to what
 * a customer already runs, which is the entitlement `connectivity` and `dataimport` also sit
 * under. It is not licensed separately in this build, and pretending it was would put a
 * fourth gate in front of screens whose whole job is to be looked at during a sale.
 */

/* -------------------------------------------------------------------------- */
/* Small readers. The manifest runs `reduce` inside a try/catch, so these are  */
/* written to return null rather than to trust a shape.                        */
/* -------------------------------------------------------------------------- */

function field(row: unknown, key: string): unknown {
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>)[key] : undefined;
}

function str(row: unknown, key: string): string {
  const value = field(row, key);
  return typeof value === "string" ? value : "";
}

function int(row: unknown, key: string): number {
  const value = field(row, key);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function bool(row: unknown, key: string): boolean {
  return field(row, key) === true;
}

function listOf(data: unknown, key: string): readonly unknown[] | null {
  const value = field(data, key);
  return Array.isArray(value) ? value : null;
}

/** Eight alerts, plus one line accounting for the rest. A bell that scrolls is a bell nobody reads. */
const ALERT_CAP = 8;

export const deliveryManifest: ModuleManifest = {
  key: "delivery",
  name: "Delivery & Managed Services",
  summary:
    "The engagement around the software: discovery and migration, connectors and data operations, commissioning evidence, and the support record. It records what people committed to and what actually happened — it does not staff the service.",
  department: "RELAY",
  icon: "ClipboardCheck",
  licenceKey: "integration",
  // Immediately after Integration (110) and Data import (111): this module operates what
  // those two configure, and reading the three in order is how the lifecycle reads.
  order: 112,
  nav: [
    {
      label: "Discovery & readiness",
      path: "readiness",
      permission: "general.company.read",
      icon: "ClipboardList",
      description:
        "The opening record of an engagement: the named sponsor and who signs data off, the systems register read from the connector catalogue with the bound on each adapter, the pain baseline taken before anything changes, the fixed pilot scope expressed in what can actually be migrated, and the stop criteria. The registers are read from real records and say which endpoint each came from; the sponsor, baseline, scope and stop criteria are blanks to be filled in elsewhere — this system has no readiness-pack table and does not create one.",
    },
    {
      label: "Migration workbench",
      path: "migration",
      permission: "integration.flow.read",
      icon: "ArrowLeftRight",
      description:
        "Every data load ever run in this tenant, with the reconciliation that decides acceptance: rows presented, minus rows that became findable records, minus rows refused with a recorded reason — and the difference, which must be zero before a data set is signed off. Shows the column mapping used, every refused row with the cell and reason, and the rows held as possible duplicates. It does not run imports; the wizard in Data import does that. The acceptance signature is not stored here.",
    },
    {
      label: "Connector console",
      path: "connectors",
      permission: "integration.connector.read",
      icon: "Cable",
      description:
        "Live connection health, circuit state and consecutive failures; every flow's status and the reason any is paused; the recovery backlog by flow with the server's own verdict on whether each record may safely be sent again; and an end-to-end trace, with real timestamps, for any correlation id. Replay and close are offered where the deterministic triage allows them and disabled with the server's reason where it does not. There is no per-connection last-sync timestamp in this API, so none is shown.",
    },
    {
      label: "Commissioning evidence",
      path: "commissioning",
      permission: "integration.factory-connect.read",
      icon: "ClipboardCheck",
      description:
        "The acceptance pack: gateways as installed with deployment mode and software version, what each heartbeat is evidence of in the platform's own words, an interruption test you can actually run against a fake-adapter connection, whether a backup has ever been proven to restore with the audit chain intact, and the chain's own verification history. Training sign-off, warranty boundaries and escalation contacts are set out as structure — none of the three is stored. Where a gateway is a simulator the pack evidences the pipeline and not the plant, and says so.",
    },
    {
      label: "Support record",
      path: "support",
      permission: "admin.incident.write",
      icon: "LifeBuoy",
      description:
        "The coverage calendar, severity definitions, named escalation and monthly review agenda as a structure to be agreed and staffed — with the standing warning that recording a commitment is not staffing one. Alongside it, the obligations the platform genuinely runs: the CERT-In six-hour reporting clock per incident, the 180-day India log-retention floor with the direction that sets it, the NTP time source, and the control-plane posture. Those four are records; the coverage table is not.",
    },
    {
      label: "Commercial shape",
      path: "commercial",
      permission: "general.company.read",
      icon: "Receipt",
      description:
        "The seven lines this engagement is priced on — diagnostic, implementation, hardware and installation, subscription, connectors, cloud usage, support — with what drives each cost and what goes wrong when it is merged into another line. Includes the counts the platform can supply to anchor an estimate, and an illustrative payback calculation that starts empty on purpose: every input must be replaced with the customer's own evidence, and the result is arithmetic rather than a forecast. Nothing here is stored and there is no rate card in this system.",
    },
  ],
  screens: {
    readiness: () => import("./screens/readiness"),
    migration: () => import("./screens/migration"),
    connectors: () => import("./screens/connectors"),
    commissioning: () => import("./screens/commissioning"),
    support: () => import("./screens/support"),
    commercial: () => import("./screens/commercial"),
  },

  /**
   * TWO FIGURES, BOTH ABOUT WHETHER A DELIVERY PROMISE IS CURRENTLY BEING KEPT.
   *
   * Deliberately not "engagements", "services healthy" or an availability percentage. Those
   * would be the natural tiles for a managed-services module and every one of them would be
   * a figure this system cannot produce — there is no engagement table, no SLA target and no
   * uptime measurement here. A tile showing 99.9% would be inventing the most consequential
   * number in the package.
   *
   * What the platform can genuinely count is recovery backlog and migration acceptance gap.
   * Both are arithmetic over rows, both have an owner and a screen, and both move.
   */
  signals: [
    {
      label: "Records in recovery",
      permission: "integration.message.read",
      path: deliveryApi.dlqPath,
      reduce: (data) => {
        const entries = listOf(data, "entries");
        if (!entries) return null;
        const needsHuman = int(data, "needsHumanFirst");
        const replayable = int(data, "replayableNow");
        return {
          value: String(entries.length),
          hint:
            entries.length === 0
              ? "Nothing dead-lettered — every message arrived or is still inside its retry schedule"
              : needsHuman > 0
                ? `${needsHuman} need a person before anything is sent again`
                : `${replayable} can be replayed once somebody decides to`,
          tone: needsHuman > 0 ? "bad" : entries.length > 0 ? "warn" : "ok",
        };
      },
    },
    {
      label: "Migration acceptance",
      permission: "integration.flow.read",
      path: deliveryApi.importBatchesPath,
      query: { limit: 25 },
      reduce: (data) => {
        const rows = listOf(data, "items");
        if (!rows) return null;
        if (rows.length === 0) {
          return {
            value: "—",
            hint: "No data has been loaded into this tenant yet",
            tone: "neutral",
          };
        }
        let presented = 0;
        let unaccounted = 0;
        let unreconciled = 0;
        for (const row of rows) {
          const summary = reconcile({
            rowCount: int(row, "rowCount"),
            acceptedCount: int(row, "acceptedCount"),
            rejectedCount: int(row, "rejectedCount"),
            importedCount: int(row, "importedCount"),
            failedCount: int(row, "failedCount"),
            status: (str(row, "status") || "completed") as "running" | "completed" | "partial" | "failed",
          });
          presented += summary.presented;
          unaccounted += summary.unaccounted;
          if (!summary.reconciled) unreconciled += 1;
        }
        return {
          value: unaccounted === 0 ? "Reconciles" : String(unaccounted),
          hint:
            unaccounted === 0
              ? `Every one of ${presented} presented rows is a record or a recorded refusal`
              : `${unaccounted} rows presented but neither imported nor refused, across ${unreconciled} load${unreconciled === 1 ? "" : "s"}`,
          tone: unaccounted === 0 ? "ok" : "bad",
          fraction: presented > 0 ? Math.max(0, (presented - unaccounted) / presented) : undefined,
        };
      },
    },
  ],

  /**
   * WHAT THIS MODULE INTERRUPTS SOMEBODY FOR.
   *
   * Three things, each decided by arithmetic or a status column, never by a model. A
   * delivery alert that is wrong in the reassuring direction is the worst kind in this
   * module specifically: the whole package is sold on the promise that somebody notices.
   *
   * Deliberately NOT alerted:
   *   - a connection in `fake` adapter mode behaving like a fake adapter. That is its job.
   *   - rows refused during an import with a recorded reason. Those are the system working,
   *     they were shown at the time, and they do not develop — a bell that rings for them
   *     rings for every migration.
   *   - anything about coverage, SLA or response time. There is no such record, so an alert
   *     about one would be an alert this module invented.
   */
  alerts: [
    {
      /* A connection whose breaker is open is not carrying traffic, right now. */
      permission: "integration.connector.read",
      path: deliveryApi.connectionsPath,
      reduce: (data) => {
        const rows = listOf(data, "data");
        if (!rows) return [];
        return rows
          .filter((row) => str(row, "circuitState") === "open")
          .slice(0, ALERT_CAP)
          .map((row): ModuleAlert => {
            const name = str(row, "name") || "a connection";
            const failures = int(row, "consecutiveFailures");
            return {
              // The connection name: one alert per blocked connection, stable until the
              // breaker closes, and gone once it does.
              id: `delivery.connection.open.${name}`,
              severity: "critical",
              title: `${name} is blocked — the circuit breaker is open`,
              body: "Nothing is going out on this connection. The breaker opened to stop every document spending thirty seconds rediscovering the same outage; it will not close until successful calls are recorded.",
              href: "/delivery/connectors",
              evidence: `Connection ${name} (${str(row, "connector") || "unknown adapter"}, ${
                str(row, "adapterMode") || "unknown mode"
              }) — health ${str(row, "healthStatus") || "unknown"}, ${failures} consecutive failure${
                failures === 1 ? "" : "s"
              }.`,
            };
          });
      },
    },
    {
      /* A dead letter the deterministic triage will not let anybody replay. */
      permission: "integration.message.read",
      path: deliveryApi.dlqPath,
      reduce: (data) => {
        const entries = listOf(data, "entries");
        if (!entries) return [];
        const blocked = entries.filter((entry) => field(entry, "replayAllowed") === false);
        const alerts = blocked.slice(0, ALERT_CAP).map((entry): ModuleAlert => {
          const correlationId = str(entry, "correlationId") || str(entry, "id");
          const statutory = bool(entry, "isStatutory");
          return {
            id: `delivery.dlq.${str(entry, "id") || correlationId}`,
            severity: statutory ? "critical" : "urgent",
            title: `${correlationId} cannot be sent again without a person`,
            body: str(entry, "replayVerdict") ||
              "The deterministic triage refused an automatic replay. Somebody has to look at this before anything goes out.",
            href: "/delivery/connectors",
            evidence: `Dead letter on flow ${str(entry, "flowCode") || "unknown"} — category ${
              str(entry, "category") || "unknown"
            }, severity ${str(entry, "severity") || "unknown"}${
              bool(entry, "sideEffectPossible") ? ", the far side may already have acted" : ""
            }${statutory ? ", statutory document" : ""}.`,
          };
        });
        if (blocked.length <= ALERT_CAP) return alerts;
        return [
          ...alerts,
          {
            id: "delivery.dlq.more",
            severity: "urgent",
            title: `${blocked.length} records need a person before replay — the ${ALERT_CAP} above are listed`,
            body: "The rest are on the connector console with the same verdict against each.",
            href: "/delivery/connectors",
          },
        ];
      },
    },
    {
      /**
       * A FINISHED load with rows that are neither a record nor a recorded refusal.
       *
       * Distinct from Data import's own alert, which watches loads that have not finished.
       * This one watches loads that HAVE finished and still lost rows — the failure that
       * looks like success and is found in month three by somebody who cannot find a part.
       */
      permission: "integration.flow.read",
      path: deliveryApi.importBatchesPath,
      query: { limit: 25 },
      reduce: (data) => {
        const rows = listOf(data, "items");
        if (!rows) return [];
        const leaking = rows.flatMap((row): readonly ModuleAlert[] => {
          const status = str(row, "status");
          if (status === "running") return [];
          const summary = reconcile({
            rowCount: int(row, "rowCount"),
            acceptedCount: int(row, "acceptedCount"),
            rejectedCount: int(row, "rejectedCount"),
            importedCount: int(row, "importedCount"),
            failedCount: int(row, "failedCount"),
            status: (status || "completed") as "running" | "completed" | "partial" | "failed",
          });
          if (summary.unaccounted === 0) return [];
          const id = str(row, "id");
          if (!id) return [];
          const filename = str(row, "filename") || "a data load";
          return [
            {
              id: `delivery.migration.${id}`,
              severity: "urgent",
              title: `${filename}: ${summary.unaccounted} row${
                summary.unaccounted === 1 ? "" : "s"
              } presented but never accounted for`,
              body: "The load has finished and these rows are neither a record nor a recorded refusal. This data set is not reconciled and must not be signed off until every row is accounted for.",
              href: "/delivery/migration",
              at: str(row, "finishedAt") || str(row, "startedAt") || undefined,
              evidence: `Load of ${filename} (sheet ${str(row, "sheetName") || "?"} as ${
                str(row, "target") || "unknown"
              }) — ${summary.presented} presented, ${summary.landed} imported, ${
                summary.refused
              } refused.`,
            },
          ];
        });
        if (leaking.length <= ALERT_CAP) return leaking;
        return [
          ...leaking.slice(0, ALERT_CAP),
          {
            id: "delivery.migration.more",
            severity: "urgent",
            title: `${leaking.length} loads do not reconcile — the ${ALERT_CAP} above are listed`,
            body: "The rest are on the migration workbench with the same row-by-row arithmetic.",
            href: "/delivery/migration",
          },
        ];
      },
    },
  ],
};
