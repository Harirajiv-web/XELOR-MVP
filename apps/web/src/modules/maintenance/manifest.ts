import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { num } from "@spine/format";
import { defaultWindow } from "./api";

/**
 * The reporting window the signals below send, fixed when the application loads — the same
 * ninety days the KPI and downtime screens open on. Declared here rather than beside the
 * reducers because the manifest reads it while this file is still being evaluated.
 */
const KPI_WINDOW = defaultWindow();

/**
 * MAINTENANCE / CMMS (KILN, Module 10).
 *
 * `work-orders` here is the MAINTENANCE work order and shares nothing with Production's
 * manufacturing order — different table, different number series, different permission root
 * (`mnt.*` against `production.*`). The two are deliberately never joined in this UI either.
 *
 * `asset` is hidden: the 360 view of one machine, reached by clicking a row and routable at
 * `/maintenance/asset/<code>`.
 */
export const maintenanceManifest: ModuleManifest = {
  key: "maintenance",
  name: "Maintenance",
  summary: "The asset register, the work done on each machine, and the downtime it cost.",
  department: "KILN",
  icon: "Wrench",
  licenceKey: "maintenance",
  order: 60,
  nav: [
    {
      label: "Assets",
      path: "assets",
      permission: "mnt.asset.read",
      icon: "Cog",
    },
    {
      label: "Asset",
      path: "asset",
      permission: "mnt.asset.read",
      icon: "Cog",
      hidden: true,
    },
    {
      label: "Work orders",
      path: "work-orders",
      permission: "mnt.mwo.read",
      icon: "Wrench",
    },
    {
      label: "Requests",
      path: "requests",
      permission: "mnt.request.read",
      icon: "Inbox",
    },
    {
      label: "Downtime",
      path: "downtime",
      permission: "mnt.downtime.read",
      icon: "Timer",
    },
    {
      label: "Preventive schedule",
      path: "pm",
      permission: "mnt.pm.read",
      icon: "CalendarClock",
    },
    {
      label: "Reliability KPIs",
      path: "kpis",
      permission: "mnt.report.read",
      icon: "BarChart3",
    },
  ],
  screens: {
    assets: () => import("./screens/assets"),
    asset: () => import("./screens/asset"),
    "work-orders": () => import("./screens/work-orders"),
    requests: () => import("./screens/requests"),
    downtime: () => import("./screens/downtime"),
    pm: () => import("./screens/pm"),
    kpis: () => import("./screens/kpis"),
  },
  /**
   * WHAT A PLANT MANAGER JUDGES THIS TEAM ON.
   *
   * The reports need a window — `from` and `to` are validated `YYYY-MM-DD` and the request
   * fails without them — so the same ninety days the KPI screen opens on is sent here, fixed
   * when the application loads. Ninety days rather than a month because a mean computed from
   * one breakdown will be argued with, correctly.
   *
   * AVAILABILITY MAY SIMPLY NOT APPEAR, AND THAT IS THE POINT. It is operating hours over
   * scheduled hours, and this build has no shift calendar to supply the denominator, so the
   * server answers null and this tile is dropped rather than assuming 24×7. A believable
   * wrong uptime figure on a dashboard is worse than no uptime figure, because nobody checks
   * a number that looks right. The fix for that is a shift calendar, not a default here.
   *
   * The third tile is what is stopped AT THIS MOMENT, not an aggregate. A supervisor walking
   * past a screen is answering "is anything down", and ninety days of accumulated hours does
   * not answer it — a machine that stopped ten minutes ago barely moves that total.
   */
  signals: [
    {
      label: "Maintenance jobs open",
      permission: "mnt.mwo.read",
      path: "/maintenance/work-orders",
      reduce: (data) => reduceOpenJobs(data),
    },
    {
      label: "Machine availability",
      permission: "mnt.report.read",
      path: "/maintenance/reports/kpis",
      query: { scopeType: "tenant", from: KPI_WINDOW.from, to: KPI_WINDOW.to },
      reduce: (data) => reduceAvailability(data),
    },
    {
      label: "Machines down now",
      permission: "mnt.downtime.read",
      path: "/maintenance/downtime",
      query: { from: KPI_WINDOW.from, to: KPI_WINDOW.to, open: "true" },
      reduce: (data) => reduceMachinesDown(data),
    },
  ],
};

/* ------------------------------ the reducers ------------------------------- */

/**
 * Live maintenance work — the board's own default, which excludes closed and cancelled jobs.
 *
 * `slaBreached` is the server's finding against the restore deadline it derived from the
 * asset's criticality, not a judgement invented here, so it is allowed to colour the tile.
 */
function reduceOpenJobs(data: unknown): SignalValue | null {
  if (!Array.isArray(data)) return null;
  const rows: unknown[] = data;
  let breached = 0;
  let safety = 0;
  for (const entry of rows) {
    if (typeof entry !== "object" || entry === null) return null;
    const r = entry as Record<string, unknown>;
    if (typeof r.mwoNo !== "string") return null;
    if (r.slaBreached === true) breached += 1;
    if (r.isSafetyRelated === true) safety += 1;
  }
  if (rows.length === 0) {
    return { value: "0", hint: "no live job on any machine", tone: "ok" };
  }
  const notes: string[] = [];
  if (breached > 0) notes.push(`${num(breached)} past the restore deadline`);
  if (safety > 0) notes.push(`${num(safety)} safety-related`);
  return {
    value: num(rows.length),
    hint: notes.length > 0 ? notes.join(" · ") : "none past its restore deadline",
    tone: breached > 0 ? "bad" : "neutral",
  };
}

/** The KPI response, narrowed to the figures these two tiles read. */
function readKpis(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  // `period` is on every honest KPI answer; without it this is some other endpoint's body.
  if (typeof r.period !== "object" || r.period === null) return null;
  return r;
}

/**
 * Uptime as a percentage of scheduled hours. Null-safe by design: no shift calendar, no
 * tile. No threshold is applied either — where the line between good and bad uptime sits is
 * this plant's decision to make, and inventing one in a colour would be making it for them.
 */
function reduceAvailability(data: unknown): SignalValue | null {
  const r = readKpis(data);
  if (r === null) return null;
  const pct = r.availabilityPct;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0) return null;
  return {
    value: `${num(pct, 1)}%`,
    hint: "of scheduled hours, last 90 days",
    tone: "neutral",
    fraction: Math.min(pct / 100, 1),
  };
}

/**
 * What is stopped right now, and which machines they are.
 *
 * The endpoint is asked for OPEN intervals only, and the reducer still checks `endedAt` is
 * null rather than trusting the filter — an open interval is one whose clock is still
 * running, and that is the whole claim this tile makes.
 *
 * How long each has been down is deliberately NOT computed. An open stop has no duration
 * until somebody says when the machine came back; the Downtime screen prints "Still down"
 * for exactly that reason, and a tile that guessed an elapsed figure would be inventing the
 * end of a stop that has not ended.
 */
function reduceMachinesDown(data: unknown): SignalValue | null {
  if (!Array.isArray(data)) return null;
  const rows: unknown[] = data;
  const codes: string[] = [];
  for (const entry of rows) {
    if (typeof entry !== "object" || entry === null) return null;
    const r = entry as Record<string, unknown>;
    if (typeof r.assetCode !== "string") return null;
    if (r.endedAt === null || r.endedAt === undefined) codes.push(r.assetCode);
  }

  if (codes.length === 0) {
    return { value: "0", hint: "every machine is running", tone: "ok" };
  }
  // Named, not just counted. "2 machines down" sends somebody to look up which two.
  const shown = [...new Set(codes)].sort();
  const first = shown.slice(0, 2).join(" · ");
  return {
    value: num(codes.length),
    hint: shown.length > 2 ? `${first} and ${num(shown.length - 2)} more` : first,
    tone: "bad",
  };
}
