import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
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
      description:
        "Every machine, area and component the plant maintains, in the hierarchy it actually sits in — plant, then area, then machine, then component. A machine is shown as down when a downtime interval recorded against it has no end time yet, so this list is the plant's live availability, not somebody's status report.",
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
      description:
        "Jobs raised against machines — breakdowns, corrective work, scheduled services and statutory examinations. This is NOT the same document as a production work order: that one says what to make, this one says what to fix. The two are counted separately everywhere in the system.",
    },
    {
      label: "Requests",
      path: "requests",
      permission: "mnt.request.read",
      icon: "Inbox",
      description:
        "What operators have reported from the floor, before anybody has decided what to do about it. The response clock on each one starts when the operator pressed submit, not when this queue was opened — so a request nobody has looked at is already running late.",
    },
    {
      label: "Downtime",
      path: "downtime",
      permission: "mnt.downtime.read",
      icon: "Timer",
      description:
        "Every interval a machine was not available, with the exact minutes each one cost. These are the same rows the availability and MTBF figures are computed from, so if a number on the KPI screen looks wrong, the row that caused it is here.",
    },
    {
      label: "Preventive schedule",
      path: "pm",
      permission: "mnt.pm.read",
      icon: "CalendarClock",
      description:
        "Every service the plant's own schedules have called for, including the ones that were missed or skipped. Missed services are not removed from this list — they stay because they count against compliance, and a screen that quietly dropped them would show a plant in better order than it is.",
    },
    {
      label: "Reliability KPIs",
      path: "kpis",
      permission: "mnt.report.read",
      icon: "BarChart3",
      description:
        "How much production time the plant lost, how often machines failed, how long they took to fix, and what it cost. Every figure is computed from the downtime ledger — none of it is entered by anyone, so nobody can improve a number without improving the plant.",
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

  /* ==========================================================================
     WHAT MAINTENANCE INTERRUPTS PEOPLE FOR.
     ==========================================================================

     Of everything in this product, a stopped machine is the fact with the shortest useful
     life. It is worth knowing at 06:12; by eleven o'clock, when somebody has walked to an
     office and told somebody else, the planner has already scheduled work on it.

     All three watches below decide in ARITHMETIC, against columns the server already
     computed:
       - down       = a downtime interval exists with no `endedAt`
       - unanswered = a request with no `acknowledgedAt` whose `slaBreached` the server set
       - overdue    = a job whose `slaBreached` the server set against its restore deadline
     No model is asked whether any of this is a problem. `slaBreached` in particular is the
     server's finding against a deadline derived from the asset's own criticality — not a
     judgement invented in a browser — which is exactly why it is allowed to raise an alert.
     ========================================================================== */
  alerts: [
    {
      /**
       * STOPPED, RIGHT NOW. Raised as `critical` only when the stop is production-impacting:
       * a machine off for a planned service is not an emergency, and treating it as one is
       * how a bell gets muted before the real failure arrives.
       */
      permission: "mnt.downtime.read",
      path: "/maintenance/downtime",
      query: { from: KPI_WINDOW.from, to: KPI_WINDOW.to, open: "true" },
      reduce: (data) => alertMachinesDown(data),
    },
    {
      /**
       * REPORTED FROM THE FLOOR AND NOBODY HAS ANSWERED. The operator has done their part;
       * the clock they started is running against us, not them.
       */
      permission: "mnt.request.read",
      path: "/maintenance/requests",
      reduce: (data) => alertUnansweredRequests(data),
    },
    {
      /**
       * A JOB THAT WAS SUPPOSED TO HAVE RESTORED THE MACHINE BY NOW. Distinct from the
       * first watch: the machine may already be running again while the paperwork and the
       * SLA are still open, and that is a different person's problem.
       */
      permission: "mnt.mwo.read",
      path: "/maintenance/work-orders",
      reduce: (data) => alertBreachedJobs(data),
    },
  ],
};

/* ------------------------------- the watches ------------------------------- */

/** Rows from an endpoint we refuse to assume the shape of. */
function rowsOf(data: unknown): readonly Record<string, unknown>[] | null {
  let list: unknown = data;
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const rec = data as Record<string, unknown>;
    list = rec["data"] ?? rec["items"];
  }
  if (!Array.isArray(list)) return null;
  return list.filter(
    (r): r is Record<string, unknown> => typeof r === "object" && r !== null && !Array.isArray(r),
  );
}

function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** How long ago, in words a supervisor would use. Unparseable → null, never "NaN h". */
function since(iso: string | null): { minutes: number; text: string } | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const minutes = Math.floor((Date.now() - t) / 60_000);
  if (minutes < 0) return null;
  if (minutes < 60) return { minutes, text: `${minutes} min` };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return { minutes, text: m === 0 ? `${h} h` : `${h} h ${m} m` };
  const d = Math.floor(h / 24);
  return { minutes, text: `${d} day${d === 1 ? "" : "s"} ${h % 24} h` };
}

/** The house cap. Eight is what a person will actually read before scrolling past. */
const CAP = 8;

/**
 * A machine that is not running.
 *
 * Ordered by how long it has been stopped, longest first, because that is where the cost
 * has been accruing — not by criticality. A C-class machine down since Tuesday has usually
 * cost more than an A-class one down since breakfast, and the operator can see the class
 * on the row anyway.
 */
function alertMachinesDown(data: unknown): readonly ModuleAlert[] {
  const rows = rowsOf(data);
  if (rows === null) return [];

  const open = rows
    .filter((r) => r["endedAt"] === null || r["endedAt"] === undefined)
    .map((r) => ({ r, elapsed: since(str(r, "startedAt")) }))
    .filter((x): x is { r: Record<string, unknown>; elapsed: { minutes: number; text: string } } =>
      x.elapsed !== null,
    )
    .sort((a, b) => b.elapsed.minutes - a.elapsed.minutes);

  const alerts: ModuleAlert[] = open.slice(0, CAP).map(({ r, elapsed }) => {
    const code = str(r, "assetCode") ?? "A machine";
    const name = str(r, "assetName");
    const impacting = r["productionImpacting"] === true;
    const kind = str(r, "kind");
    const reason = str(r, "reasonCode");
    return {
      // The downtime interval's own id. The same stop is the same alert on every poll, so
      // reading it once is enough — which is the only reason anybody keeps a bell switched on.
      id: `maintenance.down.${str(r, "id") ?? code}`,
      severity: impacting ? ("critical" as const) : ("urgent" as const),
      title: `${code}${name ? ` — ${name}` : ""} has been down ${elapsed.text}`,
      body: impacting
        ? `Production is stopped on this machine${reason ? ` (${reason.toLowerCase().replace(/_/g, " ")})` : ""}. Nothing scheduled on it can run until the interval is closed.`
        : `Not currently marked as production-impacting${kind ? `; recorded as ${kind.replace(/_/g, " ")}` : ""}. Worth confirming that is still true after ${elapsed.text}.`,
      href: "/maintenance/downtime",
      at: str(r, "startedAt") ?? undefined,
      evidence: `Downtime interval on ${code}, open since ${str(r, "startedAt") ?? "an unrecorded time"}${str(r, "mwoId") ? ", linked to a maintenance job" : ", with no maintenance job raised against it"}.`,
    };
  });

  if (open.length > CAP) {
    // Said out loud rather than truncated in silence. A panel that shows eight of thirty
    // and does not say so reads as "eight", which is the more comfortable number and the
    // wrong one.
    alerts.push({
      id: "maintenance.down.more",
      severity: "urgent" as const,
      title: `${open.length} machines are down`,
      body: `The ${CAP} that have been stopped longest are listed above. The downtime screen has every one of them.`,
      href: "/maintenance/downtime",
      at: undefined,
      evidence: `${open.length} downtime intervals are open with no end time.`,
    });
  }
  return alerts;
}

/**
 * A report from the floor that nobody has picked up.
 *
 * Only ones the SERVER has already found to have missed their respond-by deadline. The
 * deadline itself comes from the criticality/SLA matrix and is config, never a constant
 * here — a browser inventing "should have been answered in thirty minutes" would be
 * asserting a service level nobody agreed to.
 */
function alertUnansweredRequests(
  data: unknown,
): readonly ModuleAlert[] {
  const rows = rowsOf(data);
  if (rows === null) return [];

  const stale = rows
    .filter((r) => r["acknowledgedAt"] === null || r["acknowledgedAt"] === undefined)
    .filter((r) => r["slaBreached"] === true)
    .map((r) => ({ r, waited: since(str(r, "requestedAt")) }))
    .filter((x): x is { r: Record<string, unknown>; waited: { minutes: number; text: string } } =>
      x.waited !== null,
    )
    .sort((a, b) => b.waited.minutes - a.waited.minutes);

  const alerts: ModuleAlert[] = stale.slice(0, CAP).map(({ r, waited }) => {
    const asset = r["asset"];
    const assetRec =
      typeof asset === "object" && asset !== null ? (asset as Record<string, unknown>) : {};
    const code = str(assetRec, "code") ?? "a machine";
    const no = str(r, "requestNo") ?? "A request";
    const severity = str(r, "severity");
    return {
      id: `maintenance.request.unanswered.${no}`,
      severity: severity === "critical" || severity === "high" ? ("urgent" as const) : ("attention" as const),
      title: `${no} on ${code} has been waiting ${waited.text}`,
      body: `An operator reported this and nobody has acknowledged it. The response clock started when they pressed submit, and it has already passed the deadline for this machine's criticality.`,
      href: "/maintenance/requests",
      at: str(r, "requestedAt") ?? undefined,
      evidence: `Request ${no}, reported ${str(r, "requestedAt") ?? "at an unrecorded time"}, respond-by ${
        typeof r["derived"] === "object" && r["derived"] !== null
          ? (str(r["derived"] as Record<string, unknown>, "slaRespondBy") ?? "unset")
          : "unset"
      }.`,
    };
  });

  if (stale.length > CAP) {
    alerts.push({
      id: "maintenance.request.unanswered.more",
      severity: "attention" as const,
      title: `${stale.length} floor reports are unacknowledged past their deadline`,
      body: `The ${CAP} that have waited longest are listed above.`,
      href: "/maintenance/requests",
      at: undefined,
      evidence: `${stale.length} requests have no acknowledgement and the server has marked each SLA as breached.`,
    });
  }
  return alerts;
}

/**
 * A maintenance job that should have restored the machine by now.
 *
 * Safety-related work is raised a level. That is not a nicety — a lapsed statutory
 * examination on a pressure vessel or a lifting appliance is an offence before it is an
 * inconvenience, and the person who can act on it is not the person watching the downtime
 * screen.
 */
function alertBreachedJobs(
  data: unknown,
): readonly ModuleAlert[] {
  const rows = rowsOf(data);
  if (rows === null) return [];

  const done = new Set(["closed", "cancelled", "completed"]);
  const breached = rows
    .filter((r) => r["slaBreached"] === true)
    .filter((r) => !done.has(str(r, "status") ?? ""))
    .map((r) => ({ r, late: since(str(r, "slaRestoreBy")) }))
    .filter((x): x is { r: Record<string, unknown>; late: { minutes: number; text: string } } =>
      x.late !== null,
    )
    .sort((a, b) => b.late.minutes - a.late.minutes);

  const alerts: ModuleAlert[] = breached.slice(0, CAP).map(({ r, late }) => {
    const no = str(r, "mwoNo") ?? "A job";
    const code = str(r, "assetCode") ?? "a machine";
    const safety = r["isSafetyRelated"] === true;
    const onHold = str(r, "holdReason");
    return {
      id: `maintenance.mwo.breached.${no}`,
      severity: safety ? ("critical" as const) : ("urgent" as const),
      title: `${no} on ${code} passed its restore deadline ${late.text} ago`,
      body: `${safety ? "This is safety-related work. " : ""}${
        onHold
          ? `It is on hold: ${onHold}.`
          : `Status is ${(str(r, "status") ?? "open").replace(/_/g, " ")} and the machine was promised back by now.`
      }`,
      href: "/maintenance/work-orders",
      at: str(r, "slaRestoreBy") ?? undefined,
      evidence: `Maintenance job ${no}, reported ${str(r, "reportedAt") ?? "at an unrecorded time"}, restore-by ${str(r, "slaRestoreBy") ?? "unset"}; the server marked the SLA breached.`,
    };
  });

  if (breached.length > CAP) {
    alerts.push({
      id: "maintenance.mwo.breached.more",
      severity: "attention" as const,
      title: `${breached.length} maintenance jobs are past their restore deadline`,
      body: `The ${CAP} that are latest are listed above.`,
      href: "/maintenance/work-orders",
      at: undefined,
      evidence: `${breached.length} open jobs carry a breached SLA flag from the server.`,
    });
  }
  return alerts;
}

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
