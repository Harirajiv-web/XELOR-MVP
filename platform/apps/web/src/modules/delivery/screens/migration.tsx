"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState } from "@spine/states";
import { dateTime, humanise, num } from "@spine/format";
import { StatusBadge, toneFor } from "@spine/ui/status-badge";
import { Disclosure } from "@spine/ui/disclosure";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  deliveryApi,
  DELIVERY_PAGE_SIZE,
  reconcile,
  type ImportBatchDetail,
  type ImportBatchListRow,
  type ImportBatchRow,
} from "../api";
import { Bound, Fact, Field, NeverClaim, NotStored, Panel, Recorded, Stat } from "../evidence";

/**
 * MIGRATION — the workbench, and the reconciliation report that gates acceptance.
 *
 * A migration is not finished when the import reports success. It is finished when somebody
 * on the customer's side has checked that what came out matches what went in, and has said
 * so. The gap between those two moments is where migrations actually fail, and it fails
 * quietly: a load reports "completed", the project moves on, and in month three a
 * storekeeper cannot find a part number that was in the spreadsheet all along.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ARITHMETIC IS THE POINT
 * ---------------------------------------------------------------------------
 * The reconciliation below is three numbers and a subtraction:
 *
 *     presented  − landed  − refused  =  UNACCOUNTED
 *
 * `presented` is every row in the customer's file. `landed` is the rows that became records
 * they can search for. `refused` is the rows the system declined, each with a recorded
 * reason the customer can read. Anything left over is a row that went in and cannot be
 * found — and there is no benign explanation for that number being above zero.
 *
 * It is deliberately a subtraction rather than a status. A batch whose status says
 * "completed" has told you the process ended, not that the data arrived; those are different
 * facts and this screen refuses to collapse them. `reconcile()` in `api.ts` does the
 * arithmetic, in code, over the batch's own counters. No model is consulted and none could
 * be — this is subtraction, and a language model asked whether a migration "looks fine"
 * will sometimes say yes because the sentence flowed better.
 *
 * REFUSED IS NOT A FAILURE, AND IS NOT ROUNDED UP TO ONE. A row refused because a part
 * number does not exist yet is the system doing its job and the customer's decision to make.
 * What matters is that the refusal has a reason attached and that somebody chose what to do
 * about it. A screen that reported "1,450 of 1,500 imported — 97%" and moved on would have
 * concealed fifty decisions.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCREEN DOES NOT DO
 * ---------------------------------------------------------------------------
 * It does not run imports. That is the import wizard's job and it lives in its own module
 * with its own permissions; duplicating the upload here would put two code paths in front
 * of the same table. This screen reads the loads that wizard produced and answers the
 * question the wizard cannot: may this be accepted?
 *
 * And it does not RECORD the acceptance. There is no migration-acceptance table, this module
 * may not create one, and so the sign-off panel at the bottom is explicitly a structure
 * rather than a record. The reconciliation figure is real; the signature is not here.
 */
export default function MigrationScreen(_props: ScreenProps): React.JSX.Element {
  const batches = useCursorList<ImportBatchListRow>(deliveryApi.importBatchesPath, {
    limit: DELIVERY_PAGE_SIZE,
  });
  const [selectedId, setSelectedId] = useState("");

  const totals = useMemo(() => {
    let presented = 0;
    let landed = 0;
    let refused = 0;
    let unaccounted = 0;
    let unreconciled = 0;
    for (const batch of batches.rows) {
      const r = reconcile(batch);
      presented += r.presented;
      landed += r.landed;
      refused += r.refused;
      unaccounted += r.unaccounted;
      if (!r.reconciled) unreconciled += 1;
    }
    return { presented, landed, refused, unaccounted, unreconciled };
  }, [batches.rows]);

  const selected = batches.rows.find((b) => b.id === selectedId) ?? batches.rows[0];

  const columns: ReadonlyArray<Column<ImportBatchListRow>> = [
    {
      key: "file",
      header: "Load",
      render: (batch) => (
        <button
          type="button"
          className="text-left font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
          onClick={() => setSelectedId(batch.id)}
          aria-label={`Open the reconciliation report for ${batch.filename}`}
        >
          {batch.filename}
          <span className="block text-[11px] font-normal text-[var(--text-muted)]">
            sheet {batch.sheetName} → {batch.target}
          </span>
        </button>
      ),
    },
    {
      key: "started",
      header: "Loaded",
      width: "w-44",
      render: (batch) => (
        <span className="text-[var(--text-secondary)]">{dateTime(batch.startedAt)}</span>
      ),
    },
    {
      key: "presented",
      header: "Presented",
      numeric: true,
      width: "w-28",
      render: (batch) => num(batch.rowCount),
    },
    {
      key: "landed",
      header: "Landed",
      numeric: true,
      width: "w-24",
      render: (batch) => num(batch.importedCount),
    },
    {
      key: "refused",
      header: "Refused",
      numeric: true,
      width: "w-24",
      render: (batch) => num(batch.rejectedCount + batch.failedCount),
    },
    {
      key: "unaccounted",
      header: "Unaccounted",
      numeric: true,
      width: "w-32",
      render: (batch) => {
        const r = reconcile(batch);
        return r.unaccounted > 0 ? (
          <strong className="text-[var(--status-rejected-text)]">{num(r.unaccounted)}</strong>
        ) : (
          <span className="text-[var(--text-muted)]">0</span>
        );
      },
    },
    {
      key: "verdict",
      header: "Acceptance",
      width: "w-44",
      render: (batch) => {
        const r = reconcile(batch);
        return r.reconciled ? (
          <StatusBadge tone="done" label="Reconciles" />
        ) : (
          <StatusBadge tone="overdue" label="Not reconciled" />
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Migration workbench"
        subtitle="Every data load ever run in this tenant, reconciled row by row: what the customer presented, what became a record they can find, what was refused and why — and the difference, which is the only number that decides acceptance."
        meta={[
          { label: "Loads", value: String(batches.rows.length) },
          { label: "Rows presented", value: num(totals.presented) },
          {
            label: "Unaccounted",
            value: totals.unaccounted > 0 ? num(totals.unaccounted) : "None",
          },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Rows presented"
          value={num(totals.presented)}
          hint={`Across ${batches.rows.length} loaded batch${batches.rows.length === 1 ? "" : "es"}. This is what the customer handed over.`}
        />
        <Stat
          label="Became records"
          value={num(totals.landed)}
          hint="Rows that are now findable in the system, by the reference the import recorded against each."
        />
        <Stat
          label="Refused, with a reason"
          value={num(totals.refused)}
          hint="Not a failure. Each carries the cell and the reason, and each is the customer's decision to make."
        />
        <Stat
          label="Unaccounted"
          value={num(totals.unaccounted)}
          hint={
            totals.unaccounted > 0
              ? "Rows that went in and cannot be found. There is no benign explanation for this being above zero."
              : "Every presented row is either a record or a recorded refusal. This is what acceptance requires."
          }
        />
      </div>

      {totals.unreconciled > 0 ? (
        <Bound>
          <p>
            <strong>
              {totals.unreconciled} load{totals.unreconciled === 1 ? "" : "s"} on this page
              {totals.unreconciled === 1 ? " does" : " do"} not reconcile.
            </strong>{" "}
            A load reported as completed has told you the process ended, not that the data
            arrived. Until the unaccounted count is zero, that data set is not ready for
            sign-off and go-live should not be dated from it.
          </p>
        </Bound>
      ) : null}

      <Panel
        title="The five steps, and which of them this system records"
        lede="Approve the masters, map the source, trial the import, reconcile, then accept. Only the middle three leave a record here."
      >
        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[44rem]">
            <caption className="sr-only">
              Migration steps with the record each produces and where the evidence lives
            </caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">What has to happen</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {MIGRATION_STEPS.map((step) => (
                <tr key={step.step}>
                  <td>
                    <strong>{step.step}</strong>
                  </td>
                  <td>{step.what}</td>
                  <td>
                    <StatusBadge
                      tone={step.recorded ? "done" : "draft"}
                      label={step.recorded ? "Recorded" : "Not stored"}
                    />
                    <div className="mt-1 text-[11px] leading-[1.6] text-[var(--text-muted)]">
                      {step.evidence}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <h2 className="x-section-heading">Loads</h2>

      <DataTable
        rows={batches.rows}
        columns={columns}
        loading={batches.loading}
        loadingMore={batches.loadingMore}
        error={batches.error}
        hasMore={batches.hasMore}
        onLoadMore={batches.loadMore}
        onReload={batches.reload}
        rowKey={(batch) => batch.id}
        caption="Data loads with presented, landed, refused and unaccounted row counts"
        empty={
          <Empty
            title="Nothing has been loaded into this tenant yet"
            body="Loads appear here once a spreadsheet has been imported. The import itself runs in the Data import module — this screen reads what it produced and decides whether it can be accepted."
          />
        }
      />
      <Recorded source="read from /dataimport/batches (integration.flow.read). The counts are the batch's own; the unaccounted figure is subtraction performed in the browser." />

      {selected ? <ReconciliationReport key={selected.id} batch={selected} /> : null}

      <Panel
        title="Acceptance sign-off"
        lede="What has to be true, and who has to say so, before a data set is accepted."
      >
        <NotStored
          what="The acceptance sign-off"
          where="the migration acceptance certificate, signed by the named data owner for each data set"
        >
          <p>
            The reconciliation figures above <strong>are</strong> records and can be quoted
            verbatim into that certificate. The signature is not held here and this module
            does not create a table for it.
          </p>
        </NotStored>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Named data owner per data set"
            instruction="The storekeeper for stock, the accountant for balances, the buyer for suppliers. One blanket sign-off from a sponsor who has not opened the data is a signature, not an acceptance."
          />
          <Field
            label="The sample they checked, and how it was chosen"
            instruction="A stated number of records, picked by them rather than by us, traced from the source file to the screen. A sample chosen by the party being checked is not a check."
          />
          <Field
            label="What was agreed about the refused rows"
            instruction="Corrected and re-imported, entered by hand, or deliberately left behind. All three are legitimate; leaving it undecided is not, because it resurfaces as a missing record months later."
          />
          <Field
            label="Opening balances agreed as at a stated date and time"
            instruction="Stock and financial opening positions are true as at a cut-over moment. Without that moment written down, every later discrepancy is unarguable in both directions."
          />
        </div>
      </Panel>

      <NeverClaim
        claim="the migration is complete"
        because="A load that reports completed has told you the process ended. Complete means the unaccounted count is zero, the refusals were each decided on, and the named data owner has signed against a sample they chose themselves. Until that certificate exists, the honest sentence is that the data has been loaded and is awaiting acceptance."
      />
    </div>
  );
}

/* ========================================================================== */
/* The reconciliation report for one load.                                     */
/* ========================================================================== */

function ReconciliationReport({ batch }: { batch: ImportBatchListRow }): React.JSX.Element {
  const detail = useQuery<ImportBatchDetail>(deliveryApi.importBatchPath(batch.id));
  const data = detail.data;
  const summary = reconcile(batch);

  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data?.rows ?? []) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const refusedRows: readonly ImportBatchRow[] = useMemo(
    () => (data?.rows ?? []).filter((row) => row.status === "rejected" || row.status === "failed"),
    [data],
  );
  const heldRows: readonly ImportBatchRow[] = useMemo(
    () => (data?.rows ?? []).filter((row) => row.status === "duplicate_suspected"),
    [data],
  );

  return (
    <Panel
      title={`Reconciliation report · ${batch.filename}`}
      lede={`Sheet ${batch.sheetName}, imported as ${batch.target}, loaded ${dateTime(batch.startedAt)}.`}
      actions={
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={detail.loading}
          onClick={detail.reload}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${detail.loading ? "animate-spin" : ""}`} aria-hidden />
          Re-read
        </button>
      }
    >
      <div
        className="x-notice"
        data-tone={summary.reconciled ? undefined : "error"}
        role={summary.reconciled ? undefined : "alert"}
      >
        <div>
          <p>
            <strong>
              {summary.presented} presented − {summary.landed} landed − {summary.refused}{" "}
              refused = {summary.unaccounted} unaccounted.
            </strong>
          </p>
          <p className="mt-1">{summary.verdict}</p>
        </div>
      </div>

      {detail.error ? (
        <ErrorState error={detail.error} onRetry={detail.reload} />
      ) : !data ? (
        <p className="text-[13px] text-[var(--text-secondary)]" role="status">
          Reading the row-by-row outcome for this load…
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Load status">
              <StatusBadge status={data.status} />
            </Fact>
            <Fact label="Finished">
              {data.finishedAt ? dateTime(data.finishedAt) : "Has not reported finishing"}
            </Fact>
            <Fact label="Duplicate handling">
              {data.onDuplicate === "skip"
                ? "Held for a person — the duplicate check refused to guess"
                : "Imported anyway, on an explicit instruction"}
            </Fact>
            <Fact label="Resumable">
              {data.resumable
                ? "Accepted rows remain; re-posting the identical file continues only those"
                : "No accepted rows are waiting"}
            </Fact>
          </dl>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
              Where every row went
            </h3>
            <div className="flex flex-wrap gap-2">
              {byStatus.length === 0 ? (
                <p className="text-[13px] text-[var(--text-secondary)]">
                  This load carries no row records.
                </p>
              ) : (
                byStatus.map(([status, count]) => (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <StatusBadge status={status} tone={toneFor(status)} />
                    <span className="text-[12px] tabular-nums text-[var(--text-secondary)]">
                      {num(count)}
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
              The mapping that was used
            </h3>
            {Object.keys(data.mapping).length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">
                No column mapping is recorded against this load.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(data.mapping).map(([field, column]) => (
                  <span
                    key={field}
                    className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-2 py-1 font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]"
                  >
                    {column} → {field}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] leading-[1.6] text-[var(--text-muted)]">
              The mapping is part of the evidence, not a setting. A reconciliation that does
              not record which column became which field cannot be repeated, and a migration
              that cannot be repeated cannot be corrected.
            </p>
          </div>

          <RowList
            title="Refused, with the reason recorded at the time"
            rows={refusedRows}
            emptyBody="No row was refused in this load."
            note="Each refusal names the cell and why. These are the customer's decisions to make — corrected and re-imported, keyed by hand, or deliberately left behind. Leaving them undecided is what turns them into missing records in month three."
          />

          <RowList
            title="Held as possible duplicates"
            rows={heldRows}
            emptyBody="No row was held as a possible duplicate."
            note="The duplicate check refused to guess rather than silently creating a second supplier or a second part. Somebody has to look at these; nothing decides them automatically."
          />

          <Disclosure title="Why the difference is the acceptance gate, rather than a success rate">
            <p>
              A success rate answers "how well did the import run". Acceptance needs the
              answer to a different question: "is every row the customer gave us accounted
              for". Those come apart precisely when it matters — a load can be 97% successful
              and still have fifty rows that are neither a record nor a refusal, and a
              percentage presents that as a good day.
            </p>
            <p className="mt-2">
              The subtraction is done in the browser over the batch's own counters. It
              involves no judgement, which is the point: an assessment that can be
              re-performed by anybody with a calculator is one a customer can check.
            </p>
          </Disclosure>

          <Recorded
            source={`read from /dataimport/batches/${batch.id} (integration.flow.read) — the row outcomes are the ones recorded when the load ran, including the refusals`}
          />
        </>
      )}
    </Panel>
  );
}

function RowList({
  title,
  rows,
  emptyBody,
  note,
}: {
  title: string;
  rows: readonly ImportBatchRow[];
  emptyBody: string;
  note: string;
}): React.JSX.Element {
  const shown = rows.slice(0, 20);
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
        {title}
        {rows.length > 0 ? (
          <span className="ml-1.5 font-normal text-[var(--text-muted)]">({num(rows.length)})</span>
        ) : null}
      </h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">{emptyBody}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[38rem]">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Reason recorded</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={`${row.rowNo}-${row.status}`}>
                    <td className="tabular-nums">{row.rowNo}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      {row.failureMessage ? (
                        <p>
                          {row.failureMessage}
                          {row.failureCode ? (
                            <span className="ml-1 font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                              {row.failureCode}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {row.issues && row.issues.length > 0 ? (
                        <ul className="space-y-0.5">
                          {row.issues.map((issue, index) => (
                            <li key={`${issue.field}-${index}`}>
                              <strong>{issue.label}</strong> — {issue.message}
                              {issue.value ? (
                                <span className="ml-1 font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                                  “{issue.value}”
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {!row.failureMessage && (!row.issues || row.issues.length === 0) ? (
                        <span className="text-[var(--text-muted)]">
                          {humanise(row.status)} — no reason was recorded against this row,
                          which is itself worth raising
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > shown.length ? (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              The {shown.length} most recent are listed; {num(rows.length - shown.length)} more
              are in the load's own row record and none is hidden from it.
            </p>
          ) : null}
        </>
      )}
      <p className="mt-2 text-[11px] leading-[1.6] text-[var(--text-muted)]">{note}</p>
    </div>
  );
}

/* ========================================================================== */

interface MigrationStep {
  step: string;
  what: string;
  recorded: boolean;
  evidence: string;
}

/**
 * The five steps, and — honestly — which of them this platform holds evidence for.
 *
 * Two of the five do not leave a record here, and saying so is the useful part. A delivery
 * team that believes master approval is captured somewhere will not capture it anywhere.
 */
const MIGRATION_STEPS: readonly MigrationStep[] = [
  {
    step: "1 · Approve the masters",
    what: "The customer's data owner confirms the part list, the supplier list and the chart of accounts are the ones to migrate — before a file is uploaded, not after.",
    recorded: false,
    evidence:
      "Not stored. There is no master-approval table. The approved lists belong in the engagement record, with a date and a name.",
  },
  {
    step: "2 · Map the source",
    what: "Each column of the customer's file is bound to a field the system validates against.",
    recorded: true,
    evidence:
      "Stored with the load. The mapping is shown below for every batch, so a reconciliation can be repeated exactly.",
  },
  {
    step: "3 · Trial import",
    what: "Run the load and see, row by row, what would be created and what would be refused. Nothing is written until the last step of the wizard.",
    recorded: true,
    evidence:
      "Stored as a batch with every row's outcome, including the refused rows and the cell that caused each refusal.",
  },
  {
    step: "4 · Reconcile",
    what: "Presented minus landed minus refused. Opening quantities and balances checked against the source, by the person who owns them.",
    recorded: true,
    evidence:
      "The counters are stored with the batch; the subtraction is performed on this screen and can be re-performed by anybody.",
  },
  {
    step: "5 · Accept",
    what: "The named data owner signs that a sample they chose traces correctly, and that the refusals were decided on.",
    recorded: false,
    evidence:
      "Not stored. There is no acceptance table and this module does not create one. The certificate is the binding record.",
  },
];
