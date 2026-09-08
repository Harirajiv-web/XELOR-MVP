"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { cn } from "@spine/ui/cn";
import type { ScreenProps } from "@spine/registry/manifest";
import type { Envelope, HitlItem } from "../api";
import { aiopsApi } from "../api";

/**
 * REVIEW QUEUE — the drafts waiting for a person.
 *
 * Nothing in this product writes a business record on a model's say-so. When a post-call
 * guardrail is unhappy — usually because confidence fell below the floor — the answer does
 * not go on a screen as fact; it comes here, and a named human decides. This queue is
 * therefore not a backlog to be embarrassed about. It is the mechanism working.
 *
 * READ-ONLY IN THIS PASS. Accepting or rejecting a draft is a consequential action with a
 * person's name attached to the outcome, and it belongs in a properly gated build rather
 * than a button added to a list screen. The API has the endpoint; this screen deliberately
 * does not call it.
 */

const STATUSES = [
  { key: "open", label: "Waiting" },
  { key: "accepted", label: "Accepted" },
  { key: "corrected", label: "Corrected" },
  { key: "rejected", label: "Rejected" },
] as const;

/**
 * A one-line look at what the model proposed.
 *
 * Enough to recognise the document, never enough to act on without opening it. A reviewer
 * who can approve from a truncated preview is a reviewer who is rubber-stamping.
 */
function preview(proposed: unknown): string {
  if (proposed === null || proposed === undefined) return "—";
  if (typeof proposed !== "object") return String(proposed);
  const entries = Object.entries(proposed as Record<string, unknown>).slice(0, 3);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${humanise(k)}: ${typeof v === "object" ? "…" : String(v)}`).join("  ·  ");
}

export default function ReviewQueueScreen(_props: ScreenProps): React.JSX.Element {
  const [status, setStatus] = useState<string>("open");
  const { data, loading, error, reload } = useQuery<Envelope<HitlItem>>(aiopsApi.hitlPath, {
    query: { status },
  });
  const rows = data?.data ?? [];

  const columns: ReadonlyArray<Column<HitlItem>> = [
    {
      key: "doc",
      header: "Document",
      width: "w-56",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.docRef ?? "Not yet numbered"}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {r.docType ? humanise(r.docType) : "No document type recorded"}
          </div>
        </div>
      ),
    },
    {
      key: "feature",
      header: "Feature",
      width: "w-56",
      render: (r) => (
        <code className="font-[var(--font-mono)] text-[12px] text-[var(--text-secondary)]">{r.featureKey}</code>
      ),
    },
    {
      key: "reason",
      header: "Why a person was asked",
      width: "w-48",
      render: (r) => humanise(r.reason),
    },
    {
      key: "confidence",
      header: "Confidence",
      numeric: true,
      width: "w-32",
      // The model's own claim, shown as such. It is what routed the item here; it is not
      // evidence that the draft is right.
      render: (r) =>
        r.confidence === null ? (
          <span className="text-[var(--text-muted)]">—</span>
        ) : (
          `${num(r.confidence * 100, 0)}%`
        ),
    },
    {
      key: "proposed",
      header: "What it proposed",
      render: (r) => <span className="text-[var(--text-secondary)]">{preview(r.proposed)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Review queue"
        subtitle="Drafts the AI produced that a person has to confirm before they become anything. Nothing here has been written to a business record."
        meta={rows.length > 0 ? [{ label: "Items", value: num(rows.length) }] : []}
        actions={
          <div className="flex items-center gap-1">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatus(s.key)}
                className={cn(
                  "rounded-[var(--radius-control)] border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  status === s.key
                    ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "border-[var(--border-input)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[13px] leading-5 text-[var(--text-secondary)]">
        This screen shows the queue; it does not yet accept or reject from here. A decision changes a business record
        and carries the reviewer's name, so it is being built with its own approval path rather than added as a button.
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.id}
        caption="AI drafts awaiting or having received human review"
        empty={
          status === "open" ? (
            <Empty
              title="Nothing is waiting for a person"
              body="Every AI draft so far was confident enough to stand on its own, or has already been reviewed. Items arrive here automatically when a post-call check is unhappy."
            />
          ) : (
            <Empty
              title="Nothing with that outcome"
              body="No draft has been recorded with this review decision yet."
            />
          )
        }
      />
    </div>
  );
}
