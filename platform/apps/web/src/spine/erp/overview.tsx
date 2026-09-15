"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CheckCheck, Clock3, RefreshCw, TriangleAlert } from "lucide-react";
import { orderedModules } from "@modules/registry";
import { useAccess } from "../access/permissions";
import { api } from "../api/client";
import { canOpenNavEntry, moduleAvailability, type ModuleAlert, type SignalValue } from "../registry/manifest";
import { useErpWorkspace } from "./workspace-context";
import { DEPARTMENTS, INDUSTRIES, ROLES, WORKFLOWS, actionLabel, type FocusRole } from "./workspace-model";
import { ErpIcon } from "./icon";

interface Signal { key: string; label: string; href: string; value: SignalValue | null; error: boolean }
interface Snapshot { signals: Signal[]; alerts: ModuleAlert[]; unavailable: number; at: string | null }
const EMPTY: Snapshot = { signals: [], alerts: [], unavailable: 0, at: null };
function today(): string { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; }
export function ErpOverview(): React.JSX.Element {
  const { ready, can, isLicensed } = useAccess();
  const { config, role, setRole, actions } = useErpWorkspace();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const focus = ROLES.find(entry => entry.id === role) ?? ROLES[0]!;
  const industry = INDUSTRIES.find(entry => entry.id === config.industryPreset) ?? INDUSTRIES[0]!;
  const visibleActions = actions.filter(action => action.department === "company" || config.visibleDepartments.includes(action.department));
  const priorities = [...new Set([...config.quickActionOrder, ...focus.actions])];
  const quickActions = [...visibleActions].sort((a,b) => (priorities.indexOf(a.id)<0?99:priorities.indexOf(a.id))-(priorities.indexOf(b.id)<0?99:priorities.indexOf(b.id))).slice(0,Math.max(6,config.quickActionOrder.length));
  const accessibleHrefs = actions.map(action => action.href).join("|");
  const visibleDepartments = config.visibleDepartments.join("|");
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true); setSnapshot(EMPTY);
    const allowed = orderedModules().filter(module => moduleAvailability(module, {can,isLicensed}) === null);
    const actionHrefs = new Set(accessibleHrefs.split("|"));
    const shownDepartments = new Set(visibleDepartments.split("|"));
    const modules = allowed.filter(module => actions.some(action => action.href.split("/")[1] === module.key && actionHrefs.has(action.href) && (action.department === "company" || shownDepartments.has(action.department))));
    const priorities = (ROLES.find(entry => entry.id === role) ?? ROLES[0]!).signals;
    const chosen = priorities.flatMap(key => {
      const module = modules.find(entry => entry.key === key);
      const signal = module?.signals?.find(entry => can(entry.permission));
      const destination = actions.find(action => action.href.split("/")[1] === key);
      return module && signal && destination ? [{ module, signal, href: destination.href }] : [];
    });
    const permittedHref = (href?: string): boolean => {
      if (!href) return true;
      const [, key, path] = href.split(/[/?]/);
      const module = allowed.find(entry => entry.key === key);
      const entry = module?.nav.find(nav => nav.path === path);
      return entry !== undefined && canOpenNavEntry(entry, can);
    };
    const sources = modules.filter(module => ["sales","purchase","production","planning","quality","accounts","expenditure"].includes(module.key)).flatMap(module => (module.alerts??[]).filter(source => can(source.permission)));
    const requests = new Map<string, Promise<unknown>>();
    const read = (path: string, query?: Record<string,string|number|boolean>): Promise<unknown> => {
      const parameters = query && "asOf" in query ? {...query, asOf:today()} : query;
      const key = `${path}:${JSON.stringify(parameters??{})}`;
      const existing = requests.get(key); if (existing) return existing;
      const promise = api.get<unknown>(path, {query:parameters,signal:controller.signal}); requests.set(key,promise); return promise;
    };
    void Promise.all([
      Promise.all(chosen.map(async ({module,signal,href}): Promise<Signal> => {
        try { const value = signal.reduce(await read(signal.path,signal.query)); return {key:module.key,label:signal.label,href,value,error:value===null}; }
        catch { return {key:module.key,label:signal.label,href,value:null,error:true}; }
      })),
      Promise.all(sources.map(async source => {
        try { return {alerts:source.reduce(await read(source.path,source.query)).filter(alert => permittedHref(alert.href)), error:false}; }
        catch { return {alerts:[], error:true}; }
      })),
    ]).then(([signals,sources]) => {
      if (controller.signal.aborted) return;
      const rank={critical:0,urgent:1,attention:2};
      const alerts=[...new Map(sources.flatMap(source=>source.alerts).map(alert=>[alert.id,alert])).values()].sort((a,b)=>rank[a.severity]-rank[b.severity]);
      setSnapshot({signals,alerts,unavailable:signals.filter(signal=>signal.error).length+sources.filter(source=>source.error).length,at:new Date().toISOString()});setLoading(false);
    });
    return () => controller.abort();
  },[ready,can,isLicensed,role,nonce,accessibleHrefs,visibleDepartments,actions]);
  const stepActions = ["quotes","sales-orders","mrp","work-orders","stock"].flatMap(id => { const action=visibleActions.find(entry=>entry.id===id); return action?[action]:[]; });
  return <div className="erp2-overview">
    <div className="erp2-page-heading"><div><p className="erp2-eyebrow">XELOR PHASE 2 / BUSINESS OVERVIEW</p><h1>Your business, in view.</h1><p>Clear priorities. Connected records. A simpler working day.</p></div><div className="erp2-heading-controls"><label><span className="sr-only">My work focus</span><select value={role} onChange={event=>setRole(event.target.value as FocusRole)}>{ROLES.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><button type="button" className="erp2-round-button" onClick={()=>setNonce(value=>value+1)} disabled={loading} aria-label="Refresh business overview"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`} aria-hidden /></button></div></div>
    <section className="erp2-hero"><div className="erp2-hero-copy"><span className="erp2-hero-kicker">ONE BUSINESS. ONE PLACE TO WORK.</span><h2>From the first order<br />to the next opportunity.</h2><p>{industry.description}</p><Link href="/workflows">Open your workflows <ArrowUpRight className="h-4 w-4" aria-hidden /></Link></div><div className="erp2-hero-flow"><p>THE EVERYDAY BUSINESS FLOW</p><div>{stepActions.map((action,index)=><Link key={action.id} href={action.href}><span>{String(index+1).padStart(2,"0")}</span><strong>{actionLabel(action,config)}</strong><ArrowRight className="h-4 w-4" aria-hidden /></Link>)}</div><span className="erp2-hero-foot">{industry.name} workspace <span aria-hidden>·</span> <Link href="/configure">Make it yours</Link></span></div></section>
    <div className="erp2-section-caption"><span><span className="erp2-live-dot" />BUSINESS SNAPSHOT</span><span><Clock3 className="h-3 w-3" aria-hidden />{snapshot.at?`Read at ${new Date(snapshot.at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`:"Reading permitted records"}</span></div>
    {snapshot.unavailable>0?<div className="erp2-notice" role="status"><TriangleAlert className="h-4 w-4" aria-hidden /><span>Some sources are unavailable. The available figures are shown; refresh to retry.</span></div>:null}
    <section className="erp2-stat-grid" aria-label="Current business figures" aria-busy={loading}>{loading?Array.from({length:6},(_,i)=><div key={i} className="erp2-stat"><div className="x-skeleton h-3 w-24" /><div className="x-skeleton my-5 h-8 w-16" /><div className="x-skeleton h-2 w-36" /></div>):snapshot.signals.map(signal=><Link className="erp2-stat" href={signal.href} key={signal.key}><span className="erp2-stat-label">{signal.label}<ArrowUpRight className="h-4 w-4" aria-hidden /></span><strong>{signal.value?.value??"—"}</strong><p>{signal.error?"Unavailable. Open the record to review.":signal.value?.hint??"From current business records"}</p></Link>)}</section>
    {!loading&&!snapshot.signals.length?<p className="erp2-empty">No summary sources are available to your current permissions. Open an available workspace below.</p>:null}
    <div className="erp2-overview-grid"><section className="erp2-panel"><div className="erp2-panel-heading"><div><p className="erp2-eyebrow">EXCEPTIONS & COMMITMENTS</p><h2>Needs attention</h2></div><span className="erp2-count">{snapshot.alerts.length} flagged</span></div><div className="erp2-attention-list">{snapshot.alerts.slice(0,8).map(alert=><div key={alert.id} className="erp2-attention" data-severity={alert.severity}><span className="erp2-attention-dot" /><div>{alert.href?<Link href={alert.href}><strong>{alert.title}</strong></Link>:<strong>{alert.title}</strong>}<p>{alert.body}</p>{alert.evidence?<small>{alert.evidence}</small>:null}</div>{alert.href?<Link href={alert.href} className="erp2-round-button" aria-label={`Review ${alert.title}`}><ArrowUpRight className="h-4 w-4" aria-hidden /></Link>:null}</div>)}{!snapshot.alerts.length?<div className="erp2-empty-block"><CheckCheck className="h-7 w-7" aria-hidden /><h3>{loading?"Checking the current records":snapshot.unavailable?"No flags in the available sources":"No exceptions flagged"}</h3><p>Review the full records for complete lists and filters.</p></div>:null}</div><Link href="/workspace" className="erp2-panel-footer">Browse your business records <ArrowRight className="h-4 w-4" aria-hidden /></Link></section>
    <section className="erp2-panel"><div className="erp2-panel-heading"><div><p className="erp2-eyebrow">{focus.name.toUpperCase()}</p><h2>Start your next task</h2></div><Link href="/configure" className="erp2-inline-link">Edit shortcuts</Link></div><div className="erp2-quick-grid">{quickActions.map(action=><Link key={action.id} href={action.href}><span className="erp2-quick-icon"><ErpIcon name={action.icon} className="h-5 w-5" /></span><strong>{actionLabel(action,config)}</strong><span>{action.description}</span><ArrowUpRight className="erp2-quick-arrow h-4 w-4" aria-hidden /></Link>)}</div>{!quickActions.length?<p className="erp2-empty">No shortcuts are available for these permissions. Ask your administrator to review your access.</p>:null}</section></div>
    <section className="erp2-workflow-strip"><div><p className="erp2-eyebrow">WORK TOGETHER, ACROSS DEPARTMENTS</p><h2>A clear path through the work.</h2></div>{WORKFLOWS.filter(flow=>flow.steps.some(step=>visibleActions.some(action=>action.id===step.action))).slice(0,3).map(flow=><Link key={flow.id} href={`/workflows#${flow.id}`}><span>{DEPARTMENTS.find(entry=>entry.key===flow.department)?.label}</span><strong>{flow.title}</strong><ArrowUpRight className="h-4 w-4" aria-hidden /></Link>)}</section>
    <p className="erp2-footnote">Figures reflect the records returned by each source; page limits and reporting dates are shown with the figures. Work focus changes your starting points, not your access permissions.</p>
  </div>;
}
