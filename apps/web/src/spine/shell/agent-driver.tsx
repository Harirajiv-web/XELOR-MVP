"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import { api } from "../api/client";
import { AppError } from "../api/errors";
import { announceApplicationDataChanged } from "../data/use-query";
import { arcTotal, loadMissionMeta, stepCounter } from "../ui/mission-arc";

/**
 * THE AGENT, DRIVING YOUR ACTUAL ERP.
 *
 * A compact decision box centred over the live screen while a mission is running. It says
 * what ONYX concluded, why, and exactly where the result belongs in the application. The
 * live module stays visible around it, so an investor can connect the explanation to the
 * system being changed without reading a second technical panel.
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
 * Mission Control's own route — the one screen this bar must NOT draw itself on.
 *
 * The bar exists to follow the mission onto the OTHER modules: Sales, Engineering,
 * Inventory, Planning, Purchase, Production. On those screens it is the only surface that
 * knows a mission is running, and it earns every pixel.
 *
 * On Mission Control it earned none. Measured on a live screen, the bar repeated — directly
 * underneath the identical content — the step sentence, the pipeline strip, the
 * recommendation and a SECOND set of decision buttons, so a person deciding on ₹3,37,658 was
 * reading the brief in the page and clicking the buttons in the bar. Mission Control owns
 * the full presentation of its own mission; the bar owns the away-from-home case. Splitting
 * it that way is what removed the duplication, and removing the duplication was most of the
 * work.
 *
 * NOTE THAT ONLY THE RENDER IS SUPPRESSED. Every hook above still runs — the poll, the
 * refresh listener and, critically, the navigation effect that walks the person out of this
 * screen and into the module where the next step belongs. Hiding the bar must not stop the
 * tour; it only stops the tour narrating itself twice.
 */
const MISSION_HOME = "/fulfilment/control";

/**
 * Fired by whoever advanced the mission, so this bar re-reads it.
 *
 * The bar does not own the mission — Mission Control runs steps too, and used to do so
 * silently. This event, plus the poll below, is what keeps the two from disagreeing.
 */
const REFRESH_EVENT = "xelor:mission-refresh";

/** Slow. The event above is what makes it prompt; this only catches what the event missed. */
const POLL_MS = 4_000;

/** Keep a movable decision card reachable rather than letting it disappear off-screen. */
const DIALOG_EDGE_GAP = 12;
const DIALOG_KEYBOARD_STEP = 24;

interface DialogOffset {
  x: number;
  y: number;
}

interface DialogDrag {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffset: DialogOffset;
}

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
  pendingApproval: {
    id: string;
    brief: {
      recommendation: string;
      why: string;
      ifRejected: string;
      applicationTargets?: Array<{ module: string; screen: string }>;
    };
  } | null;
}

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
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [screenRevealActive, setScreenRevealActive] = useState(false);
  const [dialogOffset, setDialogOffset] = useState<DialogOffset>({ x: 0, y: 0 });
  const [dialogDragging, setDialogDragging] = useState(false);
  const dialogPositioner = useRef<HTMLDivElement | null>(null);
  const dialogDrag = useRef<DialogDrag | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The mission length, served by the API rather than guessed by the presentation. */
  const [metaTotal, setMetaTotal] = useState<number | null>(null);

  // The workspace is a named View Transition surface inside an isolated stacking context.
  // A fixed child inside that context can still be painted under the browser's transition
  // snapshot (most visibly as sticky table cells crossing the card). Portalling the decision
  // layer to body gives it the same top-level stacking boundary as the application's modals.
  useEffect(() => { setPortalHost(document.body); }, []);

  const clampDialogOffset = useCallback((candidate: DialogOffset): DialogOffset => {
    const element = dialogPositioner.current;
    if (!element) return candidate;
    const rect = element.getBoundingClientRect();
    const maxX = Math.max(0, (window.innerWidth - rect.width) / 2 - DIALOG_EDGE_GAP);
    const maxY = Math.max(0, (window.innerHeight - rect.height) / 2 - DIALOG_EDGE_GAP);
    return {
      x: Math.round(Math.max(-maxX, Math.min(maxX, candidate.x))),
      y: Math.round(Math.max(-maxY, Math.min(maxY, candidate.y))),
    };
  }, []);

  const startDialogDrag = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dialogDrag.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: dialogOffset,
    };
    setDialogDragging(true);
  }, [dialogOffset]);

  const startDialogDragFromHeader = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, select, textarea")) return;
    startDialogDrag(event);
  }, [startDialogDrag]);

  const startDialogDragFromHandle = useCallback((event: React.PointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    startDialogDrag(event);
  }, [startDialogDrag]);

  const moveDialog = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    const drag = dialogDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setDialogOffset(clampDialogOffset({
      x: drag.startOffset.x + event.clientX - drag.startClientX,
      y: drag.startOffset.y + event.clientY - drag.startClientY,
    }));
  }, [clampDialogOffset]);

  const finishDialogDrag = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (dialogDrag.current?.pointerId !== event.pointerId) return;
    dialogDrag.current = null;
    setDialogDragging(false);
  }, []);

  const moveDialogWithKeyboard = useCallback((event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "Home") {
      event.preventDefault();
      setDialogOffset({ x: 0, y: 0 });
      return;
    }
    const step = event.shiftKey ? DIALOG_KEYBOARD_STEP * 2 : DIALOG_KEYBOARD_STEP;
    const delta = event.key === "ArrowLeft"
      ? { x: -step, y: 0 }
      : event.key === "ArrowRight"
        ? { x: step, y: 0 }
        : event.key === "ArrowUp"
          ? { x: 0, y: -step }
          : event.key === "ArrowDown"
            ? { x: 0, y: step }
            : null;
    if (!delta) return;
    event.preventDefault();
    setDialogOffset((current) => clampDialogOffset({
      x: current.x + delta.x,
      y: current.y + delta.y,
    }));
  }, [clampDialogOffset]);

  /**
   * Get the explanation out of the way and point at the work underneath it.
   *
   * This is presentation state only: it does not advance, approve, retry or reload the
   * mission. The body attribute lets the active StagePanel receive the ring even if a route
   * changes while the card is away; CSS falls back to the whole workspace on screens that
   * do not have a StagePanel. Keeping the card mounted preserves every part of its state.
   *
   * It stays hidden until somebody asks for it back. A timer used to bring it back on its
   * own, which is wrong for the job this button does: a presenter hides the card to talk
   * over the live screen, and having it reappear mid-sentence interrupts exactly the
   * explanation it was moved out of the way for. The "Show Copilot" control below is the
   * only way back, so the card returns when the person speaking decides it should.
   */
  const hideCopilot = useCallback((): void => {
    // The button is about to become aria-hidden with the rest of the card. Do not leave
    // keyboard focus parked inside a hidden subtree while the real screen is available.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.setAttribute("data-xelor-agent-screen-reveal", "true");
    setScreenRevealActive(true);
  }, []);

  const showCopilot = useCallback((): void => {
    document.body.removeAttribute("data-xelor-agent-screen-reveal");
    setScreenRevealActive(false);
  }, []);

  useEffect(() => () => {
    document.body.removeAttribute("data-xelor-agent-screen-reveal");
  }, []);

  // A reset or explicit end must never leave a presentation ring behind on the workspace,
  // nor a "Show Copilot" button pointing at a mission that is no longer running.
  useEffect(() => {
    if (missionId || !screenRevealActive) return;
    document.body.removeAttribute("data-xelor-agent-screen-reveal");
    setScreenRevealActive(false);
  }, [missionId, screenRevealActive]);

  /**
   * Stand down while one of the application's own modals is open.
   *
   * The decision layer is z-120 and the modal layer is z-50, so without this the card wins
   * the stacking contest against a form the person deliberately opened. Measured on a live
   * mission: opening "New sales order" on /sales/orders put the card over 40% of the dialog,
   * and `elementFromPoint` at the dialog's centre returned the card — the middle of the form
   * was not merely hidden, it was unclickable.
   *
   * Raising the modal above the card would only swap which one is wrong. `aria-modal="true"`
   * already states the intent: while that dialog is open everything outside it is inert, and
   * a floating card that ignores that is an accessibility defect as well as a visual one. So
   * the card yields, and comes back when the dialog closes.
   */
  useEffect(() => {
    const look = () => setDialogOpen(Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));
    look();
    const observer = new MutationObserver(look);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
  const settled = mission?.status === "completed" || mission?.status === "failed" || mission?.status === "cancelled";
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

  // The served mission length is useful context, but it is deliberately the only progress
  // detail in the investor card. The six-act rail remains available in Mission Control.
  useEffect(() => {
    if (!missionId) return;
    let live = true;
    void loadMissionMeta().then((m) => {
      if (!live) return;
      setMetaTotal(m.totalSteps);
    });
    return () => { live = false; };
  }, [missionId]);

  const current = mission?.steps[mission.steps.length - 1] ?? null;

  // Re-clamp after a viewport or content-size change. The card can become taller when an
  // approval or failure appears, but its controls must remain reachable at every step.
  useEffect(() => {
    const keepOnScreen = (): void => {
      setDialogOffset((currentOffset) => {
        const next = clampDialogOffset(currentOffset);
        return next.x === currentOffset.x && next.y === currentOffset.y ? currentOffset : next;
      });
    };
    keepOnScreen();
    window.addEventListener("resize", keepOnScreen);
    const element = dialogPositioner.current;
    const observer = element && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(keepOnScreen)
      : null;
    if (element) observer?.observe(element);
    return () => {
      window.removeEventListener("resize", keepOnScreen);
      observer?.disconnect();
    };
  }, [clampDialogOffset, current?.seq, mission?.pendingApproval?.id, mission?.status]);

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
      announceApplicationDataChanged();
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
      announceApplicationDataChanged();
    } finally { setBusy(false); }
  }, [mission, missionId, load]);

  /**
   * Re-run the failed step without abandoning the guided flow.
   *
   * The API keeps the original failure in the event/audit trail and reuses the same
   * idempotency keys, so this is a recovery action rather than a second purchase or work
   * order. Keeping it here matters for the investor journey: a failure that can only be
   * recovered after leaving the centred Copilot looks like a dead demo even when the
   * backend recovery path is sound.
   */
  const retry = useCallback(async () => {
    if (!missionId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/fulfilment/missions/${missionId}/retry`);
      await load(missionId);
      announceApplicationDataChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "the failed action could not be retried");
    } finally {
      setBusy(false);
    }
  }, [missionId, load]);

  if (!missionId || !mission || !portalHost) return null;

  // Same fact the poll above uses, under the name the render already knew it by.
  const finished = settled;
  const waiting = Boolean(mission.pendingApproval);
  const monitoring = mission.status === "waiting" && !waiting;
  const failed = mission.status === "failed";
  const completed = mission.status === "completed";
  /**
   * The denominator, from the server or from the mission — never from this file.
   *
   * It was the literal `13`, three times over, and the arc's length lives in
   * `mission.service.ts`. See `spine/ui/mission-arc.ts` for what that costs the day somebody
   * adds a fourteenth step or a rejected plan pushes a mission past thirteen.
   */
  // The denominator, and it is allowed to be unknown. `arcTotal` widens a SERVED total to
  // cover a replanned mission; handed no served total it falls back to the highest step
  // seen, which renders as "Step 8 of 8" on a thirteen-step arc — a confident lie. When the
  // server has not stated a length there is no denominator and `stepCounter` says "Step 8".
  const total = metaTotal === null ? null : arcTotal(metaTotal, mission.steps);

  // See MISSION_HOME. The hooks above have all run; only the drawing stops here.
  if (pathname === MISSION_HOME) return null;
  // Likewise: the mission keeps running underneath an open dialog, it just stops drawing.
  if (dialogOpen) return null;

  const location = current?.where;
  const approvalTargets = mission.pendingApproval?.brief.applicationTargets ?? [];
  const locationLabel = waiting && approvalTargets.length > 0
    ? approvalTargets.map((target) => `${target.module} → ${target.screen}`).join(" · ")
    : location
      ? `${location.module} → ${location.screen}`
      : "Mission Control";
  const locationLead = waiting
    ? "If approved, this plan updates"
    : monitoring
      ? "Monitoring in"
      : failed
        ? "Action failed safely in"
        : completed
          ? "Outcome recorded in"
          : finished
            ? "Mission stopped in"
            : "Working in";
  const explanation = mission.pendingApproval?.brief.recommendation
    ?? current?.plain
    ?? "ONYX is preparing the next step.";
  const reasoning = mission.pendingApproval?.brief.why
    ?? (failed && mission.waitingReason
      ? mission.waitingReason
      : current
        ? `ONYX used ${current.flow.from} to ${current.flow.did.toLowerCase()}.`
        : "The mission is using the evidence already attached to this order.");

  return createPortal(
    <>
    <div
      className="x-agent-dialog-layer pointer-events-none fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
      data-screen-reveal={screenRevealActive ? "true" : "false"}
      aria-hidden={screenRevealActive}
    >
      <div
        ref={dialogPositioner}
        className="x-agent-dialog-positioner pointer-events-none w-full max-w-[580px]"
        style={{ transform: `translate3d(${dialogOffset.x}px, ${dialogOffset.y}px, 0)` }}
        data-dragging={dialogDragging ? "true" : "false"}
        data-testid="ai-copilot-positioner"
      >
        <aside
          className="x-agent-dialog-card pointer-events-auto w-full overflow-hidden rounded-[22px] border bg-[var(--surface)] shadow-[0_28px_80px_rgba(10,24,48,0.28)]"
          style={{ borderColor: failed ? "var(--bad-fg)" : waiting ? "var(--warn-fg)" : "var(--border)" }}
          aria-label="ONYX AI Copilot"
          aria-live="polite"
          data-testid="ai-copilot-box"
        >
        <header
          className="flex touch-none select-none items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-4"
          onPointerDown={startDialogDragFromHeader}
          onPointerMove={moveDialog}
          onPointerUp={finishDialogDrag}
          onPointerCancel={finishDialogDrag}
          onLostPointerCapture={() => { dialogDrag.current = null; setDialogDragging(false); }}
          data-testid="ai-copilot-drag-surface"
        >
          <button
            type="button"
            onPointerDown={startDialogDragFromHandle}
            onKeyDown={moveDialogWithKeyboard}
            onDoubleClick={() => setDialogOffset({ x: 0, y: 0 })}
            className="x-agent-dialog-drag-handle grid h-9 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            aria-label="Move ONYX AI Copilot. Use arrow keys to move and Home to centre."
            title="Drag to move · double-click or press Home to centre"
            data-testid="ai-copilot-drag-handle"
          >
            <Icons.GripVertical className="h-4 w-4" aria-hidden />
          </button>
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-[var(--text-on-brand)]"
            aria-hidden
          >
            <Icons.Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">ONYX AI Copilot</h2>
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--brand)]">
                {waiting
                  ? "Confirmation needed"
                  : monitoring
                    ? "Monitoring live work"
                    : failed
                      ? "Action failed"
                      : completed
                        ? "Verified outcome"
                        : finished
                          ? "Mission stopped"
                          : "Guided action"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
              {current ? `${stepCounter(current.seq, total)} · ` : ""}{mission.soNo} · {mission.customerName}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={hideCopilot}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft-2)] hover:text-[var(--brand)] disabled:cursor-progress disabled:opacity-50"
              aria-label="Hide Copilot and highlight this screen. It stays hidden until you press Show Copilot."
              title="Hide Copilot and show where ONYX is working"
              data-testid="ai-hide-and-highlight"
            >
              <Icons.Eye className="h-3.5 w-3.5" aria-hidden />
              Hide
            </button>
            <button
              type="button"
              onClick={() => { endMissionTour(); setMissionId(null); }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              aria-label="End the ONYX walkthrough"
            >
              <Icons.X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="px-5 py-5">
          <div
            className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--brand-soft)", background: "var(--brand-soft-2)" }}
            data-testid="ai-application-target"
          >
            <Icons.MapPin className="h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden />
            <p className="min-w-0 text-[12px] leading-snug text-[var(--text-secondary)]">
              <span className="font-medium">{locationLead}</span>{" "}
              <strong className="text-[var(--text-primary)]">
                {locationLabel}
              </strong>
            </p>
          </div>

          <section className="mt-4" aria-labelledby="ai-explanation-label">
            <p id="ai-explanation-label" className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Explanation
            </p>
            <p className="mt-1 text-[17px] font-semibold leading-snug text-[var(--text-primary)]" data-testid="ai-explanation">
              {explanation}
            </p>
          </section>

          <section className="mt-4 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-3" aria-labelledby="ai-reasoning-label">
            <div className="flex items-start gap-2.5">
              <Icons.BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden />
              <div>
                <p id="ai-reasoning-label" className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Reasoning
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]" data-testid="ai-reasoning">
                  {reasoning}
                </p>
              </div>
            </div>
          </section>

          {error ? (
            <p className="mt-3 rounded-lg bg-[var(--bad-bg)] px-3 py-2 text-xs text-[var(--bad-fg)]" role="alert">
              {error}
            </p>
          ) : null}

          {waiting && mission.pendingApproval ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void decide("approved")}
                disabled={busy}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--good-fill)] px-5 text-[15px] font-bold text-[var(--text-on-fill)] transition hover:brightness-110 disabled:cursor-progress disabled:opacity-60"
                data-testid="ai-confirm-action"
              >
                {busy ? <Icons.Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Icons.CircleCheckBig className="h-5 w-5" aria-hidden />}
                {busy ? "Recording confirmation…" : "Confirm this action"}
              </button>
              <div className="mt-3 flex items-center justify-center gap-4 text-[11px]">
                <button type="button" onClick={() => void decide("try_another")} disabled={busy}
                  className="font-semibold text-[var(--brand)] underline-offset-4 hover:underline disabled:opacity-50">
                  Try another plan
                </button>
                <button type="button" onClick={() => void decide("rejected")} disabled={busy}
                  className="text-[var(--text-muted)] underline-offset-4 hover:underline disabled:opacity-50">
                  Stop mission
                </button>
              </div>
            </div>
          ) : monitoring ? (
            <div className="mt-5 flex flex-col items-center gap-3 text-center" data-testid="ai-monitoring-state">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--brand-soft-2)] text-[var(--brand)]">
                <Icons.Radio className="h-5 w-5" aria-label="Monitoring" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">Monitoring is active</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
                  ONYX will continue when the connected system reports the next inventory, production, quality, dispatch, or invoice event.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { endMissionTour(); setMissionId(null); router.push("/fulfilment/control"); }}
                className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                Open Mission Control
              </button>
            </div>
          ) : failed ? (
            <div className="mt-5 flex flex-col items-center gap-3 text-center">
              <Icons.CircleAlert className="h-9 w-9 text-[var(--bad-fg)]" aria-label="Action failed" />
              <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                Nothing downstream was allowed to continue. The failed attempt remains in the audit trail.
              </p>
              <button
                type="button"
                onClick={() => void retry()}
                disabled={busy}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-[15px] font-bold text-[var(--text-on-brand)] transition hover:bg-[var(--brand-hover)] disabled:cursor-progress disabled:opacity-60"
                data-testid="ai-retry-action"
              >
                {busy ? <Icons.Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Icons.RotateCcw className="h-5 w-5" aria-hidden />}
                {busy ? "Retrying safely…" : "Retry failed action"}
              </button>
              <button
                type="button"
                onClick={() => { endMissionTour(); setMissionId(null); router.push("/fulfilment/control"); }}
                disabled={busy}
                className="text-[11px] font-semibold text-[var(--text-muted)] underline-offset-4 hover:underline disabled:opacity-50"
              >
                Open mission summary
              </button>
            </div>
          ) : finished ? (
            <div className="mt-5 flex flex-col items-center gap-3 text-center">
              {completed ? (
                <Icons.CircleCheckBig className="h-9 w-9 text-[var(--good-fg)]" aria-label="Confirmed" />
              ) : (
                <Icons.CircleX className="h-9 w-9 text-[var(--bad-fg)]" aria-label="Stopped" />
              )}
              <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                {completed ? "Every action was re-read and confirmed." : (mission.waitingReason ?? "The mission stopped safely.")}
              </p>
              <button type="button" onClick={() => { endMissionTour(); setMissionId(null); router.push("/fulfilment/control"); }}
                className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-brand)]">
                Open mission summary
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void advance()}
              disabled={busy}
              className="mt-5 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-[15px] font-bold text-[var(--text-on-brand)] transition hover:bg-[var(--brand-hover)] disabled:cursor-progress disabled:opacity-60"
              data-testid="ai-confirm-action"
            >
              {busy ? <Icons.Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Icons.CircleCheckBig className="h-5 w-5" aria-hidden />}
              {busy ? "ONYX is working…" : "Confirm and continue"}
            </button>
          )}
        </div>
        </aside>
      </div>
    </div>

    {/*
      The only way back. It is a SIBLING of the layer above rather than a child, because
      that layer carries aria-hidden while the card is away — a control nested inside it
      would be announced to nobody and unreachable by keyboard, which is precisely the
      person who most needs a way to undo a hide.

      Bottom-right, small, and one rung above the layer's z-index so the card cannot cover
      it on the way out. It sits clear of the highlighted work area rather than on top of
      the record everyone is being asked to look at.
    */}
    {screenRevealActive ? (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[121] flex justify-end p-4 sm:p-6">
        <button
          type="button"
          onClick={showCopilot}
          className="x-agent-show-button pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-bold text-[var(--text-on-brand)] shadow-[0_16px_40px_rgba(10,24,48,0.32)] transition hover:brightness-110"
          style={{ background: "var(--brand)", borderColor: "var(--brand)" }}
          aria-label="Show the ONYX AI Copilot again"
          title="Bring the Copilot explanation back"
          data-testid="ai-show-copilot"
        >
          <Icons.Sparkles className="h-4 w-4" aria-hidden />
          Show Copilot
        </button>
      </div>
    ) : null}
    </>,
    portalHost,
  );
}
