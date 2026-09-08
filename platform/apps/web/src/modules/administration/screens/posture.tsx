"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, dateTime, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { BackupRow, PostureRow } from "../api";
import { administrationApi } from "../api";

/**
 * SECURITY POSTURE — one screen a plant manager can look at and know whether the control
 * plane is healthy.
 *
 * The headline is the server's, not the screen's. The API already decides whether the
 * posture is healthy and says so in a sentence; re-deriving that verdict in the browser
 * would be a second opinion that eventually disagrees with the first, and then the two get
 * debugged against each other instead of the problem.
 *
 * `/admin/posture` answers a single object rather than a list, so this screen handles its
 * own loading and error states — `DataTable` only covers the backups table inside it.
 */
export default function PostureScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<PostureRow>(administrationApi.posturePath);

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
        </div>
      ),
    },
    {
      key: "residency",
      header: "Where it lands",
      width: "w-56",
      // Residency is a legal fact, not a preference: a backup outside India is a DPDP
      // problem regardless of how good the encryption is, so it is said in words.
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
          <div className="text-[12px] text-[var(--text-secondary)]">
            {b.lastRunStatus ? <StatusBadge status={b.lastRunStatus} /> : "—"}
          </div>
        </div>
      ),
    },
    {
      key: "assurance",
      header: "Proven to restore?",
      // The sentence the server writes is the answer. "Never restore-tested" and
      // "restore-tested but the chain was not preserved" are different failures, and a
      // green tick on both would be the most expensive lie on this screen.
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

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading) return <Loading label="Checking the control plane…" />;
  if (!data) {
    return (
      <Empty
        title="No posture reading"
        body="The control plane did not answer with a posture. Reload, and if it stays empty the check itself is the thing that is broken."
      />
    );
  }

  const healthy = data.issues.length === 0;
  const lic = data.licence;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Security posture"
        subtitle="Whether the parts of the system that protect everything else are actually working: who is signed in without a second factor, whether the backups have ever been proven to restore, and whether the licence is current."
        meta={[{ label: "As at", value: dateTime(data.asOf) }]}
      />

      <div
        className={
          healthy
            ? "rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
            : "rounded-[var(--radius-card)] border border-[var(--status-overdue-text)] bg-[var(--surface)] p-4"
        }
      >
        <div className="flex gap-2.5">
          {healthy ? (
            <CircleCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-done-text)]"
              aria-hidden
            />
          ) : (
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-overdue-text)]"
              aria-hidden
            />
          )}
          <div className="text-[13px] leading-5">
            <p className="font-semibold text-[var(--text-primary)]">{data.headline}</p>
            {data.issues.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[var(--text-secondary)]">
                {data.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Active users" value={num(data.activeUsers)} />
        <Tile
          label="Without MFA"
          value={num(data.usersWithoutMfa)}
          alarming={data.usersWithoutMfa > 0}
        />
        <Tile label="Live sessions" value={num(data.liveSessions)} />
        <Tile
          label="Recent failed logins"
          value={num(data.recentFailedLogins)}
          alarming={data.recentFailedLogins > 0}
        />
      </dl>

      <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Licence</h2>
          {lic.status ? <StatusBadge status={lic.status} /> : null}
        </div>
        <p className="mt-1 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
          {lic.note ?? "No licence note."}
        </p>
        {lic.plan ? (
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            <Fact label="Plan" value={lic.plan} />
            <Fact label="Seats" value={`${num(lic.seatsUsed)} of ${num(lic.namedSeats)}`} />
            <Fact
              label="Valid to"
              value={lic.validTo ? date(lic.validTo) : "—"}
            />
          </dl>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Backups</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            Two facts that are usually missing: is the copy held in India, and has anybody
            ever proved it restores <em>without</em> breaking the audit chain. An untested
            backup is a hope, not a control.
          </p>
        </div>
        <DataTable
          rows={data.backups}
          columns={backupColumns}
          rowKey={(b) => b.name}
          caption="Backup jobs, residency and restore assurance"
          empty={
            <Empty
              title="No backup job configured"
              body="Backup jobs appear here once one is scheduled. With none, an eight-year statutory retention obligation is being met by a single copy of a database."
            />
          }
        />
      </div>
    </div>
  );
}

/** A single number with its label. Alarming ones get the overdue colour AND a heavier weight. */
function Tile({
  label,
  value,
  alarming,
}: {
  label: string;
  value: string;
  alarming?: boolean;
}): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd
        className={
          alarming
            ? "mt-0.5 text-[20px] font-bold tabular-nums text-[var(--status-overdue-text)]"
            : "mt-0.5 text-[20px] font-bold tabular-nums text-[var(--text-primary)]"
        }
        data-numeric=""
      >
        {value}
      </dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="text-[13px] text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
