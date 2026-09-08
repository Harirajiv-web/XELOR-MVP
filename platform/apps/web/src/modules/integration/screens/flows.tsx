"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DataEnvelope, FlowRow } from "../api";
import { integrationApi } from "../api";

/**
 * FLOWS — what actually moves, from where to where, and on what trigger.
 *
 * A paused flow always shows its reason. Pausing without one is refused by the API for a
 * reason this screen makes visible: a flow that is paused with no explanation is one nobody
 * dares restart, so it stays paused for months and the invoices it was carrying pile up
 * somewhere nobody is looking.
 *
 * `Statutory` is its own column rather than a note, because it changes what the system will
 * let a person do downstream — a statutory message in the dead-letter queue cannot be
 * replayed without an explicit confirmation, and this is where that starts.
 */
export default function FlowsScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<DataEnvelope<FlowRow>>(
    integrationApi.flowsPath,
  );

  const rows = data?.data ?? [];
  const paused = rows.filter((f) => f.status !== "active").length;

  const columns: ReadonlyArray<Column<FlowRow>> = [
    {
      key: "flow",
      header: "Flow",
      render: (f) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{f.name}</div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {f.code}
          </div>
        </div>
      ),
    },
    {
      key: "trigger",
      header: "Runs when",
      width: "w-40",
      render: (f) => <StatusBadge tone="unknown" label={humanise(f.triggerType)} />,
    },
    {
      key: "entity",
      header: "Carries",
      width: "w-44",
      render: (f) => (
        <span className="font-[var(--font-mono)] text-[12px]">{f.canonicalEntity}</span>
      ),
    },
    {
      key: "statutory",
      header: "Statutory",
      width: "w-32",
      // Only marked when true. A "No" badge on every non-statutory row would make the
      // column noise, and the whole point is that the marked ones stand out.
      render: (f) =>
        f.isStatutory ? (
          <StatusBadge tone="pending" label="Statutory" />
        ) : (
          <span className="text-[var(--text-secondary)]">—</span>
        ),
    },
    {
      key: "status",
      header: "State",
      width: "w-64",
      render: (f) => (
        <div className="min-w-0">
          <StatusBadge status={f.status} />
          {f.pauseReason ? (
            <div className="mt-1 max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
              {f.pauseReason}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "sla",
      header: "SLA",
      numeric: true,
      width: "w-28",
      render: (f) =>
        f.slaMs == null ? (
          <span className="text-[var(--text-muted)]">—</span>
        ) : (
          <span>{num(f.slaMs / 1000, 0)} s</span>
        ),
    },
    {
      key: "mappingCount",
      header: "Field maps",
      numeric: true,
      width: "w-32",
      // Zero mappings is worth seeing: the API refuses to pre-flight a flow with none,
      // because a dry run over nothing passes, and a pass that means nothing is worse
      // than a failure.
      render: (f) =>
        f.mappingCount === 0 ? (
          <span className="font-semibold text-[var(--status-overdue-text)]">0</span>
        ) : (
          num(f.mappingCount)
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Flows"
        subtitle="Each route a document takes out of this system or into it — a sales invoice going for an IRN, punches coming back from the biometric reader. A paused flow keeps its reason attached, so somebody other than the person who paused it can decide whether to restart it."
        meta={
          rows.length > 0
            ? [
                { label: "Flows", value: String(rows.length) },
                { label: "Not running", value: String(paused) },
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
        rowKey={(f) => f.code}
        caption="Integration flows and their state"
        empty={
          <Empty
            title="No flows configured"
            body="A flow appears here once a connection has been given something to carry. With none, the connections are wired up but nothing travels along them."
          />
        }
      />
    </div>
  );
}
