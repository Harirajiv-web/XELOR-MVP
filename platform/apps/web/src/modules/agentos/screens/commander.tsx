"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Cable,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileSearch,
  GitBranch,
  History,
  Network,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ScreenProps } from "@spine/registry/manifest";
import { ErrorState, Loading } from "@spine/states";
import { dateTime, humanise, inrShort } from "@spine/format";
import { cn } from "@spine/ui/cn";
import {
  agentOsApi,
  type CommanderRisk,
  type CommanderRiskKind,
  type DecisionCommander,
} from "../api";

type Filter = "all" | CommanderRiskKind;
const filters: readonly Filter[] = ["all", "delivery", "supply", "planning", "quality", "maintenance"];

export default function CommanderScreen(_props: ScreenProps): React.JSX.Element {
  const [data, setData] = useState<DecisionCommander | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startedRun, setStartedRun] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const next = await agentOsApi.commander();
      setData(next);
      setSelectedKey((current) =>
        current && next.risks.some((risk) => risk.key === current)
          ? current
          : (next.risks[0]?.key ?? null),
      );
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => data?.risks.filter((risk) => filter === "all" || risk.kind === filter) ?? [],
    [data, filter],
  );
  const selected =
    visible.find((risk) => risk.key === selectedKey) ?? visible[0] ?? null;

  async function startRecovery(risk: CommanderRisk): Promise<void> {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const run = await agentOsApi.startCommanderRisk(risk.key);
      setStartedRun(run.run.id);
      window.dispatchEvent(new Event("xelor:approvals-changed"));
    } catch (cause) {
      setError(cause);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section data-demo-target="workspace" className="relative overflow-hidden rounded-[20px] border border-[color-mix(in_srgb,var(--brand)_22%,var(--border-subtle))] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] lg:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,var(--brand-soft),transparent_38%),radial-gradient(circle_at_100%_100%,var(--violet-soft),transparent_32%)]" aria-hidden />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[linear-gradient(135deg,var(--brand),var(--violet))] text-[var(--text-on-brand)] shadow-[var(--shadow-md)]">
              <Radar className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[var(--ai-text)]">Cross-company decisions</p>
              <h1 className="mt-1 text-[24px] font-extrabold tracking-[-.025em] text-[var(--text-primary)]">Live operating decision room</h1>
              <p className="mt-1.5 max-w-[74ch] text-[12.5px] leading-5 text-[var(--text-secondary)]">
                One view of the customer promise, its operational risks, source evidence and the exact human decision required next.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Decision-room trust boundaries">
                <TrustChip label="Live ERP records" tone="live" />
                <TrustChip label="Deterministic risk rules" tone="rule" />
                <TrustChip label="No hidden writes" tone="safe" />
                <TrustChip label="Human approval required" tone="human" />
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="btn btn-ghost btn-sm">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden /> Refresh live facts
          </button>
        </div>
      </section>

      {error ? <ErrorState error={error} onRetry={() => void load()} /> : null}
      {loading && !data ? <Loading label="Connecting current business facts…" /> : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Decision summary">
            <Summary icon={CalendarClock} label="Promises at risk" value={String(data.summary.commitmentsAtRisk)} note="Customer commitments needing attention" tone="warn" />
            <Summary icon={AlertTriangle} label="Critical decisions" value={String(data.summary.critical)} note="Need attention now" tone={data.summary.critical > 0 ? "risk" : "good"} />
            <Summary icon={CircleDollarSign} label="Value connected to risk" value={inrShort(data.summary.exposedValue)} note="Gross connected value—not predicted loss" tone="ai" />
            <Summary icon={BrainCircuit} label="Evidence confidence" value={`${data.summary.averageConfidence}%`} note={`${data.confidence.high} high · ${data.confidence.low} low confidence`} tone={data.confidence.low > 0 ? "warn" : "good"} />
            <Summary icon={BadgeCheck} label="Verified value" value={inrShort(data.value.verifiedValue)} note={`${data.value.verifiedCount} outcome${data.value.verifiedCount === 1 ? "" : "s"} independently checked`} tone="good" />
          </section>

          <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)]">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden />
              <div>
                <p className="text-[12.5px] font-bold text-[var(--text-primary)]">{data.headline}</p>
                <p className="mt-1 text-[10.5px] leading-4 text-[var(--text-muted)]">{data.disclosure} Updated {dateTime(data.asOf)}.</p>
              </div>
            </div>
          </section>

          <nav className="flex gap-1 overflow-x-auto rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface)] p-1.5" aria-label="Risk filters">
            {filters.map((item) => {
              const count = item === "all" ? data.risks.length : data.risks.filter((risk) => risk.kind === item).length;
              return <button key={item} type="button" onClick={() => { setFilter(item); setSelectedKey(null); }} className={cn("shrink-0 rounded-[9px] px-3 py-2 text-[10.5px] font-bold transition", filter === item ? "bg-[var(--brand)] text-[var(--text-on-brand)] shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--bg)]")}><span>{item === "all" ? "All decisions" : humanise(item)}</span><span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[9px]", filter === item ? "bg-white/18" : "bg-[var(--bg)] text-[var(--text-muted)]")}>{count}</span></button>;
            })}
          </nav>

          {visible.length === 0 ? (
            <section className="card grid place-items-center px-6 py-14 text-center">
              <CheckCircle2 className="h-8 w-8 text-[var(--ok)]" aria-hidden />
              <h2 className="mt-3 text-[15px] font-bold text-[var(--text-primary)]">No current risk in this area</h2>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Current records do not cross the explicit attention rules.</p>
            </section>
          ) : (
            <section className="grid gap-4 xl:grid-cols-[minmax(330px,.82fr)_minmax(0,1.5fr)]">
              <div className="space-y-2.5" aria-label="Current decisions">
                {visible.map((risk) => (
                  <button key={risk.key} type="button" onClick={() => { setSelectedKey(risk.key); setStartedRun(null); }} className={cn("w-full rounded-[14px] border p-4 text-left shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:shadow-[var(--shadow-md)]", selected?.key === risk.key ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--border-subtle)] bg-[var(--surface)]")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[.08em]", severityClass(risk.severity))}>{risk.severity}</span>
                        {evidenceDomains(risk) > 1 ? <span className="rounded-full bg-[var(--violet-soft)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[.06em] text-[var(--ai-text)]">Connected decision</span> : null}
                      </div>
                      <span className="text-[9.5px] font-bold text-[var(--text-muted)]">{humanise(risk.kind)} · {risk.ownerAgent} · {risk.confidence.score}% confidence</span>
                    </div>
                    <h2 className="mt-2 text-[13px] font-extrabold leading-5 text-[var(--text-primary)]">{risk.title}</h2>
                    <p className="mt-1 text-[11px] leading-4.5 text-[var(--text-secondary)]">{risk.plainSummary}</p>
                    <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--border-subtle)] pt-2.5 text-[9.5px] text-[var(--text-muted)]">
                      <span>{risk.commitmentDate ? `Due ${risk.commitmentDate}` : "Decision needed"}</span>
                      <span className="font-bold text-[var(--text-primary)]">{risk.exposure.amount === null ? "Value not available" : inrShort(risk.exposure.amount)}</span>
                    </div>
                  </button>
                ))}
              </div>

              {selected ? (
                <article className="overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
                  <div className="border-b border-[var(--border-subtle)] p-5">
                    <div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.08em]", severityClass(selected.severity))}>{selected.severity}</span>{evidenceDomains(selected) > 1 ? <span className="rounded-full bg-[var(--violet-soft)] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.06em] text-[var(--ai-text)]">{evidenceDomains(selected)} business areas connected</span> : null}<span className="text-[10px] font-bold text-[var(--text-muted)]">Owner agent: {selected.ownerAgent}</span></div>
                    <h2 className="mt-3 text-[19px] font-extrabold tracking-[-.02em] text-[var(--text-primary)]">{selected.title}</h2>
                    <p className="mt-1.5 text-[12px] leading-5 text-[var(--text-secondary)]">{selected.plainSummary}</p>
                    <dl className="mt-4 grid gap-px overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-4">
                      <DecisionFact label="Connected source records" value={String(selected.evidence.length)} note="Current tenant evidence" />
                      <DecisionFact label="Commitment" value={selected.commitmentDate ?? "No date claimed"} note={selected.daysToCommitment === null ? "Not available" : `${selected.daysToCommitment} day${selected.daysToCommitment === 1 ? "" : "s"} from today`} />
                      <DecisionFact label="Connected value" value={selected.exposure.amount === null ? "Not inferred" : inrShort(selected.exposure.amount)} note={selected.exposure.basis} />
                      <DecisionFact label="Evidence confidence" value={`${selected.confidence.score}% · ${humanise(selected.confidence.band)}`} note={selected.confidence.meaning} />
                    </dl>
                  </div>

                  <div className="grid gap-5 p-5 lg:grid-cols-2">
                    <section>
                      <Heading icon={GitBranch} text="Why this is at risk" />
                      <ol className="mt-3 space-y-2.5">
                        {selected.causes.map((cause, index) => <li key={`${cause}-${index}`} className="flex gap-2.5 rounded-[10px] bg-[var(--bg)] p-3 text-[11px] leading-4.5 text-[var(--text-secondary)]"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--warn-soft)] text-[9px] font-extrabold text-[var(--warn-ink)]">{index + 1}</span>{cause}</li>)}
                      </ol>
                      <details className="mt-3 rounded-[10px] border border-[var(--border-subtle)] p-3">
                        <summary className="cursor-pointer text-[10.5px] font-bold text-[var(--brand)]">Show {selected.evidence.length} source record{selected.evidence.length === 1 ? "" : "s"}</summary>
                        <div className="mt-3 space-y-2">{selected.evidence.map((item) => <div key={`${item.domain}-${item.entityId}`} className="text-[10px] leading-4"><b className="text-[var(--text-primary)]">{item.reference} · {item.label}</b><p className="text-[var(--text-muted)]">{item.detail}</p></div>)}</div>
                      </details>
                      <details className="mt-3 rounded-[10px] border border-[var(--border-subtle)] p-3">
                        <summary className="cursor-pointer text-[10.5px] font-bold text-[var(--brand)]">How the {selected.confidence.score}% confidence was calculated</summary>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {Object.entries(selected.confidence.dimensions).map(([key, value]) => <div key={key} className="rounded-[8px] bg-[var(--bg)] p-2"><p className="text-[8px] font-bold uppercase tracking-[.06em] text-[var(--text-muted)]">{confidenceDimensionLabel(key)}</p><p className="mt-0.5 text-[12px] font-extrabold text-[var(--text-primary)]">{value}%</p></div>)}
                        </div>
                        {selected.confidence.gaps.length > 0 ? <ul className="mt-2 space-y-1 text-[9px] leading-3.5 text-[var(--text-muted)]">{selected.confidence.gaps.map((gap) => <li key={gap}>• {gap}</li>)}</ul> : null}
                      </details>
                    </section>

                    <section>
                      <Heading icon={ShieldCheck} text="Recovery choices" />
                      <div className="mt-3 space-y-2.5">
                        {selected.recoveryOptions.map((option) => <div key={option.id} className="rounded-[11px] border border-[var(--border-subtle)] p-3"><div className="flex items-start justify-between gap-3"><h3 className="text-[11.5px] font-extrabold text-[var(--text-primary)]">{option.title}</h3><span className="shrink-0 rounded-full bg-[var(--warn-soft)] px-2 py-0.5 text-[8.5px] font-bold text-[var(--warn-ink)]">Human approval</span></div><p className="mt-1 text-[10.5px] leading-4 text-[var(--text-secondary)]">{option.plainSummary}</p><p className="mt-1.5 text-[9px] text-[var(--text-muted)]">{option.reversible ? "Reversible proposal" : "Not automatically reversible"} · {option.cost.basis}</p></div>)}
                      </div>
                    </section>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-[62ch] text-[9.5px] leading-4 text-[var(--text-muted)]">Starting recovery creates a governed mission and an obvious human approval. It does not silently change an order, promise, payment, quality result or machine record.</p>
                    {startedRun ? <Link href="/agentos/approvals" className="btn btn-primary btn-sm shrink-0">Open human approval <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link> : <button type="button" disabled={starting} onClick={() => void startRecovery(selected)} className="btn btn-primary btn-sm shrink-0">{starting ? "Starting…" : "Start governed recovery"}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>}
                  </div>
                </article>
              ) : null}
            </section>
          )}

          <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]" aria-labelledby="intelligence-loop-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-[var(--ai-text)]">How XELOR learns safely</p>
                <h2 id="intelligence-loop-title" className="mt-1 text-[16px] font-extrabold text-[var(--text-primary)]">One visible decision-intelligence loop</h2>
              </div>
              <span className="rounded-full bg-[var(--ok-soft)] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.06em] text-[var(--ok-ink)]">Live MVP</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {[
                [Database, "Live records", "Sales, supply, plan, quality and machines"],
                [Network, "Evidence graph", "Links records that belong to one decision"],
                [BrainCircuit, "Confidence", "Shows strength, freshness and gaps"],
                [ShieldCheck, "Human decision", "Approval before consequential work"],
                [BadgeCheck, "Verified outcome", "Observed value, not marketing estimates"],
                [History, "Memory", "Keeps the decision and result for next time"],
              ].map(([Icon, title, note], index) => {
                const FlowIcon = Icon as typeof Database;
                return <div key={String(title)} className="relative rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg)] p-3"><FlowIcon className="h-4 w-4 text-[var(--brand)]" aria-hidden /><p className="mt-2 text-[10.5px] font-extrabold text-[var(--text-primary)]">{String(title)}</p><p className="mt-1 text-[8.5px] leading-3.5 text-[var(--text-muted)]">{String(note)}</p>{index < 5 ? <ArrowRight className="absolute -right-2 top-5 z-10 hidden h-3.5 w-3.5 text-[var(--text-muted)] xl:block" aria-hidden /> : null}</div>;
              })}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <Heading icon={Network} text="Enterprise knowledge graph" />
              <p className="mt-2 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">The graph connects business records by provenance while each module remains the owner of its original data.</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniMetric value={data.graph.summary.businessAreas} label="Business areas" />
                <MiniMetric value={data.graph.summary.relationships} label="Relationships" />
                <MiniMetric value={data.graph.summary.rememberedDecisions} label="Remembered decisions" />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">{[...new Set(data.graph.nodes.filter((node) => node.domain !== "agentos").map((node) => node.domain))].map((domain) => <span key={domain} className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg)] px-2.5 py-1 text-[9px] font-bold text-[var(--text-secondary)]">{humanise(domain)}</span>)}</div>
              <p className="mt-3 text-[8.5px] leading-3.5 text-[var(--text-muted)]">{data.graph.disclosure}</p>
            </article>

            <article className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <Heading icon={History} text="Organizational memory" />
              <p className="mt-2 text-[10.5px] leading-4.5 text-[var(--text-secondary)]">XELOR remembers only governed work and measured results—not private reasoning or an invented success story.</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniMetric value={data.memory.summary.decisionsRemembered} label="Missions remembered" />
                <MiniMetric value={data.memory.summary.withVerifiedOutcome} label="Verified results" />
                <MiniMetric value={data.memory.summary.awaitingHumanDecision} label="Awaiting people" />
              </div>
              <div className="mt-3 space-y-2">
                {data.memory.items.length === 0 ? <p className="rounded-[10px] bg-[var(--bg)] p-3 text-[9.5px] leading-4 text-[var(--text-muted)]">Start a governed recovery above to create the first durable memory.</p> : data.memory.items.slice(0, 3).map((item) => <div key={item.missionRunId} className="rounded-[10px] border border-[var(--border-subtle)] p-3"><div className="flex items-start justify-between gap-3"><p className="text-[10.5px] font-extrabold text-[var(--text-primary)]">{item.title}</p><span className="shrink-0 text-[8.5px] font-bold text-[var(--text-muted)]">{humanise(item.humanDecision)}</span></div><p className="mt-1 text-[9px] leading-3.5 text-[var(--text-muted)]">{item.learned}</p></div>)}
              </div>
              <p className="mt-3 text-[8.5px] leading-3.5 text-[var(--text-muted)]">{data.memory.disclosure}</p>
            </article>
          </section>

          <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]" aria-labelledby="platform-readiness-title">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div><p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-[var(--ai-text)]">Demo proof, not roadmap promises</p><h2 id="platform-readiness-title" className="mt-1 text-[16px] font-extrabold text-[var(--text-primary)]">MVP platform readiness</h2></div>
              <p className="text-[8.5px] text-[var(--text-muted)]">Checked {dateTime(data.platform.checkedAt)}</p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <ReadinessCard icon={Cable} title="API & integrations" status={data.platform.integrations.status} metrics={`${data.platform.integrations.connectors} connectors · ${data.platform.integrations.activeFlows}/${data.platform.integrations.totalFlows} active flows`} note={data.platform.integrations.disclosure} />
              <ReadinessCard icon={FileSearch} title="Document intelligence" status={data.platform.documents.status} metrics={`${data.platform.documents.confirmed}/${data.platform.documents.drafts} confirmed · ${data.platform.documents.fieldEditRatePct}% field edits`} note={data.platform.documents.disclosure} />
              <ReadinessCard icon={Activity} title="Operational health" status={data.platform.operations.eventDelivery.status} metrics={`DB ${data.platform.operations.database.queryMs} ms · ${data.platform.operations.eventDelivery.unpublished} events waiting`} note={data.platform.operations.disclosure} />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {data.platform.upgrades.map((upgrade) => <div key={upgrade.key} className="rounded-[10px] border border-[var(--border-subtle)] p-3"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-extrabold text-[var(--text-primary)]">{upgrade.label}</p><span className="shrink-0 rounded-full bg-[var(--ok-soft)] px-1.5 py-0.5 text-[7.5px] font-extrabold uppercase text-[var(--ok-ink)]">{humanise(upgrade.status)}</span></div><p className="mt-1.5 text-[8.5px] leading-3.5 text-[var(--text-muted)]">{upgrade.proof}</p></div>)}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Heading({ icon: Icon, text }: { icon: typeof GitBranch; text: string }): React.JSX.Element {
  return <h2 className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[.08em] text-[var(--text-primary)]"><Icon className="h-4 w-4 text-[var(--brand)]" aria-hidden />{text}</h2>;
}

function MiniMetric({ value, label }: { value: number; label: string }): React.JSX.Element {
  return <div className="rounded-[9px] bg-[var(--bg)] p-2.5"><p className="text-[16px] font-extrabold text-[var(--text-primary)]">{value}</p><p className="mt-0.5 text-[8px] font-bold uppercase tracking-[.055em] text-[var(--text-muted)]">{label}</p></div>;
}

function ReadinessCard({ icon: Icon, title, status, metrics, note }: { icon: typeof Activity; title: string; status: string; metrics: string; note: string }): React.JSX.Element {
  const attention = ["attention", "not_configured"].includes(status);
  return <article className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg)] p-4"><div className="flex items-start justify-between gap-3"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[var(--brand-soft)] text-[var(--brand)]"><Icon className="h-4 w-4" aria-hidden /></span><span className={cn("rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[.06em]", attention ? "bg-[var(--warn-soft)] text-[var(--warn-ink)]" : "bg-[var(--ok-soft)] text-[var(--ok-ink)]")}>{humanise(status)}</span></div><h3 className="mt-3 text-[11.5px] font-extrabold text-[var(--text-primary)]">{title}</h3><p className="mt-1 text-[9.5px] font-bold text-[var(--text-secondary)]">{metrics}</p><p className="mt-1.5 text-[8.5px] leading-3.5 text-[var(--text-muted)]">{note}</p></article>;
}

function TrustChip({ label, tone }: { label: string; tone: "live" | "rule" | "safe" | "human" }): React.JSX.Element {
  const style = {
    live: "border-[var(--ok)]/25 bg-[var(--ok)]/10 text-[var(--ok-ink)]",
    rule: "border-[var(--info-fg)]/25 bg-[var(--info-fg)]/10 text-[var(--info-fg)]",
    safe: "border-[var(--ai-accent)]/25 bg-[var(--ai-accent)]/10 text-[var(--ai-text)]",
    human: "border-[var(--accent)]/30 bg-[var(--accent)]/12 text-[var(--accent-ink)]",
  }[tone];
  return <span className={cn("rounded-full border px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.065em]", style)}>{label}</span>;
}

function DecisionFact({ label, value, note }: { label: string; value: string; note: string }): React.JSX.Element {
  return <div className="bg-[var(--bg)] p-3"><dt className="text-[9px] font-bold uppercase tracking-[.07em] text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-[12px] font-extrabold text-[var(--text-primary)]">{value}</dd><p className="mt-0.5 line-clamp-2 text-[8.5px] leading-3.5 text-[var(--text-muted)]">{note}</p></div>;
}

function Summary({ icon: Icon, label, value, note, tone }: { icon: typeof Radar; label: string; value: string; note: string; tone: "risk" | "warn" | "good" | "ai" }): React.JSX.Element {
  const styles = { risk: "bg-[var(--bad-soft)] text-[var(--bad-ink)]", warn: "bg-[var(--warn-soft)] text-[var(--warn-ink)]", good: "bg-[var(--ok-soft)] text-[var(--ok-ink)]", ai: "bg-[var(--violet-soft)] text-[var(--ai-text)]" }[tone];
  return <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{label}</p><p className="mt-2 text-[22px] font-extrabold tracking-[-.03em] text-[var(--text-primary)]">{value}</p></div><span className={cn("grid h-9 w-9 place-items-center rounded-[10px]", styles)}><Icon className="h-4 w-4" aria-hidden /></span></div><p className="mt-1 text-[9.5px] leading-4 text-[var(--text-muted)]">{note}</p></div>;
}

function severityClass(severity: CommanderRisk["severity"]): string {
  if (severity === "critical") return "bg-[var(--bad-soft)] text-[var(--bad-ink)]";
  if (severity === "high") return "bg-[var(--warn-soft)] text-[var(--warn-ink)]";
  if (severity === "medium") return "bg-[var(--brand-soft)] text-[var(--brand)]";
  return "bg-[var(--ok-soft)] text-[var(--ok-ink)]";
}

function evidenceDomains(risk: CommanderRisk): number {
  return new Set(risk.evidence.map((item) => item.domain)).size;
}

function confidenceDimensionLabel(key: string): string {
  return {
    evidenceCoverage: "Evidence coverage",
    freshness: "Evidence freshness",
    completeness: "Decision completeness",
    learningHistory: "Learning history",
  }[key] ?? humanise(key);
}
