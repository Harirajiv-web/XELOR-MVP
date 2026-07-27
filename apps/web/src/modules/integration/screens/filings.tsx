"use client";

import { TriangleAlert } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise, num, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, type StatusTone } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DataEnvelope, EwayBillRow, WindowWatch, WindowWatchRow } from "../api";
import { integrationApi } from "../api";

/**
 * STATUTORY FILINGS — the two pipelines where a mistake is visible to a regulator.
 *
 * The e-invoice window is a CLIFF, not a deadline. Past thirty days from the invoice date
 * the portal refuses the document permanently and the only remedy is a credit note and a
 * re-issue — a commercial conversation with the customer, not an operational fix. That is
 * why the alerts escalate at day 20, 25 and 28 instead of arriving once at the end, and why
 * blocked invoices are counted separately at the top of this screen.
 *
 * The e-way bill table carries one fact that is easy to lose and expensive to lose: WHICH
 * portal generated the bill. A bill made on the secondary portal must be cancelled and
 * closed on the secondary portal, and sending the closure to the primary because it is the
 * default fails silently while the truck is already moving.
 */
export default function FilingsScreen(_props: ScreenProps): React.JSX.Element {
  const watch = useQuery<WindowWatch>(integrationApi.windowWatchPath);
  const ewb = useQuery<DataEnvelope<EwayBillRow>>(integrationApi.ewayBillPath);

  const watchRows = watch.data?.rows ?? [];
  const ewbRows = ewb.data?.data ?? [];

  const watchColumns: ReadonlyArray<Column<WindowWatchRow>> = [
    {
      key: "invoiceRef",
      header: "Invoice",
      width: "w-48",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[12px] font-semibold text-[var(--text-primary)]">
            {r.invoiceRef}
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">{date(r.docDate)}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "IRN",
      width: "w-32",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "deadline",
      header: "Reportable until",
      width: "w-52",
      render: (r) =>
        r.deadlineAt ? (
          <div>
            <div className="text-[var(--text-primary)]">{date(r.deadlineAt)}</div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {relativeDays(r.deadlineAt)}
            </div>
          </div>
        ) : (
          <span className="text-[var(--text-secondary)]">Window does not apply</span>
        ),
    },
    {
      key: "alert",
      header: "Where it stands",
      width: "w-52",
      // "Blocked" is not a severity, it is a different outcome: the invoice can never be
      // reported and needs a credit note. It gets its own word rather than a darker red.
      render: (r) => <StatusBadge tone={watchTone(r)} label={watchLabel(r)} />,
    },
    {
      key: "message",
      header: "What that means",
      render: (r) => (
        <span className="max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
          {r.message}
        </span>
      ),
    },
  ];

  const ewbColumns: ReadonlyArray<Column<EwayBillRow>> = [
    {
      key: "shipmentRef",
      header: "Shipment",
      width: "w-52",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[12px] font-semibold text-[var(--text-primary)]">
            {r.shipmentRef}
          </div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {r.ewbNo ?? "No bill number"}
          </div>
        </div>
      ),
    },
    {
      key: "portalUsed",
      header: "Portal",
      width: "w-36",
      // The bill remembers which portal made it, and so must this column: cancelling or
      // closing on the other one silently does nothing at all.
      render: (r) => (
        <StatusBadge tone="unknown" label={r.portalUsed === "ewb2" ? "Secondary" : "Primary"} />
      ),
    },
    {
      key: "status",
      header: "State",
      width: "w-44",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={r.status} />
          {r.closureStatus ? <StatusBadge status={r.closureStatus} /> : null}
        </div>
      ),
    },
    {
      key: "distanceKm",
      header: "Distance",
      numeric: true,
      width: "w-28",
      render: (r) => <span>{num(r.distanceKm)} km</span>,
    },
    {
      key: "validity",
      header: "Valid until",
      render: (r) => (
        <div className="min-w-0">
          {r.expired ? (
            <StatusBadge tone="overdue" label="Expired" />
          ) : (
            <StatusBadge tone="approved" label={`${num(r.daysValid)} day validity`} />
          )}
          <div className="mt-1 max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
            {r.message}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Statutory filings"
        subtitle="Invoices waiting for an IRN against the thirty-day reporting window, and every e-way bill with the time left on it. Both are filings to a government portal: a duplicate here is visible to a regulator and cannot be quietly withdrawn."
        meta={
          watch.data
            ? [
                { label: "Awaiting IRN", value: String(watch.data.watching) },
                { label: "Past the window", value: String(watch.data.blocked) },
                { label: "Critical", value: String(watch.data.critical) },
              ]
            : []
        }
      />

      {watch.data && watch.data.watching > 0 ? (
        <div
          className={
            watch.data.blocked > 0
              ? "rounded-[var(--radius-card)] border border-[var(--status-overdue-text)] bg-[var(--surface)] p-4"
              : "rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
          }
        >
          <div className="flex gap-2.5">
            {watch.data.blocked > 0 ? (
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-overdue-text)]"
                aria-hidden
              />
            ) : null}
            <p className="text-[13px] font-semibold leading-5 text-[var(--text-primary)]">
              {watch.data.headline}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            E-invoice window watch
          </h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            Every invoice still without an IRN, against the thirty days it has to get one.
            After that the portal refuses it permanently and the remedy is a credit note and
            a re-issue — which is a conversation with the customer, not a retry.
          </p>
        </div>

        <DataTable
          rows={watchRows}
          columns={watchColumns}
          loading={watch.loading}
          error={watch.error}
          onReload={watch.reload}
          rowKey={(r) => r.invoiceRef}
          caption="Invoices awaiting an IRN and their reporting window"
          empty={
            <Empty
              title="Every invoice in scope has an IRN"
              body="Invoices appear here only while they are unreported. An empty list means nothing is waiting — and nothing is approaching the thirty-day cliff."
            />
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">E-way bills</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            Bills raised for goods in transit, with the validity each one has for the distance
            it covers. A vehicle moving on an expired bill is a detention risk, and extension
            is only possible while the bill is still valid.
          </p>
        </div>

        <DataTable
          rows={ewbRows}
          columns={ewbColumns}
          loading={ewb.loading}
          error={ewb.error}
          onReload={ewb.reload}
          rowKey={(r) => r.shipmentRef}
          caption="E-way bills, the portal that issued them and their validity"
          empty={
            <Empty
              title="No e-way bills raised"
              body="A bill appears here when a dispatch generates one. None means nothing has moved that needed one — over ₹50,000 of goods on a vehicle does."
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * The window position as a badge tone.
 *
 * `blocked` outranks the alert level, because it is a different KIND of state: the alert
 * levels count down to a deadline, and blocked means the deadline has already passed and no
 * amount of hurrying will help.
 */
function watchTone(r: WindowWatchRow): StatusTone {
  if (r.blocked) return "rejected";
  if (r.alertLevel >= 3) return "overdue";
  if (r.alertLevel === 2) return "pending";
  if (r.alertLevel === 1) return "progress";
  return "unknown";
}

function watchLabel(r: WindowWatchRow): string {
  if (r.blocked) return "Can never be reported";
  if (r.daysRemaining == null) return humanise("not applicable");
  return `${num(r.daysRemaining)} day${r.daysRemaining === 1 ? "" : "s"} left`;
}
