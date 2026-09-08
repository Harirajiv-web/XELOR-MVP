"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@spine/api/client";
import { LayoutGrid, ListFilter, Rows3, Search } from "lucide-react";
import {
  Chip,
  Kpi,
  MaterialBlock,
  ResponseBar,
  STAGE_LABEL,
  STAGE_TONE,
  inr,
  relativeDays,
  shortDate,
} from "./parts";
import type { DeskOverview, DeskRequest } from "./types";

/**
 * THE SOURCING DESK.
 *
 * The layout follows what e-sourcing suites converged on, for the reason they converged on
 * it rather than because they did:
 *
 *   A KPI STRIP, because a buyer opens this to find out whether anything needs them today,
 *   and five numbers answer that faster than any list.
 *
 *   PIPELINE LANES, because a request is only ever in one of four states and the useful
 *   question is "how many are stuck in waiting" — which a status column buries and a lane
 *   makes obvious at a glance.
 *
 *   CARDS, NOT ROWS, for the requests themselves. A row can hold a part number and a date; it
 *   cannot hold the material, the response progress, the best price so far and how long is
 *   left, which is the whole of what a buyer needs before deciding whether to open it.
 *
 * A table view is still offered, because scanning forty requests by need date is a real job
 * and cards are the wrong shape for it. The cards are the default because deciding is more
 * common than scanning.
 */
const LANES = ["draft", "out_to_market", "evaluating", "awarded"] as const;

export default function DeskPage(): React.JSX.Element {
  const [data, setData] = useState<DeskOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"lanes" | "table">("lanes");
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
    const rows = data?.requests ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.rfqNo.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.itemCode ?? "").toLowerCase().includes(q) ||
        r.quotes.some((x) => x.supplierName.toLowerCase().includes(q)),
    );
  }, [data, filter]);

  if (error) {
    return (
      <p className="rounded-xl border border-[var(--bad)] bg-[var(--bad-soft)] p-5 text-[13px] text-[var(--bad-ink)]">
        {error}
      </p>
    );
  }
  if (!data) {
    return <p className="p-5 text-[13px] text-[var(--text-muted)]">Loading the desk…</p>;
  }

  const k = data.kpis;

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Open requests"
          value={String(k.openRequests)}
          sub={k.urgent > 0 ? `${k.urgent} needed within a week` : "none urgent"}
          tone={k.urgent > 0 ? "warn" : "neutral"}
        />
        <Kpi
          label="Waiting on suppliers"
          value={String(k.awaitingResponse)}
          sub="no answer yet"
          tone={k.awaitingResponse > 0 ? "warn" : "neutral"}
        />
        <Kpi label="Quotes in" value={String(k.quotesIn)} sub="across all requests" tone="brand" />
        <Kpi
          label="Response rate"
          // Null, never 0% — nobody invited is not the same as nobody answering.
          value={k.responseRate === null ? "—" : `${k.responseRate}%`}
          sub={k.responseRate === null ? "nothing sent to the network yet" : "of invitations answered"}
          tone={k.responseRate !== null && k.responseRate >= 60 ? "good" : "warn"}
        />
        <Kpi
          label="Spread identified"
          value={inr(k.savingsIdentified)}
          sub="highest answer vs best usable"
          tone="good"
        />
        <Kpi label="Awarded" value={String(k.awarded)} sub={`${k.suppliers} suppliers on file`} tone="good" />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by request, part or supplier…"
            aria-label="Filter requests"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="flex overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-input)]">
          {(
            [
              ["lanes", "Cards", LayoutGrid],
              ["table", "List", Rows3],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium ${
                view === key ? "bg-[var(--brand)] text-[var(--text-on-brand)]" : "text-[var(--text-secondary)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[13px] text-[var(--text-secondary)]">
          {filter ? `Nothing matched “${filter}”.` : "No requests for quotation yet."}
        </p>
      ) : view === "lanes" ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {LANES.map((lane) => {
            const inLane = shown.filter((r) => r.stage === lane);
            return (
              <section key={lane} className="flex min-w-0 flex-col gap-3">
                <header className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                    {STAGE_LABEL[lane]}
                  </span>
                  <Chip tone={STAGE_TONE[lane]}>{inLane.length}</Chip>
                </header>
                {inLane.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
                    nothing here
                  </p>
                ) : (
                  inLane.map((r) => <RequestCard key={r.id} r={r} />)
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <RequestTable rows={shown} />
      )}
    </div>
  );
}

/**
 * THE REQUEST CARD — everything needed to decide whether to open it, and nothing else.
 *
 * The material first, because that is what the request IS. Then how many suppliers have come
 * back, as a bar, because a thin response is the most common reason a request needs a person.
 * Then the best usable price so far, which is the only number that answers "is this going
 * well". Time left sits in the header where it can carry colour.
 */
function RequestCard({ r }: { r: DeskRequest }): React.JSX.Element {
  const urgent = r.daysToNeed <= 7 && r.stage !== "awarded";
  const overdue = r.daysToNeed < 0 && r.stage !== "awarded";

  return (
    <Link
      href={`/desk/requests/${r.id}`}
      className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-[var(--font-mono)] text-[12px] font-semibold text-[var(--text-secondary)]">
          {r.rfqNo}
        </span>
        <Chip tone={overdue ? "bad" : urgent ? "warn" : "neutral"}>
          {overdue ? `${Math.abs(r.daysToNeed)} days late` : relativeDays(r.daysToNeed)}
        </Chip>
      </div>

      <MaterialBlock
        itemCode={r.itemCode}
        itemName={r.itemName}
        quantity={r.qty}
        uom={r.uom}
        drawingRev={r.drawingRev}
        needDate={r.needDate}
        daysToNeed={r.daysToNeed}
      />

      {r.stage !== "draft" ? <ResponseBar invited={r.invited} responded={r.responded} /> : null}

      <div className="border-t border-[var(--border-subtle)] pt-3">
        {r.award ? (
          <div>
            <p className="text-[11px] text-[var(--text-muted)]">Awarded to</p>
            <p className="truncate text-[13px] font-semibold text-[var(--good-fg)]">
              {r.award.supplierName} · {inr(r.award.landedCost)}
            </p>
            {r.award.convertedPoNo ? (
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                {r.award.convertedPoNo}
              </p>
            ) : null}
          </div>
        ) : r.bestUsable ? (
          <div>
            <p className="text-[11px] text-[var(--text-muted)]">Best usable answer</p>
            <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
              {inr(r.bestUsable.landedCost)}
              <span className="ml-1.5 font-normal text-[var(--text-secondary)]">
                {r.bestUsable.supplierName}
              </span>
            </p>
            {/* Only worth saying when the cheapest is NOT the one you can use — which is
                exactly the case a price-sorted list hides. */}
            {r.cheapestAny && r.cheapestAny.landedCost !== r.bestUsable.landedCost ? (
              <p className="mt-0.5 text-[11px] text-[var(--warn-ink)]">
                cheapest was {inr(r.cheapestAny.landedCost)} but cannot be used
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">
            {r.stage === "draft" ? "Not sent to any supplier yet" : "No answers yet"}
          </p>
        )}
      </div>
    </Link>
  );
}

/** The scanning view. Forty requests by need date is a job cards are the wrong shape for. */
function RequestTable({ rows }: { rows: DeskRequest[] }): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full min-w-[56rem] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[12px] text-[var(--text-muted)]">
            <th className="px-4 py-2.5 font-medium">Request</th>
            <th className="px-3 py-2.5 font-medium">Material</th>
            <th className="px-3 py-2.5 font-medium">Quantity</th>
            <th className="px-3 py-2.5 font-medium">Needed</th>
            <th className="px-3 py-2.5 font-medium">Answers</th>
            <th className="px-3 py-2.5 font-medium">Best usable</th>
            <th className="px-4 py-2.5 font-medium">Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--border-subtle)]">
              <td className="px-4 py-2.5">
                <Link href={`/desk/requests/${r.id}`} className="font-medium text-[var(--brand)]">
                  {r.rfqNo}
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">
                  {r.itemCode ?? "—"}
                </span>
                <span className="block truncate text-[11px] text-[var(--text-secondary)]">
                  {r.itemName ?? r.title}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                {Number(r.qty)} {r.uom}
              </td>
              <td className="px-3 py-2.5">
                <span className="text-[var(--text-primary)]">{shortDate(r.needDate)}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">
                  {relativeDays(r.daysToNeed)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                {r.responded} / {r.invited}
              </td>
              <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">
                {r.bestUsable ? inr(r.bestUsable.landedCost) : "—"}
              </td>
              <td className="px-4 py-2.5">
                <Chip tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
