"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import { api } from "../api/client";
import { cn } from "../ui/cn";

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

interface Step {
  seq: number;
  stepKey: string;
  title: string;
  agentKey: string;
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

/** Start the tour. Called by Mission Control when a mission is opened. */
export function beginMissionTour(missionId: string): void {
  sessionStorage.setItem(KEY, missionId);
  window.dispatchEvent(new CustomEvent("xelor:mission-tour"));
}

export function endMissionTour(): void {
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("xelor:mission-tour"));
}

export function AgentDriver(): React.JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const [missionId, setMissionId] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimised, setMinimised] = useState(false);

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
      endMissionTour();
      setMissionId(null);
      setMission(null);
    }
  }, []);

  useEffect(() => { if (missionId) void load(missionId); }, [missionId, load]);

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

  const finished = mission.status === "completed" || mission.status === "failed";
  const waiting = Boolean(mission.pendingApproval);

  if (minimised) {
    return (
      <button
        type="button"
        onClick={() => setMinimised(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-white shadow-lg"
        style={{ background: waiting ? "var(--warn-fg)" : "var(--brand)" }}
      >
        <Icons.Bot className="h-4 w-4" aria-hidden />
        {waiting ? "Needs you" : `Step ${current?.seq ?? 0} of 13`}
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
              Step {current.seq} of 13 · {AGENT_ROLE[current.agentKey] ?? current.agentKey}
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

        {/* progress */}
        <div className="flex gap-0.5" aria-hidden>
          {Array.from({ length: 13 }, (_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full"
                 style={{ background: i < (current?.seq ?? 0) ? "var(--good-fg)" : "var(--border)" }} />
          ))}
        </div>

        {/* what it just did, in plain words */}
        {current ? (
          <p className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
            {current.plain}
          </p>
        ) : null}

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
                style={{ background: "var(--good-fg)" }}>Yes, do it</button>
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
