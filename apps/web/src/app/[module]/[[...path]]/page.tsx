"use client";

import { use, useEffect, useMemo, useState, type ComponentType } from "react";
import { notFound, useRouter } from "next/navigation";
import { AppShell } from "@spine/shell/app-shell";
import { useSession } from "@spine/auth/session";
import { useAccess } from "@spine/access/permissions";
import { Forbidden, Loading, NotLicensed } from "@spine/states";
import { findModule } from "@modules/registry";
import type { ScreenProps } from "@spine/registry/manifest";

/**
 * ONE ROUTE FOR EVERY MODULE SCREEN.
 *
 * `/inventory/stock`, `/sales/orders`, `/planning/mrp` — all of them land here and are
 * resolved from the registry. That is what makes a module folder genuinely removable:
 * there is no `app/inventory/` directory to delete alongside it, and no route file left
 * pointing at a folder that has gone.
 *
 * The cost is that screens render on the client rather than the server. For an ERP behind a
 * login that costs almost nothing — there is no search engine to satisfy, and every query
 * needs the caller's own token anyway, so the server could not have fetched the data
 * without first becoming the user.
 *
 * The gates run in a deliberate order, because they answer to different people:
 *   SIGNED IN?  → the sign-in page
 *   INSTALLED?  → a genuine 404; this build does not contain that module
 *   LICENSED?   → a sales conversation
 *   PERMITTED?  → an administrator conversation
 * Collapsing them into one "not found" would be tidier and would send three-quarters of
 * these users to the wrong person.
 */
export default function ModuleScreenRoute({
  params,
}: {
  params: Promise<{ module: string; path?: string[] }>;
}): React.JSX.Element {
  const { module: moduleKey, path = [] } = use(params);
  const router = useRouter();
  const { status, signIn } = useSession();
  const { ready, can, isLicensed } = useAccess();

  const manifest = findModule(moduleKey);
  const screenKey = path[0] ?? manifest?.nav[0]?.path ?? "";
  const rest = useMemo(() => path.slice(1), [path]);

  const [Screen, setScreen] = useState<ComponentType<ScreenProps> | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loader = manifest?.screens[screenKey];

  useEffect(() => {
    if (!loader) return;
    let cancelled = false;
    setScreen(null);
    setLoadError(false);
    void loader()
      .then((m) => {
        if (!cancelled) setScreen(() => m.default);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  useEffect(() => {
    if (status === "anonymous") signIn(window.location.pathname);
  }, [status, signIn]);

  // A module that is not installed is a 404 in the ordinary sense: this build genuinely
  // does not contain it, and pretending otherwise would be a lie about the product.
  if (!manifest) notFound();

  if (status === "loading" || !ready) return <Loading label="Signing you in…" />;
  if (status === "anonymous") return <Loading label="Redirecting to sign-in…" />;

  if (!isLicensed(manifest.licenceKey)) {
    return (
      <AppShell>
        <NotLicensed moduleName={manifest.name} summary={manifest.summary} />
      </AppShell>
    );
  }

  const entry = manifest.nav.find((n) => n.path === screenKey);
  if (!entry) {
    // Landing on a module root, or on a screen that no longer exists. Send them to the
    // first thing they can actually open rather than showing an empty frame.
    const first = manifest.nav.find((n) => can(n.permission));
    if (first) {
      router.replace(`/${manifest.key}/${first.path}`);
      return <Loading />;
    }
    return (
      <AppShell>
        <Forbidden what={manifest.name} needs={manifest.nav.map((n) => n.permission)} />
      </AppShell>
    );
  }

  if (!can(entry.permission)) {
    return (
      <AppShell>
        <Forbidden what={`${manifest.name} — ${entry.label}`} needs={entry.permission} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {loadError ? (
        <Forbidden what={entry.label} needs={[]} />
      ) : Screen ? (
        <Screen params={rest} />
      ) : (
        <Loading />
      )}
    </AppShell>
  );
}
