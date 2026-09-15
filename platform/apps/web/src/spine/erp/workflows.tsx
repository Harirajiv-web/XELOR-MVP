"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useErpWorkspace } from "./workspace-context";
import { DEPARTMENTS, WORKFLOWS, actionLabel } from "./workspace-model";
import { ErpIcon } from "./icon";

export function ErpWorkflows(): React.JSX.Element {
  const { actions, config } = useErpWorkspace();
  const flows=WORKFLOWS.filter(flow=>flow.steps.some(step=>actions.some(action=>action.id===step.action)));
  return <div><div className="erp2-page-heading"><div><p className="erp2-eyebrow">WORKFLOWS</p><h1>Know where to start.<br />See what comes next.</h1><p>Follow the work across your ERP. Each step opens the relevant business screen.</p></div><Link className="btn btn-secondary" href="/workspace">All records <ArrowUpRight className="h-4 w-4" aria-hidden /></Link></div><div className="erp2-flow-catalog">{flows.map((flow,index)=><section key={flow.id} id={flow.id} className="erp2-flow-card"><div className="erp2-flow-intro"><span className="erp2-flow-number">{String(index+1).padStart(2,"0")}</span><p className="erp2-eyebrow">{DEPARTMENTS.find(entry=>entry.key===flow.department)?.label}</p><h2>{flow.title}</h2><p>{flow.description}</p></div><ol>{flow.steps.map((step,i)=>{const action=actions.find(entry=>entry.id===step.action);return <li key={`${step.action}-${i}`}><span className="erp2-step-number">{i+1}</span><div>{action?<Link href={action.href}><ErpIcon name={action.icon} /><strong>{actionLabel(action,config)}</strong><ArrowRight className="h-4 w-4" aria-hidden /></Link>:<strong>Restricted step</strong>}<p>{action?step.detail:"This step is outside your current permissions. Ask the responsible team to complete it."}</p></div></li>;})}</ol></section>)}</div>{!flows.length?<p className="erp2-empty">No workflows are available with your current access. Your administrator can assign the required permissions.</p>:null}</div>;
}
