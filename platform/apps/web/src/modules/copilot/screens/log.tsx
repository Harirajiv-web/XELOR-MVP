"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, type StatusTone } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { HistoryRow } from "../api";
import { copilotApi } from "../api";

/**
 * QUESTION LOG — every question, answered or not, and what each answer was read from.
 *
 * This is the screen a compliance officer buys. It records the REFUSALS as well as the
 * answers, which is the half that matters: a log of only successful questions says the
 * assistant is doing well, while a log containing everything it could not understand is
 * both the roadmap for what to build next and the evidence that a question about payroll
 * was turned away rather than quietly answered.
 *
 * The answer itself is deliberately not stored and so cannot be shown here. Keeping the
 * returned rows would put a second copy of business data outside the tables whose access
 * rules protect it — a log that would then need securing as carefully as the ledger. What
 * is here is enough to reconstruct any answer from the source of truth: which catalogue
 * question ran, with which parameters, over which tables, returning how many rows, when.
 */

/**
 * Outcome → tone, mapped by hand rather than inferred.
 *
 * `toneFor()` would colour "refused" red, because in every other module a refusal IS a
 * rejection. Here it is not: a refusal is the copilot working correctly, and a log full of
 * red rows would teach a reviewer that the assistant is failing when it is behaving exactly
 * as designed.
 */
function toneForOutcome(outcome: string): StatusTone {
  switch (outcome) {
    case "answered":
      return "done";
    case "clarify":
      return "pending";
    case "forbidden":
      return "hold";
    default:
      // refused, no_query — neutral, on purpose.
      return "unknown";
  }
}

export default function QuestionLogScreen(_props: ScreenProps): React.JSX.Element {
  // 200 is the API's ceiling. This is an audit trail; showing the default 50 would hide the
  // refusals somebody came here to count.
  const { data, loading, error, reload } = useQuery<HistoryRow[]>(copilotApi.historyPath, {
    query: { limit: 200 },
  });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.question.toLowerCase().includes(q) ||
        (r.intentKey ?? "").toLowerCase().includes(q) ||
        r.outcome.toLowerCase().includes(q),
    );
  }, [data, filter]);

  const total = data?.length ?? 0;
  const answered = (data ?? []).filter((r) => r.outcome === "answered").length;
  const refused = total - answered;

  const columns: ReadonlyArray<Column<HistoryRow>> = [
    {
      key: "askedAt",
      header: "Asked",
      width: "w-44",
      render: (r) => <span className="text-[var(--text-secondary)]">{dateTime(r.askedAt)}</span>,
    },
    {
      key: "question",
      header: "Question",
      render: (r) => (
        <div className="min-w-0">
          <div className="text-[var(--text-primary)]">{r.question}</div>
          {/* What it was understood AS, beside what was typed. A misread is only visible
              when both are on the screen together. */}
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {r.intentKey ? (
              <>
                Read as <code className="font-[var(--font-mono)]">{r.intentKey}</code> by {r.routedBy}, confidence{" "}
                {Number(r.confidence).toFixed(2)}
              </>
            ) : (
              "Matched no catalogue question."
            )}
          </div>
        </div>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      width: "w-36",
      render: (r) => <StatusBadge tone={toneForOutcome(r.outcome)} label={r.outcome.replace(/_/g, " ")} />,
    },
    {
      key: "sources",
      header: "Read from",
      width: "w-64",
      // Raw table names, not friendly labels. This column is the audit claim, and it is
      // checkable only if it says what the query actually touched.
      render: (r) =>
        r.sources.length === 0 ? (
          <span className="text-[var(--text-muted)]">Nothing was read</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {r.sources.map((s) => (
              <code
                key={s}
                className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]"
              >
                {s}
              </code>
            ))}
          </span>
        ),
    },
    {
      key: "rowCount",
      header: "Rows",
      numeric: true,
      width: "w-24",
      render: (r) => num(r.rowCount),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Question log"
        subtitle="Every question anyone has asked the copilot, whether it answered or refused, and which tables each answer was read from."
        meta={
          total > 0
            ? [
                { label: "Questions", value: num(total) },
                { label: "Answered", value: num(answered) },
                { label: "Refused or unclear", value: num(refused) },
              ]
            : []
        }
      />

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by question, intent or outcome…"
          aria-label="Filter questions"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r, i) => `${r.askedAt}-${i}`}
        caption="Questions asked of the copilot, with the outcome and sources of each"
        empty={
          filter ? (
            <Empty title="Nothing matches that filter" body={`No question matched “${filter}”.`} />
          ) : (
            <Empty
              title="Nobody has asked anything yet"
              body="Questions appear here the moment somebody uses the Ask screen — including the ones the copilot could not answer."
            />
          )
        }
      />
    </div>
  );
}
