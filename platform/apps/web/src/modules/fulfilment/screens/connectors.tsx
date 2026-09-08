"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import type { ScreenProps } from "@spine/registry/manifest";
import { api } from "@spine/api/client";
import { LayerChip } from "@spine/ui/pipeline";
import { cn } from "@spine/ui/cn";
import {
  CATEGORY_LABEL,
  CONNECTORS,
  normaliseConnectors,
  type Connector,
} from "../connectors";

/**
 * THE CONNECTOR SHELF — what Phase 2 sits on, and what it does not.
 *
 * Phase 2 is not the ERP. It is the layer above one: it reads a system of record, works
 * something out with rules, asks a person where authority is required, writes back through
 * that system's own doors, and re-reads to prove the write landed. Nothing in that sentence
 * says WHOSE system of record. A plant already running SAP or Tally does not want a second
 * ERP — it wants the intelligence — and this screen is where that argument gets made.
 *
 * It gets made honestly or not at all. ONE tile on this page is connected, and it is ours.
 * The other eight are drawn as plainly unavailable, each with a line saying what it would
 * supply and where the work actually stands. There is no greyed-out "coming soon" styling,
 * no dotted line implying a half-built pipe, and no logo wall — every one of those reads, to
 * somebody being shown a product, as an integration that exists.
 *
 * The instruction this page is built to obey, verbatim: "Do not create misleading
 * integrations that appear real when they are only mocked."
 */
export default function ConnectorShelf(_props: ScreenProps): React.JSX.Element {
  const [rows, setRows] = useState<readonly Connector[]>(CONNECTORS);
  const [fromApi, setFromApi] = useState(false);

  useEffect(() => {
    let live = true;
    void api
      .get<{ data: unknown }>("/fulfilment/sources")
      .then((r) => {
        const parsed = normaliseConnectors(r.data);
        // A served catalogue wins, because it is the one the engine actually consults. An
        // unusable answer changes nothing on screen: the built-in list says the same thing,
        // and a shelf that vanishes because an endpoint moved would be a worse outcome than
        // a shelf one release out of date.
        if (live && parsed) {
          setRows(parsed);
          setFromApi(true);
        }
      })
      .catch(() => {
        // The endpoint may not exist in this build. Nothing to say about that here.
      });
    return () => {
      live = false;
    };
  }, []);

  const connected = rows.filter((c) => c.connected);
  const shelf = rows.filter((c) => !c.connected);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-[19px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>
          What Phase 2 can sit on
        </h1>
        <p className="mt-1 max-w-2xl text-[12px] leading-[1.5]" style={{ color: "var(--text-muted)" }}>
          Phase 2 is the intelligence layer, not the ERP. It reads a system of record, decides
          with rules you can inspect, asks you where authority is needed, and writes back
          through that system&rsquo;s own doors. Today it is wired to one system of record —
          ours. The rest of this page is what it would take to sit on somebody else&rsquo;s.
        </p>
      </header>

      {/* -------- the one that is real -------- */}
      {connected.map((c) => (
        <section
          key={c.key}
          className="card p-4"
          style={{ borderColor: "var(--ok)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip chip-ok">
              <Icons.PlugZap className="h-3 w-3" aria-hidden />
              CONNECTED
            </span>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {c.name}
            </h2>
            <span className="chip chip-grey">{CATEGORY_LABEL[c.category]}</span>
            <LayerChip layer="phase1" className="ml-auto" />
          </div>
          <p className="mt-2 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            {c.supplies}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
            {c.note}
          </p>
        </section>
      ))}

      {/* -------- the eight that are not -------- */}
      <section>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Not connected in this build
          </h2>
          <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Nothing on any screen in this product came from any of these. Each one is a piece
            of work, not a setting.
          </p>
        </div>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {shelf.map((c) => (
            <li
              key={c.key}
              className="rounded-xl border p-3"
              style={{
                borderColor: "var(--border-subtle)",
                background: "var(--surface)",
              }}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {c.name}
                </span>
                <span className="chip chip-grey">{CATEGORY_LABEL[c.category]}</span>
                {/* Amber, not grey. `source-badge.tsx` makes the same choice for the same
                    reason: a caveat drawn in a neutral colour stops being read within a day. */}
                <span className="chip chip-warn ml-auto">
                  <Icons.Unplug className="h-3 w-3" aria-hidden />
                  NOT CONNECTED
                </span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                Would supply: {c.supplies}
              </p>
              <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                {c.note}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <footer
        className={cn("rounded-xl border px-3 py-2.5")}
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}
      >
        <p className="text-[11.5px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          <b style={{ color: "var(--text-primary)" }}>Why the layer moves and the ERP does not.</b>{" "}
          A mission never queries a table directly for the sake of it — it asks Phase 1 for
          orders, stock, purchases and work orders through named module adapters, and writes
          back the same way. Pointing those adapters at another system is the whole of the
          porting job, and it is a real job: somebody has to map that system&rsquo;s documents
          onto these questions and prove the answers. That is why the shelf above is a list of
          work rather than a list of switches.
        </p>
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {fromApi
            ? "This catalogue was served by the mission service."
            : "This catalogue is the one built into the web app; the mission service did not serve one."}
        </p>
      </footer>

      <Link href="/fulfilment/control" className="self-center text-xs underline"
        style={{ color: "var(--text-muted)" }}>
        Back to Mission Control
      </Link>
    </div>
  );
}
