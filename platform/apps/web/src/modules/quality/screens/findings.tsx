"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { Disclosure } from "@spine/ui/disclosure";
import type { ScreenProps } from "@spine/registry/manifest";
import type { QualityFinding } from "../api";
import { qualityApi } from "../api";

export default function FindingsScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<QualityFinding[]>(qualityApi.findingsPath);
  const rows = data ?? [];
  const columns: ReadonlyArray<Column<QualityFinding>> = [
    { key: "finding", header: "Finding", width: "w-48", render: (row) => <div><b className="font-[var(--font-mono)] text-[var(--text-primary)]">{row.findingNo}</b><p className="text-[11px] text-[var(--text-secondary)]">{date(row.createdAt)}</p></div> },
    { key: "issue", header: "Non-conformance", render: (row) => <div><b className="text-[var(--text-primary)]">{row.title}</b><p className="line-clamp-2 text-[12px] text-[var(--text-secondary)]">{row.description}</p></div> },
    { key: "source", header: "Source evidence", width: "w-48", render: (row) => <div><p>{humanise(row.sourceType)}</p><p className="font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">{row.inspectionNo ?? row.sourceRef}</p></div> },
    { key: "severity", header: "Severity", width: "w-28", render: (row) => <StatusBadge status={row.severity} /> },
    { key: "status", header: "Stage", width: "w-40", render: (row) => <StatusBadge status={row.status} /> },
    { key: "owner", header: "Owner / due", width: "w-40", render: (row) => <div><p>{row.ownerRef}</p><p className="text-[11px] text-[var(--text-secondary)]">{date(row.dueDate)}</p></div> },
  ];
  const open = rows.filter((row) => row.status !== "closed").length;
  const critical = rows.filter((row) => row.severity === "critical" && row.status !== "closed").length;
  return <div className="flex flex-col gap-4">
    <PageHeader title="Quality findings" subtitle="Real non-conformances linked to the inspection, complaint, supplier or audit evidence that raised them. Containment and confirmed root cause remain separate steps." meta={rows.length ? [{ label: "Open", value: String(open) }, { label: "Critical", value: String(critical) }] : []} />
    <DataTable rows={rows} columns={columns} loading={loading} error={error} onReload={reload} rowKey={(row) => row.id} caption="Tenant-fenced quality non-conformances" empty={<Empty title="No findings recorded" body="A rejected inspection does not silently become a finding. Quality records the non-conformance and its owner explicitly." />} />
    {rows[0] ? <Disclosure title={`${rows[0].findingNo} · containment and root cause`} hint="Stored workflow evidence" defaultOpen><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="font-bold text-[var(--text-primary)]">Containment</dt><dd>{rows[0].containment ?? "Not yet recorded"}</dd></div><div><dt className="font-bold text-[var(--text-primary)]">Confirmed root cause</dt><dd>{rows[0].rootCause ?? "Investigation still open"}</dd></div></dl></Disclosure> : null}
  </div>;
}
