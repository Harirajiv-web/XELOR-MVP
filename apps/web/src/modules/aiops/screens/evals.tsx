"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { EvalRun, Envelope, RegistryFeature } from "../api";
import { aiopsApi } from "../api";

/**
 * EVALUATIONS — the gate that stops a feature shipping.
 *
 * A run passes only if the candidate beat the deterministic baseline by at least the
 * declared tolerance AND no must-pass case failed. Both halves, every time: a model that
 * scores better on average while getting the one case that must never be wrong wrong is
 * worse than the rules it replaced, and an average hides exactly that.
 *
 * A FAILURE IS MADE LOUD ON THIS SCREEN, deliberately. Everywhere else in this product a
 * red state is a document somebody has to chase. Here it means a prompt cannot be promoted
 * — there is no force flag in the API and no endpoint that bypasses this — and a buyer
 * needs to see that the gate has teeth rather than being told it does.
 */
export default function EvalsScreen(_props: ScreenProps): React.JSX.Element {
  const [feature, setFeature] = useState("");

  // The options come from the REGISTRY rather than from the runs, so a feature with no run
  // at all can be selected. That is the case worth being able to look up: an unevaluated
  // feature cannot be promoted, and it is invisible on a list built from runs.
  const registry = useQuery<Envelope<RegistryFeature>>(aiopsApi.registryPath);
  const { data, loading, error, reload } = useQuery<Envelope<EvalRun>>(aiopsApi.evalsPath, {
    query: { featureKey: feature },
  });

  const rows = data?.data ?? [];
  const failed = rows.filter((r) => r.verdict !== "pass");

  const columns: ReadonlyArray<Column<EvalRun>> = [
    {
      key: "feature",
      header: "Feature and golden set",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            <code className="font-[var(--font-mono)]">{r.featureKey}</code>
          </div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            Set {r.datasetVersion} · metric {r.metric}
            {r.promptContentHash ? (
              <>
                {" · prompt "}
                <code className="font-[var(--font-mono)]">{r.promptContentHash}</code>
              </>
            ) : null}
          </div>
          {/* The must-pass list is the reason a run failed even when the score improved.
              Burying it behind a click would leave the verdict looking arbitrary. */}
          {r.mustPassFailures.length > 0 ? (
            <div className="mt-0.5 text-[12px] leading-[18px] text-[var(--status-rejected-text)]">
              Must-pass cases that failed: {r.mustPassFailures.join(", ")}
            </div>
          ) : null}
          {r.failureClusters.length > 0 ? (
            <div className="mt-0.5 text-[12px] leading-[18px] text-[var(--text-muted)]">
              Failure clusters: {r.failureClusters.map((c) => `${c.label} (${c.count})`).join(", ")}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "baseline",
      header: "Rules baseline",
      numeric: true,
      width: "w-32",
      render: (r) => num(r.baseline, 3),
    },
    {
      key: "candidate",
      header: "Candidate",
      numeric: true,
      width: "w-32",
      render: (r) => <span className="font-semibold">{num(r.candidate, 3)}</span>,
    },
    {
      key: "margin",
      header: "Margin",
      numeric: true,
      width: "w-44",
      // The number the verdict actually turns on: how far it beat the baseline, against how
      // far it had to. A score on its own says nothing about whether it was enough.
      render: (r) => {
        const delta = r.candidate - r.baseline;
        const clears = delta >= r.tolerance;
        return (
          <div>
            <div className={clears ? "text-[var(--text-primary)]" : "text-[var(--status-rejected-text)]"}>
              {delta >= 0 ? "+" : "−"}
              {num(Math.abs(delta), 3)}
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">needs +{num(r.tolerance, 3)}</div>
          </div>
        );
      },
    },
    {
      key: "verdict",
      header: "Gate",
      width: "w-32",
      render: (r) =>
        r.verdict === "pass" ? (
          <StatusBadge tone="done" label="Passed" />
        ) : (
          <StatusBadge tone="rejected" label="Failed" />
        ),
    },
    {
      key: "runAt",
      header: "Run",
      width: "w-44",
      render: (r) => <span className="text-[var(--text-secondary)]">{dateTime(r.runAt)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Evaluations"
        subtitle="Every run of a feature against its golden set. A run has to beat the plain rules by a declared margin and get every must-pass case right, or the prompt cannot be promoted."
        meta={
          rows.length > 0
            ? [
                { label: "Runs", value: num(rows.length) },
                { label: "Passed", value: num(rows.length - failed.length) },
                { label: "Failed", value: num(failed.length) },
              ]
            : []
        }
        actions={
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            Feature
            <select
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)]"
            >
              <option value="">All features</option>
              {(registry.data?.data ?? []).map((f) => (
                <option key={f.key} value={f.key}>
                  {f.displayName}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {failed.length > 0 ? (
        <div className="flex gap-2.5 rounded-[var(--radius-card)] border border-[var(--status-rejected-text)] bg-[var(--status-rejected-bg)] p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-rejected-text)]" aria-hidden />
          <div className="text-[13px] leading-5">
            <p className="font-semibold text-[var(--status-rejected-text)]">
              {failed.length} {failed.length === 1 ? "run has" : "runs have"} failed the gate.
            </p>
            <p className="mt-0.5 text-[var(--text-secondary)]">
              Nothing that failed can be promoted to production —{" "}
              {[...new Set(failed.map((f) => f.featureKey))].join(", ")} stay on the version that last passed. The gate
              refuses; it does not warn.
            </p>
          </div>
        </div>
      ) : null}

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r, i) => `${r.featureKey}-${r.runAt}-${i}`}
        caption="Evaluation runs against golden sets, with the pass or fail verdict of each"
        empty={
          feature ? (
            // Naming the consequence rather than saying "no data". An unevaluated feature is
            // not a gap in a report; it is a feature that cannot be promoted.
            <Empty
              title="This feature has never been evaluated"
              body={`No run has been recorded for ${feature}. It cannot be promoted to production on that basis — a golden set with no run behind it proves nothing.`}
            />
          ) : (
            <Empty
              title="No evaluation has been run"
              body="No feature can ship on this basis: a golden set with no run behind it proves nothing. Runs appear here as soon as one is recorded against a dataset version."
            />
          )
        }
      />
    </div>
  );
}
