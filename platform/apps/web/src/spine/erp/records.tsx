"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { orderedModules } from "@modules/registry";
import { useAccess } from "../access/permissions";
import { moduleAvailability, visibleNav } from "../registry/manifest";
import { useErpWorkspace } from "./workspace-context";
import { DEPARTMENTS, actionLabel, searchActions } from "./workspace-model";
import { ErpIcon } from "./icon";

export function ErpRecords(): React.JSX.Element {
  const { actions, config } = useErpWorkspace();
  const { can, isLicensed } = useAccess();
  const [query,setQuery]=useState(""); const [filter,setFilter]=useState("all");
  const matches=searchActions(actions,query,config).filter(action=>filter==="all"||action.department===filter);
  const known=new Set(actions.map(action=>action.href));
  const extras=orderedModules().filter(module=>moduleAvailability(module,{can,isLicensed})===null).flatMap(module=>visibleNav(module,can).map(nav=>({href:`/${module.key}/${nav.path}`,label:nav.label,description:nav.description??module.summary,icon:nav.icon??module.icon,module:module.name}))).filter(entry=>!known.has(entry.href)&&`${entry.label} ${entry.description} ${entry.module}`.toLowerCase().includes(query.toLowerCase()));
  return <div><div className="erp2-page-heading"><div><p className="erp2-eyebrow">YOUR ERP DIRECTORY</p><h1>Everything has a place.</h1><p>Find every permitted ERP screen, including those outside your chosen workspace shortcuts.</p></div><span className="erp2-pill">{actions.length} everyday destinations</span></div><div className="erp2-directory-controls"><label className="erp2-search-input"><Search className="h-4 w-4" aria-hidden /><input type="search" aria-label="Search business records" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find items, BOMs, receipts, supplier performance..." /></label><label><span className="sr-only">Filter department</span><select value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All departments</option>{DEPARTMENTS.map(entry=><option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label></div><p className="erp2-result-count" role="status">{matches.length} everyday destinations{filter==="all"?` and ${extras.length} other screens`:""} match.</p><div className="erp2-record-sections">{DEPARTMENTS.map(department=>{const entries=matches.filter(action=>action.department===department.key);return entries.length?<section key={department.key}><div className="erp2-directory-heading"><ErpIcon name={department.icon} className="h-5 w-5" /><div><h2>{department.label}</h2><p>{department.description}</p></div></div><div className="erp2-record-grid">{entries.map(action=><Link key={action.id} href={action.href}><ErpIcon name={action.icon} className="h-5 w-5" /><h3>{actionLabel(action,config)}</h3><p>{action.description}</p><ArrowUpRight className="erp2-record-arrow h-4 w-4" aria-hidden /></Link>)}</div></section>:null;})}</div>{filter==="all"&&extras.length?<section className="erp2-additional"><h2>More ERP screens</h2><div className="erp2-extra-links">{extras.map(entry=><Link key={entry.href} href={entry.href}><ErpIcon name={entry.icon} /><span><strong>{entry.label}</strong><small>{entry.module}</small></span><ArrowUpRight className="h-4 w-4" aria-hidden /></Link>)}</div></section>:null}{!matches.length&&!(filter==="all"&&extras.length)?<p className="erp2-empty">No matching screens. Try another word or choose all departments.</p>:null}</div>;
}
