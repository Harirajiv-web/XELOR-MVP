"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import { api } from "../api/client";
import { AppError } from "../api/errors";
import { arcTotal, loadMissionMeta, stepCounter, type Chapter } from "../ui/mission-arc";
import { PipelineRail, readPipeline } from "../ui/pipeline";

/**
 * THE AGENT, DRIVING YOUR ACTUAL ERP.
 *
 * A bar pinned to the bottom of every screen while a mission is running. It says what it is
 * about to do, takes you to the module where that work belongs, and waits for you to press
 * a button before doing the next thing.
 *
 * WHY IT LIVES IN THE SHELL and not on the Mission Control screen. The whole point is that
 * the agent walks you THROUGH the product — Sales, then Inventory, then Planning, then
 * Purchase — and a component that lives on one screen is unmounted the moment it navigates
 * away from it. Rendered by `AppShell`, it survives every navigation, which is exactly the
 * property that turns a narrated demo into somebody watching their own factory be operated.
 *
 * The active mission is kept in `sessionStorage` rather than in React state for the same
 * reason: a full page load in the middle of the tour must not lose it. Session rather than
 * local, so it does not outlive the tab and greet somebody a week later with a half-finished
 * mission they have forgotten about.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: type into the screens' own form fields. Driving another
 * component's inputs from outside is the kind of thing that works in a rehearsal and breaks
 * the first time a screen is refactored, with no test able to catch it. The bar states the
 * values it is committing and the module screen shows the real records once the step has
 * run — which is honest, and survives the next person to touch either side.
 */

const KEY = "xelor.activeMission";

/**
 * Fired by whoever advanced the mission, so this bar re-reads it.
 *
 * The bar does not own the mission — Mission Control runs steps too, and used to do so
 * silently. This event, plus the poll below, is what keeps the two from disagreeing.
 */
const REFRESH_EVENT = "xelor:mission-refresh";

/** Slow. The event above is what makes it prompt; this only catches what the event missed. */
const POLL_MS = 4_000;

interface Step {
  seq: number;
  stepKey: string;
  title: string;
  agentKey: string;
  chapter: string;
  plain: string;
  flow: { from: string; did: string; to: string };
  status: string;
  where: { href: string; module: string; screen: string } | null;
}

interface Mission {
  id: string;
  soNo: string;
  customerName: string;
  status: string;
  waitingReason: string | null;
  steps: Step[];
  pendingApproval: { id: string; brief: { recommendation: string; why: string; ifRejected: string } } | null;
}

const AGENT_ROLE: Record<string, string> = {
  ONYX: "Coordinator", HEXA: "Checker", SPAR: "Stores & buying",
  AXLE: "Planning", KILN: "Shop floor", MICA: "Sales", RASP: "Finance",
};

/**
 * The mission the tour is on, and the mission this tab last looked at.
 *
 * Two keys, because they answer two different questions. `KEY` is "is a tour running" — the
 * bar is on screen exactly while it is set, and leaving the tour clears it. `LAST_KEY` is
 * "which mission was this tab working on", which outlives the tour by design: the bar's own
 * "See the summary" button ends the tour and sends the person to Mission Control, and
 * without a second key that screen has no idea which mission it is meant to be summarising.
 * It would show the order picker, and the outcome — the whole point of the last act — would
 * be unreachable from the button that promises it.
 */
const LAST_KEY = "xelor.lastMission";

/** Start the tour. Called by Mission Control when a mission is opened. */
export function beginMissionTour(missionId: string): void {
  sessionStorage.setItem(KEY, missionId);
  sessionStorage.setItem(LAST_KEY, missionId);
  window.dispatchEvent(new CustomEvent("xelor:mission-tour"));
}

/**
 * The mission Mission Control should reopen when somebody arrives on it, or null.
 *
 * Tolerates a browser that refuses session storage, and it is the CALLER's job to cope with
 * an id the server no longer knows — a demo reset deletes missions, and a screen that
 * exploded on a stale id would be a worse bug than the one this fixes.
 */
export function resumableMissionId(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? sessionStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Forget the mission entirely: the person has gone back to the list, or reset the demo. */
export function forgetMission(): void {
  try {
    sessionStorage.removeItem(LAST_KEY);
  } catch {
    // No storage, nothing to forget.
  }
  endMissionTour();
}

export function endMissionTour(): void {
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("xelor:mission-tour"));
}

/**
 * "I moved the mission on — go and look again."
 *
 * Called by Mission Control after every step and every decision. Without it the bar reloads
 * the mission exactly once, when the tour starts, and the very first navigation of the tour
 * is lost: `POST /fulfilment/missions` answers with `steps: []`, so the bar's first read sees
 * no current step, has no `where` to go to, and never navigates to Sales. Mission Control
 * then runs step 1 and the bar never hears about it. The person is left on Mission Control
 * being told the agent is in Sales.
 */
export function refreshMissionTour(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

export function AgentDriver(): React.JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const [missionId, setMissionId] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimised, setMinimised] = useState(false);
  /** The six acts and, when the service says so, how many steps a whole mission runs to. */
  const [chapters, setChapters] = useState<readonly Chapter[]>([]);
  const [metaTotal, setMetaTotal] = useState<number | null>(null);

  // Pick the mission up from session storage, and react when Mission Control starts one.
  useEffect(() => {
    const read = () => setMissionId(sessionStorage.getItem(KEY));
    read();
    window.addEventListener("xelor:mission-tour", read);
    return () => window.removeEventListener("xelor:mission-tour", read);
  }, []);

  const load = useCallback(async (id: string) => {
    try {
      const r = await api.get<{ data: Mission }>(`/fulfilment/missions/${id}`);
      setMission(r.data);
      setError(null);
    } catch (e) {
      // A mission that has been cleared away is not an error worth shouting about — the
      // presenter pressed reset. Leave the tour quietly rather than parking a red bar
      // across the bottom of every screen.
      //
      // ONLY on a definitive refusal, though. This used to end the tour on ANY failure,
      // which was survivable when the mission was read once and is not now that it is also
      // polled: one dropped request in a plant office would have torn the agent bar off the
      // screen mid-demo and left the person with no way back to it. A 404 or a 403 means the
      // mission is genuinely gone or genuinely not ours; a timeout means try again in four
      // seconds.
      const status = e instanceof AppError ? e.httpStatus : 0;
      if (status === 404 || status === 403) {
        forgetMission();
        setMissionId(null);
        setMission(null);
      }
    }
  }, []);

  useEffect(() => { if (missionId) void load(missionId); }, [missionId, load]);

  /**
   * Stay in step with whoever else is moving the mission.
   *
   * Two mechanisms because they fail differently. The EVENT is immediate and covers the
   * common case — Mission Control ran a step and said so. The POLL is the backstop for the
   * cases the event cannot reach: a step advanced in another tab, a mission that finished
   * its own waiting period server-side, or a browser that lost the event during a full page
   * load. It stops while the tab is hidden, and stops entirely once the mission has settled,
   * so a demo left open on a second monitor is not quietly asking every four seconds all
   * afternoon about a mission that finished before lunch. The event listener stays either
   * way — a demo reset still has to be able to clear the bar.
   */
  const settled = mission?.status === "completed" || mission?.status === "failed";
  useEffect(() => {
    if (!missionId) return;
    const again = (): void => { void load(missionId); };
    window.addEventListener(REFRESH_EVENT, again);
    const timer = settled
      ? null
      : window.setInterval(() => {
          if (document.visibilityState === "visible") again();
        }, POLL_MS);
    return () => {
      window.removeEventListener(REFRESH_EVENT, again);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [missionId, load, settled]);

  // The chapter vocabulary, once per tab and shared with the stage panel. Costs the progress
  // rail's labels if it fails, and nothing else.
  useEffect(() => {
    if (!missionId) return;
    let live = true;
    void loadMissionMeta().then((m) => {
      if (!live) return;
      setChapters(m.chapters);
      setMetaTotal(m.totalSteps);
    });
    return () => { live = false; };
  }, [missionId]);

  const current = mission?.steps[mission.steps.length - 1] ?? null;

  /** Take the person to where this step's work lives, if it lives anywhere. */
  const goTo = useCallback((step: Step | null) => {
    if (step?.where && pathname !== step.where.href) router.push(step.where.href);
  }, [pathname, router]);

  // Follow the mission as it moves from module to module.
  useEffect(() => { goTo(current); }, [current?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(async () => {
    if (!missionId) return;
    setBusy(true);
    try {
      await api.post(`/fulfilment/missions/${missionId}/advance`);
      await load(missionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "that step did not finish");
    } finally { setBusy(false); }
  }, [missionId, load]);

  const decide = useCallback(async (decision: "approved" | "try_another" | "rejected") => {
    if (!mission?.pendingApproval || !missionId) return;
    setBusy(true);
    try {
      await api.post(`/fulfilment/approvals/${mission.pendingApproval.id}/decide`, {
        decision, note: decision === "approved" ? "Approved on the floor." : "Not this way.",
      });
      await load(missionId);
      if (decision !== "rejected") await api.post(`/fulfilment/missions/${missionId}/advance`).catch(() => undefined);
      await load(missionId);
    } finally { setBusy(false); }
  }, [mission, missionId, load]);

  if (!missionId || !mission) return null;

  // Same fact the poll above uses, under the name the render already knew it by.
  const finished = settled;
  const waiting = Boolean(mission.pendingApproval);
  /**
   * The denominator, from the server or from the mission — never from this file.
   *
   * It was the literal `13`, three times over, and the arc's length lives in
   * `mission.service.ts`. See `spine/ui/mission-arc.ts` for what that costs the day somebody
   * adds a fourteenth step or a rejected plan pushes a mission past thirteen.
   */
  const total = arcTotal(metaTotal, mission.steps);
  const stages = readPipeline(current);

  if (minimised) {
    return (
      <button
        type="button"
        onClick={() => setMinimised(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-white shadow-lg"
        style={{ background: waiting ? "var(--warn-fill)" : "var(--brand)" }}
      >
        <Icons.Bot className="h-4 w-4" aria-hidden />
        {waiting ? "Needs you" : current ? stepCounter(current.seq, total) : "Mission running"}
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-50 border-t shadow-[0_-8px_24px_rgba(0,0,0,0.10)]"
      style={{ borderColor: waiting ? "var(--warn-fg)" : "var(--border)", background: "var(--surface)" }}
      aria-label="XELOR agent"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3">
        {/* who, where, how far */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: "var(--brand)" }}>
            <Icons.Bot className="h-3 w-3" aria-hidden /> XELOR
          </span>
          {current ? (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {stepCounter(current.seq, total)} · {AGENT_ROLE[current.agentKey] ?? current.agentKey}
              {current.where ? ` · in ${current.where.module} → ${current.where.screen}` : ""}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-3">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {mission.customerName} · {mission.soNo}
            </span>
            <button type="button" onClick={() => setMinimised(true)} aria-label="Minimise"
                    className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>hide</button>
            <button type="button" onClick={() => { endMissionTour(); setMissionId(null); }} aria-label="Leave the tour"
                    className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>leave</button>
          </span>
        </div>

        {/* Progress, drawn from what the server serves rather than from a count in this file.
            The six acts when the chapter list arrived — which is the better rail anyway,
            because "Find out what is true" means something and "segment 4 of 13" does not —
            and the served step total as a fallback when it did not. */}
        {chapters.length ? (
          <div className="flex gap-0.5" aria-hidden>
            {chapters.map((c) => {
              const reached = mission.steps.some((s) => s.chapter === c.key);
              const here = current?.chapter === c.key;
              return (
                <div key={c.key} className="h-1 flex-1 rounded-full" title={c.name}
                     style={{ background: here ? "var(--brand)" : reached ? "var(--good-fg)" : "var(--border)" }} />
              );
            })}
          </div>
        ) : total ? (
          <div className="flex gap-0.5" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full"
                   style={{ background: i < (current?.seq ?? 0) ? "var(--good-fg)" : "var(--border)" }} />
            ))}
          </div>
        ) : null}

        {/* what it just did, in plain words */}
        {current ? (
          <p className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
            {current.plain}
          </p>
        ) : null}

        {/* HOW it did it, phase by phase.
            This bar is the only surface that is present on every screen the tour visits —
            the stage panel is mounted on four module screens and the tour walks through
            eight. So the answer to "do not show me only a spinner and a result" has to live
            here: which system was read, what was found, whether a person was asked, what was
            written, and whether the write was confirmed afterwards. Renders nothing at all
            when the engine sent no pipeline, which leaves the bar exactly as it was. */}
        <PipelineRail key={current?.seq ?? 0} stages={stages} />

        {error ? (
          <p className="text-xs" style={{ color: "var(--bad-fg)" }}>{error}</p>
        ) : null}

        {/* the decision */}
        {waiting && mission.pendingApproval ? (
          <div className="rounded-lg p-3" style={{ background: "var(--warn-bg)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--warn-fg)" }}>
              {mission.pendingApproval.brief.recommendation}
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {mission.pendingApproval.brief.ifRejected}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void decide("approved")} disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--good-fill)" }}>Yes, do it</button>
              <button type="button" onClick={() => void decide("try_another")} disabled={busy}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--brand)", color: "var(--brand)" }}>Find another way</button>
              <button type="button" onClick={() => void decide("rejected")} disabled={busy}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--bad-fg)", color: "var(--bad-fg)" }}>Stop</button>
            </div>
          </div>
        ) : finished ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold"
                  style={{ color: mission.status === "completed" ? "var(--good-fg)" : "var(--bad-fg)" }}>
              {mission.status === "completed" ? "Finished — every action was checked." : (mission.waitingReason ?? "Stopped.")}
            </span>
            <button type="button" onClick={() => { endMissionTour(); setMissionId(null); router.push("/fulfilment/control"); }}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              See the summary
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void advance()} disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--brand)" }}>
              {busy ? "Working…" : "Looks right — carry on"}
            </button>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              nothing happens until you press it
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
