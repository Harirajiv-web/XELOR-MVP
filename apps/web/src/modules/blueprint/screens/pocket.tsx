"use client";

import { useEffect, useState } from "react";
import type { ScreenProps } from "@spine/registry/manifest";
import { Loading } from "@spine/states";
import { readLiveWorld, type LiveWorld } from "../api";
import {
  Card,
  Illustrative,
  Live,
  Phone,
  PrototypeBanner,
  Screen,
  Tile,
  Unavailable,
} from "../parts";

/**
 * Pocket. The owner phone takes its two headline counts from the SAME endpoints the desktop
 * reads, so the one claim that matters — the phone shows the same truth, not a copy of it —
 * is demonstrated rather than asserted. The floor phones are illustrative because the
 * capture they describe does not exist.
 */
export default function BlueprintPocket(_props: ScreenProps) {
  const [world, setWorld] = useState<LiveWorld | null>(null);

  useEffect(() => {
    let alive = true;
    void readLiveWorld().then((w) => alive && setWorld(w));
    return () => {
      alive = false;
    };
  }, []);

  if (!world) return <Loading />;

  const held = world.inspections.filter(
    (i) => (i.result ?? "").toLowerCase() === "rejected",
  ).length;

  return (
    <Screen
      title="Pocket — the factory in your phone"
      lead="An installable app, not a shrunken desktop. It answers what is happening now, what is at risk, what work is mine and what decision is waiting — and it never claims a number is current when it is not."
    >
      <PrototypeBanner>
        No installable app exists: this build has no web manifest, no service
        worker and no offline queue. The frames below are concepts. The first
        two figures are connected to this system and only carry a live label
        when their sources respond; everything else is invented.
      </PrototypeBanner>

      <Card
        title="Three roles, one truth, different access"
        note={
          <>
            {(world.available.salesOrders || world.available.inspections) && (
              <Live readAt={world.readAt} />
            )}
            {(!world.available.salesOrders || !world.available.inspections) && (
              <Unavailable label="Some live sources unavailable" />
            )}
            <Illustrative />
          </>
        }
      >
        <div className="flex flex-wrap gap-5">
          <Phone
            chrome="Plant 01 · Online · Sync now"
            title="OWNER PULSE"
            subtitle={
              world.available.salesOrders && world.available.inspections
                ? `Read from this system · ${new Date(world.readAt).toLocaleTimeString()}`
                : "One or more live sources unavailable"
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <Tile
                value={
                  world.available.salesOrders
                    ? String(world.salesOrders.length)
                    : "Unavailable"
                }
                label="orders loaded (up to 100)"
                tone={world.available.salesOrders ? "plain" : "bad"}
              />
              <Tile
                value={
                  world.available.inspections ? String(held) : "Unavailable"
                }
                label="rejected inspections loaded"
                tone={
                  !world.available.inspections || held > 0 ? "bad" : "plain"
                }
              />
              <Tile
                value="₹18L"
                label="overdue AR (illustrative)"
                tone="warn"
              />
              <Tile value="6" label="approvals (illustrative)" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              The first two tiles are this system&apos;s records when their
              source is available. The second two need the Flow work before they
              could be true.
            </p>
          </Phone>

          <Phone
            chrome="Plant 01 · Online · Shift A · 1 draft"
            title="PLANT TODAY"
            subtitle="Shift A · illustrative"
          >
            <div className="grid grid-cols-2 gap-2">
              <Tile value="420" label="planned units" />
              <Tile value="286" label="good units" />
              <Tile value="12" label="rejected" tone="warn" />
              <Tile value="3" label="blocked jobs" tone="bad" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              WO-104 waiting for material · inspection gate pending
            </p>
          </Phone>

          <Phone
            chrome="Plant 01 · Offline · Sync 18m · 2 drafts"
            title="RECEIVE MATERIAL"
            subtitle="Scan-assisted GRN draft · illustrative"
          >
            <div className="flex flex-col gap-2 text-xs">
              <p className="text-[var(--text-secondary)]">
                PO-24051 · Mangal Fasteners
              </p>
              <p className="text-[var(--text-secondary)]">
                BRG-6205 · 24 EA · batch B240830
              </p>
            </div>
            <p className="rounded-md bg-[var(--warn-soft)] px-2 py-1.5 text-[11px] text-[var(--warn-ink)]">
              Saved as draft — not posted. Quantity and PO balance are
              revalidated by the server when the phone reconnects.
            </p>
          </Phone>
        </div>
      </Card>

      <Card title="The two rules that make a factory phone trustworthy">
        <ul className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
          <li>
            <span className="font-medium text-[var(--text-primary)]">
              No false live status.
            </span>{" "}
            A number without a fresh accepted source reads Stale or Unknown,
            never green. A phone that shows a machine as running because the
            last value said so is worse than a phone that shows nothing.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">
              Offline saves drafts, never postings.
            </span>{" "}
            Stock movements, approvals, quality releases and payments wait for
            the server. Each queued item carries an idempotency key so a retry
            cannot post twice.
          </li>
        </ul>
      </Card>

      <Card title="What the phone must never become">
        <p className="text-sm text-[var(--text-secondary)]">
          Not a machine controller. Pocket may show accepted equipment evidence
          and record maintenance work, but it must not command a PLC, robot,
          interlock or safety function. That boundary is the same one the
          factory-connect runtime already enforces in code, and it is worth more
          than any feature that would breach it.
        </p>
      </Card>
    </Screen>
  );
}
