import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { engChangeApi } from "./api";

/* --------------------------- defensive narrowing ---------------------------- */
/**
 * `reduce` is handed `unknown` — what the network actually returned, not what the type says
 * it should have been. Everything below guards every access and returns null (or an empty
 * alert list) on a shape it does not recognise. A dropped tile is the right outcome for a
 * decorative figure; a tile that throws takes the dashboard down with it.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tolerates `{ items }`, `{ data }` and a bare array — three envelopes exist in this API. */
function recordsOf(data: unknown): readonly Record<string, unknown>[] {
  let list: unknown = data;
  if (isRecord(data)) list = data["items"] ?? data["data"];
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord);
}

function truncated(data: unknown): boolean {
  if (!isRecord(data)) return false;
  const cursor = data["nextCursor"];
  return typeof cursor === "string" && cursor.length > 0;
}

function textOf(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function countOf(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The item types this factory MAKES. A bought part with no BOM is correct, not a gap. */
const MADE_TYPES = new Set(["finished_good", "sub_assembly"]);

/**
 * Open, by exclusion rather than inclusion — the same reasoning as `isOpenStatus` in
 * `api.ts`. An inclusion list silently drops a status somebody adds later, and it fails in
 * the dangerous direction: a live build vanishing from a count of live builds.
 */
const SETTLED_PRODUCTION = new Set(["completed", "complete", "closed", "cancelled", "canceled"]);

function isOpenProductionOrder(row: Record<string, unknown>): boolean {
  const status = textOf(row, "status");
  if (!status) return true;
  return !SETTLED_PRODUCTION.has(status.toLowerCase().replace(/[\s-]+/g, "_"));
}

/** The eight sharpest, plus one line accounting for the rest. */
const ALERT_CAP = 8;

/**
 * ENGINEERING CHANGE (AXLE) — the half of change control the schema cannot yet hold.
 *
 * ============================================================================
 * WHAT THIS MODULE IS, AND WHAT IT DELIBERATELY IS NOT.
 * ============================================================================
 *
 * An engineering change rewrites the bill of materials, and the bill of materials is what
 * the plan is computed from — so a change and a plan are the same model read forwards and
 * backwards. Planning reads it forwards: given this structure, what do I make and buy.
 * This module reads it backwards: given that I am about to change this structure, what
 * does it break.
 *
 * It is NOT a PLM system. There is no CAD, no document vault, no part-numbering scheme, no
 * APQP or PPAP package — those are segment-specific and belong to a partner, not here.
 *
 * ============================================================================
 * THE THING THIS MODULE CANNOT DO, STATED FIRST SO NOBODY DISCOVERS IT LATER.
 * ============================================================================
 *
 * IT CANNOT SAVE AN ENGINEERING CHANGE REQUEST. There is no `change_request` table, no
 * approval route, no effectivity date and no disposition record anywhere in this schema.
 * The whole engineering side is `item`, `bom` and `bom_line`.
 *
 * So the ECR journey — raise, assess, approve, make effective, acknowledge on the floor —
 * is present here only as far as real records can carry it:
 *
 *   RAISE            not persisted. Nothing to write to. No screen offers to.
 *   ASSESS           REAL, and recomputed live from the where-used closure, open orders
 *                    and stock. It is not saved, so it is always current and never signed.
 *   APPROVE          not persisted for a change. The ONE approval that is real in this
 *                    system is publishing a schedule, which stamps an approver — so the
 *                    scenarios screen has a genuine approval gate and the change screens
 *                    have none, and each says which it is.
 *   EFFECTIVE FROM   not persisted. A BOM is active or it is not; it cannot become active
 *                    on a date or at a serial number.
 *   ACKNOWLEDGE      not persisted. No shop-floor acknowledgement exists to record.
 *
 * Every screen states its own gap in the interface. None of them shows a form that appears
 * to save and does not. A fabricated approval on a change-control screen is not a cosmetic
 * defect — it is the precise failure this product is sold on not having.
 *
 * WHAT IS REAL, AND WHY IT IS WORTH HAVING ANYWAY. A production order PINS the `bom_id` it
 * was exploded from, and the BOM controller refuses to edit an active BOM in place. So the
 * revision a build was made to is a fact the database preserves, and the question this
 * project's own gap analysis quotes as unanswerable — "which revision was in the unit we
 * shipped in August" — is answerable through the production order. That is what the
 * revisions screen does.
 *
 * `licenceKey: "engineering"` rather than a key of its own: change control is sold as part
 * of Engineering, and minting a new licence key would make this module read as UNLICENSED
 * for every tenant whose licence record was written before it existed. Three gates decide
 * whether somebody sees a module — installed, licensed, permitted — and this one should
 * fail on none of them for an existing Engineering customer.
 */
export const engChangeManifest: ModuleManifest = {
  key: "engchange",
  name: "Engineering change",
  summary:
    "What a revision change would touch, which revision is current, and which revision was built — read from the orders and bills of material that already exist.",
  department: "AXLE",
  icon: "GitCompareArrows",
  licenceKey: "engineering",
  // Immediately after Engineering (15): same department, same bill of materials, read the
  // other way round. Planning is 35 and stays where it is.
  order: 16,
  nav: [
    {
      label: "Change impact",
      path: "impact",
      permission: ["engineering.item.read", "planning.policy.read"],
      icon: "Radar",
      description:
        "Pick a part and see everything a revision change to it would touch: every parent assembly that consumes it at any depth, the open production orders that would be built to the old revision, the open customer orders those builds are promised against, the stock already on the shelf, and the planned buy orders still to be raised. Every figure is read live from the where-used closure over active bills of material and from the order and stock tables — nothing is cached and nothing is saved. This screen does NOT raise a change request; there is no table to raise one in, and it says so where you would expect the button.",
    },
    {
      label: "Revisions",
      path: "revisions",
      permission: ["engineering.item.read", "engineering.bom.read"],
      icon: "GitBranch",
      description:
        "Which revision of a part's bill of material is current, which revisions were actually built, and exactly what changed between any two of them — line by line, compared per unit of output so a change of batch size does not read as a change of recipe. The built revisions are found through production orders, which pin the bill they were exploded from; a revision that was never built and is not the current one cannot be listed, because no endpoint lists a part's versions. Bills carry no created date or author, so this screen shows neither rather than leaving empty columns.",
    },
    {
      label: "Scenarios",
      path: "scenarios",
      permission: ["planning.schedule.read", "planning.schedule.manage"],
      icon: "Columns2",
      description:
        "Sequence the same planning run two ways and compare the consequences side by side: orders late, total days late, and how long the whole thing takes. The published dispatch list is untouched until somebody publishes deliberately, which requires a separate permission and is refused if the plan has moved underneath the proposal. This is a finite-capacity heuristic, not an optimizer: it does not find the best schedule and never claims to, it checks machine time only, and it does not verify tooling or material availability — the screen says so beside every figure.",
    },
    {
      label: "Introduction gates",
      path: "gates",
      permission: ["engineering.item.read", "production.order.read"],
      icon: "ListChecks",
      description:
        "A four-stage checklist for bringing a new part into production — concept, feasibility, prototype, production release — with each stage showing the real records that would evidence it: the item master row, the bill of material, the planning policy, the production orders actually raised, and the finished stock on hand. NOTHING ON THIS SCREEN IS SAVED. There is no stage-gate table and no owner field anywhere in this schema, so no gate can be signed off, assigned or dated here; the screen reports what the records show and says plainly that it is a reading, not a record.",
    },
  ],
  screens: {
    impact: () => import("./screens/impact"),
    revisions: () => import("./screens/revisions"),
    scenarios: () => import("./screens/scenarios"),
    gates: () => import("./screens/gates"),
  },

  /* ------------------------------------------------------------------------ */
  /* SIGNALS                                                                   */
  /* ------------------------------------------------------------------------ */
  /**
   * Two figures, both counts of rows, both computed here in arithmetic. No model is asked
   * anything — there is nothing here a model could add, and a model's opinion about how
   * many live revisions a part has would be an opinion about a fact.
   *
   * Both read only the FIRST page of their endpoint. That is a real limit and the hint says
   * so on every tile rather than only when it bites: a figure that silently means "of the
   * first fifty" is a figure somebody will quote in a meeting as if it meant "of all".
   */
  signals: [
    {
      label: "Parts with two live BOMs",
      permission: "engineering.item.read",
      path: engChangeApi.itemsPath,
      query: { limit: 50 },
      reduce: (data): SignalValue | null => {
        const rows = recordsOf(data);
        if (rows.length === 0 && !Array.isArray(data) && !isRecord(data)) return null;
        const ambiguous = rows.filter((r) => (countOf(r, "bomCount") ?? 0) > 1);
        const more = truncated(data);
        return {
          value: String(ambiguous.length),
          hint:
            ambiguous.length === 0
              ? `Every part in the first ${rows.length} has at most one live bill`
              : `${ambiguous.length} part(s) where "the current revision" is ambiguous${more ? " — first page only" : ""}`,
          // Two live bills is not a catastrophe and is not fine either: it is the state in
          // which two people can both be right about which revision is current.
          tone: ambiguous.length === 0 ? "ok" : "warn",
        };
      },
    },
    {
      label: "Builds pinned to a revision",
      permission: "production.order.read",
      path: engChangeApi.productionOrdersPath,
      query: { limit: 50 },
      reduce: (data): SignalValue | null => {
        const rows = recordsOf(data);
        if (rows.length === 0 && !Array.isArray(data) && !isRecord(data)) return null;
        const open = rows.filter(isOpenProductionOrder);
        return {
          value: String(open.length),
          hint:
            open.length === 0
              ? "No open production order; nothing is mid-build against a revision"
              : `Open orders, each fixed to the bill it was exploded from${truncated(data) ? " — first page only" : ""}`,
          // Neutral on purpose. Open builds are the factory working, not a problem. The
          // figure is here because it is the count of things a revision change cannot alter.
          tone: "neutral",
        };
      },
    },
  ],

  /* ------------------------------------------------------------------------ */
  /* WHAT THIS MODULE INTERRUPTS SOMEBODY FOR                                  */
  /* ------------------------------------------------------------------------ */
  /**
   * Two facts, both decided by a comparison over real rows, neither by a model.
   *
   * 1. A PART WITH MORE THAN ONE LIVE BILL OF MATERIAL. Publishing a new version does not
   *    retire the old one — `POST /engineering/boms` inserts version n+1 and leaves version
   *    n active, because nothing in this schema supersedes a bill. Both then sit in the
   *    active BOM graph that where-used and MRP's low-level codes are computed over. That
   *    is a change-control defect with a name, an owner and a screen, so it earns the bell.
   *
   * 2. A MADE PART WITH NO BILL AT ALL. A finished good or sub-assembly with no recipe
   *    cannot be planned, cannot be exploded into a production order, and cannot have a
   *    change controlled against it — there is nothing to change. It is usually a part
   *    half-created and forgotten, which is exactly the thing that rots quietly.
   *
   * DELIBERATELY NOT ALERTED: a bought part with no bill (correct — it is bought), a part
   * with exactly one bill (correct — that is the normal state), and anything about whether
   * a revision is a GOOD idea. That last one is a judgement, this is a watch, and a bell
   * that offers opinions gets muted inside a week — taking the real warnings with it.
   */
  alerts: [
    {
      permission: "engineering.item.read",
      path: engChangeApi.itemsPath,
      query: { limit: 50 },
      reduce: (data): readonly ModuleAlert[] => {
        const rows = recordsOf(data);
        const alerts: ModuleAlert[] = [];

        for (const row of rows) {
          const id = textOf(row, "id");
          const code = textOf(row, "itemCode");
          if (!id || !code) continue;
          const name = textOf(row, "name") ?? "";
          const type = textOf(row, "itemType") ?? "";
          const boms = countOf(row, "bomCount") ?? 0;

          if (boms > 1) {
            alerts.push({
              // The item's own id: one alert per ambiguous part, stable until a bill is
              // retired, and gone the moment one is. No timestamp in the id — an id that
              // changed every poll would re-announce the same part every sixty seconds.
              id: `engchange.multi-bom.${id}`,
              severity: "attention",
              title: `${code} has ${boms} live bills of material`,
              body:
                "Publishing a revision does not retire the one before it, so two versions are both active and both are in the bill-of-materials graph that where-used and planning read. Until one is retired, two people can disagree about which revision is current and both be right.",
              href: "/engchange/revisions",
              evidence: `Item ${code}${name ? ` (${name})` : ""} — ${boms} active bill(s) of material reported by GET /engineering/items.`,
            });
            continue;
          }

          if (boms === 0 && MADE_TYPES.has(type)) {
            alerts.push({
              id: `engchange.no-bom.${id}`,
              severity: "attention",
              title: `${code} is made here but has no bill of material`,
              body:
                "A made part with no recipe cannot be planned, cannot be exploded into a production order, and has nothing for a change to be controlled against. Add the bill, or change the item type if it is actually bought.",
              href: "/engchange/gates",
              evidence: `Item ${code}${name ? ` (${name})` : ""}, type ${type}, 0 active bills of material.`,
            });
          }
        }

        if (alerts.length <= ALERT_CAP) return alerts;
        return [
          ...alerts.slice(0, ALERT_CAP),
          {
            id: "engchange.more",
            severity: "attention",
            title: `${alerts.length} parts need a bill of material sorting out — the ${ALERT_CAP} above are a sample`,
            body: "The rest are on the Revisions and Introduction gates screens, with the same evidence.",
            href: "/engchange/revisions",
          },
        ];
      },
    },
  ],
};
