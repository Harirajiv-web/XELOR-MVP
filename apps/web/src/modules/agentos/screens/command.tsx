"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ONYX MISSION CONTROL — the operational Agent OS surface, in five regions.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implements §9 of the ONYX UI/UX brief:
 *
 *   A  MISSION COMMAND BAR      what is running, for how long, how far through, on what
 *   B  ONYX STRATEGY RAIL       the supervisor: phase, decision, decomposition, guardrail
 *   C  ORCHESTRATION RUNWAY     eight specialist lanes, in the brief's stable order
 *   D  SHARED EVIDENCE RAIL     what was retrieved, by whom, verified, used in the result
 *   E  SYNTHESIS & REVIEW DOCK  convergence, the human gate, the published outcome
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY THE RADIAL DIAGRAM LEFT THIS SCREEN — AND WHERE IT STILL LIVES
 * ───────────────────────────────────────────────────────────────────────────────
 * This surface used to open with a hero and a hub-and-spoke diagram: ONYX in the middle,
 * six satellites on an ellipse, six dots orbiting for ever. A radial diagram is a picture of
 * a SHAPE. Every spoke is the same length, so nothing is ahead of or behind anything else,
 * and the dots moved whether or not a mission was running — which claimed activity that did
 * not exist.
 *
 * The shape is still the right answer on the GATEWAY, and it is still drawn there
 * (`onyx-void-map.tsx`): arriving, you need to know who exists and who is connected. The
 * brief protects that deliberately. What belongs HERE is the picture of WORK — who was asked
 * for what, what ran in parallel, what waited on whom, what evidence came back, who verified
 * it, which human approved it, what was published. That is what the five regions below draw,
 * laid out along the direction work travels.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * EVERY FIGURE IS DERIVED FROM A RUN, OR IT IS NOT SHOWN
 * ───────────────────────────────────────────────────────────────────────────────
 * There is no scripted demonstration and no timer-driven animation disconnected from run
 * state — the brief forbids both. Lane states, handoffs, dependency waits, evidence tiles,
 * verification checks and the final result are read out of `/agent-os/runs/:id` (nodes,
 * events, approvals, checkpoints). The derivations are named so they can be argued with:
 *
 *   `deriveLane`      node statuses            → one of the eleven visible lane states
 *   `derivePhase`     node statuses            → ONYX's phase, in the brief's vocabulary
 *   `deriveEvidence`  nodes/events/checkpoints → the shared rail
 *   `buildGraphIndex` the graph definition     → dependencies, ancestry, "used in result"
 *
 * The dependency and ancestry questions — "is this lane blocked?", "did HEXA's verification
 * actually cover this evidence?", "did the published answer rest on this?" — are answered
 * from the GRAPH DEFINITION in the catalogue, never guessed from ordering. `AgentNodeRun`
 * carries no `dependsOn`, so a screen that wanted to say "waiting for dependency" without
 * reading the graph would have had to invent it, and an invented dependency is worse than
 * none because it is indistinguishable from a real one.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT CLAIMED
 * ───────────────────────────────────────────────────────────────────────────────
 * The reasoning provider is deterministic and there are zero external connections. The
 * reasoner returns `confidence: 1` for every step; rendering that as a percentage would put
 * a fabricated certainty on the one screen whose whole argument is that nothing here is
 * fabricated. So quality is a QUALITATIVE verification state sourced from HEXA's declared
 * and computed checks, and the Live / Deterministic / zero-external boundary is stated in
 * the command bar rather than left to be inferred.
 *
 * No node payload is rendered raw. Evidence tiles show the capability key, the owning agent,
 * the record count and the execution mode; they never print the rows.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * NINE AGENTS, EIGHT SPECIALIST LANES
 * ───────────────────────────────────────────────────────────────────────────────
 * `AGENT_KEYS` is ONYX plus HEXA, MICA, SPAR, AXLE, KILN, RASP, RELAY and ACHILES. ONYX is the
 * supervisor and has its own region; the runway therefore has eight lanes and the network
 * is nine agents. Both numbers are true and they are not interchangeable — "9/9 connected"
 * counts the registry, "eight specialists" counts the delegates.
 *
 * Colours come from `--dept-*` by way of the department registry, the same source the deck's
 * agent map and the gateway read. The previous version hard-coded agent hexes here, which
 * made this the one screen where HEXA was indigo instead of the deck's blue — and, being
 * literal hexes in a component, it had no dark mode at all.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import type {
  MachineCommandIntent,
  MachineCommandRequest,
} from "@ind-core/platform/factory-connect/contracts";
import { useAccess } from "@spine/access/permissions";
import { useQuery } from "@spine/data/use-query";
import { department } from "@spine/registry/departments";
import type { ScreenProps } from "@spine/registry/manifest";
import { Meter } from "@spine/ui/motion";
import { cn } from "@spine/ui/cn";
import { Disclosure } from "@spine/ui/disclosure";
import {
  agentOsApi,
  FACTORY_PRODUCTION_VIEW_PATH,
  factoryCommandEvidencePath,
  type FactoryCommandResult,
  type FactoryCommandEvidenceEnvelope,
  type FactoryProductionView,
  type AgentAction,
  type AgentCatalogue,
  type AgentKey,
  type AgentNodeRun,
  type AgentRunDetail,
  type AgentRunSummary,
  type GraphDefinition,
  type GraphNodeDefinition,
} from "../api";
import {
  buildFactoryCommandIntent,
  completePendingFactoryCommandIntent,
  commandableSimulatorAssets,
  compatibleCapabilities,
  defaultFactoryCommandDraft,
  pendingFactoryCommandIntent,
  FactoryCommandComposer,
  FactoryCommandIntentView,
  readFactoryCommandIntent,
  type FactoryCommandDraft,
} from "./factory-command";

/* ═══════════════════════════════════════════════════════════════════════════════
   THE CAST
   ═══════════════════════════════════════════════════════════════════════════════ */

/** The supervisor. Its own region, never a lane. */
const BRAIN: AgentKey = "ONYX";

/**
 * The eight delegates, in their stable operating order.
 *
 * Written down rather than derived from `catalogue.agents`, and that is the point: the runway
 * is a place people learn by position within a week, so a lane must not move because the API
 * returned its rows in a different order. A specialist the catalogue does NOT return is still
 * drawn — dimmed, as "not connected" — because the brief requires the architecture to stay
 * stable rather than have a lane silently vanish.
 */
const SPECIALISTS: readonly AgentKey[] = [
  "HEXA",
  "MICA",
  "SPAR",
  "AXLE",
  "KILN",
  "RASP",
  "RELAY",
  "ACHILES",
];

/** Accent and monogram, from the one registry the deck and the gateway also read. */
function mark(key: AgentKey): { accent: string; letter: string } {
  const dept = department(key);
  return {
    accent: dept?.accent ?? "var(--ai-accent)",
    letter: dept?.letter ?? key.slice(0, 1),
  };
}

const PRESETS = [
  "Protect the Northstar delivery commitment with a governed business-and-service recovery plan.",
  "Prepare an investor-ready operating brief using current tenant evidence.",
  "Identify the most material cross-functional operating risks and show their evidence.",
] as const;

const DEFAULT_GRAPH_KEY = "operations.controlled-action-mission";
const FACTORY_FLOW_GRAPH_KEY = "factory.flow-recovery";
const FACTORY_FLOW_GOAL =
  "Review the current factory constraint and material dwell evidence, then prepare a bounded recovery for human approval.";

function runGraphLabel(graphKey: string): string {
  if (graphKey === DEFAULT_GRAPH_KEY) return "Run controlled-action mission";
  if (graphKey === FACTORY_FLOW_GRAPH_KEY) return "Run factory-flow recovery";
  return "Run nine-agent review";
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const NODE_DONE = new Set(["succeeded", "skipped"]);

/* ═══════════════════════════════════════════════════════════════════════════════
   THE ELEVEN VISIBLE LANE STATES — §9.C, verbatim

   Colour is never the signal on its own: every state carries a word AND a glyph. Protanopia
   collapses the amber and the mint whatever hexes are chosen, and "waiting for dependency"
   and "under review" are both amber-ish facts a person must be able to tell apart at a
   glance.
   ═══════════════════════════════════════════════════════════════════════════════ */

type LaneState =
  | "not_connected"
  | "idle"
  | "queued"
  | "waiting_dependency"
  | "working"
  | "collaborating"
  | "handing_off"
  | "under_review"
  | "completed"
  | "needs_attention"
  | "failed_safely";

interface LaneStateMeta {
  label: string;
  icon: Icons.LucideIcon;
  /** Maps onto the five status tones in the stylesheet. */
  tone: "ok" | "live" | "wait" | "bad" | "idle";
  /** Is this lane doing work right now? Drives follow-mode and the working count. */
  live?: boolean;
}

const LANE_STATE: Readonly<Record<LaneState, LaneStateMeta>> = {
  not_connected: { label: "Not connected", icon: Icons.Unplug, tone: "idle" },
  idle: { label: "Idle", icon: Icons.Circle, tone: "idle" },
  queued: { label: "Queued", icon: Icons.CircleDashed, tone: "idle" },
  waiting_dependency: {
    label: "Waiting for dependency",
    icon: Icons.Hourglass,
    tone: "wait",
  },
  working: { label: "Working", icon: Icons.Loader, tone: "live", live: true },
  collaborating: {
    label: "Collaborating",
    icon: Icons.GitMerge,
    tone: "live",
    live: true,
  },
  handing_off: { label: "Handing off", icon: Icons.ArrowUpRight, tone: "live" },
  under_review: { label: "Under review", icon: Icons.ScanEye, tone: "wait" },
  completed: { label: "Completed", icon: Icons.Check, tone: "ok" },
  needs_attention: {
    label: "Needs attention",
    icon: Icons.TriangleAlert,
    tone: "wait",
  },
  failed_safely: { label: "Failed safely", icon: Icons.OctagonX, tone: "bad" },
};

/** ONYX's phase — §9.B's allowed vocabulary, and nothing outside it. */
type Phase =
  | "standing_by"
  | "understanding"
  | "planning"
  | "delegating"
  | "monitoring"
  | "reviewing"
  | "awaiting_authority"
  | "synthesising"
  | "published"
  | "halted";

const PHASE: Readonly<
  Record<Phase, { label: string; icon: Icons.LucideIcon; tone: string }>
> = {
  standing_by: {
    label: "Standing by",
    icon: Icons.Moon,
    tone: "agent-status-idle",
  },
  understanding: {
    label: "Understanding",
    icon: Icons.Ear,
    tone: "agent-status-live",
  },
  planning: {
    label: "Planning",
    icon: Icons.PenLine,
    tone: "agent-status-live",
  },
  delegating: {
    label: "Delegating",
    icon: Icons.Share2,
    tone: "agent-status-live",
  },
  monitoring: {
    label: "Monitoring",
    icon: Icons.Activity,
    tone: "agent-status-live",
  },
  reviewing: {
    label: "Reviewing",
    icon: Icons.ScanEye,
    tone: "agent-status-wait",
  },
  awaiting_authority: {
    label: "Awaiting authority",
    icon: Icons.UserRoundCheck,
    tone: "agent-status-wait",
  },
  synthesising: {
    label: "Synthesising",
    icon: Icons.Sparkles,
    tone: "agent-status-live",
  },
  published: {
    label: "Published",
    icon: Icons.BadgeCheck,
    tone: "agent-status-ok",
  },
  halted: { label: "Halted", icon: Icons.OctagonX, tone: "agent-status-bad" },
};

/** The six-step track the rail draws. The other four phases are terminal or pre-run. */
const PHASE_TRACK: readonly Phase[] = [
  "understanding",
  "planning",
  "delegating",
  "monitoring",
  "reviewing",
  "synthesising",
];

/* ═══════════════════════════════════════════════════════════════════════════════
   SMALL HONEST FORMATTERS
   ═══════════════════════════════════════════════════════════════════════════════ */

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The Agent OS request could not be completed.";
}

function resultNote(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const note = (value as Record<string, unknown>).note;
  return typeof note === "string" ? note : null;
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatClock(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

/**
 * Elapsed, as `m:ss` up to an hour and `h:mm:ss` past it.
 *
 * The product's tabular-figures rule matters here more than anywhere else: a clock whose
 * digits change width jitters the whole command bar once a second.
 */
function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function statusTone(status: string): string {
  if (status === "completed" || status === "succeeded")
    return "agent-status-ok";
  if (status === "running") return "agent-status-live";
  if (status === "waiting_approval") return "agent-status-wait";
  if (status === "failed" || status === "cancelled") return "agent-status-bad";
  return "agent-status-idle";
}

function toneClass(tone: LaneStateMeta["tone"]): string {
  return `agent-status-${tone}`;
}

function humanise(value: string): string {
  return value.replaceAll("_", " ").replaceAll(".", " · ");
}

/**
 * A camelCase key as words. Used ONLY on HEXA's computed-check names, which are object keys
 * rather than prose — `sideEffectPolicySatisfied` printed verbatim in a sentence about what
 * the guardrail checked is a leaked identifier, not a message. Deliberately separate from
 * `humanise`, which is applied to statuses and event names that must not be re-cased.
 */
function unCamel(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/**
 * NODE OUTPUT IS `unknown`, AND IT IS READ ONE FIELD AT A TIME.
 *
 * The API types `AgentNodeRun.output` as `unknown` — correctly, because six node kinds put
 * six different shapes in it. Every reader below pulls out ONE field, into a local, and tests
 * that local. It reads as ceremony and it is not: a screen that casts the whole payload to a
 * hopeful interface renders `undefined` the first time a node kind it did not think about
 * lands in front of it.
 */
function outputOf(node: AgentNodeRun | undefined): Record<string, unknown> {
  const output = node?.output;
  return output && typeof output === "object"
    ? (output as Record<string, unknown>)
    : {};
}

function stringsIn(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** A node output's user-facing summary line, if it has one. Never a private trace. */
function summaryOf(node: AgentNodeRun | undefined): string | null {
  const summary = outputOf(node).summary;
  return typeof summary === "string" ? summary : null;
}

function findingsOf(node: AgentNodeRun | undefined): readonly string[] {
  return stringsIn(outputOf(node).findings);
}

/** HEXA's own two lists: what the node declared it would check, and what it computed. */
function checksOf(node: AgentNodeRun | undefined): {
  declared: readonly string[];
  computed: readonly [string, unknown][];
} {
  const output = outputOf(node);
  const computed = output.computedChecks;
  return {
    declared: stringsIn(output.declaredChecks),
    computed:
      computed && typeof computed === "object"
        ? Object.entries(computed as Record<string, unknown>)
        : [],
  };
}

function recordCountOf(node: AgentNodeRun | undefined): number | null {
  const data = outputOf(node).data;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.items)) return inner.items.length;
    if (Array.isArray(inner.data)) return inner.data.length;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   THE GRAPH INDEX — dependencies and ancestry, read rather than assumed
   ═══════════════════════════════════════════════════════════════════════════════ */

interface GraphIndex {
  byId: ReadonlyMap<string, GraphNodeDefinition>;
  dependsOn: (id: string) => readonly string[];
  /** Every node that must have run before `id` can. Memoised; the graph is a validated DAG. */
  ancestorsOf: (id: string) => ReadonlySet<string>;
}

function buildGraphIndex(graph: GraphDefinition | undefined): GraphIndex {
  const byId = new Map<string, GraphNodeDefinition>();
  const deps = new Map<string, readonly string[]>();
  for (const node of graph?.nodes ?? []) {
    byId.set(node.id, node);
    deps.set(node.id, node.dependsOn);
  }
  const cache = new Map<string, Set<string>>();
  const ancestorsOf = (id: string): Set<string> => {
    const hit = cache.get(id);
    if (hit) return hit;
    const out = new Set<string>();
    const stack = [...(deps.get(id) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined || out.has(next)) continue;
      out.add(next);
      stack.push(...(deps.get(next) ?? []));
    }
    cache.set(id, out);
    return out;
  };
  return { byId, dependsOn: (id) => deps.get(id) ?? [], ancestorsOf };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   THE DERIVATIONS
   ═══════════════════════════════════════════════════════════════════════════════ */

interface RunView {
  run: AgentRunDetail | null;
  index: GraphIndex;
  /** Run status by graph node id — the join between the definition and this execution. */
  statusById: ReadonlyMap<string, string>;
  /** The node the published result came from, when the run finished. */
  finalNodeId: string | null;
  /** Every node whose output the published result actually rests on. */
  usedInResult: ReadonlySet<string>;
  /** Nodes covered by a verification node that passed. */
  verified: ReadonlySet<string>;
}

function buildRunView(
  run: AgentRunDetail | null,
  graph: GraphDefinition | undefined,
): RunView {
  const index = buildGraphIndex(graph);
  const statusById = new Map<string, string>();
  for (const node of run?.nodes ?? []) statusById.set(node.nodeId, node.status);

  const runOutput = run?.run.output;
  const envelope =
    runOutput && typeof runOutput === "object"
      ? (runOutput as Record<string, unknown>)
      : {};
  const finalNodeId =
    typeof envelope.finalNodeId === "string" ? envelope.finalNodeId : null;

  const usedInResult = new Set<string>();
  if (finalNodeId) {
    usedInResult.add(finalNodeId);
    for (const id of index.ancestorsOf(finalNodeId)) usedInResult.add(id);
  }

  /**
   * VERIFIED MEANS "COVERED BY A CHECK THAT PASSED", not "finished".
   *
   * The engine deliberately scopes each verification node to its own ancestors, so a
   * read-only preflight is not failed by an approved write that comes later in the same
   * immutable graph. This mirrors that scoping exactly, so a tile marked verified is a tile
   * a verification node actually inspected.
   */
  const verified = new Set<string>();
  for (const node of run?.nodes ?? []) {
    if (node.nodeKind !== "verification" || node.status !== "succeeded")
      continue;
    if (outputOf(node).passed === false) continue;
    for (const id of index.ancestorsOf(node.nodeId)) verified.add(id);
  }

  return { run, index, statusById, finalNodeId, usedInResult, verified };
}

interface Lane {
  key: AgentKey;
  name: string;
  domain: string;
  purpose: string;
  connected: boolean;
  state: LaneState;
  /** The node the lane is on now, or the last one it finished. */
  currentTask: string | null;
  /** What that step is expected to produce — a capability key, or the kind of step. */
  expected: string | null;
  /** Which registered capability is executing, when one is. */
  tool: string | null;
  /** Named upstream nodes this lane is still waiting on. */
  blockedBy: readonly string[];
  /** Where this lane's finished output goes next, when it has gone somewhere. */
  handoffTo: string | null;
  done: number;
  total: number;
  evidenceCount: number;
  /** Milliseconds active, from this lane's first start to its last completion. */
  activeMs: number | null;
  nodes: readonly AgentNodeRun[];
  summary: string | null;
  findings: readonly string[];
}

function deriveLane(
  key: AgentKey,
  view: RunView,
  catalogue: AgentCatalogue | null,
  actions: readonly AgentAction[],
): Lane {
  const definition = catalogue?.agents.find((agent) => agent.key === key);
  const nodes = (view.run?.nodes ?? []).filter((node) => node.agentKey === key);
  const graphNodes = [...view.index.byId.values()].filter(
    (node) => node.agentKey === key,
  );

  const total = graphNodes.length > 0 ? graphNodes.length : nodes.length;
  const done = nodes.filter((node) => NODE_DONE.has(node.status)).length;
  const running = nodes.find((node) => node.status === "running");
  const failed = nodes.find((node) => node.status === "failed");
  const awaiting = nodes.find((node) => node.status === "waiting_approval");
  const pending = nodes.filter((node) => node.status === "pending");
  const retried = nodes.find(
    (node) => node.attempt > 1 && node.status !== "failed",
  );

  /** Which upstream nodes a pending node of this lane is still short of. */
  const blockedBy: string[] = [];
  for (const node of pending) {
    for (const dep of view.index.dependsOn(node.nodeId)) {
      const status = view.statusById.get(dep);
      if (status === undefined || !NODE_DONE.has(status)) {
        const name = view.index.byId.get(dep)?.name ?? dep;
        if (!blockedBy.includes(name)) blockedBy.push(name);
      }
    }
  }

  /**
   * WHERE THE OUTPUT WENT — the handoff, named from the graph rather than implied.
   *
   * A lane hands off when a node depending on one of its finished nodes exists. Naming that
   * consumer is what turns "done" into "done, and ONYX has it" — the fact a person watching
   * a mission actually wants.
   */
  let handoffTo: string | null = null;
  for (const finished of nodes.filter((node) => NODE_DONE.has(node.status))) {
    for (const candidate of view.index.byId.values()) {
      if (!candidate.dependsOn.includes(finished.nodeId)) continue;
      if (candidate.agentKey === key) continue;
      handoffTo = candidate.name;
      break;
    }
    if (handoffTo) break;
  }

  const runStatus = view.run?.run.status;
  let state: LaneState;
  if (!definition) state = "not_connected";
  else if (failed) state = "failed_safely";
  else if (running) state = "working";
  else if (awaiting) state = "under_review";
  else if (retried) state = "needs_attention";
  else if (nodes.length === 0) state = "idle";
  else if (done === nodes.length) {
    // Everything asked of this lane is finished. Whether that reads as "completed" or as
    // "handed off" depends on whether the MISSION is finished — a lane that has done its
    // part while ONYX is still verifying is not done with.
    if (runStatus && TERMINAL.has(runStatus)) state = "completed";
    else if (handoffTo) state = "handing_off";
    else state = "completed";
  } else if (blockedBy.length > 0) state = "waiting_dependency";
  else state = "queued";

  // Collaboration is a lane whose finished output sits in a join still short of its other
  // sources — visibly waiting for a sibling rather than for a capability.
  if (state === "handing_off") {
    const join = [...view.index.byId.values()].find(
      (node) =>
        node.kind === "transform" &&
        nodes.some((mine) => node.dependsOn.includes(mine.nodeId)),
    );
    if (join) {
      const joinStatus = view.statusById.get(join.id);
      const shortOf = join.dependsOn.some((dep) => {
        const status = view.statusById.get(dep);
        return status === undefined || !NODE_DONE.has(status);
      });
      if (shortOf && (joinStatus === undefined || !NODE_DONE.has(joinStatus))) {
        state = "collaborating";
      }
    }
  }

  const focus = running ?? awaiting ?? failed ?? [...nodes].reverse()[0];
  const graphFocus = focus ? view.index.byId.get(focus.nodeId) : undefined;

  const starts = nodes
    .map((node) => (node.startedAt ? Date.parse(node.startedAt) : NaN))
    .filter((value) => Number.isFinite(value));
  const ends = nodes
    .map((node) => (node.completedAt ? Date.parse(node.completedAt) : NaN))
    .filter((value) => Number.isFinite(value));
  const activeMs =
    starts.length > 0
      ? (ends.length === nodes.length && ends.length > 0
          ? Math.max(...ends)
          : Date.now()) - Math.min(...starts)
      : null;

  const evidenceCount =
    nodes.filter(
      (node) => NODE_DONE.has(node.status) && node.nodeKind !== "approval",
    ).length + actions.filter((action) => action.agentKey === key).length;

  const assessment = [...nodes]
    .reverse()
    .find((node) => node.nodeKind === "agent" && node.status === "succeeded");

  return {
    key,
    name: definition?.name ?? `${key} (not connected)`,
    domain: definition?.department ?? "—",
    purpose:
      definition?.purpose ??
      "This specialist is not in the catalogue this build returned.",
    connected: Boolean(definition),
    state,
    currentTask: focus?.nodeName ?? null,
    expected: graphFocus?.capabilityKey ?? graphFocus?.kind ?? null,
    tool: running?.capabilityKey ?? null,
    blockedBy,
    handoffTo,
    done,
    total,
    evidenceCount,
    activeMs,
    nodes,
    summary: summaryOf(assessment),
    findings: findingsOf(assessment),
  };
}

function derivePhase(view: RunView): Phase {
  const run = view.run;
  if (!run) return "standing_by";
  if (run.run.status === "failed" || run.run.status === "cancelled")
    return "halted";
  if (run.run.status === "completed") return "published";
  if (run.nodes.some((node) => node.status === "waiting_approval"))
    return "awaiting_authority";

  const brainNodes = run.nodes.filter((node) => node.agentKey === BRAIN);
  const intake = brainNodes[0];
  const runningBrain = brainNodes.find((node) => node.status === "running");
  if (runningBrain) {
    // ONYX's FIRST node is intake and its LAST is the publication. Same agent, two very
    // different phases, and the difference is legible from position in the graph.
    return runningBrain.nodeId === intake?.nodeId
      ? "understanding"
      : "synthesising";
  }
  if (
    run.nodes.some(
      (node) => node.nodeKind === "verification" && node.status === "running",
    )
  )
    return "reviewing";
  if (
    run.nodes.some(
      (node) =>
        node.status === "running" &&
        node.agentKey !== null &&
        node.agentKey !== BRAIN,
    )
  )
    return "monitoring";
  if (intake && NODE_DONE.has(intake.status)) return "delegating";
  return "planning";
}

/* ═══════════════════════════════════════════════════════════════════════════════
   THE SHARED EVIDENCE RAIL
   ═══════════════════════════════════════════════════════════════════════════════ */

type EvidenceKind =
  "source" | "finding" | "check" | "memory" | "decision" | "artifact";

const EVIDENCE_KIND: Readonly<
  Record<EvidenceKind, { label: string; icon: Icons.LucideIcon }>
> = {
  source: { label: "Source", icon: Icons.Database },
  finding: { label: "Finding", icon: Icons.FileCheck2 },
  check: { label: "Check", icon: Icons.ShieldCheck },
  memory: { label: "Memory", icon: Icons.Save },
  decision: { label: "Decision", icon: Icons.UserRoundCheck },
  artifact: { label: "Artifact", icon: Icons.PackageCheck },
};

interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  detail: string;
  /** Who produced or used it. More than one mark rather than a duplicated tile. */
  agents: readonly AgentKey[];
  verified: boolean;
  usedInResult: boolean;
  at: string | null;
}

function deriveEvidence(
  view: RunView,
  actions: readonly AgentAction[],
): readonly EvidenceItem[] {
  const run = view.run;
  if (!run) return [];
  const items: EvidenceItem[] = [];

  for (const node of run.nodes) {
    if (!NODE_DONE.has(node.status)) continue;
    const agents = node.agentKey ? [node.agentKey] : [];
    const verified = view.verified.has(node.nodeId);
    const usedInResult = view.usedInResult.has(node.nodeId);

    if (node.capabilityKey) {
      const count = recordCountOf(node);
      const mode = outputOf(node).mode;
      items.push({
        id: `${node.id}-source`,
        kind: "source",
        title: node.capabilityKey,
        detail:
          (count === null
            ? "structured result"
            : `${count} tenant-scoped record(s)`) +
          (typeof mode === "string" ? ` · ${humanise(mode)}` : ""),
        agents,
        verified,
        usedInResult,
        at: node.completedAt,
      });
      continue;
    }

    if (node.nodeKind === "verification") {
      const { declared, computed } = checksOf(node);
      const passedCount = computed.filter(([, value]) => value === true).length;
      items.push({
        id: `${node.id}-check`,
        kind: "check",
        title: node.nodeName,
        detail:
          `${declared.length} declared check(s) · ` +
          `${passedCount}/${computed.length} computed check(s) passed`,
        agents,
        verified: true,
        usedInResult,
        at: node.completedAt,
      });
      continue;
    }

    if (node.nodeKind === "transform") {
      const sources = outputOf(node).sources;
      const contributors = Array.isArray(sources)
        ? sources
            .map((id) =>
              typeof id === "string"
                ? view.index.byId.get(id)?.agentKey
                : undefined,
            )
            .filter((key): key is AgentKey => Boolean(key))
        : [];
      items.push({
        id: `${node.id}-memory`,
        kind: "memory",
        title: node.nodeName,
        detail: `${contributors.length} specialist output(s) joined into shared memory`,
        agents: [...new Set(contributors)],
        verified,
        usedInResult,
        at: node.completedAt,
      });
      continue;
    }

    for (const [position, finding] of findingsOf(node).entries()) {
      items.push({
        id: `${node.id}-finding-${position}`,
        kind: "finding",
        title: finding,
        detail: node.nodeName,
        agents,
        verified,
        usedInResult,
        at: node.completedAt,
      });
    }
  }

  for (const checkpoint of run.checkpoints) {
    items.push({
      id: `checkpoint-${checkpoint.id}`,
      kind: "memory",
      title: `Durable checkpoint ${checkpoint.sequence}`,
      detail: humanise(checkpoint.reason),
      agents: [BRAIN],
      verified: false,
      usedInResult: false,
      at: checkpoint.createdAt,
    });
  }

  for (const approval of run.approvals) {
    if (approval.status === "pending") continue;
    items.push({
      id: `approval-${approval.id}`,
      kind: "decision",
      title: approval.title,
      detail:
        `${humanise(approval.decision ?? approval.status)} · ${approval.risk} risk` +
        (approval.decisionNote ? ` · ${approval.decisionNote}` : ""),
      agents: [BRAIN],
      verified: false,
      usedInResult: true,
      at: approval.decidedAt ?? approval.createdAt,
    });
  }

  for (const action of actions) {
    items.push({
      id: `action-${action.id}`,
      kind: "artifact",
      title: action.title,
      detail: `${humanise(action.targetDomain)} · ${humanise(action.executionMode)} · approved by ${action.approvedBy}`,
      agents: [action.agentKey],
      verified: true,
      usedInResult: true,
      at: action.dispatchedAt,
    });
  }

  return items.sort((a, b) => {
    const left = a.at ? Date.parse(a.at) : 0;
    const right = b.at ? Date.parse(b.at) : 0;
    return right - left;
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   THE SCREEN
   ═══════════════════════════════════════════════════════════════════════════════ */

export default function AgentCommandScreen({ params }: ScreenProps): React.JSX.Element {
  const { can, identity } = useAccess();
  const canOperate = can("agentos.run.operate");
  const canDecide = can("agentos.approval.decide");
  const canReadFactory = can("production.factory-connect.read");
  const canExecuteFactory = can("factory.command.execute");
  const canViewFactoryLedger = can("integration.factory-connect.read");
  const requestedGraphKey = params[0];

  const [catalogue, setCatalogue] = useState<AgentCatalogue | null>(null);
  const [runs, setRuns] = useState<readonly AgentRunSummary[]>([]);
  const [actions, setActions] = useState<readonly AgentAction[]>([]);
  const [active, setActive] = useState<AgentRunDetail | null>(null);
  const [selectedGraphKey, setSelectedGraphKey] = useState(
    requestedGraphKey ?? DEFAULT_GRAPH_KEY,
  );
  const [goal, setGoal] = useState<string>(
    requestedGraphKey === FACTORY_FLOW_GRAPH_KEY ? FACTORY_FLOW_GOAL : PRESETS[0],
  );
  const [busy, setBusy] = useState<
    "loading" | "starting" | "signalling" | "cancelling" | "submitting-factory" | null
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [factoryDraft, setFactoryDraft] = useState<FactoryCommandDraft | null>(null);
  const [factoryCommandResult, setFactoryCommandResult] = useState<FactoryCommandResult | null>(null);

  /** Which lane is open. One at a time — the others compress rather than disappear. */
  const [openLane, setOpenLane] = useState<AgentKey | null>(null);
  /** Give whichever lane has a live event slightly more room, without a click. */
  const [follow, setFollow] = useState(true);
  const [showPlan, setShowPlan] = useState(false);
  const [evidenceAgent, setEvidenceAgent] = useState<AgentKey | "all">("all");
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind | "all">("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [usedOnly, setUsedOnly] = useState(false);
  /** Ticks only while a mission is in flight. See the effect below. */
  const [now, setNow] = useState<number>(() => Date.now());

  const factorySurfaceActive =
    selectedGraphKey === FACTORY_FLOW_GRAPH_KEY ||
    active?.run.graphKey === FACTORY_FLOW_GRAPH_KEY;
  const factoryQuery = useQuery<FactoryProductionView>(
    factorySurfaceActive && canReadFactory ? FACTORY_PRODUCTION_VIEW_PATH : null,
  );

  useEffect(() => {
    if (!requestedGraphKey) return;
    setSelectedGraphKey(requestedGraphKey);
    if (requestedGraphKey === FACTORY_FLOW_GRAPH_KEY) setGoal(FACTORY_FLOW_GOAL);
  }, [requestedGraphKey]);

  useEffect(() => {
    const overview = factoryQuery.data;
    if (selectedGraphKey !== FACTORY_FLOW_GRAPH_KEY || !overview) return;
    setFactoryDraft((current) => {
      if (current) {
        const currentAsset = commandableSimulatorAssets(overview).find(
          (asset) => asset.assetCode === current.assetCode,
        );
        if (
          currentAsset &&
          currentAsset.state === current.requiredState &&
          compatibleCapabilities(currentAsset).includes(current.capability)
        ) {
          return current;
        }
      }
      return defaultFactoryCommandDraft(overview);
    });
  }, [factoryQuery.data, selectedGraphKey]);

  useEffect(() => {
    setFactoryCommandResult(null);
  }, [active?.run.id]);

  const refreshRuns = useCallback(async (preferredRunId?: string) => {
    const nextRuns = await agentOsApi.runs();
    setRuns(nextRuns);
    const runId = preferredRunId ?? nextRuns[0]?.id;
    if (runId) {
      const [detail, nextActions] = await Promise.all([
        agentOsApi.run(runId),
        agentOsApi.actions(50, runId),
      ]);
      setActive(detail);
      setActions(nextActions);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      agentOsApi.catalogue(),
      agentOsApi.runs(),
      agentOsApi.actions(),
    ])
      .then(async ([nextCatalogue, nextRuns, nextActions]) => {
        if (cancelled) return;
        setCatalogue(nextCatalogue);
        setRuns(nextRuns);
        setActions(nextActions);
        if (nextRuns[0]) {
          const detail = await agentOsApi.run(nextRuns[0].id);
          if (!cancelled) setActive(detail);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runStatus = active?.run.status;
  const runId = active?.run.id;
  const inFlight = Boolean(runStatus) && !TERMINAL.has(runStatus ?? "");

  useEffect(() => {
    if (!runId || !runStatus || TERMINAL.has(runStatus)) return;
    const timer = window.setInterval(() => {
      void agentOsApi
        .run(runId)
        .then(async (detail) => {
          setActive(detail);
          if (detail.run.status === "completed") {
            setActions(await agentOsApi.actions(50, runId));
          }
        })
        .catch((cause) => setError(errorMessage(cause)));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [runId, runStatus]);

  /**
   * THE ELAPSED CLOCK STOPS WHEN THE MISSION DOES.
   *
   * A per-second interval still running after the mission finished re-renders five regions
   * for ever to display a number that cannot change — and keeps a laptop awake on a screen
   * somebody left open.
   */
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [inFlight]);

  const startMission = async (): Promise<void> => {
    if (!goal.trim() || !catalogue) return;
    setBusy("starting");
    setError(null);
    try {
      const graph =
        catalogue.graphs.find(
          (candidate) => candidate.key === selectedGraphKey,
        ) ?? catalogue.graphs[0];
      if (!graph) throw new Error("No active Agent OS graph is registered.");
      let missionInput: Record<string, unknown> = {};
      let sealedFactoryIntent: MachineCommandIntent | null = null;
      if (graph.key === FACTORY_FLOW_GRAPH_KEY && canExecuteFactory) {
        if (!canReadFactory) {
          throw new Error("Current factory state cannot be read with this role, so a command intent cannot be approved.");
        }
        if (factoryQuery.loading || factoryQuery.error || !factoryDraft) {
          throw new Error("A valid state-compatible simulator command is required before starting this recovery mission.");
        }
        const intent = pendingFactoryCommandIntent(
          factoryDraft,
          identity?.subject ?? "unresolved-actor",
        );
        if (!intent.valid) throw new Error(intent.reason);
        sealedFactoryIntent = intent.value;
        missionInput = { factoryCommand: intent.value };
      }
      const detail = await agentOsApi.start(goal.trim(), graph.key, missionInput);
      if (sealedFactoryIntent) completePendingFactoryCommandIntent(sealedFactoryIntent);
      setActive(detail);
      await refreshRuns(detail.run.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const ingestSignal = async (): Promise<void> => {
    setBusy("signalling");
    setError(null);
    try {
      const detail = await agentOsApi.signal();
      setActive(detail);
      await refreshRuns(detail.run.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (): Promise<void> => {
    if (!active) return;
    setBusy("cancelling");
    setError(null);
    try {
      const detail = await agentOsApi.cancel(
        active.run.id,
        "Cancelled by the operator from ONYX Mission Control.",
      );
      setActive(detail);
      await refreshRuns(detail.run.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const selectedGraph = catalogue?.graphs.find(
    (graph) => graph.key === selectedGraphKey,
  );
  const activeGraph = active
    ? catalogue?.graphs.find((graph) => graph.key === active.run.graphKey)
    : selectedGraph;

  const view = useMemo(
    () => buildRunView(active, activeGraph),
    [active, activeGraph],
  );
  const phase = useMemo(() => derivePhase(view), [view]);
  const lanes = useMemo(
    () => SPECIALISTS.map((key) => deriveLane(key, view, catalogue, actions)),
    [view, catalogue, actions],
  );
  const evidence = useMemo(
    () => deriveEvidence(view, actions),
    [view, actions],
  );

  /** Follow-active-work: the open lane tracks whichever specialist is live. */
  const liveLane =
    lanes.find((lane) => LANE_STATE[lane.state].live)?.key ?? null;
  useEffect(() => {
    if (follow && liveLane) setOpenLane(liveLane);
  }, [follow, liveLane]);

  const pendingApproval = active?.approvals.find(
    (approval) => approval.status === "pending",
  );
  const activeFactoryIntent =
    active?.run.graphKey === FACTORY_FLOW_GRAPH_KEY
      ? readFactoryCommandIntent(active.run.input.factoryCommand)
      : null;
  const factoryApproval =
    active?.run.graphKey === FACTORY_FLOW_GRAPH_KEY
      ? active.approvals.find((approval) => approval.nodeId === "human-approval")
      : undefined;
  const factoryEvidenceQuery = useQuery<FactoryCommandEvidenceEnvelope>(
    canExecuteFactory && factoryApproval
      ? factoryCommandEvidencePath(factoryApproval.id)
      : null,
  );
  const recordedFactoryCommand = factoryEvidenceQuery.data?.command ?? undefined;
  const factoryEvidence =
    factoryCommandResult ??
    (recordedFactoryCommand
      ? {
          commandKey: recordedFactoryCommand.commandKey,
          status: recordedFactoryCommand.status,
          simulated: recordedFactoryCommand.simulated,
          result: recordedFactoryCommand.result,
        }
      : null);
  const activeFactoryAsset = activeFactoryIntent
    ? factoryQuery.data?.assets.find(
        (asset) => asset.assetCode === activeFactoryIntent.assetCode,
      )
    : undefined;
  const factoryIntentExpired = activeFactoryIntent
    ? Date.parse(activeFactoryIntent.expiresAt) <= Date.now()
    : false;
  const factoryMissionCompleted = active?.run.status === "completed";
  const factoryDraftValidation = factoryDraft
    ? buildFactoryCommandIntent(factoryDraft)
    : null;
  const factoryComposerReady =
    selectedGraphKey !== FACTORY_FLOW_GRAPH_KEY ||
    !canExecuteFactory ||
    (canReadFactory &&
      !factoryQuery.loading &&
      !factoryQuery.error &&
      factoryDraftValidation?.valid === true);

  useEffect(() => {
    window.dispatchEvent(new Event("xelor:approvals-changed"));
  }, [pendingApproval?.id]);

  const submitFactoryCommand = async (): Promise<void> => {
    if (
      !activeFactoryIntent ||
      !factoryApproval ||
      factoryApproval.status !== "approved" ||
      !factoryMissionCompleted ||
      !canExecuteFactory ||
      activeFactoryAsset?.adapterMode !== "simulator" ||
      factoryEvidenceQuery.loading ||
      factoryEvidenceQuery.error ||
      factoryEvidence
    ) {
      return;
    }
    if (Date.parse(activeFactoryIntent.expiresAt) <= Date.now()) {
      setError("This exact approved simulator intent has expired. Start a new Factory Flow mission to request a fresh approval.");
      return;
    }
    const idempotencyKey = `factory-command:${factoryApproval.id}`;
    const request = {
      ...activeFactoryIntent,
      approvalRef: factoryApproval.id,
      idempotencyKey,
    } as MachineCommandRequest;
    setBusy("submitting-factory");
    setError(null);
    try {
      const result = await agentOsApi.submitFactoryCommand(request);
      setFactoryCommandResult(result);
      factoryEvidenceQuery.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const nodeTotal = active?.nodes.length ?? 0;
  const nodeDone =
    active?.nodes.filter((node) => NODE_DONE.has(node.status)).length ?? 0;
  const activeAgents = lanes.filter(
    (lane) => LANE_STATE[lane.state].live,
  ).length;
  const elapsedMs = active
    ? (active.run.completedAt ? Date.parse(active.run.completedAt) : now) -
      Date.parse(active.run.createdAt)
    : null;

  const filteredEvidence = evidence.filter((item) => {
    if (evidenceAgent !== "all" && !item.agents.includes(evidenceAgent))
      return false;
    if (evidenceKind !== "all" && item.kind !== evidenceKind) return false;
    if (verifiedOnly && !item.verified) return false;
    if (usedOnly && !item.usedInResult) return false;
    return true;
  });

  return (
    <div className="agent-command">
      {/* ═══════════════ A · MISSION COMMAND BAR (§9.A) ═══════════════
          Slim, and it carries only real run facts: mission, status, elapsed, agents
          working, tasks complete, provider mode. The one sentence of product voice stays
          because it is the surface's own claim; everything else has a source. */}
      <header className="agent-bar">
        <div className="agent-bar-copy">
          <p className="agent-eyebrow">
            <span className="agent-live-dot" aria-hidden />
            ONYX Control Center
          </p>
          <h1>ONYX works across every department.</h1>
          <p className="agent-bar-mission-label">Current task</p>
          <h2 className="agent-bar-mission">
            {active ? active.run.goal : "No mission selected"}
          </h2>

          {/*
            THE CONNECTION BOUNDARY, STATED RATHER THAN INFERRED (§10).

            Three chips, because the three facts are genuinely different and collapsing them
            is how a demo starts implying an external model is wired up. Orchestration and
            ERP reads are LIVE; language reasoning is DETERMINISTIC; external connections are
            ZERO. This sits in the command bar rather than in a footnote because it is the
            claim an investor is entitled to check first.
          */}
          <Disclosure title="System details" className="mt-3">
            <ul className="agent-boundary" aria-label="Connection boundary">
              <li className="agent-status agent-status-ok">
                <Icons.CircleCheck className="h-3 w-3" aria-hidden />
                ONYX data and approvals connected
              </li>
              <li className="agent-status agent-status-idle">
                <Icons.Cpu className="h-3 w-3" aria-hidden />
                Built-in reasoning active
              </li>
              <li className="agent-status agent-status-idle">
                <Icons.Unplug className="h-3 w-3" aria-hidden />
                {catalogue?.runtime.externalConnections ?? 0} external
                connections
              </li>
            </ul>
          </Disclosure>
        </div>

        <dl className="agent-bar-stats" aria-label="Mission status">
          <BarStat
            label="Run status"
            value={active ? humanise(active.run.status) : "idle"}
            tone={active ? statusTone(active.run.status) : "agent-status-idle"}
            icon={Icons.Radio}
          />
          <BarStat
            label="Elapsed"
            value={elapsedMs === null ? "—" : formatElapsed(elapsedMs)}
            icon={Icons.Timer}
            numeric
          />
          <BarStat
            label="Agents working"
            value={`${activeAgents}/${SPECIALISTS.length}`}
            icon={Icons.Users}
            numeric
          />
          <BarStat
            label="Tasks complete"
            value={`${nodeDone}/${nodeTotal || (activeGraph?.nodes.length ?? 0)}`}
            icon={Icons.ListChecks}
            numeric
          />
        </dl>

        {active &&
        !TERMINAL.has(active.run.status) &&
        active.run.status !== "waiting_approval" ? (
          <button
            type="button"
            className="agent-quiet-action agent-bar-cancel"
            disabled={!canOperate || busy !== null}
            onClick={() => void cancel()}
          >
            Cancel mission
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="agent-error" role="alert">
          <Icons.CircleAlert className="h-4 w-4" aria-hidden />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {pendingApproval ? (
        <section
          className="mx-0 flex flex-col gap-3 rounded-[12px] border border-[color-mix(in_srgb,var(--warn)_42%,var(--border-subtle))] bg-[var(--warn-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Human approval waiting"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--warn)] text-[var(--text-on-accent)]">
              <Icons.UserRoundCheck className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-[var(--warn-ink)]">
                Human approval required
              </p>
              <p className="mt-0.5 text-[12.5px] font-bold text-[var(--text-primary)]">
                {pendingApproval.title}
              </p>
              <p className="mt-0.5 text-[10.5px] text-[var(--text-secondary)]">
                This mission is paused. No agent can approve this step for
                itself.
              </p>
            </div>
          </div>
          <Link
            href="/agentos/approvals"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[9px] bg-[var(--warn)] px-4 text-[11px] font-extrabold text-[var(--text-on-accent)] shadow-[var(--shadow-sm)] transition-[filter] hover:brightness-95"
          >
            Review and decide
            <Icons.ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </section>
      ) : null}

      {activeFactoryIntent ? (
        <section
          className="rounded-[13px] border border-[color-mix(in_srgb,var(--warn)_34%,var(--border-subtle))] bg-[var(--warn-soft)] p-4"
          aria-labelledby="active-factory-command-title"
          data-testid="active-factory-command"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[var(--warn-ink)]">Separate simulator command gate</p>
              <h2 id="active-factory-command-title" className="mt-1 text-[14px] font-extrabold text-[var(--text-primary)]">Approval-bound Factory Connect intent</h2>
              <p className="mt-1 max-w-[72ch] text-[10.5px] leading-4 text-[var(--text-secondary)]">The mission may analyse and approve this exact request. Only the separate submit action below can record it with the simulator.</p>
            </div>
            <span className="rounded-full border border-[var(--status-pending-border)] bg-[var(--surface)] px-2.5 py-1 text-[9.5px] font-bold text-[var(--warn-ink)]">
              {factoryApproval ? humanise(factoryApproval.status) : "Not at approval yet"}
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
            <FactoryCommandIntentView intent={activeFactoryIntent} />
            <div className="rounded-[11px] border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
              {factoryEvidence ? (
                <div role="status" data-testid="factory-command-result">
                  <div className="flex items-start gap-2">
                    {factoryEvidence.simulated ? (
                      <Icons.CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" aria-hidden />
                    ) : (
                      <Icons.Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" aria-hidden />
                    )}
                    <div>
                      <h3 className="text-[12px] font-extrabold text-[var(--text-primary)]">
                        {factoryEvidence.simulated
                          ? "Simulator evidence recorded — no physical execution"
                          : "Edge request recorded — execution not confirmed"}
                      </h3>
                      <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">
                        {resultNote(factoryEvidence.result) ??
                          "The command record is stored with its approval and result evidence."}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div><dt className="text-[var(--text-muted)]">Command key</dt><dd className="font-[var(--font-mono)] text-[var(--text-primary)]">{factoryEvidence.commandKey}</dd></div>
                    <div><dt className="text-[var(--text-muted)]">Recorded status</dt><dd className="font-semibold text-[var(--text-primary)]">{humanise(factoryEvidence.status)}</dd></div>
                  </dl>
                  {canViewFactoryLedger ? (
                    <Link href="/integration/factory-connect" className="btn btn-ghost btn-sm mt-3 inline-flex">
                      View Factory Connect ledger
                      <Icons.ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  ) : (
                    <p className="mt-3 text-[9.5px] leading-4 text-[var(--text-muted)]">The Integration operator can inspect this record in the Factory Connect ledger.</p>
                  )}
                </div>
              ) : factoryApproval?.status === "rejected" ? (
                <div>
                  <h3 className="text-[12px] font-extrabold text-[var(--bad-ink)]">Command intent rejected</h3>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">No simulator command can be submitted from this mission.</p>
                </div>
              ) : factoryApproval?.status === "approved" ? (
                <div>
                  <h3 className="text-[12px] font-extrabold text-[var(--text-primary)]">Human approval recorded</h3>
                  {!factoryMissionCompleted ? (
                    <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">ONYX is finishing the approved recovery brief before a simulator submission is offered.</p>
                  ) : factoryIntentExpired ? (
                    <p className="mt-1 text-[10px] leading-4 text-[var(--bad-ink)]">This exact approval has expired. Start a new Factory Flow mission to create a fresh bounded intent.</p>
                  ) : !canExecuteFactory ? (
                    <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">Your role can inspect this approval but does not hold <code>factory.command.execute</code>.</p>
                  ) : factoryEvidenceQuery.loading ? (
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Checking whether this approval already has simulator evidence…</p>
                  ) : factoryEvidenceQuery.error ? (
                    <div role="alert">
                      <p className="mt-1 text-[10px] leading-4 text-[var(--bad-ink)]">The command ledger could not be checked, so ONYX will not offer another submission.</p>
                      <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={factoryEvidenceQuery.reload}>Check again</button>
                    </div>
                  ) : factoryQuery.loading ? (
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Rechecking the simulator asset and gateway…</p>
                  ) : activeFactoryAsset?.adapterMode !== "simulator" ? (
                    <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">This surface submits only to an explicit simulator. No physical or unverified edge command is offered.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">One click records the exact approved request against the simulator. The same approval and stable idempotency key are reused on a safe retry.</p>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm mt-3 w-full justify-center"
                        disabled={busy !== null}
                        onClick={() => void submitFactoryCommand()}
                      >
                        {busy === "submitting-factory" ? (
                          <Icons.LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Icons.Send className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {busy === "submitting-factory" ? "Recording with simulator…" : "Submit simulated command"}
                      </button>
                      <p className="mt-2 text-[9px] leading-3.5 text-[var(--text-muted)]">This does not claim robot motion, material movement or controller execution.</p>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <h3 className="text-[12px] font-extrabold text-[var(--text-primary)]">No command submitted</h3>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">The intent is sealed into this mission and remains inactive while evidence is verified and the human decision is pending.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* Run start, delegation, approval, failure and completion, announced (§13). A screen
          whose whole subject is "work is happening elsewhere" has to say so out loud, or it
          is a picture only sighted users are invited to. */}
      <p className="sr-only" role="status" aria-live="polite">
        {active
          ? `${PHASE[phase].label}. ${activeAgents} of ${SPECIALISTS.length} specialists working. ` +
            `${nodeDone} of ${nodeTotal} tasks complete.` +
            (pendingApproval ? " A human decision is waiting." : "")
          : "No mission is running."}
      </p>

      <div className="agent-theatre">
        <div className="agent-theatre-main">
          {/* ═══════════════ B · ONYX STRATEGY RAIL (§9.B) ═══════════════ */}
          <StrategyRail
            phase={phase}
            view={view}
            lanes={lanes}
            graph={activeGraph}
            providerMode={catalogue?.runtime.providerMode ?? null}
            autonomyMode={catalogue?.runtime.autonomyMode ?? null}
            planOpen={showPlan}
            onTogglePlan={() => setShowPlan((open) => !open)}
          />

          {/* ═══════════════ C · EIGHT-SPECIALIST RUNWAY (§9.C) ═══════════════ */}
          <section
            className="agent-panel"
            aria-labelledby="agent-runway-heading"
          >
            <div className="agent-panel-head">
              <div>
                <p className="agent-panel-kicker">Department activity</p>
                <h2 id="agent-runway-heading">
                  Work across eight specialist departments.
                </h2>
              </div>
              <label className="agent-follow">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => setFollow(event.target.checked)}
                />
                Follow active work
              </label>
            </div>

            <ol className="agent-runway">
              {lanes.map((lane) => (
                <LaneRow
                  key={lane.key}
                  lane={lane}
                  open={openLane === lane.key}
                  onToggle={() => {
                    setFollow(false);
                    setOpenLane((current) =>
                      current === lane.key ? null : lane.key,
                    );
                  }}
                  events={
                    active?.events.filter((event) =>
                      lane.nodes.some((node) => node.nodeId === event.nodeId),
                    ) ?? []
                  }
                />
              ))}
            </ol>

            <RunwayLegend />
          </section>

          {/* ═══════════════ D · SHARED EVIDENCE RAIL (§9.D) ═══════════════ */}
          <Disclosure
            title="Evidence and activity details"
            hint={`${evidence.length} items`}
          >
            <section
              className="agent-panel"
              aria-labelledby="agent-evidence-heading"
            >
              <div className="agent-panel-head">
                <div>
                  <p className="agent-panel-kicker">Supporting information</p>
                  <h2 id="agent-evidence-heading">
                    {evidence.length} item{evidence.length === 1 ? "" : "s"} in
                    shared memory
                  </h2>
                </div>
                <span className="agent-runtime-chip">
                  {evidence.filter((item) => item.verified).length} verified
                </span>
              </div>

              <div className="agent-filters">
                <label>
                  <span>Agent</span>
                  <select
                    value={evidenceAgent}
                    onChange={(event) =>
                      setEvidenceAgent(event.target.value as AgentKey | "all")
                    }
                  >
                    <option value="all">Every agent</option>
                    <option value={BRAIN}>{BRAIN}</option>
                    {SPECIALISTS.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Type</span>
                  <select
                    value={evidenceKind}
                    onChange={(event) =>
                      setEvidenceKind(
                        event.target.value as EvidenceKind | "all",
                      )
                    }
                  >
                    <option value="all">Every type</option>
                    {(Object.keys(EVIDENCE_KIND) as EvidenceKind[]).map(
                      (kind) => (
                        <option key={kind} value={kind}>
                          {EVIDENCE_KIND[kind].label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="agent-filter-check">
                  <input
                    type="checkbox"
                    checked={verifiedOnly}
                    onChange={(event) => setVerifiedOnly(event.target.checked)}
                  />
                  Verified only
                </label>
                <label className="agent-filter-check">
                  <input
                    type="checkbox"
                    checked={usedOnly}
                    onChange={(event) => setUsedOnly(event.target.checked)}
                  />
                  Used in result
                </label>
              </div>

              {filteredEvidence.length > 0 ? (
                <ul className="agent-evidence">
                  {filteredEvidence.map((item) => (
                    <EvidenceTile key={item.id} item={item} />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={Icons.FolderSearch}
                  title={
                    evidence.length === 0
                      ? "No evidence yet"
                      : "No evidence matches this filter"
                  }
                  body={
                    evidence.length === 0
                      ? "Every retrieval, finding, verification check and dispatched action a mission produces lands here, attributed to the specialist that made it."
                      : "Clear a filter to see the rest of the shared memory for this mission."
                  }
                  compact
                />
              )}
            </section>
          </Disclosure>
        </div>

        {/* ═══════════════ THE RIGHT RAIL — composer, then the dock ═══════════════
            The mission composer is the product's EXISTING mission input and is preserved
            exactly: the same graph contract, the same goal field, the same three presets,
            the same local ERP signal ingress, the same provider disclosure. §9.A forbids
            adding a separate mission-creation workflow, and none is added. */}
        <aside className="agent-theatre-side">
          <section className="agent-panel agent-launcher">
            <div className="agent-panel-head">
              <div>
                <p className="agent-panel-kicker">New mission</p>
                <h2>Ask ONYX to coordinate.</h2>
              </div>
              <Icons.Sparkles
                className="h-5 w-5 text-[var(--ai-text)]"
                aria-hidden
              />
            </div>
            <label className="agent-goal-label" htmlFor="agent-graph">
              Review type
            </label>
            <select
              id="agent-graph"
              className="agent-graph-select"
              value={selectedGraphKey}
              onChange={(event) => setSelectedGraphKey(event.target.value)}
            >
              {catalogue?.graphs.map((graph) => (
                <option key={`${graph.key}@${graph.version}`} value={graph.key}>
                  {graph.name}
                </option>
              ))}
            </select>
            {selectedGraphKey === FACTORY_FLOW_GRAPH_KEY ? (
              <>
                <FactoryCommandComposer
                  overview={factoryQuery.data}
                  loading={factoryQuery.loading}
                  error={factoryQuery.error}
                  canRead={canReadFactory}
                  canExecute={canExecuteFactory}
                  draft={factoryDraft}
                  onDraftChange={setFactoryDraft}
                  onRetry={factoryQuery.reload}
                />
                {canExecuteFactory && factoryDraftValidation?.valid === false ? (
                  <p className="agent-permission-note" role="alert">
                    {factoryDraftValidation.reason}
                  </p>
                ) : null}
              </>
            ) : null}
            <label className="agent-goal-label" htmlFor="agent-goal">
              What should ONYX help with?
            </label>
            <textarea
              id="agent-goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Describe the operating question ONYX should coordinate…"
            />
            <div className="agent-presets">
              {PRESETS.map((preset, index) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setGoal(preset)}
                >
                  <span>0{index + 1}</span>
                  {preset}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="agent-primary-action"
              disabled={!canOperate || busy !== null || goal.trim().length < 5 || !factoryComposerReady}
              onClick={() => void startMission()}
            >
              {busy === "starting" ? (
                <Icons.LoaderCircle
                  className="h-4 w-4 animate-spin"
                  aria-hidden
                />
              ) : (
                <Icons.Play className="h-4 w-4" aria-hidden />
              )}
              {busy === "starting"
                ? "Coordinating…"
                : selectedGraphKey === FACTORY_FLOW_GRAPH_KEY && !canExecuteFactory
                  ? "Run factory-flow analysis"
                  : runGraphLabel(selectedGraphKey)}
            </button>
            <button
              type="button"
              className="agent-signal-action"
              disabled={!canOperate || busy !== null}
              onClick={() => void ingestSignal()}
            >
              {busy === "signalling" ? (
                <Icons.LoaderCircle
                  className="h-4 w-4 animate-spin"
                  aria-hidden
                />
              ) : (
                <Icons.RadioTower className="h-4 w-4" aria-hidden />
              )}
              {busy === "signalling"
                ? "Receiving ERP signal…"
                : "Start from local ERP risk signal"}
            </button>
            <Disclosure title="Connection details">
              <p className="agent-signal-note">
                <span className="agent-live-dot" aria-hidden />
                Internal event connection{" "}
                {catalogue?.runtime.signalIngress.status ?? "checking"}
              </p>
              <div className="agent-disclosure mt-2">
                <Icons.BadgeInfo className="h-4 w-4" aria-hidden />
                <p>
                  {catalogue?.runtime.providerDisclosure ??
                    "Checking the configured reasoning provider…"}
                </p>
              </div>
            </Disclosure>
            {!canOperate ? (
              <p className="agent-permission-note">
                Your role can inspect missions but cannot start them.
              </p>
            ) : null}
          </section>

          {/* ═══════════════ E · SYNTHESIS AND REVIEW DOCK (§9.E) ═══════════════ */}
          <SynthesisDock
            view={view}
            lanes={lanes}
            phase={phase}
            evidence={evidence}
          />

          <section className="agent-panel" aria-labelledby="agent-gate-heading">
            <div className="agent-panel-head">
              <div>
                <p className="agent-panel-kicker">Human authority</p>
                <h2 id="agent-gate-heading">Approval gate</h2>
              </div>
              <Icons.ShieldCheck
                className="h-5 w-5 text-[var(--ok)]"
                aria-hidden
              />
            </div>
            {pendingApproval ? (
              <div className="agent-approval">
                <span className="agent-risk">{pendingApproval.risk} risk</span>
                <h3>{pendingApproval.title}</h3>
                <p>{pendingApproval.proposedAction}</p>
                {canDecide ? (
                  <Link
                    href="/agentos/approvals"
                    className="agent-approve inline-flex w-full items-center justify-center gap-2"
                  >
                    <Icons.UserRoundCheck className="h-4 w-4" aria-hidden />
                    Review, add note and decide
                  </Link>
                ) : null}
                {!canDecide ? (
                  <p className="agent-permission-note">
                    Your role can see this decision but cannot make it.
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon={Icons.UserRoundCheck}
                title="No decision waiting"
                body="ONYX cannot publish a command brief until a named person approves the verified evidence."
                compact
              />
            )}
          </section>

          <Disclosure
            title="Completed actions"
            hint={`${actions.length} actions`}
          >
            <section className="agent-panel">
              <div className="agent-panel-head">
                <div>
                  <p className="agent-panel-kicker">Approved work</p>
                  <h2>Completed actions</h2>
                </div>
                <span className="agent-runtime-chip">
                  {actions.length} live
                </span>
              </div>
              <ActionLedger
                actions={
                  active
                    ? actions.filter((action) => action.runId === active.run.id)
                    : actions
                }
              />
            </section>
          </Disclosure>

          <Disclosure title="Recent tasks" hint={`${runs.length} saved`}>
            <section className="agent-panel">
              <div className="agent-panel-head">
                <div>
                  <p className="agent-panel-kicker">History</p>
                  <h2>Recent tasks</h2>
                </div>
                <button
                  type="button"
                  className="agent-icon-action"
                  title="Refresh mission history"
                  aria-label="Refresh mission history"
                  onClick={() => void refreshRuns(active?.run.id)}
                >
                  <Icons.RefreshCw className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="agent-history">
                {runs.length > 0 ? (
                  runs.slice(0, 6).map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      className={cn(
                        "agent-history-row",
                        active?.run.id === run.id && "agent-history-row-active",
                      )}
                      aria-current={
                        active?.run.id === run.id ? "true" : undefined
                      }
                      onClick={() => {
                        void Promise.all([
                          agentOsApi.run(run.id),
                          agentOsApi.actions(50, run.id),
                        ])
                          .then(([detail, nextActions]) => {
                            setActive(detail);
                            setActions(nextActions);
                          })
                          .catch((cause) => setError(errorMessage(cause)));
                      }}
                    >
                      <span
                        className={cn(
                          "agent-history-mark",
                          statusTone(run.status),
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <b>{run.goal}</b>
                        <small>
                          {formatWhen(run.createdAt)} · {run.consumedSteps}{" "}
                          steps
                        </small>
                      </span>
                      <Icons.ChevronRight
                        className="h-4 w-4 shrink-0"
                        aria-hidden
                      />
                    </button>
                  ))
                ) : (
                  <p className="py-5 text-center text-[12px] text-[var(--text-muted)]">
                    No missions have been run yet.
                  </p>
                )}
              </div>
            </section>
          </Disclosure>

          {/* The trace stays inspectable after the mission ends — the whole argument for an
              auditable agent — and is last on the rail because nobody opens it first. */}
          <Disclosure title="Technical activity log">
            <TraceTimeline view={view} />
          </Disclosure>
        </aside>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   A · THE COMMAND BAR'S STATS
   ═══════════════════════════════════════════════════════════════════════════════ */

function BarStat({
  label,
  value,
  detail,
  tone,
  icon: Icon,
  numeric = false,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: string;
  icon: Icons.LucideIcon;
  numeric?: boolean;
}): React.JSX.Element {
  return (
    <div className="agent-stat">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <dt>{label}</dt>
      <dd
        className={cn(tone && "agent-stat-toned", tone)}
        data-numeric={numeric ? "" : undefined}
      >
        {value}
      </dd>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   B · THE STRATEGY RAIL — the supervisor as a command surface, not a giant circle
   ═══════════════════════════════════════════════════════════════════════════════ */

function StrategyRail({
  phase,
  view,
  lanes,
  graph,
  providerMode,
  autonomyMode,
  planOpen,
  onTogglePlan,
}: {
  phase: Phase;
  view: RunView;
  lanes: readonly Lane[];
  graph: GraphDefinition | undefined;
  providerMode: string | null;
  autonomyMode: string | null;
  planOpen: boolean;
  onTogglePlan: () => void;
}): React.JSX.Element {
  const brain = mark(BRAIN);
  const run = view.run;
  const brainNodes = run?.nodes.filter((node) => node.agentKey === BRAIN) ?? [];
  const latestBrain = [...brainNodes]
    .reverse()
    .find((node) => summaryOf(node) !== null);

  const PhaseIcon = PHASE[phase].icon;
  const graphNodes = graph?.nodes.length ?? run?.nodes.length ?? 0;
  const terminal =
    run?.nodes.filter((node) => NODE_DONE.has(node.status)).length ?? 0;
  const openPackets = graphNodes - terminal;

  /**
   * QUALITY, AS A VERIFICATION STATE RATHER THAN A NUMBER (§9.E).
   *
   * The deterministic reasoner returns `confidence: 1` for every step. Rendering that as a
   * percentage would put a fabricated certainty on the one screen whose entire claim is that
   * nothing here is fabricated. What CAN be stated is what HEXA actually checked.
   */
  const verifications =
    run?.nodes.filter((node) => node.nodeKind === "verification") ?? [];
  const failedVerification = verifications.find(
    (node) => node.status === "failed",
  );
  const passedVerification = verifications.filter(
    (node) => node.status === "succeeded",
  );
  const declaredChecks = passedVerification.reduce(
    (sum, node) => sum + checksOf(node).declared.length,
    0,
  );

  const quality = failedVerification
    ? { label: "Rejected by HEXA", tone: "agent-status-bad" }
    : passedVerification.length > 0
      ? {
          label: `Verified · ${declaredChecks} checks`,
          tone: "agent-status-ok",
        }
      : run
        ? { label: "Not yet verified", tone: "agent-status-idle" }
        : { label: "No mission", tone: "agent-status-idle" };

  /** The guardrail claim, and the one computed check that actually backs it. */
  const sideEffectSafe = passedVerification.some((node) =>
    checksOf(node).computed.some(
      ([name, value]) => name === "sideEffectPolicySatisfied" && value === true,
    ),
  );

  return (
    <section
      className="agent-panel agent-rail"
      aria-labelledby="agent-rail-heading"
    >
      <div className="agent-rail-head">
        <span
          className="agent-rail-glyph"
          style={{ "--agent-color": brain.accent } as React.CSSProperties}
          aria-hidden
        >
          {brain.letter}
        </span>
        <div className="min-w-0">
          <p className="agent-panel-kicker">Supervisor · mission coordinator</p>
          <h2 id="agent-rail-heading">ONYX Supervisor</h2>
          <p className="agent-rail-role">
            Accepts the goal, bounds and decomposes it into task packets,
            delegates to eight specialists, verifies the evidence and publishes
            one accountable result.
          </p>
        </div>
        <span className={cn("agent-phase", PHASE[phase].tone)}>
          <PhaseIcon className="h-3.5 w-3.5" aria-hidden />
          {PHASE[phase].label}
        </span>
      </div>

      {/* The phase track. Six named steps with the current one marked in TEXT as well as in
          fill — a filled pip alone is a state communicated by colour, which §9.C rules out. */}
      <ol className="agent-phase-track" aria-label="Mission phase">
        {PHASE_TRACK.map((step) => {
          const position = PHASE_TRACK.indexOf(step);
          const current = PHASE_TRACK.indexOf(phase);
          const reached =
            phase === "published" ||
            (current >= 0 && position <= current) ||
            (phase === "awaiting_authority" &&
              position <= PHASE_TRACK.indexOf("reviewing"));
          return (
            <li
              key={step}
              data-reached={reached ? "" : undefined}
              aria-current={step === phase ? "step" : undefined}
            >
              <i aria-hidden />
              {PHASE[step].label}
            </li>
          );
        })}
      </ol>

      <p className="agent-rail-decision">
        <Icons.MessageSquareQuote className="h-3.5 w-3.5" aria-hidden />
        {summaryOf(latestBrain) ??
          (run
            ? "ONYX has not published a decision summary for this mission yet."
            : "Start a mission and ONYX's plan, delegation and review decisions appear here.")}
      </p>

      <div className="agent-rail-facts">
        <div>
          <small>Mission decomposition</small>
          <b data-numeric="">
            {terminal}/{graphNodes}
          </b>
          <Meter
            fraction={graphNodes > 0 ? terminal / graphNodes : 0}
            tone={
              phase === "halted"
                ? "bad"
                : phase === "published"
                  ? "ok"
                  : "neutral"
            }
          />
        </div>
        <div>
          <small>Open task packets</small>
          <b data-numeric="">{Math.max(0, openPackets)}</b>
          <span className="agent-rail-fact-note">
            {lanes.filter((lane) => lane.state === "waiting_dependency").length}{" "}
            blocked on a dependency
          </span>
        </div>
        <div>
          <small>Verification</small>
          <b className={cn("agent-status", quality.tone)}>{quality.label}</b>
          <span className="agent-rail-fact-note">
            qualitative · {providerMode ?? "provider unknown"} reasoning
          </span>
        </div>
        <div>
          <small>Guardrail</small>
          <b
            className={cn(
              "agent-status",
              sideEffectSafe ? "agent-status-ok" : "agent-status-idle",
            )}
          >
            {sideEffectSafe
              ? "No write before approval"
              : (autonomyMode ?? "checking")}
          </b>
          <span className="agent-rail-fact-note">
            {run
              ? `${run.run.consumedSteps}/${run.run.maxSteps} bounded steps`
              : "bounded graph"}
          </span>
        </div>
      </div>

      {/* THE TASK PACKETS ONYX GENERATED, one per specialist, entering the runway below.
          They are the graph's own nodes grouped by assignee, not a decorative row of cards:
          the count, the state and the expected output are read from the registered graph, so
          a packet cannot describe work the mission cannot do. */}
      <div className="agent-packets" aria-label="Task packets">
        {lanes.map((lane) => {
          const meta = LANE_STATE[lane.state];
          const { accent, letter } = mark(lane.key);
          const StateIcon = meta.icon;
          return (
            <article
              key={lane.key}
              className="agent-packet"
              style={{ "--agent-color": accent } as React.CSSProperties}
              data-state={lane.state}
            >
              <header>
                <span className="agent-packet-mark" aria-hidden>
                  {letter}
                </span>
                <b>{lane.key}</b>
                <span
                  className={cn("agent-packet-state", toneClass(meta.tone))}
                >
                  <StateIcon className="h-3 w-3" aria-hidden />
                  {meta.label}
                </span>
              </header>
              <p>{lane.currentTask ?? "Awaiting delegation"}</p>
              <footer>
                <span data-numeric="">
                  {lane.done}/{lane.total} steps
                </span>
                {lane.expected ? <span>{lane.expected}</span> : null}
              </footer>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className="agent-quiet-action agent-plan-toggle"
        onClick={onTogglePlan}
        aria-expanded={planOpen}
      >
        {planOpen ? (
          <Icons.ChevronUp className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Icons.ChevronDown className="h-3.5 w-3.5" aria-hidden />
        )}
        {planOpen ? "Hide plan" : "Inspect plan"}
      </button>

      {planOpen ? (
        run ? (
          <PlanInspector view={view} />
        ) : (
          <EmptyState
            icon={Icons.Route}
            title="The graph is registered and idle"
            body={`${graphNodes} bounded nodes will execute in dependency order when ONYX starts a mission.`}
            compact
          />
        )
      ) : null}
    </section>
  );
}

/**
 * The registered graph, as it executed. The "inspect plan" surface, deliberately a LIST
 * rather than a node-and-edge canvas: the question somebody opens it to answer is "what ran,
 * in what order, and what did it touch", and a list answers that without tracing a line.
 */
function PlanInspector({ view }: { view: RunView }): React.JSX.Element {
  const nodes = view.run?.nodes ?? [];
  return (
    <ol className="agent-node-list">
      {nodes.map((node, index) => {
        const mode = outputOf(node).mode;
        const blockedBy = view.index
          .dependsOn(node.nodeId)
          .filter((dep) => {
            const status = view.statusById.get(dep);
            return status === undefined || !NODE_DONE.has(status);
          })
          .map((dep) => view.index.byId.get(dep)?.name ?? dep);
        return (
          <li key={node.id}>
            <div className="agent-node-rail">
              <span
                className={cn("agent-step-number", statusTone(node.status))}
              >
                {node.status === "succeeded" ? (
                  <Icons.Check className="h-3.5 w-3.5" aria-hidden />
                ) : node.status === "running" ? (
                  <Icons.LoaderCircle
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden
                  />
                ) : node.status === "waiting_approval" ? (
                  <Icons.UserRoundCheck className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              {index < nodes.length - 1 ? <i /> : null}
            </div>
            <div className="agent-step-copy">
              <div>
                <span>{node.agentKey ?? humanise(node.nodeKind)}</span>
                <b>{node.nodeName}</b>
              </div>
              <small className={cn("agent-status", statusTone(node.status))}>
                {humanise(node.status)}
              </small>
              {node.capabilityKey ? (
                <p>
                  <Icons.Database className="h-3.5 w-3.5" aria-hidden />
                  {node.capabilityKey}
                  {typeof mode === "string" ? ` · ${humanise(mode)}` : ""}
                </p>
              ) : blockedBy.length > 0 ? (
                <p>
                  <Icons.Hourglass className="h-3.5 w-3.5" aria-hidden />
                  waiting on {blockedBy.join(", ")}
                </p>
              ) : node.attempt > 1 ? (
                <p>
                  <Icons.RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  attempt {node.attempt}
                </p>
              ) : null}
              {node.errorMessage ? (
                <p className="text-[var(--bad-ink)]">{node.errorMessage}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   C · THE RUNWAY
   ═══════════════════════════════════════════════════════════════════════════════ */

function LaneRow({
  lane,
  open,
  onToggle,
  events,
}: {
  lane: Lane;
  open: boolean;
  onToggle: () => void;
  events: readonly { id: string; eventType: string; createdAt: string }[];
}): React.JSX.Element {
  const meta = LANE_STATE[lane.state];
  const StateIcon = meta.icon;
  const { accent, letter } = mark(lane.key);
  const panelId = `agent-lane-${lane.key}`;

  return (
    <li
      className={cn("agent-lane", open && "agent-lane-open")}
      style={{ "--agent-color": accent } as React.CSSProperties}
      data-state={lane.state}
      data-connected={lane.connected ? "" : undefined}
    >
      {/* THE WHOLE HEAD IS THE CONTROL. A 12px chevron beside a 52px row is a target
          somebody misses; the row itself clears the 44px preference comfortably. */}
      <button
        type="button"
        className="agent-lane-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="agent-lane-glyph" aria-hidden>
          {letter}
        </span>
        <span className="agent-lane-id">
          <b>{lane.key}</b>
          <small>{lane.domain}</small>
        </span>
        <span className={cn("agent-lane-state", toneClass(meta.tone))}>
          <StateIcon
            className={cn(
              "h-3.5 w-3.5",
              lane.state === "working" && "agent-spin",
            )}
            aria-hidden
          />
          {meta.label}
        </span>
        <span className="agent-lane-task">
          <b>{lane.currentTask ?? "No task delegated"}</b>
          {lane.state === "waiting_dependency" && lane.blockedBy.length > 0 ? (
            <small>waiting on {lane.blockedBy.join(", ")}</small>
          ) : lane.tool ? (
            <small>capability · {lane.tool}</small>
          ) : lane.handoffTo ? (
            <small>handed to {lane.handoffTo}</small>
          ) : lane.expected ? (
            <small>expects {lane.expected}</small>
          ) : null}
        </span>
        {/* SPANS, NOT THE SHARED `Meter`, and the reason is the button around it. `Meter`
            renders divs — flow content — and a button's content model is phrasing content
            only. It renders identically in every browser and is still invalid markup, which
            on a control this important is not a trade worth making. The bar is always paired
            with the figure beside it: a ratio with the magnitude hidden is not actionable. */}
        <span className="agent-lane-progress">
          <span className="agent-lane-bar" aria-hidden>
            <span
              style={{
                width: `${lane.total > 0 ? Math.round((lane.done / lane.total) * 100) : 0}%`,
              }}
            />
          </span>
          <small data-numeric="">
            {lane.done}/{lane.total}
          </small>
        </span>
        <span className="agent-lane-meta">
          <small data-numeric="">
            <Icons.Paperclip className="h-3 w-3" aria-hidden />
            {lane.evidenceCount}
          </small>
          <small data-numeric="">
            <Icons.Timer className="h-3 w-3" aria-hidden />
            {lane.activeMs === null ? "—" : formatElapsed(lane.activeMs)}
          </small>
        </span>
        <Icons.ChevronDown
          className={cn(
            "agent-lane-chevron h-4 w-4",
            open && "agent-lane-chevron-open",
          )}
          aria-hidden
        />
      </button>

      {/* THE HANDOFF, DRAWN AS A LABELLED BRIDGE rather than a light travelling down a
          curve. A packet crossing between lanes looks like data moving; a named row says
          WHAT moved and WHERE, which is the part somebody has to repeat to a colleague. */}
      {lane.handoffTo && !open ? (
        <p className="agent-lane-bridge">
          <Icons.CornerDownRight className="h-3 w-3" aria-hidden />
          {lane.key} → {lane.handoffTo}
        </p>
      ) : null}

      <div id={panelId} className="agent-lane-body" hidden={!open}>
        <p className="agent-lane-purpose">{lane.purpose}</p>

        {lane.summary ? (
          <p className="agent-lane-summary">
            <Icons.MessageSquareQuote className="h-3.5 w-3.5" aria-hidden />
            {lane.summary}
          </p>
        ) : null}

        {lane.findings.length > 0 ? (
          <ul className="agent-lane-findings">
            {lane.findings.map((finding, position) => (
              <li key={`${position}-${finding}`}>
                <Icons.FileCheck2 className="h-3.5 w-3.5" aria-hidden />
                {finding}
              </li>
            ))}
          </ul>
        ) : null}

        {lane.nodes.length > 0 ? (
          <ol className="agent-lane-steps">
            {lane.nodes.map((node) => (
              <li key={node.id}>
                <span
                  className={cn("agent-step-dot", statusTone(node.status))}
                  aria-hidden
                />
                <b>{node.nodeName}</b>
                <small className={cn("agent-status", statusTone(node.status))}>
                  {humanise(node.status)}
                </small>
                {node.capabilityKey ? <code>{node.capabilityKey}</code> : null}
                {node.attempt > 1 ? <em>attempt {node.attempt}</em> : null}
                {node.errorMessage ? (
                  <p className="text-[var(--bad-ink)]">{node.errorMessage}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="agent-lane-quiet">
            ONYX has not delegated anything to {lane.key} in this mission.
          </p>
        )}

        {events.length > 0 ? (
          <ol className="agent-lane-events" aria-label={`${lane.key} activity`}>
            {events.slice(-6).map((event) => (
              <li key={event.id}>
                <time dateTime={event.createdAt} data-numeric="">
                  {formatClock(event.createdAt)}
                </time>
                {humanise(event.eventType)}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </li>
  );
}

function RunwayLegend(): React.JSX.Element {
  const shown: readonly LaneState[] = [
    "working",
    "collaborating",
    "waiting_dependency",
    "under_review",
    "completed",
    "failed_safely",
  ];
  return (
    <ul className="agent-legend">
      {shown.map((state) => {
        const meta = LANE_STATE[state];
        const Icon = meta.icon;
        return (
          <li key={state}>
            <span
              className={cn("agent-legend-mark", toneClass(meta.tone))}
              aria-hidden
            />
            <Icon className="h-3 w-3" aria-hidden />
            {meta.label}
          </li>
        );
      })}
    </ul>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   D · AN EVIDENCE TILE
   ═══════════════════════════════════════════════════════════════════════════════ */

function EvidenceTile({ item }: { item: EvidenceItem }): React.JSX.Element {
  const kind = EVIDENCE_KIND[item.kind];
  const Icon = kind.icon;
  return (
    <li className="agent-evidence-tile" data-kind={item.kind}>
      <span className="agent-evidence-icon" aria-hidden>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="agent-evidence-kind">
          {kind.label}
          {item.verified ? (
            <span className="agent-evidence-flag agent-status-ok">
              <Icons.ShieldCheck className="h-3 w-3" aria-hidden />
              verified
            </span>
          ) : (
            <span className="agent-evidence-flag agent-status-idle">
              <Icons.Shield className="h-3 w-3" aria-hidden />
              unverified
            </span>
          )}
          {item.usedInResult ? (
            <span className="agent-evidence-flag agent-status-live">
              <Icons.CornerUpRight className="h-3 w-3" aria-hidden />
              in result
            </span>
          ) : null}
        </p>
        <b>{item.title}</b>
        <small>{item.detail}</small>
      </div>
      {/* MANY MARKS, NOT MANY TILES. When four specialists used the same retrieval, four
          identical tiles would say "there were four sources" — which is false. */}
      <span className="agent-evidence-marks">
        {item.agents.map((key) => (
          <i
            key={key}
            style={{ "--agent-color": mark(key).accent } as React.CSSProperties}
            title={key}
            aria-label={key}
          >
            {mark(key).letter}
          </i>
        ))}
      </span>
    </li>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   E · THE SYNTHESIS AND REVIEW DOCK
   ═══════════════════════════════════════════════════════════════════════════════ */

function SynthesisDock({
  view,
  lanes,
  phase,
  evidence,
}: {
  view: RunView;
  lanes: readonly Lane[];
  phase: Phase;
  evidence: readonly EvidenceItem[];
}): React.JSX.Element {
  const run = view.run;
  const received = lanes.filter((lane) =>
    lane.nodes.some(
      (node) => node.nodeKind === "agent" && node.status === "succeeded",
    ),
  );
  const waiting = lanes.filter((lane) => !received.includes(lane));

  /**
   * A CONFLICT IS A RETRY OR A FAILURE, and nothing else is called one.
   *
   * The temptation on a screen like this is to invent disagreement between specialists to
   * make the review gate look busy. The engine records exactly two things that honestly
   * qualify: a node that needed more than one attempt, and a node that failed. Both are in
   * the run; neither is inferred.
   */
  const conflicts = (run?.nodes ?? []).filter(
    (node) => node.status === "failed" || node.attempt > 1,
  );

  const verification = [...(run?.nodes ?? [])]
    .reverse()
    .find(
      (node) => node.nodeKind === "verification" && node.status !== "pending",
    );
  const verificationChecks = checksOf(verification);

  /**
   * THE PUBLISHED RESULT, unwrapped one layer at a time.
   *
   * `run.output` is the engine's completion envelope — `{ graphKey, graphVersion,
   * finalNodeId, result }` — and `result` is the last succeeded node's own output. So the
   * summary a person reads is the ONYX synthesis node's summary, reached through two hops,
   * and if either hop is missing this panel says nothing rather than inventing a sentence.
   */
  const runOutput = run?.run.output;
  const envelope =
    runOutput && typeof runOutput === "object"
      ? (runOutput as Record<string, unknown>)
      : {};
  const published =
    envelope.result && typeof envelope.result === "object"
      ? (envelope.result as Record<string, unknown>)
      : {};
  const resultSummary =
    typeof published.summary === "string" ? published.summary : null;
  const resultFindings = stringsIn(published.findings);

  const ready = waiting.length === 0 && Boolean(verification);

  return (
    <section
      className="agent-panel agent-dock"
      aria-labelledby="agent-dock-heading"
    >
      <div className="agent-panel-head">
        <div>
          <p className="agent-panel-kicker">Synthesis and review</p>
          <h2 id="agent-dock-heading">Convergence</h2>
        </div>
        <span className={cn("agent-status", PHASE[phase].tone)}>
          {PHASE[phase].label}
        </span>
      </div>

      {/* THE SYNTHESIS STACK. Six output capsules landing in a layered pile, not six lines
          merging into a glowing orb: a stack keeps every contribution individually
          identifiable right up to publication, which is exactly the claim being made. */}
      <ol className="agent-stack" aria-label="Specialist outputs received">
        {lanes.map((lane) => {
          const arrived = received.includes(lane);
          return (
            <li
              key={lane.key}
              className={cn("agent-stack-row", arrived && "agent-stack-row-in")}
              style={
                {
                  "--agent-color": mark(lane.key).accent,
                } as React.CSSProperties
              }
              data-arrived={arrived ? "" : undefined}
            >
              <span className="agent-stack-mark" aria-hidden>
                {mark(lane.key).letter}
              </span>
              <b>{lane.key}</b>
              <small>
                {arrived
                  ? (lane.summary ?? "Output capsule received")
                  : LANE_STATE[lane.state].label}
              </small>
              {arrived ? (
                <Icons.Check
                  className="h-3.5 w-3.5 shrink-0 text-[var(--ok-ink)]"
                  aria-hidden
                />
              ) : (
                <Icons.Circle
                  className="h-3.5 w-3.5 shrink-0 text-[var(--text-disabled)]"
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>

      <dl className="agent-dock-facts">
        <div>
          <dt>Results received</dt>
          <dd data-numeric="">
            {received.length}/{lanes.length}
          </dd>
        </div>
        <div>
          <dt>Conflicts detected</dt>
          <dd
            data-numeric=""
            className={cn(conflicts.length > 0 && "text-[var(--warn-ink)]")}
          >
            {conflicts.length}
          </dd>
        </div>
        <div>
          <dt>Evidence used</dt>
          <dd data-numeric="">
            {evidence.filter((item) => item.usedInResult).length}/
            {evidence.length}
          </dd>
        </div>
      </dl>

      {conflicts.length > 0 ? (
        <ul className="agent-conflicts">
          {conflicts.map((node) => (
            <li key={node.id}>
              <Icons.TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              <span>
                <b>{node.nodeName}</b>
                <small>
                  {node.status === "failed"
                    ? (node.errorMessage ??
                      "The step failed and the mission stopped safely.")
                    : `Resolved on attempt ${node.attempt} — ONYX re-issued the task.`}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* THE REVIEW GATE. One scan across the outputs, once, when it passes — not a border
          that glows for as long as the tab is open. */}
      <div
        className={cn(
          "agent-review-gate",
          verification?.status === "succeeded" && "agent-review-gate-passed",
          verification?.status === "failed" && "agent-review-gate-failed",
        )}
      >
        <p>
          <Icons.ScanEye className="h-3.5 w-3.5" aria-hidden />
          {verification
            ? `HEXA · ${verification.nodeName}`
            : ready
              ? "HEXA review is next"
              : "HEXA reviews once every specialist output has arrived"}
        </p>
        {verificationChecks.declared.length > 0 ? (
          <ul>
            {verificationChecks.declared.map((check, position) => (
              <li key={`${position}-${check}`}>
                <Icons.Check className="h-3 w-3" aria-hidden />
                {check}
              </li>
            ))}
          </ul>
        ) : null}
        {verificationChecks.computed.length > 0 ? (
          <p className="agent-review-computed">
            {
              verificationChecks.computed.filter(([, value]) => value === true)
                .length
            }
            /{verificationChecks.computed.length} computed checks passed ·{" "}
            {verificationChecks.computed
              .filter(([, value]) => value !== true)
              .map(([name]) => unCamel(name))
              .join(", ") || "none outstanding"}
          </p>
        ) : null}
      </div>

      {resultSummary ? (
        <article className="agent-result">
          {/*
            THE HEADING IS THE SECTION, NOT THE SENTENCE — and that is a correction made
            after watching it render.

            The deterministic reasoner builds its summary as `${agent.name}: ${goal}`, so the
            "executive outcome" it returns for a signal-started mission reads "ONYX
            Supervisor: Respond to operations signal 'delivery.commitment.at_risk'…" — which
            is the mission title with a name in front of it. Promoting that to an `<h3>` put
            the same sentence on the screen twice, once in the command bar and once here, and
            gave the document two headings with identical text.

            So the heading names the section and the machine's sentence sits under it,
            attributed. Nothing is hidden: the summary is still shown verbatim. It is just no
            longer pretending to be a conclusion that was reached rather than composed.
          */}
          <h3>Published result</h3>
          <p className="agent-result-summary">{resultSummary}</p>
          {resultFindings.length > 0 ? (
            <ul className="agent-result-findings">
              {resultFindings.map((finding, position) => (
                <li key={`${position}-${finding}`}>{finding}</li>
              ))}
            </ul>
          ) : null}

          <p className="agent-panel-kicker">Contributions by specialist</p>
          <ul className="agent-contributions">
            {lanes
              .filter((lane) => lane.summary || lane.findings.length > 0)
              .map((lane) => (
                <li
                  key={lane.key}
                  style={
                    {
                      "--agent-color": mark(lane.key).accent,
                    } as React.CSSProperties
                  }
                >
                  <span aria-hidden>{mark(lane.key).letter}</span>
                  <div>
                    <b>{lane.key}</b>
                    <small>{lane.findings[0] ?? lane.summary}</small>
                  </div>
                </li>
              ))}
          </ul>

          <p className="agent-result-quality">
            <Icons.BadgeInfo className="h-3.5 w-3.5" aria-hidden />
            Quality is stated as a verification outcome, not a score:
            HEXA&apos;s declared checks above are what this result rests on.
            Language reasoning is {run?.run.providerMode ?? "unknown"}; no
            external model produced this text.
          </p>
        </article>
      ) : (
        <EmptyState
          icon={Icons.FileText}
          title={run ? "Nothing published yet" : "No mission running"}
          body={
            run
              ? "ONYX publishes one result when every specialist output has arrived, HEXA has verified it and a named person has approved it."
              : "The synthesis dock fills as specialist outputs arrive from the runway."
          }
          compact
        />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   THE TRACE — the run, still inspectable after it ends
   ═══════════════════════════════════════════════════════════════════════════════ */

function TraceTimeline({ view }: { view: RunView }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const events = view.run?.events ?? [];
  return (
    <section className="agent-panel">
      <div className="agent-panel-head">
        <div>
          <p className="agent-panel-kicker">Auditable trace</p>
          <h2>Run timeline</h2>
        </div>
        <button
          type="button"
          className="agent-quiet-action"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          disabled={events.length === 0}
        >
          {open ? "Hide" : `${events.length} events`}
        </button>
      </div>
      {open ? (
        <ol className="agent-trace">
          {events.map((event) => (
            <li key={event.id}>
              <time dateTime={event.createdAt} data-numeric="">
                {formatClock(event.createdAt)}
              </time>
              <b>{humanise(event.eventType)}</b>
              {event.nodeId ? (
                <small>
                  {view.index.byId.get(event.nodeId)?.name ?? event.nodeId}
                </small>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="agent-trace-note">
          Every node start, success, retry, approval and checkpoint is recorded
          in sequence and stays readable after the mission ends.
        </p>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SHARED SMALL PARTS — unchanged contracts
   ═══════════════════════════════════════════════════════════════════════════════ */

function ActionLedger({
  actions,
}: {
  actions: readonly AgentAction[];
}): React.JSX.Element {
  if (actions.length === 0) {
    return (
      <EmptyState
        icon={Icons.Send}
        title="No actions dispatched"
        body="Actions remain proposals until a named person approves the complete business-and-service plan."
        compact
      />
    );
  }
  return (
    <ol className="agent-action-ledger">
      {actions.map((action) => (
        <li key={action.id}>
          <span
            className="agent-action-mark"
            style={
              {
                "--agent-color": mark(action.agentKey).accent,
              } as React.CSSProperties
            }
            aria-hidden
          >
            {mark(action.agentKey).letter}
          </span>
          <div>
            <span>
              {action.agentKey} · {humanise(action.targetDomain)}
            </span>
            <b>{action.title}</b>
            <small>
              {action.status} · {humanise(action.executionMode)} ·{" "}
              {formatWhen(action.dispatchedAt)}
            </small>
          </div>
          <Icons.CheckCheck className="h-4 w-4 text-[var(--ok)]" aria-hidden />
        </li>
      ))}
    </ol>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  compact = false,
}: {
  icon: Icons.LucideIcon;
  title: string;
  body: string;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <div className={cn("agent-empty", compact && "agent-empty-compact")}>
      <span>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
