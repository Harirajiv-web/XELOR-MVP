/**
 * Integration's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * Read off the services, not guessed. Three envelope shapes appear here and they are NOT
 * interchangeable:
 *   `/integration/connections`, `/connectors`, `/flows`, `/ewaybill`, `/webhooks` → `{data}`
 *   `/integration/dlq`                                                            → a summary object with `entries`
 *   `/integration/einvoice/window-watch`                                           → a summary object with `rows`
 */

/* ------------------------------ configuration ---------------------------- */

export interface ConnectionRow {
  name: string;
  /** The connector code this connection is an instance of. */
  connector: string;
  environment: string;
  /** live | fake. `fake` runs the whole pipeline without anything leaving the building. */
  adapterMode: string;
  endpointUrl: string | null;
  secondaryEndpointUrl: string | null;
  /** The credential is NAMED, never revealed. There is no field that could carry a secret. */
  credential: string | null;
  /** healthy | degraded | down */
  healthStatus: string;
  /** closed | half_open | open */
  circuitState: string;
  consecutiveFailures: number;
  note: string | null;
}

export interface ConnectorRow {
  code: string;
  name: string;
  category: string;
  protocol: string;
  direction: string;
  capabilities: readonly string[] | null;
  status: string | null;
}

export interface FlowRow {
  code: string;
  name: string;
  triggerType: string;
  canonicalEntity: string;
  /** active | paused */
  status: string;
  pauseReason: string | null;
  /** A statutory flow gets a harder replay guard than telemetry. */
  isStatutory: boolean;
  slaMs: number | null;
  mappingCount: number;
}

/* --------------------------------- the DLQ ------------------------------- */

export interface DlqEntryRow {
  id: string;
  flowCode: string;
  correlationId: string;
  /** validation | transform | auth | timeout | rate_limit | remote_error | unknown */
  category: string;
  severity: string;
  isStatutory: boolean;
  /** True when the far side may already have acted on the message. */
  sideEffectPossible: boolean;
  suggestedAction: string;
  replayAllowed: boolean;
  replayRequiresConfirmation: boolean;
  replayVerdict: string;
}

/** `/integration/dlq` answers the summary itself, not a `{data}` envelope. */
export interface DlqSummary {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  replayableNow: number;
  needsHumanFirst: number;
  headline: string;
  entries: DlqEntryRow[];
}

/* -------------------------------- statutory ------------------------------ */

export interface WindowWatchRow {
  invoiceRef: string;
  docDate: string;
  status: string;
  applicable: boolean;
  deadlineAt: string | null;
  daysRemaining: number | null;
  /** 0–3. 3 is the last two days before the invoice can never be reported. */
  alertLevel: number;
  blocked: boolean;
  message: string;
}

export interface WindowWatch {
  asOf: string;
  watching: number;
  blocked: number;
  critical: number;
  rows: WindowWatchRow[];
  headline: string;
}

export interface EwayBillRow {
  shipmentRef: string;
  ewbNo: string | null;
  /** ewb1 | ewb2. A bill must be cancelled on the portal that made it. */
  portalUsed: string | null;
  status: string;
  closureStatus: string | null;
  distanceKm: number;
  validUpto: string | null;
  daysValid: number;
  expired: boolean;
  message: string;
}

/* -------------------------------- webhooks ------------------------------- */

export interface WebhookRow {
  subscriberName: string;
  targetUrl: string;
  eventNames: readonly string[];
  /** active | auto_paused | disabled */
  status: string;
  consecutiveFailures: number;
  rotationGraceUntil: string | null;
  deliveries: number;
  note: string | null;
}

export interface DataEnvelope<T> {
  data: T[];
}

export const integrationApi = {
  connectionsPath: "/integration/connections",
  connectorsPath: "/integration/connectors",
  flowsPath: "/integration/flows",
  dlqPath: "/integration/dlq",
  windowWatchPath: "/integration/einvoice/window-watch",
  ewayBillPath: "/integration/ewaybill",
  webhooksPath: "/integration/webhooks",
  factoryOverviewPath: "/integration/factory/views/integration",
} as const;

/**
 * The circuit breaker's three states, made legible without relying on colour.
 *
 * An operations person scanning this list needs to know one thing at a glance — is traffic
 * going out — and the word carries it. `open` is the counter-intuitive one: the circuit is
 * open, so nothing flows, which reads backwards to anybody who has not wired a house. The
 * label says what it MEANS rather than what it is called.
 */
export function circuitLabel(state: string): string {
  switch (state) {
    case "open":
      return "Open — calls blocked";
    case "half_open":
      return "Half-open — trialling";
    case "closed":
      return "Closed — calls flowing";
    default:
      return state;
  }
}

export function circuitTone(state: string): "rejected" | "pending" | "done" | "unknown" {
  switch (state) {
    case "open":
      return "rejected";
    case "half_open":
      return "pending";
    case "closed":
      return "done";
    default:
      return "unknown";
  }
}

/** Severity words the eight-state badge language has never seen. Mapped once, explicitly. */
export function severityTone(level: string): "rejected" | "overdue" | "pending" | "unknown" {
  switch (level) {
    case "critical":
      return "rejected";
    case "high":
      return "overdue";
    case "medium":
      return "pending";
    default:
      return "unknown";
  }
}
