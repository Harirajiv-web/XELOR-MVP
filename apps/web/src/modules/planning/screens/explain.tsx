"use client";

import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, humanise, num, qty, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { MrpExplain, MrpExplainRow, PlannedOrderDetail } from "../api";
import { planningApi } from "../api";

/**
 * WHY THIS ORDER — /planning/explain/<runNo>/<itemCode>.
 *
 * This is AXLE's whole claim, and it is one screen.
 *
 * MRP is the part of an ERP people distrust most, and for a good reason: it produces a
 * number, the number is expensive, and the system usually cannot say where it came from. So
 * the run PERSISTS its working — the gross requirement, what was already coming, what was on
 * hand and the shortfall — for every item in every week, and this screen reads it back.
 * Nothing here is recomputed. If it were, the explanation could disagree with the order it
 * claims to explain, and an explanation that can disagree with the thing it explains is
 * worse than none.
 *
 * The sentence in the working column is written by the run itself, in the run's own words:
 * "180 wanted − 60 already coming − 45 on hand + 20 safety stock = 95 short."
 */
export default function ExplainScreen(props: ScreenProps): React.JSX.Element {
  // `noUncheckedIndexedAccess` is on: both really are `string | undefined`, and a hand-typed
  // URL is a normal way to arrive here with one of them missing.
  const runNo = props.params[0];
  const itemCode = props.params[1];

  const { data, loading, error, reload } = useQuery<MrpExplain>(
    runNo && itemCode ? planningApi.explainPath(runNo, itemCode) : null,
  );

  const workingColumns: ReadonlyArray<Column<MrpExplainRow>> = [
    {
      key: "bucket",
      header: "Week",
      width: "w-28",
      render: (r) => <span className="font-semibold">{r.bucket}</span>,
    },
    {
      key: "grossRequirement",
      header: "Wanted",
      numeric: true,
      render: (r) => zeroAware(r.grossRequirement),
    },
    {
      key: "scheduledReceipts",
      header: "Already coming",
      numeric: true,
      render: (r) => zeroAware(r.scheduledReceipts),
    },
    {
      key: "projectedAvailableOpening",
      header: "On hand at start",
      numeric: true,
      render: (r) => zeroAware(r.projectedAvailableOpening),
    },
    {
      key: "netRequirement",
      header: "Short",
      numeric: true,
      // The only column that decides anything. A short week is the reason an order exists,
      // so it is the one figure on the row allowed to shout.
      render: (r) =>
        Number(r.netRequirement) > 0 ? (
          <span className="font-semibold text-[var(--status-overdue-text)]">
            {qty(r.netRequirement)}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "plannedReceipt",
      header: "Ordered",
      numeric: true,
      render: (r) =>
        Number(r.plannedReceipt) > 0 ? (
          <span className="font-semibold">{qty(r.plannedReceipt)}</span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "projectedAvailable",
      header: "Left at end",
      numeric: true,
      render: (r) => zeroAware(r.projectedAvailable),
    },
  ];

  const orderColumns: ReadonlyArray<Column<PlannedOrderDetail>> = [
    {
      key: "orderKey",
      header: "Order",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">
            {r.orderKey}
          </div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.lotReason}</div>
        </div>
      ),
    },
    {
      key: "sourceType",
      header: "Make / buy",
      width: "w-28",
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.sourceType)} />,
    },
    {
      key: "qty",
      header: "Quantity",
      numeric: true,
      width: "w-32",
      render: (r) => <span className="font-semibold">{qty(r.qty)}</span>,
    },
    {
      key: "release",
      header: "Start by",
      width: "w-52",
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{date(r.releaseDate)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {r.releaseBucket} · {relativeDays(r.releaseDate)}
          </div>
        </div>
      ),
    },
    {
      key: "needDate",
      header: "Wanted by",
      width: "w-52",
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{date(r.needDate)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {r.receiptBucket} · {relativeDays(r.needDate)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-36",
      render: (r) => (
        <div>
          <StatusBadge status={r.status} />
          {r.pastDue ? (
            <div className="mt-0.5 text-[11px] text-[var(--status-overdue-text)]">
              {r.daysLate} day{r.daysLate === 1 ? "" : "s"} late
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  if (!runNo || !itemCode) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Why this order" subtitle="The working behind one item in one plan." />
        <Empty
          title="Nothing to explain yet"
          body="This screen explains one item in one MRP run and needs both in the address — /planning/explain/<run>/<item>. Open it by clicking a row in Planned orders."
          action={<BackLink />}
        />
      </div>
    );
  }

  if (loading) return <Loading label="Reading the run's working…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Empty title="No working recorded" body="This run kept nothing for this item." action={<BackLink />} />;

  const warnings = Array.isArray(data.warnings) ? data.warnings : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Why ${data.itemCode} is being ordered`}
        subtitle="Week by week, what was wanted, what was already coming, what was on hand, and the shortfall that produced each order. This is what the run actually did — nothing on this page has been recalculated."
        meta={[
          { label: "Run", value: data.runNo },
          { label: "Level", value: String(data.lowLevelCode) },
          { label: "Stock at start", value: qty(data.openingAvailable) },
          { label: "Safety stock", value: qty(data.safetyStock) },
        ]}
        actions={<BackLink />}
      />

      {warnings.length > 0 ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
            <TriangleAlert className="h-3.5 w-3.5 text-[var(--status-pending-text)]" aria-hidden />
            Read this before acting on the numbers below
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {warnings.map((w, i) => (
              <li key={`${i}-${w}`} className="text-[13px] leading-5 text-[var(--text-secondary)]">
                {w}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">The arithmetic</h2>
        <DataTable
          rows={data.rows}
          columns={workingColumns}
          rowKey={(r) => r.bucket}
          density="compact"
          caption={`Week-by-week netting for ${data.itemCode} in run ${data.runNo}`}
          empty={<Empty title="No buckets recorded" body="This item was in the run but no weekly rows were kept for it." />}
        />
      </section>

      {/* The same arithmetic in words, one line per week, written by the run. A planner who
          reads the table and a planner who reads the sentences should reach the same
          conclusion — and if they ever do not, the sentences are the ones to trust, because
          they were composed from these exact figures at the moment the plan was made. */}
      {data.rows.length > 0 ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">In words</h2>
          <dl className="mt-3 flex flex-col gap-2">
            {data.rows.map((r) => (
              <div key={r.bucket} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <dt className="w-24 shrink-0 text-[12px] font-semibold text-[var(--text-muted)]">
                  {r.bucket}
                </dt>
                <dd
                  className={
                    Number(r.netRequirement) > 0
                      ? "text-[13px] leading-5 text-[var(--text-primary)]"
                      : "text-[13px] leading-5 text-[var(--text-secondary)]"
                  }
                >
                  {r.working}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
          What came out of it
        </h2>
        <DataTable
          rows={data.plannedOrders}
          columns={orderColumns}
          rowKey={(r) => r.id}
          caption={`Planned orders for ${data.itemCode} in run ${data.runNo}`}
          empty={
            <Empty
              title="No orders were planned for this item"
              body="The run looked at this item and found it covered across the whole horizon — the stock on hand and the supply already coming were enough."
            />
          }
        />
      </section>
    </div>
  );
}

/** Zero is a fact here, not an absence — an em dash would read as "not computed". */
function zeroAware(value: string): React.JSX.Element {
  return Number(value) === 0 ? (
    <span className="text-[var(--text-muted)]">0</span>
  ) : (
    <span>{num(value, 0)}</span>
  );
}

function BackLink(): React.JSX.Element {
  return (
    <Link
      href="/planning/planned-orders"
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-input)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Planned orders
    </Link>
  );
}
