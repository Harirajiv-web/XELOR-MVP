/**
 * THE THIRTEEN PHASES, DERIVED FROM WHAT A STEP ACTUALLY DID.
 *
 * Trigger → collect → normalise → context → analyse → recommend → explain → approve →
 * execute → verify → update → record → continue. That is the shape of every Phase 2 action,
 * and this file turns one recorded mission step into the subset of those phases that
 * genuinely happened during it.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE: NOTHING HERE MAY INVENT A PHASE
 * ---------------------------------------------------------------------------
 * Every stage below is read off the evidence and findings the step already wrote when it
 * ran. An observe step has no `execute` because it executed nothing, and it does not get a
 * grey "skipped" row to make the diagram look complete. A step that failed at `collect`
 * emits `collect: failed` and stops — it does not go on to claim it analysed anything.
 *
 * The temptation this resists is the reason the file exists. A thirteen-phase diagram with
 * every row filled in looks impressive and would be a lie about eleven of them, and once a
 * viewer catches one invented row they are right to disbelieve the twelve true ones. The
 * pipeline is worth showing precisely because it is uneven.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY STAGE OF ONE STEP CARRIES THE SAME TIMESTAMP
 * ---------------------------------------------------------------------------
 * The engine takes ONE clock reading per step, when it writes the step down. Stages within
 * a step are therefore not separately timed, and `at` is that single server-clock reading
 * for all of them. Spreading them out — a hundred milliseconds apart so the diagram
 * animates nicely — would be inventing measurements, which is the same offence as inventing
 * a phase. If per-stage timing is ever wanted, the engine has to start recording it.
 */

import { fmtInr } from "../fulfilment/planner.js";
import type { SourceKind } from "./sources.js";

/* ------------------------------------------------------------------ contract -- */

export type PipelinePhase =
  | "trigger"
  | "collect"
  | "normalise"
  | "context"
  | "analyse"
  | "recommend"
  | "explain"
  | "approve"
  | "execute"
  | "verify"
  | "update"
  | "record"
  | "continue";

export type PipelineStatus =
  | "waiting"
  | "in_progress"
  | "requires_review"
  | "approved"
  | "completed"
  | "failed"
  | "retrying"
  | "skipped";

export interface PipelineStage {
  phase: PipelinePhase;
  /** One plain sentence: what happened at this phase. */
  label: string;
  /** Which Phase 1 module or source, e.g. "Sales · Orders", "Inventory · Stock", "XLSX upload". */
  system: string;
  sourceKind: SourceKind;
  status: PipelineStatus;
  /** What data specifically — record ids, counts, quantities. Null if nothing to add. */
  detail: string | null;
  /** ISO-8601 server clock, or null if this phase did not run for this step. */
  at: string | null;
}

/**
 * Everything the builder is allowed to look at.
 *
 * Deliberately the step's OWN record and nothing else. If a stage cannot be derived from
 * what the step wrote down, the stage does not exist — that constraint is what keeps the
 * pipeline a description of the run rather than a second, prettier story about it.
 */
export interface StepFacts {
  stepKey: string;
  /** As stored: succeeded | failed | waiting_approval. */
  status: string;
  /** The step's single server-clock reading, ISO-8601. */
  at: string | null;
  /** `fulfilment_step.evidence` — an array of { source, provenance, ref, detail }. */
  evidence: unknown;
  /** `fulfilment_step.findings` — the step's own numbers. */
  findings: unknown;
  refusedReason?: string | null;
  /** Which commitment, for labels that name it. */
  soNo?: string | null;
  /** 1 on a first run. 2+ means this step was re-run after a failure. */
  attempt?: number;
  /** The failure the retry is recovering from. Never dropped — see the trigger stage. */
  previousFailure?: string | null;
  /** Where this mission's supplier terms came from. Changes the sourcing step's `context`. */
  termsFrom?: "seeded" | "spreadsheet";
  /** The uploaded file's name, when terms came from a spreadsheet. */
  termsFile?: string | null;
}

/* ------------------------------------------------------------------- helpers -- */

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const str = (v: unknown): string => (v == null ? "" : String(v));
const round = (v: unknown): number => Math.round(num(v));

/** The first evidence row's `detail`, which is usually the most specific thing a step read. */
function firstDetail(evidence: unknown, fallback: string | null = null): string | null {
  const first = arr(evidence)[0];
  const d = str(obj(first).detail);
  return d === "" ? fallback : d;
}

/** Every evidence row's `ref`, capped — a stage detail is a line, not a report. */
function refs(evidence: unknown, limit = 4): string {
  const all = arr(evidence).map((e) => str(obj(e).ref)).filter((r) => r !== "");
  const head = all.slice(0, limit).join(", ");
  return all.length > limit ? `${head} and ${all.length - limit} more` : head;
}

/**
 * Phases where a failure means nothing after it ran.
 *
 * The distinction is not cosmetic. If the vendor master lookup fails, no purchase order was
 * attempted and no postcondition was read — emitting them would be fiction. But if the
 * EXECUTE fails, the verify still ran: re-reading the table is exactly how the step learned
 * it had failed, and dropping that row would hide the check that caught the problem.
 *
 * So a failure in an investigative phase halts the pipeline, and a failure in an acting
 * phase does not.
 */
const HALTING_PHASES: ReadonlySet<PipelinePhase> = new Set<PipelinePhase>([
  "trigger",
  "collect",
  "normalise",
  "context",
  "analyse",
  "recommend",
]);

/**
 * The stage collector.
 *
 * A tiny class rather than array pushes, for one reason: the halt. A step that failed while
 * finding things out must not emit the phases after the failure, and threading that
 * condition through thirty call sites is how one of them ends up wrong.
 */
class Stages {
  private readonly out: PipelineStage[] = [];
  private stopped = false;

  constructor(private readonly at: string | null) {}

  add(
    phase: PipelinePhase,
    label: string,
    system: string,
    sourceKind: SourceKind,
    status: PipelineStatus,
    detail: string | null = null,
  ): this {
    if (this.stopped) return this;
    this.out.push({ phase, label, system, sourceKind, status, detail, at: this.at });
    if (status === "failed" && HALTING_PHASES.has(phase)) this.stopped = true;
    return this;
  }

  /** A halted step still recorded itself — that is how the failure is known at all. */
  record(label: string, detail: string | null = null): this {
    this.stopped = false;
    return this.add("record", label, "Phase 2 · Mission log", "phase2-derived", "completed", detail);
  }

  continueTo(label: string, detail: string | null = null, status: PipelineStatus = "completed"): this {
    return this.add("continue", label, "Phase 2 · Mission engine", "phase2-derived", status, detail);
  }

  get stages(): PipelineStage[] {
    return this.out;
  }
}

/** True when the step ran to a good end. Anything else stops the arc. */
const ok = (f: StepFacts): boolean => f.status === "succeeded";

/**
 * The trigger stage, which every step has, plus the retry statement.
 *
 * A re-run says so, in the first row, with the original failure written out. The contract's
 * `retrying` status exists for exactly this and for nothing else — swallowing the failure
 * that caused the retry would turn the audit trail into a story about a mission that always
 * worked.
 */
function trigger(s: Stages, f: StepFacts, label: string, system: string, kind: SourceKind, detail: string | null): void {
  const attempt = f.attempt ?? 1;
  if (attempt > 1) {
    s.add(
      "trigger",
      label,
      system,
      kind,
      "retrying",
      `attempt ${attempt} — the previous attempt failed: ${f.previousFailure ?? "reason not recorded"}` +
        (detail ? `. ${detail}` : ""),
    );
    return;
  }
  s.add("trigger", label, system, kind, "completed", detail);
}

/* ------------------------------------------------------------------- builder -- */

/**
 * The pipeline for one step.
 *
 * A `switch` over the thirteen step keys rather than a table of descriptors, because each
 * step reads different fields out of its own findings and a generic descriptor would need a
 * per-step expression anyway — at which point the table is a `switch` with extra ceremony.
 */
export function buildPipeline(f: StepFacts): PipelineStage[] {
  const s = new Stages(f.at);
  const F = obj(f.findings);
  const so = f.soNo ?? "the order";

  switch (f.stepKey) {
    /* ------------------------------------------------------------- understand -- */
    case "intake": {
      const o = obj(F.objective);
      const lines = round(F.lineCount);
      trigger(s, f, "A confirmed sales order was handed to the mission as a commitment.", "Sales · Orders", "phase1-erp",
        `${so} — ${lines} line(s), ₹${fmtInr(num(F.orderValue))}`);
      s.add("collect", "Read the order, its lines and the customer it is promised to.", "Sales · Orders", "phase1-erp", "completed",
        refs(f.evidence) || `${lines} order line(s)`);
      s.add("normalise", "Turned the order lines into the canonical shape the planner works on.", "Phase 2 · Canonical model", "phase2-derived", "completed",
        `${round(o.orderQty)} units across ${lines} line(s)`);
      s.add("context", "Attached the constraints and completion criteria this commitment is judged against.", "Phase 2 · Mission objective", "phase2-derived", "completed",
        `${arr(o.hardConstraints).length} hard constraint(s), ${arr(o.completionCriteria).length} completion criteria`);
      s.add("explain", "Stated the promise in one paragraph, with the money and the date in it.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record("Objective and evidence written to the mission log.");
      if (ok(f)) s.continueTo("Handed on to the engineering readiness check.");
      break;
    }

    /* ------------------------------------------------------------ investigate -- */
    case "engineering": {
      const ready = F.engineeringReady === true;
      trigger(s, f, "The commitment cannot be planned without a released build sheet.", "Engineering · Build sheets (BOM)", "phase1-erp", null);
      s.add("collect", "Read the active BOM for the finished good.", "Engineering · Build sheets (BOM)", "phase1-erp",
        ready ? "completed" : "failed", firstDetail(f.evidence));
      s.add("analyse", "Checked that exactly one released revision is in force.", "Phase 2 · Rules", "phase2-derived", "completed",
        `${round(F.componentLines)} component line(s) on the released revision`);
      s.add("explain", "Said what the build sheet allows and what it does not.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record(ready ? "Engineering readiness written to the mission log." : "Refusal written to the mission log, with the reason.",
        ready ? null : f.refusedReason ?? null);
      if (ok(f)) s.continueTo("Handed on to the material netting.");
      break;
    }

    case "materials": {
      const short = round(F.shortCount);
      const total = round(F.componentCount);
      const worst = obj(arr(F.shortages).slice().sort((a, b) => num(obj(b).shortQty) - num(obj(a).shortQty))[0]);
      trigger(s, f, "Every component on the build sheet has to be netted before a plan exists.", "Inventory · Stock", "phase1-erp", null);
      s.add("collect", "Read on-hand stock for every component, summed across warehouses.", "Inventory · Stock", "phase1-erp", "completed",
        `${total} component(s) checked against stock_balance`);
      s.add("normalise", "Exploded the build sheet against the ordered quantity, scrap included.", "Phase 2 · Canonical model", "phase2-derived", "completed",
        `${total} requirement line(s) derived`);
      s.add("analyse", "Netted required against on hand, component by component.", "Phase 2 · Netting", "phase2-derived", "completed",
        short === 0
          ? "nothing is short — the order is covered from stock"
          : `${short} of ${total} short; biggest gap ${round(worst.shortQty)} ${str(worst.itemCode) || "units"}`);
      s.add("explain", "Named the worst shortage rather than reporting a count.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record("Shortages written to the mission log with their arithmetic.");
      if (ok(f)) s.continueTo("Handed on to the capacity check.");
      break;
    }

    case "capacity": {
      const headroom = num(F.capacityHeadroom);
      const base = round(F.productionDays);
      const stretched = headroom > 0 ? Math.ceil(base / Math.max(0.2, headroom)) : base;
      trigger(s, f, "A plan needs to know how much of the line this batch can actually have.", "Shop-floor load", "simulated-api", null);
      // The one place in the arc where the honest answer is "no system supplied this".
      s.add("collect", "Read the shop-floor capacity assumption.", "Shop-floor load (seeded — no MES connected)", "simulated-api", "completed",
        `headroom ${Math.round(headroom * 100)}%, base ${base} working days. Phase 1 has no work-centre load feed in this build, so this is a seeded constant.`);
      s.add("analyse", "Turned headroom into build days.", "Phase 2 · Rules", "phase2-derived", "completed",
        headroom >= 1 ? `${base} working days, unstretched` : `${base} working days stretches to ${stretched}`);
      s.add("explain", "Said the consequence in days rather than the percentage.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record("Capacity assumption written to the mission log, labelled seeded.");
      if (ok(f)) s.continueTo("Handed on to sourcing.");
      break;
    }

    case "sourcing": {
      const options = round(F.optionCount);
      const fromFile = f.termsFrom === "spreadsheet";
      trigger(s, f, "Something has to be bought, so the qualified sources have to be established.", "Purchase · Vendors", "phase1-erp", null);
      s.add("collect", "Read the vendor master to see who actually exists to buy from.", "Purchase · Vendors", "phase1-erp", "completed",
        `every quoted supplier resolved against this tenant's vendor table`);
      s.add(
        "context",
        fromFile
          ? "Read the commercial terms from the spreadsheet uploaded to this mission."
          : "Read the commercial terms Phase 1 has no table for.",
        fromFile ? `XLSX upload · ${f.termsFile ?? "supplier terms"}` : "Supplier commercial terms (seeded)",
        fromFile ? "file" : "simulated-api",
        "completed",
        fromFile
          ? `${options} quoted term(s) read from the uploaded price list`
          : `${options} quoted term(s). Phase 1 holds no price or lead-time master; these are seeded and labelled provenance: seeded.`,
      );
      s.add("normalise", "Merged master identity with quoted terms into one supplier model.", "Phase 2 · Canonical model", "phase2-derived", "completed",
        `${options} supplier option(s)`);
      s.add("analyse", "Compared the options on price, lead time, reliability and committed capacity.", "Phase 2 · Rules", "phase2-derived", "completed",
        options === 0 ? "nothing to buy, so there is no sourcing choice" : `${options} option(s) compared`);
      s.add("explain", "Stated the trade-off — cheapest against fastest — rather than listing quotes.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record("Supplier options written to the mission log with their provenance.");
      if (ok(f)) s.continueTo("Handed on to the strategy comparison.");
      break;
    }

    /* ----------------------------------------------------------------- decide -- */
    case "strategy": {
      const candidates = round(F.candidateCount);
      const feasible = round(F.feasibleCount);
      trigger(s, f, "Enough is known to compare ways through.", "Phase 2 · Planner", "phase2-derived", null);
      s.add("context", "Took one snapshot of the evidence so every strategy is judged on the same facts.", "Phase 2 · Evidence snapshot", "phase2-derived", "completed",
        `stock, BOM, supplier terms and policy, as at one read`);
      s.add("analyse", "Generated every strategy the evidence supports and scored them.", "Phase 2 · Planner (deterministic)", "phase2-derived", "completed",
        `${candidates} strategy(ies) scored; ${feasible} can hit the promised date`);
      s.add("recommend", "Picked the highest-scoring feasible strategy.", "Phase 2 · Planner (deterministic)", "phase2-derived", "completed",
        `chose '${str(F.chosen)}' as plan version ${round(F.versionNo)}, digest ${str(F.digest).slice(0, 12)}`);
      s.add("explain", "Said why this one won, against the runner-up rather than in isolation.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record(`Frozen as plan version ${round(F.versionNo)}. Plans are never edited — only superseded.`);
      if (ok(f)) s.continueTo("Handed on to independent verification.");
      break;
    }

    case "critique": {
      const checks = arr(F.checks);
      const passed = F.passed === true;
      const passedCount = checks.filter((c) => obj(c).passed === true).length;
      const escalations = arr(F.escalations);
      trigger(s, f, "The planner does not get to grade its own homework.", "Phase 2 · Verifier", "phase2-derived", null);
      s.add("analyse", "Re-derived the completion date, the cost and the margin from the evidence.", "Phase 2 · Verifier (independent)", "phase2-derived", "completed",
        `${checks.length} independent check(s) recomputed`);
      s.add("verify", "Compared the recomputed numbers against what the plan claimed.", "Phase 2 · Verifier (independent)", "phase2-derived",
        passed ? "completed" : "failed",
        passed
          ? `${passedCount} of ${checks.length} passed${escalations.length ? `; ${escalations.length} matter(s) need human authority` : ""}`
          : `${arr(F.objections).length} objection(s): ${arr(F.objections).map(str).join("; ")}`);
      s.add("explain", "Stated the verdict bluntly, including when the plan is sound but not permitted.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record(passed ? "Verification written onto the plan version." : "Objections written onto the plan version.", f.refusedReason ?? null);
      if (ok(f)) s.continueTo("Handed on to the authority gate.");
      break;
    }

    /* -------------------------------------------------------------- authorise -- */
    case "authorize": {
      const needsHuman = F.requiresApproval === true;
      trigger(s, f, "Before anything is committed, the mission checks the edge of its own authority.", "Phase 2 · Policy", "phase2-derived", null);
      s.add("analyse", "Compared the plan's commitment against this mission's autonomy envelope.", "Phase 2 · Policy (autonomy tier)", "phase2-derived", "completed",
        firstDetail(f.evidence));
      // THE ANSWER, NOT JUST THE QUESTION. `decide()` writes the human's verdict back onto
      // this step's status, so a step that asked and was answered must not still show as
      // waiting. The three states are genuinely different facts and each is read off the row
      // rather than assumed from the fact that an approval exists.
      const approvalNo = str(F.approvalNo) || "an approval";
      if (!needsHuman) {
        s.add("approve", "Inside the envelope, so no human was asked.", "Phase 2 · Approvals", "phase2-derived", "approved",
          `tier ${str(F.tier) || "A3"} permits this without a signature`);
      } else if (f.status === "succeeded") {
        s.add("approve", "A person authorised it, and the mission carried on under their signature.", "Phase 2 · Approvals", "user-input", "approved",
          `${approvalNo} was granted`);
      } else if (f.status === "failed") {
        s.add("approve", "A person declined it, and the mission stopped rather than proceeding.", "Phase 2 · Approvals", "user-input", "failed",
          `${approvalNo} was refused`);
      } else {
        s.add("approve", "Stopped and asked a person, with the alternatives and the cost of waiting.", "Phase 2 · Approvals", "user-input", "requires_review",
          `${approvalNo} raised; the mission holds until it is decided`);
      }
      s.add("explain", "Set out what is being asked for and what happens if the answer is no.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record(needsHuman ? "Approval request written to the mission log and the audit trail." : "Authority decision written to the mission log.");
      if (ok(f)) s.continueTo("Handed on to execution.");
      else if (needsHuman && f.status !== "failed") {
        s.continueTo("Waiting for a person.", "nothing else runs on this mission until the approval is answered", "waiting");
      }
      break;
    }

    /* ---------------------------------------------------------------- execute -- */
    case "reserve": {
      const reserved = arr(F.reserved);
      const verified = F.verified === true;
      const total = num(F.totalReserved);
      trigger(s, f, "Stock this order depends on must stop being available to everybody else.", "Sales · Orders", "phase1-erp", null);
      s.add("collect", "Read the order lines and the on-hand stock behind them.", "Sales · Orders + Inventory · Stock", "phase1-erp", "completed",
        `${reserved.length} line(s) can be covered from stock`);
      if (reserved.length === 0) {
        s.add("execute", "Nothing to reserve — no finished stock is on hand.", "Sales · Orders", "phase1-erp", "skipped",
          "the whole quantity depends on the supply this plan commits");
      } else {
        s.add("execute", "Committed the available stock to this order.", "Sales · Orders", "phase1-erp", "completed",
          reserved.map((r) => `${round(obj(r).qty)} ${str(obj(r).line)}`).join(", "));
      }
      s.add("verify", "Re-read reserved_qty after writing, rather than trusting the write.", "Sales · Orders", "phase1-erp",
        verified ? "completed" : "failed", `observed ${total} committed on ${so}`);
      // Only claimed once the postcondition held. "The state changed" after a failed re-read
      // is precisely the claim this mission is not allowed to make.
      if (reserved.length > 0 && verified) {
        s.add("update", "Sales now shows the quantity as committed to this customer.", "Sales · Orders", "phase1-erp", "completed",
          `sales_order_line.reserved_qty = ${total}`);
      }
      s.record("Action, postcondition and step written to the mission log.");
      if (ok(f)) s.continueTo("Handed on to the purchase commitment.");
      break;
    }

    case "procure": {
      const pos = arr(F.purchaseOrders);
      const unresolved = arr(F.unresolved);
      const committed = arr(F.committed);
      const failure = str(F.failure);
      const verified = F.verified === true;
      trigger(s, f, "The material the plan is short of has to become real documents.", "Purchase · Purchase orders", "phase1-erp", null);
      s.add("collect", "Resolved every vendor and item the plan names against this tenant's masters.",
        "Purchase · Vendors + Engineering · Items", "phase1-erp",
        unresolved.length > 0 ? "failed" : "completed",
        unresolved.length > 0
          ? unresolved.map(str).join("; ")
          : `${committed.length} sourcing line(s) across ${round(F.vendorCount)} vendor(s)`);
      s.add("analyse", "Grouped the sourcing lines into one purchase order per vendor.", "Phase 2 · Rules", "phase2-derived", "completed",
        `${committed.length} line(s) → ${round(F.vendorCount)} document(s), longest lead time sets each date`);
      s.add("execute", "Asked PURCHASE to raise the documents through its own port.", "Purchase · Purchase orders", "phase1-erp",
        failure === "" ? "completed" : "failed",
        failure === ""
          ? pos.length === 0
            ? "no purchase was required"
            : `${pos.length} purchase order(s): ${pos.map((p) => str(obj(p).poNo)).join(", ")}`
          : failure);
      s.add("verify", "Re-read purchase_order from PURCHASE's own table after creation.", "Purchase · Purchase orders", "phase1-erp",
        verified ? "completed" : "failed",
        `${pos.length} document(s) totalling ₹${fmtInr(num(F.totalValue))}`);
      if (pos.length > 0) {
        s.add("update", "Purchase now holds the documents — as drafts, pending its own approval workflow.", "Purchase · Purchase orders", "phase1-erp", "completed",
          pos.map((p) => `${str(obj(p).poNo)} on ${str(obj(p).vendorName)}`).join("; "));
      }
      s.record("Action, postcondition and step written to the mission log.", failure === "" ? null : failure);
      if (ok(f)) s.continueTo("Handed on to the work-order release.");
      break;
    }

    case "workorder": {
      const orderNo = str(F.productionOrderNo);
      const verified = F.verified === true;
      const failure = str(F.failure);
      trigger(s, f, "Somebody on the floor has to be told to build this.", "Production · Work orders", "phase1-erp", null);
      s.add("collect", "Read the plan's completion date and the order line the build serves.", "Phase 2 · Plan version", "phase2-derived", "completed",
        `${round(F.qty)} units, needed ${str(F.needDate) || "on the plan date"}`);
      s.add("execute", "Asked PRODUCTION to release the work order through its own port.", "Production · Work orders", "phase1-erp",
        orderNo !== "" ? "completed" : "failed", orderNo !== "" ? orderNo : failure || "the work order was not created");
      s.add("verify", "Re-read production_order: it exists, is for the committed quantity, and is pegged to its sales order line.",
        "Production · Work orders", "phase1-erp", verified ? "completed" : "failed",
        `pegged to the sales order line: ${F.pegged === true ? "yes" : "no"}`);
      if (orderNo !== "") {
        s.add("update", "The shop-floor list now carries the job, and it knows who it is for.", "Production · Work orders", "phase1-erp", "completed",
          `${orderNo} — ${round(F.qty)} units for ${so}`);
      }
      s.record("Action, postcondition and step written to the mission log.", failure === "" ? null : failure);
      if (ok(f)) s.continueTo("Handed on to monitoring.");
      break;
    }

    /* ------------------------------------------------------------------ prove -- */
    case "watch": {
      const watching = arr(F.watching).map(str);
      trigger(s, f, "The commitment is now exposed to things nobody scheduled.", "Phase 2 · Events", "phase2-derived", null);
      s.add("collect", "Read the mission's own event log for anything unhandled.", "Phase 2 · Events", "phase2-derived", "completed",
        firstDetail(f.evidence));
      s.add("analyse", "Set the watch list and the next milestone.", "Phase 2 · Rules", "phase2-derived", "completed",
        watching.length ? `watching ${watching.join(", ")} against ${str(F.nextMilestone)}` : `next milestone ${str(F.nextMilestone)}`);
      s.add("explain", "Said what it is watching and what it will do if something slips.", "Phase 2 · Narrator", "phase2-derived", "completed", null);
      s.record("Watch state written to the mission log.");
      s.continueTo("Dormant until something it depends on changes.", "costs nothing while it waits", "waiting");
      break;
    }

    case "close": {
      const total = round(F.actionsTotal);
      const verified = round(F.actionsVerified);
      trigger(s, f, "A mission does not get to declare its own success.", "Phase 2 · Action log", "phase2-derived", null);
      s.add("collect", "Read every action this mission took.", "Phase 2 · Action log", "phase2-derived", "completed",
        `${total} action(s), ${round(F.planVersions)} plan version(s)`);
      s.add("verify", "Checked each action against the state it claimed to change.", "Phase 2 · Action log", "phase2-derived",
        total === 0 ? "skipped" : verified === total ? "completed" : "failed",
        total === 0 ? "this mission took no actions to verify" : `${verified} of ${total} independently verified`);
      s.add("analyse", "Compared the outcome against the promise.", "Phase 2 · Rules", "phase2-derived", "completed",
        `${round(F.deliveredQty)} of ${round(F.orderedQty)} delivered; ${str(F.actualDate)} against ${str(F.promisedDate)} promised; ` +
          `margin ${num(F.marginPct).toFixed(1)}% against ${num(F.targetMarginPct).toFixed(1)}% target`);
      s.add("explain", "Wrote the outcome as a scorecard, including what a human authorised.", "Phase 2 · Narrator", "phase2-derived", "completed",
        `${round(F.autonomousActions)} action(s) taken alone, ${round(F.approvedActions)} under human approval`);
      s.record("Outcome written to the mission and to the hash-chained audit log.", "one audit entry, chained to the one before it");
      break;
    }

    default: {
      // An unknown step key is a build newer than this file. Say so rather than guess: one
      // honest row beats twelve invented ones.
      trigger(s, f, "This step is not one this pipeline knows how to describe.", "Phase 2 · Mission engine", "phase2-derived", f.stepKey);
      s.record("Step written to the mission log.");
      break;
    }
  }

  return s.stages;
}
