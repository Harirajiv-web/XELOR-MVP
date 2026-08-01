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

/* ==========================================================================
   THE CONNECTION MAP'S SOURCE FACTS

   Everything below is TRANSCRIBED from server-side code, with the source file named on
   each block. It is here rather than fetched because none of it is reachable over HTTP
   to a holder of `aiops.registry.read`:

     - the module → department mapping lives in each module's manifest and in NAME.md §3;
     - which module SERVICE calls which AI adapter is a set of import sites, not an API;
     - which features have a golden set is the contents of a source folder;
     - the copilot catalogue IS an endpoint (`GET /copilot/catalogue`) but it is gated on
       `copilot.question.ask`, which a governance reader need not hold. Fetching it here
       would make this screen fail for exactly the person it is written for.

   Transcription is a real risk — a copy drifts from its original. The mitigation is that
   every block names the file it came from, so the check is a grep rather than an
   archaeology exercise. Where the SAME fact is served live, the live value wins: the
   registry table on this screen reads `GET /aiops/registry` and only falls back to
   `AI_FEATURE_FACTS` when that read fails.
   ========================================================================== */

/**
 * Module key → owning department code.
 * Source: each module's `manifest.ts` (`department:`), and
 * `docs/00-governance/02-departments-and-agent-ownership.md` §3 for the
 * three backend-only modules the web app has no folder for (`expenditure`) or spells
 * differently (`integrations` / `integration`).
 */
export const MODULE_DEPARTMENT: Readonly<Record<string, string>> = {
  general: "HEXA",
  administration: "HEXA",
  integrations: "HEXA",
  integration: "HEXA",
  expenditure: "RASP",
  hrm: "RASP",
  accounts: "RASP",
  csp: "MICA",
  sales: "MICA",
  inventory: "SPAR",
  purchase: "SPAR",
  engineering: "AXLE",
  planning: "AXLE",
  production: "KILN",
  quality: "KILN",
  maintenance: "KILN",
  copilot: "ONYX",
  aiops: "ONYX",
};

export function departmentOfModule(moduleKey: string): string {
  return MODULE_DEPARTMENT[moduleKey] ?? "—";
}

/** The immutable half of a registry row — the part that is compiled in, not per-tenant. */
export interface AiFeatureFact {
  key: string;
  ref: string;
  ownerModule: string;
  displayName: string;
  status: string;
  riskTier: number | null;
  dataClass: string;
  deterministicBaseline: string;
  degradedMode: string;
}

/**
 * The CLOSED registry, verbatim.
 * Source: `packages/platform/src/ai/feature-registry.ts` → `AI_FEATURES`.
 *
 * `GET /aiops/registry` serves these same rows from `listFeatures()` plus two per-tenant
 * columns (rollout stage, last eval verdict). This copy exists so the map still draws when
 * that read fails — a connection map that goes blank on a 500 explains nothing.
 */
export const AI_FEATURE_FACTS: readonly AiFeatureFact[] = [
  { key: "expenditure.receipt_extraction", ref: "AI #1", ownerModule: "expenditure", displayName: "Receipt / document extraction + auto-categorisation", status: "committed", riskTier: 2, dataClass: "pii_minimised", deterministicBaseline: "azure_doc_intelligence_prebuilt_invoice", degradedMode: "manual_entry" },
  { key: "general.master_dedup", ref: "AI #2", ownerModule: "general", displayName: "Master-data duplicate detection", status: "committed", riskTier: 2, dataClass: "business", deterministicBaseline: "pg_trgm_gstin_exact", degradedMode: "deterministic_substitute" },
  { key: "csp.ticket_triage", ref: "AI #3", ownerModule: "csp", displayName: "Ticket auto-triage + sentiment", status: "committed", riskTier: 1, dataClass: "pii_minimised", deterministicBaseline: "keyword_rule_classifier", degradedMode: "feature_hidden" },
  { key: "expenditure.duplicate_receipt", ref: "AI #4", ownerModule: "expenditure", displayName: "Duplicate-receipt detection", status: "stretch", riskTier: 1, dataClass: "business", deterministicBaseline: "attachment_sha256_exact", degradedMode: "deterministic_substitute" },
  { key: "general.hsn_sac_suggest", ref: "AI #5", ownerModule: "general", displayName: "HSN / SAC code suggestion", status: "stretch", riskTier: 2, dataClass: "business", deterministicBaseline: "tax_code_directory_lookup", degradedMode: "deterministic_substitute" },
  { key: "csp.reply_draft", ref: "AI #6", ownerModule: "csp", displayName: "Reply drafting / thread summarisation", status: "stretch", riskTier: 2, dataClass: "pii_minimised", deterministicBaseline: "canned_response_template", degradedMode: "feature_hidden" },
  { key: "hrm.payslip_explainer", ref: "AI #7", ownerModule: "hrm", displayName: "Payslip explainer", status: "stretch", riskTier: 3, dataClass: "pii_minimised", deterministicBaseline: "payslip_trace_template", degradedMode: "template_output" },
  { key: "admin.sod_explain", ref: "AI #8", ownerModule: "administration", displayName: "Segregation-of-duties conflict explanation", status: "stretch", riskTier: 3, dataClass: "business", deterministicBaseline: "sod_rule_static_sentence", degradedMode: "template_output" },
  { key: "copilot.retrieval_qa", ref: "AI #9", ownerModule: "copilot", displayName: "Copilot — read-only question answering over the tenant's own data", status: "in_eval", riskTier: 3, dataClass: "business", deterministicBaseline: "keyword_intent_router", degradedMode: "deterministic_template" },
  { key: "integrations.no_mvp_ai", ref: "—", ownerModule: "integrations", displayName: "(no MVP AI — explicit null entry)", status: "no_mvp_ai", riskTier: null, dataClass: "none", deterministicBaseline: "deterministic_dlq_triage_table", degradedMode: "no_mvp_ai" },
];

/**
 * Which module SERVICE actually calls a registered feature, and through which adapter.
 * Source: the six adapters in `apps/api/src/ai/` and their call sites —
 *   `dedup-explainer.ts`      ← general.service.ts, engineering.service.ts,
 *                                purchase.service.ts, sales.service.ts
 *   `receipt-extractor.ts`    ← expenditure/attachment.service.ts
 *   `payslip-explainer.ts`    ← hrm/hrm.controller.ts
 *   `ticket-triage.ts`        ← csp/ticket.service.ts
 *   `reply-drafter.ts`        ← csp/reply.service.ts
 *   `sod-explainer.ts`        ← administration/sod.service.ts
 *   copilot                   ← modules/copilot/copilot.service.ts (calls the router direct)
 *
 * This is the fact that makes the map more than a restatement of the registry. AI #2 is
 * OWNED by `general` but CONSUMED by four modules across four departments — so the edge
 * from ONYX to Product Engineering exists in the code even though AXLE owns no AI feature.
 */
export const FEATURE_CONSUMERS: Readonly<Record<string, readonly string[]>> = {
  "expenditure.receipt_extraction": ["expenditure"],
  "general.master_dedup": ["general", "engineering", "purchase", "sales"],
  "csp.ticket_triage": ["csp"],
  "expenditure.duplicate_receipt": [],
  "general.hsn_sac_suggest": [],
  "csp.reply_draft": ["csp"],
  "hrm.payslip_explainer": ["hrm"],
  "admin.sod_explain": ["administration"],
  "copilot.retrieval_qa": ["copilot"],
  "integrations.no_mvp_ai": [],
};

/**
 * The golden set each feature is evaluated against, where one exists in the repository.
 * Source: `apps/api/src/ai/eval/specs/` — four spec files, no more.
 *
 * Doctrine (DECISIONS-V2 §4.1) is that nothing ships without one. Five registered features
 * have none, and that is shown rather than smoothed over.
 */
export const FEATURE_GOLDEN_SET: Readonly<Record<string, string | null>> = {
  "expenditure.receipt_extraction": "expenditure-receipt-extraction.spec.ts",
  "general.master_dedup": "general-master-dedup.spec.ts",
  "csp.ticket_triage": "csp-ticket-triage.spec.ts",
  "admin.sod_explain": "admin-sod-explain.spec.ts",
  "expenditure.duplicate_receipt": null,
  "general.hsn_sac_suggest": null,
  "csp.reply_draft": null,
  "hrm.payslip_explainer": null,
  "copilot.retrieval_qa": null,
  "integrations.no_mvp_ai": null,
};

/** One question in the copilot's closed catalogue. */
export interface CopilotIntentFact {
  key: string;
  question: string;
  /** The module whose tables the hand-written SELECT reads. */
  module: string;
  /** The permission the ASKER must already hold. The copilot never widens access. */
  permission: string;
}

/**
 * The copilot's closed catalogue — all twenty-one questions.
 * Source: `packages/platform/src/copilot/intents.ts` → `COPILOT_INTENTS`.
 *
 * These are the SECOND set of edges on the map, and they are a different shape from the
 * registry's: read-only, permission-gated, and pointed at modules that own no AI feature
 * of their own. Adding one is a code change with a reviewed SELECT behind it.
 */
export const COPILOT_INTENT_FACTS: readonly CopilotIntentFact[] = [
  { key: "stock.on_hand", question: "How much of an item do we have in stock?", module: "inventory", permission: "inventory.stock.read" },
  { key: "stock.by_warehouse", question: "What is sitting in a particular warehouse?", module: "inventory", permission: "inventory.stock.read" },
  { key: "stock.recent_movements", question: "What stock has moved recently?", module: "inventory", permission: "inventory.stock.read" },
  { key: "sales.open_orders", question: "Which customer orders are still open?", module: "sales", permission: "sales.order.read" },
  { key: "sales.order_status", question: "What is the status of one sales order?", module: "sales", permission: "sales.order.read" },
  { key: "sales.due_soon", question: "What is due to ship soon?", module: "sales", permission: "sales.order.read" },
  { key: "purchase.open_orders", question: "Which purchase orders are open?", module: "purchase", permission: "purchase.po.read" },
  { key: "purchase.order_status", question: "What is the status of one purchase order?", module: "purchase", permission: "purchase.po.read" },
  { key: "purchase.awaiting_receipt", question: "What have we ordered that has not arrived?", module: "purchase", permission: "purchase.po.read" },
  { key: "production.open_orders", question: "What is on the shop floor right now?", module: "production", permission: "production.order.read" },
  { key: "production.order_status", question: "What is the status of one production order?", module: "production", permission: "production.order.read" },
  { key: "planning.what_to_buy", question: "What does the plan say we should buy?", module: "planning", permission: "planning.mrp.read" },
  { key: "planning.what_to_make", question: "What does the plan say we should make?", module: "planning", permission: "planning.mrp.read" },
  { key: "planning.past_due", question: "What is already late according to the plan?", module: "planning", permission: "planning.mrp.read" },
  { key: "planning.shortages", question: "What are we short of?", module: "planning", permission: "planning.mrp.read" },
  { key: "maintenance.open_work_orders", question: "Which maintenance jobs are open?", module: "maintenance", permission: "mnt.mwo.read" },
  { key: "quality.pending_inspections", question: "What is waiting for inspection?", module: "quality", permission: "quality.inspection.read" },
  { key: "accounts.outstanding", question: "Who owes us money?", module: "accounts", permission: "accounts.ledger.read" },
  { key: "master.find_item", question: "What is this item?", module: "engineering", permission: "engineering.item.read" },
  { key: "master.find_vendor", question: "Who are our vendors?", module: "purchase", permission: "purchase.vendor.read" },
  { key: "master.find_customer", question: "Who are our customers?", module: "sales", permission: "sales.customer.read" },
];

/** What ONYX takes from HEXA. ONYX owns no business table and reads no module's rows. */
export interface DependencyFact {
  port: string;
  file: string;
  what: string;
}

/**
 * Source: `apps/api/src/ai/governance.port.ts`, `apps/api/src/ai/db.governance.ts`,
 * `apps/api/src/ai/ai-router.service.ts`, `apps/api/src/ai/ai-action-log.service.ts`,
 * `packages/db/migrations/0007_ai_action_log_chain.sql`. NAME.md §4 names this seam
 * "ONYX ↔ HEXA" and flags the ownership of the router package as still open.
 */
export const ONYX_DEPENDS_ON_HEXA: readonly DependencyFact[] = [
  {
    port: "AiProvider / AiCompletionRequest",
    file: "packages/platform/src/ai/types.ts",
    what: "The provider-agnostic completion interface. Adapters are the only code that talks to a model vendor, so swapping provider — or running fully offline on the stub — never touches a module.",
  },
  {
    port: "AiRouterService",
    file: "apps/api/src/ai/ai-router.service.ts",
    what: "The single doorway. Four steps in order: reject an unregistered key, ask governance, route to the provider, log the call. It holds no business logic — what a result MEANS is the owning module's job.",
  },
  {
    port: "AiGovernance.check()",
    file: "apps/api/src/ai/governance.port.ts",
    what: "Asked before a token is spent. Answers allowed / refused with a machine reason: opt_out, kill_switch or budget_exhausted.",
  },
  {
    port: "AiGovernance.recordUsage()",
    file: "apps/api/src/ai/db.governance.ts",
    what: "Reports tokens against the tenant's daily budget after every successful call, accumulated atomically per day.",
  },
  {
    port: "ai_action_log",
    file: "packages/db/migrations/0007_ai_action_log_chain.sql",
    what: "The hash-chained record of every AI call — including every refusal. ONYX writes to it and reads it back; it does not own the chain.",
  },
  {
    port: "Tenant opt-out (DPDP)",
    file: "apps/api/src/ai/db.governance.ts",
    what: "A tenant that has opted out of AI processing refuses every call before anything else is evaluated. Set and released with a reason and an audit row.",
  },
];

/** A place where a call is stopped, and the file that stops it. */
export interface ChokepointFact {
  name: string;
  file: string;
  detail: string;
}

/**
 * Source: the files named on each row. These are the answers to "what stops this thing
 * doing something stupid" — and each one is a line of code, not a policy.
 */
export const CHOKEPOINTS: readonly ChokepointFact[] = [
  {
    name: "requireRoutableFeature()",
    file: "packages/platform/src/ai/feature-registry.ts → called first in ai-router.service.ts",
    detail: "An unregistered key throws AI_FEATURE_NOT_REGISTERED (422) before a provider is touched — no request is made and no data leaves. A retired, deprecated or no_mvp_ai key is refused the same way.",
  },
  {
    name: "Tenant opt-out, evaluated first",
    file: "apps/api/src/ai/db.governance.ts → check()",
    detail: "The DPDP opt-out is the first clause in the gate, ahead of the kill switch and the budget. A tenant that has said no is refused before anything else is even looked up.",
  },
  {
    name: "Kill switch — tenant-wide beats feature-scoped",
    file: "apps/api/src/ai/db.governance.ts → inArray(featureKey, [featureKey, '*'])",
    detail: "The lookup asks for this feature's row OR the wildcard row in one query, so a tenant-wide switch stops every feature without touching nine rows. Engaging or releasing it requires a reason and appends a hash-chained audit entry.",
  },
  {
    name: "Daily token budget — refusal, not a surprise invoice",
    file: "apps/api/src/ai/db.governance.ts → ai_token_ledger",
    detail: "Usage accumulates per tenant per day against a limit (default from AI_DAILY_TOKEN_BUDGET). At the limit the answer is budget_exhausted and the feature falls to its degraded mode. Cost is a control, not a report.",
  },
  {
    name: "Guardrails, pre-call",
    file: "packages/platform/src/aiops/guardrails.ts → preCall()",
    detail: "Fields are minimised to an allow-list and a redaction record is produced. Personal data surviving minimisation BLOCKS the call. A prompt-injection attempt does not block — it is MARKED and sent as quarantined data, because stripping it would silently alter the document and the next attempt would be worded differently anyway.",
  },
  {
    name: "Guardrails, post-call — numeric provenance",
    file: "packages/platform/src/aiops/guardrails.ts → postCall()",
    detail: "Every number in the model's output must appear in the input it was given, or be a number the CODE derived and declared. An unprovenanced figure is a hard block. A plausible total nobody typed is the characteristic failure of this technology in a finance product.",
  },
  {
    name: "PII egress defaults to refusal",
    file: "packages/platform/src/aiops/pii.ts + guardrails.ts",
    detail: "Personal identifiers are refused on the way out as well as the way in. A certain-confidence finding in the output blocks the answer rather than redacting it quietly.",
  },
  {
    name: "Refusals are logged too",
    file: "apps/api/src/ai/ai-router.service.ts",
    detail: "When governance says no, the router writes an ai_action_log row with decision.refused set and THEN fails closed. A refusal that left no trace would be indistinguishable from a call that never happened.",
  },
];

/** An open governance item, stated on screen rather than kept in a document. */
export interface OpenItemFact {
  title: string;
  detail: string;
  source: string;
}

/**
 * Source: the code and blueprints named on each row. A governance console that hides its
 * own open items is not a governance console.
 */
export const OPEN_ITEMS: readonly OpenItemFact[] = [
  {
    title: "AI #9 is a ninth feature in a registry that closes at eight",
    detail: "DECISIONS-V2 §4.2 fixes the MVP portfolio at eight. The copilot is registered as AI #9 and the divergence is written into the registry file in full, deliberately visible — but the ADR that HEXA must review has not been raised. Until it is, the entry is a documented divergence, not an approved one.",
    source: "packages/platform/src/ai/feature-registry.ts (the AI #9 comment block); NAME.md §6 item 4",
  },
  {
    title: "`in_eval` still routes",
    detail: "ROUTABLE is { committed, stretch, in_eval, registered }. So a feature that has not passed its eval gate can still make live calls; what the gate blocks is prompt promotion and rollout advancement. The gate is real, but it is not the routing gate a reader of §4.1 would assume, and AI #9 is currently the feature that sits in that gap.",
    source: "packages/platform/src/ai/feature-registry.ts → ROUTABLE",
  },
  {
    title: "Five of nine registered features have no golden set in the repository",
    detail: "Four spec files exist: receipt extraction, master dedup, ticket triage, SoD explain. Doctrine says nothing ships without a golden set and a passing gate, so the other five are registered-but-unshippable until theirs exist. That includes the copilot.",
    source: "apps/api/src/ai/eval/specs/",
  },
  {
    title: "Two registered features have no implementation",
    detail: "AI #4 (duplicate-receipt detection) and AI #5 (HSN/SAC suggestion) are registered and routable but no adapter calls them. Registration is not delivery, and the registry cannot tell the difference.",
    source: "apps/api/src/ai/ — six adapters for nine features",
  },
  {
    title: "Three blueprints claim a flagship or differentiator AI feature the router would reject",
    detail: "ENGINEERING §13.1 'BOM extraction from drawings (flagship)', PRODUCTION §13.1 'end-of-shift production summary (flagship)', SMBD §13.3–13.4 auto-quotation and tender fit-scoring ('differentiator'). None is a registered key, so requireRoutableFeature() throws 422 for all of them at runtime. MAINTENANCE §13.1–13.3 additionally mark three features 'COMMITTED, MVP'. ACCOUNTS §13.1 is the honest counter-example: it labels its three as REQUIRES REGISTRATION and says so up front.",
    source: "NAME.md §6 item 4; DECISIONS-V2 §4.2",
  },
  {
    title: "AI Operations' own two features are unregistered",
    detail: "AI-OPERATIONS §13 describes `aiops.eval_failure_triage` and `aiops.prompt_change_summary` as 'registered in the registry like any other'. Neither key is in it. The module that enforces the registry is subject to it, and is currently in breach of it.",
    source: "AI-OPERATIONS.md §13.1–13.2 against packages/platform/src/ai/feature-registry.ts",
  },
  {
    title: "Router package ownership is undecided",
    detail: "`platform/ai` ships with HEXA's bootstrap. Whether it moves to ONYX or stays is NAME.md open item 5, unresolved. It is on this map because an ownership question is a real edge: today the router that enforces ONYX's registry is maintained by another department.",
    source: "NAME.md §4 (ONYX ↔ HEXA row) and §6 item 5",
  },
];
