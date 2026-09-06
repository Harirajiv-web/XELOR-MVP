"use client";

import type { ScreenProps } from "@spine/registry/manifest";
import { Card, Chain, Illustrative, PrototypeBanner, Screen } from "../parts";

/**
 * Source, shown as the comparison table rather than as a search box. The search box is the
 * part everyone can already picture; the defensible part is what a buyer is looking at in
 * the moment they choose, which is why the cheapest quote on this screen is the one that
 * fails the technical gate.
 */

const QUOTES = [
  {
    supplier: "Mangal Fasteners",
    landed: "1.84",
    delivery: "12 Sep · capacity confirmed",
    quality: "98.2% accepted (41 receipts)",
    onTime: "94% OTIF",
    gate: "Pass" as const,
    score: "86",
  },
  {
    supplier: "Deccan Precision",
    landed: "1.71",
    delivery: "26 Sep · after need date",
    quality: "No history",
    onTime: "Unrated",
    gate: "Fail" as const,
    score: "—",
  },
  {
    supplier: "Sri Balaji Metals",
    landed: "1.92",
    delivery: "10 Sep · confirmed",
    quality: "96.0% accepted (18 receipts)",
    onTime: "89% OTIF",
    gate: "Conditional" as const,
    score: "78",
  },
];

const GATE_TONE = {
  Pass: "bg-[var(--good-bg)] text-[var(--good-fg)]",
  Conditional: "bg-[var(--warn-soft)] text-[var(--warn-ink)]",
  Fail: "bg-[var(--bad-soft)] text-[var(--bad-ink)]",
} as const;

export default function BlueprintSource(_props: ScreenProps) {
  return (
    <Screen
      title="Source — find supply"
      lead="A shortage becomes a structured request, goes to invited suppliers, and comes back as quotes that can be compared on more than price. Start invite-only in one industrial cluster; public discovery only after catalogue quality and access control are proven."
    >
      <PrototypeBanner>
        No supplier network exists in this system. Every supplier, quote and
        score on this screen is invented to show the shape of the decision. Real
        RFQs during discovery are expected to be run by hand, on paper and
        email, before any of this is engineered.
      </PrototypeBanner>

      <Card title="From shortage to purchase order" note={<Illustrative />}>
        <Chain
          steps={[
            { label: "MRP shortage", state: "today" },
            { label: "Structured RFQ", state: "proposed" },
            { label: "Invite shortlist", state: "proposed" },
            { label: "Quote revisions", state: "proposed" },
            { label: "Award + draft PO", state: "proposed" },
          ]}
        />
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          The request carries what a factory actually needs to quote against:
          part code, material grade, tolerances, the controlled drawing
          revision, need date, delivery plant and the inspection plan. A
          supplier sees only the package shared with them.
        </p>
      </Card>

      <Card
        title="RFQ-0098 · BRG-6205 · 240 EA · needed 14 Sep"
        note={<Illustrative />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 pr-3 font-medium">Supplier</th>
                <th className="py-2 pr-3 font-medium">Landed cost (₹L)</th>
                <th className="py-2 pr-3 font-medium">Delivery feasibility</th>
                <th className="py-2 pr-3 font-medium">Quality history</th>
                <th className="py-2 pr-3 font-medium">Delivery history</th>
                <th className="py-2 pr-3 font-medium">Technical gate</th>
                <th className="py-2 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {QUOTES.map((q) => (
                <tr
                  key={q.supplier}
                  className="border-b border-[var(--border-subtle)]"
                >
                  <td className="py-2.5 pr-3 font-medium text-[var(--text-primary)]">
                    {q.supplier}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-secondary)]">
                    {q.landed}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-secondary)]">
                    {q.delivery}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-secondary)]">
                    {q.quality}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-secondary)]">
                    {q.onTime}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${GATE_TONE[q.gate]}`}
                    >
                      {q.gate}
                    </span>
                  </td>
                  <td className="py-2.5 font-semibold text-[var(--text-primary)]">
                    {q.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          The cheapest quote here is excluded, and that is the point. Deccan
          Precision quotes ₹1.71L but cannot deliver until twelve days after the
          need date, so it fails the technical gate before any score is
          calculated. A marketplace that ranks on price alone would have put it
          first.
        </p>
      </Card>

      <Card title="Three rules that keep the award defensible">
        <ul className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
          <li>
            <span className="font-medium text-[var(--text-primary)]">
              Technical gate first.
            </span>{" "}
            Pass, Conditional or Fail against the released specification. Failed
            quotes are excluded before weighting, and missing history is
            Unrated, never zero.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">
              A human awards.
            </span>{" "}
            The approval is separate from whoever verified the supplier, and
            creates the draft purchase order exactly once through a unique
            award-to-PO key.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">
              Paying changes nothing.
            </span>{" "}
            Sponsored visibility must never affect conformity, score or award
            recommendation — the difference between this and a lead-generation
            marketplace.
          </li>
        </ul>
      </Card>
    </Screen>
  );
}
