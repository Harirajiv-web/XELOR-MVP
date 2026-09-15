import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { num } from "@spine/format";
import { plantOpsApi } from "./api";

/**
 * PLANT OPERATIONS — the connected package (product profile 5).
 *
 * WHAT IT IS, AND WHY IT IS NOT A SIXTH COPY OF MAINTENANCE.
 *
 * Connected Factory, Maintenance and Energy are sold separately by almost everybody, and a
 * plant that buys all three ends up with three asset registers: the machine is `CNC-04` in
 * the MES, `Mazak 4` in the CMMS and `Feeder-3B` on the energy meter. Nobody can answer
 * "what did that machine cost us last month" without a person reconciling three lists by
 * hand — which is exactly the job this product exists to delete.
 *
 * So this module adds no register of its own. It is the OPERATOR AND SUPERVISOR JOURNEYS
 * across the one register that already exists: `maintenance_asset` is the machine, the
 * downtime ledger is the stop, the edge gateway's telemetry is the signal, and the kWh
 * meter is a meter type on the same asset. Every screen here reads the same rows the
 * Maintenance and Production modules read.
 *
 * THREE CONSTRAINTS IT HOLDS ITSELF TO, all of them checkable:
 *
 *   1. NO NEW PERMISSIONS AND NO NEW ENDPOINTS. Every permission named below already exists
 *      and is already enforced by a route — `pnpm perm-check` fails otherwise. A connected
 *      package that needed its own backend would not be connected; it would be a fourth
 *      system.
 *   2. NO INVENTED FIGURES. The OEE screen is the load-bearing example: it renders a
 *      percentage only when all three factors are measured, and otherwise names what is
 *      missing. See `assessOee` in `api.ts` for the argument.
 *   3. `licenceKey: "maintenance"`. This is sold as part of what a customer buys when they
 *      buy the ability to run the shop floor on one asset register, and it reuses that
 *      entitlement rather than minting one a licence record has never heard of.
 */

/** The house cap: eight is what a person will actually read before scrolling past. */
const ALERT_CAP = 8;

export const plantOpsManifest: ModuleManifest = {
  key: "plantops",
  name: "Plant operations",
  summary:
    "The shop floor on one asset register: what ran, what stopped, what it needs and what it drew.",
  department: "KILN",
  icon: "Factory",
  licenceKey: "maintenance",
  // Ahead of Production (45) and Maintenance (60): in this package the floor view is the
  // front door, and the two module boards behind it are where somebody goes for detail.
  order: 40,
  nav: [
    {
      label: "Shift board",
      path: "shift-board",
      permission: ["production.order.read", "mnt.downtime.read"],
      icon: "LayoutDashboard",
      description:
        "What a supervisor needs in the first five minutes of a shift: the machines that are stopped right now with how long each has been down, the production orders still open and how much of each is made, where last quarter's lost hours actually went, and the maintenance jobs past their restore deadline with the person they are assigned to. Stopped means a downtime interval with no end time — not somebody's status report. This screen deliberately does NOT show output against a daily target: a production order in this system carries no due date and no shift, so nothing here can honestly say which output belonged to today.",
    },
    {
      label: "OEE",
      path: "oee",
      permission: ["mnt.report.read", "production.factory-connect.read"],
      icon: "Gauge",
      description:
        "Availability, performance and quality, and the product of the three. Each factor is shown with the rows it was computed from — and when one cannot be computed, this screen says which input is missing and where it would have to come from, instead of showing a percentage. It will refuse to show an OEE figure more often than it shows one in this build, because performance needs a standard cycle time that nothing in the system records. A believable wrong number here is worse than no number, because nobody checks a number that looks right.",
    },
    {
      label: "Work orders",
      path: "work-orders",
      permission: "mnt.mwo.read",
      icon: "Wrench",
      description:
        "Maintenance jobs, and the buttons that move them: report a fault, turn that report into a job, start it, hand the machine back, complete it and close it. This is the maintenance work order — what to FIX — and shares nothing with a production order, which says what to MAKE. Completing a job is refused until the failure is coded, the mandatory checks are done and the machine is actually back; when that happens the screen lists everything outstanding at once rather than one condition at a time.",
    },
    {
      label: "Assets",
      path: "assets",
      permission: "mnt.asset.read",
      icon: "Cog",
      description:
        "Every machine, area and component the plant maintains, in the hierarchy it actually sits in, and for whichever one you pick: the repairs, stoppages, services and meter readings recorded against it over a window you choose. A machine shows as down when a downtime interval against it has no end time yet, so this list is the plant's live availability. You cannot type a machine's condition here — everything shown was recorded by a job, a stop or a reading.",
    },
    {
      label: "Energy",
      path: "energy",
      permission: "mnt.asset.read",
      icon: "Zap",
      description:
        "Electricity by plant, line and machine, in kWh — from the kWh meters on the asset register and, where a machine is connected, from what it is reporting now. Readings are cumulative counters, so what is shown is the counter, the observed kWh per day between real readings, and when each was last actually read. Per-SHIFT figures are not shown because no shift calendar exists to split a day by, and cost per job is not shown because no allocation method is configured — the screen says so rather than dividing by something plausible.",
    },
  ],
  screens: {
    "shift-board": () => import("./screens/shift-board"),
    oee: () => import("./screens/oee"),
    "work-orders": () => import("./screens/work-orders"),
    assets: () => import("./screens/assets"),
    energy: () => import("./screens/energy"),
  },

  /* ==========================================================================
     THE THREE FIGURES THIS PACKAGE IS JUDGED ON.
     ==========================================================================

     All three are counts and ratios of rows the server already returned. No model is
     consulted and none could be.

     Deliberately NOT here: an OEE tile. It is the headline figure every competing dashboard
     leads with, and in this build it cannot be honestly computed (see the OEE screen). A
     tile showing "OEE — insufficient data" would be accurate and useless; a tile showing a
     number would be neither.
     ========================================================================== */
  signals: [
    {
      label: "Stopped right now",
      permission: "mnt.downtime.read",
      path: plantOpsApi.downtimePath,
      // No window. A machine down since last month must not drop out of "what is stopped
      // now" because the dashboard happened to ask for ninety days.
      query: { open: "true" },
      reduce: (data) => reduceStopped(data),
    },
    {
      label: "Made against committed",
      permission: "production.order.read",
      path: plantOpsApi.productionOrdersPath,
      query: { limit: 50 },
      reduce: (data) => reduceOutput(data),
    },
    {
      label: "Machines reporting",
      permission: "production.factory-connect.read",
      path: plantOpsApi.factoryProductionViewPath,
      reduce: (data) => reduceTelemetry(data),
    },
  ],

  /* ==========================================================================
     WHAT PLANT OPERATIONS INTERRUPTS SOMEBODY FOR.
     ==========================================================================

     Every verdict below is reached by COMPARISON, in code, against a column the server
     already computed — a null end time, a null work-order id, the server's own `stale`
     flag. No model is asked whether any of it is a problem, because a model asked to judge
     will occasionally say a thing is fine because the sentence flowed better, and an alert
     that is wrong in the reassuring direction is worse than no alert at all.

     The three watches are chosen to be the ones NO OTHER MODULE MAKES. Maintenance already
     rings for a stopped machine and for a job past its deadline; repeating those here would
     double every bell in the package and get the whole tray muted within a week. What is
     left is the connected package's own ground:

       - a machine is stopped and NOBODY HAS RAISED WORK on it       (the clock runs, unowned)
       - an energy meter HAS STOPPED REPORTING                        (the bill is unexplained)
       - the plant HAS GONE DARK to us                                (we can see nothing)

     Each has an owner, a screen and a fix. Nothing else earns a place.
     ========================================================================== */
  alerts: [
    {
      permission: "mnt.downtime.read",
      path: plantOpsApi.downtimePath,
      query: { open: "true" },
      reduce: (data) => alertStoppedWithNoJob(data),
    },
    {
      permission: "mnt.asset.read",
      path: plantOpsApi.assetsPath,
      reduce: (data) => alertSilentEnergyMeters(data),
    },
    {
      permission: "production.factory-connect.read",
      path: plantOpsApi.factoryProductionViewPath,
      reduce: (data) => alertDarkMachines(data),
    },
  ],
};

/* ---------------------------- reading the answers -------------------------- */

/**
 * Rows from an endpoint whose shape we refuse to assume.
 *
 * Maintenance answers bare arrays, Production answers `{items}` and the factory view
 * answers an object with a named array. Tolerating all three here rather than in three
 * reducers means a shape change shows up as "no tile" rather than as a thrown signal.
 */
function rowsOf(data: unknown, key?: string): readonly Record<string, unknown>[] | null {
  let list: unknown = data;
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const rec = data as Record<string, unknown>;
    list = key ? rec[key] : (rec["items"] ?? rec["data"]);
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

function n(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v !== "") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** How long ago, in words. Unparseable → null, never "NaN h". */
function since(iso: string | null): { minutes: number; text: string } | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const minutes = Math.floor((Date.now() - t) / 60_000);
  if (minutes < 0) return null;
  if (minutes < 60) return { minutes, text: `${minutes} min` };
  const h = Math.floor(minutes / 60);
  if (h < 24) return { minutes, text: minutes % 60 === 0 ? `${h} h` : `${h} h ${minutes % 60} min` };
  const d = Math.floor(h / 24);
  return { minutes, text: `${d} day${d === 1 ? "" : "s"} ${h % 24} h` };
}

/* ------------------------------- the signals ------------------------------- */

/**
 * What is not running, named rather than only counted.
 *
 * "2 machines down" sends somebody to look up which two. How long each has been down is
 * deliberately not totalled: an open stop has no duration until somebody says when the
 * machine came back, and a tile that added them up would be inventing endings.
 */
function reduceStopped(data: unknown): SignalValue | null {
  const rows = rowsOf(data);
  if (rows === null) return null;
  const open = rows.filter((r) => r["endedAt"] === null || r["endedAt"] === undefined);
  if (open.length === 0) return { value: "0", hint: "every machine is running", tone: "ok" };

  const impacting = open.filter((r) => r["productionImpacting"] === true).length;
  const codes = [...new Set(open.flatMap((r) => (str(r, "assetCode") ? [str(r, "assetCode")!] : [])))].sort();
  const named = codes.slice(0, 2).join(" · ");
  return {
    value: num(open.length),
    hint:
      codes.length > 2
        ? `${named} and ${num(codes.length - 2)} more · ${num(impacting)} stopping production`
        : `${named || "machine unresolved"} · ${num(impacting)} stopping production`,
    tone: impacting > 0 ? "bad" : "warn",
  };
}

/**
 * How much of what the plant has committed to make is made.
 *
 * NOT "today's output": a production order carries no due date and no shift, so no honest
 * reading of these rows can attribute a quantity to a day. This is the open book — every
 * live order's produced quantity against its target — and the hint says so rather than
 * letting a viewer read it as a daily figure.
 */
function reduceOutput(data: unknown): SignalValue | null {
  const rows = rowsOf(data);
  if (rows === null) return null;
  const finished = new Set(["completed", "cancelled", "closed"]);
  const live = rows.filter((r) => !finished.has((str(r, "status") ?? "").toLowerCase()));
  if (live.length === 0) {
    return { value: "0", hint: "no production order is open", tone: "neutral" };
  }
  let target = 0;
  let made = 0;
  for (const r of live) {
    const t = n(r, "qtyToProduce");
    const m = n(r, "producedQty");
    // One unreadable quantity and the tile is dropped. A total that silently excluded an
    // order would understate the plant's commitment, which is the direction that misleads.
    if (t === null || m === null) return null;
    target += t;
    made += m;
  }
  return {
    value: `${num(made)} / ${num(target)}`,
    hint: `across ${num(live.length)} open production order${live.length === 1 ? "" : "s"}; no due dates exist, so this is not a daily figure`,
    tone: "neutral",
    fraction: target > 0 ? Math.min(made / target, 1) : 0,
  };
}

/**
 * How much of the floor we can actually see.
 *
 * `evidenceStale` is the SERVER's freshness verdict, against a window that differs by
 * adapter mode — a simulator is allowed to be quieter than a live gateway. A machine with
 * no reading at all counts as stale, which is right: never having reported and having
 * stopped reporting are the same blindness.
 */
function reduceTelemetry(data: unknown): SignalValue | null {
  const rows = rowsOf(data, "assets");
  if (rows === null) return null;
  if (rows.length === 0) {
    return { value: "0", hint: "no machine is connected to this system yet", tone: "neutral" };
  }
  const fresh = rows.filter((r) => r["evidenceStale"] !== true);
  const running = fresh.filter((r) => str(r, "state") === "running").length;
  return {
    value: `${num(fresh.length)} / ${num(rows.length)}`,
    hint:
      fresh.length === rows.length
        ? `all reporting · ${num(running)} running`
        : `${num(rows.length - fresh.length)} not reporting · ${num(running)} of those seen are running`,
    tone: fresh.length === rows.length ? "ok" : fresh.length === 0 ? "bad" : "warn",
    fraction: fresh.length / rows.length,
  };
}

/* ------------------------------- the watches ------------------------------- */

/**
 * A MACHINE IS STOPPED AND NOBODY HAS RAISED WORK ON IT.
 *
 * Deliberately narrower than Maintenance's "a machine is down" bell, which rings for every
 * open interval. The fact this watch adds is the missing `mwoId`: the clock is running,
 * the cost is accruing, and no job exists, which means no technician has been assigned, no
 * SLA is ticking and nobody owns it. That gap is invisible on a downtime list — the row
 * looks exactly like a stop somebody is already fixing.
 *
 * Ordered longest-stopped first, because that is where the money has been going. Not by
 * criticality: a C-class machine down since Tuesday has usually cost more than an A-class
 * one down since breakfast, and the class is on the row anyway.
 */
function alertStoppedWithNoJob(data: unknown): readonly ModuleAlert[] {
  const rows = rowsOf(data);
  if (rows === null) return [];

  const unowned = rows
    .filter((r) => r["endedAt"] === null || r["endedAt"] === undefined)
    .filter((r) => r["mwoId"] === null || r["mwoId"] === undefined)
    .map((r) => ({ r, down: since(str(r, "startedAt")) }))
    .filter((x): x is { r: Record<string, unknown>; down: { minutes: number; text: string } } =>
      x.down !== null,
    )
    .sort((a, b) => b.down.minutes - a.down.minutes);

  const alerts: ModuleAlert[] = unowned.slice(0, ALERT_CAP).map(({ r, down }) => {
    const code = str(r, "assetCode") ?? "A machine";
    const name = str(r, "assetName");
    const impacting = r["productionImpacting"] === true;
    const reason = str(r, "reasonCode");
    return {
      // The downtime interval's own id: the same stop is the same alert on every poll, so
      // reading it once is enough — the only reason anybody keeps a bell switched on.
      id: `plantops.unowned-stop.${str(r, "id") ?? code}`,
      severity: impacting ? ("critical" as const) : ("urgent" as const),
      title: `${code}${name ? ` — ${name}` : ""} has been stopped ${down.text} with no job raised`,
      body: impacting
        ? "Production is stopped on this machine and no maintenance work order exists, so nobody is assigned and no restore deadline is running. Report it from Work orders and triage it into a job."
        : `Not marked as production-impacting${reason ? ` (${reason.replace(/_/g, " ")})` : ""}, but the downtime clock is running and no job owns it.`,
      href: "/plantops/work-orders",
      at: str(r, "startedAt") ?? undefined,
      evidence: `Downtime interval ${str(r, "id") ?? "(unidentified)"} on ${code}, open since ${
        str(r, "startedAt") ?? "an unrecorded time"
      }, with no maintenance work order linked to it.`,
    };
  });

  if (unowned.length > ALERT_CAP) {
    // Said out loud rather than truncated in silence. A tray showing eight of thirty and
    // not saying so reads as "eight", which is the more comfortable number and the wrong one.
    alerts.push({
      id: "plantops.unowned-stop.more",
      severity: "urgent" as const,
      title: `${unowned.length} machines are stopped with no job raised`,
      body: `The ${ALERT_CAP} stopped longest are listed above; the shift board has every one of them.`,
      href: "/plantops/shift-board",
      evidence: `${unowned.length} downtime intervals are open and none carries a maintenance work order id.`,
    });
  }
  return alerts;
}

/**
 * AN ENERGY METER HAS STOPPED REPORTING.
 *
 * `stale` is the server's own finding — no observed reading in sixty days — not a
 * comparison invented in a browser. It matters because a kWh meter is a cumulative counter:
 * a gap in the readings does not show up as a dip in a chart, it shows up as a bigger jump
 * later, and every per-day figure across the gap is a straight line the plant never ran.
 * Nobody notices until the bill is queried and there is nothing to check it against.
 *
 * Attention, not urgent: nothing is on fire, and a reading taken tomorrow closes it.
 */
function alertSilentEnergyMeters(data: unknown): readonly ModuleAlert[] {
  const rows = rowsOf(data);
  if (rows === null) return [];

  const silent = rows.flatMap((asset) => {
    const meters = asset["meters"];
    if (!Array.isArray(meters)) return [];
    const kwh = meters.filter(
      (m): m is Record<string, unknown> =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>)["meterType"] === "kwh" &&
        (m as Record<string, unknown>)["stale"] === true,
    );
    if (kwh.length === 0) return [];
    const code = str(asset, "assetCode");
    if (code === null) return [];
    return [{ code, name: str(asset, "name"), meter: kwh[0]! }];
  });

  const alerts: ModuleAlert[] = silent.slice(0, ALERT_CAP).map(({ code, name, meter }) => {
    const last = str(meter, "lastRealReadingAt");
    const quiet = since(last);
    return {
      id: `plantops.energy-meter-silent.${code}`,
      severity: "attention" as const,
      title: `${code}${name ? ` — ${name}` : ""} has no recent electricity reading`,
      body: quiet
        ? `The kWh counter was last actually read ${quiet.text} ago. Everything since is unaccounted for, and a per-day figure across the gap would be a straight line the plant never ran.`
        : "The kWh counter has never been read, so nothing on the energy screen can be attributed to this machine.",
      href: "/plantops/energy",
      at: last ?? undefined,
      evidence: `kWh meter on ${code}: counter at ${
        n(meter, "currentValue") ?? "an unrecorded value"
      }, last observed reading ${last ?? "never"}; the server marks it stale.`,
    };
  });

  if (silent.length > ALERT_CAP) {
    alerts.push({
      id: "plantops.energy-meter-silent.more",
      severity: "attention" as const,
      title: `${silent.length} machines have no recent electricity reading`,
      body: `The ${ALERT_CAP} listed above are a sample; the energy screen shows every meter and when each was last read.`,
      href: "/plantops/energy",
      evidence: `${silent.length} kWh meters are marked stale by the server.`,
    });
  }
  return alerts;
}

/**
 * THE PLANT HAS GONE DARK TO US.
 *
 * ONE alert, not one per machine, and that is the point: when six machines stop reporting
 * at once the cause is almost always the one gateway they share, and six bells would send
 * six people to look at six machines that are all running perfectly well. The alert names
 * the gateway when they share one.
 *
 * What is broken here is our SIGHT of the floor, not the floor. So the wording never claims
 * the machines are stopped — every figure on the OEE and shift screens that depends on this
 * evidence is what has actually gone missing, and both screens already refuse to compute
 * from stale rows.
 */
function alertDarkMachines(data: unknown): readonly ModuleAlert[] {
  const rows = rowsOf(data, "assets");
  if (rows === null || rows.length === 0) return [];

  const dark = rows.filter((r) => r["evidenceStale"] === true);
  if (dark.length === 0) return [];

  const gateways = [...new Set(dark.flatMap((r) => (str(r, "gatewayCode") ? [str(r, "gatewayCode")!] : [])))];
  const neverReported = dark.filter((r) => str(r, "observedAt") === null).length;
  const oldest = dark
    .flatMap((r) => {
      const seen = since(str(r, "observedAt"));
      return seen ? [seen] : [];
    })
    .sort((a, b) => b.minutes - a.minutes)[0];
  const everything = dark.length === rows.length;

  return [
    {
      // Stable while the same set is dark. Keyed on the codes rather than a count, so a
      // seventh machine going quiet is a NEW alert rather than a silently changed one.
      id: `plantops.telemetry-dark.${dark
        .flatMap((r) => (str(r, "assetCode") ? [str(r, "assetCode")!] : []))
        .sort()
        .join(",")}`,
      severity: everything ? ("urgent" as const) : ("attention" as const),
      title: everything
        ? `No machine is reporting — all ${dark.length} connected machines have gone quiet`
        : `${dark.length} of ${rows.length} connected machines are not reporting`,
      body: `${
        gateways.length === 1
          ? `All of them are on gateway ${gateways[0]}, so one link is the likely cause. `
          : ""
      }This does not mean they are stopped — it means nothing on this system can say what they are doing. Quality and cycle-time figures exclude them rather than counting them as perfect.${
        neverReported > 0
          ? ` ${neverReported} of them have never reported at all.`
          : ""
      }`,
      href: "/plantops/shift-board",
      evidence: `${dark.length} bound assets are marked evidenceStale by the server${
        oldest ? `; the quietest was last seen ${oldest.text} ago` : ""
      }${gateways.length > 0 ? ` (gateway ${gateways.join(", ")})` : ""}. Reporting window is set per adapter mode.`,
    },
  ];
}
