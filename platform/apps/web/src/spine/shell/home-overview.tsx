"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Box, Cable, CheckCheck, CircleCheck, ClipboardCheck, Clock3, Compass, Factory, FileCheck2, Gauge, Layers3, LifeBuoy, PackageCheck, PencilRuler, RefreshCw, ShieldCheck, TriangleAlert, Truck, Wrench, type LucideIcon } from "lucide-react";
import { orderedModules } from "@modules/registry";
import { useAccess } from "../access/permissions";
import { api } from "../api/client";
import { PRODUCT_PROFILE } from "../product/profile";
import { moduleAvailability, visibleNav, type ModuleAlert, type SignalValue } from "../registry/manifest";

interface HomeSignal { label: string; module: string; href: string; value: SignalValue | null; error: boolean }
interface Snapshot { signals: HomeSignal[]; alerts: ModuleAlert[]; unavailable: number; checkedAt: string | null }
const EMPTY: Snapshot = { signals: [], alerts: [], unavailable: 0, checkedAt: null };
const PRIORITY: Record<string, string[]> = {
  "1": ["sales", "purchase", "inventory", "production"],
  "2": ["connectivity", "decisionworkspace", "agentos", "fulfilment"],
  "3": ["network", "sourcing", "purchase", "connectivity"],
  "4": ["sales", "purchase", "network", "connectivity"],
  "5": ["plantops", "maintenance", "production"],
  "6": ["safety", "quality"],
  "7": ["warehouse", "inventory"],
  "8": ["engchange", "planning", "engineering"],
  "9": ["costing", "quotation", "sales", "csp"],
  "10": ["delivery", "integration", "platform-health"],
};
/**
 * WHERE THE HERO BUTTON GOES, per product.
 *
 * This was a ternary on phase 2 and 3 that fell through to "View customer orders" for
 * everything else. That was harmless while every other product actually had a sales module;
 * it stopped being harmless the moment six packages shipped that do not. Plant Operations
 * offered "View customer orders" as its one call to action, pointing at whichever module
 * happened to sort first — a button that named a thing the product does not contain.
 *
 * A table instead of a ternary, so adding a product is a line here rather than another
 * branch, and so a missing entry degrades to the module's own name instead of to a lie.
 */
const START: Record<string, { key: string; label: string }> = {
  "1": { key: "sales", label: "View customer orders" },
  "2": { key: "connectivity", label: "Connect your data" },
  "3": { key: "network", label: "Open supplier network" },
  "4": { key: "sales", label: "View customer orders" },
  "5": { key: "plantops", label: "Open the shift board" },
  "6": { key: "safety", label: "Open the action queue" },
  "7": { key: "warehouse", label: "Start receiving" },
  "8": { key: "engchange", label: "Assess a change" },
  "9": { key: "costing", label: "Build a cost sheet" },
  "10": { key: "delivery", label: "Open the connector console" },
};
const HERO: Record<string, { title: string; description: string; steps: { title: string; icon: LucideIcon }[] }> = {
  "1": { title: "A clearer view of your factory.", description: "Your orders, materials and production, connected in one place. Start with the work that needs your attention.", steps: [{ title: "Plan", icon: Layers3 }, { title: "Produce", icon: Factory }, { title: "Deliver", icon: Box }] },
  "2": { title: "Make the next decision with confidence.", description: "Bring in evidence from your existing systems, check what you can promise, and compare a practical way forward.", steps: [{ title: "Connect", icon: Cable }, { title: "Understand", icon: Compass }, { title: "Decide", icon: CheckCheck }] },
  "3": { title: "Better sourcing starts with a clear request.", description: "Bring suppliers together, compare their offers and move from a request to a purchase order with a decision you can explain.", steps: [{ title: "Request", icon: FileCheck2 }, { title: "Compare", icon: Layers3 }, { title: "Award", icon: CheckCheck }] },
  "4": { title: "Your factory. Working together.", description: "XELOR runs your operations, ONYX supports your decisions, and AIKYANTRA brings your suppliers together, with the evidence beside every action.", steps: [{ title: "Operate", icon: Factory }, { title: "Understand", icon: Compass }, { title: "Connect", icon: Cable }] },
  "5": { title: "One asset register for the whole floor.", description: "The machine that made it, the job it ran, the repair it needed and the power it drew — read from the same equipment record, not four separate systems.", steps: [{ title: "Run", icon: Factory }, { title: "Maintain", icon: Wrench }, { title: "Measure", icon: Gauge }] },
  "6": { title: "One corrective action, whatever raised it.", description: "A defect and a near-miss run the same loop: raise, contain, investigate, act, prove it worked. One evidence trail an auditor can follow.", steps: [{ title: "Detect", icon: ShieldCheck }, { title: "Contain", icon: TriangleAlert }, { title: "Prove", icon: ClipboardCheck }] },
  "7": { title: "From the gate to the truck, scanned once.", description: "One handling unit carried through receiving, put-away, counting, kitting and picking — so the stock ledger and the loading bay agree.", steps: [{ title: "Receive", icon: PackageCheck }, { title: "Store", icon: Box }, { title: "Dispatch", icon: Truck }] },
  "8": { title: "What to make, and with which revision.", description: "An engineering change rewrites the bill of materials, which rewrites the plan. Same model, read forwards and backwards.", steps: [{ title: "Design", icon: PencilRuler }, { title: "Assess", icon: Compass }, { title: "Release", icon: CheckCheck }] },
  "9": { title: "The quote you sent, the machine you service.", description: "Cost it honestly, approve the margin, then stand behind the serial number with warranty, spares and a service history.", steps: [{ title: "Quote", icon: FileCheck2 }, { title: "Deliver", icon: Box }, { title: "Support", icon: LifeBuoy }] },
  "10": { title: "Getting it live, and keeping it live.", description: "Discovery, migration, connectors, commissioning and support — the work that decides whether any of the software is actually used.", steps: [{ title: "Migrate", icon: Cable }, { title: "Commission", icon: ClipboardCheck }, { title: "Operate", icon: LifeBuoy }] },
};

export function HomeOverview(): React.JSX.Element {
  const { can, isLicensed, ready } = useAccess();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const modules = orderedModules().filter((module) => moduleAvailability(module, { can, isLicensed }) === null);
  const hero = HERO[PRODUCT_PROFILE.phase]!;
  const destinations = modules.flatMap((module) => { const first = visibleNav(module, can)[0]; return first ? [{ name: module.name, label: first.label, href: `/${module.key}/${first.path}`, key: module.key }] : []; });
  const begin = START[PRODUCT_PROFILE.phase];
  const start = destinations.find((entry) => entry.key === begin?.key) ?? destinations[0];

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    const available = orderedModules().filter((module) => moduleAvailability(module, { can, isLicensed }) === null);
    const priority = PRIORITY[PRODUCT_PROFILE.phase] ?? [];
    const sorted = [...available].sort((a, b) => (priority.indexOf(a.key) < 0 ? 99 : priority.indexOf(a.key)) - (priority.indexOf(b.key) < 0 ? 99 : priority.indexOf(b.key)));
    const chosen = sorted.flatMap((module) => { const signal = module.signals?.find((entry) => can(entry.permission)); const first = visibleNav(module, can)[0]; return signal && first ? [{ module, signal, href: `/${module.key}/${first.path}` }] : []; }).slice(0, 4);
    const sources = available.flatMap((module) => (module.alerts ?? []).filter((source) => can(source.permission))).slice(0, 10);
    const requests = new Map<string, Promise<unknown>>();
    const read = (path: string, query?: Record<string, string | number | boolean>): Promise<unknown> => {
      const key = `${path}:${JSON.stringify(query ?? {})}`;
      const cached = requests.get(key);
      if (cached) return cached;
      const request = api.get<unknown>(path, { query, signal: controller.signal });
      requests.set(key, request);
      return request;
    };
    void Promise.all([
      Promise.all(chosen.map(async ({ module, signal, href }): Promise<HomeSignal> => {
        try { const value = signal.reduce(await read(signal.path, signal.query)); return { label: `${module.name} · ${signal.label}`, module: module.name, href, value, error: value === null }; }
        catch { return { label: `${module.name} · ${signal.label}`, module: module.name, href, value: null, error: true }; }
      })),
      Promise.all(sources.map(async (source) => { try { return { alerts: source.reduce(await read(source.path, source.query)), error: false }; } catch { return { alerts: [], error: true }; } })),
    ]).then(([signals, alerts]) => {
      if (controller.signal.aborted) return;
      const rank = { critical: 0, urgent: 1, attention: 2 };
      const unique = [...new Map(alerts.flatMap((source) => source.alerts).map((alert) => [alert.id, alert])).values()].sort((a, b) => rank[a.severity] - rank[b.severity]);
      setSnapshot({ signals, alerts: unique, unavailable: alerts.filter((source) => source.error).length + signals.filter((signal) => signal.error).length, checkedAt: new Date().toISOString() });
      setLoading(false);
    });
    return () => controller.abort();
  }, [ready, can, isLicensed, nonce]);

  return <div>
    <div className="x-home-header"><div><p className="x-eyebrow mb-2">{PRODUCT_PROFILE.label}</p><h1 className="x-page-heading">Business overview</h1><p className="x-page-description">A little clarity for the day ahead.</p></div><div className="flex items-center gap-4"><span className="x-freshness"><Clock3 className="h-3.5 w-3.5" aria-hidden />{snapshot.checkedAt ? `Updated ${new Date(snapshot.checkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Reading your workspace"}</span><button type="button" className="btn btn-secondary" disabled={loading} onClick={() => setNonce((value) => value + 1)} aria-label="Refresh overview"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden /><span className="hidden sm:inline">Refresh</span></button></div></div>
    <section className="x-home-hero"><div><p className="x-eyebrow text-[var(--brand)]">One workspace. A shared picture.</p><h2 className="x-hero-title">{hero.title}</h2><p className="x-page-description">{hero.description}</p>{start ? <Link href={start.href} className="btn btn-primary mt-5">{begin?.label ?? `Open ${start.name}`}<ArrowRight className="h-4 w-4" aria-hidden /></Link> : null}</div><div className="x-hero-steps" aria-hidden>{hero.steps.map((step, index) => <div key={step.title} className="flex items-center gap-2"><div className="x-hero-step"><span><step.icon className="h-5 w-5" /></span>{step.title}</div>{index < 2 ? <ArrowRight className="h-4 w-4 text-[var(--border-input)]" /> : null}</div>)}</div></section>
    {snapshot.unavailable > 0 ? <div className="x-notice mb-5" data-tone="warning" role="status"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Some sources could not be read. Available figures are shown below; refresh to try again.</div> : null}
    <section className="x-home-stats" aria-label="Live workspace figures" aria-busy={loading}>
      {loading && !snapshot.signals.length ? [0, 1, 2, 3].map((key) => <div className="x-stat-card" key={key}><div className="x-skeleton h-3 w-3/4" /><div className="x-skeleton my-5 h-8 w-1/3" /><div className="x-skeleton h-2 w-full" /></div>) : snapshot.signals.map((signal) => <Link key={`${signal.module}:${signal.label}`} href={signal.href} className="x-stat-card"><span className="x-stat-top">{signal.label}<span className="x-stat-icon"><ArrowUpRight className="h-4 w-4" aria-hidden /></span></span><strong className="x-stat-value">{signal.value?.value ?? "—"}</strong><p className="x-stat-hint">{signal.error ? "Source unavailable. Open the module to retry." : signal.value?.hint ?? signal.module}</p></Link>)}
    </section>
    <div className="x-home-grid">
      <section className="x-home-panel"><div className="x-home-panel-head"><div><h2 className="x-section-heading">Needs your attention</h2><p>Exceptions from the records you can access</p></div>{snapshot.alerts.length ? <span className="chip chip-warn">{snapshot.alerts.length} to review</span> : <CircleCheck className="h-5 w-5 text-[var(--brand)]" aria-hidden />}</div>
        {snapshot.alerts.slice(0, 6).map((alert) => <div key={alert.id} className="x-attention-row"><span className="x-alert-icon" data-severity={alert.severity}><TriangleAlert className="h-4 w-4" aria-hidden /></span><div className="min-w-0 flex-1">{alert.href ? <Link href={alert.href}><strong>{alert.title}</strong></Link> : <strong>{alert.title}</strong>}<p>{alert.body}</p>{alert.evidence ? <p className="text-[10px]">{alert.evidence}</p> : null}</div>{alert.href ? <Link href={alert.href} className="x-icon-button" aria-label={`Review ${alert.title}`}><ArrowUpRight className="h-4 w-4" aria-hidden /></Link> : null}</div>)}
        {!snapshot.alerts.length ? <div className="x-empty-state"><CheckCheck className="h-8 w-8" aria-hidden /><h3>{loading ? "Checking your records" : snapshot.unavailable ? "No exceptions in the available sources" : "Nothing flagged in this overview"}</h3><p>{loading ? "Reading current records from your permitted modules." : "Open a workspace to review its full record and continue your work."}</p></div> : null}
      </section>
      <section className="x-home-panel"><div className="x-home-panel-head"><div><h2 className="x-section-heading">Pick up your work</h2><p>Your most useful starting points</p></div><Layers3 className="h-4 w-4 text-[var(--text-muted)]" aria-hidden /></div><div className="x-quick-grid">{destinations.slice(0, 6).map((entry, index) => { const Mark = [Factory, Compass, Cable, Box, FileCheck2, Layers3][index] ?? Layers3; return <Link href={entry.href} key={entry.key} className="x-quick-card"><Mark className="h-5 w-5 text-[var(--brand)]" aria-hidden /><strong>{entry.name}</strong><span>{entry.label} →</span></Link>; })}</div>{!destinations.length ? <p className="x-empty-copy">Your administrator can assign the workspaces you need.</p> : null}</section>
    </div>
    <p className="mt-6 text-[10px] leading-6 text-[var(--text-muted)]">Figures reflect the records returned by each source. Open a module for complete lists, filters and evidence.</p>
  </div>;
}
