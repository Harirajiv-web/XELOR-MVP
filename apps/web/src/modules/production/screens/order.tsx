"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { dateTime, qty, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ProductionComponentRow, ProductionOrderDetail } from "../api";
import { outstanding, productionApi } from "../api";

/**
 * ONE WORK ORDER — what is being made, how much of it exists, and what went into it.
 *
 * Reached by clicking a row on the list; `params[0]` is the order's id. There is no action
 * on this screen. Issuing components and receiving output move stock and are audited, and
 * they belong behind their own permission and their own confirmation, not one click away
 * from a page somebody opened to read.
 */
export default function ProductionOrderScreen(props: ScreenProps): React.JSX.Element {
  const id = props.params[0];
  const { data, loading, error, reload } = useQuery<ProductionOrderDetail>(
    id ? productionApi.orderPath(id) : null,
  );

  if (!id) {
    return (
      <Empty
        title="No work order chosen"
        body="Open a work order from the list to see the item, the quantities and the components it consumes."
      />
    );
  }
  if (loading) return <Loading label="Loading the work order…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Empty title="Work order not found" body="This order is no longer readable." />;

  const remaining = outstanding(data.qtyToProduce, data.producedQty);

  const columns: ReadonlyArray<Column<ProductionComponentRow>> = [
    {
      key: "lineNo",
      header: "Line",
      numeric: true,
      width: "w-16",
      render: (c) => c.lineNo,
    },
    {
      key: "component",
      header: "Component",
      render: (c) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            {c.itemCode ?? (
              <span className="font-[var(--font-mono)] text-[12px]">{c.componentItemId}</span>
            )}
          </div>
          {c.itemName ? (
            <div className="truncate text-[12px] text-[var(--text-secondary)]">{c.itemName}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "requiredQty",
      header: "Required",
      numeric: true,
      width: "w-36",
      render: (c) => qty(c.requiredQty, c.uom),
    },
    {
      key: "issuedQty",
      header: "Issued",
      numeric: true,
      width: "w-36",
      render: (c) => <span className="font-semibold">{qty(c.issuedQty, c.uom)}</span>,
    },
    {
      key: "outstanding",
      header: "Still to issue",
      numeric: true,
      width: "w-40",
      render: (c) => {
        const left = outstanding(c.requiredQty, c.issuedQty);
        // Zero is written as "0", never blank. A blank cell on a shortage list reads as
        // "not loaded", and a storekeeper cannot tell that apart from "nothing to draw".
        return (
          <span className={left > 0 ? "font-semibold" : undefined}>{qty(left, c.uom)}</span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/production/orders"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All work orders
      </Link>

      <PageHeader
        title={data.orderNo}
        subtitle="One order on the floor: the item it makes, how much has been received into finished goods, and every component the bill of materials says it consumes."
        actions={<StatusBadge status={data.status} />}
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-4">
        <Fact label="Item">
          {data.itemCode ?? (
            <span className="font-[var(--font-mono)] text-[12px]">{data.itemId}</span>
          )}
        </Fact>
        <Fact label="Description">{data.itemName ?? "—"}</Fact>
        <Fact label="Ordered">{qty(data.qtyToProduce, data.uom)}</Fact>
        <Fact label="Produced">{qty(data.producedQty, data.uom)}</Fact>
        <Fact label="Still to make">{qty(remaining, data.uom)}</Fact>
        <Fact label="Raised">
          {/* Absolute and relative together: one is what you act on, the other is what you
              put in a message. The schema carries no promised date, so nothing here says
              "late" — that would be a judgement invented by the screen. */}
          <div>{dateTime(data.createdAt)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {relativeDays(data.createdAt)}
          </div>
        </Fact>
        <Fact label="Last changed">{dateTime(data.updatedAt)}</Fact>
        <Fact label="Components">{String(data.components.length)}</Fact>
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Components</h2>
        <DataTable
          rows={data.components}
          columns={columns}
          rowKey={(c) => String(c.lineNo)}
          caption="Components required and issued against this work order"
          empty={
            <Empty
              title="No components on this order"
              body="The bill of materials this order was exploded from had no component lines."
            />
          }
        />
      </div>
    </div>
  );
}

/** One labelled fact. Local to this screen — a shared version would be a spine decision. */
function Fact({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="bg-[var(--surface)] px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 break-all text-[13px] text-[var(--text-primary)]" data-numeric="">
        {children}
      </dd>
    </div>
  );
}
