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
  Tile,
  Unavailable,
} from "../parts";

/**
 * The loop, with the honest split down the middle: the stages this system already runs are
 * counted from the records the viewer is signed in to; the stages it does not run are named
 * as missing rather than drawn as if they worked.
 */
export default function BlueprintLoop(_props: ScreenProps) {
  const [world, setWorld] = useState<LiveWorld | null>(null);

  useEffect(() => {
    let alive = true;
    void readLiveWorld().then((w) => alive && setWorld(w));
    return () => {
      alive = false;
    };
  }, []);

  if (!world) return <Loading />;

  const availableCount = Object.values(world.available).filter(Boolean).length;
  const unavailableCount = 3 - availableCount;

  return (
    <Screen
      title="The closed loop"
      lead="One customer promise, followed through material, supply, work, quality and cash without a spreadsheet in the middle. Green stages run in this system today and available figures beside them are read from it. Blue stages are proposed. Grey stages are still done on paper, email or WhatsApp."
    >
      <PrototypeBanner>
        Only the green stages exist. The Source and Flow surfaces described here
        are a written blueprint — no supplier network, customer quotation or
        payables matching has been built. Nothing on this screen should be shown
        as a working feature.
      </PrototypeBanner>

      <Card
        title="Demand and planning"
        note={
          <>
            {availableCount > 0 && <Live readAt={world.readAt} />}
            {unavailableCount > 0 && (
              <Unavailable
                label={`${unavailableCount} source${unavailableCount === 1 ? "" : "s"} unavailable`}
              />
            )}
          </>
        }
      >
        <Chain
          steps={[
            { label: "Customer enquiry", state: "paper" },
            { label: "Sales quotation", state: "proposed" },
            { label: "Sales order", state: "today" },
            { label: "MRP need", state: "today" },
            { label: "Purchase requisition", state: "today" },
          ]}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            value={
              world.available.salesOrders
                ? String(world.salesOrders.length)
                : "Unavailable"
            }
            label="sales orders loaded (up to 100)"
            tone={world.available.salesOrders ? "plain" : "bad"}
          />
          <Tile value="0" label="quotations — not built" tone="warn" />
          <Tile
            value={
              world.available.purchaseOrders
                ? String(world.purchaseOrders.length)
                : "Unavailable"
            }
            label="purchase orders loaded (up to 100)"
            tone={world.available.purchaseOrders ? "plain" : "bad"}
          />
          <Tile
            value={
              world.available.inspections
                ? String(world.inspections.length)
                : "Unavailable"
            }
            label="inspections loaded (up to 100)"
            tone={world.available.inspections ? "plain" : "bad"}
          />
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          The quotation count is zero because the capability is absent, not
          because nobody has quoted. An enquiry today becomes an order by
          retyping.
        </p>
      </Card>

      <Card title="Source to receive" note={<Illustrative />}>
        <Chain
          steps={[
            { label: "Supplier RFQ", state: "proposed" },
            { label: "Quote comparison", state: "proposed" },
            { label: "Approved PO", state: "today" },
            { label: "GRN + inspection", state: "today" },
            { label: "Supplier invoice", state: "proposed" },
          ]}
        />
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          The middle of this row is where the proposal earns its keep: a
          purchase order exists today, but how the supplier was chosen lives
          outside the system. The blueprint moves that decision inside, so the
          award carries the evidence that justified it.
        </p>
      </Card>

      <Card
        title="Make to cash and evidence"
        note={
          world.available.inspections ? (
            <Live readAt={world.readAt} />
          ) : (
            <Unavailable label="Inspection source unavailable" />
          )
        }
      >
        <Chain
          steps={[
            { label: "Production", state: "today" },
            { label: "Final quality", state: "today" },
            { label: "Dispatch", state: "today" },
            { label: "GST invoice", state: "today" },
            { label: "Cash + supplier score", state: "proposed" },
          ]}
        />
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          This row is largely built, and it is the reason the rest is
          defensible: a supplier score derived from real receipts and
          inspections is evidence, where a star rating on a marketplace is an
          opinion.
        </p>
      </Card>

      <Card title="What this is asking for">
        <ul className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
          <li>
            <span className="font-medium text-[var(--text-primary)]">
              Two genuine gaps
            </span>{" "}
            — a customer quotation that converts to an order without retyping,
            and a supplier invoice matched against the order and the receipt
            before anyone is paid.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">
              One new market
            </span>{" "}
            — a curated supplier network where a shortage becomes a structured
            RFQ, starting with invited suppliers in one industrial cluster.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">
              One new channel
            </span>{" "}
            — an installable phone app that shows each role only its own work.
          </li>
        </ul>
      </Card>
    </Screen>
  );
}
