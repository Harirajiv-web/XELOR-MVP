/**
 * Maintenance's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * Every list route here answers a BARE ARRAY, not a paged envelope. Several also take
 * REQUIRED query parameters — `from` and `to` on the asset history and on both reports —
 * and answer 400 or worse without them, so the screens that call those always supply a
 * window rather than letting the server guess.
 */

export interface AssetMeter {
  meterType: string;
  uom: string;
  currentValue: number;
  /** Units per day, from observed readings only. Null until there are two to compare. */
  dailyRateEst: number | null;
  lastRealReadingAt: string | null;
  /** No observed reading in 60 days — every forecast off this meter is a guess. */
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
  meters: AssetMeter[];
  amc: { contractRef: string; vendorName: string | null; validTo: string; coverageType: string } | null;
}

export interface AssetHistoryEvent {
  at: string;
  /** `mwo.breakdown`, `downtime.unplanned`, `meter.reading`, `pm.occurrence`, `spare.issued`. */
  type: string;
  ref: string;
  detail: string;
  amount?: number;
}

export interface AssetHistory {
  asset: { assetCode: string; name: string; criticality: string | null };
  events: AssetHistoryEvent[];
}

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
  slaBreached: boolean;
  holdReason: string | null;
  isSafetyRelated: boolean;
  warrantyActive: boolean;
  amc: { contractRef: string; validTo: string; coverageType: string } | null;
  cost: { labour: number; spares: number; external: number; total: number; computedAt: string | null };
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
  /** Priority and the respond-by deadline are DERIVED from the criticality matrix, not chosen. */
  derived: { priorityPreview: string; slaRespondBy: string; configRef: string };
  acknowledgedAt: string | null;
  slaBreached: boolean;
  downtime: { id: string; startedAt: string } | null;
  duplicateCandidates: Array<{ ref: string; kind: string; detail: string }>;
  mwoNo: string | null;
}

export interface DowntimeRow {
  id: string;
  assetId: string;
  /** The list route joins the asset, so the ledger can name the machine that stopped. */
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

export interface PmOccurrenceRow {
  pmsCode: string;
  occurrenceSeq: number;
  dueDate: string | null;
  dueBasis: string | null;
  status: string;
  mwoNo: string | null;
  withinGrace: boolean | null;
}

/**
 * The reliability answer. Every figure that cannot honestly be computed comes back NULL —
 * availability without a shift calendar, MTBF with no failures — and `notes` says why in
 * words. A null here is rendered as its note, never as a zero.
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
  inputs: { downtimeRowIds: string[]; failureRowIds: string[]; occurrenceIds: string[]; mwoIds: string[] };
  formulas: Record<string, string>;
  notes: string[];
  inputsDigest: string;
  scheduledHoursSource: string;
  computedAt: string;
}

export interface ParetoRow {
  key: string;
  label: string;
  hours: number;
  count: number;
  ids: string[];
}

export const maintenanceApi = {
  assetsPath: "/maintenance/assets",
  assetPath: (code: string): string => `/maintenance/assets/${encodeURIComponent(code)}`,
  assetHistoryPath: (code: string): string =>
    `/maintenance/assets/${encodeURIComponent(code)}/history`,
  workOrdersPath: "/maintenance/work-orders",
  requestsPath: "/maintenance/requests",
  downtimePath: "/maintenance/downtime",
  pmOccurrencesPath: "/maintenance/pm-occurrences",
  kpisPath: "/maintenance/reports/kpis",
  downtimeParetoPath: "/maintenance/reports/downtime-pareto",
} as const;

/** `YYYY-MM-DD`, which is the only date shape the maintenance query parameters accept. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The default window: the last 90 days, ending today.
 *
 * Ninety days rather than a month because MTBF over four weeks on a machine that fails
 * twice a quarter is a number computed from one event, and a number computed from one event
 * will be argued with — correctly.
 */
export function defaultWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 86_400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

/**
 * Minutes as a person says them: "4 h 35 min", with the exact minute count kept alongside.
 *
 * Downtime is Production's OEE input and the denominator of every availability argument the
 * two departments will ever have, so the rounded reading and the exact one always travel
 * together. An abbreviation nobody can check is an abbreviation nobody should trust.
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
