"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@spine/data/use-query";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { EmployeeRow } from "../api";
import { hrmApi } from "../api";

/**
 * ONE EMPLOYEE.
 *
 * The privacy panel below is the point of this screen, and it is a selling point rather
 * than an apology. A DPDP auditor asking "who can see an employee's Aadhaar, and how would
 * you know they looked?" wants exactly this answer: the value is encrypted at rest, the
 * only projection the API can produce is the masked one, and the unmask is a different
 * permission on a different endpoint that will not accept the request without a typed
 * reason — which then lands in a log where UPDATE and DELETE are revoked.
 *
 * So there is NO reveal control here, and no client-side unmask: this screen is read-only,
 * and an unmask is a privileged, logged action rather than a piece of UI convenience.
 */
export default function EmployeeScreen(props: ScreenProps): React.JSX.Element {
  const employeeId = props.params[0];
  const { data, loading, error, reload } = useQuery<EmployeeRow>(
    employeeId ? hrmApi.employeePath(employeeId) : null,
  );

  if (!employeeId) {
    return (
      <Empty
        title="No employee chosen"
        body="This screen opens one person at a time. Pick somebody from Employees."
        action={<BackLink />}
      />
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading) return <Loading label="Loading employee…" />;
  if (!data) return <Empty title="Employee not found" body="No employee with that reference." action={<BackLink />} />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data.name}
        subtitle="Everything held about this person, and how the sensitive parts of it are protected."
        meta={[
          { label: "Code", value: data.empCode },
          { label: "Joined", value: date(data.dateOfJoining) },
          { label: "Status", value: <StatusBadge status={data.status} /> },
        ]}
        actions={<BackLink />}
      />

      <Card title="Employment">
        <Field label="Employee code" value={data.empCode} mono />
        <Field label="Employment type" value={humanise(data.employmentType)} />
        <Field label="Date of joining" value={date(data.dateOfJoining)} />
        <Field label="Department" value={data.department ?? "—"} />
        <Field label="Designation" value={data.designation ?? "—"} />
        <Field label="Gender" value={data.gender ? humanise(data.gender) : "—"} />
      </Card>

      <Card title="Statutory placement">
        {/* These two are not administrative trivia: PT is charged by the STATE a person is
            employed in, and the EPF ceiling policy decides whether contributions are capped
            at the statutory wage ceiling or computed on actual wages. Both change the net
            pay, so both are shown where somebody can question them. */}
        <Field label="Professional tax state" value={data.ptState} />
        <Field label="EPF ceiling policy" value={humanise(data.epfCeilingPolicy)} />
      </Card>

      <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
              Personal identifiers
            </h2>
            <p className="mt-1 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
              These are stored encrypted and are <strong>masked everywhere in this system by
              default</strong>. Seeing a full number is a separate permission on a separate
              request, it will not proceed without a written reason, and every single viewing
              is recorded against the person who did it. Nothing on this screen can unmask
              them.
            </p>

            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <MaskedField label="PAN" masked={data.pan} />
              <MaskedField label="Aadhaar" masked={data.aadhaar} />
              <MaskedField label="Bank account" masked={data.bankAccount} />
            </dl>

            <p className="mt-3 text-[12px] leading-5 text-[var(--text-muted)]">
              Lawful basis for holding this data:{" "}
              <span className="text-[var(--text-secondary)]">{humanise(data.piiLegalBasis)}</span>.
              Employment records are a legitimate use under the DPDP Act — no consent is
              collected because none is required, and collecting one anyway would be theatre.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function BackLink(): React.JSX.Element {
  return (
    <Link
      href="/hrm/employees"
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-input)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Employees
    </Link>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {title}
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "mt-0.5 font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]"
            : "mt-0.5 text-[13px] text-[var(--text-primary)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * A masked identifier. "Not recorded" and a masked value are shown differently on purpose:
 * a blank cell reads as a screen that failed to load, and payroll cannot tell those apart
 * when a bank advice comes back short.
 */
function MaskedField({ label, masked }: { label: string; masked: string | null }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-2">
        {masked ? (
          <>
            <span className="font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]">
              {masked}
            </span>
            <span className="text-[11px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
              masked
            </span>
          </>
        ) : (
          <span className="text-[13px] text-[var(--text-secondary)]">Not recorded</span>
        )}
      </dd>
    </div>
  );
}
