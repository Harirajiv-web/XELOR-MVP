"use client";

import { use, useEffect } from "react";
import { AppShell } from "@spine/shell/app-shell";
import { DepartmentView } from "@spine/shell/department-view";
import { useSession } from "@spine/auth/session";
import { useAccess } from "@spine/access/permissions";
import { Loading } from "@spine/states";

/**
 * `/department/HEXA` — the department dashboard.
 *
 * Its own route rather than a screen inside a module, deliberately. A department outlives
 * its modules: HEXA is still the owner of platform and governance in a build where
 * Integration was left out, and a page describing it must not disappear because a module
 * did. Putting it under `general` would also mean a company that did not licence
 * Organisation could not see how its own product is organised.
 *
 * It needs NO PERMISSION beyond being signed in. It describes structure — which
 * departments exist, which modules they own — and shows only figures the viewer's own
 * permissions already allow, each checked before its request is made. There is nothing
 * here a person could not learn by opening the menu.
 */
export default function DepartmentRoute({
  params,
}: {
  params: Promise<{ code: string }>;
}): React.JSX.Element {
  const { code } = use(params);
  const { status, signIn } = useSession();
  const { ready } = useAccess();

  useEffect(() => {
    if (status === "anonymous") signIn(window.location.pathname);
  }, [status, signIn]);

  if (status === "loading" || !ready) return <Loading label="Signing you in…" />;
  if (status === "anonymous") return <Loading label="Redirecting to sign-in…" />;

  return (
    <AppShell>
      <DepartmentView code={code} />
    </AppShell>
  );
}
