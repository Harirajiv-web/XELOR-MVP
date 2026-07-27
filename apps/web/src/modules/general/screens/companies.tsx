"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { CompanyRow } from "../api";
import { generalApi, stateName } from "../api";

/**
 * COMPANIES — who this system says you are, and where it says you trade from.
 *
 * The registrations column is the point of the screen. One legal entity holding several
 * GSTINs, one per state, is the ordinary shape of an Indian manufacturer and the thing a
 * foreign ERP models badly or not at all — Trishul is one company with a Maharashtra
 * registration at Pune-Chakan and a Tamil Nadu one at Coimbatore, and every invoice it
 * raises is filed against exactly one of them.
 *
 * The filter searches GSTINs and place names as well as the company name, because the
 * question people actually arrive with is "which registration does this go under?".
 */
export default function CompaniesScreen(_props: ScreenProps): React.JSX.Element {
  const { rows, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<CompanyRow>(generalApi.companiesPath);
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.legalName.toLowerCase().includes(q) ||
        (r.cin ?? "").toLowerCase().includes(q) ||
        r.registrations.some(
          (g) => g.gstin.toLowerCase().includes(q) || g.placeName.toLowerCase().includes(q),
        ),
    );
  }, [rows, filter]);

  const registrationCount = rows.reduce((n, r) => n + r.registrations.length, 0);

  const columns: ReadonlyArray<Column<CompanyRow>> = [
    {
      key: "legalName",
      header: "Legal entity",
      width: "w-80",
      render: (r) => (
        <div className="min-w-0">
          {/* The legal name, not a trading name. This is the string that has to match the
              certificate of incorporation, because it is the string that prints on the
              invoice and the one a tax officer compares it against. */}
          <div className="font-semibold text-[var(--text-primary)]">{r.legalName}</div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {r.cin ? `CIN ${r.cin}` : "No CIN recorded"}
          </div>
        </div>
      ),
    },
    {
      key: "registrations",
      header: "Registered places of business",
      render: (r) =>
        r.registrations.length === 0 ? (
          // Not an empty cell. A company with no GSTIN cannot legally raise a tax invoice,
          // so its absence is a finding rather than a blank.
          <span className="text-[var(--status-overdue-text)]">
            No GST registration — this entity cannot raise a tax invoice
          </span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {r.registrations.map((g) => (
              <li key={g.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-semibold text-[var(--text-primary)]">{g.placeName}</span>
                {/* Monospaced so fifteen characters can be checked against a portal screen
                    one at a time, which is how a GSTIN is actually verified. */}
                <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-primary)]">
                  {g.gstin}
                </code>
                <span className="text-[12px] text-[var(--text-secondary)]">
                  {stateName(g.stateCode)}
                </span>
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: "count",
      header: "GSTINs",
      numeric: true,
      width: "w-32",
      // Called out rather than left as a digit: "2 states" is the whole multi-registration
      // story, and somebody scanning this column should get it without reading the cell
      // beside it.
      render: (r) =>
        r.registrations.length > 1 ? (
          <StatusBadge tone="progress" label={`${r.registrations.length} states`} />
        ) : (
          <span>{r.registrations.length}</span>
        ),
    },
    {
      key: "createdAt",
      header: "On record since",
      width: "w-44",
      render: (r) => <span className="text-[var(--text-secondary)]">{date(r.createdAt)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Companies"
        subtitle="The registered legal entities this tenant trades as, and every place each one is registered to trade from. The name, CIN and GSTIN recorded here are what appear on every invoice, e-way bill and statutory return the system produces."
        meta={
          rows.length > 0
            ? [
                { label: "Entities", value: String(rows.length) },
                { label: "GST registrations", value: String(registrationCount) },
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
          placeholder="Filter by name, CIN, GSTIN or place…"
          aria-label="Filter companies"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={shown}
        columns={columns}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        onReload={reload}
        hasMore={hasMore && !filter}
        onLoadMore={loadMore}
        rowKey={(r) => r.id}
        caption="Registered legal entities and their GST registrations"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No company, CIN, GSTIN or place matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No company on record"
              body="A company is registered during setup. Until one exists there is nothing to issue documents from, and no GSTIN to file under."
            />
          )
        }
      />
    </div>
  );
}
