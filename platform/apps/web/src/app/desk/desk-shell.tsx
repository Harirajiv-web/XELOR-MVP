"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Boxes, LayoutGrid, Users } from "lucide-react";

/**
 * THE SOURCING DESK — a portal in its own right, not a module inside the ERP.
 *
 * Deliberately outside the `(app)` route group, so it carries none of the twenty-five-module
 * sidebar. The person who lives on this screen is a buyer, all day, doing one job: getting
 * prices and choosing between them. Handing them the whole ERP's navigation to do that is
 * how a focused tool becomes a menu.
 *
 * Three destinations, and no more. The research on real e-sourcing suites is blunt about
 * this: the consistent complaint against the established products is that the buyer needs
 * training to find anything and the supplier portal is worse. A desk with three headings
 * needs no training.
 *
 * Theme tokens carry the product palette across the buyer desk and supplier portal, and
 * keep this daily workspace readable in the viewer's light/dark choice.
 */
const TABS = [
  { href: "/desk", label: "Requests", icon: LayoutGrid, exact: true },
  { href: "/desk/suppliers", label: "Suppliers", icon: Users, exact: false },
  { href: "/desk/materials", label: "Materials", icon: Boxes, exact: false },
] as const;

export default function DeskShell({ children }: { children: ReactNode }): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--chrome)]">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/desk" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--action)] text-[13px] font-bold text-[var(--action-ink)]">
              SD
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold text-[var(--chrome-ink)]">
                Sourcing Desk
              </span>
              <span className="block text-[11px] text-[var(--chrome-ink-muted)]">
                3S Precision Parts · requests, quotes and suppliers
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {TABS.map((t) => {
              const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] font-medium transition ${
                    active
                      ? "bg-[var(--chrome-active)] text-[var(--chrome-ink)]"
                      : "text-[var(--chrome-ink-muted)] hover:bg-[var(--chrome-hover)]"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" aria-hidden />
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/sourcing/rfqs"
            className="ml-auto text-[12px] text-[var(--chrome-ink-muted)] underline-offset-2 hover:underline"
          >
            Open the full ERP →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[100rem] px-5 py-6">{children}</main>
    </div>
  );
}
