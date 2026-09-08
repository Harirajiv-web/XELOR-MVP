"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, MapPin, MessageCircle, Search, Trophy } from "lucide-react";
import { api } from "@spine/api/client";
import { Chip, Kpi, shortDate } from "../parts";
import type { DeskOverview, DeskSupplier } from "../types";

/**
 * THE SUPPLIER DIRECTORY, as scorecards rather than a contact list.
 *
 * The research on real procurement suites is consistent that a supplier list is only useful
 * when it carries PERFORMANCE, not just details — who answers, who wins, who is reachable.
 * So each card leads with the two facts that decide whether to invite somebody to the next
 * request: how often they bother to reply, and whether they can actually be awarded.
 *
 * Response rate is NULL, never zero, for a supplier nobody has asked. A workshop added
 * yesterday has not failed to answer anything, and showing them at 0% next to somebody who
 * has ignored nine invitations would be the same badge for opposite facts.
 */
export default function DeskSuppliersPage(): React.JSX.Element {
  const [data, setData] = useState<DeskOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let alive = true;
    // The spine client, not raw fetch: it attaches the demo credential (or the bearer token
    // outside demo mode) and unwraps the error envelope. A hand-rolled fetch here answers
    // "Bearer token required" on every request and looks like a broken page.
    api
      .get<DeskOverview>("/purchase/network/desk")
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const all = data?.suppliers ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q) ||
        s.categories.some((c) => c.toLowerCase().includes(q)),
    );
  }, [data, filter]);

  if (error) {
    return (
      <p className="rounded-xl border border-[var(--bad)] bg-[var(--bad-soft)] p-5 text-[13px] text-[var(--bad-ink)]">
        {error}
      </p>
    );
  }
  if (!data) return <p className="p-5 text-[13px] text-[var(--text-muted)]">Loading suppliers…</p>;

  const awardable = data.suppliers.filter((s) => s.isApprovedVendor).length;
  const reachable = data.suppliers.filter((s) => s.whatsappE164 || s.email).length;

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Suppliers" value={String(data.suppliers.length)} sub="on the network" />
        <Kpi
          label="Reachable"
          value={String(reachable)}
          sub="have WhatsApp or email"
          tone={reachable === data.suppliers.length ? "good" : "warn"}
        />
        <Kpi
          label="Can be awarded"
          value={String(awardable)}
          sub="approved as vendors"
          tone={awardable > 0 ? "good" : "warn"}
        />
        <Kpi
          label="Response rate"
          value={data.kpis.responseRate === null ? "—" : `${data.kpis.responseRate}%`}
          sub="across all invitations"
          tone={data.kpis.responseRate !== null && data.kpis.responseRate >= 60 ? "good" : "warn"}
        />
      </section>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, city or what they make…"
          aria-label="Filter suppliers"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[13px] text-[var(--text-secondary)]">
          {filter ? `Nothing matched “${filter}”.` : "No suppliers on the network yet."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((s) => (
            <SupplierCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierCard({ s }: { s: DeskSupplier }): React.JSX.Element {
  const rateTone = s.responseRate === null ? "neutral" : s.responseRate >= 60 ? "good" : "warn";
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[15px] font-semibold text-[var(--brand)]">
          {s.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{s.name}</p>
          <p className="flex items-center gap-1 truncate text-[12px] text-[var(--text-secondary)]">
            {s.city ? (
              <>
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                {s.city} ·{" "}
              </>
            ) : null}
            <span className="font-[var(--font-mono)]">{s.supplierCode}</span>
          </p>
        </div>
        {s.wins > 0 ? (
          <Chip tone="good" icon={Trophy}>
            {s.wins} won
          </Chip>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-1">
        {s.categories.length === 0 ? (
          <span className="text-[12px] text-[var(--text-muted)]">not categorised</span>
        ) : (
          s.categories.map((c) => <Chip key={c}>{c}</Chip>)
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3">
        <div>
          <dt className="text-[11px] text-[var(--text-muted)]">Answers invitations</dt>
          <dd
            className={`text-[16px] font-semibold ${
              rateTone === "good"
                ? "text-[var(--good-fg)]"
                : rateTone === "warn"
                  ? "text-[var(--warn-ink)]"
                  : "text-[var(--text-secondary)]"
            }`}
          >
            {s.responseRate === null ? "never asked" : `${s.responseRate}%`}
          </dd>
          {s.invitedCount > 0 ? (
            <p className="text-[11px] text-[var(--text-muted)]">
              {s.respondedCount} of {s.invitedCount}
            </p>
          ) : null}
        </div>
        <div>
          <dt className="text-[11px] text-[var(--text-muted)]">Last answered</dt>
          <dd className="text-[13px] text-[var(--text-primary)]">
            {s.lastQuotedAt ? shortDate(s.lastQuotedAt.slice(0, 10)) : "—"}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-3">
        {s.whatsappE164 ? (
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <MessageCircle className="h-3.5 w-3.5 text-[var(--good-fg)]" aria-hidden />
            {s.whatsappE164}
          </span>
        ) : null}
        {s.email ? (
          <span className="flex items-center gap-1.5 truncate text-[12px] text-[var(--text-secondary)]">
            <Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
            {s.email}
          </span>
        ) : null}
      </div>

      {/* Stated as the consequence, not the status. "Not a vendor" does not tell a buyer why
          the award button will refuse them later. */}
      {s.isApprovedVendor ? (
        <Chip tone="good">Approved vendor — can be awarded</Chip>
      ) : (
        <Chip tone="warn">Can quote, but must be approved before an award</Chip>
      )}
    </article>
  );
}
