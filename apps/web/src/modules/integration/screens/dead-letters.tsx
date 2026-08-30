"use client";

import { useState } from "react";
import { CircleSlash, TriangleAlert } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DlqEntryRow, DlqSummary } from "../api";
import { integrationApi, severityTone } from "../api";

/** The queue's own states. `new` is what the endpoint defaults to; it is sent explicitly. */
const STATUSES = [
  { value: "new", label: "Needing attention" },
  { value: "retrying", label: "Being retried" },
  { value: "resolved", label: "Resolved" },
] as const;

/**
 * DEAD LETTERS — everything that did not arrive, with the triage already attached.
 *
 * Nothing is dropped anywhere in this system, which is why this queue exists: a message that
 * failed and is visible is recoverable, and a message nobody knows vanished is not.
 *
 * The triage comes from a deterministic table, not from a model. INTEGRATION is the one
 * module with an explicit "no AI" entry in the registry and this is the reason — the error
 * category already determines what a person should do, and a model guessing at it would be
 * slower, unauditable, and capable of a confident wrong answer about a tax filing.
 *
 * READ-ONLY. This pass shows whether a replay WOULD be allowed and why; it does not offer
 * the button. A queue that replays on one click is how the same invoice reaches the tax
 * portal four times, and unlike most mistakes in an ERP that one is visible to a regulator
 * and cannot be quietly undone.
 */
export default function DeadLettersScreen(_props: ScreenProps): React.JSX.Element {
  const [status, setStatus] = useState<string>("new");

  // `/integration/dlq` answers the summary object itself, not a `{data}` envelope.
  const { data, loading, error, reload } = useQuery<DlqSummary>(integrationApi.dlqPath, {
    query: { status },
  });

  const rows = data?.entries ?? [];

  const columns: ReadonlyArray<Column<DlqEntryRow>> = [
    {
      key: "severity",
      header: "Severity",
      width: "w-28",
      render: (e) => <StatusBadge tone={severityTone(e.severity)} label={humanise(e.severity)} />,
    },
    {
      key: "message",
      header: "Message",
      render: (e) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{e.flowCode}</div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {e.correlationId}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <StatusBadge tone="unknown" label={humanise(e.category)} />
            {e.isStatutory ? <StatusBadge tone="pending" label="Statutory" /> : null}
            {/* The fact that decides whether a replay is safe at all. A timeout may
                already have taken effect on the far side, and a second send would be a
                second document, not a retry. */}
            {e.sideEffectPossible ? (
              <StatusBadge tone="overdue" label="May already have landed" />
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "suggestedAction",
      header: "What to do",
      render: (e) => (
        <span className="max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
          {e.suggestedAction}
        </span>
      ),
    },
    {
      key: "replay",
      header: "Replay",
      width: "w-64",
      // Three outcomes, three shapes: allowed, allowed-with-confirmation, refused. The
      // middle one is the interesting case and collapsing it into "allowed" is how a
      // statutory document gets filed twice.
      render: (e) => (
        <div className="min-w-0">
          {!e.replayAllowed ? (
            <StatusBadge tone="rejected" label="Refused" />
          ) : e.replayRequiresConfirmation ? (
            <StatusBadge tone="pending" label="Needs confirmation" />
          ) : (
            <StatusBadge tone="approved" label="Safe to replay" />
          )}
          <div className="mt-1 max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
            {e.replayVerdict}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Dead letters"
        subtitle="Messages that failed to reach the other end and stopped being retried. Nothing is discarded — every one lands here with the reason it failed and what a person should do about it before anything is sent again."
        meta={
          data
            ? [
                { label: "In queue", value: String(data.total) },
                { label: "Safe to replay", value: String(data.replayableNow) },
                { label: "Need a person first", value: String(data.needsHumanFirst) },
              ]
            : []
        }
      />

      {data && data.total > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <div className="flex gap-2.5">
            {data.needsHumanFirst > 0 ? (
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-overdue-text)]"
                aria-hidden
              />
            ) : (
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
            )}
            <div className="min-w-0 text-[13px] leading-5">
              <p className="font-semibold text-[var(--text-primary)]">{data.headline}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[var(--text-secondary)]">
                {Object.entries(data.byCategory).map(([category, count]) => (
                  <span key={category}>
                    {humanise(category)}: <span data-numeric="">{num(count)}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="dlq-status"
          className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]"
        >
          Showing
        </label>
        <select
          id="dlq-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2.5 text-[13px] text-[var(--text-primary)]"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(e) => e.id}
        caption="Dead-lettered messages with their triage and replay verdict"
        empty={
          status === "new" ? (
            <Empty
              title="Nothing is stuck"
              body="A message lands here when it has failed and stopped being retried. An empty queue means everything that was sent arrived — or that nothing has been sent yet."
            />
          ) : (
            <Empty
              title="Nothing in this state"
              body="No dead letter currently sits here. Resolved ones are kept with the note that closed them, so the same failure is not diagnosed from scratch three months later."
            />
          )
        }
      />
    </div>
  );
}
