"use client";

import { useState } from "react";
import * as Icons from "lucide-react";
import type { ScreenProps } from "@spine/registry/manifest";
import { useQuery } from "@spine/data/use-query";
import { useAccess } from "@spine/access/permissions";
import { ErrorState, Loading } from "@spine/states";
import { cn } from "@spine/ui/cn";
import { platformHealthApi, type PlatformHealthEnvelope } from "../api";

const CHECK_ICON: Readonly<Record<string, Icons.LucideIcon>> = {
  api: Icons.Server,
  database: Icons.Database,
  event_bus: Icons.MessagesSquare,
  web: Icons.MonitorCheck,
  ai_runtime: Icons.BrainCircuit,
};

function shownTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PlatformStatusScreen(
  _props: ScreenProps,
): React.JSX.Element {
  const { can } = useAccess();
  const query = useQuery<PlatformHealthEnvelope>(platformHealthApi.overviewPath);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>(null);

  const runNow = async (): Promise<void> => {
    setRunning(true);
    setRunError(null);
    try {
      await platformHealthApi.run();
      query.reload();
    } catch (error) {
      setRunError(error);
    } finally {
      setRunning(false);
    }
  };

  if (query.loading) return <Loading label="Loading private platform status…" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />;
  if (!query.data?.data) {
    return <ErrorState error={new Error("ACHILES returned no platform-health status.")} onRetry={query.reload} />;
  }

  const data = query.data.data;
  const latest = data.latest;
  const stale = data.freshness === "stale";
  const headline = !latest
    ? "Waiting for the first check"
    : stale
      ? "Last result is stale"
      : latest.overallStatus === "healthy"
        ? "XELOR is working"
        : latest.overallStatus === "degraded"
          ? "XELOR is working with a warning"
          : "XELOR needs attention";
  const headlineTone = !latest || stale
    ? "text-[var(--warn-ink)] bg-[var(--warn-soft)] border-[color-mix(in_srgb,var(--warn)_28%,var(--border-subtle))]"
    : latest.overallStatus === "healthy"
      ? "text-[var(--ok-ink)] bg-[var(--ok-soft)] border-[color-mix(in_srgb,var(--ok)_25%,var(--border-subtle))]"
      : latest.overallStatus === "degraded"
        ? "text-[var(--warn-ink)] bg-[var(--warn-soft)] border-[color-mix(in_srgb,var(--warn)_28%,var(--border-subtle))]"
        : "text-[var(--bad-ink)] bg-[var(--bad-soft)] border-[color-mix(in_srgb,var(--bad)_28%,var(--border-subtle))]";

  return (
    <div className="flex flex-col gap-4" data-testid="achiles-status-screen">
      <section className="relative overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] lg:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,color-mix(in_srgb,var(--dept-achiles)_20%,transparent),transparent_38%),radial-gradient(circle_at_100%_100%,var(--brand-soft),transparent_36%)]" aria-hidden />
        <div className="relative flex flex-wrap items-start gap-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[var(--dept-achiles)] text-white shadow-[var(--shadow-md)]">
            <Icons.HeartPulse className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[var(--dept-achiles)]">ACHILES · PRIVATE PLATFORM ASSURANCE</p>
            <h1 className="mt-1.5 text-[25px] font-extrabold tracking-[-.025em] text-[var(--text-primary)]">Is XELOR working?</h1>
            <p className="mt-2 max-w-[78ch] text-[12.5px] leading-6 text-[var(--text-secondary)]">A quiet internal check of the application, API, database and supporting runtime. It is invisible to ordinary customers and makes no ERP changes.</p>
          </div>
          {can("platform_health.run.execute") ? (
            <button type="button" className="btn btn-primary order-3 w-full justify-center sm:order-none sm:w-auto" disabled={running} onClick={() => void runNow()} data-testid="achiles-run-now">
              {running ? <Icons.LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Icons.PlayCircle className="h-4 w-4" aria-hidden />}
              {running ? "Checking…" : "Run private check now"}
            </button>
          ) : null}
        </div>
      </section>

      <section className={cn("rounded-[15px] border p-4", headlineTone)} role="status" aria-live="polite" data-testid="achiles-headline">
        <div className="flex flex-wrap items-center gap-3">
          {latest?.overallStatus === "healthy" && !stale ? <Icons.CircleCheckBig className="h-6 w-6" aria-hidden /> : <Icons.TriangleAlert className="h-6 w-6" aria-hidden />}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold">{headline}</h2>
            <p className="mt-0.5 text-[11px] leading-5">{latest?.summary ?? "The scheduler is ready. Run the first private check to create real evidence."}</p>
          </div>
          <div className="text-right text-[9.5px] font-semibold uppercase tracking-[.08em]">
            <p>Every {data.schedule.cadenceMinutes} minutes</p>
            <p className="mt-1 opacity-75">{latest ? shownTime(latest.completedAt) : "Not run yet"}</p>
          </div>
        </div>
      </section>

      {runError ? <ErrorState error={runError} onRetry={() => void runNow()} /> : null}

      <section className="grid gap-3 md:grid-cols-3" aria-label="ACHILES operating boundaries">
        {[
          [Icons.EyeOff, "Customer visibility", "Private", "Only authorised XELOR or IT operators receive this status."],
          [Icons.TimerReset, "Normal cadence", "Hourly", data.schedule.mode],
          [Icons.ShieldCheck, "Automatic authority", "Read-only", "No ERP write, restart, repair or customer message."],
        ].map(([Icon, label, value, detail]) => {
          const CardIcon = Icon as Icons.LucideIcon;
          return (
            <article key={String(label)} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2 text-[var(--dept-achiles)]"><CardIcon className="h-4 w-4" aria-hidden /><p className="text-[9.5px] font-extrabold uppercase tracking-[.09em]">{String(label)}</p></div>
              <p className="mt-2 text-[20px] font-extrabold text-[var(--text-primary)]">{String(value)}</p>
              <p className="mt-1 text-[10.5px] leading-4 text-[var(--text-muted)]">{String(detail)}</p>
            </article>
          );
        })}
      </section>

      <section className="card overflow-hidden">
        <div className="panel-h"><span>Latest component checks</span><span className="panel-h-sub">deterministic probes · no AI guess</span></div>
        {latest ? (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
            {latest.checks.map((check) => {
              const Icon = CHECK_ICON[check.key] ?? Icons.Activity;
              return (
                <article key={check.key} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3" data-testid={`achiles-check-${check.key}`}>
                  <div className="flex items-center justify-between gap-2">
                    <Icon className="h-4 w-4 text-[var(--dept-achiles)]" aria-hidden />
                    <span className={cn("text-[8px] font-extrabold uppercase tracking-[.08em]", check.status === "passed" ? "text-[var(--ok-ink)]" : check.status === "failed" ? "text-[var(--bad-ink)]" : "text-[var(--text-muted)]")}>{check.status === "passed" ? "Passed" : check.status === "failed" ? "Failed" : "Not configured"}</span>
                  </div>
                  <h3 className="mt-2 text-[11.5px] font-extrabold text-[var(--text-primary)]">{check.label}</h3>
                  <p className="mt-1 text-[9.5px] leading-4 text-[var(--text-muted)]">{check.detail}</p>
                  <p className="mt-2 font-mono text-[9px] text-[var(--text-secondary)]">{check.status === "not_configured" ? "Skipped" : `${check.latencyMs} ms`}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-[12px] text-[var(--text-muted)]">No check evidence has been recorded yet.</div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="panel-h"><span>Private check history</span><span className="panel-h-sub">latest 24 immutable observations</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead><tr><th>Completed</th><th>Started by</th><th>Result</th><th>Checks</th><th>Duration</th></tr></thead>
            <tbody>
              {data.history.map((run) => (
                <tr key={run.id}>
                  <td>{shownTime(run.completedAt)}</td>
                  <td>{run.trigger === "hourly_schedule" ? "Hourly schedule" : "Internal operator"}</td>
                  <td><span className={cn("font-bold", run.overallStatus === "healthy" ? "text-[var(--ok-ink)]" : run.overallStatus === "degraded" ? "text-[var(--warn-ink)]" : "text-[var(--bad-ink)]")}>{run.overallStatus}</span></td>
                  <td>{run.checks.filter((check) => check.status === "passed").length}/{run.checks.filter((check) => check.status !== "not_configured").length} passed</td>
                  <td>{run.durationMs} ms</td>
                </tr>
              ))}
              {data.history.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-[var(--text-muted)]">The first completed check will appear here.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="flex items-start gap-2.5 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[10.5px] leading-5 text-[var(--text-secondary)]">
        <Icons.GitPullRequestArrow className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dept-achiles)]" aria-hidden />
        <p><b className="text-[var(--text-primary)]">When a check fails:</b> ACHILES records the evidence and raises visibility for the internal team. RELAY owns the incident clock and any customer update; HEXA, ONYX or the affected specialist owns diagnosis and repair.</p>
      </aside>
    </div>
  );
}
