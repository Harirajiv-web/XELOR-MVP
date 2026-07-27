import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { num } from "@spine/format";

/**
 * QUALITY / INSPECTION (KILN, Module 06).
 *
 * Read-only in this pass. Recording readings and deciding the disposition of rejected
 * material are the two acts this module exists to make accountable; neither belongs on a
 * screen somebody opened to look something up.
 */
export const qualityManifest: ModuleManifest = {
  key: "quality",
  name: "Quality",
  summary: "Inspections, the readings behind each verdict, and what was accepted or rejected.",
  department: "KILN",
  icon: "ShieldCheck",
  licenceKey: "quality",
  order: 55,
  nav: [
    {
      label: "Inspections",
      path: "inspections",
      permission: "quality.inspection.read",
      icon: "ClipboardCheck",
      description:
        "Every lot that has been put in front of an inspector, with the gate it was checked at, the sample size the plan called for, and the verdict the readings produced. The verdict is computed from the readings against the plan — an inspector records what they measured, not whether it passed.",
    },
    {
      label: "Inspection",
      path: "inspection",
      permission: "quality.inspection.read",
      icon: "ClipboardCheck",
      hidden: true,
    },
  ],
  screens: {
    inspections: () => import("./screens/inspections"),
    inspection: () => import("./screens/inspection"),
  },
  /**
   * WHAT IS WAITING, WHAT FAILED, AND HOW THE VERDICTS SPLIT.
   *
   * `status` is how far the inspector has got; `result` is what the readings decided. They
   * are counted separately here for the same reason the list keeps them in separate columns:
   * an inspection that is finished and rejected, and one that has not been started, are both
   * "not accepted" and mean entirely different things on a shop floor.
   *
   * The rejected tile also says how many of those lots have had NO disposition decided yet —
   * material sitting in quarantine with nobody having said scrap, rework or return. That is
   * the privileged decision this module exists to make accountable, so the count of undecided
   * ones belongs on the front page rather than three clicks in.
   */
  signals: [
    {
      label: "Inspections open",
      permission: "quality.inspection.read",
      path: "/quality/inspections",
      query: { limit: 100 },
      reduce: (data) => reduceOpenInspections(data),
    },
    {
      label: "Lots rejected",
      permission: "quality.inspection.read",
      path: "/quality/inspections",
      query: { limit: 100 },
      reduce: (data) => reduceRejected(data),
    },
    {
      label: "Verdicts",
      permission: "quality.inspection.read",
      path: "/quality/inspections",
      query: { limit: 100 },
      reduce: (data) => reduceVerdictSplit(data),
    },
  ],
};

/* ------------------------------ the reducers ------------------------------- */

/** The three things a tile needs off an inspection. Narrowed off the wire, never asserted. */
interface InspectionFigures {
  status: string;
  result: string;
  dispositions: number;
}

interface InspectionPage {
  rows: InspectionFigures[];
  /** Another page exists — every count below is a floor, not a total. */
  truncated: boolean;
}

function readInspections(data: unknown): InspectionPage | null {
  if (typeof data !== "object" || data === null) return null;
  const envelope = data as { items?: unknown; nextCursor?: unknown };
  const raw: unknown[] | null = Array.isArray(data)
    ? data
    : Array.isArray(envelope.items)
      ? envelope.items
      : null;
  if (raw === null) return null;

  const rows: InspectionFigures[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const r = entry as Record<string, unknown>;
    if (typeof r.status !== "string" || typeof r.result !== "string") return null;
    rows.push({
      status: r.status,
      result: r.result,
      dispositions: Array.isArray(r.dispositions) ? r.dispositions.length : 0,
    });
  }
  return { rows, truncated: typeof envelope.nextCursor === "string" };
}

/** Opened and not yet closed out: the inspector still has readings to take or a lot to judge. */
function reduceOpenInspections(data: unknown): SignalValue | null {
  const page = readInspections(data);
  if (page === null) return null;
  const total = page.rows.length;
  if (total === 0) return { value: "0", hint: "no inspection raised yet", tone: "neutral" };
  const open = page.rows.filter(
    (r) => r.status !== "completed" && r.status !== "cancelled",
  ).length;
  return {
    value: num(open),
    hint: page.truncated
      ? `awaiting a verdict, of the first ${num(total)} inspections`
      : `awaiting a verdict, of ${num(total)} inspections`,
    tone: "neutral",
    fraction: open / total,
  };
}

/** Lots the readings rejected, and how many are still waiting on a disposition decision. */
function reduceRejected(data: unknown): SignalValue | null {
  const page = readInspections(data);
  if (page === null) return null;
  const rejected = page.rows.filter((r) => r.result === "rejected");
  if (rejected.length === 0) {
    return { value: "0", hint: "nothing rejected on this list", tone: "ok" };
  }
  const undecided = rejected.filter((r) => r.dispositions === 0).length;
  return {
    value: num(rejected.length),
    hint:
      undecided > 0
        ? `${num(undecided)} still with no disposition decided`
        : "all of them dispositioned",
    tone: "bad",
  };
}

/**
 * The split of verdicts, as a donut. Counts of inspections, not quantities — lots are
 * measured in different units and a chart that added them would be drawing a number that
 * does not exist.
 */
function reduceVerdictSplit(data: unknown): SignalValue | null {
  const page = readInspections(data);
  if (page === null) return null;
  const live = page.rows.filter((r) => r.status !== "cancelled");
  const accepted = live.filter((r) => r.result === "accepted").length;
  const rejected = live.filter((r) => r.result === "rejected").length;
  const awaiting = live.length - accepted - rejected;
  const total = accepted + rejected + awaiting;
  if (total === 0) return null;
  return {
    value: num(total),
    hint: page.truncated ? "inspections (first page)" : "inspections",
    tone: "neutral",
    // Pipeline order — a lot arrives without a verdict and leaves with one. The tones are
    // set here because they are this module's to set: accepted and rejected are the two
    // outcomes the whole gate exists to distinguish, and on a shop floor that distinction
    // is worth a colour.
    series: [
      { label: "No verdict yet", value: awaiting, tone: "neutral" },
      { label: "Accepted", value: accepted, tone: "ok" },
      { label: "Rejected", value: rejected, tone: "bad" },
    ],
  };
}
