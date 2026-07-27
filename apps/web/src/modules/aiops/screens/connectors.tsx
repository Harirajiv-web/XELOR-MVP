"use client";

import Link from "next/link";
import { useMemo } from "react";
import * as Icons from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { Loading, ErrorState } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { CountUp, Meter, Reveal } from "@spine/ui/motion";
import { BarRows } from "@spine/ui/charts";
import { inr, num, dateTime, humanise } from "@spine/format";
import { cn } from "@spine/ui/cn";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  aiopsApi,
  departmentOfModule,
  AI_FEATURE_FACTS,
  FEATURE_CONSUMERS,
  FEATURE_GOLDEN_SET,
  type CostDashboard,
  type Envelope,
  type HitlItem,
  type IncidentRow,
  type KillSwitchState,
  type ProviderRow,
  type RegistryFeature,
} from "../api";

/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * THE CONNECTOR CONSOLE — every system the AI layer touches, and what it is doing now.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * The Connection map next door answers "how is this wired". This screen answers the
 * question that comes after it: "and is anything actually happening". They are different
 * questions and they are asked by different people — an architect asks the first, a Head of
 * Operations asks the second on a Monday morning.
 *
 * ───────────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS A CONNECTOR
 * ───────────────────────────────────────────────────────────────────────────────────
 * A place the AI layer draws evidence FROM or drafts actions INTO. Two classes, and the
 * distinction is the whole IND-CORE / IND-AI story:
 *
 *   INTERNAL — a module service in this build that calls a registered feature through an
 *   adapter. Derived by INVERTING `FEATURE_CONSUMERS`, which is itself transcribed from the
 *   real call sites in `apps/api/src/ai/`. Not a list somebody typed: add a call site and a
 *   connector appears here; delete the adapter and it leaves.
 *
 *   EXTERNAL — the systems IND-AI is meant to read in a plant that already runs an ERP.
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
 * The systems IND-AI is meant to read in a factory that already runs an ERP.
 *
 * Source: the product definition — IND-AI is "a read-only intelligence layer on top of a
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
  const providers = useQuery<Envelope<ProviderRow>>(aiopsApi.providersPath);
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
        subtitle="Nine module services in this build call the AI layer; six external systems IND-AI is sold against do not exist here yet. Both are on this page, and every figure is read from an endpoint or transcribed from a named source file."
        meta={[
          { label: "Connected", value: `${wired.length} of ${connectors.length}` },
          { label: "External", value: `0 of ${EXTERNAL_CONNECTORS.length}` },
          { label: "Providers", value: num(providers.data?.data.length ?? 0) },
        ]}
      />

      {/* ─────────────────────────── the headline strip ─────────────────────────── */}
      <div className="kgrid [grid-template-columns:repeat(6,1fr)] max-[1400px]:[grid-template-columns:repeat(3,1fr)] max-[900px]:[grid-template-columns:repeat(2,1fr)]">
        {[
          {
            l: "Connected",
            v: `${wired.length}/${connectors.length}`,
            d: `${connectors.length - wired.length} registered with no call site`,
            f: connectors.length ? wired.length / connectors.length : 0,
          },
          {
            l: "Answering",
            v: String(live.length),
            d: live.length === 0 ? "No calls in this window" : "Made a call in this window",
          },
          {
            l: "Calls",
            v: num(totalCalls),
            d: cost.data ? `${cost.data.from} to ${cost.data.to}` : "In this window",
          },
          {
            l: "Spend",
            v: inr(cost.data?.totalCost ?? 0),
            d: "Priced at the rate in force on the day",
          },
          {
            l: "Awaiting a person",
            v: num(drafts.length),
            d: "Drafts not yet written to any record",
          },
          {
            l: "Open incidents",
            v: num(openIncidents.length),
            d: openIncidents.length === 0 ? "Nothing on the register" : "On the AI incident register",
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
      <Reveal delay={140}>
        <div className="grid gap-3.5 [grid-template-columns:minmax(0,1fr)_320px] max-[1200px]:[grid-template-columns:minmax(0,1fr)]">
          <section className="card overflow-hidden">
            <div className="panel-h">
              <span className="flex items-center gap-2">
                <Icons.Waypoints className="h-4 w-4 text-[var(--brand)]" aria-hidden />
                The mesh
              </span>
              <span className="panel-h-sub">
                Drawn from the call sites, not from a diagram
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
                Autonomy posture
              </p>
              <p className="mt-1.5 text-[30px] font-bold leading-none tracking-[-0.02em] text-[var(--ok-ink)]">
                <CountUp value="0%" />
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                acts without a person
              </p>
              <Meter fraction={1} tone="ok" className="mt-3" />
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--text-muted)]">
                Every AI output in this system is a draft. There is no code path by which a
                model writes to a business record — the {num(drafts.length)} item
                {drafts.length === 1 ? "" : "s"} in the review queue{" "}
                {drafts.length === 1 ? "is" : "are"} proposals, and nothing else.
              </p>
            </section>

            <section className="card p-4">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Evidence discipline
              </p>
              <p className="mt-1.5 text-[22px] font-bold leading-none text-[var(--text-primary)]">
                <CountUp value={`${withGolden} of ${features.length}`} />
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                features have a golden set
              </p>
              <Meter
                fraction={features.length ? withGolden / features.length : 0}
                tone={withGolden < features.length ? "bad" : "ok"}
                className="mt-3"
              />
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--text-muted)]">
                DECISIONS-V2 §4.1: no golden set, no ship. {features.length - withGolden} have
                none, and they are named on the cards below rather than averaged away.
              </p>
            </section>

            <section className="card overflow-hidden">
              <div className="panel-h">
                <span>How far each feature has been let out</span>
              </div>
              <div className="p-3.5">
                <BarRows data={byStage} />
              </div>
            </section>
          </div>
        </div>
      </Reveal>

      {/* ───────────────────────────── the connectors ───────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <h2 className="flex items-center gap-2 text-[13px] font-bold text-[var(--text-primary)]">
          <Icons.Cable className="h-4 w-4 text-[var(--brand)]" aria-hidden />
          Inside this build
          <span className="chip chip-grey">{connectors.length}</span>
        </h2>
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(390px,1fr))]">
          {connectors.map((c, i) => (
            <Reveal key={c.key} delay={200 + i * 45}>
              <ConnectorCard connector={c} />
            </Reveal>
          ))}
        </div>
      </section>

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
                When the AI itself was the problem
              </span>
              <Link href="/aiops/incidents" className="btn btn-ghost btn-sm">
                Incident register
              </Link>
            </div>
            {(incidents.data?.data ?? []).length === 0 ? (
              <p className="px-4 py-9 text-center text-[12px] leading-[1.55] text-[var(--text-muted)]">
                The register is empty. That means nothing has been recorded — not that
                nothing has happened. These failures are found by somebody noticing, which is
                why this register exists at all.
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
      <Reveal delay={320}>
        <section className="card overflow-hidden">
          <div className="panel-h">
            <span className="flex items-center gap-2">
              <Icons.Unplug className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
              Outside this build — IND-AI's read-only connectors
            </span>
            <span className="chip chip-warn">0 of {EXTERNAL_CONNECTORS.length} connected</span>
          </div>
          <p className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
            IND-AI is sold as a layer over a plant's existing systems. None of these has an
            adapter in this repository yet. They are on the page because a console that shows
            only what works is a brochure — and because the second column is the actual
            engineering estimate, not a roadmap adjective.
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
                    <b className="font-semibold text-[var(--text-primary)]">Would read: </b>
                    {e.reads}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-[1.5] text-[var(--text-muted)]">
                    <b className="font-semibold text-[var(--text-secondary)]">To connect it: </b>
                    {e.needs}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </Reveal>

      {/* ─────────────────── the numbers we are refusing to invent ─────────────── */}
      <Reveal delay={360}>
        <section className="card overflow-hidden">
          <div className="panel-h">
            <span className="flex items-center gap-2">
              <Icons.GaugeCircle className="h-4 w-4 text-[var(--gold)]" aria-hidden />
              Not instrumented yet
            </span>
            <span className="panel-h-sub">
              Named rather than approximated
            </span>
          </div>
          <p className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
            An operations console of this kind normally carries live latency, throughput and
            confidence dials. We do not record those things, so they are not on the page. Each
            line below is what is missing and what it would take — which is a more useful
            document than a gauge nobody could check.
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
    </div>
  );
}

/* ══════════════════════════ the mesh graph ══════════════════════════ */

/**
 * ONYX at the centre, its connectors around it.
 *
 * Hand-authored SVG rather than a graph library, for the same reason the charts are: the
 * layout is fixed and the value of a library here would be a physics simulation nobody
 * asked for. Every node is also written out as text in the cards below, so the picture is
 * an accelerator and never the only way to read this.
 *
 * The edge dash travels from the connector towards the centre — evidence flows IN, drafts
 * flow back out — and only on connectors that have actually answered in this window. An
 * animation on a silent edge would be the one thing on this page that says something
 * untrue.
 */
function MeshGraph({ connectors }: { connectors: readonly ConnectorState[] }): React.JSX.Element {
  const W = 720;
  const H = 340;
  const cx = W / 2;
  const cy = H / 2;
  const rx = W / 2 - 92;
  const ry = H / 2 - 52;

  const nodes = connectors.map((c, i) => {
    const angle = (i / Math.max(1, connectors.length)) * Math.PI * 2 - Math.PI / 2;
    return { c, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });

  return (
    <div className="overflow-x-auto p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[620px]"
        role="img"
        aria-label={`The AI layer is connected to ${connectors.length} modules: ${connectors
          .map((c) => `${c.name}, ${STATUS_LOOK[c.status].label}`)
          .join("; ")}.`}
      >
        {nodes.map(({ c, x, y }) => {
          const busy = c.status === "active";
          return (
            <g key={`edge-${c.key}`}>
              <line
                x1={x}
                y1={y}
                x2={cx}
                y2={cy}
                stroke={busy ? "var(--brand)" : "var(--grid)"}
                strokeWidth={busy ? 1.6 : 1.1}
                strokeDasharray={busy ? "5 7" : undefined}
                opacity={c.status === "no_consumer" ? 0.45 : 1}
              >
                {busy ? (
                  // `values` counts DOWN so the dash travels inward. Twelve is the pattern
                  // length; anything else makes the dashes stutter at the wrap.
                  <animate
                    attributeName="stroke-dashoffset"
                    values="12;0"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                ) : null}
              </line>
            </g>
          );
        })}

        {/* the centre */}
        <circle cx={cx} cy={cy} r={40} fill="var(--ai-bg)" stroke="var(--ai-accent)" strokeWidth={1.5} />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          className="fill-[var(--ai-text)] text-[13px] font-extrabold"
          style={{ letterSpacing: "0.08em" }}
        >
          ONYX
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-[var(--text-muted)] text-[8px] font-bold"
          style={{ letterSpacing: "0.1em" }}
        >
          AI ROUTER
        </text>

        {nodes.map(({ c, x, y }) => {
          const look = STATUS_LOOK[c.status];
          return (
            <g key={`node-${c.key}`}>
              <circle
                cx={x}
                cy={y}
                r={21}
                fill="var(--surface)"
                stroke={look.dot}
                strokeWidth={1.5}
                strokeDasharray={c.status === "no_consumer" ? "3 3" : undefined}
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                className="fill-[var(--text-primary)] text-[9.5px] font-bold"
              >
                {c.department}
              </text>
              <text
                x={x}
                y={y + 36}
                textAnchor="middle"
                className="fill-[var(--text-secondary)] text-[9.5px] font-semibold"
              >
                {c.name}
              </text>
              <text
                x={x}
                y={y + 47}
                textAnchor="middle"
                className="fill-[var(--text-muted)] text-[8px] font-bold"
                style={{ letterSpacing: "0.06em" }}
              >
                {c.calls > 0 ? `${num(c.calls)} CALLS` : look.label.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

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
