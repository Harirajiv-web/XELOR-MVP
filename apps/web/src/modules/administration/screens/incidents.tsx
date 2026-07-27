"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, humanise, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, type StatusTone } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DataEnvelope, IncidentRow } from "../api";
import { administrationApi, severityTone } from "../api";

/**
 * SECURITY INCIDENTS — and the two clocks the law starts the moment one is noticed.
 *
 * CERT-In gives six hours from DETECTION, not from confirmation and not from the incident
 * itself. DPDP gives seventy-two to intimate the Data Protection Board when personal data is
 * involved, and the two run in PARALLEL — treating them as a pipeline is how the second is
 * missed while the first is being handled, so they get two columns rather than one.
 *
 * Both clocks show the absolute deadline and the relative time together. "3 hours left" is
 * what somebody acts on; "20-Jul-2026 15:12" is what they put in the email to the regulator,
 * and a screen showing only the first makes them do arithmetic to write the second.
 */
export default function IncidentsScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<DataEnvelope<IncidentRow>>(
    administrationApi.incidentsPath,
  );

  const rows = data?.data ?? [];
  const breached = rows.filter((r) => r.breached).length;
  const running = rows.filter((r) => r.status === "urgent" || r.status === "on_track").length;

  const columns: ReadonlyArray<Column<IncidentRow>> = [
    {
      key: "incident",
      header: "Incident",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[12px] font-semibold text-[var(--text-primary)]">
            {r.incidentNo}
          </div>
          <div className="text-[var(--text-primary)]">{r.title}</div>
          <div className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">
            {r.category}
          </div>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      width: "w-28",
      render: (r) => <StatusBadge tone={severityTone(r.severity)} label={humanise(r.severity)} />,
    },
    {
      key: "detectedAt",
      header: "Detected",
      width: "w-44",
      // The clocks run from here, which is why it is captured before anybody knows how bad
      // it is. Showing it next to the deadlines makes the six hours legible as a span.
      render: (r) => <span className="text-[var(--text-secondary)]">{dateTime(r.detectedAt)}</span>,
    },
    {
      key: "certIn",
      header: "CERT-In · 6 hours",
      width: "w-64",
      render: (r) => (
        <div className="min-w-0">
          <StatusBadge tone={clockTone(r)} label={clockLabel(r)} />
          <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
            {r.certInReportable ? dateTime(r.certInDueAt) : "Not a reportable category"}
          </div>
        </div>
      ),
    },
    {
      key: "dpdp",
      header: "DPDP Board · 72 hours",
      width: "w-56",
      // Absent rather than green when no personal data is involved: an empty cell here is a
      // fact ("this clock never started"), and colouring it as satisfied would be a claim.
      render: (r) =>
        r.dpdpBoardDueAt ? (
          <div className="min-w-0">
            <div className="text-[var(--text-primary)]">{dateTime(r.dpdpBoardDueAt)}</div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {relativeDays(r.dpdpBoardDueAt)}
            </div>
          </div>
        ) : (
          <span className="text-[var(--text-secondary)]">No personal data affected</span>
        ),
    },
    {
      key: "recordStatus",
      header: "Handling",
      width: "w-36",
      render: (r) => <StatusBadge status={r.recordStatus} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Security incidents"
        subtitle="Every incident on record and the two statutory clocks it starts: six hours to report to CERT-In from the moment it was noticed, and seventy-two to intimate the Data Protection Board when personal data is involved. Both run from detection, in parallel."
        meta={
          rows.length > 0
            ? [
                { label: "Incidents", value: String(rows.length) },
                { label: "Clock running", value: String(running) },
                { label: "Deadline passed", value: String(breached) },
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
        rowKey={(r) => r.incidentNo}
        caption="Security incidents with their CERT-In and DPDP deadlines"
        empty={
          <Empty
            title="No incidents recorded"
            body="An incident appears here the moment somebody records one, with both deadlines already computed. Recording it early costs nothing; the six-hour clock has already started either way."
          />
        }
      />

      {rows.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
            What each clock is saying
          </h2>
          <ul className="mt-2 space-y-2">
            {rows.map((r) => (
              <li key={r.incidentNo} className="text-[13px] leading-5">
                <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-muted)]">
                  {r.incidentNo}
                </span>{" "}
                <span className="text-[var(--text-secondary)]">{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The clock's own status word mapped to a tone.
 *
 * `breached` wins over everything: an incident reported late is still late, and showing it
 * as "reported" in green would edit the lateness out of the screen while the record keeps it.
 */
function clockTone(r: IncidentRow): StatusTone {
  if (!r.certInReportable) return "unknown";
  if (r.breached) return "overdue";
  if (r.status === "reported") return "done";
  if (r.status === "urgent") return "pending";
  return "progress";
}

function clockLabel(r: IncidentRow): string {
  if (!r.certInReportable) return "Clock not started";
  if (r.status === "reported") {
    return r.breached ? "Reported late" : "Reported in time";
  }
  const hours = Math.abs(r.certInHoursRemaining);
  return r.breached ? `${hours} h past due` : `${hours} h left`;
}
