"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { num, qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import type { BomLineRow, BomView } from "../api";
import { engineeringApi } from "../api";

/**
 * ONE BILL OF MATERIAL — /engineering/bom/<bomId>.
 *
 * A detail screen with no list in front of it, because the backend has no list endpoint for
 * bills of material. It is reached by URL, or by whatever already knows the id.
 *
 * The output quantity is stated at the top and repeated in the table caption on purpose. A
 * BOM that makes ten impellers from 10.5 castings reads as an error at a glance if you assume
 * every BOM makes one — and that assumption is the single most common way a component
 * requirement comes out ten times too big.
 */
export default function BomScreen(props: ScreenProps): React.JSX.Element {
  // `noUncheckedIndexedAccess` is on, so this really is `string | undefined` — and arriving
  // here without an id is a normal thing a user can do by editing the URL.
  const bomId = props.params[0];

  const { data, loading, error, reload } = useQuery<BomView>(
    bomId ? engineeringApi.bomPath(bomId) : null,
  );

  const columns: ReadonlyArray<Column<BomLineRow>> = [
    {
      key: "lineNo",
      header: "#",
      numeric: true,
      width: "w-14",
      render: (r) => <span className="text-[var(--text-muted)]">{r.lineNo}</span>,
    },
    {
      key: "component",
      header: "Component",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.componentCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {r.componentName}
          </div>
        </div>
      ),
    },
    {
      key: "qty",
      header: "Quantity",
      numeric: true,
      width: "w-40",
      render: (r) => <span className="font-semibold">{qty(r.qty, r.uom)}</span>,
    },
    {
      key: "scrapPct",
      header: "Scrap",
      numeric: true,
      width: "w-28",
      // Scrap is not decoration: it is the reason the plan orders more than the drawing
      // says, and a planner asked "why 52 and not 50" needs to see it on this screen.
      render: (r) =>
        Number(r.scrapPct) > 0 ? (
          <span>{num(r.scrapPct, 2)}%</span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
  ];

  if (!bomId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Bill of material"
          subtitle="What goes into one product, and how much of each."
        />
        <Empty
          title="No bill of material selected"
          body="This screen shows one BOM at a time and needs its identifier in the address — /engineering/bom/<id>. Open it from wherever the BOM was referenced."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data ? `Bill of material — version ${data.version}` : "Bill of material"}
        subtitle="What goes into one product, and how much of each. Quantities below are for the output quantity shown, not for a single unit."
        meta={
          data
            ? [
                { label: "Makes", value: qty(data.outputQty, data.uom) },
                { label: "Version", value: String(data.version) },
                { label: "Components", value: String(data.lines.length) },
              ]
            : []
        }
      />

      {data?.notes ? (
        <p className="max-w-prose rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] leading-5 text-[var(--text-secondary)]">
          {data.notes}
        </p>
      ) : null}

      <DataTable
        rows={data?.lines ?? []}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => `${r.lineNo}-${r.componentItemId}`}
        caption={
          data
            ? `Components consumed to make ${qty(data.outputQty, data.uom)}`
            : "Components of this bill of material"
        }
        empty={
          <Empty
            title="This bill of material has no components"
            body="A BOM is created with at least one line, so an empty list here means the components were removed after it was made."
          />
        }
      />
    </div>
  );
}
