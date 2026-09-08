"use client";

import { useMemo } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { StatutoryRow } from "../api";
import { hrmApi } from "../api";

/**
 * The statutes the timeline feed currently carries. Anything the API adds later renders
 * with a humanised fallback rather than disappearing, so a new statute shows up on this
 * screen the day it is seeded and not the day somebody remembers to edit this file.
 */
const STATUTE_LABELS: Record<string, string> = {
  wage_definition: "Wages, s.2(y)",
  epf: "Provident fund (EPF)",
  esi: "Employees' State Insurance",
  gratuity: "Gratuity",
  overtime: "Overtime",
};

type Standing = "current" | "superseded" | "scheduled";

/**
 * STATUTORY RATES — the screen that answers "what happens when the Budget changes a rate?"
 *
 * Every row here is a rate that WAS true from a date. Nothing is edited and nothing is
 * overwritten: a change on Budget day is a new row with a new effective-from, and the old
 * row stays exactly where it is. That is not tidiness — it is the difference between an
 * audit you can answer and one you cannot. A June-2026 payslip recomputed in 2029 resolves
 * June-2026's ceiling and June-2026's slabs, because the row that produced it is still here.
 *
 * The practical consequence, and the one worth saying out loud to a finance head: a rate
 * change is a row somebody adds in an afternoon, not a software release that waits on us.
 */
export default function StatutoryScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<StatutoryRow[]>(hrmApi.statutoryPath);
  const rows = useMemo(() => data ?? [], [data]);

  /**
   * Which row is actually in force today, per statute: the latest one whose effective-from
   * has already arrived. Derived here rather than asked of the API, because it is exactly
   * the same resolution payroll performs — `effective_from <= date`, newest first — and
   * showing a different answer from the one the calculator uses would be worse than useless.
   */
  const inForce = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.effectiveFrom > hrmApi.demoToday) continue;
      const held = map.get(r.statute);
      if (!held || r.effectiveFrom > held) map.set(r.statute, r.effectiveFrom);
    }
    return map;
  }, [rows]);

  const standingOf = (r: StatutoryRow): Standing => {
    if (r.effectiveFrom > hrmApi.demoToday) return "scheduled";
    return inForce.get(r.statute) === r.effectiveFrom ? "current" : "superseded";
  };

  const statutes = new Set(rows.map((r) => r.statute));

  const columns: ReadonlyArray<Column<StatutoryRow>> = [
    {
      key: "effectiveFrom",
      header: "Effective from",
      width: "w-44",
      // First column and the heaviest type on the screen. The date IS the mechanism; the
      // rate is only what the date carries.
      render: (r) => (
        <div>
          <div className="text-[14px] font-bold tabular-nums text-[var(--text-primary)]">
            {date(r.effectiveFrom)}
          </div>
          <div className="mt-1">
            <StandingBadge standing={standingOf(r)} />
          </div>
        </div>
      ),
    },
    {
      key: "statute",
      header: "Statute",
      width: "w-56",
      render: (r) => (
        <span className="font-semibold text-[var(--text-primary)]">
          {STATUTE_LABELS[r.statute] ?? humanise(r.statute)}
        </span>
      ),
    },
    {
      key: "summary",
      header: "What this row says",
      render: (r) => (
        <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">
          {r.summary}
        </span>
      ),
    },
    {
      key: "source",
      header: "Authority",
      width: "w-72",
      // A rate without its source is a number somebody typed. With one it is a citation an
      // auditor can follow back to the notification.
      render: (r) => (
        <span className="text-[12px] leading-5 text-[var(--text-secondary)]">
          {r.sourceNote ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Statutory rates"
        subtitle="Every PF, ESI, gratuity, overtime and wage-definition rate this system has ever applied, each one dated from the day it took effect."
        meta={
          rows.length > 0
            ? [
                { label: "Statutes", value: String(statutes.size) },
                { label: "Rate rows", value: String(rows.length) },
                { label: "As at", value: date(hrmApi.demoToday) },
              ]
            : []
        }
      />

      <p className="max-w-prose rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] leading-5 text-[var(--text-secondary)]">
        No rate on this screen can be edited, and none was ever overwritten. When a rate
        changes, somebody adds a row with the date it starts — the old row stays, and payroll
        for an earlier month keeps resolving the rate that applied to that month. A Budget-day
        change is a data entry, not a release.
      </p>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => `${r.statute}-${r.effectiveFrom}`}
        caption="Effective-dated statutory rate configuration"
        empty={
          <Empty
            title="No statutory rates configured"
            body="Payroll cannot run until this is filled: the calculators take every rate as an argument and refuse rather than guess. Rows appear here once the effective-dated PF, ESI, gratuity, overtime and wage-definition configuration has been seeded."
          />
        }
      />

      <p className="max-w-prose text-[12px] leading-5 text-[var(--text-muted)]">
        Professional tax and TDS are held the same way — effective-dated rows, never
        constants — but they resolve per state and per financial year rather than globally,
        and this timeline feed does not return them yet.
      </p>
    </div>
  );
}

/**
 * Three standings, and they are not the same fact. "In force" is what payroll will use
 * tonight; "scheduled" is a rate somebody has already entered for a future date, which is
 * the reassuring case; "superseded" is history, and it stays visible because a recomputed
 * old payslip depends on it.
 */
function StandingBadge({ standing }: { standing: Standing }): React.JSX.Element {
  if (standing === "current") return <StatusBadge tone="approved" label="In force" />;
  if (standing === "scheduled") return <StatusBadge tone="pending" label="Scheduled" />;
  return <StatusBadge tone="unknown" label="Superseded" />;
}
