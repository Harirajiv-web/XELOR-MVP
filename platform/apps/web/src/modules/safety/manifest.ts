import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { num } from "@spine/format";
import {
  isActionOpen,
  isFindingOpen,
  isHeldForPermit,
  isPastDue,
  readSafetyRef,
  safetyApi,
  safetyKindLabel,
} from "./api";

/**
 * SAFETY & PERMITS (KILN) — the other half of profile 6.
 *
 * QMS & Audit next door is unchanged and stays where it is. This module exists because of
 * one observation that the product profile is named after: a defect and a near-miss run
 * the SAME loop. Raise it, contain it, find out why, do something, prove the something
 * worked, keep the evidence. That loop is already built — `qms_finding` feeding
 * `qms_corrective_action`, with completion and effectiveness kept deliberately apart — and
 * building a second one for safety would produce two registers, two overdue lists, and an
 * argument about which one the auditor should be shown.
 *
 * So Safety does not own a register. It owns a WAY IN to the shared one, a view of the
 * maintenance work that a permit stops, and a corrective-action queue that shows both
 * origins at once. The Actions screen is the point of the whole package: one list, one
 * owner per row, one due date per row, one effectiveness decision per row, and a column
 * saying whether it started as a defect or as somebody nearly getting hurt.
 *
 * WHAT THIS MODULE DOES NOT DO, stated here because the screens state it too:
 *
 *   - It does not certify anything. There is no ISO 9001 or IATF 16949 claim anywhere in
 *     this module and no screen says "audit-ready". Recording a corrective action is not
 *     the same as having a management system, and a tool that implies otherwise is selling
 *     a customer a defence they do not have.
 *   - It does not produce Form 18 and does not run the §88 notice clock. A workplace
 *     injury is statutory territory with state-specific rules and a clock that starts
 *     whatever software is open. The incidents screen says so in a banner, every time.
 *   - It runs no SPC and no capability study. No Cp, no Cpk, no MSA — those need stable
 *     characteristic definitions and a measurement-system study that this plant has not
 *     done, and a capability index computed from an unqualified gauge is a number that
 *     looks like proof and is not.
 *   - It detects nothing from a camera. PPE vision is partner scope, and a safety
 *     detection that quietly fails is the most dangerous thing that could be added to this
 *     codebase — it replaces a supervisor's attention with a green tick.
 *
 * `licenceKey: "quality"` on purpose. Safety and Quality are one sold thing in profile 6,
 * they share a register, and a tenant licensed for one but not the other would get a
 * corrective-action queue with half its rows missing — which is a worse product than
 * either half alone.
 */
export const safetyManifest: ModuleManifest = {
  key: "safety",
  name: "Safety & Permits",
  summary:
    "Hazards, near-misses and permit-gated work, running on the same corrective-action loop as quality findings.",
  department: "KILN",
  icon: "HardHat",
  licenceKey: "quality",
  // Immediately after QMS & Audit (55) and before Maintenance (60): the register it shares
  // on one side, the work it gates on the other.
  order: 56,
  nav: [
    {
      label: "Hazards & incidents",
      path: "incidents",
      permission: "quality.inspection.read",
      icon: "TriangleAlert",
      description:
        "Hazards, near-misses and incidents reported by anybody on site, each with an owner and a review date. They are filed on the same non-conformance register as quality findings, under a SAFETY reference, because both run the same corrective-action loop. You can raise one here, record what was done to make it safe, and record the confirmed cause; you cannot close one here — a finding closes only when its corrective action has been verified as effective. This is NOT the statutory accident register and does not produce Form 18.",
    },
    {
      label: "Permits & gated work",
      path: "permits",
      permission: "mnt.mwo.read",
      icon: "ClipboardList",
      description:
        "The maintenance jobs a permit is standing in front of, read from the work orders themselves: work held because the permit is not in hand, work flagged as safety-related, and the mandatory checklist each job cannot be completed without. You can add a permit condition to a job as a mandatory task, which really does block its completion. There is no permit document in this build, so nothing here is a permit record — the states shown are derived from the work order and labelled as such.",
    },
    {
      label: "Corrective actions",
      path: "actions",
      permission: "quality.inspection.read",
      icon: "ListChecks",
      description:
        "Every corrective action in the plant in one queue, whether it started as a quality defect or a safety incident, with its owner, its due date, the criteria it will be judged against and whether somebody has since confirmed it actually worked. Completion and effectiveness are separate columns on purpose: an action marked done has not yet been shown to have fixed anything. Actions verified ineffective stay on the list.",
    },
    {
      label: "Gauges & examined equipment",
      path: "calibration",
      permission: "mnt.asset.read",
      icon: "Ruler",
      description:
        "The equipment register, including which machines fall under a Factories Act periodic-examination class (§28 hoists and lifts, §29 lifting tackle, §31 pressure plant). Read honestly: this build records no calibration or examination due date against equipment, so nothing here can be shown as in-date or overdue, and no gauge can be back-traced to the inspections it took because a reading records the inspector and not the instrument. The screen says both, and shows how large a manual review would be.",
    },
  ],
  screens: {
    incidents: () => import("./screens/incidents"),
    permits: () => import("./screens/permits"),
    actions: () => import("./screens/actions"),
    calibration: () => import("./screens/calibration"),
  },
  /**
   * THREE FIGURES, AND WHY THEY ARE THESE THREE.
   *
   * The corrective-action tile comes first because it is the one that describes the
   * package: a single number covering defects and incidents together, with the split shown
   * underneath. Somebody looking at the department dashboard should be able to see, without
   * opening anything, that these are one queue.
   *
   * Every one of them is a count or a date comparison over rows the screens also show. No
   * model is consulted, and none could be — there is nothing here to interpret.
   */
  signals: [
    {
      label: "Corrective actions",
      permission: "quality.inspection.read",
      path: safetyApi.correctiveActionsPath,
      reduce: (data) => reduceActions(data),
    },
    {
      label: "Safety register",
      permission: "quality.inspection.read",
      path: safetyApi.findingsPath,
      reduce: (data) => reduceSafetyRegister(data),
    },
    {
      label: "Held for a permit",
      permission: "mnt.mwo.read",
      path: safetyApi.workOrdersPath,
      reduce: (data) => reducePermitHeld(data),
    },
  ],
  /**
   * WHAT THIS MODULE INTERRUPTS SOMEBODY FOR.
   *
   * Four things, and each is a comparison against a date or a stored state. Nothing here
   * is a judgement: `dueDate < today` is arithmetic, `containment === null` is a null
   * check, `effectivenessResult === "ineffective"` is a value the verifier typed, and
   * `slaBreached` is a boolean the maintenance API computed. An alert that is wrong in the
   * reassuring direction is worse than no alert at all, and the only way to be sure that
   * never happens is to never let anything but arithmetic decide.
   *
   * WHAT IS DELIBERATELY NOT ALERTED, which matters more than the list above:
   *
   *   - NOTHING ABOUT CALIBRATION. There is no calibration due date in this build. A bell
   *     that stays quiet because no date exists would be read as "every gauge is in date",
   *     and a plant that believes its gauges are in date on the strength of a silent bell
   *     is worse off than one with no system at all. The calibration screen therefore says
   *     the dates are missing, in words, and the bell says nothing at all.
   *   - Anything about permits themselves. This build has no permit record, so it cannot
   *     know that one has expired. It knows only that a job is waiting for one.
   *   - Severity on its own. A critical finding that has been contained, has a confirmed
   *     cause and has an action running is being dealt with; ringing about it teaches
   *     people to mute the bell, which takes the real ones with it.
   */
  alerts: [
    {
      permission: "quality.inspection.read",
      path: safetyApi.findingsPath,
      reduce: (data) => findingAlerts(data),
    },
    {
      permission: "quality.inspection.read",
      path: safetyApi.correctiveActionsPath,
      reduce: (data) => actionAlerts(data),
    },
    {
      permission: "mnt.mwo.read",
      path: safetyApi.workOrdersPath,
      reduce: (data) => permitAlerts(data),
    },
  ],
};

/* ==========================================================================
   Reading the wire.

   Every reducer below narrows `unknown` field by field and returns null the moment a
   response does not look like what it expects. A tile that renders a wrong number off a
   changed API is the failure this shape exists to prevent: `reduce` runs inside a
   try/catch, so a thrown reducer costs a missing tile, while a careless cast costs a
   confident lie on a dashboard.
   ========================================================================== */

/** The eight most pressing, plus one line accounting for the rest. */
const ALERT_CAP = 8;

function rowsOf(data: unknown): readonly Record<string, unknown>[] | null {
  const raw = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null && Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items)
      : null;
  if (raw === null) return null;
  const rows: Record<string, unknown>[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    rows.push(entry as Record<string, unknown>);
  }
  return rows;
}

function str(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function maybeStr(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

/* ------------------------------- signals ---------------------------------- */

/**
 * The shared queue, with its split shown rather than described.
 *
 * `origin` cannot be read off a corrective action — the action carries the finding's
 * number and title, not its source — so the split here is taken from the FINDING TITLE
 * only where the finding number is unavailable. It is not, so this tile counts the whole
 * queue and leaves the split to the screen, which loads both lists and joins them
 * properly. A tile that guessed would disagree with the screen behind it.
 */
function reduceActions(data: unknown): SignalValue | null {
  const rows = rowsOf(data);
  if (rows === null) return null;
  if (rows.length === 0) {
    return { value: "0", hint: "no corrective action raised yet", tone: "neutral" };
  }
  const open = rows.filter((row) => isActionOpen({ status: str(row, "status") }));
  const overdue = open.filter((row) => isPastDue(maybeStr(row, "dueDate")));
  const awaitingReview = rows.filter((row) => str(row, "status") === "effectiveness_review");
  const ineffective = rows.filter((row) => str(row, "effectivenessResult") === "ineffective");
  const closed = rows.length - open.length;
  return {
    value: num(open.length),
    hint:
      overdue.length > 0
        ? `${num(overdue.length)} past their due date`
        : awaitingReview.length > 0
          ? `${num(awaitingReview.length)} waiting on an effectiveness decision`
          : `open, of ${num(rows.length)} ever raised`,
    tone: overdue.length > 0 ? "bad" : ineffective.length > 0 ? "warn" : open.length > 0 ? "neutral" : "ok",
    series: [
      { label: "Open", value: open.length - awaitingReview.length - ineffective.length, tone: "neutral" },
      { label: "Awaiting effectiveness", value: awaitingReview.length, tone: "warn" },
      { label: "Verified ineffective", value: ineffective.length, tone: "bad" },
      { label: "Closed", value: closed, tone: "ok" },
    ],
  };
}

/** Open hazards, near-misses and incidents, split by how serious somebody judged them. */
function reduceSafetyRegister(data: unknown): SignalValue | null {
  const rows = rowsOf(data);
  if (rows === null) return null;
  const safety = rows.filter((row) => readSafetyRef(str(row, "sourceRef")) !== null);
  if (safety.length === 0) {
    return { value: "0", hint: "nothing reported through Safety yet", tone: "neutral" };
  }
  const open = safety.filter((row) => isFindingOpen({ status: str(row, "status") }));
  const overdue = open.filter((row) => isPastDue(maybeStr(row, "dueDate")));
  const critical = open.filter((row) => str(row, "severity") === "critical");
  return {
    value: num(open.length),
    hint:
      overdue.length > 0
        ? `${num(overdue.length)} past their review date`
        : `open, of ${num(safety.length)} reported`,
    tone: overdue.length > 0 || critical.length > 0 ? "bad" : open.length > 0 ? "warn" : "ok",
    fraction: safety.length > 0 ? open.length / safety.length : undefined,
    series: [
      { label: "Critical", value: critical.length, tone: "bad" },
      { label: "Major", value: open.filter((row) => str(row, "severity") === "major").length, tone: "warn" },
      { label: "Minor", value: open.filter((row) => str(row, "severity") === "minor").length, tone: "neutral" },
    ],
  };
}

/** Maintenance jobs standing still because the permit is not in hand. */
function reducePermitHeld(data: unknown): SignalValue | null {
  const rows = rowsOf(data);
  if (rows === null) return null;
  const held = rows.filter((row) =>
    isHeldForPermit({ status: str(row, "status"), holdReason: maybeStr(row, "holdReason") }),
  );
  const breached = held.filter((row) => row["slaBreached"] === true);
  return {
    value: num(held.length),
    hint:
      held.length === 0
        ? "no job is waiting on a permit"
        : breached.length > 0
          ? `${num(breached.length)} already past the restore time`
          : "jobs waiting on a permit to be issued",
    tone: breached.length > 0 ? "bad" : held.length > 0 ? "warn" : "ok",
  };
}

/* -------------------------------- alerts ---------------------------------- */

function cap(alerts: readonly ModuleAlert[], id: string, href: string): readonly ModuleAlert[] {
  if (alerts.length <= ALERT_CAP) return alerts;
  return [
    ...alerts.slice(0, ALERT_CAP),
    {
      id,
      severity: "attention",
      title: `${alerts.length} in total — the ${ALERT_CAP} most pressing are listed above`,
      body: "The rest are on the screen, with the same owner and date on every row.",
      href,
    },
  ];
}

/**
 * Two facts about a safety entry are worth interrupting somebody for.
 *
 * PAST ITS REVIEW DATE — `dueDate < today`, a string comparison on `YYYY-MM-DD`. The owner
 * said they would have looked at it by now and has not.
 *
 * CRITICAL AND NOT CONTAINED — `severity === "critical" && containment === null`.
 * Containment is the step that makes the place safe while the cause is still unknown, so a
 * critical entry with nothing recorded against it means the immediate danger has not been
 * dealt with, or has been dealt with and not written down. Both need somebody now, and the
 * alert says which of the two it cannot tell apart.
 */
function findingAlerts(data: unknown): readonly ModuleAlert[] {
  const rows = rowsOf(data);
  if (rows === null) return [];
  const alerts: ModuleAlert[] = [];
  for (const row of rows) {
    const ref = readSafetyRef(str(row, "sourceRef"));
    if (ref === null) continue;
    const status = str(row, "status");
    if (!isFindingOpen({ status })) continue;
    const findingNo = str(row, "findingNo");
    if (!findingNo) continue;
    const severity = str(row, "severity");
    const title = str(row, "title");
    const where = ref.area ? ` (${ref.area})` : "";
    const dueDate = maybeStr(row, "dueDate");

    if (severity === "critical" && maybeStr(row, "containment") === null) {
      alerts.push({
        id: `safety.finding.uncontained.${findingNo}`,
        severity: "critical",
        title: `${safetyKindLabel(ref.kind)} ${findingNo} is critical with nothing recorded to make it safe`,
        body: "Either the immediate danger has not been dealt with, or it has and nobody wrote it down. This cannot tell the two apart, which is why it is on the bell.",
        href: "/safety/incidents",
        at: str(row, "createdAt") || undefined,
        evidence: `${findingNo} · ${title}${where} · severity critical · containment not recorded · owner ${str(row, "ownerRef") || "unassigned"}.`,
      });
      continue;
    }

    if (isPastDue(dueDate)) {
      alerts.push({
        id: `safety.finding.overdue.${findingNo}`,
        severity: severity === "critical" ? "critical" : "urgent",
        title: `${safetyKindLabel(ref.kind)} ${findingNo} is past its review date`,
        body: `${str(row, "ownerRef") || "Nobody"} was to have reviewed this by ${dueDate ?? "the date set"}. It is still open.`,
        href: "/safety/incidents",
        at: str(row, "createdAt") || undefined,
        evidence: `${findingNo} · ${title}${where} · review date ${dueDate ?? "not set"} · stage ${status}.`,
      });
    }
  }
  // Critical first, then the rest, so the cap keeps what matters when there are many.
  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
  return cap(alerts, "safety.finding.more", "/safety/incidents");
}

/**
 * An action is worth a bell in two states, and neither is "somebody has not started it".
 *
 * PAST ITS DUE DATE while still open — arithmetic on the date the owner chose.
 *
 * VERIFIED INEFFECTIVE — somebody checked and the fix did not work. The API keeps such an
 * action out of `closed` for exactly this reason, and the finding underneath it is still
 * open. This is the state that gets lost: the paperwork looks finished, and the problem is
 * still there.
 */
function actionAlerts(data: unknown): readonly ModuleAlert[] {
  const rows = rowsOf(data);
  if (rows === null) return [];
  const alerts: ModuleAlert[] = [];
  for (const row of rows) {
    const capaNo = str(row, "capaNo");
    if (!capaNo) continue;
    const status = str(row, "status");
    if (!isActionOpen({ status })) continue;
    const findingNo = str(row, "findingNo");
    const title = str(row, "title");
    const owner = str(row, "ownerRef") || "unassigned";
    const dueDate = maybeStr(row, "dueDate");

    if (str(row, "effectivenessResult") === "ineffective") {
      alerts.push({
        id: `safety.action.ineffective.${capaNo}`,
        severity: "urgent",
        title: `${capaNo} was checked and did not work`,
        body: `The fix for ${findingNo || "the finding behind it"} failed its effectiveness check, so the finding is still open and needs a different action.`,
        href: "/safety/actions",
        at: maybeStr(row, "verifiedAt") ?? undefined,
        evidence: `${capaNo} · ${title} · criteria: ${str(row, "effectivenessCriteria")} · verifier's evidence: ${str(row, "effectivenessEvidence") || "not recorded"}.`,
      });
      continue;
    }

    if (isPastDue(dueDate)) {
      alerts.push({
        id: `safety.action.overdue.${capaNo}`,
        severity: "urgent",
        title: `${capaNo} is past its due date`,
        body: `${owner} owns this action against ${findingNo || "an open finding"}, and the finding cannot close until it is done and verified.`,
        href: "/safety/actions",
        at: str(row, "createdAt") || undefined,
        evidence: `${capaNo} · ${title} · due ${dueDate ?? "not set"} · stage ${status} · owner ${owner}.`,
      });
    }
  }
  return cap(alerts, "safety.action.more", "/safety/actions");
}

/**
 * Work that has stopped waiting for a permit.
 *
 * `slaBreached` is the maintenance API's own computation against the restore time it set
 * when the job was raised, so this is a boolean somebody else already decided, not a
 * judgement made here. Held-and-breached is urgent; held is worth knowing about.
 */
function permitAlerts(data: unknown): readonly ModuleAlert[] {
  const rows = rowsOf(data);
  if (rows === null) return [];
  const alerts: ModuleAlert[] = [];
  for (const row of rows) {
    const mwoNo = str(row, "mwoNo");
    if (!mwoNo) continue;
    if (!isHeldForPermit({ status: str(row, "status"), holdReason: maybeStr(row, "holdReason") })) {
      continue;
    }
    const breached = row["slaBreached"] === true;
    alerts.push({
      id: `safety.permit.held.${mwoNo}`,
      severity: breached ? "urgent" : "attention",
      title: `${mwoNo} on ${str(row, "assetCode") || "an asset"} is held waiting for a permit`,
      body: breached
        ? "The job is already past the restore time it was given, and it has not started because the permit is not in hand."
        : "The job cannot start until the permit is issued. Nothing in this system issues one.",
      href: "/safety/permits",
      at: str(row, "reportedAt") || undefined,
      evidence: `${mwoNo} · ${str(row, "title")} · ${str(row, "assetCode")} ${str(row, "assetName")} · held for a permit · restore by ${maybeStr(row, "slaRestoreBy") ?? "not set"}.`,
    });
  }
  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "urgent" ? -1 : 1));
  return cap(alerts, "safety.permit.more", "/safety/permits");
}
