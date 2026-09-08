/**
 * THE PIPELINE'S RULES — everything about "what is Phase 2 doing to Phase 1" that is not React.
 *
 * Split out of `pipeline.tsx` for exactly the reason `stage-panel.logic.ts` is split out of
 * the stage panel: this is the part that decides what a person is TOLD about a machine
 * operating their factory, it is worth reading without a JSX tree wrapped around it, and it
 * is the part most likely to be got wrong later. A `.ts` file is also the only kind this
 * repository's test runner picks up — its glob matches `.test.ts`, not `.test.tsx` — so
 * splitting these out is what makes the honesty rules testable rather than merely asserted
 * in a comment.
 *
 * NOTHING HERE FETCHES OR RENDERS. Payload in, a token or a list out.
 */

/* --------------------------------------------------------------- the contract -- */

/**
 * The thirteen phases a step can pass through. Shared verbatim with the mission engine —
 * this list is the API's, not the UI's, and a phase the server stops emitting simply stops
 * appearing.
 */
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

export type SourceKind =
  | "phase1-erp"
  | "file"
  | "simulated-api"
  | "user-input"
  | "phase2-derived";

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
  /** Which Phase 1 module or source, e.g. "Sales · Orders", "Inventory · Stock". */
  system: string;
  sourceKind: SourceKind;
  status: PipelineStatus;
  /** What data specifically — record ids, counts, quantities. Null if nothing to add. */
  detail: string | null;
  /** ISO-8601 server clock, or null if this phase did not run for this step. */
  at: string | null;
}

/* ------------------------------------------------------------------- layers -- */

export type Layer = "phase1" | "phase2" | "human" | "file" | "external";

/**
 * Which of the five layers a source belongs to. The only mapping between the two, and the
 * one place where a change could quietly start drawing engine output as an ERP record.
 */
export const LAYER_OF: Record<SourceKind, Layer> = {
  "phase1-erp": "phase1",
  "phase2-derived": "phase2",
  "user-input": "human",
  file: "file",
  "simulated-api": "external",
};

/**
 * The order the legend reads in: what Phase 2 reads, what it works out, who decides, and
 * the two honest caveats. Left to right is roughly the order the pipeline moves in.
 */
export const LEGEND_ORDER: readonly Layer[] = [
  "phase1",
  "phase2",
  "human",
  "file",
  "external",
];

/* ------------------------------------------------------------------ statuses -- */

/**
 * The engine's own status words, and how each is drawn.
 *
 * The vocabulary is the API's — `requires_review`, not "needs you" — because this strip is
 * the place a person checks what the machine believes, and paraphrasing it here would mean
 * two different words for the same state on two different screens. The plain-English
 * sentence sits underneath in `label`; that is where the softening belongs.
 */
export const PIPELINE_STATUS: Record<
  PipelineStatus,
  { chip: string; dot: string; word: string }
> = {
  waiting: { chip: "chip-grey", dot: "var(--border)", word: "waiting" },
  in_progress: { chip: "chip-info", dot: "var(--brand)", word: "in progress" },
  requires_review: { chip: "chip-warn", dot: "var(--warn)", word: "requires review" },
  approved: { chip: "chip-info", dot: "var(--brand)", word: "approved" },
  completed: { chip: "chip-ok", dot: "var(--ok)", word: "completed" },
  failed: { chip: "chip-bad", dot: "var(--bad)", word: "failed" },
  retrying: { chip: "chip-warn", dot: "var(--warn)", word: "retrying" },
  skipped: { chip: "chip-grey", dot: "var(--text-muted)", word: "skipped" },
};

/** The word on the pill. Short enough that thirteen of them fit on a laptop. */
export const PHASE_WORD: Record<PipelinePhase, string> = {
  trigger: "Trigger",
  collect: "Collect",
  normalise: "Normalise",
  context: "Context",
  analyse: "Analyse",
  recommend: "Recommend",
  explain: "Explain",
  approve: "Approve",
  execute: "Execute",
  verify: "Verify",
  update: "Update",
  record: "Record",
  continue: "Next",
};

/* --------------------------------------------------------------- normalising -- */

const PHASES = new Set<string>(Object.keys(PHASE_WORD));
const KINDS = new Set<string>(Object.keys(LAYER_OF));
const STATUSES = new Set<string>(Object.keys(PIPELINE_STATUS));

/**
 * The pipeline off a step, or an empty list.
 *
 * DEFENSIVE ON PURPOSE, and it is worth naming why rather than treating it as boilerplate.
 * This field is being added to the mission engine by a different piece of work running at
 * the same time as this one. Until it lands, every step arrives without it; while it is
 * landing, some steps will have it and some will not. The requirement in that window is
 * that the screen shows nothing extra — never an error box, never an empty frame, never a
 * row of phases with invented statuses to fill the space. A stage whose phase, kind or
 * status is not one the UI knows is DROPPED rather than drawn as "unknown", because a row
 * that cannot be trusted is worse than a row that is not there.
 */
export function readPipeline(step: unknown): PipelineStage[] {
  const raw = (step as { pipeline?: unknown } | null | undefined)?.pipeline;
  if (!Array.isArray(raw)) return [];
  const out: PipelineStage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.phase !== "string" || !PHASES.has(s.phase)) continue;
    if (typeof s.sourceKind !== "string" || !KINDS.has(s.sourceKind)) continue;
    if (typeof s.status !== "string" || !STATUSES.has(s.status)) continue;
    out.push({
      phase: s.phase as PipelinePhase,
      label: typeof s.label === "string" ? s.label : "",
      system: typeof s.system === "string" && s.system ? s.system : "—",
      sourceKind: s.sourceKind as SourceKind,
      status: s.status as PipelineStatus,
      detail: typeof s.detail === "string" && s.detail ? s.detail : null,
      at: typeof s.at === "string" && s.at ? s.at : null,
    });
  }
  return out;
}

/**
 * The stage a reader should be looking at: the last one that has actually done something.
 *
 * Not the last stage in the list — that is usually `continue`, sitting at "waiting", which
 * tells nobody anything. Not the first either. A step that has read, analysed and is now
 * parked at an approval should open on the approval, because that is the phase the person
 * is being asked about.
 */
export function liveStageIndex(stages: readonly PipelineStage[]): number {
  for (let i = stages.length - 1; i >= 0; i--) {
    const st = stages[i];
    if (!st) continue;
    if (st.status !== "waiting" && st.status !== "skipped") return i;
  }
  return 0;
}

/** A server timestamp as a wall clock, or null when it was not a usable one. */
export function clockOf(at: string | null): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
