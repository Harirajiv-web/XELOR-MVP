"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { WarehouseRow } from "../api";
import { inventoryApi } from "../api";

export default function WarehousesScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<WarehouseRow[]>(inventoryApi.warehousesPath);

  const columns: ReadonlyArray<Column<WarehouseRow>> = [
    {
      key: "code",
      header: "Code",
      width: "w-40",
      render: (r) => <span className="font-semibold">{r.code}</span>,
    },
    { key: "name", header: "Name", render: (r) => r.name },
    {
      key: "type",
      header: "Type",
      width: "w-48",
      // A warehouse type is not a workflow status, so it gets a neutral treatment rather
      // than borrowing the eight-state colour language — reusing those colours here would
      // teach that green means "good" instead of "completed".
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.warehouseType)} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Warehouses"
        subtitle="Where stock can physically be. Every movement names one of these as its source or destination."
      />
      <DataTable
        rows={data ?? []}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.id}
        caption="Warehouses and storage locations"
        empty={<Empty title="No warehouses" body="No storage locations have been set up yet." />}
      />
    </div>
  );
}
