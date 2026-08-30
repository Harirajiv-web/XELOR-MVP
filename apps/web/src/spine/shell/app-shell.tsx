"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import * as Icons from "lucide-react";
import { cn } from "../ui/cn";
import { useSession } from "../auth/session";
import { useAccess } from "../access/permissions";
import { orderedModules } from "@modules/registry";
import { moduleAvailability, visibleNav } from "../registry/manifest";
import { groupByWorkspace } from "../registry/workspaces";
import { CopilotRail } from "./copilot-rail";
import { AlertCentre } from "./alert-centre";
import { AgentDriver } from "./agent-driver";
import { HumanApprovalLink } from "./human-approval-link";
import { DemoLauncher } from "../demo/demo-launcher";
import { ThemeToggle } from "../theme/theme-toggle";

/**
 * THE APPLICATION FRAME — MAINDECK's three-column shell.
 *
 * A 236px sidebar, the work, and a 384px copilot rail, under a 60px topbar. The rail being
 * permanent rather than hidden behind a button is the deck's strongest structural claim:
 * the assistant sits beside the work instead of being somewhere you have to go.
 *
 * THE SIDEBAR IS ASSEMBLED, NEVER WRITTEN DOWN. It is the module registry filtered by what
 * this company licensed and what this person may open. Module rows are destinations, not
 * disclosure controls: the screens within the active module live in the horizontal
 * workbench navigation above the page. That keeps the left rail as an orientation map and
 * gives sibling screens the width they need to be scanned and switched between.
 *
 * GROUPED BY THE JOB, not by the owning department — changed, and worth recording why.
 *
 * Department grouping is a true statement about ownership: departments are cut on
 * system-of-record boundaries, the same line the module boundaries in the code follow. It
 * is also the wrong axis for a menu. It produced nine groups of wildly uneven weight — five
 * modules under ONYX, one under ACHILES — over 132 nav entries, and it asked a plant
 * supervisor looking for the inspection screen to first know that KILN owns quality.
 *
 * So the rail now groups by what you are trying to DO ("Make & Prove"), and the department
 * keeps its own pages, where the ownership story is the actual subject. See
 * `registry/workspaces.ts` for the mapping and the reasoning behind seven groups.
 *
 * A module the user cannot open is HIDDEN rather than disabled. A greyed-out item that
 * never becomes available is a permanent advertisement for something they cannot have; the
 * dedicated screens explain it properly when they reach one by URL.
 */

function Icon({ name, className }: { name?: string; className?: string }): React.JSX.Element {
  const Cmp =
    (name ? (Icons as unknown as Record<string, Icons.LucideIcon>)[name] : undefined) ??
    Icons.Circle;
  return <Cmp className={className} aria-hidden />;
}

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, isPublicDemo } = useSession();
  const { can, isLicensed, licence, identity } = useAccess();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/agentos/")) setRailOpen(false);
    setMobileNavOpen(false);
  }, [pathname]);

  const modules = orderedModules().filter(
    (m) => moduleAvailability(m, { isLicensed, can }) === null,
  );
  // Grouped by the JOB, not by the owning department. Department is still true and is still
  // rendered on the department pages; it is simply the wrong axis for a menu. See the note
  // at the top of `registry/workspaces.ts` — nine uneven department groups over 132 nav
  // entries is not a menu, it is a search problem.
  const groups = groupByWorkspace(modules);

  const current = modules.find((m) => pathname.startsWith(`/${m.key}/`));
  const currentEntries = current ? visibleNav(current, can) : [];
  const currentEntry = currentEntries.find((n) => {
    const href = `/${current?.key}/${n.path}`;
    return pathname === href || pathname.startsWith(href + "/");
  });
  const currentGroup = groups.find((g) => g.modules.some((m) => m.key === current?.key));

  const initials = (user?.displayName ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  /**
   * Native view transitions keep the workbench spatially continuous while the shell stays
   * fixed. The fallback is the Link's normal navigation plus the CSS route entrance, and a
   * person asking for reduced motion always gets that immediate path.
   */
  const navigate = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string): void => {
      setMobileNavOpen(false);
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        pathname === href ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }
      const transitionDocument = document as Document & {
        startViewTransition?: (update: () => void) => unknown;
      };
      if (!transitionDocument.startViewTransition) return;
      event.preventDefault();
      transitionDocument.startViewTransition(() => router.push(href));
    },
    [pathname, router],
  );

  return (
    <div
      className={cn("x-app-shell grid h-screen bg-[var(--bg)]", mobileNavOpen && "x-mobile-nav-open")}
      style={{
        gridTemplateColumns: `${collapsed ? "64px" : "var(--side)"} minmax(0,1fr) ${railOpen ? "var(--cop)" : "0px"}`,
        gridTemplateRows: "var(--top) minmax(0,1fr)",
        gridTemplateAreas: `"side top top" "side main cop"`,
        transition: "grid-template-columns .3s ease",
      }}
    >
      <button
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileNavOpen(false)}
        className="x-mobile-nav-backdrop"
      />
      {/* ---------------------------- sidebar ---------------------------- */}
      <aside
        style={{ gridArea: "side" }}
        className="x-shell-sidebar z-40 flex h-screen flex-col overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--surface)]"
      >
        <div className="flex min-h-[var(--top)] items-center gap-2.5 border-b border-[var(--border-subtle)] px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="x-brand-mark grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[linear-gradient(135deg,var(--chrome-raised),var(--accent))] text-[11px] font-extrabold tracking-[0.02em] text-[var(--chrome)]">
              XE
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <b className="block truncate text-[14.5px] font-bold tracking-[0.02em] text-[var(--text-primary)]">
                  XELOR
                </b>
                <span className="block text-[9.5px] tracking-[0.1em] text-[var(--text-muted)]">
                  BY AIKYANTRA
                </span>
              </span>
            ) : null}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2" aria-label="Modules">
          {groups.length === 0 ? (
            <p className="px-2 py-4 text-[12px] leading-4 text-[var(--text-muted)]">
              {collapsed ? "" : "No modules are available to you yet."}
            </p>
          ) : null}

          {groups.map((g) => {
            const openable = g.modules
              .map((m) => ({ m, entries: visibleNav(m, can) }))
              .filter((x) => x.entries.length > 0);
            if (openable.length === 0) return null;

            return (
              <div key={g.workspace.code}>
                {!collapsed ? (
                  // A workspace heading says what you come here to DO — "Make & Prove",
                  // not "KILN". The four-letter department code that used to sit here is
                  // how the ENGINEERING ORGANISATION refers to an owner; it is not how a
                  // plant supervisor finds the inspection screen.
                  //
                  // It is deliberately NOT a link. There is no workspace page, and a
                  // heading styled to look clickable that goes nowhere is a worse lie than
                  // a plain caption. Departments keep their own pages, reachable from the
                  // department view and the agent map, where that story belongs.
                  <div
                    className="flex items-center gap-2 px-2.5 pb-1 pt-4"
                    title={g.workspace.purpose}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: g.workspace.accent }}
                      aria-hidden
                    />
                    <span className="min-w-0 text-[9.8px] font-bold uppercase leading-[1.35] tracking-[0.08em] text-[var(--text-muted)]">
                      {g.workspace.name}
                    </span>
                  </div>
                ) : (
                  <div className="my-2 border-t border-[var(--border-subtle)]" />
                )}

                {openable.map(({ m, entries }) => {
                  const inModule = pathname.startsWith(`/${m.key}/`);
                  const first = entries[0];
                  if (!first) return null;
                  return (
                    <Link
                      key={m.key}
                      href={`/${m.key}/${first.path}`}
                      onClick={(event) => navigate(event, `/${m.key}/${first.path}`)}
                      data-module-key={m.key}
                      title={`${m.name}\n\n${m.summary}`}
                      aria-current={inModule ? "page" : undefined}
                      aria-label={collapsed ? `${m.name} module` : undefined}
                      className={cn(
                        "x-module-link group mt-0.5 flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-[12.4px] font-semibold transition-colors",
                        collapsed && "justify-center px-0",
                        inModule
                          ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <Icon name={m.icon} className="h-[15px] w-[15px] shrink-0" />
                      {!collapsed ? <span className="truncate">{m.name}</span> : null}
                      {!collapsed ? (
                        <Icons.ArrowUpRight
                          className={cn(
                            "ml-auto h-3 w-3 shrink-0 transition-opacity",
                            inModule ? "opacity-70" : "opacity-0 group-hover:opacity-70",
                          )}
                          aria-hidden
                        />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {!collapsed ? (
          <div className="border-t border-[var(--border-subtle)] px-4 py-2.5 text-[10px] leading-[1.5] text-[var(--text-muted)]">
            <b className="text-[var(--text-secondary)]">XELOR · by AIKYANTRA</b>
            <br />
            {identity?.organisation?.name ?? "—"}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-10 items-center gap-2 border-t border-[var(--border-subtle)] px-4 text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg)]"
        >
          <Icons.PanelLeft className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed ? "Collapse" : null}
        </button>
      </aside>

      {/* ---------------------------- topbar ----------------------------- */}
      <header
        style={{ gridArea: "top" }}
        className="x-shell-topbar z-30 flex items-center gap-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-4"
      >
        <button
          type="button"
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileNavOpen}
          onClick={() => {
            setCollapsed(false);
            setMobileNavOpen((open) => !open);
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg)] md:hidden"
        >
          {mobileNavOpen ? <Icons.X className="h-4 w-4" aria-hidden /> : <Icons.Menu className="h-4 w-4" aria-hidden />}
        </button>
        {/* The tenant, always on screen. In a product whose whole security story is that
            one factory cannot see another's data, "whose data am I looking at" must never
            require a click. */}
        <span className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-[7px] text-[12.5px] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-sm)] sm:flex-none">
          <Icons.Factory className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden />
          <span className="max-w-[220px] truncate">
            {identity?.organisation?.name ?? user?.tenantLabel ?? "—"}
          </span>
        </span>

        <p className="hidden min-w-0 items-center text-[13px] text-[var(--text-muted)] lg:flex">
          <span className="min-w-0 truncate">
            XELOR
            {currentGroup ? ` / ${currentGroup.workspace.name}` : ""}
            {current ? " / " : ""}
          </span>
          {current ? (
            <b className="shrink-0 whitespace-nowrap font-semibold text-[var(--text-primary)]">
              {current.name}
              {currentEntry ? ` · ${currentEntry.label}` : ""}
            </b>
          ) : null}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2.5">
          {licence?.expired ? (
            // Soft enforcement, said out loud. A plant does not stop because a licence
            // lapsed on a Friday evening — but nobody should be able to say they were not told.
            <span className="chip chip-warn">
              <Icons.TriangleAlert className="h-3 w-3" aria-hidden />
              Licence expired — still running
            </span>
          ) : null}

          {/* The bell sits BEFORE the copilot button, and that order is deliberate. This one
              tells you something has happened whether or not you asked; the copilot answers
              when you do. A person scanning left to right meets the interruption first,
              which is the only one of the two that can be time-critical. */}
          <span className="hidden sm:contents"><DemoLauncher /></span>

          <HumanApprovalLink />

          <AlertCentre />

          <span className="hidden sm:contents"><ThemeToggle /></span>

          <button
            type="button"
            onClick={() => setRailOpen((r) => !r)}
            aria-label={railOpen ? "Hide the copilot" : "Show the copilot"}
            title={railOpen ? "Hide the copilot" : "Show the copilot — ask about your data"}
            aria-pressed={railOpen}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-[9px] transition-colors",
              railOpen
                ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg)]",
            )}
          >
            <Icons.Sparkles className="h-4 w-4" aria-hidden />
          </button>

          <span className="flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] py-[5px] pl-[6px] pr-2.5 shadow-[var(--shadow-sm)]">
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--chrome-hover),var(--chrome-deep))] text-[10.5px] font-bold text-[var(--chrome-ink)]">
              {initials}
            </span>
            <span className="hidden sm:block">
              <span className="block text-[12px] font-semibold leading-[1.15] text-[var(--text-primary)]">
                {user?.displayName ?? "—"}
              </span>
              <span className="block text-[10px] leading-[1.2] text-[var(--text-muted)]">
                {identity?.roles.map((r) => r.name).join(", ") || " "}
              </span>
            </span>
          </span>

          {isPublicDemo ? (
            <span className="chip chip-info hidden lg:inline-flex">Public demo</span>
          ) : (
            <button
              type="button"
              onClick={signOut}
              className="btn btn-ghost btn-sm"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* ----------------------------- work ------------------------------ */}
      <main
        style={{ gridArea: "main" }}
        className="x-shell-main flex min-w-0 flex-col overflow-hidden"
      >
        {current && currentEntries.length > 0 ? (
          <nav
            aria-label={`${current.name} screens`}
            className="x-workbench-tabs relative z-20 shrink-0 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-6 backdrop-blur-xl"
          >
            <div className="flex min-w-0 items-stretch gap-1 overflow-x-auto">
              <span className="mr-3 flex shrink-0 items-center gap-2 border-r border-[var(--border-subtle)] pr-4 text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--text-muted)]">
                <Icon name={current.icon} className="h-4 w-4 text-[var(--brand)]" />
                {current.name}
              </span>
              {currentEntries.map((entry) => {
                const href = `/${current.key}/${entry.path}`;
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={(event) => navigate(event, href)}
                    title={entry.description}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "x-workbench-tab group relative flex min-h-12 shrink-0 items-center gap-2 rounded-t-[8px] px-3.5 text-[12.5px] font-semibold transition-colors",
                      active
                        ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <Icon
                      name={entry.icon ?? current.icon}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    {entry.label}
                    <span
                      className={cn(
                        "absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--brand)] transition-opacity",
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-30",
                      )}
                    />
                  </Link>
                );
              })}
            </div>
          </nav>
        ) : null}
        <div className="x-workspace-scroll min-h-0 flex-1 overflow-y-auto">
          <div key={pathname} className="x-workspace-page px-6 py-5" data-xelor-workspace="true">
            {children}
          </div>
        </div>
      </main>

      {/* -------------------------- copilot rail ------------------------- */}
      <div style={{ gridArea: "cop" }} className="overflow-hidden">
        {railOpen ? <CopilotRail onClose={() => setRailOpen(false)} /> : null}
      </div>
      {/* The agent walks the person through the product; it must outlive every
          navigation, so it is rendered by the shell rather than by a screen. */}
      <AgentDriver />
    </div>
  );
}
