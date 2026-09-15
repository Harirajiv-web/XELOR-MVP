"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, LogOut, Menu, Search, Settings2, UserRound, X } from "lucide-react";
import { orderedModules } from "@modules/registry";
import { useSession } from "../auth/session";
import { useAccess } from "../access/permissions";
import { visibleNav } from "../registry/manifest";
import { ThemeToggle } from "../theme/theme-toggle";
import { ProductLauncher } from "../shell/product-launcher";
import { Modal } from "../ui/modal";
import { ErpIcon } from "./icon";
import { useErpWorkspace } from "./workspace-context";
import { DEPARTMENTS, INDUSTRIES, ROLES, actionLabel, searchActions, type FocusRole } from "./workspace-model";

const PRIMARY = [{ href: "/home", label: "Overview", icon: "LayoutDashboard" }, { href: "/workflows", label: "Workflows", icon: "ListTodo" }, { href: "/workspace", label: "All records", icon: "Layers3" }];
export function ErpShell({ children }: { children: ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const { user, signOut, isPublicDemo } = useSession();
  const { identity, can } = useAccess();
  const { config, role, setRole, actions, error, reload } = useErpWorkspace();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const currentModule = orderedModules().find(module => pathname.split("/")[1] === module.key);
  const tabs = currentModule ? visibleNav(currentModule, can) : [];
  const selected = actions.find(action => action.href === pathname);
  const currentDepartment = selected?.department ?? actions.find(action => action.href.split("/")[1] === currentModule?.key)?.department;
  const activeRole = ROLES.find(entry => entry.id === role) ?? ROLES[0]!;
  const departments = activeRole.departments.flatMap(key => {
    const department = DEPARTMENTS.find(entry => entry.key === key);
    const entries = actions.filter(action => action.department === key);
    return department && entries.length && (key === "company" || config.visibleDepartments.includes(key)) ? [{ ...department, entries }] : [];
  });
  const company = config.businessLabel || identity?.organisation?.name || user?.tenantLabel || "Your company";
  const industry = INDUSTRIES.find(entry => entry.id === config.industryPreset) ?? INDUSTRIES[0]!;
  const matches = searchActions(actions, query, config);
  useEffect(() => { setMobileOpen(false); setSearchOpen(false); if (currentDepartment) setExpanded(currentDepartment); }, [pathname, currentDepartment]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent): void => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(value => !value); } };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const navigation = (prefix: string): React.JSX.Element => <>
    <div className="erp2-nav-primary">{PRIMARY.map(item => <Link href={item.href} key={item.href} aria-current={pathname === item.href ? "page" : undefined}><ErpIcon name={item.icon} /><span>{item.label}</span>{pathname === item.href ? <span className="erp2-nav-dot" /> : null}</Link>)}</div>
    <p className="erp2-nav-caption">BUSINESS WORKSPACES</p>
    {departments.map(department => <div className="erp2-nav-section" key={department.key}><button type="button" aria-expanded={expanded === department.key} aria-controls={`erp2-${prefix}-${department.key}`} onClick={() => setExpanded(value => value === department.key ? null : department.key)} data-active={currentDepartment === department.key}><ErpIcon name={department.icon} /><span>{department.label}</span><ChevronDown className={`h-3 w-3 ${expanded === department.key ? "rotate-180" : ""}`} aria-hidden /></button><div id={`erp2-${prefix}-${department.key}`} hidden={expanded !== department.key} className="erp2-nav-children">{department.entries.map(action => <Link key={action.id} href={action.href} aria-current={pathname === action.href ? "page" : undefined}>{actionLabel(action, config)}</Link>)}</div></div>)}
    <Link href="/configure" className="erp2-config-link" aria-current={pathname === "/configure" ? "page" : undefined}><Settings2 className="h-4 w-4" aria-hidden />Configure workspace</Link>
  </>;
  return <div className="erp2-shell">
    <a href="#erp2-main" className="x-skip-link">Skip to workspace</a>
    <aside className="erp2-sidebar" aria-label="Main navigation"><Link href="/home" className="erp2-brand" aria-label="XELOR phase 2 overview"><span className="erp2-brand-symbol">X</span><span><strong>XELOR</strong><small>phase 2 <span>ERP</span></small></span></Link><div className="erp2-company-label"><span className="erp2-live-dot" /><span>{company}</span></div><nav>{navigation("desktop")}</nav><div className="erp2-sidebar-bottom"><span className="erp2-edition">YOUR BUSINESS. ONE ERP.</span><button type="button" onClick={() => setAccountOpen(true)}><span className="erp2-user-avatar">{(user?.displayName ?? "U").slice(0, 1).toUpperCase()}</span><span><strong>{user?.displayName ?? "Workspace user"}</strong><small>{isPublicDemo ? "Local demonstration" : "Account settings"}</small></span><ChevronDown className="ml-auto h-3 w-3" aria-hidden /></button></div></aside>
    <div className="erp2-body"><header className="erp2-topbar"><button type="button" className="erp2-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" aria-hidden /></button><div className="erp2-breadcrumb"><span>{company}</span><span aria-hidden>/</span><strong>{selected ? actionLabel(selected, config) : currentModule?.name ?? PRIMARY.find(item => item.href === pathname)?.label ?? "Workspace settings"}</strong></div><button type="button" className="erp2-global-search" aria-label="Search your ERP" onClick={() => setSearchOpen(true)}><Search className="h-4 w-4" aria-hidden /><span>Search your ERP</span><kbd>Ctrl K</kbd></button><div className="erp2-topbar-end"><span className="erp2-demo-tag">{isPublicDemo ? "Demo data" : industry.name}</span><ProductLauncher /><ThemeToggle /><button type="button" className="erp2-topbar-account erp2-round-button" aria-label="Account and sign out" onClick={() => setAccountOpen(true)}><UserRound className="h-4 w-4" aria-hidden /></button></div></header>
      <main id="erp2-main" className="erp2-main" tabIndex={-1}>{currentModule && tabs.length > 1 ? <nav className="erp2-tabs" aria-label={`${currentModule.name} screens`}>{tabs.map(entry => <Link href={`/${currentModule.key}/${entry.path}`} key={entry.path} aria-current={pathname === `/${currentModule.key}/${entry.path}` ? "page" : undefined}>{entry.label}</Link>)}</nav> : null}<div className="erp2-scroll"><div className="erp2-page" key={pathname}>{error ? <div className="erp2-notice" role="status"><span>{error}</span><button onClick={reload} type="button">Retry</button></div> : null}{children}</div></div></main>
    </div>
    {mobileOpen ? <Modal title="Navigate XELOR" subtitle="phase 2 ERP" onClose={() => setMobileOpen(false)} width="max-w-md"><nav className="erp2-mobile-nav" aria-label="Mobile navigation">{navigation("mobile")}</nav></Modal> : null}
    {searchOpen ? <Modal title="Find your next task" subtitle="Search the ERP screens available to your role." onClose={() => setSearchOpen(false)} width="max-w-2xl"><div className="erp2-search-input"><Search className="h-5 w-5" aria-hidden /><input data-autofocus aria-label="Search ERP workflows" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try BOM, receipt, supplier performance or ledger" />{query ? <button aria-label="Clear search" onClick={() => setQuery("")} type="button"><X className="h-4 w-4" aria-hidden /></button> : null}</div><div className="erp2-search-results">{matches.map(action => <Link key={action.id} href={action.href} onClick={() => setSearchOpen(false)}><ErpIcon name={action.icon} /><span><strong>{actionLabel(action, config)}</strong><small>{action.description}</small></span><ArrowRight className="h-4 w-4" aria-hidden /></Link>)}{!matches.length ? <p className="erp2-empty">No matching tasks. Try a different word or open All records.</p> : null}</div><Link className="erp2-inline-link" href="/workspace" onClick={() => setSearchOpen(false)}>Browse every permitted ERP screen <ArrowRight className="h-3 w-3" aria-hidden /></Link></Modal> : null}
    {accountOpen ? <Modal title="Your workspace" subtitle="XELOR phase 2" onClose={() => setAccountOpen(false)} width="max-w-lg"><p className="erp2-account-company">{company}</p><label className="erp2-field"><span>My work focus</span><select value={role} onChange={event => setRole(event.target.value as FocusRole)}>{ROLES.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><small>Reorders your workspace and shortcuts. Access permissions stay the same. This preference is saved in this browser for your account.</small></label>{isPublicDemo ? <p className="erp2-empty">This local workspace uses demonstration records.</p> : <button type="button" className="btn btn-secondary mt-5" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden />Sign out</button>}</Modal> : null}
  </div>;
}
