"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { TicketView } from "../api";
import { cspApi } from "../api";
import { slaClockNote, slaTone } from "../sla-clock";

/** Everything a desk still owes somebody an answer on. */
const OPEN_STATUSES = "new,triaged,in_progress,pending_customer,reopened";

/**
 * THE TICKET QUEUE.
 *
 * The SLA column is the reason this screen exists. An agent opening it is not asking "what
 * tickets are there" — they are asking "which of these will embarrass us today", and that
 * is one glance at a triangle. A breached clock is `overdue` (triangle), an at-risk one is
 * `pending` (clock face), a paused one is `hold` (pause). Three shapes, so the answer does
 * not depend on being able to tell red from amber.
 *
 * STATUS AND SLA STATE FILTER ON THE SERVER, because the queue endpoint accepts both and a
 * service desk with four thousand closed tickets should not ship them to a browser to hide
 * them. The text box filters what came back, which is instant and needs no round trip.
 *
 * ONE HONEST WRINKLE. The SLA chip on each row is computed live at read time; the SLA
 * FILTER matches the stored `sla_state` column, which is refreshed by the SLA scan rather
 * than by looking at the queue — reading a queue no longer writes to it, deliberately. So
 * between scans a row can read "Response overdue" while still sitting under "On track".
 * The alternative was a list screen that escalated tickets by being opened.
 */
export default function TicketsScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState(OPEN_STATUSES);
  const [slaFilter, setSlaFilter] = useState("");
  const [text, setText] = useState("");

  const { data, loading, error, reload } = useQuery<TicketView[]>(cspApi.ticketsPath, {
    // Empty strings are dropped by the API client rather than sent as "", so "any" really
    // does mean an unfiltered query.
    query: { status: statusFilter, slaState: slaFilter },
  });

  const all = useMemo(() => data ?? [], [data]);

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (t) =>
        t.ticketNo.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.productSerialNo ?? "").toLowerCase().includes(q),
    );
  }, [all, text]);

  const breached = useMemo(() => all.filter((t) => t.sla.state.startsWith("breached")).length, [all]);

  const columns: ReadonlyArray<Column<TicketView>> = [
    {
      key: "ticket",
      header: "Ticket",
      render: (t) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{t.ticketNo}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{t.subject}</div>
        </div>
      ),
    },
    {
      key: "about",
      header: "About",
      width: "w-52",
      render: (t) => (
        <div className="min-w-0">
          <div className="truncate text-[var(--text-primary)]">
            {t.categoryCode ? humanise(t.categoryCode) : "Not categorised"}
          </div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {/* The machine's serial is how a service engineer identifies the job on site. */}
            {t.productSerialNo ? t.productSerialNo : `via ${humanise(t.channel)}`}
          </div>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      width: "w-24",
      // Deliberately NOT a status badge. Priority is not a workflow state, and borrowing the
      // eight status colours for it would teach that amber means "waiting" here and "urgent"
      // one column over. Weight carries urgent and high instead.
      render: (t) => (
        <span
          className={
            t.priority === "urgent" || t.priority === "high"
              ? "font-semibold text-[var(--text-primary)]"
              : "text-[var(--text-secondary)]"
          }
        >
          {humanise(t.priority)}
        </span>
      ),
    },
    {
      key: "sla",
      header: "Response target",
      width: "w-64",
      render: (t) => {
        const note = slaClockNote(t.sla);
        return (
          <div className="min-w-0">
            <StatusBadge tone={slaTone(t.sla.state)} label={t.sla.chip.label} />
            {note ? (
              <div className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">{note}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width: "w-40",
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: "raised",
      header: "Raised",
      width: "w-40",
      render: (t) => (
        <div>
          <div className="text-[var(--text-primary)]">{date(t.createdAt)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">{relativeDays(t.createdAt)}</div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Product cases"
        subtitle="After-sales issues with products the factory sold—linked to the customer, machine serial, warranty cover and promised response time. XELOR technology incidents belong to RELAY."
        meta={
          all.length > 0
            ? [
                { label: "Showing", value: String(all.length) },
                { label: "Past promise", value: String(breached) },
              ]
            : []
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Filter by case, subject or machine serial…"
            aria-label="Filter product cases"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <Select
          label="Show"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: OPEN_STATUSES, label: "Still open" },
            { value: "resolved,closed", label: "Resolved and closed" },
            { value: "", label: "Everything" },
          ]}
        />

        <Select
          label="Response target"
          value={slaFilter}
          onChange={setSlaFilter}
          options={[
            { value: "", label: "Any clock" },
            { value: "breached_response", label: "Response overdue" },
            { value: "breached_resolution", label: "Resolution overdue" },
            { value: "at_risk", label: "At risk" },
            { value: "on_track", label: "On track" },
            { value: "paused", label: "Paused" },
          ]}
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        onRowClick={(t) => router.push(`/csp/ticket/${t.ticketNo}`)}
        rowKey={(t) => t.ticketNo}
        caption="After-sales product cases with response target, priority and status"
        empty={
          text ? (
            <Empty
              title="Nothing matches that filter"
              body={`No product case, subject or serial matched “${text}”.`}
            />
          ) : (
            <Empty
              title="Nothing in this view"
              body="Tickets appear here when a customer calls, emails, messages or raises one on the portal. Widen the filters above to see resolved and closed ones."
            />
          )
        }
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
