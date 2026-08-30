// @ind-core/platform — the bootstrap primitives every module inherits.
// These make the DECISIONS-V2 §5 conventions executable rather than aspirational.
export * from "./ids/uuidv7.js";
export * from "./factory-connect/contracts.js";
export * from "./factory-intelligence/contracts.js";
export * from "./factory-intelligence/oee.js";
export * from "./factory-intelligence/replan.js";
export * from "./time/ist.js";
export * from "./time/date.js";
export * from "./errors/error-envelope.js";
export * from "./events/event-name.js";
export * from "./events/outbox.js";
export * from "./tenancy/tenant-context.js";
export * from "./audit/hash-chain.js";
export * from "./audit/edit-policy.js";
export * from "./audit/change-set.js";
export * from "./api/pagination.js";
export * from "./ai/index.js";
export * from "./masterdata/dedup.js";
export * from "./masterdata/dedup-verdict.js";
export * from "./quality/sampling.js";
export * from "./tax/gst.js";
export * from "./accounting/journal.js";
export * from "./people/wages.js";
export * from "./people/statutory.js";
export * from "./people/attendance.js";
export * from "./people/payslip-explain.js";
export * from "./crypto/field-encryption.js";
export * from "./maintenance/reliability.js";
export * from "./maintenance/pm-schedule.js";
export * from "./maintenance/sla.js";
export * from "./maintenance/work-order.js";
export * from "./maintenance/asset-narrative.js";
export * from "./csp/business-time.js";
export * from "./csp/sla.js";
export * from "./csp/ticket.js";
export * from "./csp/triage.js";
export * from "./csp/reply-draft.js";
export * from "./csp/entitlement.js";
export * from "./spend/budget.js";
export * from "./spend/itc.js";
export * from "./spend/tds.js";
export * from "./spend/receipt.js";
export * from "./spend/duplicate.js";
export * from "./spend/claim-policy.js";
export * from "./planning/calendar.js";
export * from "./planning/llc.js";
export * from "./planning/lotsize.js";
export * from "./planning/forecast.js";
export * from "./planning/mps.js";
export * from "./planning/netting.js";
export * from "./planning/scrap.js";
export * from "./planning/exceptions.js";
export * from "./planning/capacity.js";
export * from "./planning/dispatch.js";
export * from "./planning/reorder.js";
export * from "./access/permissions.js";
export * from "./access/permission-registry.js";
export * from "./access/scope.js";
export * from "./access/masking.js";
export * from "./access/sod.js";
export * from "./access/compliance.js";
export * from "./access/api-key.js";
export * from "./integration/retry.js";
export * from "./integration/webhook.js";
export * from "./integration/einvoice.js";
export * from "./integration/dlq.js";
export * from "./integration/mapping.js";
// Spreadsheet import — the pure half (target specs, header inference, column mapping, row
// validation, row grouping). Barrelled from its own index because it is five files that are
// only ever used together, exactly as `./ai/index.js` is.
export * from "./dataimport/index.js";
export * from "./aiops/pii.js";
export * from "./aiops/guardrails.js";
export * from "./aiops/prompt.js";
export * from "./aiops/routing.js";
export * from "./aiops/lifecycle.js";
export * from "./copilot/intents.js";
export * from "./copilot/route.js";
export * from "./copilot/answer.js";
export * from "./agent-os/types.js";
export * from "./agent-os/graph.js";
export * from "./agent-os/confidence.js";
export * from "./managed-services/operating-model.js";

// The fulfilment planner names two calendar helpers that `planning/calendar.js` also
// exports. They are not the same function — the planning pair takes a configurable
// `PlanCalendar`, the fulfilment pair assumes the six-day week the mission plans against —
// so the fix is to keep both and let callers import the fulfilment ones by path, rather
// than rename a correctly-named function to dodge a collision at the barrel.
export {
  DEFAULT_WEIGHTS,
  applyAutonomy,
  critique,
  fmtInr,
  generateCandidates,
  rank,
  type Candidate,
  type Critique,
  type Fact,
  type PlanningEvidence,
  type ShortageLine,
  type SourcingDecision,
  type StrategyKey,
  type SupplierOption,
  type TradeOffWeights,
} from "./fulfilment/planner.js";
export * from "./fulfilment/narrate.js";
// Phase 2's intelligence layer: where the facts come from, the canonical shapes they land
// in, the engine seam, and the thirteen-phase pipeline the mission emits for every step.
export * from "./intelligence/index.js";
