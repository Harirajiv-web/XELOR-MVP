"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, inr, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { cn } from "@spine/ui/cn";
import type { ScreenProps } from "@spine/registry/manifest";
import type { CostDashboard, CostFeature } from "../api";
import { aiopsApi } from "../api";

/**
 * COST AND BUDGET — what the AI actually spends, beside whether the spend bought anything.
 *
 * Cost per feature on its own is a number with no opinion attached. Put ACCEPTANCE next to
 * it and the two together answer the only question a factory owner has: is this worth
 * paying for? A feature costing ₹4,000 a month whose drafts a person accepts nine times in
 * ten is cheap; the same ₹4,000 at one in ten is a subscription to re-typing.
 *
 * The FALLBACK rate is here for a different reason. It is the share of calls that quietly
 * ran on the deterministic path instead — the product still worked, which is the design, but
 * a rate creeping upward means a provider is failing and nobody has noticed.
 */

/** `GET /aiops/cost` answers 422 without both `from` and `to`. There is no default window. */
const WINDOWS = [
  { key: "month", label: "This month" },
  { key: "d30", label: "Last 30 days" },
  { key: "d90", label: "Last 90 days" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangeFor(key: WindowKey): { from: string; to: string } {
  const today = new Date();
  if (key === "month") {
    return { from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDay(today) };
  }
  const days = key === "d30" ? 30 : 90;
  return { from: isoDay(new Date(today.getTime() - days * 86_400_000)), to: isoDay(today) };
}

/** Rates arrive as 0–1. Null means nothing has been reviewed, which is not the same as zero. */
function percent(rate: number | null): string {
  if (rate === null) return "—";
  return `${num(rate * 100, 0)}%`;
}

export default function CostScreen(_props: ScreenProps): React.JSX.Element {
  const [windowKey, setWindowKey] = useState<WindowKey>("month");
  const range = useMemo(() => rangeFor(windowKey), [windowKey]);

  const { data, loading, error, reload } = useQuery<CostDashboard>(aiopsApi.costPath, {
    query: { from: range.from, to: range.to },
  });
  const rows = data?.features ?? [];

  const columns: ReadonlyArray<Column<CostFeature>> = [
    {
      key: "feature",
      header: "Feature",
      render: (r) => (
        <code className="font-[var(--font-mono)] text-[var(--text-primary)]">{r.featureKey}</code>
      ),
    },
    { key: "calls", header: "Calls", numeric: true, width: "w-28", render: (r) => num(r.calls) },
    {
      key: "cost",
      header: "Cost",
      numeric: true,
      width: "w-36",
      render: (r) => <span className="font-semibold">{inr(r.cost)}</span>,
    },
    {
      key: "perCall",
      header: "Per call",
      numeric: true,
      width: "w-32",
      render: (r) => inr(r.costPerCall),
    },
    {
      key: "accepted",
      header: "Accepted by a person",
      numeric: true,
      width: "w-44",
      // "—" rather than 0%: nobody having looked yet is a different situation from everybody
      // having rejected it, and they lead to different conversations.
      render: (r) =>
        r.acceptanceRate === null ? (
          <span className="text-[var(--text-muted)]">Not reviewed</span>
        ) : (
          percent(r.acceptanceRate)
        ),
    },
    {
      key: "fallback",
      header: "Ran on fallback",
      numeric: true,
      width: "w-40",
      render: (r) => percent(r.fallbackRate),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cost & budget"
        subtitle="What every AI feature has cost in this window, and how often a person accepted what it produced. Every call is priced at the rate in force on the day it ran."
        meta={
          data
            ? [
                { label: "Total", value: inr(data.totalCost) },
                { label: "From", value: date(data.from) },
                { label: "To", value: date(data.to) },
              ]
            : []
        }
        actions={
          <div className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWindowKey(w.key)}
                className={cn(
                  "rounded-[var(--radius-control)] border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  windowKey === w.key
                    ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        }
      />

      {data ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[13px] leading-5 text-[var(--text-secondary)]">
          {data.headline}
        </div>
      ) : null}

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.featureKey}
        caption="AI cost per feature, with acceptance and fallback rates"
        empty={
          <Empty
            title="No AI calls in this window"
            body="Nothing was spent. Calls appear here as they are metered — including the ones that fell back to the plain rules and cost nothing."
          />
        }
      />
    </div>
  );
}
