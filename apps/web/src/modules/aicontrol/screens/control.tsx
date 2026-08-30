"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Circle,
  Eye,
  Gauge,
  Hand,
  LockKeyhole,
  PauseCircle,
  Play,
  Power,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  UserRoundCheck,
  Workflow,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ScreenProps } from "@spine/registry/manifest";
import { useAccess } from "@spine/access/permissions";
import { ErrorState, Loading } from "@spine/states";
import { cn } from "@spine/ui/cn";
import {
  aiControlApi,
  type AutonomyMode,
  type ControlCenter,
  type ControlNode,
  type ControlRun,
} from "../api";

const MANUAL_MODULES = [
  ["Sales", "/sales/orders"],
  ["Purchase", "/purchase/orders"],
  ["Inventory", "/inventory/stock"],
  ["Planning", "/planning/exceptions"],
  ["Production", "/production/orders"],
  ["Quality", "/quality/overview"],
  ["Accounts", "/accounts/vouchers"],
] as const;

const ACTIVE = new Set(["pending", "running", "waiting_step", "waiting_approval", "halted"]);

const STATUS: Record<
  string,
  { label: string; icon: LucideIcon; className: string }
> = {
  pending: { label: "Queued", icon: Circle, className: "text-[var(--text-muted)] bg-[var(--bg)]" },
  running: { label: "Working", icon: Activity, className: "text-[var(--brand)] bg-[var(--brand-soft)]" },
  waiting_step: { label: "Waiting for Proceed", icon: Hand, className: "text-[var(--warn-ink)] bg-[var(--warn-soft)]" },
  waiting_approval: { label: "Mandatory approval", icon: UserRoundCheck, className: "text-[var(--warn-ink)] bg-[var(--warn-soft)]" },
  halted: { label: "Stopped", icon: PauseCircle, className: "text-[var(--bad-ink)] bg-[var(--bad-soft)]" },
  succeeded: { label: "Completed", icon: CheckCircle2, className: "text-[var(--ok-ink)] bg-[var(--ok-soft)]" },
  completed: { label: "Completed", icon: CheckCircle2, className: "text-[var(--ok-ink)] bg-[var(--ok-soft)]" },
  skipped: { label: "Not required", icon: Circle, className: "text-[var(--text-muted)] bg-[var(--bg)]" },
  failed: { label: "Failed safely", icon: XCircle, className: "text-[var(--bad-ink)] bg-[var(--bad-soft)]" },
  cancelled: { label: "Cancelled", icon: XCircle, className: "text-[var(--bad-ink)] bg-[var(--bad-soft)]" },
};

function meta(status: string) {
  return STATUS[status] ?? STATUS.pending!;
}

function when(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function elapsed(from: string | null, to: string | null, now: number): string {
  if (!from) return "Not started";
  const seconds = Math.max(0, Math.floor(((to ? new Date(to).getTime() : now) - new Date(from).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function nodeExplanation(run: ControlRun, node: ControlNode, byId: Map<string, ControlNode>): string {
  if (run.status === "halted") return "Stopped by the global kill switch. The manual ERP remains available.";
  if (node.status === "running") {
    return node.capabilityKey
      ? `Reading or executing the registered ${node.capabilityKey.replaceAll(".", " ")} capability.`
      : `${node.agentKey ?? "ONYX"} is analysing the evidence received so far.`;
  }
  if (node.status === "waiting_approval") return "Waiting for an authorised person. An agent cannot approve this action for itself.";
  if (node.status === "failed") return node.errorMessage ?? "The step failed safely; later steps were not allowed to continue.";
  if (["succeeded", "skipped", "cancelled"].includes(node.status)) {
    return node.status === "succeeded" ? "Finished and recorded in the mission trace." : "No further work is being performed on this step.";
  }
  const pendingDependencies = node.dependsOn
    .map((id) => byId.get(id))
    .filter((item): item is ControlNode => item !== undefined)
    .filter((item) => !["succeeded", "skipped"].includes(item.status));
  if (pendingDependencies.length > 0) {
    return `Waiting for ${pendingDependencies.map((item) => item.nodeName).join(", ")}.`;
  }
  const waitingGate = run.stepGates.find(
    (gate) => gate.status === "pending" && gate.nodeIds.includes(node.nodeId),
  );
  if (waitingGate) return `Ready to run, but Step ${waitingGate.sequence} needs your Proceed click.`;
  return "Ready and queued for the next bounded execution wave.";
}

export default function AiControlScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const [state, setState] = useState<ControlCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [modeReason, setModeReason] = useState("Operator selected the appropriate supervision level for this shift.");
  const [killReason, setKillReason] = useState("Emergency manual takeover requested by the control-room operator.");
  const [proceedNote, setProceedNote] = useState("Reviewed the current evidence; proceed with the next bounded step.");
  const [killArmed, setKillArmed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (quiet = false): Promise<void> => {
    if (!quiet) setLoading(true);
    try {
      const next = await aiControlApi.state();
      setState(next);
      setError(null);
      setSelectedRunId((current) => {
        if (current && next.runs.some((run) => run.id === current)) return current;
        return next.runs.find((run) => ACTIVE.has(run.status))?.id ?? next.runs[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(true), 4_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [load]);

  const selectedRun = useMemo(
    () => state?.runs.find((run) => run.id === selectedRunId) ?? null,
    [selectedRunId, state],
  );
  const pendingGate = selectedRun?.stepGates.find((gate) => gate.status === "pending") ?? null;
  const stopped = state?.automation.status === "stopped";
  const mayOperate = can("agentos.run.operate");
  const mayKill = can("aiops.killswitch.operate");

  async function mutate(key: string, action: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await action();
      await load(true);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(null);
    }
  }

  async function chooseMode(mode: AutonomyMode): Promise<void> {
    if (!mayOperate || modeReason.trim().length < 5) return;
    await mutate(`mode:${mode}`, () => aiControlApi.setMode(mode, modeReason.trim()));
  }

  if (loading && !state) return <Loading label="Opening the AI Control Center…" />;

  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      {error ? <ErrorState error={error} onRetry={() => void load()} /> : null}

      <section
        className={cn(
          "relative overflow-hidden rounded-[22px] border p-5 shadow-[var(--shadow-lg)] lg:p-7",
          stopped
            ? "border-[var(--kill-line-hot)] bg-[var(--kill-bg-stopped)] text-white"
            : "border-[var(--kill-line)] bg-[linear-gradient(135deg,var(--kill-bg)_0%,var(--kill-bg-mid)_55%,var(--kill-bg-end)_100%)] text-white",
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-[var(--kill-orb)]/15 blur-3xl" aria-hidden />
        <div className="relative grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex items-start gap-4">
            <span className={cn("grid h-16 w-16 shrink-0 place-items-center rounded-[18px] border", stopped ? "border-white/25 bg-[var(--kill-mark-stopped)]" : "border-[var(--kill-line-hot)]/30 bg-[var(--kill-mark)]") }>
              <Power className="h-8 w-8" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--kill-eyebrow)]">Highest authority · tenant-wide</p>
              <h1 className="mt-1 text-[clamp(27px,4vw,44px)] font-black leading-none tracking-[-0.04em]">KILL SWITCH</h1>
              <p className="mt-3 max-w-[72ch] text-[12.5px] leading-5 text-white/72">
                {stopped
                  ? "All agent reasoning, automated missions and governed dispatch are stopped at the backend chokepoint. The manual ERP is still fully available."
                  : "Stops every ONYX agent and AI feature at the backend chokepoint. Running missions are halted safely; no browser-only toggle can bypass it."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[10.5px] font-bold">
                <span className={cn("rounded-full px-3 py-1.5", stopped ? "bg-white text-[var(--kill-ink)]" : "bg-[var(--kill-clear)]/15 text-[var(--kill-clear)]") }>
                  {stopped ? "AUTOMATION STOPPED" : "AUTOMATION ACTIVE"}
                </span>
                <span className="rounded-full bg-white/8 px-3 py-1.5 text-white/70">Manual ERP: available</span>
                {state?.automation.reason ? <span className="rounded-full bg-white/8 px-3 py-1.5 text-white/70">Reason: {state.automation.reason}</span> : null}
              </div>
            </div>
          </div>

          <div className="w-full rounded-[16px] border border-white/12 bg-black/20 p-4 xl:w-[360px]">
            {!stopped ? (
              <>
                <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/60" htmlFor="kill-reason">Reason recorded in audit</label>
                <textarea id="kill-reason" value={killReason} onChange={(event) => setKillReason(event.target.value)} rows={2} className="mt-2 w-full rounded-[10px] border border-white/15 bg-white/8 px-3 py-2 text-[11.5px] leading-4 text-white outline-none placeholder:text-white/35 focus:border-[var(--kill-line-hot)]" />
                <button
                  type="button"
                  disabled={!mayKill || busy !== null || killReason.trim().length < 5}
                  onClick={() => {
                    if (!killArmed) {
                      setKillArmed(true);
                      return;
                    }
                    void mutate("kill", () => aiControlApi.engageKillSwitch(killReason.trim())).then(() => setKillArmed(false));
                  }}
                  className={cn("mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[11px] px-4 text-[12px] font-black uppercase tracking-[0.08em] transition", killArmed ? "bg-[var(--kill-arm)] text-white shadow-[0_0_0_4px_color-mix(in_srgb,var(--kill-arm)_18%,transparent)]" : "bg-white text-[var(--kill-ink)] hover:bg-[var(--kill-ink-hover)]", "disabled:cursor-not-allowed disabled:opacity-45")}
                >
                  {busy === "kill" ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldAlert className="h-4 w-4" aria-hidden />}
                  {killArmed ? "Confirm: stop all AI" : "Arm kill switch"}
                </button>
                <p className="mt-2 text-center text-[9.5px] leading-4 text-white/45">Two deliberate clicks · permission required · audited</p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-bold text-white">Manual operating mode is active</p>
                <p className="mt-1 text-[10.5px] leading-4 text-white/58">Release removes the global block. Halted missions stay halted until you explicitly resume them.</p>
                <button type="button" disabled={!mayKill || busy !== null} onClick={() => void mutate("release", () => aiControlApi.releaseKillSwitch())} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-white px-4 text-[11.5px] font-extrabold text-[var(--kill-ink)] disabled:opacity-45">
                  {busy === "release" ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                  Release after safety review
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="card p-5 lg:p-6">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--ai-text)]">Agent permissions</p>
            <h2 className="mt-1 text-[20px] font-extrabold tracking-[-0.025em] text-[var(--text-primary)]">Choose how independently ONYX may work</h2>
            <p className="mt-1 max-w-[74ch] text-[11.5px] leading-5 text-[var(--text-secondary)]">Both modes keep mandatory financial, quality, compliance and authority approvals. The difference is whether routine bounded steps continue automatically.</p>
          </div>
          <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-[10px] font-bold text-[var(--brand)]">Current: {state?.policy.mode === "step_by_step" ? "Approve every step" : "Guarded autopilot"}</span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <ModeCard
            active={state?.policy.mode === "autonomous_guarded"}
            icon={Bot}
            title="Guarded autopilot"
            eyebrow="Full agent access"
            body="Agents investigate, coordinate and complete routine bounded work on their own. They stop only at mandatory human approvals, guardrail failures or low-confidence boundaries."
            bullets={["Automatic between mandatory gates", "Permissions still narrow every tool", "Kill switch always overrides"]}
            disabled={!mayOperate || stopped || busy !== null}
            busy={busy === "mode:autonomous_guarded"}
            onChoose={() => void chooseMode("autonomous_guarded")}
          />
          <ModeCard
            active={state?.policy.mode === "step_by_step"}
            icon={Hand}
            title="Approve every step"
            eyebrow="Human-led supervision"
            body="Before each execution wave, ONYX explains what is ready and waits. Nothing continues until an authorised person clicks Proceed."
            bullets={["A durable Proceed gate before every wave", "Separate from mandatory business approval", "Safe across restarts and refreshes"]}
            disabled={!mayOperate || stopped || busy !== null}
            busy={busy === "mode:step_by_step"}
            onChoose={() => void chooseMode("step_by_step")}
          />
        </div>
        <label htmlFor="mode-reason" className="mt-4 block text-[10px] font-bold text-[var(--text-muted)]">Reason recorded when the mode changes</label>
        <input id="mode-reason" value={modeReason} onChange={(event) => setModeReason(event.target.value)} className="mt-1.5 w-full rounded-[10px] border border-[var(--border-input)] bg-[var(--surface-data)] px-3 py-2 text-[11.5px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Live automation summary">
        <Metric icon={Activity} label="Active missions" value={state?.summary.activeRuns ?? 0} note="Not halted or complete" />
        <Metric icon={Bot} label="Agents working" value={state?.summary.workingAgents ?? 0} note="Executing right now" />
        <Metric icon={Hand} label="Waiting for Proceed" value={state?.summary.waitingForProceed ?? 0} note="Step-by-step gates" tone="wait" />
        <Metric icon={UserRoundCheck} label="Mandatory approvals" value={state?.summary.mandatoryApprovals ?? 0} note="Business authority needed" tone="wait" />
        <Metric icon={PauseCircle} label="Halted missions" value={state?.summary.haltedRuns ?? 0} note="Stopped safely" tone={state?.summary.haltedRuns ? "bad" : "normal"} />
      </section>

      {state && !stopped && state.summary.haltedRuns > 0 ? (
        <section className="flex flex-col justify-between gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--warn)_35%,var(--border-subtle))] bg-[var(--warn-soft)] p-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <TimerReset className="mt-0.5 h-5 w-5 text-[var(--warn-ink)]" aria-hidden />
            <div><p className="text-[12px] font-bold text-[var(--text-primary)]">{state.summary.haltedRuns} mission{state.summary.haltedRuns === 1 ? " remains" : "s remain"} halted</p><p className="mt-0.5 text-[10.5px] text-[var(--text-secondary)]">Releasing the kill switch never silently restarts work. Resume only after you have reviewed the reason for the stop.</p></div>
          </div>
          <button type="button" disabled={!mayOperate || busy !== null} onClick={() => void mutate("resume", () => aiControlApi.resumeHalted())} className="btn btn-primary btn-sm shrink-0"><Play className="h-3.5 w-3.5" aria-hidden />{busy === "resume" ? "Resuming…" : "Resume halted missions"}</button>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[var(--text-muted)]">Live workflows</p><p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Updated {when(state?.checkedAt)}</p></div>
            <button type="button" onClick={() => void load()} className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--text-muted)] hover:bg-[var(--bg)]" aria-label="Refresh workflows"><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden /></button>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {state?.runs.length ? state.runs.map((run) => {
              const status = meta(run.status);
              const StatusIcon = status.icon;
              return <button key={run.id} type="button" onClick={() => setSelectedRunId(run.id)} className={cn("mb-1 w-full rounded-[10px] border px-3 py-3 text-left transition", selectedRunId === run.id ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg)]")}>
                <div className="flex items-center justify-between gap-2"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-bold", status.className)}><StatusIcon className={cn("h-3 w-3", run.status === "running" && "animate-pulse")} aria-hidden />{status.label}</span><span className="text-[9px] tabular-nums text-[var(--text-muted)]">{elapsed(run.startedAt ?? run.createdAt, run.completedAt, now)}</span></div>
                <p className="mt-2 line-clamp-2 text-[11px] font-bold leading-4 text-[var(--text-primary)]">{run.goal}</p>
                <p className="mt-1 text-[9.5px] text-[var(--text-muted)]">{run.nodes.filter((node) => ["succeeded", "skipped"].includes(node.status)).length}/{run.nodes.length} steps complete</p>
              </button>;
            }) : <p className="px-3 py-8 text-center text-[11px] text-[var(--text-muted)]">No agent missions have run yet.</p>}
          </div>
        </div>

        <div className="card min-w-0 p-4 lg:p-5">
          {selectedRun ? <WorkflowDetail run={selectedRun} now={now} pendingGate={pendingGate} canProceed={mayOperate && !stopped} busy={busy} proceedNote={proceedNote} onProceedNote={setProceedNote} onProceed={(gateId) => void mutate(`proceed:${gateId}`, () => aiControlApi.proceed(gateId, proceedNote.trim()))} /> : <div className="grid min-h-[280px] place-items-center text-center"><div><Workflow className="mx-auto h-8 w-8 text-[var(--text-muted)]" aria-hidden /><p className="mt-3 text-[12px] font-bold text-[var(--text-primary)]">Select a workflow</p><p className="mt-1 text-[10.5px] text-[var(--text-muted)]">Its agents, waits and timings will appear here.</p></div></div>}
        </div>
      </section>

      <section className={cn("card p-5", stopped && "border-[color-mix(in_srgb,var(--bad)_28%,var(--border-subtle))]") }>
        <div className="flex items-start gap-3"><Gauge className="mt-0.5 h-5 w-5 text-[var(--brand)]" aria-hidden /><div><h2 className="text-[14px] font-extrabold text-[var(--text-primary)]">Manual ERP fallback</h2><p className="mt-1 text-[10.8px] leading-4 text-[var(--text-secondary)]">The kill switch stops the intelligence and automation layer—not the ERP. Authorised people can keep operating every business module manually.</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{MANUAL_MODULES.map(([label, href]) => <Link key={href} href={href} className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-[10.5px] font-bold text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]">{label}<ArrowRight className="h-3 w-3" aria-hidden /></Link>)}</div>
      </section>

      <section className="card p-5">
        <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 text-[var(--violet)]" aria-hidden /><div><h2 className="text-[14px] font-extrabold text-[var(--text-primary)]">Who is allowed to control the agents?</h2><p className="mt-1 text-[10.8px] leading-4 text-[var(--text-secondary)]">The screen can only draw controls the signed-in person holds. The API checks the same tenant-fenced permissions again before changing anything.</p></div></div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">{state?.permissions.map((permission) => <div key={permission.key} className="flex items-start justify-between gap-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-3"><div><code className="text-[9.5px] font-bold text-[var(--brand)]">{permission.key}</code><p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">{permission.purpose}</p></div><span className={cn("shrink-0 rounded-full px-2 py-1 text-[8.5px] font-extrabold uppercase", can(permission.key) ? "bg-[var(--ok-soft)] text-[var(--ok-ink)]" : "bg-[var(--bad-soft)] text-[var(--bad-ink)]")}>{can(permission.key) ? "Granted" : "Not granted"}</span></div>)}</div>
      </section>
    </div>
  );
}

function ModeCard({ active, icon: Icon, title, eyebrow, body, bullets, disabled, busy, onChoose }: { active: boolean; icon: LucideIcon; title: string; eyebrow: string; body: string; bullets: readonly string[]; disabled: boolean; busy: boolean; onChoose: () => void }): React.JSX.Element {
  return <article className={cn("rounded-[15px] border p-4 transition", active ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--brand)_10%,transparent)]" : "border-[var(--border-subtle)] bg-[var(--surface)]")}>
    <div className="flex items-start justify-between gap-3"><span className={cn("grid h-10 w-10 place-items-center rounded-[11px]", active ? "bg-[var(--brand)] text-white" : "bg-[var(--bg)] text-[var(--text-secondary)]")}><Icon className="h-5 w-5" aria-hidden /></span>{active ? <span className="rounded-full bg-[var(--brand)] px-2 py-1 text-[8.5px] font-black uppercase text-white">Active mode</span> : null}</div>
    <p className="mt-3 text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted)]">{eyebrow}</p><h3 className="mt-1 text-[15px] font-extrabold text-[var(--text-primary)]">{title}</h3><p className="mt-1.5 text-[10.8px] leading-[1.65] text-[var(--text-secondary)]">{body}</p>
    <ul className="mt-3 space-y-1.5">{bullets.map((bullet) => <li key={bullet} className="flex items-start gap-2 text-[9.8px] text-[var(--text-secondary)]"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[var(--ok)]" aria-hidden />{bullet}</li>)}</ul>
    <button type="button" disabled={disabled || active} onClick={onChoose} className={cn("mt-4 flex w-full items-center justify-center gap-2 rounded-[9px] border px-3 py-2 text-[10.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50", active ? "border-[var(--brand)] text-[var(--brand)]" : "border-[var(--border-input)] text-[var(--text-primary)] hover:border-[var(--brand)]")}>
      {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : active ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}{active ? "Currently selected" : `Use ${title}`}
    </button>
  </article>;
}

function Metric({ icon: Icon, label, value, note, tone = "normal" }: { icon: LucideIcon; label: string; value: number; note: string; tone?: "normal" | "wait" | "bad" }): React.JSX.Element {
  return <div className="card p-4"><div className="flex items-center justify-between"><span className={cn("grid h-8 w-8 place-items-center rounded-[9px]", tone === "bad" ? "bg-[var(--bad-soft)] text-[var(--bad-ink)]" : tone === "wait" ? "bg-[var(--warn-soft)] text-[var(--warn-ink)]" : "bg-[var(--brand-soft)] text-[var(--brand)]")}><Icon className="h-4 w-4" aria-hidden /></span><span className="text-[21px] font-black tabular-nums text-[var(--text-primary)]">{value}</span></div><p className="mt-3 text-[10.5px] font-bold text-[var(--text-primary)]">{label}</p><p className="mt-0.5 text-[9.5px] text-[var(--text-muted)]">{note}</p></div>;
}

function WorkflowDetail({ run, now, pendingGate, canProceed, busy, proceedNote, onProceedNote, onProceed }: { run: ControlRun; now: number; pendingGate: ControlRun["stepGates"][number] | null; canProceed: boolean; busy: string | null; proceedNote: string; onProceedNote: (value: string) => void; onProceed: (gateId: string) => void }): React.JSX.Element {
  const runStatus = meta(run.status); const RunIcon = runStatus.icon;
  const byId = new Map(run.nodes.map((node) => [node.nodeId, node]));
  return <div>
    <div className="flex flex-col justify-between gap-3 border-b border-[var(--border-subtle)] pb-4 md:flex-row md:items-start"><div><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold", runStatus.className)}><RunIcon className={cn("h-3 w-3", run.status === "running" && "animate-pulse")} aria-hidden />{runStatus.label}</span><h2 className="mt-2 max-w-[70ch] text-[15px] font-extrabold leading-5 text-[var(--text-primary)]">{run.goal}</h2><p className="mt-1 text-[9.5px] text-[var(--text-muted)]">Started {when(run.startedAt ?? run.createdAt)} · elapsed {elapsed(run.startedAt ?? run.createdAt, run.completedAt, now)}</p></div><Link href="/agentos/command" className="btn btn-ghost btn-sm shrink-0"><Eye className="h-3.5 w-3.5" aria-hidden />Full mission evidence</Link></div>
    {pendingGate ? <div className="mt-4 rounded-[13px] border border-[color-mix(in_srgb,var(--warn)_42%,var(--border-subtle))] bg-[var(--warn-soft)] p-4"><div className="flex items-start gap-3"><Hand className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn-ink)]" aria-hidden /><div><p className="text-[12px] font-extrabold text-[var(--text-primary)]">Step {pendingGate.sequence} is ready and waiting for you</p><p className="mt-1 text-[10.5px] leading-4 text-[var(--text-secondary)]">Next: {pendingGate.nodeIds.map((id) => byId.get(id)?.nodeName ?? id).join(", ")}. Clicking Proceed authorises only this bounded wave—not the entire mission and not any later mandatory approval.</p></div></div><div className="mt-3 flex flex-col gap-2 md:flex-row"><input value={proceedNote} onChange={(event) => onProceedNote(event.target.value)} className="min-w-0 flex-1 rounded-[9px] border border-[var(--border-input)] bg-[var(--surface-data)] px-3 py-2 text-[10.5px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]" aria-label="Proceed note" /><button type="button" disabled={!canProceed || busy !== null || proceedNote.trim().length < 3} onClick={() => onProceed(pendingGate.id)} className="btn btn-primary btn-sm shrink-0"><Play className="h-3.5 w-3.5" aria-hidden />{busy === `proceed:${pendingGate.id}` ? "Proceeding…" : "Proceed with this step"}</button></div></div> : null}
    {run.approvals.some((approval) => approval.status === "pending") ? <div className="mt-4 flex items-start justify-between gap-3 rounded-[12px] border border-[color-mix(in_srgb,var(--violet)_30%,var(--border-subtle))] bg-[var(--violet-soft)] p-4"><div className="flex items-start gap-3"><UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--violet)]" aria-hidden /><div><p className="text-[11px] font-bold text-[var(--text-primary)]">Mandatory business approval required</p><p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">This is separate from a Proceed gate and cannot be removed by choosing guarded autopilot.</p></div></div><Link href="/agentos/approvals" className="btn btn-ghost btn-sm shrink-0">Review approval<ArrowRight className="h-3 w-3" aria-hidden /></Link></div> : null}
    <div className="mt-5 flex items-center justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[var(--text-muted)]">Execution path</p><p className="mt-0.5 text-[9.5px] text-[var(--text-secondary)]">Operational trace only—never hidden chain-of-thought.</p></div><span className="text-[9.5px] tabular-nums text-[var(--text-muted)]">{run.nodes.filter((node) => ["succeeded", "skipped"].includes(node.status)).length}/{run.nodes.length} complete</span></div>
    <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">{run.nodes.map((node, index) => { const status = meta(node.status); const Icon = status.icon; return <article key={node.id} className={cn("relative rounded-[11px] border p-3", node.status === "running" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : node.status === "failed" ? "border-[color-mix(in_srgb,var(--bad)_35%,var(--border-subtle))] bg-[var(--bad-soft)]" : "border-[var(--border-subtle)] bg-[var(--surface)]")}><div className="flex items-start justify-between gap-2"><span className="text-[8.5px] font-black tabular-nums text-[var(--text-muted)]">{String(index + 1).padStart(2, "0")}</span><span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold", status.className)}><Icon className={cn("h-2.5 w-2.5", node.status === "running" && "animate-spin")} aria-hidden />{status.label}</span></div><p className="mt-2 text-[10.8px] font-bold leading-4 text-[var(--text-primary)]">{node.nodeName}</p><p className="mt-0.5 text-[9px] font-semibold text-[var(--ai-text)]">{node.agentKey ?? (node.nodeKind === "approval" ? "Human authority" : "ONYX runtime")}</p><p className="mt-2 text-[9.4px] leading-4 text-[var(--text-secondary)]">{nodeExplanation(run, node, byId)}</p><div className="mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-[8.5px] text-[var(--text-muted)]"><span>{node.nodeKind.replaceAll("_", " ")}</span><span className="tabular-nums">{elapsed(node.startedAt, node.completedAt, now)}</span></div></article>; })}</div>
    {run.latestEvent ? <div className="mt-4 flex items-center gap-2 rounded-[9px] bg-[var(--bg)] px-3 py-2 text-[9.5px] text-[var(--text-secondary)]"><Route className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden /><b className="text-[var(--text-primary)]">Latest event:</b> {run.latestEvent.eventType.replaceAll(".", " ")}<span className="ml-auto tabular-nums text-[var(--text-muted)]">{when(run.latestEvent.createdAt)}</span></div> : null}
  </div>;
}
