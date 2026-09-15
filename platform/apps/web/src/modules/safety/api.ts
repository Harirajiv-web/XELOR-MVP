/**
 * SAFETY & PERMITS — this module's own slice of the API, and nothing else's.
 *
 * Nothing outside this folder imports this file, and it imports nothing from another
 * module. The `quality` folder next door declares its own copy of the finding and
 * corrective-action shapes; the two are deliberately duplicated rather than shared,
 * because a shared type is an import, an import is a dependency, and a dependency is how
 * "delete the folder and the app still builds" quietly stops being true.
 *
 * WHY EVERY PATH HERE BELONGS TO ANOTHER MODULE'S CONTROLLER.
 *
 * There is no safety controller, no incident table, no permit table and no gauge register
 * in this build, and this module does not pretend otherwise. What it has instead is the
 * observation that profile 6 is built on: a defect and a near-miss run the SAME loop —
 * raise, contain, investigate, act, evidence, audit — and that loop already exists, as
 * `qms_finding` + `qms_corrective_action`, with an append-only audit trail underneath it.
 * So Safety writes into the shared register rather than a parallel one, and the Actions
 * screen shows both origins in a single queue because they genuinely are a single queue.
 *
 * The consequence is a constraint worth stating plainly: everything below is a REAL route
 * that already enforces a REAL permission. Where a journey needs something the API cannot
 * supply — a permit record, a calibration due date, the instrument that took a reading —
 * the screen says so in words rather than inventing a field. A safety screen that displays
 * a confident number nobody measured is worse than a blank one.
 */

/* ========================================================================== */
/*  The shared register: findings                                             */
/* ========================================================================== */

/**
 * One entry on the shared non-conformance register.
 *
 * Mirrors `qms_finding` as `GET /quality/findings` returns it. The lifecycle is
 * new → contained → cause_confirmed → action_active → effectiveness_review → closed, and
 * closure happens on the CORRECTIVE ACTION, never here: `verifyCapa(effective: true)` is
 * the only path that sets `closedAt`. That is why the incidents screen cannot offer a
 * "close this" button and sends people to the action instead.
 */
export interface SafetyFinding {
  id: string;
  findingNo: string;
  /** inspection | audit | complaint | supplier | manual. Safety entries are always `manual`. */
  sourceType: string;
  /** Free text on the server. Safety encodes its classification here — see `readSafetyRef`. */
  sourceRef: string;
  inspectionId: string | null;
  inspectionNo: string | null;
  title: string;
  description: string;
  /** critical | major | minor — the server's enum, not a safety-specific one. */
  severity: string;
  status: string;
  ownerRef: string;
  /** The review date. `date` column, so `YYYY-MM-DD`, and null when nobody set one. */
  dueDate: string | null;
  containment: string | null;
  rootCause: string | null;
  createdAt: string;
}

/**
 * One corrective action, with its effectiveness decision.
 *
 * `completionEvidence` is what somebody did; `effectivenessEvidence` is the proof it
 * worked. The API keeps them apart on purpose and so does the screen — an action marked
 * complete has NOT been shown to have fixed anything, and collapsing the two is how a
 * corrective-action register becomes a to-do list with better paperwork.
 */
export interface SafetyCorrectiveAction {
  id: string;
  capaNo: string;
  findingNo: string;
  findingTitle: string;
  title: string;
  actionPlan: string;
  ownerRef: string;
  /** `date` column and NOT NULL on the server: every action has a due date. */
  dueDate: string;
  /** planned | in_progress | effectiveness_review | closed | ineffective. */
  status: string;
  effectivenessCriteria: string;
  completionEvidence: string | null;
  /** When somebody said the work was done — NOT when it was shown to have worked. */
  completedAt: string | null;
  /** pending | effective | ineffective. */
  effectivenessResult: string;
  effectivenessEvidence: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

/* ========================================================================== */
/*  Maintenance: the work a permit gates                                      */
/* ========================================================================== */

/**
 * A maintenance work order, narrowed to the fields Safety reads.
 *
 * Two of these are the whole of what this build knows about permits, and both are real
 * columns rather than a reading between lines:
 *
 *   - `holdReason === "awaiting_permit"` — the desk has stopped this job because the
 *     permit is not in hand. It is one of five hold reasons the API accepts, and it is the
 *     only honest evidence in the system that a permit gates a job.
 *   - `isSafetyRelated` / `incidentRef` — somebody flagged this job as safety-related
 *     through `POST /maintenance/work-orders/:no/safety-flag`.
 *
 * `tasks` is the other half. A mandatory task blocks the work order's completion gate, so
 * a permit condition recorded as a mandatory task is not decoration — the job cannot be
 * completed until it is signed off. That is as close to a permit checklist as this build
 * gets, and it is a real gate.
 */
export interface SafetyWorkOrder {
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
  /** awaiting_spare | awaiting_vendor | awaiting_production_window | awaiting_permit | other. */
  holdReason: string | null;
  isSafetyRelated: boolean;
  tasks: readonly SafetyWorkOrderTask[];
}

export interface SafetyWorkOrderTask {
  sequence: number;
  instruction: string;
  isMandatory: boolean;
  resultValue: string | null;
  isPass: boolean | null;
  completedAt: string | null;
}

/**
 * A maintainable asset.
 *
 * `statutoryClass` is the one field on this record that a safety officer already
 * recognises: `hoist_lift_s28`, `lifting_tackle_s29` and `pressure_plant_s31` name the
 * sections of the Factories Act 1948 that require periodic examination by a competent
 * person. It says WHICH REGIME a machine falls under. It does not say when the last
 * examination was or when the next one is due — those columns do not exist — which is why
 * the calibration screen refuses to show anything as in-date or overdue.
 */
export interface SafetyAsset {
  id: string;
  assetCode: string;
  name: string;
  /** plant | area | machine | component. */
  assetType: string;
  /** Materialised '/plant/area/machine' — where the thing physically is. */
  path: string;
  depth: number;
  criticality: string | null;
  status: string;
  /** none | hoist_lift_s28 | lifting_tackle_s29 | pressure_plant_s31 | other. */
  statutoryClass: string;
  meters: readonly {
    meterType: string;
    uom: string;
    currentValue: number;
    lastRealReadingAt: string | null;
    /** The server's own judgement that a counter has stopped being fed. Not ours. */
    stale: boolean;
  }[];
}

/** Only what the calibration back-trace needs off an inspection. Nothing here names a gauge. */
export interface SafetyInspectionSummary {
  id: string;
  inspectionNo: string;
  inspectionType: string;
  status: string;
  result: string;
  completedAt: string | null;
  inspectorRef: string | null;
  itemCode: string | null;
}

/** One run of the audit-chain verifier: the evidence that the evidence has not been edited. */
export interface SafetyChainVerification {
  id: string;
  chainName: string;
  fromSeq: number;
  toSeq: number;
  rowsChecked: number;
  intact: boolean;
  firstBreakSeq: number | null;
  breakKind: string;
  message: string;
  verifiedAt: string;
}

/* ========================================================================== */
/*  Routes                                                                    */
/* ========================================================================== */

/**
 * Every path this module will ever call. All of them exist today.
 *
 * Kept as constants rather than inline strings so that the manifest's signals and alerts
 * name the same route the screen reads. The alternative — a literal in the manifest and
 * another in the screen — is how a dashboard tile and the list it links to end up
 * disagreeing, and a figure that disagrees with the screen behind it destroys trust in
 * both.
 */
export const safetyApi = {
  /* the shared register */
  findingsPath: "/quality/findings",
  findingContainPath: (findingNo: string): string =>
    `/quality/findings/${encodeURIComponent(findingNo)}/contain`,
  findingRootCausePath: (findingNo: string): string =>
    `/quality/findings/${encodeURIComponent(findingNo)}/root-cause`,

  /* the shared corrective-action engine */
  correctiveActionsPath: "/quality/corrective-actions",
  correctiveActionCompletePath: (capaNo: string): string =>
    `/quality/corrective-actions/${encodeURIComponent(capaNo)}/complete`,
  correctiveActionVerifyPath: (capaNo: string): string =>
    `/quality/corrective-actions/${encodeURIComponent(capaNo)}/verify`,

  /* the work a permit gates */
  workOrdersPath: "/maintenance/work-orders",
  workOrderPath: (mwoNo: string): string =>
    `/maintenance/work-orders/${encodeURIComponent(mwoNo)}`,
  workOrderTasksPath: (mwoNo: string): string =>
    `/maintenance/work-orders/${encodeURIComponent(mwoNo)}/tasks`,
  workOrderSafetyFlagPath: (mwoNo: string): string =>
    `/maintenance/work-orders/${encodeURIComponent(mwoNo)}/safety-flag`,

  /* equipment, and the inspections a back-trace would have to cover */
  assetsPath: "/maintenance/assets",
  inspectionsPath: "/quality/inspections",

  /* the evidence under the evidence */
  auditVerificationsPath: "/admin/audit/verifications",

  pageSize: 100,
} as const;

/* ========================================================================== */
/*  How a safety entry is recognised on a shared register                     */
/* ========================================================================== */

/**
 * THE ONE CONVENTION IN THIS MODULE, AND WHY IT IS A CONVENTION RATHER THAN A COLUMN.
 *
 * `qms_finding` has no "is this a safety matter" column and this module may not add one —
 * no migrations. It does have `source_ref`, free text, indexed alongside `source_type`,
 * whose job is to say what the finding came from. A safety entry says it came from the
 * safety route, in a shape that parses: `SAFETY/<kind>/<area>`.
 *
 * The honest consequences, both stated on the incidents screen rather than hidden here:
 *
 *   - A quality finding somebody hand-typed a `SAFETY/` reference into would appear on
 *     the safety register. Nothing prevents that, because nothing in the database is
 *     enforcing it.
 *   - The classification is not validated on write by the server. The screen constrains it
 *     to three values; the API would accept anything.
 *
 * A convention that is written down and admitted to is workable. A convention that is
 * presented as a schema is a lie with a longer fuse.
 */
export const SAFETY_REF_PREFIX = "SAFETY/";

export type SafetyKind = "hazard" | "near_miss" | "incident";

export const SAFETY_KINDS: readonly { value: SafetyKind; label: string; help: string }[] = [
  {
    value: "hazard",
    label: "Hazard",
    help: "Something that could hurt somebody. Nobody has been hurt and nothing has happened yet.",
  },
  {
    value: "near_miss",
    label: "Near miss",
    help: "It happened, and by luck nobody was hurt. Reported so the luck is not relied on twice.",
  },
  {
    value: "incident",
    label: "Incident",
    help: "Something went wrong — injury, damage, release or a stopped line. Record it here AND in the plant's statutory register; this system is not that register.",
  },
];

/** Build the reference a safety entry is filed under. Slashes are stripped so it parses back. */
export function safetyRef(kind: SafetyKind, area: string): string {
  const cleanArea = area.replace(/[/\\]+/g, " ").trim();
  return cleanArea ? `${SAFETY_REF_PREFIX}${kind}/${cleanArea}` : `${SAFETY_REF_PREFIX}${kind}`;
}

/** Read a reference back, or null when this finding was not raised through Safety. */
export function readSafetyRef(
  sourceRef: string | null | undefined,
): { kind: SafetyKind; area: string | null } | null {
  if (typeof sourceRef !== "string" || !sourceRef.startsWith(SAFETY_REF_PREFIX)) return null;
  const [rawKind, ...rest] = sourceRef.slice(SAFETY_REF_PREFIX.length).split("/");
  const kind = SAFETY_KINDS.find((k) => k.value === rawKind)?.value;
  if (!kind) return null;
  const area = rest.join(" ").trim();
  return { kind, area: area.length > 0 ? area : null };
}

export function isSafetyFinding(finding: { sourceRef: string }): boolean {
  return readSafetyRef(finding.sourceRef) !== null;
}

export function safetyKindLabel(kind: SafetyKind): string {
  return SAFETY_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/* ========================================================================== */
/*  Dates — the only thing allowed to decide that something is late           */
/* ========================================================================== */

/**
 * Today, as the plant's calendar sees it.
 *
 * Local components rather than `toISOString()`, deliberately. A plant in IST that used UTC
 * would watch every review date tick over at 05:30 in the morning, so a job due today would
 * spend most of the night shift shown as overdue. Comparing `YYYY-MM-DD` strings after that
 * needs no parsing and no timezone at all — lexical order on that format IS chronological
 * order, and there is no `Date` to be constructed wrongly.
 */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Strictly before today. A date that is missing or unreadable is NEVER late. */
export function isPastDue(due: string | null | undefined, now: Date = new Date()): boolean {
  if (typeof due !== "string" || due.length < 10) return false;
  return due.slice(0, 10) < todayIso(now);
}

export function isDueToday(due: string | null | undefined, now: Date = new Date()): boolean {
  if (typeof due !== "string" || due.length < 10) return false;
  return due.slice(0, 10) === todayIso(now);
}

/** Whole days from today to `due`. Negative means it has already passed. */
export function daysUntil(due: string | null | undefined, now: Date = new Date()): number | null {
  if (typeof due !== "string" || due.length < 10) return null;
  const target = Date.parse(`${due.slice(0, 10)}T00:00:00`);
  const start = Date.parse(`${todayIso(now)}T00:00:00`);
  if (Number.isNaN(target) || Number.isNaN(start)) return null;
  return Math.round((target - start) / 86_400_000);
}

/* ========================================================================== */
/*  States, named once                                                        */
/* ========================================================================== */

/** A finding is open until the verified corrective action closes it. */
export function isFindingOpen(finding: { status: string }): boolean {
  return finding.status !== "closed";
}

/** An action is live while it can still change. `ineffective` is live: the fix did not work. */
export function isActionOpen(action: { status: string }): boolean {
  return action.status !== "closed";
}

/**
 * Is this work order stopped because a permit is not in hand?
 *
 * The whole permit story in this build rests on this one comparison, so it is written
 * once and read from three places. `holdReason` is set by the maintenance desk through a
 * typed enum, not by anything in this module.
 */
export function isHeldForPermit(wo: { status: string; holdReason: string | null }): boolean {
  return wo.status === "on_hold" && wo.holdReason === "awaiting_permit";
}

/** Equipment that falls under a Factories Act periodic-examination regime. */
export function isStatutoryExamined(asset: { statutoryClass: string }): boolean {
  return asset.statutoryClass !== "none" && asset.statutoryClass !== "";
}

/** The plain-English name of a statutory class, with the section it comes from. */
export function statutoryClassLabel(statutoryClass: string): string {
  switch (statutoryClass) {
    case "hoist_lift_s28":
      return "Hoist or lift — §28";
    case "lifting_tackle_s29":
      return "Lifting tackle — §29";
    case "pressure_plant_s31":
      return "Pressure plant — §31";
    case "other":
      return "Other examined equipment";
    case "none":
      return "Not classified";
    default:
      return statutoryClass;
  }
}
