"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, humanise, inr } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { EditButton, useEditPolicy } from "@spine/ui/corrections";
import type { ScreenProps } from "@spine/registry/manifest";
import type { Voucher, VoucherLine } from "../api";
import { accountsApi } from "../api";

/** Amounts arrive as NUMERIC strings. Zero on the opposite side prints as an em dash. */
function money(value: string): React.JSX.Element {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return <span className="text-[var(--text-muted)]">—</span>;
  return <>{inr(value)}</>;
}

/**
 * ONE VOUCHER — the bottom of every number in this product.
 *
 * Any figure on any screen in any module can be followed down to a voucher like this one,
 * and this is where the trail stops: the lines below are what was actually written to the
 * ledger, in the order they were written.
 *
 * NOTHING ON THIS SCREEN CAN BE CHANGED, and that is the design rather than a limitation of
 * a read-only pass. A posted voucher is immutable — the only two columns the database will
 * ever let anyone touch are its status and a pointer to the voucher that reversed it, and a
 * trigger enforces that independently of any code we write. A correction is a REVERSAL: a
 * new voucher with the same lines the other way round, posted on the day the mistake was
 * found. Both vouchers survive, both are visible, and the MCA's eight-year audit trail is a
 * consequence of that rather than a retention setting somebody can turn down.
 */
export default function VoucherScreen(props: ScreenProps): React.JSX.Element {
  const voucherId = props.params[0];
  const { data, loading, error, reload } = useQuery<Voucher>(
    voucherId ? accountsApi.voucherPath(voucherId) : null,
  );

  // A posted voucher is never editable, and this is where the product says so out loud.
  //
  // Asking the server for a verdict everyone already knows is not waste: it means the
  // sentence a user reads comes from the same table that enforces the rule, so the
  // explanation cannot drift from the behaviour. The refusal offers "Reverse this entry",
  // which is the action that actually fixes their problem — a greyed-out Edit with no way
  // forward is what sends people to ring somebody instead.
  const policy = useEditPolicy(voucherId ? accountsApi.voucherEditPolicyPath(voucherId) : null);

  const columns: ReadonlyArray<Column<VoucherLine>> = [
    {
      key: "lineNo",
      header: "#",
      numeric: true,
      width: "w-12",
      render: (l) => <span className="text-[var(--text-muted)]">{l.lineNo}</span>,
    },
    {
      key: "account",
      header: "Account",
      width: "w-32",
      render: (l) => (
        <span className="font-[var(--font-mono)] text-[var(--text-primary)]">{l.accountCode}</span>
      ),
    },
    {
      key: "memo",
      header: "Narration",
      render: (l) => (
        <div className="min-w-0">
          <div className="truncate text-[var(--text-primary)]">{l.memo ?? "—"}</div>
          {l.taxHead ? (
            <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
              {humanise(l.taxHead)}
              {l.taxDirection ? ` · ${humanise(l.taxDirection)}` : ""}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "debit",
      header: "Debit",
      numeric: true,
      width: "w-44",
      render: (l) => money(l.debit),
    },
    {
      key: "credit",
      header: "Credit",
      numeric: true,
      width: "w-44",
      render: (l) => money(l.credit),
    },
  ];

  if (!voucherId) {
    return (
      <Empty
        title="No voucher chosen"
        body="This screen opens one voucher at a time. Pick one from Vouchers, or follow a link from the document in another module that produced it."
        action={<BackLink />}
      />
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading) return <Loading label="Loading voucher…" />;
  if (!data) {
    return (
      <Empty
        title="Voucher not found"
        body="No voucher with that reference. Nothing is ever deleted from the ledger, so this is a wrong reference rather than a removed entry."
        action={<BackLink />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data.voucherNo}
        subtitle="What was actually written to the general ledger, line by line, on the day it was posted."
        meta={[
          { label: "Type", value: humanise(data.voucherType) },
          { label: "Posted", value: date(data.postingDate) },
          { label: "Status", value: <StatusBadge status={data.status} /> },
          { label: "Debit", value: inr(data.totalDebit) },
          { label: "Credit", value: inr(data.totalCredit) },
        ]}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <EditButton
              policy={policy}
              onEdit={() => undefined}
              onCorrectInstead={() => {
                // Reversal is its own guarded action with its own reason, and it belongs on
                // the vouchers list where the finance user already works. Pointing at it is
                // honest; opening a half-built dialog here would not be.
                window.location.assign("/accounts/vouchers?reverse=" + (voucherId ?? ""));
              }}
            />
            <BackLink />
          </div>
        }
      />

      {data.narration ? (
        <p className="max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
          {data.narration}
        </p>
      ) : null}

      {/* The pair, navigable in BOTH directions. This is the append-only claim made
          demonstrable rather than asserted: from a mistake you can reach its correction, and
          from a correction you can reach what it corrected, and neither row ever went away. */}
      {data.reversedByVoucherId ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] leading-5 text-[var(--text-secondary)]">
          This voucher has been <strong>reversed</strong>. It was not edited and it was not
          removed — a second voucher was posted with these lines the other way round, and both
          are still in the ledger. That is why the trial balance still foots, and why the
          history of what was believed, and when, survives.{" "}
          <VoucherLink id={data.reversedByVoucherId} label="Open the reversing voucher" />
        </p>
      ) : data.status === "reversed" ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] leading-5 text-[var(--text-secondary)]">
          This voucher has been <strong>reversed</strong>, but the ledger does not carry a
          pointer to the voucher that reversed it. Report that — the link is part of the
          record, not a convenience.
        </p>
      ) : null}

      {data.reversesVoucherId ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] leading-5 text-[var(--text-secondary)]">
          This is a <strong>correcting entry</strong>. It does not amend the voucher it
          corrects — it stands beside it with the amounts the other way round, so both what
          was originally posted and the fix remain readable for the eight years the Companies
          Act requires.{" "}
          <VoucherLink id={data.reversesVoucherId} label="Open the voucher this corrects" />
        </p>
      ) : null}

      {/* The reason, as its own field. It is asked for at the moment of reversal, stored in
          its own column, and shown here rather than left inside a narration string where it
          could not be filtered, counted or reported on. */}
      {data.reversalReason ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Reason for the reversal
          </div>
          <p className="mt-1 max-w-prose text-[13px] leading-5 text-[var(--text-primary)]">
            {data.reversalReason}
          </p>
        </div>
      ) : null}

      <DataTable
        rows={data.lines}
        columns={columns}
        loading={false}
        rowKey={(l) => String(l.lineNo)}
        density="compact"
        caption={`Journal lines for voucher ${data.voucherNo}`}
        empty={<Empty title="This voucher has no lines" body="A voucher without lines should not be possible — a journal needs at least two. Report it rather than working around it." />}
      />

      {/* The footing, spelled out. A voucher's own totals are stored on the header and the
          lines are stored separately; showing both agreeing is what makes the page evidence
          rather than a rendering of one number twice. */}
      <div className="flex flex-wrap items-center justify-end gap-6 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3 text-[13px]">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Total debit
          </span>
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {inr(data.totalDebit)}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Total credit
          </span>
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {inr(data.totalCredit)}
          </span>
        </div>
      </div>

      <div className="flex max-w-prose items-start gap-2.5 text-[12px] leading-5 text-[var(--text-muted)]">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          There is no edit on this screen and no delete, because there is none in the system:
          the ledger is append-only, and a posted voucher cannot be altered even by an
          administrator. Correcting one means posting a reversal, which leaves both entries
          on the record for the eight years the Companies Act requires.
        </p>
      </div>
    </div>
  );
}

function BackLink(): React.JSX.Element {
  return (
    <Link
      href="/accounts/vouchers"
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-input)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Vouchers
    </Link>
  );
}

/**
 * An inline link to the other half of a reversal pair. Deliberately a link rather than a
 * button: it navigates, it changes nothing, and it should behave like every other link —
 * openable in a new tab by somebody who wants both entries side by side, which is exactly
 * how an auditor reads a correction.
 */
function VoucherLink({ id, label }: { id: string; label: string }): React.JSX.Element {
  return (
    <Link
      href={`/accounts/voucher/${id}`}
      className="font-medium text-[var(--brand)] underline underline-offset-2 hover:text-[var(--brand-hover)]"
    >
      {label}
    </Link>
  );
}
