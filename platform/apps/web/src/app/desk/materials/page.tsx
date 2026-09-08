"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@spine/api/client";
import { Package, Search, TrendingDown, TrendingUp } from "lucide-react";
import { Chip, Kpi, inr, qty as tidyQty, relativeDays, shortDate } from "../parts";
import type { DeskOverview, DeskRequest } from "../types";

interface MaterialRow {
  itemCode: string;
  itemName: string;
  uom: string;
  requests: DeskRequest[];
  totalQty: number;
  lowestSeen: number | null;
  highestSeen: number | null;
  suppliersWhoQuoted: string[];
  openRequests: number;
}

/**
 * THE SAME PART, ACROSS EVERY REQUEST FOR IT.
 *
 * The dashboard is organised by request, which is right for running the day — but it hides
 * the question a buyer asks over months: WHAT HAVE WE PAID FOR THIS PART, and who has ever
 * quoted it. Two requests for the same casing sit in different lanes and nothing connects
 * them.
 *
 * So this view pivots on the material. The price band is the point: the spread between the
 * lowest and highest anyone has ever quoted is the number that says whether the last
 * negotiation was good or merely finished, and it cannot be seen from a single request.
 */
export default function DeskMaterialsPage(): React.JSX.Element {
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

  const materials = useMemo<MaterialRow[]>(() => {
    const byCode = new Map<string, MaterialRow>();
    for (const r of data?.requests ?? []) {
      const code = r.itemCode ?? r.title;
      const row = byCode.get(code) ?? {
        itemCode: code,
        itemName: r.itemName ?? r.title,
        uom: r.uom,
        requests: [],
        totalQty: 0,
        lowestSeen: null,
        highestSeen: null,
        suppliersWhoQuoted: [],
        openRequests: 0,
      };
      row.requests.push(r);
      row.totalQty += Number(r.qty) || 0;
      if (r.stage !== "awarded" && r.stage !== "closed") row.openRequests += 1;
      for (const q of r.quotes) {
        const c = Number(q.landedCost);
        if (Number.isFinite(c)) {
          row.lowestSeen = row.lowestSeen === null ? c : Math.min(row.lowestSeen, c);
          row.highestSeen = row.highestSeen === null ? c : Math.max(row.highestSeen, c);
        }
        if (!row.suppliersWhoQuoted.includes(q.supplierName)) {
          row.suppliersWhoQuoted.push(q.supplierName);
        }
      }
      byCode.set(code, row);
    }
    const rows = [...byCode.values()].sort((a, b) => b.requests.length - a.requests.length);
    const q = filter.trim().toLowerCase();
    return q
      ? rows.filter(
          (m) => m.itemCode.toLowerCase().includes(q) || m.itemName.toLowerCase().includes(q),
        )
      : rows;
  }, [data, filter]);

  if (error) {
    return (
      <p className="rounded-xl border border-[var(--bad)] bg-[var(--bad-soft)] p-5 text-[13px] text-[var(--bad-ink)]">
        {error}
      </p>
    );
  }
  if (!data) return <p className="p-5 text-[13px] text-[var(--text-muted)]">Loading materials…</p>;

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Materials sourced" value={String(materials.length)} sub="distinct parts" />
        <Kpi
          label="Open on these"
          value={String(materials.reduce((n, m) => n + m.openRequests, 0))}
          sub="requests still running"
          tone="warn"
        />
        <Kpi
          label="Quotes collected"
          value={String(data.kpis.quotesIn)}
          sub="across every part"
          tone="brand"
        />
        <Kpi
          label="Spread identified"
          value={inr(data.kpis.savingsIdentified)}
          sub="highest vs best usable"
          tone="good"
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
          placeholder="Filter by part code or name…"
          aria-label="Filter materials"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      {materials.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[13px] text-[var(--text-secondary)]">
          {filter ? `Nothing matched “${filter}”.` : "Nothing has been sourced yet."}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {materials.map((m) => (
            <MaterialCard key={m.itemCode} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialCard({ m }: { m: MaterialRow }): React.JSX.Element {
  const spread =
    m.lowestSeen !== null && m.highestSeen !== null && m.highestSeen > m.lowestSeen
      ? m.highestSeen - m.lowestSeen
      : null;

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
          <Package className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-[var(--font-mono)] text-[14px] font-semibold text-[var(--text-primary)]">
            {m.itemCode}
          </p>
          <p className="truncate text-[12px] text-[var(--text-secondary)]">{m.itemName}</p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-semibold leading-none text-[var(--text-primary)]">
            {tidyQty(String(m.totalQty))}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">{m.uom} sourced</p>
        </div>
      </header>

      {/* THE PRICE BAND — the whole reason this view exists. */}
      {m.lowestSeen !== null && m.highestSeen !== null ? (
        <div className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-[var(--good-fg)]" aria-hidden />
              <span className="text-[13px] font-semibold text-[var(--good-fg)]">
                {inr(m.lowestSeen)}
              </span>
            </span>
            <span className="h-px flex-1 bg-[var(--border-strong)]" />
            <span className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--text-secondary)]">
                {inr(m.highestSeen)}
              </span>
              <TrendingUp className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            {spread
              ? `${inr(spread)} between the cheapest and dearest anyone has quoted`
              : "only one price on record"}
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2.5 text-[12px] text-[var(--text-muted)]">
          Nobody has quoted this part yet.
        </p>
      )}

      {m.suppliersWhoQuoted.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {m.suppliersWhoQuoted.map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
        </div>
      ) : null}

      <ul className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3">
        {m.requests.map((r) => (
          <li key={r.id}>
            <Link
              href={`/desk/requests/${r.id}`}
              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-[var(--surface-sunken)]"
            >
              <span className="truncate">
                <span className="font-[var(--font-mono)] text-[var(--brand)]">{r.rfqNo}</span>
                <span className="ml-2 text-[var(--text-secondary)]">
                  {tidyQty(r.qty)} {r.uom} · {shortDate(r.needDate)}
                </span>
              </span>
              <span className="shrink-0 text-[var(--text-muted)]">
                {r.award
                  ? `won at ${inr(r.award.landedCost)}`
                  : r.quotes.length > 0
                    ? `${r.quotes.length} answers`
                    : relativeDays(r.daysToNeed)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
