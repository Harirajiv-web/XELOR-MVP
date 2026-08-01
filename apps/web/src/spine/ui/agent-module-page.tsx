"use client";

import Link from "next/link";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { Disclosure } from "./disclosure";

export type ModuleTone = "neutral" | "good" | "watch" | "risk" | "ai";

export interface ModuleMetric {
  label: string;
  value: string;
  note: string;
  tone?: ModuleTone;
  trend?: string;
}

export interface ModuleAction {
  title: string;
  detail: string;
  owner: string;
  due: string;
  tone?: ModuleTone;
  status?: string;
}

export interface ModuleStage {
  label: string;
  value: string;
  note: string;
  tone?: ModuleTone;
}

export interface ModuleEvidence {
  label: string;
  value: string;
}

export interface AgentModulePageProps {
  title: string;
  description: string;
  eyebrow: string;
  agent: {
    code: "RASP" | "KILN";
    name: string;
    purpose: string;
    accent: string;
    icon: string;
  };
  updated: string;
  metrics: readonly ModuleMetric[];
  actions: readonly ModuleAction[];
  stages?: readonly ModuleStage[];
  insight: {
    title: string;
    summary: string;
    evidence: readonly string[];
    caution: string;
  };
  evidence?: readonly ModuleEvidence[];
  emptyActionText?: string;
  /** This component currently renders curated scenario content, never live API records. */
  evidenceMode?: "illustrative";
}

const toneClass: Record<ModuleTone, string> = {
  neutral: "border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)]",
  good: "border-[color-mix(in_srgb,var(--ok)_28%,var(--border-subtle))] bg-[var(--ok-soft)] text-[var(--ok-ink)]",
  watch: "border-[color-mix(in_srgb,var(--warn)_28%,var(--border-subtle))] bg-[var(--warn-soft)] text-[var(--warn-ink)]",
  risk: "border-[color-mix(in_srgb,var(--bad)_28%,var(--border-subtle))] bg-[var(--bad-soft)] text-[var(--bad-ink)]",
  ai: "border-[color-mix(in_srgb,var(--violet)_30%,var(--border-subtle))] bg-[var(--violet-soft)] text-[var(--ai-text)]",
};

function iconOf(name: string): LucideIcon {
  return (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Circle;
}

export function AgentModulePage({
  title,
  description,
  eyebrow,
  agent,
  updated,
  metrics,
  actions,
  stages = [],
  insight,
  evidence = [],
  emptyActionText = "Nothing needs attention right now.",
  evidenceMode = "illustrative",
}: AgentModulePageProps): React.JSX.Element {
  const AgentIcon = iconOf(agent.icon);

  return (
    <div className="flex flex-col gap-5">
      {evidenceMode === "illustrative" ? (
        <div role="note" className="flex items-start gap-2.5 rounded-[12px] border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-amber-800 dark:text-amber-200">
          <Icons.FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[.08em]">Illustrative workspace</p>
            <p className="mt-0.5 text-[10.5px] leading-4">These values demonstrate the intended decision experience; they are sample scenarios, not calculations from the live tenant ledger.</p>
          </div>
        </div>
      ) : null}
      <section
        className="relative overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-md)]"
        aria-label={`${title} summary`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background: `radial-gradient(circle at 4% 0%, color-mix(in srgb, ${agent.accent} 18%, transparent) 0, transparent 36%), radial-gradient(circle at 96% 100%, var(--violet-soft) 0, transparent 30%)`,
          }}
          aria-hidden
        />
        <div className="relative grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-6">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-[24px] font-extrabold tracking-[-0.025em] text-[var(--text-primary)]">
              {title}
            </h1>
            <p className="mt-2 max-w-[68ch] text-[13px] leading-6 text-[var(--text-secondary)]">
              {description}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_78%,transparent)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--text-muted)] backdrop-blur">
              <Icons.Clock3 className="h-3 w-3" aria-hidden />
              Updated {updated}
            </p>
          </div>

          <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_88%,transparent)] p-4 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] text-white shadow-[var(--shadow-md)]"
                style={{ background: agent.accent }}
              >
                <AgentIcon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Agent owner
                </p>
                <p className="mt-0.5 text-[15px] font-extrabold text-[var(--text-primary)]">
                  {agent.code} · {agent.name}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] leading-5 text-[var(--text-secondary)]">
              {agent.purpose}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Key figures">
        {metrics.slice(0, 3).map((metric) => {
          const tone = metric.tone ?? "neutral";
          return (
            <article
              key={metric.label}
              className={cn(
                "relative overflow-hidden rounded-[14px] border p-4 shadow-[var(--shadow-sm)]",
                toneClass[tone],
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] opacity-80">
                  {metric.label}
                </p>
                {metric.trend ? (
                  <span className="rounded-full bg-[color-mix(in_srgb,currentColor_9%,transparent)] px-2 py-0.5 text-[10px] font-bold">
                    {metric.trend}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-[25px] font-extrabold tracking-[-0.03em]">{metric.value}</p>
              <p className="mt-1 text-[11.5px] leading-5 opacity-80">{metric.note}</p>
            </article>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
            <div>
              <h2 className="text-[14px] font-extrabold text-[var(--text-primary)]">
                What needs attention
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                Sorted by urgency, with a clear owner and next date.
              </p>
            </div>
            <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-secondary)]">
              {actions.length} item{actions.length === 1 ? "" : "s"}
            </span>
          </div>

          {actions.length > 0 ? (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {actions.map((action) => {
                const tone = action.tone ?? "neutral";
                return (
                  <li key={`${action.title}-${action.due}`} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[10px_minmax(0,1fr)_auto] sm:items-center">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        tone === "good" && "bg-[var(--ok)]",
                        tone === "watch" && "bg-[var(--warn)]",
                        tone === "risk" && "bg-[var(--bad)]",
                        tone === "ai" && "bg-[var(--violet)]",
                        tone === "neutral" && "bg-[var(--text-muted)]",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[12.5px] text-[var(--text-primary)]">
                          {action.title}
                        </p>
                        {action.status ? (
                          <span className={cn("rounded-full border px-2 py-0.5 text-[9.5px] font-bold", toneClass[tone])}>
                            {action.status}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">
                        {action.detail}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[10.5px] font-semibold text-[var(--text-primary)]">{action.owner}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{action.due}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="grid place-items-center px-4 py-10 text-center">
              <Icons.CircleCheckBig className="h-7 w-7 text-[var(--ok)]" aria-hidden />
              <p className="mt-2 text-[12px] text-[var(--text-secondary)]">{emptyActionText}</p>
            </div>
          )}
        </section>

        <aside className="overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--violet)_26%,var(--border-subtle))] bg-[var(--violet-soft)]">
          <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--violet)_20%,var(--border-subtle))] px-4 py-3.5">
            <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[var(--violet)] text-white">
              <Icons.Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div>
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-[var(--ai-text)]">
                {agent.code} analysis
              </p>
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">{insight.title}</h2>
            </div>
          </div>
          <div className="p-4">
            <p className="text-[12px] leading-5 text-[var(--text-primary)]">{insight.summary}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {insight.evidence.map((item) => (
                <li key={item} className="flex gap-2 text-[11px] leading-4.5 text-[var(--text-secondary)]">
                  <Icons.Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--ai-text)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-[9px] border border-[color-mix(in_srgb,var(--violet)_20%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] px-3 py-2 text-[10px] leading-4 text-[var(--text-secondary)]">
              {insight.caution}
            </p>
            <div className="mt-3 grid gap-2">
              <Link
                href="/agentos/approvals"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-[var(--violet)] px-3 text-[11px] font-bold text-white shadow-[var(--shadow-sm)] transition-[filter] hover:brightness-95"
              >
                <Icons.UserRoundCheck className="h-3.5 w-3.5" aria-hidden />
                Review human approvals
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/copilot/ask" className="btn btn-ghost btn-sm justify-center">
                  Ask ONYX
                </Link>
                <Link href="/agentos/command" className="btn btn-ghost btn-sm justify-center">
                  Mission Control
                </Link>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {stages.length > 0 ? (
        <section className="card p-4">
          <div className="mb-3">
            <h2 className="text-[14px] font-extrabold text-[var(--text-primary)]">Work flow</h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              A simple view of where the work stands.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {stages.map((stage, index) => {
              const tone = stage.tone ?? "neutral";
              return (
                <article key={stage.label} className={cn("relative rounded-[11px] border p-3", toneClass[tone])}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[color-mix(in_srgb,currentColor_12%,transparent)] text-[9px] font-extrabold">
                      {index + 1}
                    </span>
                    <b className="text-[15px]">{stage.value}</b>
                  </div>
                  <h3 className="mt-2 text-[11px] font-bold">{stage.label}</h3>
                  <p className="mt-1 text-[10px] leading-4 opacity-80">{stage.note}</p>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {evidence.length > 0 ? (
        <Disclosure title="View source details" hint={`${evidence.length} checks behind this view`}>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {evidence.map((item) => (
              <div key={item.label} className="rounded-[9px] border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
                <dt className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {item.label}
                </dt>
                <dd className="mt-1 text-[11.5px] font-semibold text-[var(--text-primary)]">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      ) : null}
    </div>
  );
}
