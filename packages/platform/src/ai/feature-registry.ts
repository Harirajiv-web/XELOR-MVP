import { AppError } from "../errors/error-envelope.js";

/**
 * The CLOSED AI feature registry (DECISIONS-V2 §4.2, AI-OPERATIONS Appendix A.1).
 * The MVP portfolio is fixed at 8 features (the AI research cut ~32 to reach it).
 * The router keys on `feature_key`; a call for a key not in this table is REJECTED
 * at runtime (FR-AIO-001). Keys are immutable, lowercase, `module.feature` shaped
 * (V-REG-01).
 *
 * Risk tiers (FR-AIO-001, V-REG-05):
 *   1 = advisory            (suggest; human glances)
 *   2 = draft-record        (may DRAFT a record for human approval — never auto-commit)
 *   3 = advisory-only-forever (never tool access, never a write path — one-way setting)
 */
export type RiskTier = 1 | 2 | 3;

export type FeatureStatus =
  | "committed"
  | "stretch"
  | "in_eval"
  | "registered"
  | "deprecated"
  | "retired"
  | "no_mvp_ai";

export interface AiFeature {
  /** stable, globally-unique, immutable `module.feature` key (V-REG-01). */
  key: string;
  ref: string; // DECISIONS-V2 ordinal, e.g. "AI #2"
  ownerModule: string;
  displayName: string;
  status: FeatureStatus;
  riskTier: RiskTier | null;
  dataClass: "business" | "pii_minimised" | "none";
  /** the rules-only comparator the eval gate must beat (§4.1). */
  deterministicBaseline: string;
  /** what the feature falls back to when AI is off/over-budget/killed. */
  degradedMode: string;
}

/** The canonical 8 (+ Integrations' explicit null entry). Verbatim from Appendix A.1. */
export const AI_FEATURES: readonly AiFeature[] = [
  {
    key: "expenditure.receipt_extraction",
    ref: "AI #1",
    ownerModule: "expenditure",
    displayName: "Receipt / document extraction + auto-categorisation",
    status: "committed",
    riskTier: 2,
    dataClass: "pii_minimised",
    deterministicBaseline: "azure_doc_intelligence_prebuilt_invoice",
    degradedMode: "manual_entry",
  },
  {
    key: "general.master_dedup",
    ref: "AI #2",
    ownerModule: "general",
    displayName: "Master-data duplicate detection",
    status: "committed",
    riskTier: 2,
    dataClass: "business",
    deterministicBaseline: "pg_trgm_gstin_exact",
    degradedMode: "deterministic_substitute",
  },
  {
    key: "csp.ticket_triage",
    ref: "AI #3",
    ownerModule: "csp",
    displayName: "Ticket auto-triage + sentiment",
    status: "committed",
    riskTier: 1,
    dataClass: "pii_minimised",
    deterministicBaseline: "keyword_rule_classifier",
    degradedMode: "feature_hidden",
  },
  {
    key: "expenditure.duplicate_receipt",
    ref: "AI #4",
    ownerModule: "expenditure",
    displayName: "Duplicate-receipt detection",
    status: "stretch",
    riskTier: 1,
    dataClass: "business",
    deterministicBaseline: "attachment_sha256_exact",
    degradedMode: "deterministic_substitute",
  },
  {
    key: "general.hsn_sac_suggest",
    ref: "AI #5",
    ownerModule: "general",
    displayName: "HSN / SAC code suggestion",
    status: "stretch",
    riskTier: 2,
    dataClass: "business",
    deterministicBaseline: "tax_code_directory_lookup",
    degradedMode: "deterministic_substitute",
  },
  {
    key: "csp.reply_draft",
    ref: "AI #6",
    ownerModule: "csp",
    displayName: "Reply drafting / thread summarisation",
    status: "stretch",
    riskTier: 2,
    dataClass: "pii_minimised",
    deterministicBaseline: "canned_response_template",
    degradedMode: "feature_hidden",
  },
  {
    key: "hrm.payslip_explainer",
    ref: "AI #7",
    ownerModule: "hrm",
    displayName: "Payslip explainer",
    status: "stretch",
    riskTier: 3,
    dataClass: "pii_minimised",
    deterministicBaseline: "payslip_trace_template",
    degradedMode: "template_output",
  },
  {
    key: "admin.sod_explain",
    ref: "AI #8",
    ownerModule: "administration",
    displayName: "Segregation-of-duties conflict explanation",
    status: "stretch",
    riskTier: 3,
    dataClass: "business",
    deterministicBaseline: "sod_rule_static_sentence",
    degradedMode: "template_output",
  },
  {
    key: "integrations.no_mvp_ai",
    ref: "—",
    ownerModule: "integrations",
    displayName: "(no MVP AI — explicit null entry)",
    status: "no_mvp_ai",
    riskTier: null,
    dataClass: "none",
    deterministicBaseline: "deterministic_dlq_triage_table",
    degradedMode: "no_mvp_ai",
  },
] as const;

const BY_KEY = new Map(AI_FEATURES.map((f) => [f.key, f]));

/** Statuses that may actually route a live AI call. */
const ROUTABLE = new Set<FeatureStatus>(["committed", "stretch", "in_eval", "registered"]);

export function getFeature(key: string): AiFeature | undefined {
  return BY_KEY.get(key);
}

export function isRegisteredFeature(key: string): boolean {
  return BY_KEY.has(key);
}

export function listFeatures(): readonly AiFeature[] {
  return AI_FEATURES;
}

/**
 * Router entry check (§4.2 / FR-AIO-001): resolve a routable feature or throw. An
 * unknown key, the Integrations null entry, or a retired/deprecated feature are all
 * hard rejections — the AI layer refuses to run for anything not in the closed set.
 */
export function requireRoutableFeature(key: string): AiFeature {
  const f = BY_KEY.get(key);
  if (!f) {
    throw new AppError(
      "AI_FEATURE_NOT_REGISTERED",
      422,
      `AI feature '${key}' is not in the closed registry — refusing to route.`,
    );
  }
  if (!ROUTABLE.has(f.status)) {
    throw new AppError(
      "AI_FEATURE_NOT_ROUTABLE",
      422,
      `AI feature '${key}' has status '${f.status}' and cannot route a live call.`,
    );
  }
  return f;
}
