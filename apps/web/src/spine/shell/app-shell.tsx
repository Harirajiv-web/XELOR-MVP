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

/**
 * THE APPLICATION FRAME.
 *
 * The sidebar is ASSEMBLED, never written down. It is the module registry filtered by what
 * this company licensed and what this person may open. There is no menu file, which means
 * there is no menu file to forget to update when a module is removed — the class of bug
 * where a deleted feature leaves a dead link behind cannot occur here.
 *
 * A module the user cannot open is HIDDEN rather than disabled. A greyed-out menu item that
 * never becomes available is a permanent advertisement for something they cannot have; the
 * dedicated "you don't have access" screen, reached by URL, explains it properly when they
 * do land there.
 */

function Icon({ name, className }: { name?: string; className?: string }): React.JSX.Element {
  const Cmp = (name ? (Icons as unknown as Record<string, Icons.LucideIcon>)[name] : undefined) ??
    Icons.Circle;
  return <Cmp className={className} aria-hidden />;
}

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const { can, isLicensed, licence, identity } = useAccess();
  const [collapsed, setCollapsed] = useState(false);

  const modules = orderedModules().filter(
    (m) => moduleAvailability(m, { isLicensed, can }) === null,
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface)] transition-[width]",
          collapsed ? "w-16" : "w-[236px]",
        )}
      >
        <div className="flex h-[60px] items-center gap-2 border-b border-[var(--border-subtle)] px-4">
          {/* The logo slot. A wordmark until the real asset lands — deliberately not a
              placeholder box, because a grey rectangle in a demo reads as unfinished. */}
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-[var(--brand)] text-[13px] font-bold text-white">
              A
            </span>
            {!collapsed ? (
              <span className="truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">
                AIKYANTRA
              </span>
            ) : null}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Modules">
          {modules.length === 0 ? (
            <p className="px-2 py-4 text-[12px] leading-4 text-[var(--text-muted)]">
              {collapsed ? "" : "No modules are available to you yet."}
            </p>
          ) : null}

          {modules.map((m) => {
            const entries = visibleNav(m, can);
            if (entries.length === 0) return null;
            return (
              <div key={m.key} className="mb-4">
                {!collapsed ? (
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    {m.name}
                  </p>
                ) : null}
                <ul className="space-y-0.5">
                  {entries.map((n) => {
                    const href = `/${m.key}/${n.path}`;
                    const active = pathname === href || pathname.startsWith(href + "/");
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          title={collapsed ? n.label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-[13px] transition-colors",
                            // The 3px left bar is the point: an active item is never
                            // signalled by background colour alone, which is invisible to
                            // some users and washed out on a cheap monitor in daylight.
                            active
                              ? "border-l-[3px] border-[var(--brand)] bg-[var(--brand-soft)] pl-[5px] font-semibold text-[var(--brand)]"
                              : "border-l-[3px] border-transparent pl-[5px] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                          )}
                        >
                          <Icon name={n.icon ?? m.icon} className="h-4 w-4 shrink-0" />
                          {!collapsed ? <span className="truncate">{n.label}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-10 items-center gap-2 border-t border-[var(--border-subtle)] px-4 text-[12px] text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
        >
          <Icons.PanelLeft className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed ? "Collapse" : null}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6">
          <div className="min-w-0">
            {/* The tenant is always on screen. In a product whose entire security story is
                that one factory cannot see another's data, the answer to "whose data am I
                looking at" must never require a click. */}
            <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
              {identity?.organisation?.name ?? user?.tenantLabel ?? "—"}
            </p>
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              {licence ? `${licence.plan}${licence.expired ? " · licence expired" : ""}` : " "}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {licence?.expired ? (
              // Soft enforcement, said out loud. A plant does not stop because a licence
              // lapsed on a Friday evening — but nobody should be able to say they were
              // not told.
              <span className="hidden items-center gap-1.5 rounded-full bg-[var(--status-pending-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--status-pending-text)] sm:inline-flex">
                <Icons.TriangleAlert className="h-3 w-3" aria-hidden />
                Licence expired — still running
              </span>
            ) : null}

            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <p className="text-[13px] font-medium leading-4 text-[var(--text-primary)]">
                  {user?.displayName ?? "—"}
                </p>
                <p className="text-[11px] leading-4 text-[var(--text-muted)]">
                  {identity?.roles.map((r) => r.name).join(", ") || " "}
                </p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="rounded-[var(--radius-control)] border border-[var(--border-input)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-6 py-5">{children}</main>
      </div>
    </div>
  );
}
