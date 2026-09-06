"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@spine/api/client";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Radio,
  Users,
} from "lucide-react";
import {
  Chip,
  QuoteCard,
  ResponseBar,
  STAGE_LABEL,
  STAGE_TONE,
  inr,
  inrExact,
  qty as tidyQty,
  relativeDays,
  shortDate,
} from "../../parts";
import type { DeskRequest } from "../../types";

/**
 * ONE REQUEST, AND EVERY ANSWER TO IT.
 *
 * The layout answers the three questions in the order a buyer asks them:
 *
 *   WHAT DID WE ASK FOR — the material, in full, including the drawing revision and the note
 *   the suppliers were shown. Everything a disagreement about scope gets settled from.
 *
 *   WHO ANSWERED — quote cards, cheapest first, with the ones that cannot be used dimmed and
 *   struck rather than merely tagged. On a well-run request the top card is often unusable,
 *   and that is the single most valuable thing this screen says.
 *
 *   WHAT DID WE DECIDE — the award, with the reason quoted, kept at the top once it exists.
 *
 * Answers that arrived through the supplier network are shown ALONGSIDE quotes the buyer
 * typed in, because somebody comparing prices does not care which door a price came through.
 * But only a quote on the request can be awarded, so the network ones carry a badge and an
 * explicit action to bring them across. The distinction is kept visible instead of tidied.
 */
export default function DeskRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = use(params);
  const [r, setR] = useState<DeskRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // The spine client, not raw fetch: it attaches the credential and unwraps the error
      // envelope. Raw fetch answers "Bearer token required" and looks like a broken page.
      setR(await api.get<DeskRequest>(`/purchase/network/desk/requests/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "This request could not be loaded.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const bringAcross = useCallback(
    async (submissionId: string) => {
      setBusy(submissionId);
      setNotice(null);
      try {
        await api.post(
          `/purchase/network/submissions/${submissionId}/accept`,
          {},
          { idempotencyKey: crypto.randomUUID() },
        );
        await load();
        setNotice("Brought onto the request. It can now be judged and awarded.");
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "That answer could not be brought across.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  if (error) {
    return (
      <p className="rounded-xl border border-[var(--bad)] bg-[var(--bad-soft)] p-5 text-[13px] text-[var(--bad-ink)]">
        {error}
      </p>
    );
  }
  if (!r) return <p className="p-5 text-[13px] text-[var(--text-muted)]">Loading the request…</p>;

  const usable = r.quotes.filter((q) => q.meetsNeedDate !== false && q.technicalGate !== "fail");

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/desk"
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All requests
      </Link>

      {/* WHAT WE ASKED FOR */}
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-[var(--font-mono)] text-[13px] font-semibold text-[var(--text-secondary)]">
                {r.rfqNo}
              </span>
              <Chip tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Chip>
              {r.daysToNeed < 0 && r.stage !== "awarded" ? (
                <Chip tone="bad">{Math.abs(r.daysToNeed)} days past the need date</Chip>
              ) : null}
            </div>
            <h1 className="mt-1 text-[20px] font-semibold leading-snug text-[var(--text-primary)]">
              {r.itemCode ? `${r.itemCode} — ${r.itemName ?? ""}` : r.title}
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{r.title}</p>
          </div>
          <div className="text-right">
            <p className="text-[28px] font-semibold leading-none text-[var(--text-primary)]">
              {tidyQty(r.qty)}
              <span className="ml-1 text-[14px] font-normal text-[var(--text-secondary)]">{r.uom}</span>
            </p>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">quantity required</p>
          </div>
        </header>

        <dl className="grid gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
          <Fact icon={CalendarClock} label="Needed by" value={shortDate(r.needDate)} note={relativeDays(r.daysToNeed)} />
          <Fact icon={CalendarClock} label="Quotes close" value={shortDate(r.quoteDeadline)} note={relativeDays(r.daysToDeadline)} />
          <Fact icon={FileText} label="Drawing revision" value={r.drawingRev ?? "not specified"} />
          <Fact icon={MapPin} label="Deliver to" value={r.deliveryPlant} note={r.originRef ?? undefined} />
        </dl>

        {r.notes ? (
          <p className="border-t border-[var(--border)] bg-[var(--warn-soft)] px-5 py-3 text-[13px] leading-relaxed text-[var(--warn-ink)]">
            <span className="font-semibold">Told to every supplier: </span>
            {r.notes}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-5 border-t border-[var(--border)] px-5 py-3">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {r.invited} suppliers asked
          </span>
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <Radio className="h-3.5 w-3.5" aria-hidden />
            {r.responded} answered
          </span>
          <div className="min-w-[10rem] max-w-xs flex-1">
            <ResponseBar invited={r.invited} responded={r.responded} />
          </div>
        </div>
      </section>

      {/* WHAT WE DECIDED */}
      {r.award ? (
        <section className="rounded-xl border border-[var(--good-fg)] bg-[var(--good-bg)] p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--good-fg)]" aria-hidden />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[var(--good-fg)]">
                Awarded to {r.award.supplierName} at {inrExact(r.award.landedCost)} landed
                {r.award.convertedPoNo ? ` — ${r.award.convertedPoNo}` : ""}
              </p>
              {/* The reason as prominently as the price. An award nobody justified is an
                  award nobody can review. */}
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">“{r.award.awardReason}”</p>
            </div>
          </div>
        </section>
      ) : null}

      {notice ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3 text-[13px] text-[var(--text-secondary)]">
          {notice}
        </p>
      ) : null}

      {/* WHO ANSWERED */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {r.quotes.length === 0 ? "No answers yet" : `${r.quotes.length} answers, cheapest first`}
          </h2>
          {r.quotes.length > 0 ? (
            <p className="text-[12px] text-[var(--text-secondary)]">
              {usable.length} can actually be used
              {usable.length !== r.quotes.length
                ? ` · ${r.quotes.length - usable.length} cannot`
                : ""}
            </p>
          ) : null}
        </div>

        {r.quotes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[13px] text-[var(--text-muted)]">
            {r.stage === "draft"
              ? "This request has not been sent to anybody yet."
              : "Nobody has answered yet. Nothing can be compared until they do."}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {r.quotes.map((q, i) => (
              <QuoteCard
                key={q.id}
                {...q}
                rank={i + 1}
                actions={
                  !q.onRequest && !r.award ? (
                    <button
                      type="button"
                      onClick={() => bringAcross(q.id)}
                      disabled={busy === q.id}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--brand)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-on-brand)] disabled:opacity-60"
                    >
                      {busy === q.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : null}
                      Bring onto the request
                    </button>
                  ) : null
                }
              />
            ))}
          </div>
        )}

        {/* Said in words, because a dimmed card is a hint and this is a conclusion. */}
        {r.quotes.length > 1 && r.cheapestAny && r.bestUsable &&
        r.cheapestAny.landedCost !== r.bestUsable.landedCost ? (
          <p className="rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3 text-[13px] text-[var(--warn-ink)]">
            The cheapest answer, {r.cheapestAny.supplierName} at {inr(r.cheapestAny.landedCost)},
            cannot be used. The best one that can is {r.bestUsable.supplierName} at{" "}
            {inr(r.bestUsable.landedCost)} — a list ranked on price alone would have shown the
            wrong supplier first.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  note?: string;
}): React.JSX.Element {
  return (
    <div className="bg-[var(--surface)] px-5 py-3">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 text-[14px] font-medium text-[var(--text-primary)]">{value}</dd>
      {note ? <p className="text-[11px] text-[var(--text-secondary)]">{note}</p> : null}
    </div>
  );
}
