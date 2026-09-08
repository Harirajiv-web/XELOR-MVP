"use client";

import type { ReactNode } from "react";
import { useQuery } from "@spine/data/use-query";
import { Empty, ErrorState, Loading } from "@spine/states";
import { humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ServiceDashboard } from "../api";
import { cspApi } from "../api";
import { slaTone } from "../sla-clock";

/**
 * THE SERVICE MANAGER'S DASHBOARD.
 *
 * Read-only tiles, and four choices in here are the whole point:
 *
 *  - SLA COMPLIANCE SHOWS ITS DENOMINATOR. "94%" of what is the question a manager should
 *    not have to ask, and untriaged tickets carry no policy and are excluded — the backend
 *    says so in a note, and the note is printed rather than paraphrased.
 *  - BACKLOG AGE IS A DISTRIBUTION, NOT AN AVERAGE. One ticket sitting for forty days and
 *    thirty fresh ones average out to something reassuring and false.
 *  - NULL IS NOT ZERO. A compliance percentage of `null` means nothing has a verdict yet;
 *    rendering it as 0% would read as "everything breached".
 *  - THE AI OVERRIDE RATE IS ON THE MANAGER'S SCREEN, not in an ops console. The person who
 *    watches agents correct the suggestions is the person who should see how often they do.
 */
export default function DashboardScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<ServiceDashboard>(cspApi.serviceDashboardPath);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading the service dashboard…" />;

  const { tickets, sla, backlogAge, agentLoad, complaintPareto, csat, ai } = data;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Product care dashboard"
        subtitle="How after-sales product care is doing: what is open, which response promises are at risk, what keeps failing and where customers need follow-up."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Open product cases"
          value={num(tickets.open)}
          note={`of ${num(tickets.total)} ever raised`}
        />
        <Tile
          label="Response target met"
          value={sla.compliancePct == null ? "—" : `${num(sla.compliancePct, 1)}%`}
          note={
            sla.compliancePct == null
              ? "No ticket has a policy attached yet"
              : `${num(sla.met)} met of ${num(sla.withVerdict)} with a verdict`
          }
        />
        <Tile
          label="Past their promise"
          value={num(sla.breached)}
          note={sla.breached > 0 ? "Each one is a customer already waiting too long" : "Nothing overdue"}
        />
        <Tile
          label="Average satisfaction"
          value={csat.averageCsat == null ? "—" : `${num(csat.averageCsat, 1)} / 5`}
          note={`${num(csat.responded)} of ${num(csat.sent)} surveys answered`}
        />
      </div>

      {/* The denominator's caveat, in the backend's own words. Paraphrasing a statistical
          caveat is how it stops being true. */}
      <p className="max-w-prose text-[12px] leading-5 text-[var(--text-muted)]">{sla.note}</p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="How long open product cases have been waiting">
          <Distribution counts={backlogAge} total={tickets.open} labelOf={(k) => humanise(k)} />
        </Panel>

        <Panel title="Where the clocks stand">
          <ul className="flex flex-col gap-2">
            {Object.entries(tickets.bySlaState).map(([state, count]) => (
              <li key={state} className="flex items-center justify-between gap-3">
                <StatusBadge tone={slaTone(state)} label={humanise(state)} />
                <span className="text-[13px] font-semibold tabular-nums" data-numeric="">
                  {num(count)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Product cases by status">
          <ul className="flex flex-col gap-2">
            {Object.entries(tickets.byStatus).map(([status, count]) => (
              <li key={status} className="flex items-center justify-between gap-3">
                <StatusBadge status={status} />
                <span className="text-[13px] font-semibold tabular-nums" data-numeric="">
                  {num(count)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="What keeps breaking">
          {complaintPareto.length === 0 ? (
            <Empty
              title="No formal complaints"
              body="Symptoms appear here once a ticket has been escalated into a complaint for Quality to investigate."
            />
          ) : (
            <ol className="flex flex-col gap-2">
              {complaintPareto.map((p) => (
                <li key={p.symptom} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-[var(--text-primary)]">{p.symptom}</span>
                  <span className="shrink-0 font-semibold tabular-nums" data-numeric="">
                    {num(p.count)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Who is carrying the open work">
          <Distribution
            counts={agentLoad}
            total={tickets.open}
            // Owners are stored as employee references, so anything that is not the literal
            // "unassigned" bucket is shown as the reference it is rather than a made-up name.
            labelOf={(k) => (k === "unassigned" ? "Nobody yet" : k.slice(0, 8))}
          />
        </Panel>

        <Panel title="How often the assistant is corrected">
          <div className="flex flex-col gap-2 text-[13px]">
            <Row label="Suggestions made" value={num(ai.suggestions)} />
            <Row label="Accepted as offered" value={num(ai.accepted)} />
            <Row label="Edited by an agent" value={num(ai.edited)} />
            <Row label="Dismissed" value={num(ai.dismissed)} />
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-2">
              <span className="font-semibold text-[var(--text-primary)]">Override rate</span>
              <span className="flex items-center gap-2">
                <span className="font-semibold tabular-nums" data-numeric="">
                  {num(ai.overrideRatePct, 1)}%
                </span>
                {/* Drift is the signal to re-run the golden set BEFORE a customer notices
                    the classifier has gone stale — so it gets a badge, not a footnote. */}
                {ai.driftAlert ? <StatusBadge tone="overdue" label="Drifting" /> : null}
              </span>
            </div>
            <p className="text-[12px] leading-5 text-[var(--text-muted)]">
              It passed its evaluation at {num(ai.evalOverrideRatePct, 1)}%. Corrections were{" "}
              {num(ai.byField.category)} on category and {num(ai.byField.priority)} on priority.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className="mt-1 text-[24px] font-bold leading-8 tabular-nums text-[var(--text-primary)]"
        data-numeric=""
      >
        {value}
      </div>
      {note ? <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{note}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <h2 className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-semibold tabular-nums text-[var(--text-primary)]" data-numeric="">
        {value}
      </span>
    </div>
  );
}

/**
 * A count per bucket with a proportional bar.
 *
 * The NUMBER is the fact and the bar is the shape of it — never the bar alone. A bar with
 * no number is a picture of a statistic rather than the statistic, and this is a screen
 * people make staffing decisions on.
 */
function Distribution({
  counts,
  total,
  labelOf,
}: {
  counts: Record<string, number>;
  total: number;
  labelOf: (key: string) => string;
}): React.JSX.Element {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return <Empty title="Nothing open" body="Nothing is waiting on the desk right now." />;
  }
  const largest = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <ul className="flex flex-col gap-2">
      {entries.map(([key, value]) => (
        <li key={key} className="flex items-center gap-3 text-[13px]">
          <span className="w-28 shrink-0 truncate text-[var(--text-secondary)]">{labelOf(key)}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <span
              className="block h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${Math.round((value / largest) * 100)}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right font-semibold tabular-nums" data-numeric="">
            {num(value)}
            {total > 0 ? (
              <span className="ml-1 font-normal text-[var(--text-muted)]">
                {Math.round((value / total) * 100)}%
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
