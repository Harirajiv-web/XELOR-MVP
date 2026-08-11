/**
 * THE NINE DEMO SCENARIOS — what each one proves, and what it needs to be true.
 *
 * A demo script is a list of things to click. This is a list of things that have to be TRUE
 * in the database for a scenario to happen at all, which is a different and more useful
 * artefact: the catalogue endpoint probes this tenant's own records and answers, per
 * scenario, "yes — run it on SO-2627-00004" or "no, and here is exactly what is missing".
 *
 * THAT SECOND ANSWER IS THE POINT. The temptation with a scenario list is to make every row
 * green by special-casing the engine until it produces the expected picture. A scenario that
 * cannot genuinely occur is reported `available: false` with the reason and with the record
 * somebody would have to create to make it occur. Nothing in this file makes the mission
 * behave differently from how it behaves for a real order — it only chooses WHICH order, and
 * which policy setting, so that the behaviour being demonstrated actually shows up.
 *
 * The one exception is scenario 8, and it is labelled everywhere it surfaces: a failure has
 * to be injected because a correctly-configured demo tenant does not have a broken purchase
 * path lying around. It is armed as a `fulfilment_event` with `simulated: true`, exactly the
 * way the supplier-delay disruption already is, and the step that trips over it says in its
 * own narration that the fault was injected.
 */

/** Every scenario key. Ordered as the user listed them, and the numbers are theirs. */
export type ScenarioKey =
  | "stock-covers-it"
  | "short-of-material"
  | "recommend-purchase"
  | "recommend-work-order"
  | "missing-information"
  | "human-approval"
  | "spreadsheet-source"
  | "failure-then-retry"
  | "full-audit-trail";

export interface ScenarioSpec {
  key: ScenarioKey;
  /** 1..9, as the list was given. Kept so the UI can present them in the asked-for order. */
  number: number;
  title: string;
  /** What a viewer is supposed to take away. One sentence. */
  demonstrates: string;
  /** The setup this needs — which order, and what the starter does to the mission. */
  needs: string;
  /** Where in the arc the moment lands, so a presenter knows when to stop talking. */
  momentAt: string;
  /** Two or three things to watch for. These are what make the demo legible. */
  watchFor: readonly string[];
  /** The autonomy tier the starter opens the mission at, and why it is that one. */
  tier: "A2" | "A3" | "A4";
}

export const SCENARIOS: readonly ScenarioSpec[] = [
  {
    key: "stock-covers-it",
    number: 1,
    title: "A normal order the stores can already cover",
    demonstrates:
      "The straight-through case. Phase 2 reads Sales, Engineering and Inventory, finds nothing short, and plans a ship-from-stock strategy with no buying decision to make.",
    needs: "A confirmed sales order whose every BOM component is already on hand.",
    momentAt: "materials — 'nothing needs buying' is a conclusion, not a default",
    watchFor: [
      "The netting step reports 0 short of N components, with the arithmetic on the card",
      "Only one strategy is generated, because a factory with nothing to buy has nothing to choose between",
      "No purchase order is raised, and the procure step says so rather than skipping quietly",
    ],
    tier: "A3",
  },
  {
    key: "short-of-material",
    number: 2,
    title: "The stores cannot cover it",
    demonstrates:
      "The netting is real. Required is exploded from the released BOM against the ordered quantity, netted against live stock_balance rows, and the shortfall drives everything after it.",
    needs: "A confirmed sales order that IS short — chosen by probing the shortage, not assumed.",
    momentAt: "materials → sourcing",
    watchFor: [
      "The biggest gap is named as a part, with the number a storeman would check",
      "Sourcing appears only because something is short",
      "Change the stock and the plan changes — this is not a script",
    ],
    tier: "A3",
  },
  {
    key: "recommend-purchase",
    number: 3,
    title: "It recommends, then raises, the purchase orders",
    demonstrates:
      "Recommendation becoming a document. The planner picks suppliers line by line; the execute step groups them into one purchase order per vendor and asks PURCHASE to raise them through its own port.",
    needs: "A short order whose suppliers all resolve against this tenant's vendor master.",
    momentAt: "procure",
    watchFor: [
      "One purchase order per vendor, not one per line",
      "The documents are re-read from purchase_order afterwards — executed and verified are separate claims",
      "They are DRAFTS: the mission may decide what to buy and may not sign for it",
    ],
    tier: "A3",
  },
  {
    key: "recommend-work-order",
    number: 4,
    title: "It recommends, then releases, the work order",
    demonstrates:
      "The same governed path into Production. One work order for the committed quantity, pegged to the sales order line it serves, released through PRODUCTION's own port.",
    needs: "A confirmed order for an item with a released BOM.",
    momentAt: "workorder",
    watchFor: [
      "The work order carries the sales order line — the shop floor can see the customer at the end of it",
      "The postcondition re-reads production_order and checks the peg and the quantity",
      "The need date comes from the plan, not from today plus a guess",
    ],
    tier: "A3",
  },
  {
    key: "missing-information",
    number: 5,
    title: "Something it needs is not in Phase 1",
    demonstrates:
      "The refusal. When a fact the decision depends on is missing — no released build sheet, or a short component with nobody qualified to supply it — the mission stops and names what a person has to provide. It does not guess.",
    needs:
      "A confirmed order whose finished good has no active BOM, or a shortage with no qualified supplier.",
    momentAt: "engineering, or sourcing",
    watchFor: [
      "The mission stops rather than inventing a structure or a supplier",
      "The refusal names the missing record and whose job it is",
      "Nothing downstream is attempted, and the card says so",
    ],
    tier: "A3",
  },
  {
    key: "human-approval",
    number: 6,
    title: "A decision that needs a person",
    demonstrates:
      "The authority gate. Opened at 'Suggest only', the mission does the entire analysis and then stops, because the plan commits money and this tier may not.",
    needs: "Any confirmed order. The tier is what guarantees the stop, on any order.",
    momentAt: "authorize",
    watchFor: [
      "The brief answers 'what if I say no' and 'what if I go to lunch first' — never a bare Approve?",
      "The alternatives are still on screen, including the ones that were rejected and why",
      "Approve, reject, or ask for a different approach — all three are real answers",
    ],
    tier: "A2",
  },
  {
    key: "spreadsheet-source",
    number: 7,
    title: "The price list arrives as a spreadsheet",
    demonstrates:
      "Phase 2 sitting on a source that is not an ERP at all. Phase 1 holds no supplier price or lead-time master, so the terms come from a file — and the plan moves when the file does.",
    needs: "A short order, plus a supplier-terms sheet. The starter generates one; you can upload your own.",
    momentAt: "sourcing → strategy",
    watchFor: [
      "The sourcing step's context row is labelled as a FILE, with the file's name on it",
      "The chosen supplier and the completion date change when the numbers in the file change",
      "Nothing else is imported this way — one narrow path, honestly scoped",
    ],
    tier: "A3",
  },
  {
    key: "failure-then-retry",
    number: 8,
    title: "It fails, says so, and is retried",
    demonstrates:
      "What happens when a write refuses. The step stops rather than reporting a half-placed order as a completed one; the failure is recorded; the operator retries and the same step runs again from the same evidence.",
    needs:
      "A short order, plus an injected fault. The fault is SIMULATED and labelled — a correctly configured tenant does not have a broken purchase path to borrow.",
    momentAt: "procure, then the retry",
    watchFor: [
      "The mission does not claim the purchase orders exist",
      "The retry's first pipeline row carries the original failure — it is never swallowed",
      "The idempotency key means the retry replays what was already created and only raises what was not",
    ],
    tier: "A3",
  },
  {
    key: "full-audit-trail",
    number: 9,
    title: "End to end, with everything provable",
    demonstrates:
      "The whole arc at 'Act and notify': thirteen steps, every action verified against the state it claimed to change, and a close that refuses to declare success on its own say-so.",
    needs: "A confirmed order whose suppliers resolve, run at the highest tier this product offers.",
    momentAt: "close",
    watchFor: [
      "N of N actions independently verified — the count is read from the action rows, not asserted",
      "Autonomous versus human-approved actions are counted separately",
      "Every step's pipeline names the module it read and the document it wrote",
    ],
    tier: "A4",
  },
] as const;

export const SCENARIO_BY_KEY: ReadonlyMap<string, ScenarioSpec> = new Map(SCENARIOS.map((s) => [s.key, s]));

/**
 * THE INJECTED FAULT — scenario 8, and the only invented failure in the product.
 *
 * Armed as a `fulfilment_event` with `simulated: true`, consumed once by the procure step,
 * and named in that step's own narration. The wording matters: it must be impossible for a
 * viewer to think PURCHASE genuinely refused something.
 */
export const SIMULATED_FAULT = {
  eventName: "simulated.fault.armed.v1",
  /** The step it bites. Procure, because a document that was not raised is a visible fact. */
  stepKey: "procure",
  reason:
    "Simulated fault, armed by demo scenario 8 — PURCHASE was never called. " +
    "A real refusal here would read exactly like this: the vendor is on a credit hold that only a person can lift.",
} as const;

/** The event a supplier-terms spreadsheet is recorded as. One name, used in three places. */
export const TERMS_UPLOAD_EVENT = "sourcing.terms.uploaded.v1";

/** The event a retry is recorded as, so the original failure survives the re-run. */
export const STEP_RETRY_EVENT = "fulfilment.step.retried.v1";

/* ------------------------------------------------------------------ resolution -- */

/** What the probe found out about one confirmed order. Facts only; no scenario logic. */
export interface OrderProbe {
  salesOrderId: string;
  soNo: string;
  customerName: string;
  orderQty: number;
  itemCode: string;
  hasReleasedBom: boolean;
  componentCount: number;
  shortCount: number;
  /** Sourcing references that would not resolve against this tenant's masters. */
  unresolvedVendors: readonly string[];
  /** Short components with nobody qualified to supply them. */
  unsourceable: readonly string[];
  /** True when a live mission already exists for this order. */
  hasLiveMission: boolean;
}

/** A scenario, answered against this tenant's actual data. */
export interface ResolvedScenario extends ScenarioSpec {
  available: boolean;
  /** Why it is available, or precisely what is missing. Never empty. */
  reason: string;
  salesOrderId: string | null;
  soNo: string | null;
  customerName: string | null;
  /** What `start` will do, in order, so nothing about the setup is a surprise. */
  setup: readonly string[];
}

/**
 * Choose the order each scenario needs, out of what this tenant actually has.
 *
 * Pure — it takes the probes and returns the answers — so the choice rules are testable and
 * are all visible in one place rather than scattered through the service.
 */
export function resolveScenarios(probes: readonly OrderProbe[]): ResolvedScenario[] {
  // An order with no live mission is preferred wherever one qualifies: opening a mission on
  // an order that already has one returns the EXISTING mission, and a presenter who expected
  // a fresh arc gets a half-finished one.
  const pick = (predicate: (p: OrderProbe) => boolean): OrderProbe | null =>
    probes.find((p) => predicate(p) && !p.hasLiveMission) ?? probes.find(predicate) ?? null;

  const planable = (p: OrderProbe): boolean => p.hasReleasedBom;
  const short = (p: OrderProbe): boolean => planable(p) && p.shortCount > 0;
  const buyable = (p: OrderProbe): boolean => short(p) && p.unresolvedVendors.length === 0 && p.unsourceable.length === 0;

  const out: ResolvedScenario[] = [];

  for (const spec of SCENARIOS) {
    let hit: OrderProbe | null = null;
    let missing = "";
    const setup: string[] = [];

    switch (spec.key) {
      case "stock-covers-it":
        hit = pick((p) => planable(p) && p.shortCount === 0);
        missing =
          "Every confirmed order in this tenant is short of at least one component. " +
          "Receive stock against one of them — or confirm an order small enough for what is on hand — and this becomes available.";
        break;

      case "short-of-material":
        hit = pick(short);
        missing =
          "No confirmed order is short of anything. Confirm an order larger than the on-hand stock for its components, " +
          "or issue stock out, and this becomes available.";
        break;

      case "recommend-purchase":
        hit = pick(buyable);
        missing =
          "No confirmed order is both short and fully sourceable. A shortage whose supplier is not in the vendor master " +
          "stops the mission at procure by design — seed the vendor and this becomes available.";
        break;

      case "recommend-work-order":
        hit = pick((p) => planable(p) && (p.shortCount === 0 || buyable(p)));
        missing =
          "No confirmed order can reach the release step: every one either has no released BOM, or is short of a component " +
          "nobody qualified can supply.";
        break;

      case "missing-information":
        // The genuine article: an order the mission cannot plan because Phase 1 does not hold
        // a fact it needs. Not manufactured — probed for.
        hit = pick((p) => !p.hasReleasedBom) ?? pick((p) => p.unsourceable.length > 0);
        missing =
          "Every confirmed order has a released BOM and a qualified supplier for everything it is short of, so there is " +
          "nothing the mission has to ask a person for. To see this: confirm an order for an item Engineering has not " +
          "released a BOM for, or remove the qualified supplier from a component that is short.";
        break;

      case "human-approval":
        // Always available where any order is planable: the A2 tier makes the stop certain
        // on ANY order rather than relying on one order's premium happening to breach the
        // envelope. Autonomy is a policy setting, and this is what that means.
        hit = pick(planable);
        missing = "There is no confirmed order with a released BOM to plan.";
        if (hit) setup.push("Opens the mission at A2 'Suggest only', so the stop is guaranteed on this order rather than lucky.");
        break;

      case "spreadsheet-source":
        hit = pick(buyable);
        missing =
          "A supplier price list only changes a plan that has something to buy. No confirmed order is both short and sourceable.";
        if (hit) {
          setup.push("Generates a supplier-terms sheet for this order's short components and reads it through the real spreadsheet parser.");
          setup.push("Records it as the mission's terms source, so the sourcing step reads the file instead of the seeded table.");
        }
        break;

      case "failure-then-retry":
        hit = pick(buyable);
        missing =
          "The fault is armed on the purchase step, so it needs an order that genuinely reaches it: short, and sourceable.";
        if (hit) {
          setup.push("Arms ONE simulated fault on the procure step, recorded as a simulated event.");
          setup.push("Run the mission: procure fails and says the fault was injected. Then POST /fulfilment/missions/{id}/retry.");
        }
        break;

      case "full-audit-trail":
        hit = pick((p) => planable(p) && (p.shortCount === 0 || buyable(p)));
        missing = "No confirmed order can run the whole arc without stopping on a missing master record.";
        if (hit) setup.push("Opens the mission at A4 'Act and notify', so the arc runs end to end without a stop.");
        break;
    }

    if (hit) {
      setup.unshift(`Opens a mission on ${hit.soNo} for ${hit.customerName} at tier ${spec.tier}.`);
      if (hit.hasLiveMission) {
        setup.push(`${hit.soNo} already has a live mission; starting returns that one rather than opening a second.`);
      }
    }

    out.push({
      ...spec,
      available: hit !== null,
      reason: hit ? whyThisOrder(spec.key, hit) : missing,
      salesOrderId: hit?.salesOrderId ?? null,
      soNo: hit?.soNo ?? null,
      customerName: hit?.customerName ?? null,
      setup,
    });
  }

  return out;
}

/** The measured reason this order was chosen. Numbers, so a sceptic can check them. */
function whyThisOrder(key: ScenarioKey, p: OrderProbe): string {
  const base = `${p.soNo}: ${p.orderQty} × ${p.itemCode}, ${p.componentCount} component(s), ${p.shortCount} short.`;
  switch (key) {
    case "stock-covers-it":
      return `${base} Nothing needs buying, which is what this scenario is about.`;
    case "missing-information":
      return p.hasReleasedBom
        ? `${base} ${p.unsourceable.length} short component(s) have no qualified supplier: ${p.unsourceable.join(", ")}.`
        : `${p.soNo}: ${p.itemCode} has no active BOM, so the mission cannot plan and will say so.`;
    case "failure-then-retry":
      return `${base} A simulated fault will be armed on the purchase step.`;
    case "spreadsheet-source":
      return `${base} The generated sheet covers the short components.`;
    default:
      return base;
  }
}
