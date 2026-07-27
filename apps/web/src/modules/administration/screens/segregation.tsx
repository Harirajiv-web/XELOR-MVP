"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DataEnvelope, SodFindingRow, SodRuleRow } from "../api";
import { administrationApi, severityTone } from "../api";

/** The three states a finding can be in. `open` is what the endpoint defaults to. */
const STATUSES = [
  { value: "open", label: "Open" },
  { value: "accepted_risk", label: "Accepted risk" },
  { value: "resolved", label: "Resolved" },
] as const;

/**
 * SEGREGATION OF DUTIES — one person holding two roles that should never meet.
 *
 * The findings sit above the rulebook rather than beside it, because they answer different
 * questions and only one is urgent. A finding is "Priya can raise a purchase order and
 * approve her own"; a rule is "these two roles conflict, and here is what we do about it".
 *
 * `status` is sent explicitly even though the endpoint defaults to `open`. Relying on a
 * server default means the screen and the server disagree about what is being shown the
 * moment either changes, and the disagreement is invisible.
 */
export default function SegregationScreen(_props: ScreenProps): React.JSX.Element {
  const [status, setStatus] = useState<string>("open");

  const findings = useQuery<DataEnvelope<SodFindingRow>>(administrationApi.sodFindingsPath, {
    query: { status },
  });
  const rules = useQuery<DataEnvelope<SodRuleRow>>(administrationApi.sodRulesPath);

  const findingRows = findings.data?.data ?? [];
  const ruleRows = rules.data?.data ?? [];
  const critical = findingRows.filter((f) => f.riskLevel === "critical").length;

  const findingColumns: ReadonlyArray<Column<SodFindingRow>> = [
    {
      key: "risk",
      header: "Risk",
      width: "w-28",
      // The word is always in the badge, never only the colour: four risk levels rendered
      // in red-family hues are three levels to a colour-blind reviewer.
      render: (f) => <StatusBadge tone={severityTone(f.riskLevel)} label={humanise(f.riskLevel)} />,
    },
    {
      key: "person",
      header: "Person",
      width: "w-56",
      render: (f) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{f.subjectName}</div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
            {f.subject}
          </div>
        </div>
      ),
    },
    {
      key: "conflict",
      header: "Conflict",
      render: (f) => (
        <div className="min-w-0">
          <div className="text-[var(--text-primary)]">{f.rule}</div>
          {/* The deterministic sentence, not the AI one. The model may only rephrase a
              verdict the rules already reached, and it is off by default — so the template
              is what the record actually reads as. */}
          <div className="mt-0.5 max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
            {f.explanation}
          </div>
          {f.compensatingControl ? (
            <div className="mt-1 text-[12px] text-[var(--text-muted)]">
              Compensating control: {f.compensatingControl}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles held",
      width: "w-48",
      render: (f) => (
        <div className="flex flex-wrap gap-1">
          {f.roles.map((r) => (
            <code
              key={r}
              className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-primary)]"
            >
              {r}
            </code>
          ))}
        </div>
      ),
    },
    {
      key: "detectedAt",
      header: "Detected",
      width: "w-44",
      render: (f) => <span className="text-[var(--text-secondary)]">{dateTime(f.detectedAt)}</span>,
    },
  ];

  const ruleColumns: ReadonlyArray<Column<SodRuleRow>> = [
    {
      key: "risk",
      header: "Risk",
      width: "w-28",
      render: (r) => <StatusBadge tone={severityTone(r.riskLevel)} label={humanise(r.riskLevel)} />,
    },
    {
      key: "rule",
      header: "Rule",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.name}</div>
          <div className="mt-0.5 max-w-prose text-[12px] leading-4 text-[var(--text-secondary)]">
            {r.description}
          </div>
        </div>
      ),
    },
    {
      key: "pair",
      header: "Roles kept apart",
      width: "w-56",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1 font-[var(--font-mono)] text-[11px]">
          <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5">{r.roleACode}</code>
          <span className="text-[var(--text-muted)]">+</span>
          <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5">{r.roleBCode}</code>
        </div>
      ),
    },
    {
      key: "enforcement",
      header: "What happens",
      width: "w-48",
      // Only `prevent` refuses a grant. Saying so on the screen matters: an administrator
      // who thinks every rule blocks will assume a warning was a refusal and stop checking.
      render: (r) =>
        r.enforcement === "prevent" ? (
          <StatusBadge tone="rejected" label="Grant refused" />
        ) : r.enforcement === "warn" ? (
          <StatusBadge tone="pending" label="Warned, allowed" />
        ) : (
          <StatusBadge tone="unknown" label="Recorded only" />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Segregation of duties"
        subtitle="People who hold two roles the rulebook keeps apart — the same person raising a purchase order and approving it, or creating a vendor and paying it. Every verdict here comes from the rules, never from a model."
        meta={
          findingRows.length > 0
            ? [
                { label: "Findings", value: String(findingRows.length) },
                { label: "Critical", value: String(critical) },
              ]
            : []
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="sod-status"
            className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]"
          >
            Showing
          </label>
          <select
            id="sod-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text-primary)]"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          rows={findingRows}
          columns={findingColumns}
          loading={findings.loading}
          error={findings.error}
          onReload={findings.reload}
          rowKey={(f) => f.id}
          caption="Open segregation-of-duties findings"
          empty={
            status === "open" ? (
              <Empty
                title="No open conflicts"
                body="Findings appear here after a segregation-of-duties scan finds one person holding two roles that should not meet. An empty list means the last scan found none — not that no scan has run."
              />
            ) : (
              <Empty
                title="Nothing in this state"
                body="No finding currently sits in this state. A resolved finding is kept rather than deleted, because having held the conflict is the part an auditor asks about."
              />
            )
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">The rulebook</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            Which pairs of roles conflict, and what the system does when somebody is given
            both. Most rules warn rather than refuse — a control that stops a four-person
            office from working gets switched off in week two, after which nothing is
            controlled at all.
          </p>
        </div>

        <DataTable
          rows={ruleRows}
          columns={ruleColumns}
          loading={rules.loading}
          error={rules.error}
          onReload={rules.reload}
          rowKey={(r) => r.id}
          density="compact"
          caption="Segregation-of-duties rules"
          empty={
            <Empty
              title="No rules configured"
              body="Until a rule exists a scan has nothing to check, and every scan will report a clean result that means nothing."
            />
          }
        />
      </div>
    </div>
  );
}
