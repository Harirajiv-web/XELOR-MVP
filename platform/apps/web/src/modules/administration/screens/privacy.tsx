"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, dateTime, humanise, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, type StatusTone } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ConsentRow, DataEnvelope, DsrRow } from "../api";
import { administrationApi } from "../api";

/**
 * PRIVACY REQUESTS — what a person asked for about their own data, and on what basis it is
 * held at all.
 *
 * The two tables belong together because the second answers the objection the first raises.
 * "Delete everything about me" is refusable when the Companies Act requires the books to be
 * kept for eight years, and it is refusable BY NAME — a refusal that does not cite the
 * obligation is the first thing a regulator asks about.
 *
 * The consent ledger below it carries the distinction that catches people out: employment
 * data is processed under legitimate use, not consent, so payroll does not stop because
 * somebody clicked withdraw.
 */
export default function PrivacyScreen(_props: ScreenProps): React.JSX.Element {
  const dsr = useQuery<DataEnvelope<DsrRow>>(administrationApi.dsrPath);
  const consent = useQuery<DataEnvelope<ConsentRow>>(administrationApi.consentPath);

  const dsrRows = dsr.data?.data ?? [];
  const consentRows = consent.data?.data ?? [];
  const overdue = dsrRows.filter((r) => r.status === "overdue").length;

  const dsrColumns: ReadonlyArray<Column<DsrRow>> = [
    {
      key: "request",
      header: "Request",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[12px] font-semibold text-[var(--text-primary)]">
            {r.requestNo}
          </div>
          <div className="text-[var(--text-primary)]">{humanise(r.requestType)}</div>
          <div className="mt-0.5 max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
            {r.message}
          </div>
        </div>
      ),
    },
    {
      key: "principal",
      header: "Person",
      width: "w-40",
      // The reference, never the name. A screen that lists the people who asked about their
      // privacy by name is itself a personal-data disclosure.
      render: (r) => (
        <span className="font-[var(--font-mono)] text-[12px]">{r.dataPrincipalRef}</span>
      ),
    },
    {
      key: "receivedAt",
      header: "Received",
      width: "w-40",
      render: (r) => <span className="text-[var(--text-secondary)]">{dateTime(r.receivedAt)}</span>,
    },
    {
      key: "dueAt",
      header: "Due · 90 days",
      width: "w-48",
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{date(r.dueAt)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">{relativeDays(r.dueAt)}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-44",
      render: (r) => <StatusBadge tone={dsrTone(r.status)} label={humanise(r.status)} />,
    },
  ];

  const consentColumns: ReadonlyArray<Column<ConsentRow>> = [
    {
      key: "principal",
      header: "Person",
      width: "w-40",
      render: (c) => (
        <span className="font-[var(--font-mono)] text-[12px]">{c.dataPrincipalRef}</span>
      ),
    },
    {
      key: "purpose",
      header: "Purpose",
      width: "w-56",
      render: (c) => humanise(c.purposeCode),
    },
    {
      key: "basis",
      header: "Lawful basis",
      width: "w-56",
      // Basis is not a status, so it takes the neutral badge. The difference between
      // "consent" and "legitimate use" decides whether a withdrawal has to be honoured.
      render: (c) => <StatusBadge tone="unknown" label={humanise(c.basis)} />,
    },
    {
      key: "when",
      header: "Given / withdrawn",
      width: "w-52",
      render: (c) => (
        <div>
          <div>{c.givenAt ? dateTime(c.givenAt) : "—"}</div>
          {c.withdrawnAt ? (
            <div className="text-[12px] text-[var(--status-rejected-text)]">
              Withdrawn {dateTime(c.withdrawnAt)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "note",
      header: "What that means",
      render: (c) => (
        <span className="max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
          {c.note}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Privacy requests"
        subtitle="Requests from people about their own data — see it, correct it, or erase it — with the ninety-day statutory window running on each. Erasure can be refused where the law requires the record to be kept, but only by naming the obligation."
        meta={
          dsrRows.length > 0
            ? [
                { label: "Requests", value: String(dsrRows.length) },
                { label: "Overdue", value: String(overdue) },
              ]
            : []
        }
      />

      <DataTable
        rows={dsrRows}
        columns={dsrColumns}
        loading={dsr.loading}
        error={dsr.error}
        onReload={dsr.reload}
        rowKey={(r) => r.requestNo}
        caption="Data-principal requests and their 90-day clocks"
        empty={
          <Empty
            title="No requests open"
            body="A request appears here as soon as one is received, with its ninety-day deadline already set. Assembling one person's data across a manufacturing ERP is not a same-day job, which is why the alarms start at day sixty."
          />
        }
      />

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Consent ledger</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            On what basis each person&rsquo;s data is held. Employment data is processed under
            legitimate use rather than consent — recording it as consent would imply payroll
            stops the moment somebody clicks withdraw.
          </p>
        </div>

        <DataTable
          rows={consentRows}
          columns={consentColumns}
          loading={consent.loading}
          error={consent.error}
          onReload={consent.reload}
          rowKey={(c, i) => `${c.dataPrincipalRef}-${c.purposeCode}-${i}`}
          density="compact"
          caption="Consent and lawful-basis records"
          empty={
            <Empty
              title="Nothing in the consent ledger"
              body="Entries appear here as personal data is taken in for a purpose. An empty ledger alongside live employee records means the basis was never recorded, not that none applies."
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * The DSR clock's status word mapped to a tone.
 *
 * `refused_statutory_hold` is deliberately NOT red-as-in-failure but red-as-in-closed: the
 * refusal is the correct outcome when a retention obligation outranks erasure, and it needs
 * to read as a decision that was made rather than a thing that went wrong.
 */
function dsrTone(status: string): StatusTone {
  switch (status) {
    case "fulfilled":
      return "done";
    case "overdue":
      return "overdue";
    case "approaching":
      return "pending";
    case "refused_statutory_hold":
      return "rejected";
    default:
      return "progress";
  }
}
