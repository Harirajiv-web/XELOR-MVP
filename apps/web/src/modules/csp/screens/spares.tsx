"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, inr, inrShort, qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, type StatusTone } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { SpareRequestRow } from "../api";
import { cspApi } from "../api";

/**
 * SPARE REQUESTS — parts a service call needs, and who is paying for them.
 *
 * The COVER column is the entitlement engine's verdict, not a box anybody ticked. A
 * customer who says "this is under warranty" about a machine that went out of cover in
 * March has made a claim, and the difference between a claim and a verdict is a real cost
 * that lands on this table.
 *
 * Nothing here moves stock. Reservation and issue belong to Inventory, and a request shows
 * their reference once they have acted on it — this screen could not reserve a part if it
 * wanted to.
 */
export default function SparesScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<SpareRequestRow[]>(cspApi.spareRequestsPath);
  const [filter, setFilter] = useState("");

  const all = useMemo(() => data ?? [], [data]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.requestNo.toLowerCase().includes(q) ||
        r.itemCode.toLowerCase().includes(q) ||
        (r.ticketNo ?? "").toLowerCase().includes(q),
    );
  }, [all, filter]);

  const quoted = useMemo(
    () => all.reduce((total, r) => total + (r.lineAmount ?? 0), 0),
    [all],
  );

  const columns: ReadonlyArray<Column<SpareRequestRow>> = [
    {
      key: "requestNo",
      header: "Request",
      width: "w-44",
      render: (r) => <span className="font-semibold">{r.requestNo}</span>,
    },
    {
      key: "ticketNo",
      header: "Against case",
      width: "w-44",
      // A spare request with no ticket is legitimate — a customer can order a part without
      // a breakdown — so say so rather than showing a dash that reads as missing data.
      render: (r) =>
        r.ticketNo ? (
          <span className="text-[var(--text-primary)]">{r.ticketNo}</span>
        ) : (
          <span className="text-[var(--text-secondary)]">Standalone</span>
        ),
    },
    { key: "itemCode", header: "Part", render: (r) => r.itemCode },
    {
      key: "qty",
      header: "Quantity",
      numeric: true,
      width: "w-32",
      // The unit travels with the number: "4" of a bearing and "4" metres of hose are not
      // the same request, and these tables get screenshotted into WhatsApp.
      render: (r) => qty(r.qty, r.uom),
    },
    {
      key: "coverage",
      header: "Cover",
      width: "w-44",
      render: (r) => <StatusBadge tone={coverTone(r.coverage)} label={coverLabel(r.coverage)} />,
    },
    {
      key: "amount",
      header: "Chargeable",
      numeric: true,
      width: "w-40",
      // Null means covered, which is a different fact from zero. "No charge" says which.
      render: (r) =>
        r.lineAmount == null ? (
          <span className="text-[var(--text-secondary)]">No charge</span>
        ) : (
          <span className="font-semibold">{inr(r.lineAmount)}</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-36",
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Spares & warranty"
        subtitle="Parts requested for an after-sales product case, with the recorded decision on whether the customer, warranty or AMC pays."
        meta={
          all.length > 0
            ? [
                { label: "Requests", value: String(all.length) },
                {
                  label: "Quoted to customers",
                  // Abbreviated for the glance, exact alongside it. An abbreviation that is
                  // the only representation of a figure is a figure nobody can check.
                  value: (
                    <span>
                      {inrShort(quoted)}{" "}
                      <span className="text-[var(--text-muted)]">({inr(quoted)})</span>
                    </span>
                  ),
                },
              ]
            : []
        }
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
          placeholder="Filter by request, part or product case…"
          aria-label="Filter spare requests"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.requestNo}
        caption="Spare part requests with coverage verdict and chargeable amount"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No request, part or product case matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No spare requests"
              body="Requests appear here when an engineer or a customer asks for a part against a service job."
            />
          )
        }
      />
    </div>
  );
}

/**
 * Coverage is a commercial fact, not a workflow step, so it borrows only the two tones that
 * cannot be misread: covered is settled, partial is a judgement somebody still has to make.
 * "Not covered" is neutral rather than red — the customer paying for a part is the normal
 * case, not a failure.
 */
function coverTone(coverage: string): StatusTone {
  switch (coverage) {
    case "covered_amc":
    case "covered_warranty":
      return "approved";
    case "partial":
      return "pending";
    default:
      return "unknown";
  }
}

function coverLabel(coverage: string): string {
  switch (coverage) {
    case "covered_amc":
      return "AMC";
    case "covered_warranty":
      return "Warranty";
    case "partial":
      return "Partial";
    case "not_covered":
      return "Customer pays";
    default:
      return humanise(coverage);
  }
}
