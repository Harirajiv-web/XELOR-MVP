"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { Disclosure } from "@spine/ui/disclosure";
import type { ScreenProps } from "@spine/registry/manifest";
import type { CorrectiveAction } from "../api";
import { qualityApi } from "../api";

export default function CorrectiveActionsScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<CorrectiveAction[]>(qualityApi.correctiveActionsPath);
  const rows = data ?? [];
  const columns: ReadonlyArray<Column<CorrectiveAction>> = [
    { key: "capa", header: "CAPA", width: "w-48", render: (row) => <div><b className="font-[var(--font-mono)] text-[var(--text-primary)]">{row.capaNo}</b><p className="text-[11px] text-[var(--text-secondary)]">From {row.findingNo}</p></div> },
    { key: "action", header: "Corrective work", render: (row) => <div><b className="text-[var(--text-primary)]">{row.title}</b><p className="line-clamp-2 text-[12px] text-[var(--text-secondary)]">{row.actionPlan}</p></div> },
    { key: "owner", header: "Owner / due", width: "w-40", render: (row) => <div><p>{row.ownerRef}</p><p className="text-[11px] text-[var(--text-secondary)]">{date(row.dueDate)}</p></div> },
    { key: "stage", header: "Stage", width: "w-44", render: (row) => <StatusBadge status={row.status} /> },
    { key: "effect", header: "Effectiveness", width: "w-40", render: (row) => <StatusBadge status={row.effectivenessResult} /> },
  ];
  const awaiting = rows.filter((row) => row.status === "effectiveness_review").length;
  return <div className="flex flex-col gap-4">
    <PageHeader title="Corrective actions" subtitle="Work to remove a confirmed cause. Completing the task moves it to effectiveness review; it cannot close until an authorised person records evidence that the result held." meta={rows.length ? [{ label: "Active", value: String(rows.filter((row) => !["closed", "ineffective"].includes(row.status)).length) }, { label: "Human review", value: String(awaiting) }] : []} />
    <DataTable rows={rows} columns={columns} loading={loading} error={error} onReload={reload} rowKey={(row) => row.id} caption="Corrective actions and effectiveness decisions" empty={<Empty title="No corrective actions" body="A CAPA begins only after containment and a confirmed root cause." />} />
    {rows[0] ? <Disclosure title={`${rows[0].capaNo} · verification boundary`} hint={humanise(rows[0].status)} defaultOpen><div className="grid gap-3 sm:grid-cols-2"><div><b className="text-[var(--text-primary)]">Effectiveness criteria</b><p>{rows[0].effectivenessCriteria}</p></div><div><b className="text-[var(--text-primary)]">Completion evidence</b><p>{rows[0].completionEvidence ?? "Work not yet completed"}</p></div><div className="sm:col-span-2"><b className="text-[var(--text-primary)]">Human verification</b><p>{rows[0].effectivenessEvidence ?? "Pending—KILN cannot close its own recommendation."}</p></div></div></Disclosure> : null}
  </div>;
}
