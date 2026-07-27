"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, num, qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { PlanningPolicyRow } from "../api";
import { planningApi } from "../api";

/**
 * PLANNING POLICIES — how each item gets replenished.
 *
 * Every surprising number in a plan comes from a row on this screen. "Why did it order 283?"
 * is an EOQ lot rule; "why is it ordering at all, we have plenty" is a safety stock; "why so
 * early" is a lead time. This is the settings page the planned-order list is downstream of,
 * and the reason it is worth a sidebar entry of its own is that the answer to almost every
 * complaint about MRP is on it.
 *
 * The LEVEL column is the one field nobody chooses: it is derived from the whole bill-of-
 * materials graph on every run. An item planned at the wrong level is netted before its own
 * demand exists and the run quietly under-orders — a failure with no error message and no
 * symptom until the line stops.
 */
export default function PoliciesScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<{ data: PlanningPolicyRow[] }>(
    planningApi.policiesPath,
  );
  const [filter, setFilter] = useState("");

  const all = useMemo(() => data?.data ?? [], [data]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.itemCode.toLowerCase().includes(q) ||
        r.planningMethod.toLowerCase().includes(q) ||
        r.lotRule.toLowerCase().includes(q),
    );
  }, [all, filter]);

  const columns: ReadonlyArray<Column<PlanningPolicyRow>> = [
    {
      key: "itemCode",
      header: "Item",
      render: (r) => <span className="font-semibold">{r.itemCode}</span>,
    },
    {
      key: "lowLevelCode",
      header: "Level",
      numeric: true,
      width: "w-20",
      render: (r) => <span className="text-[var(--text-secondary)]">{r.lowLevelCode}</span>,
    },
    {
      key: "planningMethod",
      header: "Replenished by",
      width: "w-40",
      // Not a workflow status, so the neutral treatment. What matters is that an item is
      // replenished by exactly ONE mechanism — MRP and a reorder point on the same item
      // order everything twice, and the database refuses that combination outright.
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.planningMethod)} />,
    },
    {
      key: "sourceType",
      header: "Make / buy",
      width: "w-28",
      render: (r) => (
        <span className="text-[var(--text-secondary)]">{humanise(r.sourceType)}</span>
      ),
    },
    {
      key: "lot",
      header: "Lot rule",
      width: "w-36",
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{r.lotRule}</div>
          {r.lotSize ? (
            <div className="text-[12px] text-[var(--text-secondary)]">size {qty(r.lotSize)}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "leadTime",
      header: "Lead time",
      numeric: true,
      width: "w-32",
      // Working days, not calendar days — the offset is walked over the plant's calendar,
      // so saying "days" alone would be a quiet lie on a six-day week with holidays.
      render: (r) => (
        <span>
          {num(r.leadTimeWorkingDays)}{" "}
          <span className="text-[var(--text-secondary)]">wd</span>
        </span>
      ),
    },
    {
      key: "safetyStock",
      header: "Safety stock",
      numeric: true,
      width: "w-32",
      render: (r) => qty(r.safetyStock),
    },
    {
      key: "reorderPoint",
      header: "Reorder point",
      numeric: true,
      width: "w-32",
      render: (r) =>
        r.reorderPoint === null ? (
          <span className="text-[var(--text-muted)]">—</span>
        ) : (
          qty(r.reorderPoint)
        ),
    },
    {
      key: "abcClass",
      header: "ABC",
      width: "w-20",
      render: (r) =>
        r.abcClass ? (
          <span className="font-semibold">{r.abcClass}</span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "isMpsItem",
      header: "MPS",
      width: "w-24",
      render: (r) =>
        r.isMpsItem ? (
          <StatusBadge tone="approved" label="Scheduled" />
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Planning policies"
        subtitle="How each item is replenished: what triggers an order, how big it is, and how far ahead it has to start. Almost every surprising quantity in a plan is explained by a row on this page."
        meta={all.length > 0 ? [{ label: "Items", value: String(all.length) }] : []}
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
          placeholder="Filter by item, method or lot rule…"
          aria-label="Filter planning policies"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.id}
        density="compact"
        caption="Planning policy per item: level, method, lot rule, lead time and safety stock"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No item, method or lot rule matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No planning policies set"
              body="An item is only planned once it has a policy here — MRP skips anything without one. Policies appear as items are set up for planning."
            />
          )
        }
      />
    </div>
  );
}
