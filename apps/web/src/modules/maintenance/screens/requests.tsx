"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, humanise, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { RequestRow } from "../api";
import { maintenanceApi } from "../api";

/**
 * THE REQUEST QUEUE — what the floor has reported and nobody has decided about yet.
 *
 * `state` defaults to `untriaged`, which is the queue in the sense that matters: submitted
 * and acknowledged only. `all` includes everything already turned into a work order,
 * merged, converted or rejected.
 *
 * The SLA clock starts when the OPERATOR pressed submit, not when maintenance opened this
 * screen — so "respond by" can already be in the past on a request nobody has seen. That is
 * the point of measuring it, and this table shows it rather than softening it.
 *
 * Duplicate candidates are counted, never acted on: two operators reporting one stopped
 * machine is the common case, and deciding they are the same fault is a person's job.
 */
export default function MaintenanceRequestsScreen(_props: ScreenProps): React.JSX.Element {
  const [state, setState] = useState<"untriaged" | "all">("untriaged");
  const { data, loading, error, reload } = useQuery<RequestRow[]>(maintenanceApi.requestsPath, {
    query: { state },
  });

  const breached = (data ?? []).filter((r) => r.slaBreached).length;
  const stopped = (data ?? []).filter((r) => r.severity === "stopped").length;

  const columns: ReadonlyArray<Column<RequestRow>> = [
    {
      key: "requestNo",
      header: "Request",
      width: "w-40",
      render: (r) => <span className="font-semibold">{r.requestNo}</span>,
    },
    {
      key: "asset",
      header: "Machine",
      width: "w-52",
      render: (r) => (
        <div className="min-w-0">
          <div className="text-[var(--text-primary)]">{r.asset.code}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.asset.name}</div>
        </div>
      ),
    },
    {
      key: "symptom",
      header: "What was reported",
      render: (r) => (
        <div className="min-w-0">
          <div>{humanise(r.symptomCode)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {humanise(r.severity)}
            {r.downtime ? " — machine stopped, clock running" : ""}
          </div>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      width: "w-24",
      // Derived from criticality × severity, never chosen by the person reporting. A
      // neutral chip, because it is a classification rather than a state.
      render: (r) => <StatusBadge tone="unknown" label={r.derived.priorityPreview} />,
    },
    {
      key: "requestedAt",
      header: "Reported",
      width: "w-48",
      render: (r) => dateTime(r.requestedAt),
    },
    {
      key: "respondBy",
      header: "Respond by",
      width: "w-48",
      render: (r) => (
        <div className="min-w-0">
          <div>{dateTime(r.derived.slaRespondBy)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {relativeDays(r.derived.slaRespondBy)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-48",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={r.status} />
          {r.slaBreached ? <StatusBadge tone="overdue" label="Late" /> : null}
          {r.duplicateCandidates.length > 0 ? (
            <StatusBadge
              tone="pending"
              label={`${r.duplicateCandidates.length} possible duplicate${r.duplicateCandidates.length === 1 ? "" : "s"}`}
            />
          ) : null}
        </div>
      ),
    },
    {
      key: "mwoNo",
      header: "Work order",
      width: "w-36",
      render: (r) =>
        r.mwoNo ? (
          <span className="font-semibold">{r.mwoNo}</span>
        ) : (
          <span className="text-[var(--text-secondary)]">not raised</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Maintenance requests"
        subtitle="What operators have reported from the floor, before anyone has decided what to do about it. The response clock starts when they pressed submit, not when this queue was opened."
        meta={
          (data?.length ?? 0) > 0
            ? [
                { label: "Requests", value: String(data?.length ?? 0) },
                { label: "Machine stopped", value: String(stopped) },
                { label: "Past respond-by", value: String(breached) },
              ]
            : []
        }
      />

      <select
        value={state}
        onChange={(e) => setState(e.target.value === "all" ? "all" : "untriaged")}
        aria-label="Which requests to show"
        className="h-9 w-fit rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)]"
      >
        <option value="untriaged">Waiting to be triaged</option>
        <option value="all">Every request, decided or not</option>
      </select>

      <DataTable
        rows={data ?? []}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.requestNo}
        caption="Maintenance requests with severity, derived priority and response deadline"
        empty={
          state === "untriaged" ? (
            <Empty
              title="Nothing waiting"
              body="Every request has been triaged. New ones appear here the moment an operator reports a fault from the floor."
            />
          ) : (
            <Empty
              title="No requests yet"
              body="Requests appear here when somebody on the floor reports a fault against a machine — a symptom, a severity, and nothing else to fill in."
            />
          )
        }
      />
    </div>
  );
}
