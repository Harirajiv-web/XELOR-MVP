"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, ShieldCheck } from "lucide-react";
import { Can } from "@spine/access/permissions";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { ErrorState, Loading } from "@spine/states";
import { date, inr, num, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  byLandedCost,
  describeFailure,
  isAwardable,
  liveQuotes,
  sourcingApi,
  type FailureNotice,
  type RfqView,
  type SupplierQuoteView,
  type TechnicalGate,
} from "../api";
import { GateDialog } from "../components/gate-dialog";
import { AwardDialog } from "../components/award-dialog";
import { RecordQuoteDialog } from "../components/record-quote-dialog";

const GATE_LABEL: Record<TechnicalGate, string> = {
  pending: "Not judged",
  pass: "Pass",
  conditional: "Conditional",
  fail: "Fail",
};

const GATE_CLASS: Record<TechnicalGate, string> = {
  pending: "chip",
  pass: "chip chip-ok",
  conditional: "chip chip-warn",
  fail: "chip chip-bad",
};

/**
 * ONE REQUEST, AND THE DECISION MADE ON IT.
 *
 * This screen is the argument for the whole module, so it is laid out to make one thing
 * unmissable: THE CHEAPEST QUOTE IS OFTEN NOT THE ONE YOU CAN BUY.
 *
 * Rows are ordered by landed cost ascending, which on a real request usually puts a supplier
 * at the top who cannot meet the date. That row is struck through and offers no Award
 * button — not because a button is hidden to be tidy, but because the server refuses it and a
 * control that exists only to be refused teaches people the software is unreliable.
 *
 * Landed cost is shown as the comparable number and its parts are shown beside it, because a
 * buyer who cannot see WHY one quote lands dearer than another has been given a ranking
 * rather than a decision.
 *
 * The technical gate is a person's judgement against the released drawing, recorded BEFORE
 * anything is ranked. Nothing on this screen computes a score, and no model is asked which
 * supplier to use: this is the manual ERP, and the buyer decides.
 */
export default function RfqDetailScreen(props: ScreenProps): React.JSX.Element {
  const rfqId = props.params[0];
  const { data, loading, error, reload } = useQuery<RfqView>(
    rfqId ? sourcingApi.rfqPath(rfqId) : null,
  );

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [gating, setGating] = useState<SupplierQuoteView | null>(null);
  const [awarding, setAwarding] = useState<SupplierQuoteView | null>(null);
  const [recording, setRecording] = useState(false);

  const quotes = useMemo(() => (data ? byLandedCost(liveQuotes(data.quotes)) : []), [data]);
  const cheapest = quotes[0];
  const awardedQuoteId = data?.award?.quoteId ?? null;

  const issue = useCallback(async () => {
    if (!rfqId) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.post<RfqView>(sourcingApi.issuePath(rfqId), {}, { idempotencyKey: crypto.randomUUID() });
      reload();
    } catch (err) {
      setFailure(describeFailure(err));
    } finally {
      setBusy(false);
    }
  }, [rfqId, reload]);

  if (!rfqId) return <ErrorState error="No request was named in the address." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  const awarded = data.award;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${data.rfqNo} — ${data.title}`}
        subtitle={
          data.itemCode
            ? `${data.itemCode} · ${data.itemName ?? ""} · ${num(data.qty)} ${data.uom}`
            : `${num(data.qty)} ${data.uom}`
        }
        meta={[
          { label: "Needed by", value: `${date(data.needDate)} (${relativeDays(data.needDate)})` },
          { label: "Quotes closed", value: date(data.quoteDeadline) },
          { label: "Drawing revision", value: data.drawingRev ?? "not stated" },
          { label: "Deliver to", value: data.deliveryPlant },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            {data.status === "draft" ? (
              <Can permission="purchase.rfq.issue">
                <button type="button" className="btn btn-pri" onClick={issue} disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  Issue to suppliers
                </button>
              </Can>
            ) : null}
            {data.status === "issued" || data.status === "evaluation" ? (
              <Can permission="purchase.rfq.quote">
                <button type="button" className="btn" onClick={() => setRecording(true)}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Record a quote
                </button>
              </Can>
            ) : null}
          </div>
        }
      />

      {failure ? (
        <div className="rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] p-3">
          <p className="text-[13px] font-semibold text-[var(--bad-ink)]">{failure.title}</p>
          <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{failure.body}</p>
        </div>
      ) : null}

      {awarded ? (
        <section className="rounded-[var(--radius-control)] border border-[var(--good-fg)] bg-[var(--good-bg)] p-4">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--good-fg)]" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--good-fg)]">
                Awarded to {awarded.vendorName ?? "the supplier"} at {inr(awarded.landedCost)} landed
                {awarded.convertedPoNo ? ` — ${awarded.convertedPoNo}` : ""}
              </p>
              {/* The reason is displayed as prominently as the price. An award nobody has to
                  justify is an award nobody can review. */}
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">“{awarded.awardReason}”</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
            What the suppliers answered
          </h2>
          <p className="text-[12px] text-[var(--text-muted)]">
            {data.invitations.length} invited · {quotes.length} answered · cheapest landed first
          </p>
        </header>

        {quotes.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[var(--text-secondary)]">
            No supplier has answered yet. Nothing can be compared or awarded until at least one
            quote is recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] border-collapse text-[13px]">
              <caption className="sr-only">
                Supplier quotes ordered by landed cost, with the technical gate and award action
              </caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[12px] text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-medium">Supplier</th>
                  <th className="px-3 py-2 text-right font-medium">Landed</th>
                  <th className="px-3 py-2 text-right font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Tooling</th>
                  <th className="px-3 py-2 text-right font-medium">Freight</th>
                  <th className="px-3 py-2 font-medium">Promised</th>
                  <th className="px-3 py-2 font-medium">Specification</th>
                  <th className="px-4 py-2 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const failed = q.technicalGate === "fail";
                  const isAwarded = q.id === awardedQuoteId;
                  const late = q.meetsNeedDate === false;
                  return (
                    <tr
                      key={q.id}
                      className={`border-b border-[var(--border-subtle)] ${
                        isAwarded ? "bg-[var(--good-bg)]" : failed ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div
                          className={`font-medium text-[var(--text-primary)] ${failed ? "line-through" : ""}`}
                        >
                          {q.vendorName ?? "—"}
                        </div>
                        {q.revisionNo > 1 ? (
                          <div className="text-[11px] text-[var(--text-muted)]">
                            revision {q.revisionNo} — earlier prices retained
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-[var(--text-primary)]">
                        {inr(q.landedCost)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--text-secondary)]">
                        {inr(q.unitPrice)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--text-secondary)]">
                        {inr(q.toolingCost)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--text-secondary)]">
                        {inr(q.freightCost)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[var(--text-primary)]">
                          {q.promisedDate ? date(q.promisedDate) : "not stated"}
                        </div>
                        {/* The single most useful fact on the row, and the one a price-sorted
                            list hides: this supplier cannot deliver in time. */}
                        {late ? (
                          <span className="chip chip-bad mt-0.5">after the need date</span>
                        ) : q.leadTimeDays !== null ? (
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            {q.leadTimeDays} day lead time
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <span className={GATE_CLASS[q.technicalGate]}>
                          {GATE_LABEL[q.technicalGate]}
                        </span>
                        {q.gateNote ? (
                          <p className="mt-1 max-w-[16rem] text-[11px] text-[var(--text-secondary)]">
                            {q.gateNote}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {isAwarded ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--good-fg)]">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            Awarded
                          </span>
                        ) : awarded ? (
                          <span className="text-[12px] text-[var(--text-muted)]">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Can permission="purchase.rfq.quote">
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setGating(q)}
                              >
                                Judge
                              </button>
                            </Can>
                            {isAwardable(q) ? (
                              <Can permission="purchase.rfq.award">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-pri"
                                  onClick={() => setAwarding(q)}
                                >
                                  Award
                                </button>
                              </Can>
                            ) : failed ? (
                              <span className="text-[11px] text-[var(--bad-ink)]">
                                cannot be awarded
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)]">
                                judge it first
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Stated in words, not left to be inferred from a struck-through row. */}
        {!awarded && cheapest && cheapest.technicalGate === "fail" ? (
          <div className="flex items-start gap-2 border-t border-[var(--border)] px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn-ink)]" aria-hidden />
            <p className="text-[13px] text-[var(--text-secondary)]">
              The cheapest answer, {cheapest.vendorName ?? "the top row"} at{" "}
              {inr(cheapest.landedCost)} landed, failed the specification and cannot be awarded
              whatever it costs. A comparison ranked on price alone would have put it first.
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Who was asked</h2>
        <ul className="flex flex-wrap gap-2">
          {data.invitations.map((inv) => (
            <li
              key={inv.vendorId}
              className="rounded-[var(--radius-control)] border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)]"
            >
              {inv.vendorName ?? inv.vendorId}
              <span className="ml-1.5 text-[var(--text-muted)]">· {inv.responseStatus}</span>
            </li>
          ))}
        </ul>
        {data.notes ? (
          <p className="mt-3 text-[13px] text-[var(--text-secondary)]">{data.notes}</p>
        ) : null}
      </section>

      {gating ? (
        <GateDialog
          rfqId={rfqId}
          quote={gating}
          onClose={() => setGating(null)}
          onDone={() => {
            setGating(null);
            reload();
          }}
        />
      ) : null}
      {awarding ? (
        <AwardDialog
          rfqId={rfqId}
          quote={awarding}
          onClose={() => setAwarding(null)}
          onDone={() => {
            setAwarding(null);
            reload();
          }}
        />
      ) : null}
      {recording ? (
        <RecordQuoteDialog
          rfqId={rfqId}
          rfq={data}
          onClose={() => setRecording(false)}
          onDone={() => {
            setRecording(false);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
