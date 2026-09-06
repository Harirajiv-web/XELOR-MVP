"use client";

import { useEffect, useState } from "react";
import type { ScreenProps } from "@spine/registry/manifest";
import { Loading } from "@spine/states";
import { readLiveWorld, type LiveWorld } from "../api";
import {
  Card,
  Chain,
  Illustrative,
  Live,
  PrototypeBanner,
  Screen,
  Unavailable,
} from "../parts";

/**
 * Flow is the least glamorous screen here and the one with the strongest case: both halves
 * are capabilities this product is DOCUMENTED as lacking, not new markets to be discovered.
 * The live order list is shown deliberately — every one of those orders was typed rather
 * than converted from a quotation, which is the gap made visible.
 */
export default function BlueprintFlow(_props: ScreenProps) {
  const [world, setWorld] = useState<LiveWorld | null>(null);

  useEffect(() => {
    let alive = true;
    void readLiveWorld().then((w) => alive && setWorld(w));
    return () => {
      alive = false;
    };
  }, []);

  if (!world) return <Loading />;

  return (
    <Screen
      title="Flow — quote and collect"
      lead="Two commercial gaps, both already documented against this codebase. On the selling side there is no customer quotation. On the buying side there is no supplier invoice, no duplicate check and no three-way match before payment."
    >
      <PrototypeBanner>
        Neither half is built. Checked against this repository: the sales schema
        contains no quotation entity, and no supplier-invoice or three-way-match
        table exists anywhere. The screens below describe what would be added.
      </PrototypeBanner>

      <Card title="Quote to cash" note={<Illustrative />}>
        <Chain
          steps={[
            { label: "Enquiry", state: "paper" },
            { label: "Revisioned quote", state: "proposed" },
            { label: "Accept + order", state: "today" },
            { label: "Dispatch + invoice", state: "today" },
            { label: "Share + collect", state: "proposed" },
          ]}
        />
      </Card>

      <Card
        title="The gap, in the current data"
        note={
          world.available.salesOrders ? (
            <Live readAt={world.readAt} />
          ) : (
            <Unavailable label="Sales source unavailable" />
          )
        }
      >
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          {world.available.salesOrders
            ? "These are real orders in the world you are signed in to. None can have a quotation behind it because the system has no quotation entity; each commercial agreement must enter the order flow without a stored quote-to-order link."
            : "The sales-order source is unavailable. No order count or row below should be treated as live until that source can be read."}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 pr-3 font-medium">Order</th>
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="py-2 pr-3 font-medium">Value (₹)</th>
                <th className="py-2 font-medium">Quotation behind it</th>
              </tr>
            </thead>
            <tbody>
              {world.salesOrders.slice(0, 5).map((o) => (
                <tr
                  key={o.soNo}
                  className="border-b border-[var(--border-subtle)]"
                >
                  <td className="py-2.5 pr-3 font-medium text-[var(--text-primary)]">
                    {o.soNo}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-secondary)]">
                    {o.customerName ?? "Unnamed customer"}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-secondary)]">
                    {o.grandTotal}
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-[var(--warn-soft)] px-2 py-0.5 text-xs font-medium text-[var(--warn-ink)]">
                      none — capability absent
                    </span>
                  </td>
                </tr>
              ))}
              {world.salesOrders.length === 0 && (
                <tr>
                  <td
                    className="py-3 text-sm text-[var(--text-muted)]"
                    colSpan={4}
                  >
                    {world.available.salesOrders
                      ? "No orders were returned in the loaded page."
                      : "The sales-order source could not be read."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Requisition to pay" note={<Illustrative />}>
        <Chain
          steps={[
            { label: "Supplier invoice", state: "proposed" },
            { label: "Duplicate + tax check", state: "proposed" },
            { label: "Three-way match", state: "proposed" },
            { label: "Approve + bank handoff", state: "proposed" },
            { label: "Settle + reconcile", state: "proposed" },
          ]}
        />
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          The whole row is proposed, and it is the part to build slowly. Paying
          suppliers is where the fraud is: duplicate invoices and altered bank
          details. It needs a cooling period on bank changes, a maker and a
          separate checker, and a reconciliation that proves what actually left
          the account.
        </p>
      </Card>

      <Card title="Simple, without becoming a billing app">
        <p className="text-sm text-[var(--text-secondary)]">
          The everyday-simplicity lesson is worth taking — five visible daily
          actions instead of hunting through modules, branded documents that can
          be shared, plain-language views of who owes what. The lesson not to
          take is the price war: these are factory documents that connect to
          planning, stock, quality and the ledger, which is what a retail
          billing tool cannot do and should not be undercut on.
        </p>
      </Card>
    </Screen>
  );
}
