"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";
import { api } from "../api/client";
import { cn } from "./cn";
import { arcTotal, loadMissionMeta, stepCounter } from "./mission-arc";
import { PipelineRail, readPipeline } from "./pipeline";
import {
  ACCENT_OF,
  DEPARTMENT_OF,
  ROLE_OF,
  STATUS_TONE,
  WRITES_INTO,
  nextStepFor,
  stageName,
  stageStatusFor,
  stampFor,
  systemsFor,
  type Chapter,
  type MissionView,
} from "./stage-panel.logic";

/**
 * THE STAGE PANEL — what the agent is doing, on the screen where it is doing it.
 *
 * The agent bar at the bottom of the page says what just happened in one sentence, which is
 * the right amount for somebody deciding whether to let it carry on. It is NOT enough for
 * the question this panel answers, which people kept asking out loud during the walkthrough
 * and could not answer from the screen: *whose* work is this, *which* system did it read,
 * *what* did it write, and *what happens next*. Those are twelve facts, and twelve facts in
 * a bottom bar would drown the one sentence that has to survive there.
 *
 * So they live here, on the module screen, next to the records they are about.
 *
 * THREE THINGS ARE DELIBERATE.
 *
 *   IT APPEARS ONLY WHERE THE WORK IS. The mission tells us which screen each step belongs
 *   to (`step.where.href`), and this renders nothing unless that is the screen you are on.
 *   A panel that followed you everywhere would be a second agent bar, and the standing
 *   request on this product is for LESS on screen, not more. Being absent is the normal
 *   state; when it appears, its appearance is itself the signal that this screen is where
 *   the mission currently is.
 *
 *   IT POLLS, RATHER THAN BEING PUSHED. The agent bar owns the mission and advances it, but
 *   it broadcasts only when a tour starts or ends — there is no per-step event to listen
 *   for. Polling every few seconds is the honest way to stay in step without reaching into
 *   another component's state, and it stops entirely when the tab is hidden so a demo left
 *   open on a second monitor is not quietly hammering the API.
 *
 *   IT NEVER INVENTS A FACT IT WAS NOT GIVEN. Every field below is either read straight off
 *   the mission payload or derived by a rule written down in this file. Where the API does
 *   not carry something — the wall-clock time a read step ran is the live case — the panel
 *   says which clock it is quoting rather than presenting a browser timestamp as a server
 *   one. See `stampFor`.
 */

/**
 * The same key `agent-driver.tsx` writes.
 *
 * Duplicated rather than imported, and that is a real cost worth naming: two files now
 * spell one string. The alternative is worse in a way that matters here — the driver keeps
 * this private and lives in `spine/shell/`, which is a different owner's file; adding an
 * export to it to save a constant would mean editing a file somebody else is holding. If
 * these ever drift the symptom is loud and immediate (the panel simply never appears), not
 * silent, which is the kind of duplication that stays survivable.
 */
const ACTIVE_MISSION_KEY = "xelor.activeMission";

/** Long enough not to be chatty, short enough that the panel is never a step behind. */
const POLL_MS = 4_000;

/* ------------------------------------------------------------------ the hook -- */

/**
 * The chapter vocabulary, fetched once per tab.
 *
 * `GET /fulfilment/meta` exists precisely so the client does not hard-code the six acts, and
 * the panel honours that. The cache, the in-flight de-duplication and the 403 handling now
 * live in `mission-arc.ts` rather than here: the agent bar needs the same answer, and two
 * module-scope caches of one endpoint is two requests and two places for the same fetch to
 * be got wrong. That file also serves the ARC LENGTH, which is what retired the literal
 * `13` this panel used to print under every step.
 */
/* ------------------------------------------------------------- the component -- */

export function StagePanel({
  /**
   * The route whose work this panel speaks for. Defaults to the screen it is rendered on,
   * which is right for every list screen; pass it explicitly from a detail route whose URL
   * carries an id the mission's `where.href` will never match.
   */
  href,
  className,
}: {
  href?: string;
  className?: string;
} = {}): React.JSX.Element | null {
  const pathname = usePathname();
  const here = href ?? pathname;

  const [missionId, setMissionId] = useState<string | null>(null);
  const [mission, setMission] = useState<MissionView | null>(null);
  const [chapters, setChapters] = useState<readonly Chapter[]>([]);
  const [metaTotal, setMetaTotal] = useState<number | null>(null);

  /**
   * When THIS browser first saw each step. Keyed by seq, kept in a ref so recording a
   * sighting never causes a render of its own — the render that shows the step is the same
   * one that stamps it.
   */
  const seenAt = useRef(new Map<number, number>());

  // Pick the mission up the way the agent bar does, and react when a tour starts or ends.
  useEffect(() => {
    const read = (): void => {
      try {
        setMissionId(window.sessionStorage.getItem(ACTIVE_MISSION_KEY));
      } catch {
        // A hardened browser can refuse session storage. No mission, no panel — which is
        // the same outcome as no tour running, and needs no explanation on screen.
        setMissionId(null);
      }
    };
    read();
    window.addEventListener("xelor:mission-tour", read);
    return () => window.removeEventListener("xelor:mission-tour", read);
  }, []);

  useEffect(() => {
    if (!missionId) return;
    let live = true;
    void loadMissionMeta().then((m) => {
      if (!live) return;
      setChapters(m.chapters);
      setMetaTotal(m.totalSteps);
    });
    return () => {
      live = false;
    };
  }, [missionId]);

  const load = useCallback(async (id: string, signal: AbortSignal): Promise<void> => {
    try {
      const r = await api.get<{ data: MissionView }>(`/fulfilment/missions/${id}`, { signal });
      if (!signal.aborted) setMission(r.data);
    } catch {
      // A mission cleared away by the demo reset, or a reader without permission to see it.
      // Neither is worth a red box on a stock list — the agent bar owns the tour and will
      // say so there. Here it just means there is nothing to draw.
      if (!signal.aborted) setMission(null);
    }
  }, []);

  useEffect(() => {
    if (!missionId) {
      setMission(null);
      return;
    }
    const controller = new AbortController();
    void load(missionId, controller.signal);

    const timer = window.setInterval(() => {
      // Nothing is watching a hidden tab, and a demo left open on a second screen should not
      // keep asking. The next visible tick catches up in one request.
      if (document.visibilityState === "visible") void load(missionId, controller.signal);
    }, POLL_MS);

    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [missionId, load]);

  /** The step the mission is on: the last one written. Same rule as the agent bar. */
  const step = mission?.steps[mission.steps.length - 1] ?? null;

  const action = useMemo(() => {
    if (!mission || !step) return null;
    const domain = WRITES_INTO[step.stepKey];
    if (!domain) return null;
    // `actions` is defaulted rather than trusted: this payload is typed by hand from the
    // service's return, not generated from it, and a panel that throws on a stock list
    // because one array arrived absent would be a far worse bug than a missing timestamp.
    return (mission.actions ?? []).find((a) => a.targetDomain === domain) ?? null;
  }, [mission, step]);

  // Stamp the sighting during render rather than in an effect: the panel is showing this
  // step NOW, and an effect would record a time a frame later for no benefit.
  if (step && !seenAt.current.has(step.seq)) seenAt.current.set(step.seq, Date.now());

  if (!mission || !step) return null;

  // THE WHOLE GATE. The mission is running, but its current work does not belong to this
  // screen — so this screen says nothing about it.
  if (!step.where || step.where.href !== here) return null;

  const status = stageStatusFor(mission, step);
  const tone = STATUS_TONE[status];
  const { source, destination, verb } = systemsFor(step);
  const stamp = stampFor(action, seenAt.current.get(step.seq) ?? null);
  const accent = ACCENT_OF[step.agentKey] ?? "var(--brand)";

  // Same reasoning as `actions` above — the three-box flow is the spine of four cells here,
  // and an older payload without it should cost a dash, not the screen.
  const flow = step.flow ?? { from: "—", did: step.title, to: "—" };

  /** What the step touched, in the shape "verb · what went in → what came out". */
  const dataLine = `${verb} · ${flow.from} → ${flow.to}`;

  /**
   * The result. An acting step's verification verdict outranks the flow's own summary,
   * because "committed ₹4,20,000" and "re-read and confirmed" are different claims and the
   * second is the one that makes the first worth believing.
   */
  const result = action
    ? action.failureReason ??
      (action.verified === true
        ? `${flow.to} · re-read and confirmed`
        : action.verified === false
          ? `${flow.to} · NOT confirmed on re-read`
          : flow.to)
    : flow.to;

  return (
    <section
      className={cn("card overflow-hidden", className)}
      aria-label="What the agent is doing on this screen"
    >
      {/* The header carries the four things somebody glancing at it needs: that this is the
          agent, which act it is in, how far through, and whether it is stuck. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border-subtle)] px-3 py-2">
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
          style={{ background: accent }}
          aria-hidden
        >
          <Bot className="h-2.5 w-2.5 text-white" />
        </span>
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{step.title}</span>
        <span className="text-[11px] text-[var(--text-muted)]">
          {stepCounter(step.seq, arcTotal(metaTotal, mission.steps))} · {mission.soNo}
        </span>
        <span className="flex-1" />
        <span
          className="chip shrink-0 uppercase"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {status}
        </span>
      </div>

      {/* Twelve facts in a grid rather than twelve sentences. Two columns on a phone, four on
          a desk — a label and its value stay together at every width. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5 md:grid-cols-4">
        <Fact label="Stage" value={stageName(step.chapter, chapters, mission.stage)} />
        <Fact label="Department" value={DEPARTMENT_OF[step.agentKey] ?? "—"} />
        <Fact
          label="Agent"
          value={`${step.agentKey} · ${ROLE_OF[step.agentKey] ?? "specialist"}`}
        />
        <Fact label={stamp.label} value={stamp.value} />

        <Fact label="Reads from" value={source} />
        <Fact label="Writes to" value={destination} />
        <Fact label="Action" value={flow.did} />
        <Fact label="Data" value={dataLine} wide />

        <Fact label="Result" value={result} wide />
        <Fact label="Next" value={nextStepFor(mission, step, chapters)} wide />
      </dl>

      {/* The same phase strip the agent bar draws, on the screen the work belongs to.
          The grid above answers "whose work, which system, what result"; this answers "in
          what order, and which of those phases has actually happened yet" — the difference
          between a summary written after the fact and something you can watch. Renders
          nothing when the engine sent no pipeline, which is the state every build was in
          before that field existed. */}
      <PipelineRail key={step.seq} stages={readPipeline(step)} className="mx-3 mb-3" />
    </section>
  );
}


/**
 * One label-and-value pair.
 *
 * The value never truncates. Every cell here is the answer to a question somebody asked out
 * loud, and an answer cut off at the ellipsis is not an answer — better to let a long
 * sentence take a second line than to hide the half that mattered.
 */
function Fact({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[11.5px] leading-[1.35] text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
  );
}
