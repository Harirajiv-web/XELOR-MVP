"use client";

import Link from "next/link";
import { useMemo } from "react";
import * as Icons from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { Loading, ErrorState } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { CountUp, Meter, Reveal } from "@spine/ui/motion";
import { BarRows } from "@spine/ui/charts";
import { Disclosure } from "@spine/ui/disclosure";
import { inr, num, dateTime, humanise } from "@spine/format";
import { cn } from "@spine/ui/cn";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  aiopsApi,
  departmentOfModule,
  AI_FEATURE_FACTS,
  FEATURE_CONSUMERS,
  FEATURE_GOLDEN_SET,
  CHOKEPOINTS,
  ONYX_DEPENDS_ON_HEXA,
  OPEN_ITEMS,
  type CostDashboard,
  type Envelope,
  type HitlItem,
  type IncidentRow,
  type KillSwitchState,
  type RegistryFeature,
} from "../api";

/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * THE CONNECTOR CONSOLE — every system the AI layer touches, and what it is doing now.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * THE ONLY PLACE THIS LAYER IS DRAWN. There was a second one — a Connection map screen with
 * its own graph of the same architecture — and it is gone. A product that diagrams itself
 * twice, in two shapes, has told the reader that neither drawing is the authority, and the
 * two will drift apart the first time somebody edits one of them. Everything the map held
 * that was not a duplicate of this — the chokepoints, what ONYX borrows from HEXA, the open
 * items — is on this page, unchanged.
 *
 * It answers two questions that are usually on two screens: "how is this wired" (the
 * architect's question) and "is anything actually happening" (the Head of Operations' one,
 * asked on a Monday morning). They belong together, because the second is unreadable
 * without the first.
 *
 * ───────────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS A CONNECTOR
 * ───────────────────────────────────────────────────────────────────────────────────
 * A place the AI layer draws evidence FROM or drafts actions INTO. Two classes, and the
 * distinction is the whole XELOR intelligence-layer story:
 *
 *   INTERNAL — a module service in this build that calls a registered feature through an
 *   adapter. Derived by INVERTING `FEATURE_CONSUMERS`, which is itself transcribed from the
 *   real call sites in `apps/api/src/ai/`. Not a list somebody typed: add a call site and a
 *   connector appears here; delete the adapter and it leaves.
 *
 *   EXTERNAL — the systems XELOR is meant to read in a plant that already runs an ERP.
 *   None of them has an adapter in this repository, so every one is drawn as NOT CONNECTED
 *   with what it would take. Leaving them off the page would be tidier and would hide the
 *   single biggest gap between what is sold and what is built.
 *
 * ───────────────────────────────────────────────────────────────────────────────────
 * WHY THIS SCREEN HAS NO CPU DIALS, NO LIVE CONFIDENCE GAUGE AND NO ACTIVITY TICKER
 * ───────────────────────────────────────────────────────────────────────────────────
 * The console this was modelled on is a simulation and says so in its own header. Its
 * agents report processor load, memory, queue depth and a confidence percentage that moves
 * while you watch. We record none of those things.
 *
 * Putting them on screen anyway would make this — the governance console, the one surface
 * whose entire job is to prove the AI can be trusted — the only screen in the product that
 * lies. Every panel below is either a figure from an endpoint or a fact transcribed from a
 * named source file. Where the reference design had a number we do not hold, the panel says
 * what is missing and what would have to be instrumented to fill it. On a page about
 * trustworthiness, "we do not measure this yet" is a stronger claim than a moving needle.
 */

/* ══════════════════════ transcribed facts ══════════════════════ */

/** A module that calls the AI layer, with the human name and icon the sidebar uses. */
const MODULE_LOOK: Readonly<Record<string, { name: string; icon: string }>> = {
  general: { name: "Organisation", icon: "Building2" },
  administration: { name: "Administration", icon: "ShieldCheck" },
  engineering: { name: "Engineering", icon: "Ruler" },
  purchase: { name: "Purchase", icon: "ShoppingCart" },
  sales: { name: "Sales", icon: "Handshake" },
  csp: { name: "Customer service", icon: "Headset" },
  hrm: { name: "People", icon: "Users" },
  expenditure: { name: "Expenditure", icon: "Receipt" },
  copilot: { name: "Copilot", icon: "MessageSquare" },
};

/**
 * The systems XELOR is meant to read in a factory that already runs an ERP.
 *
 * Source: the product definition — XELOR is "a read-only intelligence layer on top of a
 * plant's existing systems (SAP, Tally, Odoo, Dynamics, MES/SCADA, documents)". The build
 * status of each is a fact about THIS REPOSITORY, checked by searching for an adapter:
 * there is no `apps/api/src/integrations/` connector for any of them, and DECISIONS-V2 §6
 * still lists the Tally importer spec as an open item owned by HEXA.
 */
const EXTERNAL_CONNECTORS: readonly {
  name: string;
  icon: string;
  reads: string;
  needs: string;
}[] = [
  {
    name: "SAP",
    icon: "Database",
    reads: "Material master, purchase orders, production orders, stock movements.",
    needs: "An OData or RFC reader, a field map per plant, and a decision on whether we pull or the customer pushes.",
  },
  {
    name: "Tally",
    icon: "BookOpen",
    reads: "Ledgers, vouchers, GST registers — the books of most Indian MSMEs.",
    needs: "The importer spec is an open item in DECISIONS-V2 §6 and has not been written. Tally has no server API worth the name; this is a file or ODBC exercise.",
  },
  {
    name: "Odoo",
    icon: "Boxes",
    reads: "Sales, purchase and inventory, through its XML-RPC or JSON-RPC interface.",
    needs: "An adapter and a model map. The interface is documented and stable, which makes this the cheapest of the four ERPs.",
  },
  {
    name: "Microsoft Dynamics",
    icon: "LayoutGrid",
    reads: "Finance and operations entities over the Dataverse API.",
    needs: "An adapter, an app registration per tenant, and a decision about which entities are in scope.",
  },
  {
    name: "MES / SCADA",
    icon: "Cpu",
    reads: "Machine states, cycle counts, alarms — the signal behind uptime and OEE.",
    needs: "An OPC-UA or MQTT collector at the edge, and a shift calendar before any availability figure computed from it means anything.",
  },
  {
    name: "Documents",
    icon: "FileText",
    reads: "Scanned invoices, delivery challans, inspection reports, e-mail attachments.",
    needs: "Ingestion, storage and OCR. The receipt-extraction feature (AI #1) is the one piece of this that is registered — and it has no consumer in this build.",
  },
];

/**
 * What this console CANNOT show, named precisely.
 *
 * On the reference design each of these was a live gauge. Here they are a list of things to
 * instrument, on the same page, because a buyer comparing the two should be able to see
 * exactly which numbers we are choosing not to invent.
 */
const NOT_INSTRUMENTED: readonly { what: string; why: string }[] = [
  {
    what: "Latency per connector",
    why: "The router records which provider answered and what it cost, but not how long it took. One column on the action log would fix it.",
  },
  {
    what: "A live activity feed",
    why: "Calls are aggregated into the cost dashboard by feature and window; there is no per-call stream a screen can subscribe to. It would need the action log exposed as a paged read.",
  },
  {
    what: "Confidence over time",
    why: "Each drafted action carries a confidence, but only while it sits in the review queue. Nothing keeps the series after a person accepts or rejects it, so there is no trend to draw.",
  },
  {
    what: "Queue depth and throughput",
    why: "The review queue can be counted, but nothing records how long items wait or how fast they clear. Two timestamps would give both.",
  },
  {
    what: "Provider health",
    why: "Providers are listed with their region and their contractual position on training. Whether one is degrading right now is exactly the failure the incident register was built for — and it is found by a person noticing, not by a probe.",
  },
];

/* ══════════════════════ the shape of a connector ══════════════════════ */

interface ConnectorState {
  key: string;
  name: string;
  icon: string;
  department: string;
  featureKeys: readonly string[];
  features: readonly RegistryFeature[];
  calls: number;
  cost: number;
  acceptance: number | null;
  fallback: number | null;
  drafts: number;
  incidents: number;
  blocked: number;
  status: "active" | "standing_by" | "switched_off" | "no_consumer";
}

const STATUS_LOOK: Record<
  ConnectorState["status"],
  { label: string; chip: string; dot: string }
> = {
  active: { label: "Answering", chip: "chip-ok", dot: "var(--ok)" },
  standing_by: { label: "Standing by", chip: "chip-info", dot: "var(--brand)" },
  switched_off: { label: "Switched off", chip: "chip-warn", dot: "var(--warn)" },
  no_consumer: { label: "Not built", chip: "chip-grey", dot: "var(--text-disabled)" },
};

export default function ConnectorsScreen(_props: ScreenProps): React.JSX.Element {
  const registry = useQuery<Envelope<RegistryFeature>>(aiopsApi.registryPath);
  const incidents = useQuery<Envelope<IncidentRow>>(aiopsApi.incidentsPath);
  const hitl = useQuery<Envelope<HitlItem>>(aiopsApi.hitlPath, { query: { status: "open" } });
  const switches = useQuery<Envelope<KillSwitchState>>(aiopsApi.killSwitchesPath);
  const cost = useQuery<CostDashboard>(aiopsApi.costPath, { query: costWindow() });

  const features = useMemo(
    // `integrations.no_mvp_ai` is an explicit "this module declares no AI" entry, not a
    // feature. Counting it would inflate every headline by one, in the flattering direction.
    () => (registry.data?.data ?? []).filter((f) => f.status !== "no_mvp_ai"),
    [registry.data],
  );

  const connectors = useMemo(
    () =>
      buildConnectors({
        features,
        cost: cost.data ?? null,
        drafts: hitl.data?.data ?? [],
        incidents: incidents.data?.data ?? [],
        switches: switches.data?.data ?? [],
      }),
    [features, cost.data, hitl.data, incidents.data, switches.data],
  );

  if (registry.loading && features.length === 0) {
    return <Loading label="Reading the AI layer…" />;
  }
  if (registry.error) {
    return <ErrorState error={registry.error} onRetry={registry.reload} />;
  }

  const live = connectors.filter((c) => c.status === "active");
  const wired = connectors.filter((c) => c.status !== "no_consumer");
  const openIncidents = (incidents.data?.data ?? []).filter((i) => i.status !== "resolved");
  const drafts = hitl.data?.data ?? [];
  const totalCalls = connectors.reduce((n, c) => n + c.calls, 0);
  const withGolden = features.filter((f) => typeof FEATURE_GOLDEN_SET[f.key] === "string").length;

  const byStage = ["general", "pilot", "internal", "off"].map((stage) => ({
    label: humanise(stage),
    value: features.filter((f) => f.rolloutStage === stage).length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Connectors"
        subtitle="See which parts of XELOR are using AI and whether anything needs attention."
        meta={[
          { label: "Connected", value: `${wired.length} of ${connectors.length}` },
          { label: "Waiting for review", value: num(drafts.length) },
          { label: "Open issues", value: num(openIncidents.length) },
        ]}
      />

      {/* ─────────────────────────── the headline strip ─────────────────────────── */}
      <div className="kgrid [grid-template-columns:repeat(3,1fr)] max-[900px]:[grid-template-columns:1fr]">
        {[
          {
            l: "Connected",
            v: `${wired.length}/${connectors.length}`,
            d: `${connectors.length - wired.length} still need to be connected`,
            f: connectors.length ? wired.length / connectors.length : 0,
          },
          {
            l: "Calls",
            v: num(totalCalls),
            d: live.length === 0 ? "No recent AI activity" : `${live.length} areas used AI recently`,
          },
          {
            l: "Awaiting a person",
            v: num(drafts.length),
            d: drafts.length === 0 ? "Nothing needs a decision" : "Ready for review",
          },
        ].map((k, i) => (
          <Reveal key={k.l} delay={40 + i * 45}>
            <div className="kpi h-full">
              <p className="kpi-l">{k.l}</p>
              <p className="kpi-v">
                <CountUp value={k.v} />
              </p>
              {k.f !== undefined ? <Meter fraction={k.f} className="mt-2" /> : null}
              <p className="kpi-d">{k.d}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* ─────────────────────── the mesh, and what governs it ─────────────────── */}
      <Disclosure
        title="See how AI connects across XELOR"
        hint={`${wired.length} connected areas · ${num(totalCalls)} recent calls`}
      >
        <Reveal delay={140}>
        <div className="grid gap-3.5 [grid-template-columns:minmax(0,1fr)_320px] max-[1200px]:[grid-template-columns:minmax(0,1fr)]">
          <section className="card overflow-hidden">
            <div className="panel-h">
              <span className="flex items-center gap-2">
                <Icons.Waypoints className="h-4 w-4 text-[var(--brand)]" aria-hidden />
                Connection map
              </span>
              <span className="panel-h-sub">
                Shows the areas that currently use AI
              </span>
            </div>
            <MeshGraph connectors={connectors} />
          </section>

          <div className="flex flex-col gap-3.5">
            {/* THE NUMBER THIS WHOLE PRODUCT IS SOLD ON, and it is exactly zero.
                The reference console's equivalent tile read "91% AUTO" and treated
                autonomy as the achievement. Here the achievement is the opposite, and it
                is not a limitation we are apologising for — it is the reason a factory
                owner can put this in front of an auditor. */}
            <section className="card p-4">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Human approval
              </p>
              <p className="mt-1.5 text-[30px] font-bold leading-none tracking-[-0.02em] text-[var(--ok-ink)]">
                <CountUp value="0%" />
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                acts without approval
              </p>
              <Meter fraction={1} tone="ok" className="mt-3" />
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--text-muted)]">
                AI suggestions remain drafts until a person reviews them. There are currently{" "}
                {num(drafts.length)} waiting.
              </p>
            </section>

            <section className="card p-4">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Tested AI features
              </p>
              <p className="mt-1.5 text-[22px] font-bold leading-none text-[var(--text-primary)]">
                <CountUp value={`${withGolden} of ${features.length}`} />
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                features have a test set
              </p>
              <Meter
                fraction={features.length ? withGolden / features.length : 0}
                tone={withGolden < features.length ? "bad" : "ok"}
                className="mt-3"
              />
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--text-muted)]">
                {features.length - withGolden} features still need a complete test set.
              </p>
            </section>

            <section className="card overflow-hidden">
              <div className="panel-h">
                <span>Where AI features are being used</span>
              </div>
              <div className="p-3.5">
                <BarRows data={byStage} />
              </div>
            </section>
          </div>
        </div>
        </Reveal>
      </Disclosure>

      {/* ───────────────────────────── the connectors ───────────────────────────── */}
      <Disclosure
        title="Connected XELOR areas"
        hint={`${connectors.length} areas · open to see individual status`}
      >
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(390px,1fr))]">
          {connectors.map((c, i) => (
            <Reveal key={c.key} delay={200 + i * 45}>
              <ConnectorCard connector={c} />
            </Reveal>
          ))}
        </div>
      </Disclosure>

      {/* ────────────────────── what a person still has to do ─────────────────── */}
      <Reveal delay={260}>
        <div className="grid gap-3.5 [grid-template-columns:repeat(2,minmax(0,1fr))] max-[1100px]:[grid-template-columns:minmax(0,1fr)]">
          <section className="card flex flex-col overflow-hidden">
            <div className="panel-h">
              <span className="flex items-center gap-2">
                <Icons.UserCheck className="h-4 w-4 text-[var(--ai-accent)]" aria-hidden />
                Waiting for a person
              </span>
              <Link href="/aiops/review" className="btn btn-ghost btn-sm">
                Review queue
              </Link>
            </div>
            {drafts.length === 0 ? (
              <p className="px-4 py-9 text-center text-[12px] leading-[1.55] text-[var(--text-muted)]">
                Nothing is waiting. An empty queue means either nothing was drafted or
                everything drafted has been decided — the review screen distinguishes the two.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {drafts.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-start gap-2.5 px-4 py-3">
                    <span className="chip chip-violet mt-0.5 shrink-0">DRAFT</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                        {d.docRef ?? d.docType ?? d.featureKey}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--text-secondary)]">
                        {d.reason}
                      </span>
                      <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                        {d.featureKey}
                        {d.confidence !== null ? ` · confidence ${Math.round(d.confidence * 100)}%` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {drafts.length > 6 ? (
              <p className="border-t border-[var(--border-subtle)] px-4 py-2 text-[10.5px] text-[var(--text-muted)]">
                6 of {drafts.length} shown.
              </p>
            ) : null}
            {/* No Approve or Reject here, and that is deliberate rather than unfinished.
                Accepting a draft is the highest-blast-radius action in the product; it
                belongs on the screen built for it, with its own gate, not on a console
                somebody opened to look at a graph. */}
            <p className="mt-auto border-t border-[var(--border-subtle)] bg-[var(--bg)] px-4 py-2 text-[10px] leading-[1.45] text-[var(--text-muted)]">
              Drafts are accepted on the Review queue screen, never from here. Nothing on this
              page changes anything.
            </p>
          </section>

          <section className="card flex flex-col overflow-hidden">
            <div className="panel-h">
              <span className="flex items-center gap-2">
                <Icons.ShieldAlert className="h-4 w-4 text-[var(--bad)]" aria-hidden />
                AI issues
              </span>
              <Link href="/aiops/incidents" className="btn btn-ghost btn-sm">
                Incident register
              </Link>
            </div>
            {(incidents.data?.data ?? []).length === 0 ? (
              <p className="px-4 py-9 text-center text-[12px] leading-[1.55] text-[var(--text-muted)]">
                No AI issues have been reported.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {(incidents.data?.data ?? []).slice(0, 6).map((n) => (
                  <li key={n.id} className="flex items-start gap-2.5 px-4 py-3">
                    <span
                      className={cn(
                        "chip mt-0.5 shrink-0",
                        n.status === "resolved" ? "chip-ok" : "chip-bad",
                      )}
                    >
                      {humanise(n.severity)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold leading-[1.4] text-[var(--text-primary)]">
                        {n.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--text-secondary)]">
                        {n.actionTaken ?? n.description}
                      </span>
                      <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                        {n.incidentNo} · {dateTime(n.detectedAt)}
                        {n.featureKey ? ` · ${n.featureKey}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Reveal>

      {/* ───────────────────────── the ones that are not built ─────────────────── */}
      <Disclosure
        title="Planned outside connections"
        hint={`SAP, Tally, Odoo and ${EXTERNAL_CONNECTORS.length - 3} more`}
      >
        <Reveal delay={320}>
        <section className="card overflow-hidden">
          <div className="panel-h">
            <span className="flex items-center gap-2">
              <Icons.Unplug className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
              Systems XELOR can connect to
            </span>
            <span className="chip chip-warn">0 of {EXTERNAL_CONNECTORS.length} connected</span>
          </div>
          <p className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
            These connections are planned but are not available yet. Open each item to see
            what information it would use and what is needed to connect it.
          </p>
          <ul className="grid [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
            {EXTERNAL_CONNECTORS.map((e) => {
              const EIcon =
                (Icons as unknown as Record<string, Icons.LucideIcon>)[e.icon] ?? Icons.Circle;
              return (
                <li
                  key={e.name}
                  className="border-b border-r border-[var(--border-subtle)] p-4 last:border-r-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)]">
                      <EIcon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <b className="flex-1 text-[13px] font-bold text-[var(--text-primary)]">
                      {e.name}
                    </b>
                    <span className="chip chip-grey">Not connected</span>
                  </div>
                  <p className="mt-2 text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                    <b className="font-semibold text-[var(--text-primary)]">Information used: </b>
                    {e.reads}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-[1.5] text-[var(--text-muted)]">
                    <b className="font-semibold text-[var(--text-secondary)]">What is needed: </b>
                    {e.needs}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
        </Reveal>
      </Disclosure>

      {/* ───────────────────── where a call is actually stopped ────────────────── */}
      <Disclosure
        title="Safety and technical details"
        hint="Controls, dependencies, open work and monitoring"
      >
        <Reveal delay={340}>
        <div className="grid gap-3.5 [grid-template-columns:repeat(2,minmax(0,1fr))] max-[1100px]:[grid-template-columns:minmax(0,1fr)]">
          <section className="card flex flex-col overflow-hidden">
            <div className="panel-h">
              <span className="flex items-center gap-2">
                <Icons.ShieldCheck className="h-4 w-4 text-[var(--ok)]" aria-hidden />
                Safety controls
              </span>
              <span className="chip chip-grey">{CHOKEPOINTS.length} gates</span>
            </div>
            <p className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
              These controls stop unsafe or unauthorised AI requests.
            </p>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {CHOKEPOINTS.map((k) => (
                <li key={k.name} className="px-4 py-3">
                  <p className="font-mono text-[11.5px] font-semibold text-[var(--text-primary)]">
                    {k.name}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                    {k.detail}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-muted)]" title={k.file}>
                    {k.file}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card flex flex-col overflow-hidden">
            <div className="panel-h">
              <span className="flex items-center gap-2">
                <Icons.Share2 className="h-4 w-4 text-[var(--brand)]" aria-hidden />
                Information ONYX receives from HEXA
              </span>
              <span className="chip chip-grey">{ONYX_DEPENDS_ON_HEXA.length} ports</span>
            </div>
            <p className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
              ONYX uses approved connections to read business information. It does not own or
              directly change department records.
            </p>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {ONYX_DEPENDS_ON_HEXA.map((d) => (
                <li key={d.port} className="px-4 py-3">
                  <p className="font-mono text-[11.5px] font-semibold text-[var(--text-primary)]">
                    {d.port}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                    {d.what}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-muted)]" title={d.file}>
                    {d.file}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
        </Reveal>

      {/* ───────────────────────── what is still open ──────────────────────────── */}
        <Reveal delay={350}>
        <section className="card overflow-hidden">
          <div className="panel-h">
            <span className="flex items-center gap-2">
              <Icons.CircleDashed className="h-4 w-4 text-[var(--warn)]" aria-hidden />
              Open technical work
            </span>
            <span className="chip chip-warn">{OPEN_ITEMS.length}</span>
          </div>
          <p className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
            Work that still needs to be completed before a wider rollout.
          </p>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {OPEN_ITEMS.map((o) => (
              <li key={o.title} className="flex items-start gap-3 px-4 py-3">
                <Icons.CircleDot
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warn)]"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <b className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                    {o.title}
                  </b>
                  <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                    {o.detail}
                  </span>
                  <span className="mt-1 block font-mono text-[10px] text-[var(--text-muted)]">
                    {o.source}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        </Reveal>

      {/* ─────────────────── the numbers we are refusing to invent ─────────────── */}
        <Reveal delay={360}>
        <section className="card overflow-hidden">
          <div className="panel-h">
            <span className="flex items-center gap-2">
              <Icons.GaugeCircle className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              Monitoring still to add
            </span>
            <span className="panel-h-sub">
              Not currently measured
            </span>
          </div>
          <p className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
            These measurements are not available yet. They are listed here so the team can
            add them before a wider rollout.
          </p>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {NOT_INSTRUMENTED.map((g) => (
              <li key={g.what} className="flex items-start gap-3 px-4 py-2.5">
                <Icons.Minus className="mt-1 h-3 w-3 shrink-0 text-[var(--text-disabled)]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <b className="text-[12px] font-semibold text-[var(--text-primary)]">{g.what}</b>
                  <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                    {g.why}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        </Reveal>
      </Disclosure>
    </div>
  );
}
/* ══════════════════════════ the mesh ══════════════════════════ */

/**
 * THE ONE PICTURE OF HOW THIS IS CONNECTED.
 *
 * There used to be two — a wiring diagram on a Connection map screen and this operational
 * mesh — and a product that draws its own architecture twice, differently, has told the
 * reader that neither drawing is authoritative. There is one now, and it is this one.
 *
 * Hand-authored SVG rather than a graph library. The layout is a ring, which is arithmetic,
 * and what a library would add is a physics simulation that moves the nodes every time the
 * page loads — so a person who learned "Sales is bottom-left" would have to find it again
 * on every visit.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * WHAT EACH THING ON THE PICTURE MEANS, AND WHY IT IS NOT DECORATION
 * ─────────────────────────────────────────────────────────────────────────────────
 *   THE RING     is drawn dashed and faint. It is a guide for the eye, not a connection —
 *                these modules do not talk to each other through the AI layer, and drawing
 *                a solid ring would assert a mesh topology that does not exist.
 *   AN EDGE      is a real call site: a service in that module that calls a registered
 *                feature through an adapter. Grey when the connector has made no call in
 *                this window, and DASHED when there is no call site at all.
 *   A LIT EDGE   with a travelling dot means that connector has actually answered in this
 *                window. The dot moves INWARD, because that is the direction the evidence
 *                travels — a module's rows go to the router, and only a draft comes back.
 *                Nothing animates on a silent edge. An idle connector with a moving dot
 *                would be the one element on this page saying something untrue.
 *   THE COLOUR   of a node is its DEPARTMENT's colour, the same one on its sidebar badge
 *                and its dashboard. HEXA and MICA happen to share a blue, which is why the
 *                department code is written inside every node and the module name under it:
 *                colour is the accelerator here and never the only signal.
 *   THE HALO     marks a connector that is answering right now.
 */

/**
 * Department accent colours, transcribed from `src/spine/registry/departments.ts`.
 *
 * Copied rather than imported on purpose: `departments.ts` imports the module registry, and
 * a module reaching for it would close a circle — module → spine → registry → module. The
 * values are the same ones the sidebar badges use, so a node and its badge always match.
 */
const DEPARTMENT_ACCENT: Readonly<Record<string, string>> = {
  ONYX: "var(--violet)",
  HEXA: "var(--brand)",
  AXLE: "var(--dept-axle)",
  SPAR: "var(--accent)",
  MICA: "var(--dept-mica)",
  KILN: "var(--warn)",
  RASP: "var(--ok)",
};

/** The status line under each node — the word, and the colour of the dot beside it. */
const NODE_STATE: Record<ConnectorState["status"], { word: string; dot: string }> = {
  active: { word: "ANSWERING", dot: "var(--ok)" },
  standing_by: { word: "STANDING BY", dot: "var(--text-muted)" },
  switched_off: { word: "SWITCHED OFF", dot: "var(--warn)" },
  no_consumer: { word: "NOT BUILT", dot: "var(--text-disabled)" },
};

function MeshGraph({ connectors }: { connectors: readonly ConnectorState[] }): React.JSX.Element {
  const W = 940;
  const H = 620;
  const cx = W / 2;
  const cy = 292;
  const rx = 350;
  const ry = 208;
  const R = 34; // node radius
  const CORE = 46; // the centre

  const nodes = connectors.map((c, i) => {
    // Starting at twelve o'clock, clockwise. Fixed by index rather than by anything that
    // changes between loads, so a connector keeps its position for good.
    const a = (i / Math.max(1, connectors.length)) * Math.PI * 2 - Math.PI / 2;
    return { c, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, a };
  });

  return (
    <div className="overflow-x-auto px-3 pb-2 pt-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[760px]"
        role="img"
        aria-label={`The AI router is connected to ${connectors.length} modules: ${connectors
          .map((c) => `${c.name} of ${c.department}, ${NODE_STATE[c.status].word.toLowerCase()}`)
          .join("; ")}.`}
      >
        <defs>
          {/* The soft bloom under a node that is answering. Kept very low in opacity — on a
              dark surface a strong glow bleeds into its neighbours and the ring stops
              reading as evenly spaced. */}
          <radialGradient id="mesh-halo">
            <stop offset="55%" stopColor="var(--ok)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--ok)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mesh-core-halo">
            <stop offset="50%" stopColor="var(--violet)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--violet)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* the guide ring — dashed, because it is not a connection */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={1}
          strokeDasharray="3 7"
          opacity={0.85}
        />

        {/* every edge, drawn under the nodes so it disappears cleanly behind them */}
        {nodes.map(({ c, x, y }) => {
          const answering = c.status === "active";
          const unbuilt = c.status === "no_consumer";
          return (
            <line
              key={`edge-${c.key}`}
              x1={x}
              y1={y}
              x2={cx}
              y2={cy}
              stroke={answering ? "var(--brand)" : "var(--border-subtle)"}
              strokeWidth={answering ? 1.8 : 1}
              strokeDasharray={unbuilt ? "2 6" : undefined}
              opacity={answering ? 0.95 : unbuilt ? 0.5 : 0.75}
            />
          );
        })}

        {/* the travelling dot — only where a call genuinely happened */}
        {nodes
          .filter(({ c }) => c.status === "active")
          .map(({ c, x, y }, i) => (
            <circle key={`pulse-${c.key}`} r={4.5} fill="var(--brand)">
              {/* From the module inward to the router: evidence goes up, a draft comes back.
                  Staggered so several live connectors do not beat in unison, which reads as
                  one animation rather than several independent conversations. */}
              <animate
                attributeName="cx"
                values={`${x};${cx}`}
                dur="2.1s"
                begin={`${i * 0.35}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="cy"
                values={`${y};${cy}`}
                dur="2.1s"
                begin={`${i * 0.35}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.12;0.82;1"
                dur="2.1s"
                begin={`${i * 0.35}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}

        {/* ───────────────────────────── the centre ──────────────────────────── */}
        <circle cx={cx} cy={cy} r={CORE + 30} fill="url(#mesh-core-halo)" />
        <circle
          cx={cx}
          cy={cy}
          r={CORE + 7}
          fill="none"
          stroke="var(--violet)"
          strokeWidth={1}
          opacity={0.4}
        />
        <circle
          cx={cx}
          cy={cy}
          r={CORE}
          fill="color-mix(in srgb, var(--violet) 14%, var(--surface))"
          stroke="var(--violet)"
          strokeWidth={1.8}
        />
        <Icons.BrainCircuit
          x={cx - 15}
          y={cy - 15}
          width={30}
          height={30}
          color="var(--ai-accent)"
          strokeWidth={1.5}
          aria-hidden
        />
        <text
          x={cx}
          y={cy + CORE + 26}
          textAnchor="middle"
          className="fill-[var(--text-primary)] text-[14px] font-bold"
        >
          ONYX
        </text>
        <text
          x={cx}
          y={cy + CORE + 41}
          textAnchor="middle"
          className="fill-[var(--ai-text)] text-[9.5px] font-bold"
          style={{ letterSpacing: "0.14em" }}
        >
          AI ROUTER
        </text>

        {/* ───────────────────────────── the nodes ───────────────────────────── */}
        {nodes.map(({ c, x, y }) => {
          const accent = DEPARTMENT_ACCENT[c.department] ?? "var(--text-muted)";
          const state = NODE_STATE[c.status];
          const answering = c.status === "active";
          const Icon =
            (Icons as unknown as Record<string, Icons.LucideIcon>)[c.icon] ?? Icons.Circle;

          return (
            <g key={`node-${c.key}`}>
              {answering ? <circle cx={x} cy={y} r={R + 24} fill="url(#mesh-halo)" /> : null}
              {answering ? (
                <circle
                  cx={x}
                  cy={y}
                  r={R + 6}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1}
                  opacity={0.45}
                />
              ) : null}
              <circle
                cx={x}
                cy={y}
                r={R}
                fill={`color-mix(in srgb, ${accent} 13%, var(--surface))`}
                stroke={accent}
                strokeWidth={1.6}
                // A connector nobody calls is drawn with a broken outline, so "not built"
                // is legible without reading the caption or seeing the colour.
                strokeDasharray={c.status === "no_consumer" ? "4 4" : undefined}
                opacity={c.status === "no_consumer" ? 0.75 : 1}
              />
              <Icon
                x={x - 11}
                y={y - 11}
                width={22}
                height={22}
                color={accent}
                strokeWidth={1.6}
                aria-hidden
              />
              <text
                x={x}
                y={y + R + 20}
                textAnchor="middle"
                className="fill-[var(--text-primary)] text-[12.5px] font-semibold"
              >
                {c.name}
              </text>
              {/* The department code, because two departments share a blue and the picture
                  must not depend on telling them apart by hue. */}
              <text
                x={x}
                y={y + R + 34}
                textAnchor="middle"
                className="text-[8.5px] font-extrabold"
                style={{ fill: accent, letterSpacing: "0.14em" }}
              >
                {c.department}
              </text>
              {/* The dot and the word are ONE text node, not a circle positioned beside a
                  label. The first attempt measured the label with a characters-times-a-guess
                  formula and placed the circle to its left; letter-spacing made every word
                  wider than the guess, so the dot landed on top of the S of "SWITCHED OFF".
                  SVG cannot measure text before it paints — so nothing here tries to. The
                  bullet is a glyph in the same string, centred with it, and it cannot
                  collide with anything by construction. */}
              <text
                x={x}
                y={y + R + 47}
                textAnchor="middle"
                className="text-[8.5px] font-bold"
                style={{ fill: state.dot, letterSpacing: "0.13em" }}
              >
                <tspan style={{ fontSize: "11px", letterSpacing: "normal" }}>•</tspan>
                <tspan dx="4">{state.word}</tspan>
              </text>
            </g>
          );
        })}
      </svg>

      {/* The key. A picture whose vocabulary is only in a source comment is a picture that
          has to be explained by whoever is standing next to it. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border-subtle)] px-1 pt-2.5 text-[10.5px] text-[var(--text-muted)]">
        {(["active", "standing_by", "switched_off", "no_consumer"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: NODE_STATE[s].dot }}
            />
            <span className="font-semibold text-[var(--text-secondary)]">
              {NODE_STATE[s].word.toLowerCase()}
            </span>
            <span>— {STATUS_MEANING[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_MEANING: Record<ConnectorState["status"], string> = {
  active: "made a call in this window",
  standing_by: "wired up, nothing called it",
  switched_off: "every feature it holds is off",
  no_consumer: "registered, but no service calls it",
};

  /* ══════════════════════════ one connector ══════════════════════════ */

function ConnectorCard({ connector: c }: { connector: ConnectorState }): React.JSX.Element {
  const look = STATUS_LOOK[c.status];
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[c.icon] ?? Icons.Circle;
  const missingGolden = c.featureKeys.filter((k) => FEATURE_GOLDEN_SET[k] === null);

  return (
    <article className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
          style={{ background: `color-mix(in srgb, ${look.dot} 14%, transparent)` }}
        >
          <Icon className="h-4 w-4" style={{ color: look.dot }} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13.5px] font-bold text-[var(--text-primary)]">{c.name}</h3>
          <p className="truncate text-[10px] font-semibold tracking-[0.06em] text-[var(--text-muted)]">
            {c.department} · {c.featureKeys.length} feature
            {c.featureKeys.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className={cn("chip shrink-0", look.chip)}>{look.label}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* THE FOUR NUMBERS WE ACTUALLY HAVE. The reference design had six per card and two
            of them were processor load. These four are each read from an endpoint. */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { l: "Calls", v: c.calls > 0 ? num(c.calls) : "—" },
            { l: "Cost", v: c.cost > 0 ? inr(c.cost) : "—" },
            {
              l: "Accepted",
              v: c.acceptance !== null ? `${Math.round(c.acceptance * 100)}%` : "—",
            },
            { l: "Fell back", v: c.fallback !== null ? `${Math.round(c.fallback * 100)}%` : "—" },
          ].map((m) => (
            <div
              key={m.l}
              className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-1.5"
            >
              <p className="text-[8.5px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                {m.l}
              </p>
              <p
                className="mt-0.5 truncate text-[12.5px] font-bold text-[var(--text-primary)]"
                data-numeric=""
              >
                {m.v}
              </p>
            </div>
          ))}
        </div>

        {/* the features this connector calls, each with its own honest verdict */}
        <ul className="flex flex-col gap-1.5">
          {c.features.map((f) => {
            const golden = FEATURE_GOLDEN_SET[f.key];
            const passed = f.lastEvalVerdict === "pass";
            return (
              <li
                key={f.key}
                className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] px-2.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[var(--text-primary)]">
                    {f.displayName}
                  </span>
                  <span className="chip chip-grey shrink-0">{f.ref}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "chip",
                      f.rolloutStage === "off" ? "chip-warn" : "chip-info",
                    )}
                  >
                    {humanise(f.rolloutStage)}
                  </span>
                  <span className={cn("chip", golden === null ? "chip-bad" : "chip-ok")}>
                    {golden === null ? "No golden set" : "Golden set"}
                  </span>
                  <span className={cn("chip", passed ? "chip-ok" : "chip-warn")}>
                    {f.lastEvalVerdict === null
                      ? "Never evaluated"
                      : `Gate ${humanise(f.lastEvalVerdict).toLowerCase()}`}
                  </span>
                </div>
                {/* The sentence a Head of Ops actually needs, composed by the backend from
                    the feature's declared degraded mode rather than invented here. */}
                <p className="mt-1.5 text-[10.5px] leading-[1.45] text-[var(--text-muted)]">
                  <b className="font-semibold text-[var(--text-secondary)]">Switched off: </b>
                  {f.ifSwitchedOff}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2.5">
          {c.drafts > 0 ? (
            <span className="chip chip-violet">{c.drafts} awaiting a person</span>
          ) : null}
          {c.incidents > 0 ? <span className="chip chip-bad">{c.incidents} incidents</span> : null}
          {c.blocked > 0 ? <span className="chip chip-warn">{c.blocked} routing blocked</span> : null}
          {missingGolden.length > 0 ? (
            <span className="chip chip-bad">{missingGolden.length} without a golden set</span>
          ) : null}
          {c.status === "no_consumer" ? (
            <span className="text-[10.5px] leading-[1.45] text-[var(--text-muted)]">
              Registered, but no service in this build calls it. It cannot have run.
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* ══════════════════════════ the arithmetic ══════════════════════════ */

/** The cost dashboard needs a window. The current month, the same default the cost screen uses. */
function costWindow(): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

function buildConnectors(input: {
  features: readonly RegistryFeature[];
  cost: CostDashboard | null;
  drafts: readonly HitlItem[];
  incidents: readonly IncidentRow[];
  switches: readonly KillSwitchState[];
}): readonly ConnectorState[] {
  const { features, cost, drafts, incidents, switches } = input;

  /**
   * Invert `FEATURE_CONSUMERS`: module → the features it calls.
   *
   * This is the fact that makes the page more than a restatement of the registry. AI #2 is
   * OWNED by Organisation but CONSUMED by four modules across four departments — so
   * Engineering appears here as a live connector although AXLE owns no AI feature at all.
   */
  const byModule = new Map<string, string[]>();
  for (const [featureKey, consumers] of Object.entries(FEATURE_CONSUMERS)) {
    if (featureKey === "integrations.no_mvp_ai") continue;
    if (consumers.length === 0) {
      // A registered feature nobody calls still has to appear, under the module that owns
      // it, marked as not built. Dropping it would let the page report a healthier product
      // than the registry does — which is exactly the drift a governance screen exists to
      // catch.
      const owner = AI_FEATURE_FACTS.find((f) => f.key === featureKey)?.ownerModule;
      if (owner) byModule.set(owner, [...(byModule.get(owner) ?? []), featureKey]);
      continue;
    }
    for (const m of consumers) byModule.set(m, [...(byModule.get(m) ?? []), featureKey]);
  }

  const blockedKeys = new Set(switches.filter((s) => !s.routingAllowed).map((s) => s.featureKey));

  const out: ConnectorState[] = [];
  for (const [moduleKey, featureKeys] of byModule) {
    const look = MODULE_LOOK[moduleKey] ?? { name: humanise(moduleKey), icon: "Box" };
    const mine = features.filter((f) => featureKeys.includes(f.key));
    const costRows = (cost?.features ?? []).filter((r) => featureKeys.includes(r.featureKey));

    const calls = costRows.reduce((n, r) => n + r.calls, 0);
    const spend = costRows.reduce((n, r) => n + r.cost, 0);

    // Weighted by calls, not a mean of means. Averaging two acceptance rates from 900 and 3
    // calls gives the three-call feature half the say, which is how a bad feature hides
    // behind a good one.
    const weighted = (pick: (r: (typeof costRows)[number]) => number | null): number | null => {
      const usable = costRows.filter((r) => r.calls > 0 && pick(r) !== null);
      const total = usable.reduce((n, r) => n + r.calls, 0);
      if (total === 0) return null;
      return usable.reduce((n, r) => n + (pick(r) ?? 0) * r.calls, 0) / total;
    };

    // A connector with no call site anywhere cannot have run — that is a fact about the
    // code, not about this window, and it outranks anything the cost dashboard says.
    const hasConsumer = featureKeys.some((k) => (FEATURE_CONSUMERS[k] ?? []).includes(moduleKey));
    const allOff = mine.length > 0 && mine.every((f) => f.rolloutStage === "off");

    out.push({
      key: moduleKey,
      name: look.name,
      icon: look.icon,
      department: departmentOfModule(moduleKey),
      featureKeys,
      features: mine,
      calls,
      cost: spend,
      acceptance: weighted((r) => r.acceptanceRate),
      fallback: weighted((r) => r.fallbackRate),
      drafts: drafts.filter((d) => featureKeys.includes(d.featureKey)).length,
      incidents: incidents.filter(
        (n) => n.featureKey !== null && featureKeys.includes(n.featureKey) && n.status !== "resolved",
      ).length,
      blocked: featureKeys.filter((k) => blockedKeys.has(k)).length,
      status: !hasConsumer
        ? "no_consumer"
        : calls > 0
          ? "active"
          : allOff
            ? "switched_off"
            : "standing_by",
    });
  }

  // Busiest first, then the ones that at least exist, then the unbuilt. A console is read
  // top-left, and what is running belongs there.
  const rank: Record<ConnectorState["status"], number> = {
    active: 0,
    standing_by: 1,
    switched_off: 2,
    no_consumer: 3,
  };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.calls - a.calls);
}
