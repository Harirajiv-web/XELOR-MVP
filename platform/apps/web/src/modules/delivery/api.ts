/**
 * DELIVERY & MANAGED SERVICES — this module's own slice of the API.
 *
 * Nothing outside this folder imports it, and it imports nothing from another module, which
 * is what makes the folder deletable. Every path below is a route that already exists and is
 * already enforced; this module adds NO endpoint, NO permission and NO table.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE IS, AND THE ONE SENTENCE THAT KEEPS IT HONEST
 * ---------------------------------------------------------------------------
 * Five service offerings — setup and migration, integration and data operations, factory
 * commissioning, ongoing support, managed IT/OT security — are ONE engagement lifecycle:
 * migrate, integrate, commission, support, secure. Twenty of their twenty-one capabilities
 * are people work. Almost none of it is product code, and pretending otherwise is the
 * failure mode this whole folder is shaped to avoid.
 *
 * So the software here is the EVIDENCE SPINE that makes people work repeatable and sellable.
 * It is NOT a simulation of the service. A screen that renders a coverage calendar has not
 * staffed a shift; a screen that lists connectors has not made them supported. Every screen
 * in this module therefore does one of exactly two things with each fact it shows:
 *
 *   READ IT from a record the platform already keeps — a connection's circuit state, a
 *   dead letter's replay verdict, an import batch's row outcomes, an incident's CERT-In
 *   clock, a backup's restore test. These are labelled as records and can be checked.
 *
 *   PRESENT IT as a structured commitment that a PERSON must make and record elsewhere —
 *   stop criteria, escalation names, coverage hours, price lines. These are labelled, on
 *   screen, as not stored. There is no table for them and this module may not create one.
 *
 * The second category is the dangerous one, because a well-drawn template of an SLA looks
 * exactly like an SLA. `notStored()` below exists to make the distinction impossible to
 * render by accident: it produces the wording, and the screens use nothing else.
 *
 * ---------------------------------------------------------------------------
 * ENVELOPE SHAPES — read off the services, not guessed. They are NOT interchangeable.
 * ---------------------------------------------------------------------------
 *   `{ data: T[] }`     /integration/connections · /connectors · /flows · /webhooks
 *                       /admin/incidents · /admin/settings · /admin/backups
 *                       /admin/audit/verifications
 *   `{ items, nextCursor }` /dataimport/batches · /general/companies
 *   a bare summary object   /integration/dlq · /integration/factory/views/integration
 *                           /admin/posture · /dataimport/batches/:id
 */

/* ========================================================================== */
/* THE ROUTES. Every one already exists; see the permission named beside it.   */
/*                                                                            */
/* This map is EXACTLY what the module calls — no aspirational entries. A path */
/* constant for a route nothing reads is a claim that the screen consults it,  */
/* and in a package about what the software can honestly evidence that is the */
/* wrong kind of dead code to leave lying around.                              */
/* ========================================================================== */

export const deliveryApi = {
  /** `general.company.read` — the legal entities and sites an engagement is actually for. */
  companiesPath: "/general/companies",

  /** `integration.connector.read` — the catalogue of adapters this build contains. */
  connectorsPath: "/integration/connectors",
  /** `integration.connector.read` — configured instances, with health and circuit state. */
  connectionsPath: "/integration/connections",
  /**
   * `integration.flow.manage` — record a call outcome and move the breaker.
   *
   * This is the ONLY write in this module that touches connectivity, and it is offered on
   * one screen for one purpose: the commissioning interruption test. It is never offered
   * for a `live` connection — see `mayRehearseInterruption` below.
   */
  connectionOutcomePath: (name: string, outcome: "success" | "failure"): string =>
    `/integration/connections/${encodeURIComponent(name)}/outcome/${outcome}`,

  /** `integration.flow.read` — flows, their status and the reason any is paused. */
  flowsPath: "/integration/flows",

  /** `integration.message.read` — the recovery backlog, with a replay verdict per entry. */
  dlqPath: "/integration/dlq",
  /** `integration.dlq.replay` — send it again, subject to the verdict. */
  dlqReplayPath: (id: string): string => `/integration/dlq/${encodeURIComponent(id)}/replay`,
  /** `integration.dlq.replay` — close it with a note, without sending anything. */
  dlqResolvePath: (id: string): string => `/integration/dlq/${encodeURIComponent(id)}/resolve`,
  /** `integration.message.read` — one correlation id end to end, with timestamps. */
  tracePath: (correlationId: string): string =>
    `/integration/messages/trace/${encodeURIComponent(correlationId)}`,

  /** `integration.webhook.manage` — outbound subscribers and their delivery failures. */
  webhooksPath: "/integration/webhooks",

  /** `integration.factory-connect.read` — installed gateways, heartbeats, command records. */
  factoryViewPath: "/integration/factory/views/integration",

  /** `integration.flow.read` — what a spreadsheet row is allowed to become. */
  importTargetsPath: "/dataimport/targets",
  /** `integration.flow.read` — every migration load ever run in this tenant. */
  importBatchesPath: "/dataimport/batches",
  /** `integration.flow.read` — one load, row by row, including the refused rows. */
  importBatchPath: (id: string): string => `/dataimport/batches/${encodeURIComponent(id)}`,

  /** `admin.incident.write` — security incidents with their statutory reporting clock. */
  incidentsPath: "/admin/incidents",
  /** `admin.settings.write` — settings with their statutory floors and the floor's source. */
  settingsPath: "/admin/settings",
  /** `admin.settings.write` — backup jobs, residency, and whether a restore was ever proven. */
  backupsPath: "/admin/backups",
  /** `admin.access.read` — the control-plane posture summary. */
  posturePath: "/admin/posture",
  /** `admin.audit.read` — the history of audit-chain verifications. */
  auditVerificationsPath: "/admin/audit/verifications",
} as const;

export const DELIVERY_PAGE_SIZE = 25;

/* ========================================================================== */
/* ROW TYPES — read off the services that produce them.                       */
/* ========================================================================== */

export interface DataEnvelope<T> {
  data: T[];
}

export interface CompanyRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  createdAt: string;
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

export interface ConnectionRow {
  name: string;
  connector: string;
  environment: string;
  /**
   * `live` | `fake`. The single most load-bearing field in this module.
   *
   * A `fake` connection runs the entire pipeline — mapping, circuit breaker, retry,
   * dead-letter, audit — without anything leaving the building. That makes it the right
   * way to rehearse an outage and the WRONG thing to describe to a customer as a working
   * integration with their system. `interoperabilityClaim()` below is the only wording
   * this module uses about it.
   */
  adapterMode: string;
  endpointUrl: string | null;
  secondaryEndpointUrl: string | null;
  /** NAMED, never revealed. There is no field here that could carry a secret. */
  credential: string | null;
  /** healthy | degraded | down */
  healthStatus: string;
  /** closed | half_open | open */
  circuitState: string;
  consecutiveFailures: number;
  note: string | null;
}

export interface FlowRow {
  code: string;
  name: string;
  triggerType: string;
  canonicalEntity: string;
  /** active | paused */
  status: string;
  pauseReason: string | null;
  isStatutory: boolean;
  slaMs: number | null;
  mappingCount: number;
}

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

export interface DlqSummary {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  replayableNow: number;
  needsHumanFirst: number;
  headline: string;
  entries: readonly DlqEntryRow[];
}

export interface TraceMessage {
  flowCode: string;
  direction: string;
  status: string;
  entityRef: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  ts: string;
}

export interface TraceAttempt {
  attemptNo: number;
  outcome: string;
  category: string | null;
  responseCode: number | null;
  detail: string | null;
}

export interface MessageTrace {
  correlationId: string;
  messages: readonly TraceMessage[];
  attempts: readonly TraceAttempt[];
  deadLetters: readonly {
    id: string;
    category: string;
    severity: string;
    status: string;
    suggestedAction: string;
  }[];
}

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

export interface CircuitVerdict {
  connection: string;
  state: string;
  allowRequest: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  changed: boolean;
  message: string;
}

/* ------------------------------ commissioning ----------------------------- */

export interface GatewayRow {
  code: string;
  name: string;
  siteCode: string | null;
  zoneCode: string | null;
  /** simulator | edge | … — what is actually installed, not what was quoted. */
  deploymentMode: string;
  softwareVersion: string | null;
  healthStatus: string;
  reportedHealthStatus: string;
  heartbeatStale: boolean;
  /** The API's own sentence about what the heartbeat is evidence OF. Rendered verbatim. */
  heartbeatSource: string;
  lastHeartbeatAt: string | null;
  commandMode: string;
  capabilities: readonly string[] | null;
}

export interface FactoryCommandRow {
  commandKey: string;
  capability: string;
  status: string;
  simulated: boolean;
  approvalRef: string;
  createdAt: string;
  result: unknown;
}

export interface FactoryIntegrationView {
  generatedAt: string;
  /** The API states its own boundary. This module never paraphrases it. */
  boundary: string;
  gateways: readonly GatewayRow[];
  commands: readonly FactoryCommandRow[];
  summary: {
    assets: number;
    constrained: number;
    exceededDwell: number;
    headline: string;
  };
}

/* -------------------------------- migration ------------------------------- */

export type ImportBatchStatus = "running" | "completed" | "partial" | "failed";

export type ImportRowStatus =
  | "accepted"
  | "rejected"
  | "imported"
  | "failed"
  | "duplicate_suspected"
  | "skipped";

export interface ImportBatchListRow {
  id: string;
  sourceKind: string;
  filename: string;
  fileKind: string;
  sheetName: string;
  target: string;
  status: ImportBatchStatus;
  resumable: boolean;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  importedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface ImportBatchRow {
  rowNo: number;
  status: ImportRowStatus;
  groupKey: string | null;
  issues: readonly { field: string; label: string; kind: string; message: string; value: string }[] | null;
  values: Readonly<Record<string, unknown>> | null;
  raw: Readonly<Record<string, string>> | null;
  resultId: string | null;
  /** The number a person would quote: SO-2627-00005, CUST-BAC. */
  resultRef: string | null;
  importedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface ImportBatchDetail {
  id: string;
  source: { kind: string; filename: string; fileKind: string; byteSize: number };
  sheetName: string;
  target: string;
  mapping: Readonly<Record<string, string>>;
  onDuplicate: "skip" | "import_anyway";
  status: ImportBatchStatus;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  importedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
  summary: {
    imported: number;
    failed: number;
    rejected: number;
    duplicatesHeld: number;
    stillPending: number;
  };
  resumable: boolean;
  rows: readonly ImportBatchRow[];
}

export interface ImportFieldSpec {
  field: string;
  label: string;
  type: string;
  required: boolean;
  help?: string;
}

export interface ImportTargetSpec {
  key: string;
  label: string;
  /** One line: what one row becomes. */
  creates: string;
  description: string;
  fields: readonly ImportFieldSpec[];
}

export interface ImportTargetsResponse {
  targets: readonly ImportTargetSpec[];
}

/* --------------------------------- support -------------------------------- */

export interface IncidentRow {
  incidentNo: string;
  title: string;
  severity: string;
  category: string;
  recordStatus: string;
  piiAffected: boolean;
  containmentNote: string | null;
  detectedAt: string;
  certInDueAt: string;
  certInReportable: boolean;
  dpdpBoardDueAt: string | null;
  certInHoursRemaining: number;
  breached: boolean;
  /** not_reportable | reported | breached | urgent | on_track */
  status: string;
  message: string;
}

export interface SettingRow {
  key: string;
  value: string;
  valueType: string;
  /** Non-null when a statute sets a minimum. The floor is not ours to lower. */
  statutoryFloor: number | null;
  /** Which statute. "CERT-In Directions 2022", "DPDP readiness". */
  floorSource: string | null;
  description: string | null;
}

export interface BackupRow {
  name: string;
  schedule: string;
  target: string;
  region: string;
  encryption: string;
  retentionPolicy: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRestoreTestAt: string | null;
  restorePreservedChain: boolean | null;
  /** "India" or an explicit residency problem. The API's own wording. */
  residency: string;
  /** Whether a restore has ever been PROVEN, in the API's own wording. */
  assurance: string;
}

export interface PostureSummary {
  asOf: string;
  activeUsers: number;
  usersWithoutMfa: number;
  liveSessions: number;
  recentFailedLogins: number;
  issues: readonly string[];
  headline: string;
}

export interface ChainVerificationRow {
  id: string;
  chainName: string;
  fromSeq: number;
  toSeq: number;
  rowsChecked: number;
  intact: boolean;
  firstBreakSeq: number | null;
  breakKind: string | null;
  message: string;
  verifiedAt: string;
}

/* ========================================================================== */
/* THE HONESTY VOCABULARY.                                                    */
/*                                                                            */
/* Every sentence this module says about what it does NOT know comes from     */
/* here. Centralised deliberately: a disclaimer written freehand on each      */
/* screen is a disclaimer that gets softened by whoever edits it last, and    */
/* softening is precisely the direction the pressure runs in a package        */
/* about services somebody is trying to sell.                                 */
/* ========================================================================== */

/**
 * The standard wording for something this module SHOWS but does not STORE.
 *
 * A commitment rendered as a neat table looks identical to a commitment that has been
 * made. This sentence is what separates them, and it names where the real record lives so
 * the reader is not merely warned but redirected.
 */
export function notStored(what: string, where: string): string {
  return `${what} is NOT stored by this system — there is no table for it and this module does not create one. What you see is the structure to fill in; the binding record is ${where}.`;
}

/**
 * What a connection's adapter mode entitles anybody to claim about it.
 *
 * A local transport fixture is not customer-system interoperability. A `fake` adapter
 * exercises the whole pipeline, which is genuinely useful and proves the pipeline — it
 * proves nothing whatsoever about the customer's SAP, Tally, Odoo or Dynamics instance.
 * Only traffic that has been through a customer's own system earns the word "supported",
 * and this build has a fixture, not that traffic.
 */
export function interoperabilityClaim(adapterMode: string): {
  label: string;
  claim: string;
  proven: boolean;
} {
  if (adapterMode === "fake") {
    return {
      label: "Local fixture",
      proven: false,
      claim:
        "Runs the full pipeline locally — mapping, breaker, retry, dead-letter, audit — with nothing leaving the building. It proves this pipeline. It proves nothing about the customer's system, and must not be described as a working integration with it.",
    };
  }
  if (adapterMode === "live") {
    return {
      label: "Configured live",
      proven: false,
      claim:
        "Configured against a real endpoint. Say \"supported\" only once this connection has carried the customer's own records end to end and the reconciliation was accepted — a configured endpoint is a setting, not evidence.",
    };
  }
  return {
    label: adapterMode || "Unknown",
    proven: false,
    claim: "The adapter mode is not recorded, so no claim about interoperability can be made from this row.",
  };
}

/**
 * Whether an interruption test may be rehearsed against this connection.
 *
 * Recording a failure outcome moves a REAL circuit breaker. On a `fake` connection that is
 * a rehearsal; on a `live` one it is an outage somebody has to explain. The refusal is a
 * rule rather than a warning, because the button is one click and the consequence is the
 * customer's traffic.
 */
export function mayRehearseInterruption(connection: ConnectionRow): {
  allowed: boolean;
  reason: string;
} {
  if (connection.adapterMode !== "fake") {
    return {
      allowed: false,
      reason:
        "Refused: this connection is not in fake-adapter mode. Recording a failure here moves a real breaker and stops real traffic. Rehearse against a fake-mode connection, or arrange a maintenance window and do it deliberately.",
    };
  }
  return {
    allowed: true,
    reason:
      "Fake adapter: the pipeline runs and nothing leaves the building, so the breaker can be opened and closed as a rehearsal. The transitions are audited exactly as a real outage would be.",
  };
}

/**
 * The bounded truth about a named source system.
 *
 * A connector catalogue containing the word "Tally" is not Tally compatibility. The
 * boundaries here are the ones that cost money when they are discovered late, and each is
 * a property of what the adapter actually reads rather than a caveat added for safety.
 */
export function sourceSystemBound(code: string, category: string): string | null {
  const key = `${code} ${category}`.toLowerCase();
  if (key.includes("tally")) {
    return "Tally stock is a BOOK balance at a point in time, not available-to-promise stock. It does not net reservations, in-transit or quality holds, so promising a delivery date off it will over-commit the plant.";
  }
  if (key.includes("sap")) {
    return "A named SAP adapter covers the specific documents it was built for. Module coverage, custom Z-fields and release level all differ per installation; scope it against the customer's own system before any of it is quoted.";
  }
  if (key.includes("odoo")) {
    return "Odoo's model changes materially between major versions and is routinely customised per deployment. A version and a field list have to be agreed in writing before this is scoped.";
  }
  if (key.includes("dynamics")) {
    return "Dynamics entity shapes depend on which apps are provisioned and how they were extended. Confirm the entities and the extension set against the customer's tenant, not against the product name.";
  }
  if (key.includes("gst") || key.includes("einvoice") || key.includes("e-invoice") || key.includes("ewaybill")) {
    return "A statutory portal is an external service with its own availability and its own rules. Duplicate filings are visible to a regulator and cannot be quietly withdrawn, which is why replay here is guarded rather than convenient.";
  }
  return null;
}

/**
 * Which desk picks a recovery up, derived from the failure CATEGORY.
 *
 * Deliberately derived, not stored. The dead-letter list carries no owner field until an
 * entry is RESOLVED, so any name shown against an open entry would be invented — and an
 * invented owner is worse than none, because somebody stops looking for a real one. The
 * category, on the other hand, genuinely determines who can fix it: a mapping fault is an
 * engineering change, an auth fault is a credential nobody on the integration desk holds.
 */
export function recoveryDesk(category: string): { desk: string; why: string } {
  switch (category) {
    case "transform":
    case "validation":
      return {
        desk: "Integration engineering",
        why: "The message never reached the wire. Replaying before the mapping or the source record is corrected runs the same fault again.",
      };
    case "auth":
      return {
        desk: "Customer IT (credential owner)",
        why: "Credentials are held by the customer, not by the delivery team. Nobody on this side can clear this one without them.",
      };
    case "timeout":
      return {
        desk: "Integration operations — read the far side first",
        why: "A timeout may already have taken effect on the far side. The current state of the document has to be fetched before anything is sent again.",
      };
    case "rate_limit":
      return {
        desk: "Integration operations",
        why: "The far side asked for less traffic. This clears itself once the window passes; replaying sooner extends the throttle.",
      };
    case "remote_error":
      return {
        desk: "Integration operations with the far-side vendor",
        why: "The fault is in the receiving system. Recovery depends on somebody outside this platform, and the wait is theirs rather than ours.",
      };
    default:
      return {
        desk: "Integration operations — triage required",
        why: "The category is not one the deterministic triage table recognises, so a person has to classify it before any action is safe.",
      };
  }
}

/* ========================================================================== */
/* SMALL PURE HELPERS.                                                        */
/* ========================================================================== */

/**
 * The reconciliation gap for one migration load.
 *
 * The number that decides acceptance is not "how many rows imported" — it is how many rows
 * the customer handed over MINUS how many became records they can find. A load reported as
 * successful with forty rows quietly missing is the single most expensive way a migration
 * goes wrong, because it is discovered in month three by somebody who cannot find a part.
 *
 * Arithmetic over the batch's own counters. No model is consulted and none could be.
 */
export function reconcile(batch: {
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  importedCount: number;
  failedCount: number;
  status: ImportBatchStatus;
}): {
  presented: number;
  landed: number;
  unaccounted: number;
  refused: number;
  reconciled: boolean;
  verdict: string;
} {
  const presented = batch.rowCount;
  const landed = batch.importedCount;
  const refused = batch.rejectedCount + batch.failedCount;
  const unaccounted = Math.max(0, presented - landed - refused);
  const reconciled = unaccounted === 0 && batch.status !== "running";
  return {
    presented,
    landed,
    unaccounted,
    refused,
    reconciled,
    verdict:
      batch.status === "running"
        ? "Still running. A load that has not reported finishing cannot be reconciled, and must not be signed off as if it had."
        : unaccounted > 0
          ? `${unaccounted} row${unaccounted === 1 ? "" : "s"} presented but neither imported nor refused. This load is NOT reconciled and must not be accepted until every row is accounted for.`
          : refused > 0
            ? `Every row is accounted for: ${landed} imported, ${refused} refused with a recorded reason. The refusals are the customer's decision to make, not ours to round up.`
            : `Every presented row became a record: ${landed} of ${presented}.`,
  };
}

/** Milliseconds as something a person reads. Used for a flow's declared SLA. */
export function durationLabel(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "Not declared";
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 100) / 10} s`;
  return `${Math.round(ms / 6_000) / 10} min`;
}

/** How long ago, in the coarse units an operations person actually uses. */
export function ageLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "Never";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "Unreadable";
  const seconds = Math.max(0, Math.round((now - then) / 1_000));
  if (seconds < 90) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * The circuit breaker's three states, made legible without relying on colour.
 *
 * `open` is the counter-intuitive one — the circuit is open, so nothing flows, which reads
 * backwards to anybody who has not wired a house. The label says what it MEANS.
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
      return state || "Unknown";
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
