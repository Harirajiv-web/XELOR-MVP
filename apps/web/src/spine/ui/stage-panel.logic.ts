/**
 * THE STAGE PANEL'S RULES — everything about "what is the agent doing" that is not React.
 *
 * Split out of `stage-panel.tsx` for the reason `order-draft.ts` is split out of the
 * new-order dialog: these are the rules that decide what a person is told about a running
 * mission, they are worth reading on their own without a JSX tree wrapped around them, and
 * they are the part most likely to be got wrong later. A `.ts` file is also the only kind
 * this repository's test runner picks up — its glob matches `.test.ts` and not `.test.tsx`
 * — so splitting them out is what makes the seven-word status vocabulary testable rather
 * than merely asserted in a comment.
 *
 * NOTHING HERE FETCHES OR RENDERS. Every function is pure: mission payload in, a string or
 * a token out. That is what lets `stage-panel.test.ts` cover the whole decision surface
 * without a browser, a server or a mission.
 */

/* --------------------------------------------------------------------- types -- */

/** `StepView` from `mission.service.ts`, narrowed to the fields this panel reads. */
export interface StepView {
  seq: number;
  stepKey: string;
  title: string;
  kind: string;
  agentKey: string;
  chapter: string;
  plain: string;
  flow: { from: string; did: string; to: string };
  where: { href: string; module: string; screen: string } | null;
  status: string;
}

/**
 * A `fulfilment_action` row, which the mission view returns RAW from the table.
 *
 * This is the only place a server wall-clock time and a verification verdict are available
 * to the UI, which is why the panel bothers to match one to a step at all.
 */
export interface MissionAction {
  targetDomain: string;
  actionType: string;
  title: string;
  status: string;
  executedAt: string | null;
  verifiedAt: string | null;
  verified: boolean | null;
  resultRef: string | null;
  failureReason: string | null;
}

export interface MissionView {
  id: string;
  missionNo: string;
  soNo: string;
  customerName: string;
  status: string;
  stage: string;
  waitingReason: string | null;
  steps: StepView[];
  actions: MissionAction[];
  pendingApproval: { id: string } | null;
}

/** One of the six acts, as `GET /fulfilment/meta` serves them. */
export interface Chapter {
  key: string;
  name: string;
  lands: string;
}

/**
 * The seven words this panel is allowed to use for a status.
 *
 * A closed vocabulary on purpose. The mission engine writes its own strings — `succeeded`,
 * `waiting_approval`, `replanning` — and they are engine words, not floor words. Mapping
 * them once, here, is what stops four screens each inventing their own synonym for the same
 * state, which is how a status column stops meaning anything.
 */
export type StageStatus =
  | "waiting"
  | "in progress"
  | "requires review"
  | "approved"
  | "completed"
  | "failed"
  | "retrying";

/* ------------------------------------------------------------------- mapping -- */

/** Which department owns the agent, in the words `spine/registry/departments.ts` uses. */
export const DEPARTMENT_OF: Record<string, string> = {
  ONYX: "AI Operations",
  HEXA: "Platform & Governance",
  AXLE: "Product Engineering & Planning",
  SPAR: "Supply Chain",
  MICA: "Sales & Product Care",
  KILN: "Manufacturing Operations",
  RASP: "People & Money",
};

/** The job, rather than the codename. Same wording as the agent bar, so they agree. */
export const ROLE_OF: Record<string, string> = {
  ONYX: "Coordinator",
  HEXA: "Checker",
  SPAR: "Stores & buying",
  AXLE: "Planning",
  KILN: "Shop floor",
  MICA: "Sales",
  RASP: "Finance",
};

/** The department accent, never a status colour — an owner is not an outcome. */
export const ACCENT_OF: Record<string, string> = {
  ONYX: "var(--dept-onyx)",
  HEXA: "var(--dept-hexa)",
  SPAR: "var(--dept-spar)",
  AXLE: "var(--dept-axle)",
  KILN: "var(--dept-kiln)",
  MICA: "var(--dept-mica)",
  RASP: "var(--dept-rasp)",
};

/**
 * The three steps that WRITE, and the domain each writes into.
 *
 * This is how an action row is matched back to the step that raised it. The mission view
 * exposes actions in full but strips the step's `id` from `StepView`, so a join on
 * `stepId` is not available to the client — and `targetDomain` happens to be unique across
 * the arc's three acting steps, which makes it a sound key rather than a lucky one. If a
 * fourth acting step ever writes to a domain already in this table the match becomes
 * ambiguous, and the fix is to expose the step id, not to guess harder.
 */
export const WRITES_INTO: Record<string, string> = {
  reserve: "inventory",
  procure: "purchase",
  workorder: "production",
};

/** What the mission's own record is called, so it reads as a system rather than a blank. */
export const MISSION_RECORD = "XELOR mission record";

/**
 * Where the data came from and where it went, for one step.
 *
 * Derived from the step's `kind`, which is the engine's own classification of what the step
 * DOES — an `observe` step reads somebody else's system of record into the mission, an `act`
 * step pushes the mission's decision back out into one. Deriving it from `kind` rather than
 * listing thirteen step keys means a step added to the arc tomorrow is described correctly
 * without this file being touched.
 */
export function systemsFor(step: StepView): {
  source: string;
  destination: string;
  verb: string;
} {
  const module = step.where ? `${step.where.module} → ${step.where.screen}` : null;

  switch (step.kind) {
    case "observe":
      // Reads a system of record. The module named on the step IS the source; nothing is
      // written anywhere but the mission's own evidence trail.
      return {
        source: module ?? "The factory's records",
        destination: MISSION_RECORD,
        verb: "fetched",
      };
    case "plan":
      return { source: "Evidence gathered so far", destination: `${MISSION_RECORD} · plan`, verb: "created" };
    case "critique":
      return { source: `${MISSION_RECORD} · plan`, destination: MISSION_RECORD, verb: "checked" };
    case "authorize":
      return { source: `${MISSION_RECORD} · plan`, destination: "Your approval queue", verb: "created" };
    case "act":
      // The one direction that changes the business. The plan is the source and the module
      // is the destination — the opposite of an observe step, and the reason the two are
      // never drawn the same way.
      return {
        source: `${MISSION_RECORD} · plan`,
        destination: module ?? "The factory's records",
        // Reserving moves an existing quantity; the other two bring a document into being.
        verb: step.stepKey === "reserve" ? "updated" : "created",
      };
    case "wait":
      return { source: "Supplier and floor events", destination: MISSION_RECORD, verb: "watching" };
    case "close":
      return { source: "Everything this mission did", destination: MISSION_RECORD, verb: "verified" };
    default:
      return { source: module ?? "—", destination: MISSION_RECORD, verb: "handled" };
  }
}

/**
 * The step's status, in the seven-word vocabulary.
 *
 * Order matters and each branch is a different question. A refusal outranks everything
 * because a failed step is the one thing nobody may miss; a pending approval outranks a
 * succeeded step because the engine writes the authorise step as `succeeded` the moment it
 * has raised the question, and reporting that as "completed" would tell somebody their
 * decision had already been taken.
 */
export function stageStatusFor(mission: MissionView, step: StepView): StageStatus {
  if (step.status === "failed" || step.status === "refused") return "failed";

  // The panel only ever renders the step the mission is sitting on, so a pending approval
  // on the mission is a pending approval on THIS step.
  if (mission.pendingApproval) return "requires review";

  // A plan a person sent back is re-derived rather than retried verbatim, but "retrying" is
  // the word that describes it from outside — the same commitment, another way through.
  if (mission.status === "replanning") return "retrying";

  // The authorise step that raised no question, or whose question has since been answered.
  if (step.stepKey === "authorize" && step.status === "succeeded") return "approved";

  if (mission.status === "waiting") return "waiting";
  if (step.status === "succeeded") return "completed";
  return "in progress";
}

/** The chip treatment for each of the seven. Ink on its own tint, never bare colour. */
export const STATUS_TONE: Record<StageStatus, { bg: string; fg: string }> = {
  waiting: { bg: "var(--surface-sunken)", fg: "var(--text-secondary)" },
  "in progress": { bg: "var(--info-bg)", fg: "var(--info-fg)" },
  "requires review": { bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
  approved: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
  completed: { bg: "var(--good-bg)", fg: "var(--good-fg)" },
  failed: { bg: "var(--bad-bg)", fg: "var(--bad-fg)" },
  retrying: { bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
};

/**
 * A time, and WHOSE CLOCK IT IS.
 *
 * The mission payload carries a real server timestamp for the three steps that write —
 * `fulfilment_action.executed_at` — and carries none at all for the ten that read, because
 * `StepView` does not expose the `started_at` the table already stores. Rather than fill
 * that in with `new Date()` and let a browser clock be read as a server fact, the panel
 * labels the two differently: "executed" is the server's record of when it happened,
 * "seen" is this browser noticing the step for the first time. Somebody reconciling the
 * panel against the audit trail needs to know which one they are looking at.
 *
 * Exposing `startedAt` on `StepView` is a one-line change in `mission.service.ts` and would
 * retire the second case entirely.
 */
export function stampFor(action: MissionAction | null, seenAt: number | null): { label: string; value: string } {
  const at = action?.verifiedAt ?? action?.executedAt ?? null;
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) return { label: "Executed", value: timeOf(d) };
  }
  if (seenAt !== null) return { label: "Seen", value: timeOf(new Date(seenAt)) };
  return { label: "Time", value: "—" };
}

export function timeOf(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * What happens after this step.
 *
 * Named from the SIX CHAPTERS, which the API serves, rather than from the thirteen-step arc,
 * which it does not. That is the honest limit of what the client has been told, and the
 * wording respects it: the panel knows which ACT comes after this one, and it does not know
 * the title of the next STEP — several acts run to three or four steps, so "next is X" would
 * be wrong more often than right. Guessing a step title would also go stale silently the
 * first time somebody reorders the arc.
 */
export function nextStepFor(mission: MissionView, step: StepView, chapters: readonly Chapter[]): string {
  if (mission.pendingApproval) {
    return "Your decision — approve or stop it in the agent bar below.";
  }
  if (mission.status === "completed") return "Nothing further. The mission is closed.";
  if (mission.status === "failed") {
    return mission.waitingReason ?? "Nothing further. The mission stopped here.";
  }

  const i = chapters.findIndex((c) => c.key === step.chapter);
  const next = i >= 0 ? chapters[i + 1] : undefined;
  if (!next) return "Press “Looks right — carry on” below to run the last of it.";

  return `Carry on below. This stage finishes, then ${next.name.toLowerCase()}.`;
}

/**
 * The act this step belongs to, named from the served chapter list.
 *
 * Falls back to the mission's own `stage` column when the chapter vocabulary could not be
 * fetched — a different word for roughly the same thing, and better than an empty cell.
 */
export function stageName(chapter: string, chapters: readonly Chapter[], missionStage: string): string {
  const found = chapters.find((c) => c.key === chapter);
  if (found) return found.name;
  // No chapter list (a reader without `agentos.run.read`, or a failed fetch). The engine's
  // own key is a real word — "investigate", "authorise" — so it is shown with a capital
  // rather than left blank; the mission's `stage` column is the last resort.
  const raw = chapter || missionStage;
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
}
