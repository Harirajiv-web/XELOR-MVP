"use client";

import { useRouter } from "next/navigation";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise, inr } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { VoucherSummary } from "../api";
import { accountsApi } from "../api";

/**
 * THE VOUCHER REGISTER — every entry in the ledger, newest first.
 *
 * Cursor-paged rather than offset, and here that is not a preference. Vouchers are being
 * posted while somebody reads this list — a dispatch invoices, a receipt lands, payroll
 * hands over its journal — and an offset page two would silently skip whatever was inserted
 * above it. A financial register that omits a row without saying so is worse than one that
 * makes you press a button.
 *
 * No filter box. Filtering only the rows already loaded would be a lie in a register that
 * pages: "no voucher matches" would mean "none on the pages you happen to have". A real
 * search here belongs on the server, and until it exists the honest control is Load more.
 */
export default function VouchersScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const { rows, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<VoucherSummary>(accountsApi.vouchersPath, { limit: 50 });

  const columns: ReadonlyArray<Column<VoucherSummary>> = [
    {
      key: "voucherNo",
      header: "Voucher",
      width: "w-48",
      render: (v) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[var(--text-primary)]">{v.voucherNo}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {humanise(v.voucherType)}
          </div>
        </div>
      ),
    },
    {
      key: "postingDate",
      header: "Posted",
      width: "w-32",
      render: (v) => <span className="text-[var(--text-secondary)]">{date(v.postingDate)}</span>,
    },
    {
      key: "narration",
      header: "Narration",
      render: (v) => (
        <div className="min-w-0">
          <div className="truncate text-[var(--text-primary)]">{v.narration ?? "—"}</div>
          {/* Provenance, not decoration. "Which system put this here" is the first question
              asked of an entry nobody remembers making, and a blank means a human keyed it. */}
          <div className="text-[12px] text-[var(--text-secondary)]">
            {v.sourceModule ? `From ${humanise(v.sourceModule)}` : "Entered by hand"}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-32",
      render: (v) => <StatusBadge status={v.status} />,
    },
    {
      key: "totalDebit",
      header: "Debit",
      numeric: true,
      width: "w-44",
      render: (v) => inr(v.totalDebit),
    },
    {
      key: "totalCredit",
      header: "Credit",
      numeric: true,
      width: "w-44",
      render: (v) => inr(v.totalCredit),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Vouchers"
        subtitle="Every entry ever posted to the general ledger, newest first. A reversed voucher stays on this list beside the entry that reversed it — nothing is removed."
      />

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onReload={reload}
        rowKey={(v) => v.id}
        onRowClick={(v) => router.push(`/accounts/voucher/${v.id}`)}
        caption="Journal vouchers posted to the general ledger, newest first"
        empty={
          <Empty
            title="Nothing has been posted yet"
            body="The register fills the moment the first journal is posted — a sale invoiced, a receipt recorded, a payroll journal handed over by People. Every one of them lands here."
          />
        }
      />
    </div>
  );
}
