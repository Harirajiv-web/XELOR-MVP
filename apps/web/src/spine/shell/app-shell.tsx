"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import * as Icons from "lucide-react";
import { cn } from "../ui/cn";
import { useSession } from "../auth/session";
import { useAccess } from "../access/permissions";
import { orderedModules } from "@modules/registry";
import { moduleAvailability, visibleNav } from "../registry/manifest";
import { groupByDepartment } from "../registry/departments";
import { CopilotRail } from "./copilot-rail";
import { AlertCentre } from "./alert-centre";
import { ThemeToggle } from "../theme/theme-toggle";

/**
 * THE APPLICATION FRAME — MAINDECK's three-column shell.
 *
 * A 236px sidebar, the work, and a 384px copilot rail, under a 60px topbar. The rail being
 * permanent rather than hidden behind a button is the deck's strongest structural claim:
 * the assistant sits beside the work instead of being somewhere you have to go.
 *
 * THE SIDEBAR IS ASSEMBLED, NEVER WRITTEN DOWN. It is the module registry filtered by what
 * this company licensed and what this person may open, grouped under the department that
 * owns each module. There is no menu file, so there is no menu file to forget to update
 * when a module is removed — the class of bug where a deleted feature leaves a dead link
 * cannot occur here.
 *
 * GROUPED BY DEPARTMENT, because that is the organising fact of the whole system.
 * Departments are cut by system-of-record ownership, which is the same line the module
 * boundaries in the code are drawn on. Seeing "SPAR · Supply Chain" over Purchase and
 * Inventory tells a buyer in one glance why one team owns the stock ledger and why nothing
 * else may write to it.
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
  const { user, signOut } = useSession();
  const { can, isLicensed, licence, identity } = useAccess();
  const [collapsed, setCollapsed] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  /**
   * Which modules are showing their screens. Keyed by module, and DELIBERATELY SPARSE: a
   * module with no entry falls back to "open if you are inside it", so the tree opens
   * itself where you are and stays quiet everywhere else. Storing a value for all sixteen
   * up front would mean the sidebar had an opinion about modules the user has never
   * touched, and would have to be reconciled every time one is added or removed.
   *
   * The department and module rows are ALWAYS visible; only the screens fold away. The
   * point of this tree is that you can see HEXA owns Administration, Organisation and
   * Integration without opening anything.
   */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const modules = orderedModules().filter(
    (m) => moduleAvailability(m, { isLicensed, can }) === null,
  );
  const groups = groupByDepartment(modules);

  const current = modules.find((m) => pathname.startsWith(`/${m.key}/`));
  const currentEntry = current?.nav.find((n) => pathname === `/${current.key}/${n.path}`);
  const currentDept = groups.find((g) => g.modules.some((m) => m.key === current?.key));

  const initials = (user?.displayName ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="grid h-screen bg-[var(--bg)]"
      style={{
        gridTemplateColumns: `${collapsed ? "64px" : "var(--side)"} minmax(0,1fr) ${railOpen ? "var(--cop)" : "0px"}`,
        gridTemplateRows: "var(--top) minmax(0,1fr)",
        gridTemplateAreas: `"side top top" "side main cop"`,
        transition: "grid-template-columns .3s ease",
      }}
    >
      {/* ---------------------------- sidebar ---------------------------- */}
      <aside
        style={{ gridArea: "side" }}
        className="z-40 flex h-screen flex-col overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--surface)]"
      >
        <div className="flex min-h-[var(--top)] items-center gap-2.5 border-b border-[var(--border-subtle)] px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[linear-gradient(135deg,#12294f,var(--brand))] text-[11px] font-extrabold tracking-[0.02em] text-white">
              AK
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <b className="block truncate text-[14.5px] font-bold tracking-[0.02em] text-[var(--text-primary)]">
                  IND<span className="text-[var(--brand)]">-CORE</span>
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
              <div key={g.department.code}>
                {!collapsed ? (
                  // The department header carries its four-letter code as a coloured
                  // marker. Not decoration: the code is how this organisation refers to the
                  // owner of everything underneath it, in tickets, branches and blueprints.
                  // It is also a LINK — a department is a thing in this product with its own
                  // dashboard, not merely a caption over some menu items.
                  <Link
                    href={`/department/${g.department.code}`}
                    title={`${g.department.name} — overview`}
                    aria-current={
                      pathname === `/department/${g.department.code}` ? "page" : undefined
                    }
                    className={cn(
                      "group flex items-center gap-2 rounded-[8px] px-2.5 py-1 pt-4 transition-colors hover:bg-[var(--bg)]",
                      pathname === `/department/${g.department.code}` && "bg-[var(--bg)]",
                    )}
                  >
                    <span
                      className="rounded-[5px] px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.1em] text-white"
                      style={{ background: g.department.accent }}
                    >
                      {g.department.code}
                    </span>
                    <span className="truncate text-[9.8px] font-bold uppercase tracking-[0.13em] text-[var(--text-muted)]">
                      {g.department.name}
                    </span>
                    <Icons.ArrowRight
                      className="ml-auto h-3 w-3 shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                ) : (
                  <div className="my-2 border-t border-[var(--border-subtle)]" />
                )}

                {openable.map(({ m, entries }) => {
                  const inModule = pathname.startsWith(`/${m.key}/`);
                  const open = collapsed || (expanded[m.key] ?? inModule);
                  return (
                    <div key={m.key}>
                      {/* THE MODULE, as its own level.
                          Departments own modules and modules own screens, and flattening
                          the middle one hid the fact the whole architecture rests on: that
                          Administration, Organisation and Integration are three separate
                          removable things HEXA happens to own, not one long list of
                          platform screens. The module row also gives the tree a place to
                          collapse, which is what keeps sixteen modules and fifty-three
                          screens navigable in a 236px column. */}
                      {!collapsed ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((e) => ({ ...e, [m.key]: !(e[m.key] ?? inModule) }))
                          }
                          aria-expanded={open}
                          title={m.summary}
                          className={cn(
                            "mt-0.5 flex w-full items-center gap-2 rounded-[8px] px-2.5 py-[6px] text-left text-[12px] font-semibold transition-colors",
                            inModule
                              ? "text-[var(--text-primary)]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--bg)]",
                          )}
                        >
                          <Icons.ChevronRight
                            className={cn(
                              "h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform",
                              open && "rotate-90",
                            )}
                            aria-hidden
                          />
                          <Icon name={m.icon} className="h-[15px] w-[15px] shrink-0" />
                          <span className="truncate">{m.name}</span>
                          <span className="ml-auto text-[9.5px] font-bold tabular-nums text-[var(--text-muted)]">
                            {entries.length}
                          </span>
                        </button>
                      ) : null}

                      {open ? (
                        <ul className="space-y-0.5">
                          {entries.map((n) => {
                            const href = `/${m.key}/${n.path}`;
                            const active =
                              pathname === href || pathname.startsWith(href + "/");
                            return (
                              <li key={href}>
                                <Link
                                  href={href}
                                  // The description on hover, so somebody can find out what
                                  // "MRP run" contains without having to open it and guess
                                  // from a table. The label alone is the one thing a menu
                                  // cannot explain, and this menu has fifty-three of them.
                                  title={
                                    n.description
                                      ? `${m.name} — ${n.label}\n\n${n.description}`
                                      : collapsed
                                        ? `${m.name} — ${n.label}`
                                        : n.label
                                  }
                                  aria-current={active ? "page" : undefined}
                                  className={cn(
                                    "flex items-center gap-2.5 rounded-[8px] py-[6px] pr-2.5 text-[12.4px] font-medium transition-all",
                                    // Indented under its module, with a hairline rail so
                                    // the eye can follow which module a screen belongs to
                                    // without counting pixels.
                                    collapsed
                                      ? "justify-center px-0"
                                      : "ml-[17px] border-l border-[var(--border-subtle)] pl-[13px]",
                                    active
                                      ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand)]"
                                      : "text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text-primary)]",
                                  )}
                                >
                                  <Icon
                                    name={n.icon ?? m.icon}
                                    className="h-[14px] w-[14px] shrink-0"
                                  />
                                  {!collapsed ? <span className="truncate">{n.label}</span> : null}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {!collapsed ? (
          <div className="border-t border-[var(--border-subtle)] px-4 py-2.5 text-[10px] leading-[1.5] text-[var(--text-muted)]">
            <b className="text-[var(--text-secondary)]">IND-CORE · by AIKYANTRA</b>
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
        className="z-30 flex items-center gap-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-4"
      >
        {/* The tenant, always on screen. In a product whose whole security story is that
            one factory cannot see another's data, "whose data am I looking at" must never
            require a click. */}
        <span className="inline-flex shrink-0 items-center gap-2 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-[7px] text-[12.5px] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-sm)]">
          <Icons.Factory className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden />
          <span className="max-w-[220px] truncate">
            {identity?.organisation?.name ?? user?.tenantLabel ?? "—"}
          </span>
        </span>

        <p className="hidden min-w-0 truncate text-[13px] text-[var(--text-muted)] lg:block">
          IND-CORE
          {currentDept ? ` / ${currentDept.department.name}` : ""}
          {current ? " / " : ""}
          {current ? (
            <b className="font-semibold text-[var(--text-primary)]">
              {current.name}
              {currentEntry ? ` · ${currentEntry.label}` : ""}
            </b>
          ) : null}
        </p>

        <span className="chip chip-gold shrink-0">DEMO</span>

        <div className="ml-auto flex items-center gap-2.5">
          {licence ? (
            <span className="hidden text-right lg:block">
              <span className="block text-[11px] font-semibold leading-4 text-[var(--text-secondary)]">
                {licence.plan}
              </span>
              <span className="block text-[10px] leading-4 text-[var(--text-muted)]">
                {licence.modules.length} modules licensed
              </span>
            </span>
          ) : null}

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
          <AlertCentre />

          <ThemeToggle />

          <button
            type="button"
            onClick={() => setRailOpen((r) => !r)}
            aria-label={railOpen ? "Hide the copilot" : "Show the copilot"}
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
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--brand),#3f7de8)] text-[10.5px] font-bold text-white">
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

          <button
            type="button"
            onClick={signOut}
            className="btn btn-ghost btn-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ----------------------------- work ------------------------------ */}
      <main style={{ gridArea: "main" }} className="min-w-0 overflow-y-auto px-6 py-5">
        {children}
      </main>

      {/* -------------------------- copilot rail ------------------------- */}
      <div style={{ gridArea: "cop" }} className="overflow-hidden">
        {railOpen ? <CopilotRail onClose={() => setRailOpen(false)} /> : null}
      </div>
    </div>
  );
}
