"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, dateTime, humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { BackupRow, DataEnvelope, FlagRow, LicenceRow, SettingRow } from "../api";
import { administrationApi } from "../api";

/**
 * LICENCE & SETTINGS — four different things that all answer "why is the system behaving
 * like this?", kept on one screen because that is the question people arrive with.
 *
 * The licence panel is first and says the commercial terms out loud, including the one that
 * usually goes unsaid: ENFORCEMENT IS SOFT. A plant does not stop because a licence lapsed
 * on a Friday evening. Saying so on the screen is deliberate — a customer who believes the
 * system will down tools at midnight makes very different decisions from one who knows it
 * will keep running and complain.
 *
 * Four separate calls rather than one, because each is a separate concern with its own
 * failure. A settings query that breaks should not blank the licence panel.
 */
export default function LicenceScreen(_props: ScreenProps): React.JSX.Element {
  const licence = useQuery<LicenceRow>(administrationApi.licencePath);
  const settings = useQuery<DataEnvelope<SettingRow>>(administrationApi.settingsPath);
  const flags = useQuery<DataEnvelope<FlagRow>>(administrationApi.flagsPath);
  const backups = useQuery<DataEnvelope<BackupRow>>(administrationApi.backupsPath);

  const settingColumns: ReadonlyArray<Column<SettingRow>> = [
    {
      key: "key",
      header: "Setting",
      render: (s) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[12px] font-semibold text-[var(--text-primary)]">
            {s.key}
          </div>
          <div className="max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
            {s.description ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "value",
      header: "Value",
      numeric: true,
      width: "w-32",
      render: (s) => <span className="font-semibold">{s.value}</span>,
    },
    {
      key: "floor",
      header: "Statutory floor",
      width: "w-72",
      // The floor and the statute travel together. A minimum with no source is folklore,
      // and the first person to find it inconvenient will lower it.
      render: (s) =>
        s.statutoryFloor == null ? (
          <span className="text-[var(--text-muted)]">No statutory minimum</span>
        ) : (
          <div>
            <div className="text-[var(--text-primary)]">
              Never below {num(s.statutoryFloor)}
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">{s.floorSource ?? "—"}</div>
          </div>
        ),
    },
  ];

  const flagColumns: ReadonlyArray<Column<FlagRow>> = [
    {
      key: "flagKey",
      header: "Feature",
      render: (f) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[12px] font-semibold text-[var(--text-primary)]">
            {f.flagKey}
          </div>
          <div className="max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
            {f.description ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      width: "w-32",
      render: (f) => <StatusBadge tone="unknown" label={humanise(f.scope)} />,
    },
    {
      key: "enabled",
      header: "State",
      width: "w-32",
      // "Off" is the interesting state for most of these — the AI features ship off, and a
      // screen that only made "on" legible would hide the default the product is sold on.
      render: (f) =>
        f.enabled ? (
          <StatusBadge tone="approved" label="On" />
        ) : (
          <StatusBadge tone="draft" label="Off" />
        ),
    },
  ];

  const backupColumns: ReadonlyArray<Column<BackupRow>> = [
    {
      key: "name",
      header: "Backup",
      render: (b) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{b.name}</div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
            {b.schedule} → {b.target}
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">{b.retentionPolicy}</div>
        </div>
      ),
    },
    {
      key: "residency",
      header: "Region",
      width: "w-52",
      render: (b) => (
        <div>
          <div className="font-[var(--font-mono)] text-[12px]">{b.region}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">{b.residency}</div>
        </div>
      ),
    },
    {
      key: "lastRun",
      header: "Last run",
      width: "w-52",
      render: (b) => (
        <div>
          <div>{dateTime(b.lastRunAt)}</div>
          {b.lastRunStatus ? <StatusBadge status={b.lastRunStatus} /> : null}
        </div>
      ),
    },
    {
      key: "assurance",
      header: "Proven to restore?",
      render: (b) => (
        <div className="flex items-start gap-1.5">
          {b.restorePreservedChain === true ? (
            <CircleCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-done-text)]"
              aria-hidden
            />
          ) : (
            <TriangleAlert
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-overdue-text)]"
              aria-hidden
            />
          )}
          <span className="max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
            {b.assurance}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Licence & settings"
        subtitle="What this company has bought, the platform settings that have a statutory minimum, which optional features are switched on, and whether the backups have ever been proven to restore."
      />

      <LicencePanel
        licence={licence.data}
        loading={licence.loading}
        error={licence.error}
        onReload={licence.reload}
      />

      <Section
        title="Platform settings"
        body="Values the platform reads at runtime. Where a statute sets a minimum it is shown beside the value and enforced by the database as well as the service — a floor only one code path checks lasts until somebody writes a second."
      >
        <DataTable
          rows={settings.data?.data ?? []}
          columns={settingColumns}
          loading={settings.loading}
          error={settings.error}
          onReload={settings.reload}
          rowKey={(s) => s.key}
          density="compact"
          caption="Platform settings and their statutory floors"
          empty={
            <Empty
              title="No settings recorded"
              body="Settings appear here once the platform is configured. With none, every value in use is a default nobody has reviewed."
            />
          }
        />
      </Section>

      <Section
        title="Feature flags"
        body="Optional behaviour, per tenant. The AI features ship OFF: turning one on changes what the system is permitted to do, so every toggle lands in the same audit trail as a permission grant."
      >
        <DataTable
          rows={flags.data?.data ?? []}
          columns={flagColumns}
          loading={flags.loading}
          error={flags.error}
          onReload={flags.reload}
          rowKey={(f) => f.flagKey}
          density="compact"
          caption="Feature flags and their state"
          empty={
            <Empty
              title="No feature flags"
              body="Flags appear here as optional behaviour is added. None means the tenant is running the plain product."
            />
          }
        />
      </Section>

      <Section
        title="Backups"
        body="Where the copies live and whether anybody has proved one restores without breaking the audit chain. A restore that breaks the chain destroys the evidence the backup existed to protect."
      >
        <DataTable
          rows={backups.data?.data ?? []}
          columns={backupColumns}
          loading={backups.loading}
          error={backups.error}
          onReload={backups.reload}
          rowKey={(b) => b.name}
          caption="Backup jobs, residency and restore assurance"
          empty={
            <Empty
              title="No backup job configured"
              body="A backup job appears here once one is scheduled. With none, an eight-year retention obligation rests on a single copy of a database."
            />
          }
        />
      </Section>
    </div>
  );
}

/**
 * The commercial panel.
 *
 * Seats used against seats bought, the module entitlement list, the validity dates, and the
 * enforcement mode stated as a sentence rather than a field. Over-seat and expired are both
 * shown loudly and neither blocks anything — which is exactly what "soft" means and exactly
 * what a customer needs to have been told before it happens.
 */
function LicencePanel({
  licence,
  loading,
  error,
  onReload,
}: {
  licence: LicenceRow | null;
  loading: boolean;
  error: unknown;
  onReload: () => void;
}): React.JSX.Element {
  if (error) return <ErrorState error={error} onRetry={onReload} />;
  if (loading) return <Loading label="Reading the licence…" />;
  if (!licence || licence.licensed === false || !licence.plan) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">No licence recorded</h2>
        <p className="mt-1 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
          {licence?.note ??
            "This tenant has no licence record. Every module is treated as available, which is right for a development or on-premise install and wrong for a customer."}
        </p>
      </div>
    );
  }

  const modules = licence.modules ?? [];
  const overSeats = licence.status === "over_seats";
  const expired = licence.status === "expired";

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{licence.plan}</h2>
        <StatusBadge
          tone={expired ? "overdue" : overSeats ? "pending" : "approved"}
          label={expired ? "Expired" : overSeats ? "Over seats" : "Current"}
        />
      </div>

      <p className="mt-1 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
        {licence.note}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        <Fact label="Seats bought" value={num(licence.namedSeats)} />
        <Fact label="Seats in use" value={num(licence.seatsUsed)} />
        <Fact label="Seats spare" value={num(licence.seatsRemaining)} />
        <Fact label="Valid from" value={licence.validFrom ? date(licence.validFrom) : "—"} />
        <Fact label="Valid to" value={licence.validTo ? date(licence.validTo) : "—"} />
      </dl>

      {/* Said in a sentence, not left as the word "soft" in a field. The consequence is the
          part that matters and it is the part a field name cannot carry. */}
      <p className="mt-3 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
        {licence.enforcement === "soft"
          ? "Enforcement is soft: nothing here stops the plant. Going over seats or past the expiry date is recorded and shown, and the system keeps working — a factory line does not halt because a renewal was late."
          : `Enforcement is ${humanise(licence.enforcement)}. Check what this blocks before the expiry date arrives.`}
      </p>

      <div className="mt-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          Modules included ({modules.length})
        </h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {modules.length > 0 ? (
            modules.map((m) => (
              <code
                key={m}
                className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]"
              >
                {m}
              </code>
            ))
          ) : (
            <span className="text-[13px] text-[var(--text-secondary)]">
              No modules listed on this licence — which reads to the application as an
              unrestricted install, not as a restricted one.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
          {body}
        </p>
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="text-[13px] font-semibold text-[var(--text-primary)]" data-numeric="">
        {value}
      </dd>
    </div>
  );
}
