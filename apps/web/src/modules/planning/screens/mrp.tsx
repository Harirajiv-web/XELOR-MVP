"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { Empty, ErrorState, Loading } from "@spine/states";
import { dateTime, date, num, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { MrpRunHeader } from "../api";
import { planningApi } from "../api";

/**
 * THE LAST MRP RUN.
 *
 * Not a dashboard — a receipt. It answers four questions a plant manager asks before
 * trusting anything else in this module: when was this computed, as of what date, over how
 * long, and what came out. A planned-order list read against a run from three weeks ago is
 * worse than no list at all, and the only defence against that is putting the run's own date
 * where it cannot be missed.
 *
 * A tenant that has never run MRP gets `null` back, not an error. That distinction is
 * carried all the way to the screen: "you have not run this yet" and "this is broken" send a
 * user to two different people.
 */
export default function MrpScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<MrpRunHeader | null>(
    planningApi.latestRunPath,
  );

  if (loading) return <Loading label="Reading the last plan…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="MRP run"
          subtitle="The last time the system worked out what to make and what to buy, and what it concluded."
        />
        <Empty
          title="MRP has not been run yet"
          body="Nothing has been planned. A run reads the demand, the stock on hand, the open purchase and work orders and the bills of material, then works out what is short — and until somebody runs it, there is no plan to read."
        />
      </div>
    );
  }

  // jsonb columns arrive as whatever was written. Defensive because a malformed warnings
  // array should cost this screen a section, not the whole page.
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  const params = data.params ?? {};

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`MRP run ${data.runNo}`}
        subtitle="What the plan was computed from and what came out of it. Every number below is the run's own record — nothing on this screen is recalculated."
        meta={[
          { label: "Planned as of", value: `${date(data.planningDate)} · ${relativeDays(data.planningDate)}` },
          { label: "Horizon", value: `${data.firstBucket} → ${data.lastBucket}` },
          { label: "Run at", value: dateTime(data.createdAt) },
          { label: "Took", value: `${num(data.durationMs)} ms` },
        ]}
        actions={<StatusBadge status={data.status} />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Items planned" value={num(data.itemCount)} />
        <Figure
          label="Planned orders"
          value={num(data.plannedOrderCount)}
          href="/planning/planned-orders"
          hint="Suggestions. None of them commits anybody until a person converts it."
        />
        <Figure
          label="Exceptions"
          value={num(data.exceptionCount)}
          href="/planning/exceptions"
          hint="The short list of things that go wrong unless somebody acts this week."
        />
      </div>

      <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
          What went into this run
        </h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <Fact label="Run type" value={data.runType} />
          <Fact label="Horizon length" value={`${data.horizonBuckets} weekly buckets`} />
          <Fact
            label="Items with an MRP policy"
            value={params.itemsPlanned === undefined ? "—" : num(params.itemsPlanned)}
          />
          <Fact
            label="Demand rows read"
            value={params.demandRows === undefined ? "—" : num(params.demandRows)}
          />
          <Fact
            label="Open supply counted"
            value={params.openSupplyRows === undefined ? "—" : num(params.openSupplyRows)}
          />
          <Fact label="Working calendar" value={params.calendar?.code ?? "—"} />
          {/* The actor is a uuid on this endpoint — no name is carried. Shown raw rather
              than dressed up as a person, because a fabricated name is worse than an id. */}
          <Fact label="Run by (user id)" value={data.createdBy} mono />
        </dl>
      </section>

      {data.failureReason ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--status-rejected-text)] bg-[var(--status-rejected-bg)] px-3 py-2 text-[13px] text-[var(--status-rejected-text)]">
          {data.failureReason}
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
            <TriangleAlert className="h-3.5 w-3.5 text-[var(--status-pending-text)]" aria-hidden />
            The run is more confident than the facts, in {warnings.length}{" "}
            {warnings.length === 1 ? "place" : "places"}
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {warnings.map((w, i) => (
              <li key={`${i}-${w}`} className="text-[13px] leading-5 text-[var(--text-secondary)]">
                {w}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** A single headline number, optionally a doorway to the list behind it. */
function Figure({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
}): React.JSX.Element {
  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-[24px] font-bold tabular-nums text-[var(--text-primary)]">
        {value}
      </div>
      {hint ? <p className="mt-1 text-[12px] leading-4 text-[var(--text-secondary)]">{hint}</p> : null}
    </>
  );
  const className =
    "rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4";
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={`${className} transition-colors hover:bg-[var(--brand-soft-2)]`}>
      {body}
    </Link>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] pb-1.5 last:border-b-0">
      <dt className="text-[12px] text-[var(--text-secondary)]">{label}</dt>
      <dd
        className={
          mono
            ? "font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]"
            : "text-[13px] text-[var(--text-primary)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}
