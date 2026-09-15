import { AppError } from "@spine/api/errors";

/**
 * PLANT OPERATIONS' own slice of the API. Nothing outside this folder imports it, and it
 * imports nothing from another module — which is what makes the folder deletable.
 *
 * THIS MODULE ADDS NO ENDPOINTS AND NO PERMISSIONS. Every path below already exists and is
 * already guarded; the connected package is a different set of JOURNEYS across the same
 * routes, not a second backend. That is deliberate and it is checkable: `pnpm perm-check`
 * fails on a permission no route enforces, and a module that minted its own would have
 * shipped a menu entry nobody could ever be granted.
 *
 * Three servers answer here and they do not agree on shape, so the differences are written
 * down rather than discovered:
 *
 *   - MAINTENANCE (`/maintenance/...`) answers BARE ARRAYS from its list routes, and several
 *     require `from` and `to` as `YYYY-MM-DD` — the reports refuse without them.
 *   - PRODUCTION (`/production/orders`) answers the platform's cursor envelope
 *     (`{items,nextCursor}`) and returns quantities as STRINGS, because `NUMERIC(18,3)`
 *     stores castings and no float is allowed near a count of them.
 *   - FACTORY CONNECT (`/integration/factory/views/production`) answers one object holding
 *     the latest machine telemetry. Every row carries its own `evidenceStale` and
 *     `evidenceAgeSeconds`, and this module never draws a machine signal without them: a
 *     stale reading rendered as a live one is the single most expensive lie a floor screen
 *     can tell.
 */

/* ============================== the asset register ========================== */

export interface AssetMeterRow {
  /** `run_hours`, `cycles`, `strokes`, `km`, `kwh`. */
  meterType: string;
  uom: string;
  currentValue: number;
  /** Units per day, from observed readings only. Null until there are two to compare. */
  dailyRateEst: number | null;
  lastRealReadingAt: string | null;
  /** The server's finding: no observed reading in 60 days. Every forecast off it is a guess. */
  stale: boolean;
}

export interface AssetRow {
  id: string;
  assetCode: string;
  name: string;
  assetType: string;
  /** `/PLANT/AREA/MACHINE` — the hierarchy, derived by the server, never sent by a client. */
  path: string;
  depth: number;
  criticality: string | null;
  status: string;
  workCenterRef: string | null;
  statutoryClass: string;
  warrantyActive: boolean;
  /** Non-null means the machine is down RIGHT NOW and the clock is still running. */
  openDowntimeId: string | null;
  meters: AssetMeterRow[];
  amc: {
    contractRef: string;
    vendorName: string | null;
    validTo: string;
    coverageType: string;
  } | null;
}

export interface AssetHistoryEvent {
  at: string;
  /** `mwo.breakdown`, `downtime.unplanned`, `meter.reading`, `pm.occurrence`, `spare.issued`. */
  type: string;
  /** On a meter reading this is the METER TYPE, not a document number. */
  ref: string;
  detail: string;
  amount?: number;
}

export interface AssetHistory {
  asset: { assetCode: string; name: string; criticality: string | null };
  events: AssetHistoryEvent[];
}

/* ============================ maintenance work ============================== */

export interface MwoTaskRow {
  sequence: number;
  instruction: string;
  isMandatory: boolean;
  resultValue: string | null;
  isPass: boolean | null;
  completedAt: string | null;
}

export interface MwoLabourRow {
  employeeRef: string;
  workType: string;
  startedAt: string;
  endedAt: string | null;
  hours: number | null;
  ratePerHour: number | null;
  rateSource: string | null;
  amount: number | null;
}

/**
 * The board and the detail return the SAME object. That is worth knowing before writing a
 * second request: `/maintenance/work-orders` already carries each job's tasks, labour and
 * spares, so the execution panel on this module's board needs no per-row fetch.
 */
export interface MwoRow {
  id: string;
  mwoNo: string;
  assetCode: string;
  assetName: string;
  mwoType: string;
  priority: string;
  status: string;
  title: string;
  primaryTechRef: string | null;
  reportedAt: string;
  actualStart: string | null;
  actualEnd: string | null;
  slaRestoreBy: string | null;
  /** The SERVER's finding against a deadline derived from the asset's criticality. */
  slaBreached: boolean;
  holdReason: string | null;
  isSafetyRelated: boolean;
  warrantyActive: boolean;
  amc: { contractRef: string; validTo: string; coverageType: string } | null;
  cost: {
    labour: number;
    spares: number;
    external: number;
    total: number;
    computedAt: string | null;
  };
  tasks: MwoTaskRow[];
  labour: MwoLabourRow[];
  spares: Array<{
    id: string;
    itemCode: string | null;
    qtyPlanned: number;
    qtyIssued: number;
    issueStatus: string;
    stockEntryRef: string | null;
    valuedAmount: number;
  }>;
  /** Non-null means the machine this job is on is still stopped. */
  openDowntimeId: string | null;
  approval: { required: boolean; reason: string | null; workflowInstanceId: string | null };
}

export interface RequestRow {
  requestNo: string;
  status: string;
  asset: { code: string; name: string; criticality: string | null };
  severity: string;
  symptomCode: string;
  requestedAt: string;
  derived: { priorityPreview: string; slaRespondBy: string; configRef: string };
  acknowledgedAt: string | null;
  slaBreached: boolean;
  downtime: { id: string; startedAt: string } | null;
  duplicateCandidates: Array<{ ref: string; kind: string; detail: string }>;
  /** Populated by triage. This is how a raise-then-triage journey learns the job's number. */
  mwoNo: string | null;
}

export interface DowntimeRow {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  startedAt: string;
  /** Null means the clock is STILL RUNNING, not that the stop had no end. */
  endedAt: string | null;
  durationMinutes: number | null;
  kind: string;
  productionImpacting: boolean;
  reasonCode: string | null;
  source: string;
  mwoId: string | null;
  corrected: boolean;
  disputed: boolean;
}

export interface ParetoRow {
  key: string;
  label: string;
  hours: number;
  count: number;
  ids: string[];
}

/**
 * The reliability answer. Every figure that cannot honestly be computed comes back NULL —
 * availability without a shift calendar, MTBF with no failures — and `notes` says why in
 * words. A null here is rendered as its note, never as a zero and never as a percentage.
 */
export interface KpiResponse {
  scope: { type: string; ref: string | null; label: string };
  period: { start: string; end: string };
  scheduledHours: number | null;
  downtimeUnplannedHours: number;
  downtimePlannedHours: number;
  operatingHours: number | null;
  failureCount: number;
  mtbfHours: number | null;
  mttrHours: number | null;
  availabilityPct: number | null;
  pmDueCount: number;
  pmCompletedInGrace: number;
  pmCompliancePct: number | null;
  scheduleAdherencePct: number | null;
  cost: { labour: number; spares: number; external: number; total: number };
  notes: string[];
  /** `entered`, `absent`, … — where the availability denominator came from. */
  scheduledHoursSource: string;
  computedAt: string;
}

/* ============================== production ================================== */

export interface ProductionOrderRow {
  id: string;
  orderNo: string;
  itemId: string;
  bomId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  /** NUMERIC(18,3) over the wire — a STRING, so no float ever rounds a casting count. */
  qtyToProduce: string;
  producedQty: string;
  status: string;
  /** When the order was raised. The schema carries no promised or due date. */
  createdAt: string;
  updatedAt: string;
}

/* ============================ factory telemetry ============================= */

/**
 * One bound machine, as the edge gateways last reported it.
 *
 * `goodCount` / `rejectCount` are the ONLY first-party quality counts in this product —
 * Production records rejects per operation, but only on an order's detail. `energyKwh` is
 * likewise the only live power reading. Both are nullable and often null; a machine that
 * has never reported one is not a machine producing zero.
 */
export interface FactoryAssetRow {
  assetCode: string;
  name: string;
  assetKind: string;
  siteCode: string | null;
  zoneCode: string | null;
  gatewayCode: string | null;
  /** The maintenance asset this telemetry belongs to — the join that makes it one register. */
  maintenanceAssetRef: string | null;
  workCenterRef: string | null;
  adapterMode: string;
  state: string;
  safetyState: string;
  observedAt: string | null;
  evidenceAgeSeconds: number | null;
  /** The server's freshness verdict, against a window that differs per adapter mode. */
  evidenceStale: boolean;
  activeProgram: string | null;
  productionOrderRef: string | null;
  cycleTimeSeconds: number | null;
  goodCount: number | null;
  rejectCount: number | null;
  energyKwh: number | null;
  alarmCode: string | null;
}

export interface FactoryProductionView {
  generatedAt: string;
  boundary: string;
  assets: FactoryAssetRow[];
  summary: { assets: number; constrained: number; exceededDwell: number; headline: string };
}

/* ================================= paths ==================================== */

/**
 * Every route this module calls. All of them existed before it did; none is new.
 *
 * Listed as one object so the answer to "what does Plant Operations touch" is a file, not a
 * search. A path that is not here is a path this module does not call.
 */
export const plantOpsApi = {
  /* maintenance — the asset register */
  assetsPath: "/maintenance/assets",
  assetPath: (code: string): string => `/maintenance/assets/${encodeURIComponent(code)}`,
  assetHistoryPath: (code: string): string =>
    `/maintenance/assets/${encodeURIComponent(code)}/history`,
  assetReadingsPath: (code: string): string =>
    `/maintenance/assets/${encodeURIComponent(code)}/readings`,

  /* maintenance — work */
  workOrdersPath: "/maintenance/work-orders",
  workOrderPath: (no: string): string => `/maintenance/work-orders/${encodeURIComponent(no)}`,
  mwoStartPath: (no: string): string =>
    `/maintenance/work-orders/${encodeURIComponent(no)}/start`,
  /** Resume takes the same body as start; a job on hold is restarted, not started again. */
  mwoResumePath: (no: string): string =>
    `/maintenance/work-orders/${encodeURIComponent(no)}/resume`,
  mwoHandbackPath: (no: string): string =>
    `/maintenance/work-orders/${encodeURIComponent(no)}/handback`,
  mwoCompletePath: (no: string): string =>
    `/maintenance/work-orders/${encodeURIComponent(no)}/complete`,
  mwoClosePath: (no: string): string =>
    `/maintenance/work-orders/${encodeURIComponent(no)}/close`,

  /* maintenance — the only way a work order is created */
  requestsPath: "/maintenance/requests",
  requestTriagePath: (no: string): string =>
    `/maintenance/requests/${encodeURIComponent(no)}/triage`,

  /* maintenance — the downtime ledger and what it adds up to */
  downtimePath: "/maintenance/downtime",
  downtimeParetoPath: "/maintenance/reports/downtime-pareto",
  kpisPath: "/maintenance/reports/kpis",

  /* production */
  productionOrdersPath: "/production/orders",

  /* factory connect — the machine signals */
  factoryProductionViewPath: "/integration/factory/views/production",
} as const;

/**
 * THE ENDPOINTS THIS PACKAGE WOULD NEED AND DOES NOT HAVE.
 *
 * Written down rather than worked around, because the workaround is what future readers
 * would otherwise inherit as if it were a design:
 *
 *   1. NO `GET /maintenance/failure-codes`. Completion of a breakdown or corrective job
 *      requires a failure mode, a cause and a detection method, and each is resolved against
 *      a tenant's own `failure_code` table — which no route exposes. The completion form
 *      therefore takes the codes as text and shows the server's refusal, naming the code it
 *      could not find. A hardcoded list in a browser would be a master data table nobody
 *      could maintain.
 *   2. NO `GET /maintenance/technicians` (or any employee list reachable with `mnt.*`). The
 *      start, labour and request routes all want an employee UUID. `rosterFromWorkOrders`
 *      below recovers the people ALREADY recorded against live jobs, which is honest and
 *      permission-clean, but it cannot offer somebody who has never been on one.
 *   3. NO `POST /maintenance/work-orders`. A maintenance job is created by triaging a
 *      request — that is the real path and this module uses it, rather than inventing a
 *      shortcut that the backend does not have.
 *   4. NO SHIFT CALENDAR ANYWHERE. Availability needs scheduled hours and per-shift energy
 *      needs shift boundaries; neither exists. Both screens say so instead of assuming 24×7.
 */

/* ================================ helpers =================================== */

/** `YYYY-MM-DD`, the only date shape the maintenance query parameters accept. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The default reporting window, in days.
 *
 * Ninety rather than thirty because MTBF over four weeks on a machine that fails twice a
 * quarter is a number computed from one event — and a number computed from one event will
 * be argued with, correctly.
 */
export const REPORT_WINDOW_DAYS = 90;

/** A window ending today, `days` long, in the shape the reports demand. */
export function windowOf(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

/**
 * Minutes as a person says them, with the exact count kept alongside.
 *
 * Downtime is the denominator of every availability argument two departments will ever
 * have, so the rounded reading and the exact one always travel together.
 */
export function durationText(minutes: number | null): { rounded: string; exact: string } {
  if (minutes === null) return { rounded: "Still down", exact: "clock still running" };
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return {
    rounded: h > 0 ? `${h} h ${m} min` : `${m} min`,
    exact: `${minutes} min exactly`,
  };
}

/** How long ago, in words a supervisor would use. Unparseable → null, never "NaN h". */
export function elapsedSince(iso: string | null): { minutes: number; text: string } | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const minutes = Math.floor((Date.now() - t) / 60_000);
  if (minutes < 0) return null;
  if (minutes < 60) return { minutes, text: `${minutes} min` };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return { minutes, text: m === 0 ? `${h} h` : `${h} h ${m} min` };
  const d = Math.floor(h / 24);
  return { minutes, text: `${d} day${d === 1 ? "" : "s"} ${h % 24} h` };
}

/** A NUMERIC string off the wire, as a number — or null, never a silent NaN. */
export function numeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The people already recorded against live maintenance work, as employee refs.
 *
 * The start, resume and labour routes all want an employee UUID and nothing in this
 * permission set can list employees (see the gap note above). What CAN be read is who is
 * already on the jobs — the assigned technician, and anybody whose time is booked. That is
 * a roster of people this plant demonstrably uses for maintenance, recovered from evidence
 * rather than guessed, and it is explicitly NOT an employee master: a new joiner is absent
 * from it until their first job, which is why the form also accepts a ref typed in.
 */
export function rosterFromWorkOrders(rows: readonly MwoRow[]): readonly string[] {
  const refs = new Set<string>();
  for (const row of rows) {
    if (row.primaryTechRef) refs.add(row.primaryTechRef);
    for (const l of row.labour) if (l.employeeRef) refs.add(l.employeeRef);
  }
  return [...refs].sort();
}

/** The kWh meters on an asset. Energy is a meter type, not a separate register. */
export function energyMeters(asset: AssetRow): readonly AssetMeterRow[] {
  return asset.meters.filter((m) => m.meterType === "kwh");
}

/* ================================== OEE ===================================== */

/**
 * WHY THIS IS A PURE FUNCTION AND NOT THREE LINES INSIDE A SCREEN.
 *
 * OEE is availability × performance × quality, and every factory that has ever bought a
 * dashboard has been shown one where a missing input was quietly treated as 100%. The
 * resulting figure is believable, wrong, and — because it is believable — never checked. A
 * plant that believes it runs at 78% when nobody has measured performance makes investment
 * decisions on a number this software invented.
 *
 * So the rule here is structural rather than remembered: this function returns a
 * PERCENTAGE ONLY when all three factors are present. Otherwise it returns the list of what
 * is missing and where each would have to come from, and the screen renders that list. No
 * default, no "assumed", no greyed-out estimate. A missing input is a fact about the plant's
 * instrumentation and it is worth seeing.
 *
 * It is written generally rather than hardcoded to this build's gaps. The day a standard
 * cycle time exists on a work centre, `performance` starts arriving and the composite starts
 * computing — with no edit here.
 */
export interface OeeFactor {
  /** 0–1, or null when it cannot honestly be computed. */
  value: number | null;
  /** What it was computed from, or what is absent. Always shown, present or not. */
  basis: string;
  /** Where the missing input would have to come from. Only when `value` is null. */
  wouldNeed?: string;
}

export interface OeeAssessment {
  availability: OeeFactor;
  performance: OeeFactor;
  quality: OeeFactor;
  /** 0–1 when all three are present. Null otherwise, and then `missing` says which. */
  oee: number | null;
  missing: readonly string[];
}

export function assessOee(input: {
  availability: OeeFactor;
  performance: OeeFactor;
  quality: OeeFactor;
}): OeeAssessment {
  const missing: string[] = [];
  if (input.availability.value === null) missing.push("Availability");
  if (input.performance.value === null) missing.push("Performance");
  if (input.quality.value === null) missing.push("Quality");

  // The multiplication happens in exactly one place, guarded by exactly one condition.
  const complete =
    input.availability.value !== null &&
    input.performance.value !== null &&
    input.quality.value !== null;

  return {
    ...input,
    oee: complete
      ? input.availability.value! * input.performance.value! * input.quality.value!
      : null,
    missing,
  };
}

/**
 * Availability from the reliability endpoint's own answer.
 *
 * `availabilityPct` is null whenever the server had no scheduled hours to divide by, and
 * this build has no shift calendar — so it is null unless somebody typed a figure in, which
 * `scheduledHoursSource` then says out loud. Uptime "out of 24×7" would flatter every plant
 * that runs one shift by a factor of three.
 */
export function availabilityFactor(kpis: KpiResponse | null): OeeFactor {
  if (kpis === null) {
    return {
      value: null,
      basis: "Not read yet.",
      wouldNeed: "The reliability report for this scope and window.",
    };
  }
  if (kpis.availabilityPct === null || !Number.isFinite(kpis.availabilityPct)) {
    return {
      value: null,
      basis: `Unanswerable: ${
        kpis.notes[0] ?? "no scheduled hours were available for this window"
      }`,
      wouldNeed:
        "Scheduled hours for the window — from a shift calendar, which this build does not have. Enter them above and the server will divide by what you entered, labelled as entered.",
    };
  }
  return {
    value: Math.min(kpis.availabilityPct / 100, 1),
    basis: `${kpis.downtimeUnplannedHours.toFixed(1)} h unplanned and ${kpis.downtimePlannedHours.toFixed(
      1,
    )} h planned stoppage against ${kpis.scheduledHours ?? 0} scheduled hours (${
      kpis.scheduledHoursSource
    }).`,
  };
}

/**
 * Performance needs an IDEAL cycle time, and nothing in this product records one.
 *
 * Telemetry reports the cycle time a machine is ACTUALLY achieving, which is half the
 * fraction. The other half — what it should achieve per unit — lives on no endpoint, on no
 * work centre and on no routing step. Schedule adherence exists on the reliability report
 * and is deliberately NOT substituted for it: "finished when planned" and "ran at rate" are
 * different claims, and a plant told the second when it was given the first would optimise
 * the wrong thing.
 */
export function performanceFactor(observed: readonly FactoryAssetRow[]): OeeFactor {
  const withCycle = observed.filter(
    (row) => !row.evidenceStale && row.cycleTimeSeconds !== null && row.cycleTimeSeconds > 0,
  );
  if (withCycle.length === 0) {
    return {
      value: null,
      basis: "No machine in this scope is reporting a cycle time.",
      wouldNeed:
        "An ideal cycle time per unit for the machine, AND an observed cycle time. Neither is recorded in this build: no work centre, routing step or item carries a standard rate.",
    };
  }
  const total = withCycle.reduce((sum, row) => sum + (row.cycleTimeSeconds ?? 0), 0);
  return {
    value: null,
    basis: `Observed cycle time is available — ${(total / withCycle.length).toFixed(1)} s average across ${
      withCycle.length
    } reporting machine${withCycle.length === 1 ? "" : "s"}. What it should be is not.`,
    wouldNeed:
      "An ideal (standard) cycle time per unit to divide the observed one by. No work centre, routing step or item master in this build carries one, so performance cannot be computed — only measured against nothing.",
  };
}

/**
 * Quality from the machines' own counters.
 *
 * Good and reject counts come off the edge gateways, which makes them the only first-party
 * quality figures in the product that are not somebody's data entry. STALE ROWS ARE
 * EXCLUDED, not zeroed: a machine that stopped reporting on Tuesday has not made zero
 * rejects since, and counting it as perfect is precisely the reassuring-direction error
 * this module refuses to make.
 */
export function qualityFactor(observed: readonly FactoryAssetRow[]): OeeFactor {
  const counted = observed.filter(
    (row) => !row.evidenceStale && (row.goodCount !== null || row.rejectCount !== null),
  );
  const good = counted.reduce((sum, row) => sum + (row.goodCount ?? 0), 0);
  const reject = counted.reduce((sum, row) => sum + (row.rejectCount ?? 0), 0);
  const total = good + reject;

  if (counted.length === 0 || total <= 0) {
    const stale = observed.filter((row) => row.evidenceStale).length;
    return {
      value: null,
      basis:
        counted.length === 0
          ? `No machine in this scope is reporting good or reject counts${
              stale > 0 ? ` (${stale} machine${stale === 1 ? " has" : "s have"} stale evidence)` : ""
            }.`
          : "The machines reporting counts have produced nothing in this scope.",
      wouldNeed:
        "Good and reject counts from the machine, or completed production operations carrying an output and a rejected quantity.",
    };
  }
  return {
    value: good / total,
    basis: `${good} good and ${reject} rejected, counted by ${counted.length} machine${
      counted.length === 1 ? "" : "s"
    } currently reporting fresh evidence.`,
  };
}

/* ============================= refused writes =============================== */

/**
 * A refusal, in the terms of the person who pressed the button.
 *
 * The four situations the API distinguishes are genuinely different and are fixed by
 * different people: something broke, you are not allowed, what you typed is wrong, somebody
 * got there first. Collapsing them into "an error occurred" is how a product teaches its
 * users that its messages are noise.
 */
export interface FailureNotice {
  title: string;
  body: string;
  /** Every unmet condition, in order, when the server sent a checklist rather than a reason. */
  checklist: readonly string[];
  missingPermission: string | null;
  traceId: string | null;
  /** True when the document moved on: reload, do not retry. */
  stale: boolean;
}

export type PlantOpsAction =
  | "raise"
  | "triage"
  | "start"
  | "handback"
  | "complete"
  | "close"
  | "reading";

const ACTION_NOUN: Readonly<Record<PlantOpsAction, string>> = {
  raise: "raising this report",
  triage: "turning this report into a job",
  start: "starting this job",
  handback: "handing this machine back",
  complete: "completing this job",
  close: "closing this job",
  reading: "recording this meter reading",
};

export function describeFailure(error: unknown, action: PlantOpsAction): FailureNotice {
  const base: FailureNotice = {
    title: "The request was refused.",
    body: "",
    checklist: [],
    missingPermission: null,
    traceId: null,
    stale: false,
  };
  const app = error instanceof AppError ? error : null;
  if (!app) {
    return {
      ...base,
      title: error instanceof Error ? error.message : "Something went wrong.",
      body: `Nothing was changed by ${ACTION_NOUN[action]}.`,
    };
  }
  const notice: FailureNotice = { ...base, traceId: app.traceId ?? null };

  switch (app.code) {
    /**
     * The completion gate. The server returns EVERY unmet condition in one response
     * precisely so a screen can render a checklist — showing one at a time would have a
     * technician resubmitting four times to discover four things.
     */
    case "MWO_COMPLETION_BLOCKED":
      return {
        ...notice,
        title: "This job is not ready to be completed.",
        body: "Everything still outstanding is listed below. The job is unchanged until all of it is done.",
        checklist: app.details.map((d) =>
          d.field === "downtime_open"
            ? `The machine has not been handed back — ${d.message}`
            : d.field === "no_labour_recorded"
              ? `Nobody's time is recorded on this job — ${d.message}`
              : `${d.field.replace(/_/g, " ")}: ${d.message}`,
        ),
      };
    case "MWO_INVALID_TRANSITION":
      return {
        ...notice,
        stale: true,
        title: "This job is not in a state that allows that.",
        body: `${app.message} Somebody else has moved it on since this screen was opened — reload to see where it has got to.`,
      };
    case "MWO_APPROVAL_PENDING":
      return {
        ...notice,
        title: "This job needs an approval before it can be closed.",
        body: `${app.message} Closure is waiting on the approval route, not on anything on this screen.`,
      };
    case "ASSET_NOT_MAINTAINABLE":
      return {
        ...notice,
        title: "That is a grouping, not a machine.",
        body: `${app.message}`,
      };
    case "IDEMPOTENCY_KEY_MISMATCH":
      return {
        ...notice,
        stale: true,
        title: "This form has already been submitted once.",
        body: `${app.message} Reload before trying again — the first submission may well have worked.`,
      };
    default:
      break;
  }

  switch (app.kind) {
    case "forbidden":
      return {
        ...notice,
        title: `You are not allowed to do that.`,
        body: `Ask your administrator for the permission named below. Nothing was changed by ${ACTION_NOUN[action]}.`,
        missingPermission: app.missingPermission,
      };
    case "validation":
      return {
        ...notice,
        title: "Something in the form was refused.",
        body: app.message,
        checklist: app.details.map((d) => `${d.field}: ${d.message}`),
      };
    case "not_found":
      return {
        ...notice,
        // The common case by far: a failure code that this tenant's code list does not hold.
        title: "The server could not find something this refers to.",
        body: `${app.message} Check the code against the plant's own list — this screen cannot show it, because no endpoint publishes it.`,
      };
    case "conflict":
      return {
        ...notice,
        stale: true,
        title: "Somebody got there first.",
        body: `${app.message} Reload rather than retrying.`,
      };
    case "network":
      return {
        ...notice,
        title: "Could not reach the server.",
        body: `It is not known whether ${ACTION_NOUN[action]} took effect. Reload before trying again.`,
      };
    default:
      return {
        ...notice,
        title: "Something went wrong at our end.",
        body: app.message,
      };
  }
}
