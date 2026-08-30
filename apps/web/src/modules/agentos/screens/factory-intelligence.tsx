"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Factory,
  Gauge,
  RefreshCw,
  Route,
  ShieldCheck,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useAccess } from "@spine/access/permissions";
import { useQuery } from "@spine/data/use-query";
import { dateTime, humanise } from "@spine/format";
import type { ScreenProps } from "@spine/registry/manifest";
import { PageHeader } from "@spine/shell/page-header";
import { Empty, ErrorState, Loading } from "@spine/states";
import { StatusBadge } from "@spine/ui/status-badge";
import {
  agentOsApi,
  FACTORY_INTELLIGENCE_PATH,
  type AgentAction,
  type AgentRunDetail,
  type FactoryIntelligenceView,
} from "../api";

const GRAPH_KEY = "factory.intelligence-recovery";
const TERMINAL_RUNS = new Set(["completed", "failed", "cancelled"]);

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function seconds(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)} s`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The governed Factory Intelligence request could not be completed.";
}

export default function FactoryIntelligenceScreen(
  _props: ScreenProps,
): React.JSX.Element {
  const { can } = useAccess();
  const query = useQuery<{ data: FactoryIntelligenceView }>(
    FACTORY_INTELLIGENCE_PATH,
  );
  const [run, setRun] = useState<AgentRunDetail | null>(null);
  const [actions, setActions] = useState<readonly AgentAction[]>([]);
  const [note, setNote] = useState("");
  const [launching, setLaunching] = useState(false);
  const [deciding, setDeciding] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [missionError, setMissionError] = useState<unknown>(null);

  const loadLatestRun = useCallback(async (): Promise<void> => {
    try {
      const runs = await agentOsApi.runs(40);
      const latest = runs.find((item) => item.graphKey === GRAPH_KEY);
      if (!latest) return;
      const detail = await agentOsApi.run(latest.id);
      setRun(detail);
      setActions(await agentOsApi.actions(20, latest.id));
    } catch (error) {
      setMissionError(error);
    }
  }, []);

  useEffect(() => {
    void loadLatestRun();
  }, [loadLatestRun]);

  useEffect(() => {
    if (!run || TERMINAL_RUNS.has(run.run.status)) return;
    const timer = window.setInterval(() => void loadLatestRun(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadLatestRun, run]);

  const data = query.data?.data ?? null;
  const pendingApproval = run?.approvals.find(
    (approval) => approval.status === "pending",
  );
  const recoveryActive = Boolean(run && !TERMINAL_RUNS.has(run.run.status));
  const canLaunch = can("agentos.run.operate");
  const canDecide = can("agentos.approval.decide");

  async function launch(): Promise<void> {
    if (!data?.replan.recommendation || launching || !canLaunch) return;
    setLaunching(true);
    setMissionError(null);
    try {
      const detail = await agentOsApi.start(data.mission.goal, GRAPH_KEY, {
        scenarioKey: data.scenario.key,
        source: "factory-intelligence-screen",
      });
      setRun(detail);
      setActions(await agentOsApi.actions(20, detail.run.id));
    } catch (error) {
      setMissionError(error);
    } finally {
      setLaunching(false);
    }
  }

  async function decide(decision: "approved" | "rejected"): Promise<void> {
    if (!pendingApproval || !canDecide || note.trim().length < 3 || deciding) return;
    setDeciding(decision);
    setMissionError(null);
    try {
      const detail = await agentOsApi.decide(
        pendingApproval.id,
        decision,
        note.trim(),
      );
      setRun(detail);
      setNote("");
      setActions(await agentOsApi.actions(20, detail.run.id));
      window.dispatchEvent(new Event("xelor:approvals-changed"));
    } catch (error) {
      setMissionError(error);
    } finally {
      setDeciding(null);
    }
  }

  if (query.loading && !data) {
    return <Loading label="Reading the 3S ONYX factory projection…" />;
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />;
  if (!data) {
    return (
      <Empty
        title="Factory Intelligence evidence is unavailable"
        body="Configure the fail-closed ONYX HTTP adapter before requesting a 3S recovery review."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="3S Factory Intelligence"
        subtitle="A deterministic POC explanation of ONYX factory evidence: OEE components, current work and operator assignments, constrained jobs, and one human-governed planning review."
        meta={[
          { label: "Evidence mode", value: "Configured mock" },
          { label: "Customer", value: data.customer.name },
          { label: "Freshest observation", value: dateTime(data.freshness.freshestObservedAt) },
          { label: "Source", value: data.source.system },
        ]}
      />

      <section
        className="rounded-[14px] border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-4"
        aria-label="Factory Intelligence safety and source boundary"
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn-ink)]" aria-hidden />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">
                Analysis and review only
              </h2>
              <StatusBadge tone="draft" label="3S mock POC" />
              <StatusBadge
                tone={
                  data.freshness.status === "fresh"
                    ? "approved"
                    : data.freshness.status === "mixed"
                      ? "pending"
                      : "overdue"
                }
                label={
                  data.freshness.status === "fresh"
                    ? "Fresh evidence"
                    : data.freshness.status === "mixed"
                      ? "Mixed freshness"
                      : "Stale evidence"
                }
              />
            </div>
            <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">
              {data.boundary.statement}
            </p>
            <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">
              Contract {data.source.upstreamSchemaVersion} · {data.source.endpointPath} · generated {dateTime(data.freshness.generatedAt)} · newest row {data.freshness.ageSeconds}s · oldest row {data.freshness.oldestAgeSeconds}s · {data.freshness.staleMachineCount} of {data.summary.machineCount} rows flagged stale
            </p>
          </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            onClick={query.reload}
            disabled={query.loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh ONYX evidence
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Factory summary">
        <SummaryCard icon={Factory} label="Machines" value={String(data.summary.machineCount)} note="ONYX-bound mock assets" />
        <SummaryCard icon={AlertTriangle} label="Constrained" value={String(data.summary.constrainedMachineCount)} note="Deterministic state rule" tone="risk" />
        <SummaryCard icon={UserRoundCheck} label="Assigned jobs" value={String(data.summary.assignedJobCount)} note="Job + operator evidence" />
        <SummaryCard icon={Clock3} label="At-risk work" value={String(data.summary.atRiskJobCount)} note="Linked to constrained assets" tone="risk" />
        <SummaryCard icon={Gauge} label="Average OEE" value={pct(data.summary.recomputedAverageOeePct)} note="Recomputed in XELOR" tone="ai" />
      </section>

      <section aria-labelledby="oee-heading">
        <div className="mb-3">
          <h2 id="oee-heading" className="text-[15px] font-extrabold text-[var(--text-primary)]">
            Explainable OEE
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            XELOR independently recomputes every component from ONYX raw inputs. An upstream anomaly remains visible; it is not silently clipped at transport.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.oee.map((item) => (
            <article key={item.assetCode} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[13px] font-bold text-[var(--text-primary)]">
                    {item.assetName}
                  </h3>
                  <p className="mt-0.5 font-[var(--font-mono)] text-[10.5px] text-[var(--text-muted)]">
                    {item.assetCode} · {item.workCenterCode} · {item.shift.label}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge
                    tone={item.evidenceStale ? "overdue" : "approved"}
                    label={item.evidenceStale ? "Stale row" : "Fresh row"}
                  />
                  <p className="text-[24px] font-extrabold tabular-nums text-[var(--ai-text)]">
                    {pct(item.analysis.oee.percent)}
                  </p>
                  <p className="text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    recomputed OEE
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <OeeMetric label="Availability" value={item.analysis.availability.percent} formula={item.analysis.formulas.availability} />
                <OeeMetric label="Performance" value={item.analysis.performance.percent} formula={item.analysis.formulas.performance} />
                <OeeMetric label="Quality" value={item.analysis.quality.percent} formula={item.analysis.formulas.quality} />
              </div>

              <details className="mt-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-semibold text-[var(--text-primary)]">
                  Raw inputs, formula and confidence
                </summary>
                <div className="mt-3 grid gap-2 text-[10.5px] text-[var(--text-secondary)] sm:grid-cols-2">
                  <Raw label="Planned production" value={`${item.analysis.rawInputs.plannedProductionSeconds ?? "—"} s`} />
                  <Raw label="Run time" value={`${item.analysis.rawInputs.runSeconds ?? "—"} s`} />
                  <Raw label="Ideal cycle" value={seconds(item.analysis.rawInputs.idealCycleSeconds)} />
                  <Raw label="Actual cycle evidence" value={seconds(item.actualCycleSeconds)} />
                  <Raw label="Total / good / reject" value={`${item.analysis.rawInputs.totalCount ?? "—"} / ${item.analysis.rawInputs.goodCount ?? "—"} / ${item.analysis.rawInputs.rejectCount ?? "—"}`} />
                  <Raw label="ONYX A / P / Q / OEE" value={`${pct(item.upstream.availabilityPct)} / ${pct(item.upstream.performancePct)} / ${pct(item.upstream.qualityPct)} / ${pct(item.upstream.oeePct)}`} />
                  <Raw label="Composite" value={item.analysis.formulas.oee} />
                  <Raw label="Evidence window" value={item.analysis.window.label} />
                  <Raw label="Observed" value={dateTime(item.observedAt)} />
                  <Raw label="Data confidence" value={`${item.analysis.confidence.score}% · ${item.analysis.confidence.band}`} />
                  <Raw label="Freshness" value={`${humanise(item.analysis.freshness.status)} · ${item.analysis.freshness.ageSeconds ?? "—"}s`} />
                </div>
                {item.analysis.warnings.length > 0 || item.upstream.warnings.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-[10.5px] text-[var(--warn-ink)]">
                    {item.analysis.warnings.map((warning) => (
                      <li key={`${item.assetCode}-${warning.code}`}>• {warning.message}</li>
                    ))}
                    {item.upstream.warnings.map((warning) => (
                      <li key={`${item.assetCode}-upstream-${warning}`}>• ONYX: {warning}</li>
                    ))}
                  </ul>
                ) : null}
              </details>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div aria-labelledby="assignments-heading">
          <div className="mb-3">
            <h2 id="assignments-heading" className="text-[15px] font-extrabold text-[var(--text-primary)]">
              Current operator and job assignments
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Configured ONYX mock assignments, not inferred people tracking.
            </p>
          </div>
          <div className="grid gap-3">
            {data.assignments.length === 0 ? (
              <Empty
                title="No configured assignments"
                body="ONYX supplied no current operator-and-job assignment evidence for this mock snapshot."
              />
            ) : null}
            {data.assignments.map((assignment) => (
              <article key={assignment.assignmentId} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-bold text-[var(--text-primary)]">
                      {assignment.job.orderRef} · {assignment.job.itemCode}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-[var(--text-secondary)]">
                      {assignment.job.operationCode} {assignment.job.operationName} · qty {assignment.job.quantity}
                    </p>
                  </div>
                  <StatusBadge tone={assignment.machineState === "running" ? "progress" : assignment.machineState === "idle" ? "approved" : "rejected"} label={humanise(assignment.machineState)} />
                </div>
                <div className="mt-3 grid gap-2 rounded-[10px] bg-[var(--surface-sunken)] p-3 text-[10.5px] sm:grid-cols-2">
                  <Raw label="Machine / work centre" value={`${assignment.assetCode} · ${assignment.workCenterCode ?? "unbound"}`} />
                  <Raw label="Due" value={dateTime(assignment.job.dueAt)} />
                  <Raw label="Operator" value={`${assignment.operator.name} · ${assignment.operator.employeeCode}`} />
                  <Raw label="Qualification" value={`${assignment.operator.skill} · ${assignment.operator.shiftCode}`} />
                </div>
              </article>
            ))}
          </div>
        </div>

        <div aria-labelledby="risk-heading">
          <div className="mb-3">
            <h2 id="risk-heading" className="text-[15px] font-extrabold text-[var(--text-primary)]">
              Constraint and breakdown impact
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              State rules identify the constraint; linked ONYX assignments identify the work at risk.
            </p>
          </div>
          <div className="grid gap-3">
            {data.constraints.length === 0 && data.atRiskWork.length === 0 ? (
              <Empty
                title="No active factory constraint"
                body="The current ONYX snapshot has no constrained machine or linked work at risk. Refresh after a new simulator observation."
              />
            ) : null}
            {data.constraints.map((constraint) => (
              <article key={constraint.evidenceRef} className="rounded-[12px] border border-[var(--status-rejected-border)] bg-[var(--status-rejected-bg)] p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bad-ink)]" aria-hidden />
                  <div>
                    <p className="text-[12px] font-bold text-[var(--text-primary)]">
                      {constraint.assetCode} · {constraint.workCenterCode ?? "work centre unbound"}
                    </p>
                    <p className="mt-1 text-[10.5px] leading-4 text-[var(--text-secondary)]">
                      {constraint.reason}
                    </p>
                  </div>
                </div>
              </article>
            ))}
            {data.atRiskWork.map((job) => (
              <article key={job.jobId} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-bold text-[var(--text-primary)]">
                      {job.orderRef} · {job.operationName}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-[var(--text-secondary)]">
                      {job.itemCode} · {job.operationCode} · operator {job.operatorCode ?? "unassigned"}
                    </p>
                  </div>
                  <StatusBadge tone="rejected" label="At risk" />
                </div>
                <p className="mt-2 text-[10.5px] leading-4 text-[var(--text-muted)]">
                  {job.reason} Due {dateTime(job.dueAt)}.
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--ai)_28%,var(--border-subtle))] bg-[var(--surface)] shadow-[var(--shadow-sm)]" aria-labelledby="replan-heading">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--ai-soft)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-[var(--ai-text)]" aria-hidden />
            <h2 id="replan-heading" className="text-[14px] font-extrabold text-[var(--text-primary)]">
              Governed alternate-work-centre recommendation
            </h2>
          </div>
          <p className="mt-1 text-[10.5px] text-[var(--text-secondary)]">
            XELOR validates ONYX&apos;s supplied proposal against the qualified, available routing alternate. It does not originate or apply a schedule.
          </p>
        </div>
        <div className="p-4">
          {data.replan.recommendation ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <WorkCentre label="Current constrained centre" code={data.replan.recommendation.fromWorkCenterCode} tone="risk" />
              <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-[var(--ai-text)] lg:rotate-0" aria-hidden />
              <WorkCentre label="ONYX explicit alternate" code={data.replan.recommendation.toWorkCenterCode} tone="good" />
            </div>
          ) : (
            <div className="rounded-[10px] border border-[var(--status-rejected-border)] bg-[var(--status-rejected-bg)] p-3 text-[11px] text-[var(--bad-ink)]">
              No ONYX proposal matched a qualified, available alternate. The graph cannot dispatch a planning-review request.
            </div>
          )}
          <p className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">
            {data.replan.statement}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Raw label="Validation" value={humanise(data.replan.validation.status)} />
            <Raw label="Affected operations" value={String(data.replan.validation.affectedOperations.length)} />
            <Raw label="Blocked operations" value={String(data.replan.validation.blockedOperations.length)} />
          </div>
        </div>
      </section>

      <section className="card p-4" aria-labelledby="mission-heading">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--ai-text)]" aria-hidden />
              <h2 id="mission-heading" className="text-[14px] font-extrabold text-[var(--text-primary)]">
                Governed recovery mission
              </h2>
              {run ? <StatusBadge tone={run.run.status === "completed" ? "approved" : run.run.status === "failed" ? "rejected" : "pending"} label={humanise(run.run.status)} /> : null}
            </div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
              {data.mission.goal}
            </p>
            <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">
              {data.mission.approvalBoundary}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void launch()}
            disabled={!data.replan.recommendation || !canLaunch || launching || recoveryActive}
          >
            {launching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
            {launching
              ? "Starting…"
              : recoveryActive
                ? "Recovery already active"
                : "Start governed recovery"}
          </button>
        </div>

        {missionError ? (
          <div role="alert" className="mt-4 rounded-[10px] border border-[var(--status-rejected-border)] bg-[var(--status-rejected-bg)] p-3 text-[11px] text-[var(--bad-ink)]">
            {errorMessage(missionError)}
          </div>
        ) : null}

        {pendingApproval ? (
          <div className="mt-4 rounded-[12px] border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-4">
            <div className="flex items-start gap-3">
              <UserRoundCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn-ink)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="text-[12px] font-bold text-[var(--text-primary)]">
                  {pendingApproval.title}
                </h3>
                <p className="mt-1 text-[10.5px] leading-4 text-[var(--text-secondary)]">
                  {pendingApproval.proposedAction}
                </p>
                <label className="mt-3 block text-[10.5px] font-semibold text-[var(--text-primary)]" htmlFor="factory-intelligence-decision-note">
                  Decision note
                </label>
                <textarea
                  id="factory-intelligence-decision-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Record why this review request should proceed or stop."
                  className="mt-1 w-full rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--ai)]"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" disabled={!canDecide || note.trim().length < 3 || deciding !== null} onClick={() => void decide("approved")}>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    {deciding === "approved" ? "Approving…" : "Approve planning review"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!canDecide || note.trim().length < 3 || deciding !== null} onClick={() => void decide("rejected")}>
                    <XCircle className="h-3.5 w-3.5" aria-hidden />
                    {deciding === "rejected" ? "Rejecting…" : "Reject"}
                  </button>
                  <Link href="/agentos/approvals" className="btn btn-ghost btn-sm">
                    Open approval inbox
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {run ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] bg-[var(--surface-sunken)] p-3">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Evidence ledger
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {run.nodes.filter((node) => ["succeeded", "skipped"].includes(node.status)).length} of {run.nodes.length} nodes recorded · {run.events.length} events · {run.checkpoints.length} checkpoints
              </p>
            </div>
            <div className="rounded-[10px] bg-[var(--surface-sunken)] p-3">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Governed dispatch
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {actions.length === 0
                  ? "No work item dispatched. Rejection or a pending gate leaves ONYX unchanged."
                  : `${actions.length} approval-linked ${actions[0]?.actionType ?? "work item"} recorded for ${actions[0]?.targetDomain ?? "ONYX"}.`}
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
  tone = "plain",
}: {
  icon: typeof Factory;
  label: string;
  value: string;
  note: string;
  tone?: "plain" | "risk" | "ai";
}): React.JSX.Element {
  const colour = tone === "risk" ? "text-[var(--bad-ink)]" : tone === "ai" ? "text-[var(--ai-text)]" : "text-[var(--text-primary)]";
  return (
    <article className="card p-3.5">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[9.5px] font-bold uppercase tracking-[0.1em]">{label}</span>
      </div>
      <p className={`mt-2 text-[22px] font-extrabold tabular-nums ${colour}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{note}</p>
    </article>
  );
}

function OeeMetric({ label, value, formula }: { label: string; value: number | null; formula: string }): React.JSX.Element {
  return (
    <div className="rounded-[10px] bg-[var(--surface-sunken)] p-2.5 text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[16px] font-extrabold tabular-nums text-[var(--text-primary)]">{pct(value)}</p>
      <p className="mt-1 break-words font-[var(--font-mono)] text-[8px] text-[var(--text-muted)]">{formula}</p>
    </div>
  );
}

function Raw({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 break-words font-medium tabular-nums text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function WorkCentre({ label, code, tone }: { label: string; code: string; tone: "risk" | "good" }): React.JSX.Element {
  return (
    <div className={`rounded-[12px] border p-4 ${tone === "risk" ? "border-[var(--status-rejected-border)] bg-[var(--status-rejected-bg)]" : "border-[var(--status-approved-border)] bg-[var(--status-approved-bg)]"}`}>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 font-[var(--font-mono)] text-[17px] font-extrabold text-[var(--text-primary)]">{code}</p>
    </div>
  );
}
