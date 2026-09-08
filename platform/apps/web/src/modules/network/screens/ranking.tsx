"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Can } from "@spine/access/permissions";
import { api } from "@spine/api/client";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { ErrorState, Loading } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import { networkApi, type RankedQuote, type Submission } from "../api";

interface RfqRow {
  id: string;
  rfqNo: string;
  title: string;
  needDate: string;
  status: string;
}

const money = (v: string): string =>
  `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * THE ANSWERS, ORDERED BY WHAT THE BUYER ACTUALLY WANTS: soon enough, and cheap.
 *
 * The ordering is arithmetic — how close each answer is to the best delivery and the best
 * price ON THIS PAGE — and it says its reasoning in a sentence beside every row. It does not
 * award, and it cannot: an answer that misses the need date is pushed to the bottom and marked
 * unusable however cheap it is, and the award itself still refuses a quote that failed the
 * specification. The ranking is here to save a buyer twenty minutes of arithmetic, not to make
 * the decision for them.
 *
 * Delivery is weighted slightly above price on purpose. A cheap part that arrives after the
 * build has cost more than the difference, every time.
 */
export default function RankingScreen(_props: ScreenProps): React.JSX.Element {
  const { rows: rfqs, loading: loadingRfqs } = useCursorList<RfqRow>("/purchase/rfqs", { limit: 50 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default to the newest request that is still being decided — the one somebody opened this
  // screen to look at.
  const chosen = useMemo(() => {
    if (selectedId) return selectedId;
    const open = rfqs.find((r) => r.status === "evaluation" || r.status === "issued");
    return open?.id ?? rfqs[0]?.id ?? null;
  }, [rfqs, selectedId]);

  const ranking = useQuery<{ needDate: string; quotes: RankedQuote[] }>(
    chosen ? networkApi.rankingPath(chosen) : null,
  );
  const submissions = useQuery<{ items: Submission[] }>(
    chosen ? networkApi.submissionsPath(chosen) : null,
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const accept = useCallback(
    async (submissionId: string) => {
      setBusy(submissionId);
      setFailure(null);
      try {
        await api.post(networkApi.acceptPath(submissionId), {}, { idempotencyKey: crypto.randomUUID() });
        ranking.reload();
        submissions.reload();
      } catch (e) {
        setFailure(e instanceof Error ? e.message : "That answer could not be brought in.");
      } finally {
        setBusy(null);
      }
    },
    [ranking, submissions],
  );

  if (loadingRfqs) return <Loading />;
  if (rfqs.length === 0) {
    return <ErrorState error="There are no requests for quotation yet." />;
  }

  const rfq = rfqs.find((r) => r.id === chosen);
  const byId = new Map((submissions.data?.items ?? []).map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Ranked answers"
        subtitle="Every answer from the network, ordered by how soon it lands and what it costs — with the reasoning written out."
        meta={
          rfq
            ? [
                { label: "Request", value: rfq.rfqNo },
                { label: "Needed by", value: rfq.needDate },
                { label: "Answers", value: String(ranking.data?.quotes.length ?? 0) },
              ]
            : []
        }
        actions={
          <select
            value={chosen ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="Choose a request"
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
          >
            {rfqs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rfqNo} — {r.title.slice(0, 46)}
              </option>
            ))}
          </select>
        }
      />

      <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3 text-[13px] text-[var(--text-secondary)]">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ai-accent)]" aria-hidden />
        <span>
          Ordered by delivery and landed cost, each scored against the best answer on this page.
          Delivery counts for slightly more than price. This ranking explains itself and does
          not decide — the award is still a person&apos;s, and an answer that cannot meet the
          need date is marked unusable however cheap it is.
        </span>
      </p>

      {failure ? (
        <p className="rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] px-4 py-3 text-[13px] text-[var(--bad-ink)]">
          {failure}
        </p>
      ) : null}

      {ranking.loading ? (
        <Loading />
      ) : (ranking.data?.quotes.length ?? 0) === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-6 text-[13px] text-[var(--text-secondary)]">
          No supplier has answered this request through the network yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {(ranking.data?.quotes ?? []).map((q) => {
            const sub = byId.get(q.submissionId);
            const brought = Boolean(sub?.sourcingQuoteId);
            return (
              <li
                key={q.submissionId}
                className={`rounded-[var(--radius-control)] border bg-[var(--surface)] p-4 ${
                  q.disqualified
                    ? "border-[var(--border)] opacity-70"
                    : q.rank === 1
                      ? "border-[var(--good-fg)]"
                      : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                        q.disqualified
                          ? "bg-[var(--bad-soft)] text-[var(--bad-ink)]"
                          : q.rank === 1
                            ? "bg-[var(--good-bg)] text-[var(--good-fg)]"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {q.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">
                        {q.supplierName}
                      </p>
                      <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{q.explanation}</p>
                      {sub?.supplierNote ? (
                        <p className="mt-1 text-[12px] italic text-[var(--text-muted)]">
                          “{sub.supplierNote}”
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                      {money(q.landedCost)}
                    </span>
                    {q.disqualified ? (
                      <span className="chip chip-bad">{q.disqualified}</span>
                    ) : brought ? (
                      <span className="chip chip-ok">On the request</span>
                    ) : sub && !sub.supplierIsVendor ? (
                      // Said before the button is pressed rather than as a refusal after.
                      <span className="chip chip-warn">Approve as a vendor first</span>
                    ) : (
                      <Can permission="purchase.rfq.quote">
                        <button
                          type="button"
                          className="btn btn-sm btn-pri"
                          onClick={() => accept(q.submissionId)}
                          disabled={busy === q.submissionId}
                        >
                          {busy === q.submissionId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Send className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Bring onto the request
                        </button>
                      </Can>
                    )}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3 text-[12px] sm:grid-cols-4">
                  <Metric label="Delivery" value={q.promisedDate ?? "not stated"} />
                  <Metric label="Lead time" value={q.leadTimeDays ? `${q.leadTimeDays} days` : "—"} />
                  <Metric label="Speed score" value={q.speedScore.toFixed(2)} />
                  <Metric label="Price score" value={q.costScore.toFixed(2)} />
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
