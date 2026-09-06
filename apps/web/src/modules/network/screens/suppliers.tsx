"use client";

import { useMemo, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import { networkApi, type BroadcastRow, type NetworkSupplier } from "../api";

/**
 * WHO THIS FACTORY CAN ASK, and what it has asked them.
 *
 * A network supplier is deliberately not the same record as an approved vendor. A vendor is
 * somebody this factory already buys from; the whole point of a network is to reach people it
 * does not. The "Approved vendor" column is where the two meet — a supplier can be asked for
 * a price the day they are added, but an award cannot raise a purchase order against them
 * until somebody has approved them as a vendor, and that column says which is which.
 */
export default function SuppliersScreen(_props: ScreenProps): React.JSX.Element {
  const suppliers = useQuery<{ items: NetworkSupplier[] }>(networkApi.suppliersPath);
  const broadcasts = useQuery<{ items: BroadcastRow[] }>(networkApi.broadcastsPath);
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = suppliers.data?.items ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.supplierCode.toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q) ||
        s.categories.some((c) => c.toLowerCase().includes(q)),
    );
  }, [suppliers.data, filter]);

  if (suppliers.error) return <ErrorState error={suppliers.error} onRetry={suppliers.reload} />;

  const columns: ReadonlyArray<Column<NetworkSupplier>> = [
    {
      key: "name",
      header: "Supplier",
      render: (s) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{s.name}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {s.supplierCode}
            {s.city ? ` · ${s.city}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "categories",
      header: "Makes",
      render: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.categories.length === 0 ? (
            <span className="text-[12px] text-[var(--text-muted)]">not categorised</span>
          ) : (
            s.categories.map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      key: "reach",
      header: "Reachable by",
      width: "w-56",
      render: (s) => (
        <div className="flex flex-col gap-0.5 text-[12px] text-[var(--text-secondary)]">
          {s.whatsappE164 ? (
            <span className="flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-[var(--good-fg)]" aria-hidden />
              {s.whatsappE164}
            </span>
          ) : null}
          {s.email ? (
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
              {s.email}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "vendor",
      header: "Approved vendor",
      width: "w-48",
      render: (s) =>
        s.vendorId ? (
          <span className="chip chip-ok">Yes — can be awarded</span>
        ) : (
          // Stated as a consequence, not a status: "No" alone does not tell a buyer why the
          // Award button will refuse them later.
          <span className="chip chip-warn">Not yet — quotes only</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-28",
      render: (s) => <StatusBadge status={s.status} />,
    },
  ];

  const sent = broadcasts.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Supplier network"
        subtitle="The people this factory can ask for a price, and how a request reaches them."
        meta={[
          { label: "Suppliers", value: String(suppliers.data?.items.length ?? 0) },
          {
            label: "On WhatsApp",
            value: String((suppliers.data?.items ?? []).filter((s) => s.whatsappE164).length),
          },
          { label: "Requests published", value: String(sent.length) },
        ]}
      />

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, code, city or what they make…"
        aria-label="Filter suppliers"
        className="h-9 w-full max-w-sm rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />

      <DataTable
        rows={rows}
        columns={columns}
        loading={suppliers.loading}
        onReload={suppliers.reload}
        rowKey={(s) => s.id}
        caption="Suppliers on the network with what they make and how they can be reached"
        empty={
          <Empty
            title="No suppliers on the network yet"
            body="A network supplier is somebody this factory can ask for a price, whether or not it has ever bought from them. They need a WhatsApp number or an email address — without one they cannot be asked."
          />
        }
      />

      {sent.length > 0 ? (
        <section className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
          <header className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Requests published to the network
            </h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[12px] text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-medium">Request</th>
                  <th className="px-3 py-2 font-medium">Sent to</th>
                  <th className="px-3 py-2 font-medium">Opened</th>
                  <th className="px-3 py-2 font-medium">Answered</th>
                  <th className="px-4 py-2 font-medium">Published</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--border-subtle)]">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{b.rfqNo}</td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                      {b.supplierCount} suppliers
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{b.opened}</td>
                    <td className="px-3 py-2.5">
                      <span className={b.quoted > 0 ? "chip chip-ok" : "chip"}>{b.quoted}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {new Date(b.publishedAt).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
