"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, type StatusTone } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { Envelope, IncidentRow } from "../api";
import { aiopsApi } from "../api";

/**
 * AI INCIDENTS — when the AI itself was the problem.
 *
 * A separate register from ordinary system incidents, and separate on purpose. The failures
 * this technology produces do not look like outages: a confident wrong number, a guardrail
 * that let something through, a provider quietly degrading for a fortnight. They are found
 * by somebody noticing, and a register that nobody can point a regulator at is a register
 * that stops being written in.
 *
 * An empty list is a real answer here. It is also the one an auditor will test, so the
 * empty state says what would put a row in it rather than implying nothing can go wrong.
 */

/** Severity → tone. Critical gets the triangle, which is distinguishable without colour. */
function toneForSeverity(severity: string): StatusTone {
  switch (severity) {
    case "critical":
      return "overdue";
    case "high":
      return "rejected";
    case "medium":
      return "pending";
    default:
      return "unknown";
  }
}

function toneForStatus(status: string): StatusTone {
  switch (status) {
    case "open":
      return "pending";
    case "resolved":
    case "closed":
      return "done";
    default:
      return "unknown";
  }
}

export default function IncidentsScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<Envelope<IncidentRow>>(aiopsApi.incidentsPath);
  const rows = data?.data ?? [];
  const open = rows.filter((r) => r.status === "open").length;

  const columns: ReadonlyArray<Column<IncidentRow>> = [
    {
      key: "incident",
      header: "Incident",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            <code className="font-[var(--font-mono)]">{r.incidentNo}</code> — {r.title}
          </div>
          <div className="text-[12px] leading-[18px] text-[var(--text-secondary)]">{r.description}</div>
          {r.actionTaken ? (
            <div className="mt-0.5 text-[12px] leading-[18px] text-[var(--text-muted)]">
              Action taken: {r.actionTaken}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      width: "w-32",
      render: (r) => <StatusBadge tone={toneForSeverity(r.severity)} label={humanise(r.severity)} />,
    },
    {
      key: "feature",
      header: "Feature",
      width: "w-56",
      render: (r) =>
        r.featureKey ? (
          <code className="font-[var(--font-mono)] text-[12px] text-[var(--text-secondary)]">{r.featureKey}</code>
        ) : (
          // Not every AI incident belongs to one feature — a provider or a residency breach
          // is tenant-wide, and forcing it onto a feature would misfile it.
          <span className="text-[var(--text-muted)]">Whole tenant</span>
        ),
    },
    {
      key: "detected",
      header: "Detected",
      width: "w-44",
      render: (r) => <span className="text-[var(--text-secondary)]">{dateTime(r.detectedAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "w-40",
      render: (r) => (
        <div>
          <StatusBadge tone={toneForStatus(r.status)} label={humanise(r.status)} />
          {r.resolvedAt ? (
            <div className="mt-1 text-[12px] text-[var(--text-secondary)]">{dateTime(r.resolvedAt)}</div>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="AI incidents"
        subtitle="Everything that has gone wrong with the AI itself — a wrong answer that reached somebody, a guardrail that missed, a provider that degraded — and what was done about it."
        meta={
          rows.length > 0
            ? [
                { label: "Recorded", value: num(rows.length) },
                { label: "Still open", value: num(open) },
              ]
            : []
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.id}
        caption="Recorded AI incidents, their severity and their status"
        empty={
          <Empty
            title="No AI incident has been raised"
            body="Nobody has recorded a wrong answer, a missed guardrail or a provider failure. Anyone who can operate the kill switch can raise one, and the register is what an auditor asks for."
          />
        }
      />
    </div>
  );
}
