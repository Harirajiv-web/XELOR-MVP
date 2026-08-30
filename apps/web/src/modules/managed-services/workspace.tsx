"use client";

import * as Icons from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { ErrorState, Loading } from "@spine/states";
import { StatusBadge, toneFor } from "@spine/ui/status-badge";
import { cn } from "@spine/ui/cn";
import {
  managedServicesApi,
  type ManagedServiceEnvelope,
  type ManagedServiceResponsibility,
  type ManagedServiceSnapshot,
} from "./api";

export type ManagedServiceView =
  "command-centre" | "incidents" | "changes" | "reviews" | "responsibilities";

const TITLES: Record<
  ManagedServiceView,
  { title: string; kicker: string; description: string }
> = {
  "command-centre": {
    title: "Service command centre",
    kicker: "RELAY · MANAGED SERVICE OPERATIONS",
    description:
      "One operating view for the service around ONYX—from onboarding and monitoring to restoration, customer updates and measurable improvement.",
  },
  incidents: {
    title: "Incidents & escalation",
    kicker: "RESTORE SERVICE · KEEP THE CUSTOMER INFORMED",
    description:
      "RELAY owns the incident clock and communication while the correct specialist owns diagnosis and repair.",
  },
  changes: {
    title: "Changes & releases",
    kicker: "ONE CALENDAR · CLEAR RISK · VERIFIED OUTCOME",
    description:
      "Every material change has a technical owner, an approved window, a customer notice and a post-change service check.",
  },
  reviews: {
    title: "Service reviews",
    kicker: "MEASURE · EXPLAIN · IMPROVE",
    description:
      "The regular customer conversation built from service evidence, open risks and an improvement register—not a slide assembled from memory.",
  },
  responsibilities: {
    title: "Responsibility map",
    kicker: "ONE TASK · ONE ACCOUNTABLE OWNER",
    description:
      "The exact line between service coordination, technical ownership, governance, product support and factory operations.",
  },
};

function BoundaryNote({ text }: { text: string }): React.JSX.Element {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-[12px] border border-[var(--warn)]/30 bg-[var(--warn)]/10 px-3.5 py-3 text-[var(--warn-ink)]"
    >
      <Icons.FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[.1em]">
          Illustrative managed-service model
        </p>
        <p className="mt-0.5 max-w-[100ch] text-[11px] leading-5">{text}</p>
      </div>
    </div>
  );
}

function Hero({
  view,
  data,
}: {
  view: ManagedServiceView;
  data: ManagedServiceSnapshot;
}): React.JSX.Element {
  const copy = TITLES[view];
  return (
    <section className="relative overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_7%_0%,color-mix(in_srgb,var(--dept-relay)_24%,transparent),transparent_38%),radial-gradient(circle_at_100%_100%,var(--violet-soft),transparent_34%)]"
        aria-hidden
      />
      <div className="relative grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_330px] lg:p-6">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[var(--dept-relay)]">
            {copy.kicker}
          </p>
          <h1 className="mt-2 text-[25px] font-extrabold tracking-[-.025em] text-[var(--text-primary)]">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-[72ch] text-[13px] leading-6 text-[var(--text-secondary)]">
            {copy.description}
          </p>
        </div>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_88%,transparent)] p-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-[var(--dept-relay)] text-[var(--text-on-accent)] shadow-[var(--shadow-md)]">
              <Icons.Headset className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--text-muted)]">
                Service owner
              </p>
              <p className="text-[15px] font-extrabold text-[var(--text-primary)]">
                RELAY · Managed Services
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">
            Coordinates service outcomes and human teams. It never takes
            technical ownership away from the specialist responsible for the
            affected domain.
          </p>
          <p className="mt-2 text-[10px] text-[var(--text-muted)]">
            Snapshot{" "}
            {new Date(data.asOf).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
      </div>
    </section>
  );
}

function MetricStrip({
  data,
}: {
  data: ManagedServiceSnapshot;
}): React.JSX.Element {
  const metrics = [
    [
      "Healthy services",
      String(data.headline.servicesHealthy),
      "Inside the agreed operating target",
      "ok",
    ],
    [
      "Services at risk",
      String(data.headline.servicesAtRisk),
      "Need active coordination",
      "warn",
    ],
    [
      "Open incidents",
      String(data.headline.openIncidents),
      "Each has a named next update",
      "bad",
    ],
    [
      "SLO attainment",
      `${data.headline.sloAttainment.toFixed(1)}%`,
      "Illustrative current window",
      "ok",
    ],
    [
      "Changes this week",
      String(data.headline.changesThisWeek),
      "One customer calendar",
      "neutral",
    ],
  ] as const;
  return (
    <section
      className="grid gap-3 md:grid-cols-3 xl:grid-cols-5"
      aria-label="Managed service headline measures"
    >
      {metrics.map(([label, value, note, tone]) => (
        <article
          key={label}
          className={cn(
            "rounded-[14px] border p-4 shadow-[var(--shadow-sm)]",
            tone === "ok" &&
              "border-[color-mix(in_srgb,var(--ok)_25%,var(--border-subtle))] bg-[var(--ok-soft)]",
            tone === "warn" &&
              "border-[color-mix(in_srgb,var(--warn)_28%,var(--border-subtle))] bg-[var(--warn-soft)]",
            tone === "bad" &&
              "border-[color-mix(in_srgb,var(--bad)_24%,var(--border-subtle))] bg-[var(--bad-soft)]",
            tone === "neutral" &&
              "border-[var(--border-subtle)] bg-[var(--surface)]",
          )}
        >
          <p className="text-[9.5px] font-extrabold uppercase tracking-[.1em] text-[var(--text-muted)]">
            {label}
          </p>
          <p className="mt-2 text-[24px] font-extrabold tracking-[-.03em] text-[var(--text-primary)]">
            {value}
          </p>
          <p className="mt-1 text-[10.5px] leading-4 text-[var(--text-secondary)]">
            {note}
          </p>
        </article>
      ))}
    </section>
  );
}

function CommandCentre({
  data,
}: {
  data: ManagedServiceSnapshot;
}): React.JSX.Element {
  return (
    <>
      <MetricStrip data={data} />
      <section className="card overflow-hidden">
        <div className="panel-h">
          <span>Managed-service lifecycle</span>
          <span className="panel-h-sub">
            design → transition → operate → improve
          </span>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          {data.lifecycle.map((stage, index) => (
            <article
              key={stage.key}
              className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--dept-relay)] text-[10px] font-extrabold text-[var(--text-on-accent)]">
                  {index + 1}
                </span>
                <h2 className="text-[13px] font-extrabold text-[var(--text-primary)]">
                  {stage.name}
                </h2>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                {stage.purpose}
              </p>
              <p className="mt-3 text-[9.5px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
                Accountable · {stage.accountable}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {stage.outputs.map((output) => (
                  <span
                    key={output}
                    className="rounded-full bg-[var(--surface-sunken)] px-2 py-1 text-[9.5px] text-[var(--text-secondary)]"
                  >
                    {output}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="card overflow-hidden">
        <div className="panel-h">
          <span>Service catalogue</span>
          <span className="panel-h-sub">
            outcomes the customer can hold us to
          </span>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {data.serviceCatalogue.map((service) => (
            <article
              key={service.service}
              className="grid gap-3 p-4 lg:grid-cols-[170px_minmax(0,1.5fr)_minmax(180px,1fr)_170px_auto] lg:items-center"
            >
              <div>
                <p className="text-[12px] font-extrabold text-[var(--text-primary)]">
                  {service.service}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {service.owner}
                </p>
              </div>
              <p className="text-[11.5px] leading-5 text-[var(--text-secondary)]">
                {service.outcome}
              </p>
              <p className="text-[10.5px] leading-4 text-[var(--text-secondary)]">
                {service.coverage}
              </p>
              <p className="text-[10.5px] font-semibold text-[var(--text-primary)]">
                {service.objective}
              </p>
              <StatusBadge
                tone={service.status === "healthy" ? "approved" : "pending"}
                label={service.status === "healthy" ? "Healthy" : "At risk"}
              />
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function Incidents({
  data,
}: {
  data: ManagedServiceSnapshot;
}): React.JSX.Element {
  return (
    <section className="grid gap-4">
      {data.incidents.map((incident) => (
        <article key={incident.number} className="card overflow-hidden">
          <div className="flex flex-wrap items-start gap-3 border-b border-[var(--border-subtle)] p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-[11px] font-bold text-[var(--dept-relay)]">
                  {incident.number}
                </code>
                <StatusBadge
                  tone={
                    incident.severity === "P1"
                      ? "overdue"
                      : incident.severity === "P2"
                        ? "rejected"
                        : "pending"
                  }
                  label={incident.severity}
                />
                <StatusBadge
                  tone={toneFor(incident.status)}
                  label={incident.status}
                />
              </div>
              <h2 className="mt-2 text-[15px] font-extrabold text-[var(--text-primary)]">
                {incident.title}
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                {incident.customerImpact}
              </p>
            </div>
            <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-right">
              <p className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
                Next customer update
              </p>
              <p className="mt-0.5 text-[13px] font-extrabold text-[var(--text-primary)]">
                {incident.nextUpdate}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                open {incident.elapsed}
              </p>
            </div>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <dl className="grid gap-2 text-[11px]">
              <div>
                <dt className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
                  RELAY coordinates
                </dt>
                <dd className="mt-0.5 font-semibold text-[var(--text-primary)]">
                  {incident.coordinator} · incident, clock, escalation, update
                </dd>
              </div>
              <div>
                <dt className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
                  Specialist resolves
                </dt>
                <dd className="mt-0.5 font-semibold text-[var(--text-primary)]">
                  {incident.technicalOwner}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
                  Affected service
                </dt>
                <dd className="mt-0.5 text-[var(--text-secondary)]">
                  {incident.affectedService}
                </dd>
              </div>
            </dl>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
                Evidence before closure
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {incident.evidence.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2.5 text-[10.5px] text-[var(--text-secondary)]"
                  >
                    <Icons.CheckCircle2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ok)]"
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function Changes({
  data,
}: {
  data: ManagedServiceSnapshot;
}): React.JSX.Element {
  return (
    <section className="card overflow-hidden">
      <div className="panel-h">
        <span>Customer change calendar</span>
        <span className="panel-h-sub">
          technical ownership stays with the specialist
        </span>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {data.changes.map((change) => (
          <article
            key={change.number}
            className="grid gap-3 p-4 md:grid-cols-[150px_minmax(0,1fr)_180px_210px_auto] md:items-center"
          >
            <div>
              <code className="text-[10.5px] font-bold text-[var(--dept-relay)]">
                {change.number}
              </code>
              <div className="mt-1">
                <StatusBadge
                  tone={
                    change.risk === "high"
                      ? "overdue"
                      : change.risk === "medium"
                        ? "pending"
                        : "approved"
                  }
                  label={`${change.risk} risk`}
                />
              </div>
            </div>
            <div>
              <h2 className="text-[12.5px] font-extrabold text-[var(--text-primary)]">
                {change.title}
              </h2>
              <p className="mt-1 text-[10.5px] text-[var(--text-secondary)]">
                Post-change check · {change.serviceCheck}
              </p>
            </div>
            <p className="text-[10.5px] font-semibold text-[var(--text-primary)]">
              {change.technicalOwner}
            </p>
            <p className="text-[10.5px] text-[var(--text-secondary)]">
              {change.window}
            </p>
            <StatusBadge tone={toneFor(change.state)} label={change.state} />
          </article>
        ))}
      </div>
    </section>
  );
}

function Reviews({
  data,
}: {
  data: ManagedServiceSnapshot;
}): React.JSX.Element {
  return (
    <section className="grid gap-4">
      {data.reviews.map((review) => (
        <article
          key={`${review.customer}-${review.period}`}
          className="card overflow-hidden"
        >
          <div className="grid gap-4 border-b border-[var(--border-subtle)] p-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="text-[9.5px] font-extrabold uppercase tracking-[.1em] text-[var(--dept-relay)]">
                {review.period} · {review.customer}
              </p>
              <h2 className="mt-1 text-[16px] font-extrabold text-[var(--text-primary)]">
                Monthly service review pack
              </h2>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Owner · {review.serviceManager}
              </p>
            </div>
            <StatusBadge tone="approved" label={review.status} />
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
                Evidence inside the pack
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {review.evidence.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 text-[10.5px] font-semibold text-[var(--text-primary)]"
                  >
                    <Icons.FileCheck2
                      className="h-4 w-4 shrink-0 text-[var(--dept-relay)]"
                      aria-hidden
                    />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <aside className="rounded-[12px] border border-[color-mix(in_srgb,var(--dept-relay)_28%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--dept-relay)_8%,var(--surface))] p-4">
              <p className="text-[9.5px] font-bold uppercase tracking-[.08em] text-[var(--dept-relay)]">
                Agreed improvement
              </p>
              <p className="mt-2 text-[11.5px] leading-5 text-[var(--text-primary)]">
                {review.improvement}
              </p>
              <p className="mt-3 text-[10px] leading-4 text-[var(--text-muted)]">
                RELAY tracks the improvement. The responsible specialist
                implements it; a human approves contractual scope or credits.
              </p>
            </aside>
          </div>
        </article>
      ))}
    </section>
  );
}

function ResponsibilityRow({
  item,
}: {
  item: ManagedServiceResponsibility;
}): React.JSX.Element {
  return (
    <article className="grid gap-3 border-b border-[var(--border-subtle)] p-4 last:border-b-0 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.9fr)]">
      <div>
        <span
          className={cn(
            "inline-flex rounded-[7px] px-2 py-1 text-[10px] font-extrabold tracking-[.08em] text-[var(--text-on-accent)]",
            item.accountable === "RELAY"
              ? "bg-[var(--dept-relay)]"
              : "bg-[var(--text-primary)]",
          )}
        >
          {item.accountable}
        </span>
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
          Accountable for
        </p>
        <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-primary)]">
          {item.responsibility}
        </p>
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">
          Handoff
        </p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
          {item.handoff}
        </p>
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--bad)]">
          Does not own
        </p>
        <p className="mt-1 text-[10.5px] leading-5 text-[var(--text-secondary)]">
          {item.boundary}
        </p>
      </div>
    </article>
  );
}

function Responsibilities({
  data,
}: {
  data: ManagedServiceSnapshot;
}): React.JSX.Element {
  return (
    <section className="card overflow-hidden">
      <div className="panel-h">
        <span>Accountability and handoff matrix</span>
        <span className="panel-h-sub">no repeated technical ownership</span>
      </div>
      <div>
        {data.responsibilities.map((item) => (
          <ResponsibilityRow key={item.key} item={item} />
        ))}
      </div>
    </section>
  );
}

export function ManagedServicesWorkspace({
  view,
}: {
  view: ManagedServiceView;
}): React.JSX.Element {
  const query = useQuery<ManagedServiceEnvelope>(
    managedServicesApi.overviewPath,
  );
  if (query.loading)
    return <Loading label="Loading the managed-service operating view…" />;
  if (query.error)
    return <ErrorState error={query.error} onRetry={query.reload} />;
  if (!query.data?.data)
    return (
      <ErrorState
        error={
          new Error("The managed-service response did not contain a snapshot.")
        }
        onRetry={query.reload}
      />
    );
  const data = query.data.data;
  return (
    <div className="flex flex-col gap-4">
      <BoundaryNote text={data.boundary} />
      <Hero view={view} data={data} />
      {view === "command-centre" ? (
        <CommandCentre data={data} />
      ) : view === "incidents" ? (
        <Incidents data={data} />
      ) : view === "changes" ? (
        <Changes data={data} />
      ) : view === "reviews" ? (
        <Reviews data={data} />
      ) : (
        <Responsibilities data={data} />
      )}
    </div>
  );
}
