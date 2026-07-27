"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { Envelope, ProviderRow } from "../api";
import { aiopsApi } from "../api";

/**
 * PROVIDERS — who actually runs the model, and where.
 *
 * Two columns here are compliance answers rather than technical ones, and they are the
 * reason this screen exists at all:
 *
 *   WHERE IT RUNS. A tenant that restricts data residency cannot route to a provider
 *   serving from outside India, and the region is the fact that decides it. The backend
 *   composes the sentence; this screen does not paraphrase it.
 *
 *   WHETHER OUR DATA TRAINS THEIR MODEL. `trainingExclusionConfirmed` is a contractual
 *   fact, not a preference, and an unconfirmed one is shown as unconfirmed rather than
 *   quietly left blank — a blank cell reads as "fine" to everybody who is not looking for it.
 */
export default function ProvidersScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<Envelope<ProviderRow>>(aiopsApi.providersPath);
  const rows = data?.data ?? [];

  const columns: ReadonlyArray<Column<ProviderRow>> = [
    {
      key: "provider",
      header: "Provider",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.name}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            <code className="font-[var(--font-mono)]">{r.code}</code> · {humanise(r.kind)}
          </div>
        </div>
      ),
    },
    {
      key: "region",
      header: "Where it runs",
      width: "w-72",
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{r.region}</div>
          <div className="text-[12px] leading-[18px] text-[var(--text-secondary)]">{r.residencyNote}</div>
        </div>
      ),
    },
    {
      key: "models",
      header: "Models",
      width: "w-64",
      render: (r) =>
        r.models.length === 0 ? (
          <span className="text-[var(--text-muted)]">None registered</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {r.models.map((m) => (
              <code
                key={m.code}
                className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]"
              >
                {m.code} · {m.tier}
              </code>
            ))}
          </span>
        ),
    },
    {
      key: "training",
      header: "Training exclusion",
      width: "w-44",
      render: (r) =>
        r.trainingExclusionConfirmed ? (
          <StatusBadge tone="approved" label="Confirmed" />
        ) : (
          <StatusBadge tone="pending" label="Not confirmed" />
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-32",
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Providers"
        subtitle="The model providers this tenant may route to, which region each one serves from, and whether they have contractually agreed not to train on your data."
        meta={rows.length > 0 ? [{ label: "Providers", value: String(rows.length) }] : []}
      />
      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.code}
        caption="AI providers, regions, models and training-exclusion status"
        empty={
          <Empty
            title="No providers are configured"
            body="Nothing can route until a provider and at least one model are registered. Every AI feature is running on its degraded fallback until then."
          />
        }
      />
    </div>
  );
}
