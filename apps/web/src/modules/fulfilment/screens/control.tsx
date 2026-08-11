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
import { ScenarioPicker } from "../scenario-picker";
import { fetchScenarios, startScenario, type Scenario } from "../scenarios";

/**
 * MISSION CONTROL — walked one step at a time, by a person.
 *
 * REWRITTEN AGAIN, and this time the change is to the INTERACTION rather than the density.
 *
 * The previous version streamed thirteen steps past you and stopped once, at the approval.
 * It was readable and it was still a thing you WATCHED. Watching is the wrong posture for
 * somebody who is being asked to trust a machine with a customer commitment: by the time
 * the stream reached the one gate, six decisions had already gone by and the only honest
 * answer to "do you agree with what it did?" was "I did not really follow it".
 *
 * So now it stops after EVERY step and asks. One card, one thing that happened, one button.
 * The person is walking the process rather than reviewing a transcript of it, and by the
 * time they reach the money question they have already agreed to the twelve findings the
 * money question rests on.
 *
 * Written for a plant supervisor, not for an engineer:
 *
 *   · The big sentence is `step.plain` — "You are short 776 bolts", never "RAW-BLT-M8 is
 *     short 775.51 of 1959.184". Same number, different reader.
 *   · Every card carries a three-box flow: what went in, what was done, what came out.
 *     Three, because a person can hold three while somebody is still talking to them.
 *   · The technical evidence is still there, behind "Show me where I looked". Nobody is
 *     being denied it; it simply is not the first thing on the card.
 *   · A progress rail across the top, so "where are we and how much is left" never has to
 *     be asked out loud.
 *
 * WHAT THE PHASE-2 PASS ADDED, and why each earns its space:
 *
 *   THE TWO LAYERS ARE NEVER DRAWN THE SAME WAY. Phase 1 is the ERP and the system of
 *   record; Phase 2 is this layer, sitting on top, reading it. A person who cannot tell "your
 *   stock ledger says 1,183" from "the engine worked out you are 776 short" will eventually
 *   act on the second thinking it was the first. `spine/ui/pipeline.tsx` holds the one
 *   visual language for that distinction and every surface here uses it — the legend, the
 *   pipeline, the evidence rows and the list of documents that landed.
 *
 *   THE PIPELINE REPLACES THE THREE BOXES WHEN THE SERVER SENDS ONE. The three-box flow says
 *   what went in and what came out. The pipeline says which system each phase touched, what
 *   it found, whether a person was asked and whether the write was confirmed afterwards —
 *   which is the difference between a claim and a receipt. Where a step has no pipeline the
 *   boxes are still drawn, so a build where that field has not landed yet looks exactly as
 *   it did before rather than showing an empty frame.
 *
 *   EVERY STEP STAYS OPENABLE. It used to be that only the newest step could be read; the
 *   twelve you had already agreed to collapsed to one line each and their evidence was gone.
 *   That is precisely backwards for a screen whose whole argument is "check my work".
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
  mission: { no: string; status: string } | null;
}
interface Tier { tier: string; name: string; detail: string; expediteLimit: number }
interface Chapter { key: ChapterKey; name: string; lands: string }

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

  const decide = useCallback(async (decision: "approved" | "rejected" | "try_another") => {
    if (!mission?.pendingApproval) return;
    setBusy("decide"); setError(null); setViewSeq(null);
    try {
      await api.post(`/fulfilment/approvals/${mission.pendingApproval.id}/decide`, {
        decision,
        note: note.trim() || (decision === "approved" ? "Approved." : decision === "try_another" ? "Find another way." : "Stopped."),
      });
      const m = await refresh(mission.id);
      if (decision !== "rejected") await oneStep(m.id);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "the decision was not recorded");
    } finally { setBusy(null); }
  }, [mission, note, refresh, oneStep]);

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

  if (!orders && !error) return <Loading label="Reading your confirmed orders" />;

  /* --------------------------------------------------------------- pick an order */
  if (!mission) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {error ? <ErrorState error={error} onRetry={() => { void load(); }} /> : null}

        <div className="text-center">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Pick an order. I will work out how to deliver it.
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm" style={{ color: "var(--text-muted)" }}>
            I will show you every step and wait for you to agree before I do the next one.
          </p>
        </div>

        <ScenarioPicker
          scenarios={scenarios}
          busyKey={busy}
          onRun={(k) => void runScenario(k)}
        />

        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
            How much should I be allowed to do without asking?
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {tiers.map((t) => {
              const active = t.tier === startTier;
              return (
                <button key={t.tier} type="button" onClick={() => setStartTier(t.tier)} title={t.detail}
                  className="rounded-lg border px-2.5 py-2 text-left text-xs"
                  style={{ borderColor: active ? "var(--brand)" : "var(--border)", background: active ? "var(--brand-soft)" : "transparent" }}>
                  <span className="block font-semibold" style={{ color: active ? "var(--brand)" : "var(--text-primary)" }}>{t.name}</span>
                  <span className="mt-0.5 block leading-snug" style={{ color: "var(--text-muted)" }}>{t.detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {(orders ?? []).map((o) => (
            <button key={o.id} type="button" onClick={() => void start(o.id)} disabled={busy === o.id}
              className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left hover:border-[var(--brand)] disabled:opacity-50"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{o.customerName}</span>
                <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                  {o.soNo} · {inr(o.grandTotal)}{o.mission ? ` · already started (${o.mission.status})` : ""}
                </span>
              </span>
              <span className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "var(--brand)" }}>
                {busy === o.id ? "Starting…" : o.mission ? "Open" : "Start"}
              </span>
            </button>
          ))}
        </div>

        {/* Where the layer sits, and on what. One line, one link — the argument that this is
            an intelligence layer rather than an ERP is worth making, and the shelf is the
            place it can be made without a single misleading badge. */}
        <Link href="/fulfilment/connectors"
          className="self-center text-xs underline" style={{ color: "var(--text-muted)" }}>
          What else can this sit on? See the connectors
        </Link>

        {(orders ?? []).some((o) => o.mission) ? (
          <button type="button" onClick={() => void reset()} disabled={busy === "reset"}
            className="self-center text-xs underline" style={{ color: "var(--text-muted)" }}>
            {busy === "reset" ? "Clearing…" : "Clear and start again"}
          </button>
        ) : null}
      </div>
    );
  }

  /* ------------------------------------------------------------------ the walk */
  const latest = steps[steps.length - 1] ?? null;
  const current = (viewSeq !== null ? steps.find((s) => s.seq === viewSeq) : null) ?? latest;
  const lookingBack = Boolean(current && latest && current.seq !== latest.seq);
  const total = arcTotal(metaTotal, steps);
  const waiting = Boolean(mission.pendingApproval);
  const finished = mission.status === "completed" || mission.status === "failed";
  const stages = readPipeline(current);
  const landed = (mission.actions ?? []).filter((a) => a.executedAt || a.resultRef);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {error ? <ErrorState error={error} onRetry={() => { void refresh(mission.id); }} /> : null}

      {/* -------- who this is for, and where we are -------- */}
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {mission.customerName} · {mission.objective?.orderQty ?? "—"} units
          </h1>
          <button type="button" onClick={leave}
            className="text-xs underline" style={{ color: "var(--text-muted)" }}>Back</button>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {mission.soNo} · due {mission.promisedDate}
          {mission.forecastDate ? ` · looking like ${mission.forecastDate}` : ""}
        </p>

        {/* The rail. Six blocks, so "how much is left" never has to be asked out loud. */}
        <ol className="mt-3 flex gap-1" aria-label="Progress">
          {chapters.map((c) => {
            const mine = steps.filter((s) => s.chapter === c.key);
            const here = current?.chapter === c.key;
            const past = mine.length > 0 && !here;
            return (
              <li key={c.key} className="flex-1" title={c.name}>
                <div className="h-1.5 rounded-full transition-colors"
                  style={{ background: here ? "var(--brand)" : past ? "var(--good-fg)" : "var(--border)" }} />
                <span className="mt-1 block truncate text-[10px]"
                  style={{ color: here ? "var(--brand)" : "var(--text-muted)" }}>{c.name}</span>
              </li>
            );
          })}
        </ol>
      </header>

      {/* The key to the two layers. Always on, never behind a link — it is the one thing a
          person must not have to hunt for while deciding whether to believe a number. */}
      <LayerLegend />

      {/* -------- THE CARD: one step, one decision -------- */}
      {current ? (
        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ background: AGENT_TOKEN[current.agentKey] ?? "var(--brand)" }}>
              {AGENT_ROLE[current.agentKey] ?? current.agentKey}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {stepCounter(current.seq, total)}
            </span>
            {/* The engine's own score, labelled as the engine's. Never "the model thinks" —
                there is no model here, and saying so is the whole basis for trusting the
                rest of the card. */}
            {current.confidence ? (
              <LayerChip layer="phase2" system={`confidence ${current.confidence}`} />
            ) : null}
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
          <p className="mt-3 text-lg leading-snug" style={{ color: "var(--text-primary)" }}>
            {current.plain}
          </p>

          {/* The pipeline when the engine sent one; the three boxes when it did not. Never
              both — they answer the same question and two answers is clutter. */}
          {stages.length ? (
            <PipelineRail key={current.seq} stages={stages} className="mt-4" />
          ) : (
            <div className="mt-4 flex items-stretch gap-2">
              <FlowBox label={current.flow.from} />
              <Arrow />
              <FlowBox label={current.flow.did} accent />
              <Arrow />
              <FlowBox label={current.flow.to} />
            </div>
          )}

          <button type="button" onClick={() => setShowEvidence((v) => !v)}
            className="mt-4 flex items-center gap-1 text-xs underline" style={{ color: "var(--text-muted)" }}>
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

          {/* -------- the decision -------- */}
          {!waiting && !finished ? (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--border-subtle)" }}>
              <button type="button" onClick={() => void oneStep(mission.id)} disabled={thinking || autoRun}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--brand)" }}>
                {thinking ? "Working…" : "Looks right — carry on"}
              </button>
              {autoRun ? (
                <button type="button" onClick={() => { stopRef.current = true; }}
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  Stop after this step
                </button>
              ) : (
                <button type="button"
                  onClick={() => { void runToGate(mission.id); }}
                  disabled={thinking}
                  className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  Run the rest for me
                </button>
              )}
              <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
                {autoRun ? "running to the next point where it needs you" : "nothing happens until you press it"}
              </span>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="rounded-2xl border p-5 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{thinking ? "Working…" : "Ready."}</p>
        </section>
      )}

      {/* -------- THE MOMENT: the one thing only a person can settle -------- */}
      {mission.pendingApproval ? (
        <section className="rounded-2xl border-2 p-5" style={{ borderColor: "var(--warn-fg)", background: "var(--surface)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <Icons.Hand className="h-4 w-4" style={{ color: "var(--warn-fg)" }} aria-hidden />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              This one is yours to decide
            </h2>
            {/* A human decision, attributed. The note and the decision are written against the
                signed-in user by the API; saying whose name that is BEFORE the button is
                pressed is the difference between a signature and a click. */}
            <LayerChip layer="human" system={user?.displayName ?? "signed-in user"} className="ml-auto" />
          </div>
          <p className="mt-2 text-base leading-snug" style={{ color: "var(--text-primary)" }}>
            {mission.pendingApproval.brief.recommendation}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {mission.pendingApproval.brief.why}
          </p>

          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <Consequence label="If you say no" value={mission.pendingApproval.brief.ifRejected} />
            <Consequence label="If you wait" value={mission.pendingApproval.brief.ifDelayed} />
          </dl>

          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Why? (optional — kept against your name)"
            className="mt-3 w-full rounded-lg border px-2.5 py-2 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text-primary)" }} />

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void decide("approved")} disabled={busy === "decide"}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--good-fg)" }}>Yes, do it</button>
            <button type="button" onClick={() => void decide("try_another")} disabled={busy === "decide"}
              title="Keep the order, drop this approach, come back with the next best."
              className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--brand)", color: "var(--brand)" }}>Find another way</button>
            <button type="button" onClick={() => void decide("rejected")} disabled={busy === "decide"}
              className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--bad-fg)", color: "var(--bad-fg)" }}>Stop</button>
          </div>
        </section>
      ) : null}

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

      {/* -------- the end -------- */}
      {mission.outcome ? (
        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--good-fg)", background: "var(--surface)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Finished</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Delivered" value={`${mission.outcome.deliveredQty} / ${mission.outcome.orderedQty}`} />
            <Fact label="Due" value={String(mission.outcome.promisedDate)} note={`met ${mission.outcome.actualDate}`} />
            <Fact label="Margin" value={`${Number(mission.outcome.marginPct).toFixed(1)}%`} />
            <Fact label="Checked" value={`${mission.outcome.actionsVerified} / ${mission.outcome.actionsTotal}`} note="actions confirmed" />
          </dl>
          <button type="button" onClick={() => void reset()} disabled={busy === "reset"}
            className="mt-4 text-xs underline" style={{ color: "var(--text-muted)" }}>
            {busy === "reset" ? "Clearing…" : "Start again with another order"}
          </button>
        </section>
      ) : null}

      {mission.status === "failed" && !mission.outcome ? (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)" }}>
          {mission.waitingReason ?? "Stopped without finishing."}
        </p>
      ) : null}

      {/* -------- what has already been agreed -------- */}
      {steps.length > 1 ? (
        <details className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-xs" style={{ color: "var(--text-muted)" }}>
            The {steps.length - 1} step{steps.length === 2 ? "" : "s"} you have already agreed to — open any of them again
          </summary>
          <ol className="mt-2 flex flex-col gap-0.5">
            {steps.map((s) => {
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
                    <span style={{ color: shown ? "var(--text-primary)" : "var(--text-secondary)" }}>{s.plain}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}

      {done && !finished ? (
        <p className="text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
          There is nothing further to run on this mission.
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- fragments -- */

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

function Consequence({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: "var(--bg)" }}>
      <dt className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="mt-0.5 text-xs leading-snug" style={{ color: "var(--text-primary)" }}>{value}</dd>
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
