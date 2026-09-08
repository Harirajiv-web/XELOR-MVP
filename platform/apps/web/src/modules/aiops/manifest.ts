import type { ModuleManifest } from "@spine/registry/manifest";
import { FEATURE_CONSUMERS, FEATURE_GOLDEN_SET } from "./api";

/* --------------------------------------------------------------------------
   READING A RESPONSE WE REFUSE TO ASSUME THE SHAPE OF.

   A signal's `reduce` is handed `unknown` and runs on the department dashboard, which is a
   page it does not own. Every step below narrows before it reads, and anything unexpected
   returns null — a dropped tile is a missing decoration, a thrown one would be a blank
   department page. This controller answers `{ data: [...] }`; `items` and a bare array are
   tolerated anyway, because a tile is not the place to discover an envelope change.
   -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rowsOf(data: unknown): readonly Record<string, unknown>[] | null {
  let list: unknown = data;
  if (isRecord(data)) list = data["data"] ?? data["items"];
  if (!Array.isArray(list)) return null;
  return list.filter(isRecord);
}

function textOf(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" ? v : null;
}

/**
 * The rows that are actually FEATURES.
 *
 * `GET /aiops/registry` returns ten rows, and one of them — `integrations.no_mvp_ai` — is an
 * explicit "this module declares no AI" entry rather than a feature. Counting it would
 * inflate the headline by one, in the direction that flatters us, which is the direction a
 * governance number must never drift.
 */
function featureRows(data: unknown): readonly Record<string, unknown>[] | null {
  const all = rowsOf(data);
  if (all === null || all.length === 0) return null;
  const features = all.filter((r) => textOf(r, "status") !== "no_mvp_ai");
  return features.length === 0 ? null : features;
}

/** DECISIONS-V2 §4.2 fixes the MVP portfolio at eight registered features. */
const REGISTRY_CAP = 8;

/**
 * AI OPERATIONS (ONYX, cross-cutting).
 *
 * Six read-only screens, and they exist to answer one question a sceptical buyer asks:
 * what stops this thing doing something stupid? How the layer is wired to the rest of the
 * product and what each connection is doing, what is registered, what it cost, what passed its evaluations, what a human
 * still has to approve, and what can be switched off.
 *
 * The consequential controls — engaging the kill switch, promoting a prompt, changing a
 * rollout stage, accepting a draft — are deliberately ABSENT from this pass. They are the
 * highest-blast-radius actions in the product and they get their own properly gated build,
 * not a button bolted onto a list screen.
 */
export const aiopsManifest: ModuleManifest = {
  key: "aiops",
  name: "AI Operations",
  summary: "The console for the AI itself: what is registered, what it costs, what passed its evaluations, and what a person still has to approve.",
  department: "ONYX",
  icon: "BrainCircuit",
  licenceKey: "aiops",
  order: 80,
  nav: [
    {
      // ONE PICTURE OF THIS LAYER, NOT TWO. There was a "Connection map" here as well, and
      // it drew the same architecture a second time in a different shape. A product that
      // diagrams itself twice has told the reader that neither diagram is the authority.
      // The map's graph is gone; the facts that were only on it — the chokepoints, what
      // ONYX takes from HEXA, and the open items — moved onto this screen intact.
      label: "Connectors",
      path: "connectors",
      permission: "aiops.registry.read",
      icon: "Cable",
      description:
        "The one picture of how the AI layer is wired, and what each connection is doing right now: every system it reads evidence from or drafts actions into, what each one has produced today, and where a call is stopped. Systems that are specified but not yet built are shown as not connected rather than left off, because a console that only shows what works is not a console.",
    },
    {
      label: "Feature registry",
      path: "registry",
      permission: "aiops.registry.read",
      icon: "List",
      description:
        "Every place this system is allowed to use AI at all, how far each one has been rolled out, and what happens when it is switched off. The list is closed by rule — a feature that is not on it cannot run — so this page is the complete answer to \"what can your AI do\", including the parts we have not built.",
    },
    {
      label: "Providers",
      path: "providers",
      permission: "aiops.registry.read",
      icon: "Server",
      description:
        "The model providers this company may route to, which region each one serves from, and whether they have contractually agreed not to train on your data. Nothing on this screen changes routing; it shows what was agreed and where the data physically goes.",
    },
    {
      label: "Evaluations",
      path: "evals",
      permission: "aiops.registry.read",
      icon: "FlaskConical",
      description:
        "Every run of a feature against its golden set — a fixed set of questions with known right answers. A run has to beat the plain rules by a declared margin and get every must-pass case right, or the prompt cannot be promoted. Features with no golden set are shown as such rather than as passing.",
    },
    {
      label: "Cost & budget",
      path: "cost",
      permission: "aiops.cost.read",
      icon: "IndianRupee",
      description:
        "What every AI feature has cost in this window, and how often a person accepted what it produced. Each call is priced at the rate in force on the day it ran, so a later change to a provider's pricing never rewrites what last month actually cost.",
    },
    {
      label: "Review queue",
      path: "review",
      permission: "aiops.hitl.review",
      icon: "UserCheck",
      description:
        "Drafts the AI produced that a person has to confirm before they become anything at all. Nothing in this queue has been written to a business record — that is the whole point of it, and it is why the AI in this product cannot act on its own.",
    },
    {
      label: "AI incidents",
      path: "incidents",
      permission: "aiops.registry.read",
      icon: "ShieldAlert",
      description:
        "Everything that has gone wrong with the AI itself — a wrong answer that reached somebody, a guardrail that missed, a provider that degraded — and what was done about it. This page exists to be read by a sceptic; an empty one would mean nothing was being recorded, not that nothing went wrong.",
    },
  ],
  screens: {
    connectors: () => import("./screens/connectors"),
    registry: () => import("./screens/registry"),
    providers: () => import("./screens/providers"),
    evals: () => import("./screens/evals"),
    cost: () => import("./screens/cost"),
    review: () => import("./screens/review"),
    incidents: () => import("./screens/incidents"),
  },
  /**
   * THE FIGURES THIS MODULE IS WILLING TO PUT ON A DASHBOARD.
   *
   * All three read `GET /aiops/registry` — the one endpoint that carries both the closed
   * feature list and this tenant's last evaluation verdict for each entry — and each is
   * gated on `aiops.registry.read`, the permission that endpoint actually enforces.
   *
   * They are deliberately unflattering. A governance console whose dashboard reads healthier
   * than its own Evaluations screen is not a governance console; it is marketing with a
   * login. The three numbers here are the same three open items the module already states in
   * full on its connection map: the registry is over its cap, most features have no golden
   * set, and two of them have no implementation at all.
   */
  signals: [
    {
      // The headline that matters more than any usage figure: how many features exist
      // against a registry §4.2 closed at eight.
      label: "Registered features",
      permission: "aiops.registry.read",
      path: "/aiops/registry",
      reduce: (data) => {
        const features = featureRows(data);
        if (features === null) return null;
        const over = features.length - REGISTRY_CAP;
        return {
          value: String(features.length),
          hint:
            over > 0
              ? `§4.2 closes the registry at ${REGISTRY_CAP}. ${over} more, with no ADR raised.`
              : `§4.2 closes the registry at ${REGISTRY_CAP}.`,
          tone: over > 0 ? "warn" : "ok",
        };
      },
    },
    {
      // §4.1: nothing ships without a golden set and a passing gate. The fraction is how far
      // that is from true today, and the hint carries the second half of it — a set on file
      // is not the same as a gate that passed.
      label: "Golden sets on file",
      permission: "aiops.registry.read",
      path: "/aiops/registry",
      reduce: (data) => {
        const features = featureRows(data);
        if (features === null) return null;
        const withSet = features.filter((r) => {
          const key = textOf(r, "key");
          return key !== null && typeof FEATURE_GOLDEN_SET[key] === "string";
        }).length;
        const passing = features.filter((r) => textOf(r, "lastEvalVerdict") === "pass").length;
        const missing = features.length - withSet;
        return {
          value: `${withSet} of ${features.length}`,
          fraction: withSet / features.length,
          hint: `${missing} have none · ${passing} passed the gate. §4.1: no golden set, no ship.`,
          tone: missing > 0 ? "bad" : passing < features.length ? "warn" : "ok",
        };
      },
    },
    {
      // The one chart on this card, and it is a funnel rather than a usage split on purpose:
      // registration is not delivery, delivery is not evaluation, and an evaluation that has
      // not run proves nothing. Each step reads live keys from the registry; whether a key
      // has an adapter or a golden set comes from this module's own transcribed source facts,
      // each of which names the file it was copied from.
      label: "Registered to shippable",
      permission: "aiops.registry.read",
      path: "/aiops/registry",
      reduce: (data) => {
        const features = featureRows(data);
        if (features === null) return null;
        const keys = features.map((r) => textOf(r, "key")).filter((k): k is string => k !== null);
        const implemented = keys.filter((k) => (FEATURE_CONSUMERS[k] ?? []).length > 0).length;
        const withSet = keys.filter((k) => typeof FEATURE_GOLDEN_SET[k] === "string").length;
        const passing = features.filter((r) => textOf(r, "lastEvalVerdict") === "pass").length;
        return {
          value: String(features.length),
          hint: "Registered",
          tone: passing < features.length ? "warn" : "ok",
          series: [
            { label: "Registered", value: features.length },
            { label: "Implemented", value: implemented },
            { label: "Golden set", value: withSet },
            { label: "Gate passed", value: passing },
          ],
        };
      },
    },
  ],
};
