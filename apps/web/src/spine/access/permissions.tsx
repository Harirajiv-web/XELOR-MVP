"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { AppError } from "../api/errors";
import { useSession } from "../auth/session";
import { INSTALLED_MODULES } from "@modules/registry";

const PUBLIC_DEMO_PERMISSIONS = [
  ...new Set(
    INSTALLED_MODULES.flatMap((module) => [
      ...module.nav.map((entry) => entry.permission),
      ...(module.signals ?? []).map((signal) => signal.permission),
      ...(module.alerts ?? []).map((alert) => alert.permission),
    ]),
  ),
  // The investor presenter is the isolated demo tenant's control-room operator. These
  // mutation permissions are still enforced again by the API against the seeded admin.
  "agentos.run.operate",
  "agentos.approval.decide",
  "aiops.killswitch.operate",
] as const;

const PUBLIC_DEMO_IDENTITY: Identity = {
  subject: "public-demo-presenter",
  tenantId: "0192a8c0-0000-7000-8000-000000000001",
  principal: "investor.demo",
  roles: [{ code: "public_demo", name: "Investor demo presenter" }],
  permissions: PUBLIC_DEMO_PERMISSIONS,
  licence: {
    plan: "Investor demonstration",
    modules: [...new Set(INSTALLED_MODULES.map((module) => module.licenceKey))],
    validFrom: "2026-08-01",
    validTo: "2099-12-31",
    enforcement: "presentation_only",
    expired: false,
  },
  organisation: { name: "Trishul Precision Components" },
};

/**
 * WHO THIS USER IS AND WHAT THEY MAY DO — one call, made once, at sign-in.
 *
 * THE CLIENT-SIDE CHECK IS NOT SECURITY, and it is worth saying plainly. It decides what
 * to DRAW. Every request is checked again by the API's guard against tenant-fenced tables,
 * and that check is the one that matters; if this file were deleted, or edited in a
 * browser's developer tools, nothing would become reachable — the screen would simply
 * render a button that returns 403.
 *
 * What it is for is dignity and clarity. Showing somebody a Payroll menu that refuses them
 * every time they click teaches them the software is broken. Offering an "Approve" button
 * to a person who cannot approve wastes a decision they were never allowed to make.
 *
 * It also carries the LICENCE, because two different facts both end with a hidden menu:
 * "your company did not buy Maintenance" and "you personally may not open Maintenance".
 * One is answered by a salesperson and the other by an administrator, and a user who
 * cannot tell them apart asks the wrong person.
 */

export interface Licence {
  plan: string;
  modules: readonly string[];
  validFrom: string;
  validTo: string;
  enforcement: string;
  expired: boolean;
}

export interface Identity {
  subject: string;
  tenantId: string;
  principal: string;
  roles: ReadonlyArray<{ code: string; name: string }>;
  permissions: readonly string[];
  licence: Licence | null;
  organisation: { name: string } | null;
}

interface AccessValue {
  ready: boolean;
  identity: Identity | null;
  permissions: ReadonlySet<string>;
  can: (permission: string) => boolean;
  canAll: (...permissions: string[]) => boolean;
  canAny: (...permissions: string[]) => boolean;
  /** Did this company buy the module? Separate question from "may this person open it". */
  isLicensed: (moduleKey: string) => boolean;
  licence: Licence | null;
  error: string | null;
  reload: () => void;
}

const AccessContext = createContext<AccessValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { status, isPublicDemo } = useSession();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (isPublicDemo) {
      setIdentity(PUBLIC_DEMO_IDENTITY);
      setError(null);
      setReady(true);
      return;
    }
    if (status !== "authenticated") {
      setIdentity(null);
      setReady(status === "anonymous");
      return;
    }
    let cancelled = false;
    setReady(false);
    void (async () => {
      try {
        const me = await api.get<Identity>("/me");
        if (cancelled) return;
        setIdentity(me);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        // Failing CLOSED. An identity call that failed leaves us not knowing what this
        // person may do, and the safe reading of "I don't know" is "nothing" — showing a
        // full menu on a failed permission lookup is how a stores clerk ends up staring at
        // a payroll screen that then refuses them.
        setIdentity(null);
        setError(e instanceof AppError ? e.message : "Could not load your access.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, isPublicDemo, nonce]);

  const value = useMemo<AccessValue>(() => {
    const permissions = new Set(identity?.permissions ?? []);
    const licensed = new Set(identity?.licence?.modules ?? []);
    const can = (p: string): boolean => permissions.has(p);
    return {
      ready,
      identity,
      permissions,
      can,
      canAll: (...ps) => ps.every(can),
      canAny: (...ps) => ps.some(can),
      // No licence row at all means an unrestricted install (a developer machine, an
      // on-premise deployment with no entitlement file). Hiding every module in that case
      // would make the product look empty rather than unlicensed.
      isLicensed: (key) => (identity?.licence ? licensed.has(key) : true),
      licence: identity?.licence ?? null,
      error,
      reload: () => setNonce((n) => n + 1),
    };
  }, [identity, ready, error]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used inside <AccessProvider>.");
  return ctx;
}

/**
 * Render children only when every named permission is held.
 *
 * Deny-by-default: while access is still loading, nothing renders. Showing a control
 * optimistically and retracting it a moment later is worse than a short wait — the user
 * has already begun moving toward it.
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: string | readonly string[];
  children: ReactNode;
  fallback?: ReactNode;
}): React.JSX.Element {
  const { can, ready } = useAccess();
  if (!ready) return <></>;
  const list = Array.isArray(permission) ? permission : [permission as string];
  return <>{list.every(can) ? children : fallback}</>;
}
