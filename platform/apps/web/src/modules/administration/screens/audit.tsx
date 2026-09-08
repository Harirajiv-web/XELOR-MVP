"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ChainVerificationRow, DataEnvelope } from "../api";
import { administrationApi } from "../api";

/** Both chains hash the same way, so one verifier covers both — and one filter reads both. */
const CHAINS = [
  { value: "", label: "Both chains" },
  { value: "audit_log", label: "Audit trail" },
  { value: "ai_action_log", label: "AI actions" },
] as const;

/**
 * AUDIT TRAIL — the record of every time the record was checked.
 *
 * Worth being exact about what this screen shows, because it is easy to misread as the
 * trail itself. It is not. Each row is an ATTESTATION: somebody walked the hash chain
 * between two entry numbers and recorded what they found. "We verify the chain nightly" is a
 * claim; a row per night with a range and a verdict is evidence, and evidence is the whole
 * product here.
 *
 * A break is not one thing, so the kind is shown rather than collapsed: a hash mismatch
 * means a row's content was edited in place, a link mismatch means a row was replaced, and a
 * sequence gap means one was deleted outright. The first says somebody changed a record and
 * the third says somebody removed one, and those are different conversations.
 */
export default function AuditScreen(_props: ScreenProps): React.JSX.Element {
  const [chain, setChain] = useState<string>("");

  const { data, loading, error, reload } = useQuery<DataEnvelope<ChainVerificationRow>>(
    administrationApi.verificationsPath,
    { query: { chain } },
  );

  const rows = data?.data ?? [];
  const broken = rows.filter((r) => !r.intact).length;

  const columns: ReadonlyArray<Column<ChainVerificationRow>> = [
    {
      key: "verifiedAt",
      header: "Checked at",
      width: "w-48",
      render: (r) => (
        <span className="font-semibold text-[var(--text-primary)]">{dateTime(r.verifiedAt)}</span>
      ),
    },
    {
      key: "chainName",
      header: "Chain",
      width: "w-36",
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.chainName)} />,
    },
    {
      key: "range",
      header: "Entries covered",
      width: "w-48",
      // The range is what makes the verdict mean something. "Intact" over entries 0–4 is a
      // much smaller claim than "intact" over 0–40,000, and hiding the range hides that.
      render: (r) => (
        <span className="font-[var(--font-mono)] text-[12px]">
          {num(r.fromSeq)} – {num(r.toSeq)}
        </span>
      ),
    },
    {
      key: "rowsChecked",
      header: "Rows read",
      numeric: true,
      width: "w-28",
      render: (r) => num(r.rowsChecked),
    },
    {
      key: "intact",
      header: "Verdict",
      width: "w-40",
      render: (r) =>
        r.intact ? (
          <StatusBadge tone="done" label="Unbroken" />
        ) : (
          <StatusBadge tone="overdue" label={humanise(r.breakKind)} />
        ),
    },
    {
      key: "message",
      header: "What it found",
      render: (r) => (
        <span className="max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
          {r.message}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Audit trail"
        subtitle="Each row here is a moment somebody checked the audit trail against its own hash chain. A verdict of unbroken proves that, between those two entry numbers, no entry had been altered, replaced or removed at the moment of the check."
        meta={
          rows.length > 0
            ? [
                { label: "Verifications", value: String(rows.length) },
                { label: "Breaks found", value: String(broken) },
              ]
            : []
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="audit-chain"
          className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]"
        >
          Chain
        </label>
        <select
          id="audit-chain"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2.5 text-[13px] text-[var(--text-primary)]"
        >
          {CHAINS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.id}
        caption="Recorded hash-chain verifications"
        empty={
          <Empty
            title="The chain has never been verified"
            body="A row appears here each time the chain is checked. Until one does, the trail is being kept but nobody has demonstrated it is unaltered — and demonstrating it is the part an auditor asks for."
          />
        }
      />
    </div>
  );
}
