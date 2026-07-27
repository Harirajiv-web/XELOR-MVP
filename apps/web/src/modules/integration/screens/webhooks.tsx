"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DataEnvelope, WebhookRow } from "../api";
import { integrationApi } from "../api";

/**
 * WEBHOOKS — events this system pushes to somebody else's server.
 *
 * Two facts get their own columns because both are usually invisible until they hurt.
 *
 * AUTO-PAUSED is not an error state; it is the system declining to keep hammering an
 * endpoint that has very likely gone away. Continuing would be a slow denial-of-service
 * against a customer's server, delivered from ours.
 *
 * ROTATION GRACE is the window during which BOTH the old and the new signing secret verify,
 * so the receiver can redeploy on their own schedule. A rotation with no grace period is a
 * coordinated outage, which is why nobody performs one — and a secret nobody rotates is a
 * secret forever.
 *
 * There is no column for the secret. There is no field on this endpoint that could carry
 * one: it is shown once at subscription or rotation and never again.
 */
export default function WebhooksScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<DataEnvelope<WebhookRow>>(
    integrationApi.webhooksPath,
  );

  const rows = data?.data ?? [];
  const pausedCount = rows.filter((r) => r.status !== "active").length;

  const columns: ReadonlyArray<Column<WebhookRow>> = [
    {
      key: "subscriber",
      header: "Subscriber",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.subscriberName}</div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {r.targetUrl}
          </div>
        </div>
      ),
    },
    {
      key: "events",
      header: "Events sent",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.eventNames.map((e) => (
            <code
              key={e}
              className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-primary)]"
            >
              {e}
            </code>
          ))}
          {r.eventNames.length === 0 ? (
            // A subscription with no events looks configured and will never fire. The API
            // refuses to create one; an existing one is worth calling out loudly.
            <span className="text-[var(--status-overdue-text)]">
              No events — this will never fire
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "State",
      width: "w-64",
      render: (r) => (
        <div className="min-w-0">
          {r.status === "auto_paused" ? (
            <StatusBadge tone="hold" label="Auto-paused" />
          ) : (
            <StatusBadge status={r.status} />
          )}
          {r.consecutiveFailures > 0 ? (
            <div className="mt-1 text-[12px] font-semibold text-[var(--status-overdue-text)]">
              {num(r.consecutiveFailures)} failure
              {r.consecutiveFailures === 1 ? "" : "s"} in a row
            </div>
          ) : null}
          {r.note ? (
            <div className="mt-1 max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
              {r.note}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "rotation",
      header: "Secret rotation",
      width: "w-56",
      render: (r) =>
        r.rotationGraceUntil ? (
          <div>
            <StatusBadge tone="pending" label="Both secrets valid" />
            <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
              until {dateTime(r.rotationGraceUntil)}
            </div>
          </div>
        ) : (
          <span className="text-[var(--text-secondary)]">One secret in use</span>
        ),
    },
    {
      key: "deliveries",
      header: "Deliveries",
      numeric: true,
      width: "w-32",
      render: (r) => num(r.deliveries),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Webhooks"
        subtitle="Systems that have asked to be told when something happens here — a dealer portal, a customer's own software. Each delivery is signed, and a subscriber whose endpoint keeps failing is paused rather than hammered."
        meta={
          rows.length > 0
            ? [
                { label: "Subscribers", value: String(rows.length) },
                { label: "Not delivering", value: String(pausedCount) },
              ]
            : []
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.subscriberName}
        caption="Webhook subscriptions, delivery health and secret rotation"
        empty={
          <Empty
            title="Nobody is subscribed"
            body="A subscription appears here when an outside system asks to be notified of events. None means nothing outside this building is being told when anything happens."
          />
        }
      />
    </div>
  );
}
