"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { cn } from "@spine/ui/cn";
import type { ScreenProps } from "@spine/registry/manifest";
import type { PlanExceptionRow, PlanExceptionSummary } from "../api";
import { planningApi, severityTone } from "../api";

const SEVERITIES = [
  { value: "", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

/**
 * THE EXCEPTION WORKLIST — the module's home screen, and the only part of a plan most
 * people should ever read.
 *
 * A regenerative run over a real factory produces thousands of planned orders and almost
 * none of them need a human. These are the ones that do.
 *
 * AN EXCEPTION IS A MESSAGE TO A PERSON, NOT A LOG LINE. The backend writes both halves —
 * what happened, and what to do about it — as full sentences, and this screen shows both
 * rather than reducing them to a code and a count. A worklist that says
 * `RESCHEDULE_IN / PMP-CP50 / 2` is a worklist somebody has to be trained to read; a
 * worklist that says the casting is arriving two weeks after the pump is due out is one they
 * can act on in their first week.
 *
 * Nothing here can be accepted, snoozed or closed in this pass. Those are decisions about
 * material and money, they are attributable, and they belong behind an approval gate.
 */
export default function ExceptionsScreen(_props: ScreenProps): React.JSX.Element {
  const [severity, setSeverity] = useState<string>("");

  const summary = useQuery<PlanExceptionSummary>(planningApi.exceptionSummaryPath);
  const { data, loading, error, reload } = useQuery<{ data: PlanExceptionRow[] }>(
    planningApi.exceptionsPath,
    { query: { severity } },
  );

  const rows = data?.data ?? [];
  const counts = summary.data?.bySeverity ?? {};

  const columns: ReadonlyArray<Column<PlanExceptionRow>> = [
    {
      key: "severity",
      header: "Severity",
      width: "w-28",
      render: (r) => <StatusBadge tone={severityTone(r.severity)} label={humanise(r.severity)} />,
    },
    {
      key: "item",
      header: "Item",
      width: "w-44",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.itemCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {humanise(r.exceptionType)}
          </div>
        </div>
      ),
    },
    {
      key: "message",
      header: "What happened",
      // Two lines, deliberately: the fact and the response. Collapsing them into one field
      // is how a worklist turns into something people scroll past.
      render: (r) => (
        <div className="min-w-0 max-w-prose">
          <div className="leading-5 text-[var(--text-primary)]">{r.message}</div>
          <div className="mt-0.5 text-[12px] leading-5 text-[var(--text-secondary)]">
            {r.suggestion}
          </div>
          {r.ref ? (
            <div className="mt-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
              {r.ref}
              {r.pegRef ? ` · caused by ${r.pegRef}` : ""}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "move",
      header: "Move",
      width: "w-40",
      // Reschedule exceptions are the majority, and "from this week to that week" is the
      // whole content of one. Shown as the move rather than as two separate columns nobody
      // reads together.
      render: (r) =>
        r.currentBucket && r.suggestedBucket ? (
          <div>
            <div className="text-[var(--text-primary)]">
              {r.currentBucket} → {r.suggestedBucket}
            </div>
            {r.bucketsMoved !== null ? (
              <div className="text-[12px] text-[var(--text-secondary)]">
                {Math.abs(r.bucketsMoved)} week{Math.abs(r.bucketsMoved) === 1 ? "" : "s"}{" "}
                {r.bucketsMoved < 0 ? "earlier" : "later"}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-48",
      render: (r) => (
        <div>
          <StatusBadge status={r.status} />
          {r.snoozedUntil ? (
            <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              back {date(r.snoozedUntil)} · {relativeDays(r.snoozedUntil)}
            </div>
          ) : null}
          {r.actionNote ? (
            <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
              {r.actionNote}
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Planning exceptions"
        subtitle="The things in the plan that will go wrong unless somebody does something. Worst first — work down the page and stop when the time runs out."
        {...(summary.data ? { meta: [{ label: "Open", value: String(summary.data.openCount) }] } : {})}
      />

      {/* The headline band. One sentence a plant manager can act on, written by the run
          itself — not assembled here, so it cannot disagree with the counts beside it. */}
      {summary.data ? (
        <section
          className={cn(
            "rounded-[var(--radius-card)] border p-4",
            (counts.critical ?? 0) > 0
              ? "border-[var(--status-overdue-text)] bg-[var(--status-overdue-bg)]"
              : "border-[var(--border-subtle)] bg-[var(--surface)]",
          )}
        >
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">
            {summary.data.headline}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {SEVERITIES.filter((s) => s.value !== "").map((s) => (
              <span key={s.value} className="flex items-center gap-1.5">
                <StatusBadge tone={severityTone(s.value)} label={s.label} />
                <span className="text-[13px] tabular-nums text-[var(--text-secondary)]">
                  {counts[s.value] ?? 0}
                </span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex items-center gap-1" role="group" aria-label="Filter by severity">
        {SEVERITIES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSeverity(s.value)}
            aria-pressed={severity === s.value}
            className={cn(
              "h-9 rounded-[var(--radius-control)] border px-3 text-[13px] font-medium transition-colors",
              severity === s.value
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.id}
        caption="Open planning exceptions from the latest MRP run, worst first"
        empty={
          severity ? (
            <Empty
              title={`No ${severity} exceptions`}
              body="Nothing at this severity in the latest run. Try All to see the rest of the worklist."
            />
          ) : (
            <Empty
              title="No exceptions in the plan"
              body="Exceptions appear here after an MRP run finds something that needs a decision — a shortage, an order that should have been released already, or supply arriving after it is wanted. An empty list means either the plan is clean or MRP has not been run."
            />
          )
        }
      />
    </div>
  );
}
