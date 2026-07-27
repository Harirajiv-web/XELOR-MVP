"use client";

import { useEffect, type ReactNode } from "react";
import { AppShell } from "@spine/shell/app-shell";
import { useSession } from "@spine/auth/session";
import { useAccess } from "@spine/access/permissions";
import { Loading } from "@spine/states";

/**
 * THE SHELL LIVES HERE, NOT IN THE PAGES.
 *
 * It used to be that every page rendered its own `<AppShell>`. That looked harmless and was
 * not: a Next.js page component is torn down and rebuilt on every navigation, so the shell
 * — and everything holding state inside it — was destroyed and recreated each time anybody
 * clicked a menu item. Three visible faults came out of that one mistake:
 *
 *   1. THE SIDEBAR SCROLLED BACK TO THE TOP. Sixteen modules do not fit in a 236px column,
 *      so anybody working in Accounts or Maintenance had to scroll down to them, and then
 *      scroll down again after every single click. The reported symptom.
 *   2. THE TREE FORGOT WHAT WAS OPEN. Expanding Purchase and Inventory to compare two
 *      screens lasted exactly until the second click.
 *   3. THE COPILOT LOST THE CONVERSATION. Ask a question, follow the evidence to the screen
 *      it cites, and the answer you were reading is gone — on a product whose entire claim
 *      is "the assistant sits beside the work" rather than somewhere you have to go.
 *
 * A LAYOUT is preserved across navigations within its subtree; a page is not. Putting the
 * shell in one is the actual fix, and it is why `(app)` exists — a route group, so it
 * changes nothing about the URLs. `/inventory/stock` is still `/inventory/stock`.
 *
 * `callback` and the 404 stay OUTSIDE this group on purpose: neither should be wrapped in a
 * frame full of menus for an application the visitor may not be signed in to yet.
 */
export default function AppLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const { status, signIn } = useSession();
  const { ready } = useAccess();

  useEffect(() => {
    if (status === "anonymous") signIn(window.location.pathname + window.location.search);
  }, [status, signIn]);

  // Gated here rather than inside the shell, so nobody is ever shown a sidebar that is
  // empty because the permission call has not answered yet. An empty menu reads as "you
  // have access to nothing", which is the single worst thing to tell someone during the
  // two hundred milliseconds before you find out what they do have.
  if (status === "loading" || !ready) return <Loading label="Signing you in…" />;
  if (status === "anonymous") return <Loading label="Redirecting to sign-in…" />;

  return <AppShell>{children}</AppShell>;
}
