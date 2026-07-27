/**
 * AI Operations' own slice of the API. Nothing outside this folder imports it, and it
 * imports nothing from another module — which is what makes the folder deletable.
 *
 * Transcribed from `apps/api/src/modules/aiops/`. Note the envelope: every LIST endpoint
 * in this controller answers `{ data: [...] }`, and the two single-object endpoints
 * (`/aiops/cost`, `/aiops/kill-switch/:featureKey`) answer the object bare. Getting that
 * wrong is a screen that renders nothing and blames the backend.
 */

/** Every list endpoint on this controller wraps its rows. There is no cursor on any of them. */
export interface Envelope<T> {
  data: T[];
}

/**
 * One of the eight registered AI features — `GET /aiops/registry`.
 *
 * The registry is CLOSED: the router keys on `featureKey` and a call for a key that is not
 * in this list makes zero provider calls. `ifSwitchedOff` is the sentence a Head of Ops
 * actually needs, and the backend composes it from `degradedMode` rather than leaving it
 * to a screen to invent.
 */
export interface RegistryFeature {
  key: string;
  /** The DECISIONS-V2 ordinal, e.g. "AI #2". */
  ref: string;
  ownerModule: string;
  displayName: string;
  status: string;
  /** 1 advisory · 2 may draft a record for approval · 3 advisory-only-forever. Null when the module declares no AI. */
  riskTier: number | null;
  dataClass: string;
  deterministicBaseline: string;
  degradedMode: string;
  rolloutStage: string;
  rolloutReason: string | null;
  lastEvalVerdict: string | null;
  lastEvalAt: string | null;
  ifSwitchedOff: string;
}

/**
 * `GET /aiops/kill-switch` for every registered feature, or `/:featureKey` for one.
 *
 * `routingAllowed: false` does not mean the feature is broken. It means calls are refused
 * at the chokepoint and the feature has fallen to its degraded mode, which is the whole
 * point of the control.
 */
export interface KillSwitchState {
  featureKey: string;
  routingAllowed: boolean;
  reason: string;
}

/** `GET /aiops/providers` */
export interface ProviderRow {
  code: string;
  name: string;
  kind: string;
  region: string;
  status: string;
  /** Contractual confirmation that our data is excluded from the provider's training. */
  trainingExclusionConfirmed: boolean;
  models: ReadonlyArray<{ code: string; tier: string }>;
  residencyNote: string;
}

/**
 * `GET /aiops/evals` — the gate that decides whether a feature may ship.
 *
 * `verdict` is `pass` only when the candidate beat the baseline by at least the tolerance
 * AND no must-pass case failed. There is no force flag anywhere in the API.
 */
export interface EvalRun {
  featureKey: string;
  datasetVersion: string;
  metric: string;
  baseline: number;
  candidate: number;
  tolerance: number;
  verdict: string;
  /** Cases that must never fail. A non-empty list is a fail on its own. */
  mustPassFailures: readonly string[];
  failureClusters: ReadonlyArray<{ label: string; count: number }>;
  /** First 12 characters — the gate is bound to the exact prompt content it tested. */
  promptContentHash: string | null;
  runAt: string;
}

/** `GET /aiops/cost?from&to` — both parameters are REQUIRED; the API answers 422 without them. */
export interface CostFeature {
  featureKey: string;
  calls: number;
  cost: number;
  costPerCall: number;
  /** Share of reviewed answers a human accepted. Null when nothing has been reviewed. */
  acceptanceRate: number | null;
  fallbackRate: number;
}

export interface CostDashboard {
  from: string;
  to: string;
  totalCost: number;
  features: readonly CostFeature[];
  headline: string;
}

/** `GET /aiops/hitl?status=` — drafts waiting for a person. */
export interface HitlItem {
  id: string;
  featureKey: string;
  docType: string | null;
  docRef: string | null;
  reason: string;
  confidence: number | null;
  proposed: unknown;
  correlationId: string;
}

/** `GET /aiops/incidents` — the whole row, so more fields exist than are shown. */
export interface IncidentRow {
  id: string;
  incidentNo: string;
  featureKey: string | null;
  severity: string;
  title: string;
  description: string;
  detectedAt: string;
  status: string;
  actionTaken: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export const aiopsApi = {
  registryPath: "/aiops/registry",
  providersPath: "/aiops/providers",
  evalsPath: "/aiops/evals",
  costPath: "/aiops/cost",
  hitlPath: "/aiops/hitl",
  incidentsPath: "/aiops/incidents",
  killSwitchesPath: "/aiops/kill-switch",
} as const;

/**
 * Rollout stage → badge tone, mapped by hand.
 *
 * `toneFor()` reads these as unknown, and the ordering matters here: "general" is not the
 * same kind of good as "approved", and "rolled_back" needs to read as a stop rather than as
 * a neutral state somebody might advance out of without asking why it was rolled back.
 */
export const ROLLOUT_TONE: Readonly<Record<string, "draft" | "pending" | "progress" | "done" | "rejected" | "unknown">> = {
  off: "unknown",
  internal: "draft",
  pilot: "progress",
  general: "done",
  rolled_back: "rejected",
};
