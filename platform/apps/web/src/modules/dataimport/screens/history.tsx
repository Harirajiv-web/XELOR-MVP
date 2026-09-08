"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { dateTime, humanise, num } from "@spine/format";
import type { ScreenProps } from "@spine/registry/manifest";
import { SourceBadge, fileSize } from "../source-badge";
import {
  dataImportApi,
  rowStatusLabel,
  rowTone,
  type BatchDetail,
  type BatchListRow,
  type CursorPage,
} from "../api";

/**
 * EVERY IMPORT THAT HAS EVER RUN, AND WHAT BECAME OF EACH ROW.
 *
 * This screen exists to answer one question, months later, when nobody remembers the file:
 * "why is this part not in the system?" The answer is a row, with the spreadsheet row number
 * it came from, the cell that caused it, and the reason it was refused — kept whether it
 * succeeded or not.
 *
 * The alternative, which almost every importer ships, is a success count. A success count
 * cannot answer that question, and the honest consequence is that somebody re-uploads the
 * whole file to be sure, which is how a master ends up with duplicates.
 *
 * `partial` is deliberately shown as its own outcome rather than rounded up to done. An
 * import that created 340 of 400 rows is not finished, and the screen that says so plainly
 * is the one that prevents the re-upload.
 */
export default function ImportHistoryScreen(_props: ScreenProps): React.JSX.Element {
  const batches = useQuery<CursorPage<BatchListRow>>(dataImportApi.batchesPath, {
    query: { limit: 25 },
  });
  const [openId, setOpenId] = useState<string | null>(null);

  const columns: ReadonlyArray<Column<BatchListRow>> = [
    {
      key: "file",
      header: "File",
      render: (b) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Provenance on every row. An imported figure is not a connected one, and the
                history is exactly where somebody goes to decide how much to trust a number. */}
            <SourceBadge kind="file" label={b.filename} />
          </div>
          <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
            sheet {b.sheetName} · {b.fileKind.toUpperCase()} · {num(b.rowCount)} rows
          </div>
        </div>
      ),
    },
    {
      key: "target",
      header: "Imported as",
      width: "w-44",
      render: (b) => (
        <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">
          {humanise(b.target)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Outcome",
      width: "w-48",
      render: (b) => (
        <div className="min-w-0">
          <StatusBadge
            tone={
              b.status === "completed"
                ? "done"
                : b.status === "partial"
                  ? "pending"
                  : b.status === "failed"
                    ? "rejected"
                    : "progress"
            }
            label={
              b.status === "partial"
                ? "Partly imported"
                : b.status === "completed"
                  ? "Imported"
                  : b.status === "failed"
                    ? "Nothing imported"
                    : "Running"
            }
          />
          <div className="mt-1 text-[11.5px] text-[var(--text-secondary)]">
            {num(b.importedCount)} in
            {b.rejectedCount > 0 ? ` · ${num(b.rejectedCount)} invalid` : ""}
            {b.failedCount > 0 ? ` · ${num(b.failedCount)} refused` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "when",
      header: "Started",
      width: "w-52",
      render: (b) => (
        <span className="text-[12px] text-[var(--text-secondary)]">{dateTime(b.startedAt)}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Import history"
        subtitle="Every spreadsheet ever imported, row by row, including the rows that were refused."
      />

      <DataTable
        rows={batches.data?.items ?? []}
        columns={columns}
        loading={batches.loading}
        error={batches.error}
        onReload={batches.reload}
        rowKey={(b) => b.id}
        onRowClick={(b) => setOpenId(b.id === openId ? null : b.id)}
        caption="Spreadsheet imports run in this tenant"
        empty={
          <Empty
            title="No spreadsheet has been imported yet"
            body="Imports run from the Import a spreadsheet screen. Every one of them lands here, with what happened to each row."
          />
        }
      />

      {openId ? <BatchRows id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function BatchRows({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element {
  const batch = useQuery<BatchDetail>(dataImportApi.batchPath(id));

  if (batch.loading) return <Loading label="Reading the import…" />;
  if (batch.error) return <ErrorState error={batch.error} onRetry={batch.reload} />;
  const b = batch.data;
  if (!b) return <Empty title="That import is no longer readable" />;

  return (
    <div className="card overflow-hidden">
      <div className="panel-h">
        <span className="flex flex-wrap items-center gap-2">
          <SourceBadge
            kind="file"
            label={b.source.filename}
            detail={fileSize(b.source.byteSize)}
          />
          <span className="text-[12px] font-normal text-[var(--text-muted)]">
            sheet {b.sheetName} · imported as {humanise(b.target)} ·{" "}
            {b.onDuplicate === "skip"
              ? "duplicates held"
              : "duplicates overridden by the operator"}
          </span>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="grid-table">
          <caption className="sr-only">
            Every row of {b.source.filename} and what became of it
          </caption>
          <thead>
            <tr>
              <th className="w-16">Row</th>
              <th className="w-52">Outcome</th>
              <th className="w-48">Created</th>
              <th>Reason, where there is one</th>
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r) => (
              <tr key={r.rowNo}>
                <td className="font-[var(--font-mono)] text-[var(--text-muted)]">{r.rowNo}</td>
                <td>
                  <span className={`chip chip-${rowTone(r.status)}`}>
                    {rowStatusLabel(r.status)}
                  </span>
                </td>
                <td className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                  {r.resultRef ?? (r.resultId ? r.resultId.slice(0, 8) : "—")}
                </td>
                <td className="text-[12px] leading-[1.5] text-[var(--text-secondary)]">
                  {r.failureMessage ??
                    (r.status === "imported" ? "" : "No reason was recorded.")}
                  {r.issues && r.issues.length > 0 ? (
                    <ul className="mt-1 list-disc pl-4">
                      {r.issues.map((issue, i) => (
                        <li key={`${issue.field}-${i}`}>
                          <b className="text-[var(--text-primary)]">{issue.label}</b>{" "}
                          {issue.value ? `“${issue.value}” — ` : ""}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.resumable ? (
        <div className="border-t border-[var(--border)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
          Accepted rows are still waiting. Re-uploading the identical file resumes only
          those rows; imported, invalid and duplicate-held rows are not repeated.
        </div>
      ) : null}
    </div>
  );
}
