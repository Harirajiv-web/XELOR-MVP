"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import type { ScreenProps } from "@spine/registry/manifest";
import { api } from "@spine/api/client";
import { ErrorState, Loading } from "@spine/states";
import { cn } from "@spine/ui/cn";
import { inr } from "@spine/format";
import { useSession } from "@spine/auth/session";
import {
  beginMissionTour,
  forgetMission,
  refreshMissionTour,
  resumableMissionId,
} from "@spine/shell/agent-driver";
import { arcTotal, parseMeta, stepCounter } from "@spine/ui/mission-arc";
import {
  LayerChip,
  LayerLegend,
  PipelineRail,
  readPipeline,
  type Layer,
  type PipelineStage,
} from "@spine/ui/pipeline";
import { NewOrderForm, type NewOrderResult } from "../new-order-form";
import { ScenarioPicker } from "../scenario-picker";
import { fetchScenarios, startScenario, type Scenario } from "../scenarios";

/**
 * MISSION CONTROL — walked one step at a time, by a person.
 *
 * The behaviour has not changed and must not: the mission stops after EVERY step and asks,
 * one card, one thing that happened, one button. The person is walking the process rather
 * than reviewing a transcript of it, and by the time they reach the money question they
 * have already agreed to the findings the money question rests on.
 *
 * Written for a plant supervisor, not for an engineer:
 *
 *   · The big sentence is `step.plain` — "You are short 776 bolts", never "RAW-BLT-M8 is
 *     short 775.51 of 1959.184". Same number, different reader.
 *   · The technical evidence is still there, behind "Show me where I looked". Nobody is
 *     being denied it; it simply is not the first thing on the card.
 *   · THE TWO LAYERS ARE NEVER DRAWN THE SAME WAY. Phase 1 is the ERP and the system of
 *     record; Phase 2 is this layer, sitting on top, reading it. `spine/ui/pipeline.tsx`
 *     holds the one visual language for that distinction and every surface here uses it.
 *
 * WHAT THIS PASS CHANGED, and it is layout rather than behaviour. Four things were measured
 * on a live 1600px screen and all four were real:
 *
 *   THE PAGE SAID EVERYTHING TWICE. The agent bar in the shell repeated this screen's step
 *   sentence, its pipeline strip, its recommendation and its decision buttons, stacked
 *   directly under them. The bar earns its place on Sales, Purchase and Production — it is
 *   the only surface that follows the mission off this screen — and earns nothing here. It
 *   now hides itself on this route (see `agent-driver.tsx`) and Mission Control owns the
 *   whole presentation, which is most of the win.
 *
 *   THE DECISION WAS SPLIT IN HALF. The brief rendered here, in a card that fell off the
 *   fold mid-sentence, and its buttons were in the bar at the bottom of the viewport. A
 *   person committing ₹3,37,658 was reading one half and clicking the other. There is now
 *   ONE decision surface, and it is a column of its own that stays put while the narrative
 *   beside it scrolls.
 *
 *   480px OF THE SCREEN WAS EMPTY. A mission has two things to say at once — what it found,
 *   and what it needs from you — so they sit side by side on a wide screen and stack on a
 *   narrow one. The breakpoint is a CONTAINER query, because the usable width here depends
 *   on the sidebar and the Copilot rail, not on the window.
 *
 *   THE APPROVE BUTTON WAS 26px TALL, for the most consequential control in the product.
 *   The money and the date are now the largest things on the card, because they are what is
 *   being agreed to, and the three choices are three visibly different weights.
 */

/* --------------------------------------------------------------------- types -- */

interface EvidenceItem {
  source: string;
  provenance: "live" | "derived" | "seeded";
  ref: string;
  detail: string;
}

type ChapterKey = "understand" | "investigate" | "decide" | "authorise" | "execute" | "prove";

interface Step {
  seq: number;
  stepKey: string;
  title: string;
  kind: string;
  agentKey: string;
  chapter: ChapterKey;
  plain: string;
  flow: { from: string; did: string; to: string };
  question: string | null;
  status: string;
  evidence: EvidenceItem[] | null;
  narration: string | null;
  confidence: string | null;
  /**
   * The phases this step actually passed through. Optional and stays optional: it is served
   * by the mission engine, and a build without it must degrade to the three-box flow rather
   * than to an error. Read through `readPipeline`, which drops anything malformed.
   */
  pipeline?: PipelineStage[];
}

/**
 * A `fulfilment_action` row, exactly as the mission view returns it.
 *
 * The only place in the payload that carries a REAL Phase 1 document number and a server
 * verdict on whether the write survived a re-read. That is what makes the "what landed"
 * section below a receipt rather than a summary of intentions.
 */
interface MissionAction {
  targetDomain: string;
  actionType: string;
  title: string;
  status: string;
  executedAt: string | null;
  verified: boolean | null;
  resultRef: string | null;
  failureReason: string | null;
}

interface Candidate {
  key: string;
  name: string;
  completionDate: string;
  totalCost: number;
  marginPct: number;
  feasible: boolean;
  violations: string[];
  policyBreaches: string[];
  /** The engine's own one-line account of what this option actually is. May be absent. */
  description?: string;
}

interface Brief {
  recommendation: string;
  why: string;
  ifRejected: string;
  ifDelayed: string;
}

interface Mission {
  id: string;
  missionNo: string;
  soNo: string;
  customerName: string;
  status: string;
  objective: { orderQty: number } | null;
  promisedDate: string;
  autonomyTier: string;
  forecastDate: string | null;
  waitingReason: string | null;
  outcome: Record<string, number | string> | null;
  steps: Step[];
  actions?: MissionAction[];
  plan: { versionNo: number; candidates: Candidate[]; chosen: Candidate } | null;
  pendingApproval: { id: string; approvalNo: string; brief: Brief } | null;
}

interface Startable {
  id: string; soNo: string; customerName: string; grandTotal: string;
  mission: { id: string; no: string; status: string } | null;
}
interface Tier { tier: string; name: string; detail: string; expediteLimit: number }
interface Chapter { key: ChapterKey; name: string; lands: string }

type Decision = "approved" | "try_another" | "rejected";

/* ------------------------------------------------------------------- helpers -- */

const AGENT_TOKEN: Record<string, string> = {
  ONYX: "var(--dept-onyx)", HEXA: "var(--dept-hexa)", SPAR: "var(--dept-spar)",
  AXLE: "var(--dept-axle)", KILN: "var(--dept-kiln)", MICA: "var(--dept-mica)",
  RASP: "var(--dept-rasp)",
};

/** Who is speaking, said as a job rather than a codename. */
const AGENT_ROLE: Record<string, string> = {
  ONYX: "Coordinator", HEXA: "Checker", SPAR: "Stores & buying",
  AXLE: "Planning", KILN: "Shop floor", MICA: "Sales", RASP: "Finance",
};

/**
 * The evidence trail's three provenances, in the shared layer language.
 *
 * These words predate the Phase 1 / Phase 2 vocabulary and mean exactly the same three
 * things: `live` is a row out of the ERP, `derived` is something this layer worked out, and
 * `seeded` is a stand-in for a system that is not connected. Mapping them here rather than
 * inventing a fourth badge is what keeps one visual language across the whole screen.
 */
const EVIDENCE_LAYER: Record<EvidenceItem["provenance"], Layer> = {
  live: "phase1",
  derived: "phase2",
  seeded: "external",
};

/** Which Phase 1 desk an executed action landed on. Named for the modules people know. */
const DOMAIN_MODULE: Record<string, string> = {
  inventory: "Inventory · Stock",
  purchase: "Purchase · Orders",
  production: "Production · Work orders",
  sales: "Sales · Orders",
  quality: "Quality",
  accounts: "Accounts",
};

/**
 * The engine's score as a percentage a person can read: "49.13" → "49%".
 *
 * It was printed raw, and a bare `49.13` on a card is not a fact anybody can act on — two
 * decimal places on a confidence score imply a precision no rules engine has. Rounded, given
 * its unit, and labelled next to the Phase 2 chip so the reader knows whose opinion it is.
 */
function confidencePct(raw: string | null): string | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? `${Math.round(n)}% confident` : null;
}

/**
 * The denominator — and it is allowed to be unknown.
 *
 * `arcTotal` widens a SERVED total to cover a replanned mission that ran past it; handed no
 * served total it falls back to the highest step seen, which is how this screen came to
 * print "Step 8 of 8" on a thirteen-step arc. That is a confident lie on the most
 * trust-sensitive screen in the product. The arc's length lives in the mission engine and is
 * not on `GET /fulfilment/meta` today, so when the server has not stated one there is no
 * denominator and `stepCounter` says "Step 8". A missing fact is survivable; a plausible
 * wrong one is not.
 */
function servedTotal(metaTotal: number | null, steps: readonly { seq: number }[]): number | null {
  return metaTotal === null ? null : arcTotal(metaTotal, steps);
}

/* -------------------------------------------------------------------- screen -- */

export default function MissionControl(_props: ScreenProps) {
  const { user } = useSession();
  const [orders, setOrders] = useState<Startable[] | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  /** The arc length as the SERVER states it, or null. Never a literal — see `mission-arc.ts`. */
  const [metaTotal, setMetaTotal] = useState<number | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [mission, setMission] = useState<Mission | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [startTier, setStartTier] = useState("A3");
  /** Off by default: walking it is the point. On, it runs to the next gate by itself. */
  const [autoRun, setAutoRun] = useState(false);
  const [done, setDone] = useState(false);
  /**
   * Which step is on screen. Null means "the newest", which is the normal state and the one
   * a running mission keeps snapping back to. Set only by clicking a step in the list of
   * ones already agreed to.
   */
  const [viewSeq, setViewSeq] = useState<number | null>(null);
  const stopRef = useRef(false);
  /**
   * One decision, once. `busy` cannot enforce that on its own: React does not write state
   * until the next render, so two clicks landing in the same frame both read the old value
   * and both POST. A ref is written synchronously, which is the property this needs.
   */
  const decidingRef = useRef(false);
  /** The approve button, so a keyboard reaches the decision without hunting for it. */
  const approveRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([
        api.get<{ data: Startable[] }>("/fulfilment/startable"),
        api.get<{ data: { autonomyTiers: Tier[]; chapters: Chapter[] } }>("/fulfilment/meta"),
      ]);
      setOrders(o.data); setTiers(m.data.autonomyTiers); setChapters(m.data.chapters);
      // Same response, no second request: `parseMeta` picks the arc length out of it when the
      // service carries one and returns null when it does not.
      setMetaTotal(parseMeta(m.data).totalSteps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not reach the mission service");
      setOrders([]);
    }
    // The scenario list is a separate concern and a separate failure: an engine that cannot
    // stage scenarios still runs missions perfectly well, so this never touches `error`.
    setScenarios(await fetchScenarios());
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { stopRef.current = true; }, []);

  /**
   * Reopen the mission this tab was already on.
   *
   * The tour walks the person out of this screen and through eight modules, and the agent
   * bar's "See the summary" brings them back here at the end. Without this, "back here" was
   * the order picker: the mission state lived only in this component and died the moment it
   * unmounted, so the outcome — the act the whole arc builds to — was unreachable from the
   * button that offers it, and pressing the order again started a SECOND mission.
   *
   * A stale id is expected rather than exceptional: the demo reset deletes missions. It
   * fails quietly to the picker, which is the correct screen in that case anyway.
   */
  useEffect(() => {
    const id = resumableMissionId();
    if (!id) return;
    let live = true;
    void api
      .get<{ data: Mission }>(`/fulfilment/missions/${id}`)
      .then((r) => {
        if (!live) return;
        setMission(r.data);
        setSteps(r.data.steps ?? []);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  /**
   * Re-read the mission, and let the agent bar know.
   *
   * The bar in the shell holds the same mission and has no way of hearing about a step this
   * screen ran — it broadcasts only when a tour starts or ends. Telling it explicitly is
   * what stops the bar sitting a step behind the card, which is what used to lose the very
   * first navigation of the tour entirely.
   */
  const refresh = useCallback(async (id: string) => {
    const r = await api.get<{ data: Mission }>(`/fulfilment/missions/${id}`);
    setMission(r.data);
    // ONE source of truth for the step list. It used to be accumulated locally from each
    // advance response AND replaced wholesale on a decision, which meant two lists that had
    // to be kept in step by hand. The mission view already returns every step in order.
    setSteps(r.data.steps ?? []);
    refreshMissionTour();
    return r.data;
  }, []);

  /** Run exactly ONE step and stop. The person decides whether there is another. */
  const oneStep = useCallback(async (id: string): Promise<string> => {
    setThinking(true); setShowEvidence(false); setViewSeq(null);
    try {
      const r = await api.post<{ data: { step: Step | null; status: string } }>(
        `/fulfilment/missions/${id}/advance`,
      );
      const { step, status } = r.data;
      if (!step) setDone(true);
      await refresh(id);
      return status;
    } catch (e) {
      setError(e instanceof Error ? e.message : "that step did not finish");
      return "error";
    } finally { setThinking(false); }
  }, [refresh]);

  /**
   * Only used by the optional "run it for me" toggle. Stops at every gate.
   *
   * `autoRun` used to be set true by the button and never set back, so the button was dead
   * for the rest of the session after one press — the loop finished, the mission sat at a
   * gate, and the only way to get it back was a reload. It is now owned entirely by this
   * function: true while the loop is running, false the moment it is not, on every exit path
   * including a thrown one.
   */
  const runToGate = useCallback(async (id: string) => {
    stopRef.current = false;
    setAutoRun(true);
    try {
      for (let i = 0; i < 20; i++) {
        if (stopRef.current) break;
        const status = await oneStep(id);
        if (["awaiting_approval", "failed", "completed", "error"].includes(status)) break;
        await new Promise((r) => setTimeout(r, 700));
      }
    } finally {
      setAutoRun(false);
    }
  }, [oneStep]);

  const start = useCallback(async (salesOrderId: string) => {
    setError(null); setSteps([]); setDone(false); setViewSeq(null); setBusy(salesOrderId); stopRef.current = false;
    try {
      const r = await api.post<{ data: Mission }>("/fulfilment/missions", { salesOrderId, tier: startTier });
      setMission(r.data);
      setSteps(r.data.steps ?? []);
      setBusy(null);
      // Hand over to the agent bar in the shell. From here the person is walked through
      // Sales, Inventory, Planning, Purchase and Production — the actual modules — rather
      // than reading about them on this screen.
      beginMissionTour(r.data.id);
      await oneStep(r.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not start"); setBusy(null);
    }
  }, [startTier, oneStep]);

  /** Reopen the exact persisted mission advertised by the order picker. */
  const open = useCallback(async (missionId: string) => {
    setError(null);
    setSteps([]);
    setDone(false);
    setViewSeq(null);
    setBusy(`open:${missionId}`);
    stopRef.current = false;
    try {
      const r = await api.get<{ data: Mission }>(`/fulfilment/missions/${missionId}`);
      setMission(r.data);
      setSteps(r.data.steps ?? []);
      beginMissionTour(r.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not reopen the mission");
    } finally {
      setBusy(null);
    }
  }, []);

  /**
   * The order has just been taken, and a mission may already be running on it.
   *
   * `NewOrderForm` does the writing, so this only has to pick up what came back. It calls
   * `open` rather than `start`: the mission was opened server-side in the same request that
   * raised the order, and calling `start` again would be a second request for a mission that
   * already exists — harmless, because start is idempotent, but it would put a second
   * "starting" state on screen for a mission that was already running.
   *
   * A held order is the interesting case and is NOT an error: the credit gate is real, the
   * order genuinely exists in Sales, and there is genuinely no mission. Say both.
   */
  const onNewOrder = useCallback(async (result: NewOrderResult) => {
    setError(null);
    if (!result.mission) {
      setError(result.heldReason ?? `${result.order.soNo} was raised but no mission was opened.`);
      // The order is real even though the mission is not, so the list behind this has to
      // show it. Without the refresh the screen claims nothing happened.
      await load();
      return;
    }
    await load();
    await open(result.mission.id);
  }, [open, load]);

  /**
   * Start a named scenario instead of picking an order.
   *
   * The engine chooses the order and stages whatever condition the scenario is about, so the
   * only thing this has to get right is picking up the mission it produced. A scenario that
   * has already run some steps is refreshed rather than advanced; one that has not is given
   * its first step, exactly like a hand-started mission.
   */
  const runScenario = useCallback(async (key: string) => {
    setError(null); setSteps([]); setDone(false); setViewSeq(null); setBusy(`scenario:${key}`); stopRef.current = false;
    try {
      const id = await startScenario(key);
      if (!id) throw new Error("the scenario did not return a mission");
      beginMissionTour(id);
      const m = await refresh(id);
      setBusy(null);
      if ((m.steps ?? []).length === 0) await oneStep(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "that scenario could not be started");
      setBusy(null);
    }
  }, [refresh, oneStep]);

  const decide = useCallback(async (decision: Decision) => {
    if (!mission?.pendingApproval) return;
    // See `decidingRef`: this is the guard that makes a double-click one decision.
    if (decidingRef.current) return;
    decidingRef.current = true;
    setBusy("decide"); setError(null); setViewSeq(null);
    try {
      await api.post(`/fulfilment/approvals/${mission.pendingApproval.id}/decide`, {
        decision,
        note: note.trim() || (decision === "approved" ? "Approved." : decision === "try_another" ? "Find another way." : "Stopped."),
      });
      const m = await refresh(mission.id);
      if (decision !== "rejected") await oneStep(m.id);
      setNote(""); setNoteOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the decision was not recorded");
    } finally { decidingRef.current = false; setBusy(null); }
  }, [mission, note, refresh, oneStep]);

  /** Recover a technical step failure without throwing away the mission's proven work. */
  const retryFailed = useCallback(async () => {
    if (!mission) return;
    setBusy("retry");
    setError(null);
    setViewSeq(null);
    try {
      await api.post(`/fulfilment/missions/${mission.id}/retry`);
      await refresh(mission.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the failed action could not be retried");
    } finally {
      setBusy(null);
    }
  }, [mission, refresh]);

  /**
   * Put the keyboard on the decision the moment the mission parks at one.
   *
   * `preventScroll`, because the decision column is already in view on any screen wide
   * enough to show it and yanking the scroller is not an improvement. The dependency is the
   * approval's id rather than the object, so a poll that re-fetches the same approval does
   * not steal focus back from somebody typing in the note field.
   */
  const approvalId = mission?.pendingApproval?.id ?? null;
  useEffect(() => {
    if (approvalId) approveRef.current?.focus({ preventScroll: true });
  }, [approvalId]);

  /** Leave the mission — and take the agent bar with you. */
  const leave = useCallback(() => {
    // Without this, the bottom bar stayed pinned across every screen in the application
    // after the person had plainly finished with the mission — it only ever heard about a
    // tour ending from its own "leave" link, which is not the one most people press.
    forgetMission();
    setMission(null); setSteps([]); setViewSeq(null); setDone(false);
    void load();
  }, [load]);

  const reset = useCallback(async () => {
    setBusy("reset");
    try {
      await api.post("/fulfilment/demo/reset");
      forgetMission();
      setMission(null); setSteps([]); setViewSeq(null); setDone(false); setError(null);
      await load();
    } finally { setBusy(null); }
  }, [load]);

  /**
   * RUN THIS SAME ORDER AGAIN, FROM THE TOP.
   *
   * What a presenter actually needs between two people walking past the screen: the same
   * customer, the same quantity, the same decision, from step one. `reset` alone drops them
   * back on the order picker and makes them find the order again mid-demo, which is thirty
   * seconds of hunting in front of an audience.
   *
   * The order is re-found by `soNo` rather than held as an id, because the reset genuinely
   * deletes and re-seeds the demo world — the row that comes back is a NEW row with a new
   * uuid and the same business number. Matching on the number is the only thing that
   * survives the rebuild, and it is what a person would use to find it too.
   *
   * The tier is carried over so "suggest only" stays "suggest only" on the second run; a
   * demo that silently changed its own autonomy between takes would be the worst kind of
   * inconsistency to have to explain from the front of a room.
   */
  const restartSame = useCallback(async () => {
    if (!mission) return;
    const soNo = mission.soNo;
    const tier = mission.autonomyTier || startTier;
    setBusy("restart"); setError(null);
    try {
      await api.post("/fulfilment/demo/reset");
      forgetMission();
      setMission(null); setSteps([]); setViewSeq(null); setDone(false);
      const fresh = await api.get<{ data: Startable[] }>("/fulfilment/startable");
      const again = (fresh.data ?? []).find((o) => o.soNo === soNo);
      if (!again) {
        // Say so rather than starting a different order than the one on screen a moment ago.
        setError(`${soNo} is not available to run again. Pick an order below.`);
        await load();
        return;
      }
      setStartTier(tier);
      const r = await api.post<{ data: Mission }>("/fulfilment/missions", {
        salesOrderId: again.id, tier,
      });
      setMission(r.data);
      setSteps(r.data.steps ?? []);
      beginMissionTour(r.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not restart the demo");
      await load();
    } finally { setBusy(null); }
  }, [mission, startTier, load]);

  if (!orders && !error) return <Loading label="Reading your confirmed orders" />;

  /**
   * THE PRESENTER'S RESET, and it has to be on screen in BOTH states.
   *
   * It was first put inside the running-mission header only, which meant that the moment a
   * demo ended — precisely when somebody wants to run it again for the next person — the
   * control vanished, because the screen had fallen back to the order picker. A reset you
   * can only reach while you do not need it is not a reset.
   *
   * Inside a mission it wipes the world and re-runs THAT order. On the picker there is no
   * order to re-run, so it just puts the world back to its seeded state.
   */
  const restartButton = (
    <button
      type="button"
      onClick={() => { void (mission ? restartSame() : reset()); }}
      disabled={busy !== null}
      title={
        mission
          ? `Wipe the demo world and run ${mission.soNo} again from step one`
          : "Wipe every mission and put the demo world back to its seeded state"
      }
      className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-[12px] font-semibold disabled:opacity-50"
      style={{ borderColor: "var(--brand)", color: "var(--brand)", background: "var(--surface)" }}
    >
      <Icons.RotateCcw
        className={cn("h-4 w-4", (busy === "restart" || busy === "reset") && "animate-spin")}
        aria-hidden
      />
      {busy === "restart" || busy === "reset" ? "Restarting…" : "Restart demo"}
    </button>
  );

  /* --------------------------------------------------------------- pick an order */
  if (!mission) {
    const startable = orders ?? [];
    return (
      <div className="x-mission-shell mx-auto flex w-full max-w-[1240px] flex-col gap-5">
        {error ? <ErrorState error={error} onRetry={() => { void load(); }} /> : null}

        <header className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Give me an order. I will work out how to deliver it.
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
              I show you every step, in your own modules, and wait for you to agree before I do the next one.
            </p>
          </div>
          {restartButton}
        </header>

        {/* HOISTED OUT OF THE ORDER CARD, because it now governs two ways in and a copy in
            each would let the two disagree. Asked BEFORE anything is started, because it is
            the one setting that changes what happens next: how far the machine may go
            before it has to stop. */}
        <fieldset className="rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <legend className="px-1 text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
            However you start it — how much should I be allowed to do without asking?
          </legend>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-3">
            {tiers.map((t) => {
              const active = t.tier === startTier;
              return (
                <button key={t.tier} type="button" onClick={() => setStartTier(t.tier)} title={t.detail}
                  aria-pressed={active}
                  className="rounded-lg border px-2.5 py-1.5 text-left text-[11.5px]"
                  style={{ borderColor: active ? "var(--brand)" : "var(--border)", background: active ? "var(--brand-soft)" : "transparent" }}>
                  <span className="block font-semibold" style={{ color: active ? "var(--brand)" : "var(--text-primary)" }}>{t.name}</span>
                  <span className="mt-0.5 line-clamp-2 block leading-snug" style={{ color: "var(--text-muted)" }}>{t.detail}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="x-mission-grid">
          <div className="flex flex-col gap-3">
            <NewOrderForm tier={startTier} onStarted={(r) => { void onNewOrder(r); }} />

          {/* SECOND NOW, AND STILL WORTH HAVING. The nine scenarios used to sit above this as
              nine paragraphs of engineer prose, so the first thing a factory person met was
              a document rather than a choice. The real demonstration is somebody pointing at
              one of their OWN confirmed orders and pressing Start. */}
          <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Your confirmed orders
              </h2>
              <LayerChip layer="phase1" system="Sales · Orders" />
            </div>

            <ul className="mt-3 flex flex-col gap-1.5">
              {startable.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => void (o.mission ? open(o.mission.id) : start(o.id))}
                    disabled={busy === o.id || busy === `open:${o.mission?.id ?? ""}`}
                    className="flex w-full items-center justify-between gap-4 rounded-xl border px-3.5 py-2.5 text-left hover:border-[var(--brand)] disabled:opacity-50"
                    style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{o.customerName}</span>
                      <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {o.soNo} · {inr(o.grandTotal)}{o.mission ? ` · already started (${o.mission.status})` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold text-[var(--action-ink)]" style={{ background: "var(--action)" }}>
                      {busy === `open:${o.mission?.id ?? ""}` ? "Opening…" : busy === o.id ? "Starting…" : o.mission ? "Open" : "Start"}
                    </span>
                  </button>
                </li>
              ))}
              {startable.length === 0 ? (
                <li className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No confirmed orders are waiting. Nothing to run against.
                </li>
              ) : null}
            </ul>

            {startable.some((o) => o.mission) ? (
              <button type="button" onClick={() => void reset()} disabled={busy === "reset"}
                className="mt-3 text-[11px] underline" style={{ color: "var(--text-muted)" }}>
                {busy === "reset" ? "Clearing…" : "Clear every mission and start again"}
              </button>
            ) : null}
          </section>
          </div>

          {/* SECOND, AND PLAINLY SECOND. Nine titled rows a person can scan; the reasoning,
              the setup and the order each runs on are one click away, unchanged. */}
          <div className="flex flex-col gap-3">
            <ScenarioPicker
              scenarios={scenarios}
              busyKey={busy}
              onRun={(k) => void runScenario(k)}
            />

            {/* Where the layer sits, and on what. One line, one link — the argument that this
                is an intelligence layer rather than an ERP is worth making, and the shelf is
                the place it can be made without a single misleading badge. */}
            <Link href="/fulfilment/connectors"
              className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>
              What else can this sit on? See the connectors
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ the walk */
  const latest = steps[steps.length - 1] ?? null;
  const current = (viewSeq !== null ? steps.find((s) => s.seq === viewSeq) : null) ?? latest;
  const lookingBack = Boolean(current && latest && current.seq !== latest.seq);
  const total = servedTotal(metaTotal, steps);
  const waiting = Boolean(mission.pendingApproval);
  const finished = mission.status === "completed" || mission.status === "failed";
  const stages = readPipeline(current);
  const landed = (mission.actions ?? []).filter((a) => a.executedAt || a.resultRef);
  const chapterAt = chapters.findIndex((c) => c.key === current?.chapter);
  const chapterNow = chapterAt >= 0 ? chapters[chapterAt] : null;
  const confidence = confidencePct(current?.confidence ?? null);

  return (
    <div className="x-mission-shell mx-auto flex w-full max-w-[1400px] flex-col gap-3">
      {error ? <ErrorState error={error} onRetry={() => { void refresh(mission.id); }} /> : null}

      {/* -------- one line: whose promise, and the key to the colours -------- */}
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <h1 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {mission.customerName} · {mission.objective?.orderQty ?? "—"} units
        </h1>
        <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {mission.soNo} · promised {mission.promisedDate}
          {mission.forecastDate ? ` · on this plan it lands ${mission.forecastDate}` : ""}
        </p>
        {/* The presenter's control, and it sits at the top because that is where a person
            reaches when the previous run has ended and somebody new has walked up. */}
        <div className="ml-auto flex items-center gap-3">
          {restartButton}
          <button type="button" onClick={leave}
            className="text-[11.5px] underline" style={{ color: "var(--text-muted)" }}>Back</button>
        </div>
      </header>

      <div className="x-mission-grid">
        {/* ======================= WHAT HAPPENED ======================= */}
        <div className="flex min-w-0 flex-col gap-3">
          {/* The rail. Six acts, and ONLY THE ONE WE ARE IN IS NAMED. Printing all six as
              labels ran them into a single unreadable line — "Understand the promise Find
              out what is true Choose a way through…" — which is a worse answer to "where are
              we" than no answer. The other five keep their names on hover and to a screen
              reader, which is where a name that is not being read right now belongs. */}
          <div>
            <ol className="flex gap-1.5" aria-label="Progress through the mission">
              {chapters.map((c, i) => {
                const here = c.key === current?.chapter;
                const past = chapterAt >= 0 && i < chapterAt;
                return (
                  <li key={c.key} className="min-w-0 flex-1" title={`${i + 1}. ${c.name} — ${c.lands}`}
                    aria-current={here ? "step" : undefined}>
                    <div className="h-1.5 rounded-full transition-colors"
                      style={{ background: here ? "var(--brand)" : past ? "var(--good-fg)" : "var(--border)" }} />
                    <span className="sr-only">{c.name}{here ? " (here)" : past ? " (done)" : ""}</span>
                  </li>
                );
              })}
            </ol>
            {chapterNow ? (
              <p className="mt-1.5 text-[11.5px] leading-snug">
                <b style={{ color: "var(--brand)" }}>
                  Part {chapterAt + 1} of {chapters.length} · {chapterNow.name}
                </b>
                <span style={{ color: "var(--text-muted)" }}> — {chapterNow.lands}</span>
              </p>
            ) : null}
          </div>

          {/* The key to the two layers. Still always on — a person must never have to hunt
              for which numbers came out of their factory and which a machine worked out —
              but it sits in the narrative column now, beside the chips it explains, rather
              than taking a row of its own across the top. Every 26 pixels spent above the
              fold is 26 pixels the decision card loses at the bottom of an 800px screen,
              and the decision is what must never be cut off. */}
          <LayerLegend dense />

          {/* -------- THE CARD: one step, said once -------- */}
          {current ? (
            <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-on-accent)]"
                  style={{ background: AGENT_TOKEN[current.agentKey] ?? "var(--brand)" }}>
                  {AGENT_ROLE[current.agentKey] ?? current.agentKey}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {stepCounter(current.seq, total)}
                </span>
                {/* The engine's own score, rounded, given its unit, and labelled as the
                    engine's. Never "the model thinks" — there is no model here, and saying so
                    is the whole basis for trusting the rest of the card. */}
                {confidence ? <LayerChip layer="phase2" system={confidence} /> : null}
                {current.status === "failed" ? (
                  <span className="ml-auto text-xs font-semibold" style={{ color: "var(--bad-fg)" }}>stopped here</span>
                ) : null}
              </div>

              {lookingBack ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5"
                  style={{ background: "var(--surface-sunken)" }}>
                  <Icons.History className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} aria-hidden />
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Looking back at a step you already agreed to.
                  </span>
                  <button type="button" onClick={() => setViewSeq(null)}
                    className="ml-auto text-[11px] underline" style={{ color: "var(--brand)" }}>
                    Back to {stepCounter(latest?.seq ?? 0, total).toLowerCase()}
                  </button>
                </div>
              ) : null}

              {/* The one sentence that matters. Deliberately the biggest thing on the card. */}
              <p className="mt-2.5 text-[17px] leading-snug" style={{ color: "var(--text-primary)" }}>
                {current.plain}
              </p>

              {/* The pipeline when the engine sent one; the three boxes when it did not. Never
                  both — they answer the same question and two answers is clutter. */}
              {stages.length ? (
                <PipelineRail key={current.seq} stages={stages} className="mt-3" />
              ) : (
                <div className="mt-3 flex items-stretch gap-2">
                  <FlowBox label={current.flow.from} />
                  <Arrow />
                  <FlowBox label={current.flow.did} accent />
                  <Arrow />
                  <FlowBox label={current.flow.to} />
                </div>
              )}

              <button type="button" onClick={() => setShowEvidence((v) => !v)}
                aria-expanded={showEvidence}
                className="mt-3 flex items-center gap-1 text-xs underline" style={{ color: "var(--text-muted)" }}>
                <Icons.ChevronDown className={cn("h-3 w-3 transition-transform", showEvidence && "rotate-180")} aria-hidden />
                {showEvidence ? "Hide the detail" : "Show me where I looked"}
              </button>

              {showEvidence ? (
                <div className="mt-2 rounded-lg p-3" style={{ background: "var(--bg)" }}>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{current.narration}</p>
                  {Array.isArray(current.evidence) && current.evidence.length ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {current.evidence.map((e, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
                          <LayerChip layer={EVIDENCE_LAYER[e.provenance] ?? "phase2"} />
                          <span style={{ color: "var(--text-primary)" }}>{e.ref}</span>
                          <span style={{ color: "var(--text-muted)" }}>{e.detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {current.stepKey === "strategy" && mission.plan ? <Options plan={mission.plan} /> : null}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="rounded-2xl border p-5 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{thinking ? "Working…" : "Ready."}</p>
            </section>
          )}

          {/* -------- what actually landed in Phase 1 -------- */}
          {landed.length ? (
            <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  What landed in your ERP
                </h2>
                <LayerChip layer="phase1" className="ml-auto" />
              </div>
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Real documents, with their numbers. Open the module and you will find them there.
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {landed.map((a, i) => (
                  <li key={`${a.targetDomain}-${i}`} className="flex flex-wrap items-baseline gap-2 text-[11.5px]">
                    <span className="chip chip-grey">{DOMAIN_MODULE[a.targetDomain] ?? a.targetDomain}</span>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {a.resultRef ?? a.title}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>{a.title}</span>
                    {/* "It was written" and "we went back and found it" are different claims, and
                        only the second is worth anything. Never merged into one tick. */}
                    <span className={cn("chip ml-auto", a.failureReason ? "chip-bad" : a.verified === true ? "chip-ok" : a.verified === false ? "chip-warn" : "chip-grey")}>
                      {a.failureReason
                        ? "failed"
                        : a.verified === true
                          ? "re-read and confirmed"
                          : a.verified === false
                            ? "NOT confirmed on re-read"
                            : "not checked yet"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {mission.status === "failed" && !mission.outcome ? (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)" }}>
              {mission.waitingReason ?? "Stopped without finishing."}
            </p>
          ) : null}

          {/* -------- what has already been agreed -------- */}
          {steps.length > 1 ? (
            /* OPEN, NOT FOLDED AWAY.
             *
             * This was a <details> and it cost the screen its whole argument. Collapsed, the
             * narrative column held one card and then six hundred pixels of nothing, while the
             * question being asked on the right rested on findings the reader could not see
             * without going looking for them. "Check my work" is not an invitation you hide
             * behind a disclosure triangle.
             *
             * Open, the same column answers the question a person actually has in front of a
             * ₹3.4 lakh decision — how did it get here — and the dead space becomes the story.
             * Each line stays clickable, so any step still opens with its evidence in full. */
            <section className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border-subtle)" }}>
              <h3
                className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.11em]"
                style={{ color: "var(--text-muted)" }}
              >
                How it got here · {steps.length - 1} step{steps.length === 2 ? "" : "s"} you have already agreed to
              </h3>
              <ol className="flex flex-col gap-0.5">
                {/* The newest step is the headline card above; repeating it here printed the
                    same sentence twice on one screen, which is exactly the duplication this
                    layout set out to remove. The heading says "already agreed to" and now the
                    list means it. */}
                {steps.filter((s) => s.seq !== latest?.seq).map((s) => {
                  const shown = s.seq === current?.seq;
                  return (
                    <li key={s.seq}>
                      {/* Every step stays openable, with its evidence, its narration and its
                          pipeline. A screen whose argument is "check my work" cannot make the
                          work unreachable the moment the next step starts. */}
                      <button type="button" onClick={() => setViewSeq(s.seq === latest?.seq ? null : s.seq)}
                        className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-[var(--surface-sunken)]"
                        style={{ background: shown ? "var(--surface-sunken)" : "transparent" }}>
                        <Icons.Check className="h-3 w-3 shrink-0" style={{ color: "var(--good-fg)" }} aria-hidden />
                        {/* Who did it, so the Phase 1 / Phase 2 / person distinction the whole
                            product rests on is legible per line rather than only in the legend. */}
                        <span
                          className="shrink-0 font-mono text-[10px] uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {s.agentKey}
                        </span>
                        <span style={{ color: shown ? "var(--text-primary)" : "var(--text-secondary)" }}>{s.plain}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
        </div>

        {/* ======================= WHAT YOU DO NEXT =======================
            ONE column, always in the same place, holding whichever of the three things is
            true right now: the mission is waiting on a decision, it is waiting on a nudge,
            or it has finished. Sticky on a wide screen, so the question never scrolls away
            from the person being asked it. */}
        <div className={cn("x-decide-col flex flex-col gap-3", waiting && "is-urgent")}>
          {mission.pendingApproval ? (
            <ApprovalCard
              approvalNo={mission.pendingApproval.approvalNo}
              brief={mission.pendingApproval.brief}
              chosen={mission.plan?.chosen ?? null}
              promisedDate={mission.promisedDate}
              signer={user?.displayName ?? "signed-in user"}
              busy={busy === "decide"}
              note={note}
              noteOpen={noteOpen}
              onNote={setNote}
              onNoteOpen={() => setNoteOpen(true)}
              onDecide={(d) => void decide(d)}
              approveRef={approveRef}
            />
          ) : finished ? (
            <FinishedCard
              status={mission.status}
              outcome={mission.outcome}
              waitingReason={mission.waitingReason}
              retryable={mission.status === "failed" && latest?.stepKey !== "authorize"}
              busy={busy === "reset" || busy === "retry"}
              retrying={busy === "retry"}
              onRetry={() => void retryFailed()}
              onReset={() => void reset()}
            />
          ) : (
            <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.09em]" style={{ color: "var(--text-muted)" }}>
                Your turn
              </h2>
              <p className="mt-1.5 text-[13px] leading-snug" style={{ color: "var(--text-primary)" }}>
                {autoRun
                  ? "Running to the next point where it needs you."
                  : "Nothing happens until you press it."}
              </p>
              <button type="button" onClick={() => void oneStep(mission.id)} disabled={thinking || autoRun}
                className="mt-3 w-full rounded-xl px-4 py-3 text-[14px] font-bold text-[var(--action-ink)] disabled:opacity-50"
                style={{ background: "var(--action)" }}>
                {thinking ? "Working…" : "Looks right — carry on"}
              </button>
              {autoRun ? (
                <button type="button" onClick={() => { stopRef.current = true; }}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  Stop after this step
                </button>
              ) : (
                <button type="button" onClick={() => { void runToGate(mission.id); }} disabled={thinking}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  Run the rest for me — it will still stop to ask
                </button>
              )}
              {done ? (
                <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  There is nothing further to run on this mission.
                </p>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- fragments -- */

/**
 * THE DECISION. One card, one place, and everything needed to make it.
 *
 * WHAT IS BEING AGREED TO IS THE HEADLINE. The money and the date, from the chosen plan's own
 * fields rather than scraped out of a sentence, set in the largest type on the screen —
 * because "₹3,37,658, landing 2026-08-17" is the entire content of the agreement and
 * everything else on the card is supporting argument for it.
 *
 * THREE CHOICES, THREE WEIGHTS, and each says what it will cause:
 *
 *   Approve            filled, 52px, the only filled control here. Its consequence is the
 *                      engine's own description of the plan.
 *   Find another way   outlined. Keeps the order and asks for the next best plan.
 *   Stop               below a rule, quiet, small, and captioned with `ifRejected` — which
 *                      on a real mission reads "there is no feasible fallback". It is
 *                      deliberately the hardest of the three to press by accident.
 *
 * EVERY WORD OF THE ARGUMENT IS THE SERVER'S. `recommendation`, `why`, `ifRejected` and
 * `ifDelayed` are rendered as they arrive. Nothing on this card is written in the browser
 * except the labels on the controls themselves.
 */
function ApprovalCard({
  approvalNo, brief, chosen, promisedDate, signer, busy, note, noteOpen,
  onNote, onNoteOpen, onDecide, approveRef,
}: {
  approvalNo: string;
  brief: Brief;
  chosen: Candidate | null;
  promisedDate: string;
  signer: string;
  busy: boolean;
  note: string;
  noteOpen: boolean;
  onNote: (v: string) => void;
  onNoteOpen: () => void;
  onDecide: (d: Decision) => void;
  approveRef: React.RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  return (
    <section className="rounded-2xl border-2 p-4" aria-labelledby="x-decide-head"
      style={{ borderColor: "var(--warn-fg)", background: "var(--surface)" }}>
      {/* THE SYSTEM HAS STOPPED, said before anything else. A person walking up to this
          screen has to be able to tell in one glance that nothing is proceeding without
          them — a pulse and four words do that faster than a paragraph. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="x-wait-dot h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden
          style={{ background: "var(--warn-fill)" }} />
        <h2 id="x-decide-head" className="text-[12px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "var(--warn-fg)" }}>
          Stopped — waiting for you
        </h2>
        <span className="ml-auto text-[10.5px]" style={{ color: "var(--text-muted)" }}>{approvalNo}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
        <b style={{ color: "var(--text-secondary)" }}>If you wait</b> — {brief.ifDelayed}
      </p>

      {/* The agreement itself. Largest type on the page, because it is the thing being
          agreed to; every other number here is an argument about this one. */}
      <div className="mt-2.5 rounded-xl px-3.5 py-2.5" style={{ background: "var(--warn-bg)" }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.09em]" style={{ color: "var(--warn-fg)" }}>
          You are approving
        </p>
        {chosen ? (
          <>
            <p className="x-money mt-0.5 text-[28px] font-bold" style={{ color: "var(--text-primary)" }}>
              {inr(chosen.totalCost)}
            </p>
            <p className="x-money mt-1 text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
              landing {chosen.completionDate}
            </p>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
              {chosen.name} · promised {promisedDate} · margin {chosen.marginPct.toFixed(1)}%
            </p>
          </>
        ) : (
          // No plan on the payload: the recommendation sentence is then the only statement of
          // what is being agreed to, and it is shown whole rather than mined for a number.
          <p className="mt-1 text-[15px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
            {brief.recommendation}
          </p>
        )}
      </div>

      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.09em]" style={{ color: "var(--text-muted)" }}>
        Why this one
      </p>
      <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
        {brief.why}
      </p>

      {/* ---- the three choices ---- */}
      <button ref={approveRef} type="button" onClick={() => onDecide("approved")} disabled={busy}
        className="x-approve mt-2.5">
        {busy ? (
          <>
            <Icons.Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Recording your decision…
          </>
        ) : (
          <>
            <Icons.Check className="h-5 w-5" aria-hidden />
            Approve — go ahead
          </>
        )}
      </button>
      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
        {chosen?.description ?? brief.recommendation}
      </p>

      <button type="button" onClick={() => onDecide("try_another")} disabled={busy}
        className="x-decide-second mt-2.5">
        <Icons.Repeat className="h-3.5 w-3.5" aria-hidden />
        Find another way
      </button>
      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
        Keeps the order. Comes back with the next best plan.
      </p>

      {noteOpen ? (
        <input value={note} onChange={(e) => onNote(e.target.value)} disabled={busy}
          placeholder="Why? (kept against your name)"
          aria-label="Why? This note is kept against your name."
          className="mt-3 w-full rounded-lg border px-2.5 py-2 text-xs"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text-primary)" }} />
      ) : (
        <button type="button" onClick={onNoteOpen}
          className="mt-2.5 text-[11px] underline" style={{ color: "var(--text-muted)" }}>
          Add a note to this decision
        </button>
      )}

      {/* Below the rule, and nothing else is. A control that ends a customer commitment must
          not sit within a stray click of the one that approves it. */}
      <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--border-subtle)" }}>
        <button type="button" onClick={() => onDecide("rejected")} disabled={busy}
          className="x-decide-quiet">
          <Icons.OctagonX className="h-3.5 w-3.5" aria-hidden />
          Stop this mission
        </button>
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
          {brief.ifRejected}
        </p>
      </div>

      {/* A human decision, attributed. The note and the decision are written against the
          signed-in user by the API; saying whose name that is BEFORE the button is pressed is
          the difference between a signature and a click. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <LayerChip layer="human" system={signer} />
        <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
          recorded against your name
        </span>
      </div>
    </section>
  );
}

/** The end of the arc, in the same column every other answer appeared in. */
function FinishedCard({
  status, outcome, waitingReason, retryable, busy, retrying, onRetry, onReset,
}: {
  status: string;
  outcome: Mission["outcome"];
  waitingReason: string | null;
  retryable: boolean;
  busy: boolean;
  retrying: boolean;
  onRetry: () => void;
  onReset: () => void;
}): React.JSX.Element {
  const ok = status === "completed";
  return (
    <section className="rounded-2xl border p-4"
      style={{ borderColor: ok ? "var(--good-fg)" : "var(--bad-fg)", background: "var(--surface)" }}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {ok ? "Finished — every action was checked." : retryable ? "Action failed safely." : "Stopped."}
      </h2>
      {!ok && waitingReason ? (
        <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--text-secondary)" }}>{waitingReason}</p>
      ) : null}
      {outcome ? (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Fact label="Delivered" value={`${outcome.deliveredQty} / ${outcome.orderedQty}`} />
          <Fact label="Due" value={String(outcome.promisedDate)} note={`met ${outcome.actualDate}`} />
          <Fact label="Margin" value={`${Number(outcome.marginPct).toFixed(1)}%`} />
          <Fact label="Checked" value={`${outcome.actionsVerified} / ${outcome.actionsTotal}`} note="actions confirmed" />
        </dl>
      ) : null}
      {retryable ? (
        <button type="button" onClick={onRetry} disabled={busy}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-[var(--action-ink)] disabled:opacity-50"
          style={{ background: "var(--action)" }}>
          {retrying ? <Icons.Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icons.RotateCcw className="h-4 w-4" aria-hidden />}
          {retrying ? "Retrying safely…" : "Retry failed action"}
        </button>
      ) : null}
      <button type="button" onClick={onReset} disabled={busy}
        className="mt-3 text-xs underline" style={{ color: "var(--text-muted)" }}>
        {busy ? "Clearing…" : "Start again with another order"}
      </button>
    </section>
  );
}

function FlowBox({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg px-2 py-3 text-center text-[11px] leading-tight"
      style={{
        background: accent ? "var(--brand-soft)" : "var(--bg)",
        color: accent ? "var(--brand)" : "var(--text-secondary)",
        fontWeight: accent ? 600 : 400,
      }}>
      {label}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center" aria-hidden>
      <Icons.ArrowRight className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
    </div>
  );
}

/** The options it weighed, in one line each. "Why not the cheaper one" is always asked. */
function Options({ plan }: { plan: NonNullable<Mission["plan"]> }) {
  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>What I weighed up</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {plan.candidates.map((c) => {
          const chosen = c.key === plan.chosen?.key;
          const tone = chosen ? { bg: "var(--good-bg)", fg: "var(--good-fg)", label: "picked" }
            : !c.feasible ? { bg: "var(--bad-bg)", fg: "var(--bad-fg)", label: "can't" }
              : (c.policyBreaches ?? []).length ? { bg: "var(--warn-bg)", fg: "var(--warn-fg)", label: "needs you" }
                : { bg: "var(--info-bg)", fg: "var(--info-fg)", label: "could" };
          return (
            <li key={c.key} className="flex items-baseline gap-2 text-[11px]">
              <span className="shrink-0 rounded px-1.5 py-0.5 font-semibold"
                style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
              <span style={{ color: "var(--text-muted)" }}>
                <b style={{ color: "var(--text-primary)" }}>{c.name}</b>
                {c.feasible
                  ? ` — ready ${c.completionDate}, ${inr(c.totalCost)}${(c.policyBreaches ?? []).length ? `, ${c.policyBreaches.join("; ")}` : ""}`
                  : ` — ${c.violations.join("; ")}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{value}</dd>
      {note ? <dd className="text-[10px]" style={{ color: "var(--text-muted)" }}>{note}</dd> : null}
    </div>
  );
}
