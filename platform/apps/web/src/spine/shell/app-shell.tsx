"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Icons from "lucide-react";
import { orderedModules } from "@modules/registry";
import { useSession } from "../auth/session";
import { useAccess } from "../access/permissions";
import { moduleAvailability, visibleNav } from "../registry/manifest";
import { groupByWorkspace } from "../registry/workspaces";
import { PRODUCT_PROFILE, isModuleEnabled } from "../product/profile";
import { ProductLauncher } from "./product-launcher";
import { cn } from "../ui/cn";
import { Modal } from "../ui/modal";
import { ThemeToggle } from "../theme/theme-toggle";
import { AlertCentre } from "./alert-centre";
import { CopilotRail } from "./copilot-rail";
import { AgentDriver } from "./agent-driver";
import { HumanApprovalLink } from "./human-approval-link";
import { ErpShell } from "../erp/erp-shell";
import { ErpWorkspaceProvider } from "../erp/workspace-context";

function Icon({ name, className }: { name?: string; className?: string }): React.JSX.Element {
  const Component = (name ? (Icons as unknown as Record<string, Icons.LucideIcon>)[name] : undefined) ?? Icons.Circle;
  return <Component className={className} aria-hidden />;
}

/** Persistent shell; navigation follows the product, licence and caller permissions. */
export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  const { identity } = useAccess();
  if (PRODUCT_PROFILE.phase === "1") return <ErpWorkspaceProvider key={identity ? `${identity.tenantId}:${identity.subject}` : "pending"}><ErpShell>{children}</ErpShell></ErpWorkspaceProvider>;
  return <ExistingAppShell>{children}</ExistingAppShell>;
}

function ExistingAppShell({ children }: { children: ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const { user, signOut, isPublicDemo } = useSession();
  const { can, isLicensed, identity, licence } = useAccess();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const modules = orderedModules().filter((module) => moduleAvailability(module, { can, isLicensed }) === null);
  const groups = groupByWorkspace(modules);
  const current = modules.find((module) => pathname === `/${module.key}` || pathname.startsWith(`/${module.key}/`));
  const entries = current ? visibleNav(current, can) : [];
  const currentEntry = entries.find((entry) => pathname === `/${current?.key}/${entry.path}` || pathname.startsWith(`/${current?.key}/${entry.path}/`));
  const destinations = modules.flatMap((module) => visibleNav(module, can).map((entry) => ({ label: entry.label, module: module.name, description: entry.description, href: `/${module.key}/${entry.path}`, icon: entry.icon ?? module.icon })));
  const found = destinations.filter((entry) => `${entry.label} ${entry.module} ${entry.description ?? ""}`.toLowerCase().includes(search.toLowerCase())).slice(0, 14);
  const aiAvailable = modules.some((module) => module.key === "copilot");
  const primary = [
    { label: "Overview", href: "/home", icon: "LayoutDashboard" },
    ...(modules.some((module) => module.key === "decisionworkspace") ? [{ label: "Decisions", href: "/decisionworkspace/workspace", icon: "Compass" }] : []),
    ...(modules.some((module) => module.key === "network") ? [{ label: "Tenders", href: "/network/tenders", icon: "Files" }] : []),
    ...(modules.some((module) => module.key === "connectivity") ? [{ label: "Connections", href: "/connectivity/connections", icon: "Cable" }] : []),
  ];
  const initials = (user?.displayName ?? "User").split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  useEffect(() => { setMobileNavOpen(false); setSearchOpen(false); if (pathname.startsWith("/agentos/")) setRailOpen(false); }, [pathname]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent): void => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((open) => !open); } };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = (): HTMLElement[] => Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? []).filter((element) => element.offsetParent !== null);
    controls()[0]?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setMobileNavOpen(false);
      if (event.key !== "Tab") return;
      const items = controls(); const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [mobileNavOpen]);

  return (
    <div className={cn("x-app-shell grid h-dvh bg-[var(--bg)]", mobileNavOpen && "x-mobile-nav-open")} style={{ gridTemplateColumns: `${collapsed ? "76px" : "var(--side)"} minmax(0,1fr) ${railOpen ? "var(--cop)" : "0px"}`, gridTemplateRows: "var(--top) minmax(0,1fr)", gridTemplateAreas: '"side top top" "side main cop"' }}>
      <a href="#workspace-main" className="x-skip-link">Skip to workspace</a>
      <button type="button" aria-label="Close navigation" className="x-mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} tabIndex={mobileNavOpen ? 0 : -1} />
      <aside ref={sidebar} style={{ gridArea: "side" }} className="x-shell-sidebar z-40 flex h-dvh flex-col overflow-hidden" aria-label="Workspace navigation">
        <div className="x-sidebar-brand"><Link href="/home" className="flex min-w-0 items-center gap-3" aria-label={`${PRODUCT_PROFILE.name} overview`}><span className="x-brand-mark"><Icons.Component className="h-5 w-5" aria-hidden /></span>{!collapsed ? <span className="min-w-0"><strong className="block text-[15px] tracking-[.04em]">{PRODUCT_PROFILE.name}</strong><span className="x-brand-caption">{PRODUCT_PROFILE.label}</span></span> : null}</Link><button className="x-drawer-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><Icons.X className="h-5 w-5" aria-hidden /></button></div>
        {!collapsed ? <div className="x-workspace-label"><span className="x-workspace-dot" />Your workspace <span className="ml-auto">0{PRODUCT_PROFILE.phase}</span></div> : null}
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-6" aria-label="Modules">
          <div className="x-primary-nav">{primary.map((entry) => <Link key={entry.href} href={entry.href} title={entry.label} aria-current={pathname === entry.href ? "page" : undefined} className={cn("x-module-link", collapsed && "justify-center")}><Icon name={entry.icon} className="h-[18px] w-[18px] shrink-0" />{!collapsed ? entry.label : null}</Link>)}</div>
          {groups.map((group) => { const visible = group.modules.filter((module) => !["connectivity", "decisionworkspace"].includes(module.key)); if (!visible.length) return null; return <div key={group.workspace.code} className="x-nav-group">{!collapsed ? <p className="x-nav-group-label">{group.workspace.name}</p> : <div className="x-nav-divider" />}{visible.map((module) => { const first = visibleNav(module, can)[0]; if (!first) return null; return <Link key={module.key} href={`/${module.key}/${first.path}`} data-module-key={module.key} title={module.name} aria-current={current?.key === module.key ? "page" : undefined} className={cn("x-module-link", collapsed && "justify-center")}><Icon name={module.icon} className="h-[17px] w-[17px] shrink-0" />{!collapsed ? <span className="truncate">{module.name}</span> : null}</Link>; })}</div>; })}
        </nav>
        <div className="x-sidebar-footer">{!collapsed ? <div className="mb-3 flex items-center gap-2"><Icons.ShieldCheck className="h-4 w-4" aria-hidden /><span>{isPublicDemo ? "Demonstration workspace" : "Your company. Your data."}</span></div> : null}<button type="button" className="flex min-h-10 w-full items-center gap-3 text-left" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><Icons.PanelLeftClose className="h-[18px] w-[18px] shrink-0" aria-hidden />{!collapsed ? <span>Collapse navigation</span> : null}</button></div>
      </aside>
      <header style={{ gridArea: "top" }} className="x-shell-topbar z-30 flex min-w-0 items-center gap-3 px-7">
        <button type="button" className="x-icon-button md:hidden" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => { setCollapsed(false); setMobileNavOpen(true); }}><Icons.Menu className="h-5 w-5" aria-hidden /></button>
        <div className="min-w-0"><span className="x-topbar-company">{identity?.organisation?.name ?? user?.tenantLabel ?? "Company workspace"}</span><span className="x-topbar-context">{currentEntry?.label ?? "Business overview"}</span></div>
        <button type="button" className="x-command-search" onClick={() => setSearchOpen(true)}><Icons.Search className="h-4 w-4" aria-hidden /><span>Find a screen or workflow</span><kbd>⌘ K</kbd></button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5"><button type="button" className="x-icon-button x-mobile-search" aria-label="Search workspace" onClick={() => setSearchOpen(true)}><Icons.Search className="h-[18px] w-[18px]" aria-hidden /></button>{licence?.expired ? <span className="chip chip-warn hidden xl:inline-flex">Licence expired</span> : null}{isModuleEnabled("agentos") ? <span className="hidden xl:contents"><HumanApprovalLink /></span> : null}<AlertCentre /><ProductLauncher /><span className="hidden sm:contents"><ThemeToggle /></span>{aiAvailable ? <button type="button" className="x-icon-button" aria-label={railOpen ? "Close assistant" : "Open assistant"} aria-pressed={railOpen} onClick={() => setRailOpen((value) => !value)}><Icons.Sparkles className="h-[18px] w-[18px]" aria-hidden /></button> : null}<button type="button" className="x-account-button" onClick={() => setProfileOpen(true)} aria-label="Account and product workspaces"><span className="x-avatar">{initials}</span><Icons.ChevronDown className="hidden h-3.5 w-3.5 sm:block" aria-hidden /></button></div>
      </header>
      <main id="workspace-main" style={{ gridArea: "main" }} className="x-shell-main flex min-w-0 flex-col overflow-hidden" tabIndex={-1}>
        {current && entries.length > 1 ? <nav aria-label={`${current.name} screens`} className="x-workbench-tabs shrink-0 px-7"><div className="flex gap-1 overflow-x-auto">{entries.map((entry) => { const href = `/${current.key}/${entry.path}`; const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className="x-workbench-tab"><Icon name={entry.icon} className="h-4 w-4" />{entry.label}</Link>; })}</div></nav> : null}
        <div className="x-workspace-scroll min-h-0 flex-1 overflow-y-auto"><div key={pathname} className="x-workspace-page" data-xelor-workspace="true">{children}</div></div>
      </main>
      <div style={{ gridArea: "cop" }} className={cn("x-copilot-container overflow-hidden", railOpen && "x-copilot-open")}>{railOpen ? <CopilotRail onClose={() => setRailOpen(false)} /> : null}</div>
      {isModuleEnabled("fulfilment") ? <AgentDriver /> : null}
      <nav className="x-bottom-nav" aria-label="Quick navigation">{primary.slice(0, 3).map((entry) => <Link key={entry.href} href={entry.href} aria-current={pathname === entry.href ? "page" : undefined}><Icon name={entry.icon} className="h-5 w-5" /><span>{entry.label}</span></Link>)}<button type="button" onClick={() => { setCollapsed(false); setMobileNavOpen(true); }} aria-label="Browse all modules"><Icons.Menu className="h-5 w-5" aria-hidden /><span>More</span></button></nav>
      {searchOpen ? <Modal title="Find your workspace" subtitle="Search the screens available to your role." onClose={() => setSearchOpen(false)} width="max-w-xl"><label className="x-search-field"><Icons.Search className="h-5 w-5" aria-hidden /><input data-autofocus aria-label="Search screens" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try purchase, inventory, approvals…" /></label><div className="mt-4 max-h-[50dvh] overflow-y-auto">{found.map((entry) => <Link key={entry.href} href={entry.href} onClick={() => setSearchOpen(false)} className="x-search-result"><Icon name={entry.icon} className="h-5 w-5" /><span><strong>{entry.label}</strong><small>{entry.module}</small></span><Icons.ArrowUpRight className="ml-auto h-4 w-4" aria-hidden /></Link>)}{found.length === 0 ? <p className="x-empty-copy">No matching screens. Try a different name.</p> : null}</div></Modal> : null}
      {profileOpen ? <Modal title="Your workspace" subtitle={user?.displayName ?? "Signed in"} onClose={() => setProfileOpen(false)} width="max-w-lg"><div className="x-profile-current"><span className="x-avatar">{initials}</span><div><strong>{identity?.organisation?.name ?? "Company workspace"}</strong><p>{PRODUCT_PROFILE.name} · {PRODUCT_PROFILE.label}</p></div></div>{!isPublicDemo ? <button type="button" className="btn btn-secondary mt-5 w-full" onClick={signOut}><Icons.LogOut className="h-4 w-4" aria-hidden />Sign out</button> : <p className="mt-5 text-sm text-[var(--text-muted)]">This workspace contains demonstration data.</p>}</Modal> : null}
    </div>
  );
}
