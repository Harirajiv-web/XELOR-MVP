"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authConfig, endpoints, publicDemoEnabled, TENANT_LABELS } from "./config";
import { beginPkce, clearPkce, finishPkce } from "./pkce";
import { configureApi } from "../api/client";

/**
 * THE SESSION.
 *
 * Holds the access token, refreshes it before it expires, and exposes who the user is.
 *
 * WHERE THE TOKEN LIVES, and why it is worth being explicit: in memory, mirrored into
 * `sessionStorage` so a page reload does not throw the user back to a login screen. That
 * is a deliberate middle position, not an oversight. The genuinely safe design keeps the
 * token out of JavaScript's reach entirely — a small server-side session that holds it and
 * attaches it to proxied calls, so a cross-site scripting bug cannot read it. That is more
 * moving parts than this stage of the product warrants, and the honest thing is to say so
 * here rather than to imply the current arrangement is beyond criticism. It is the item to
 * revisit before a real customer's data is behind it.
 */

export interface SessionUser {
  subject: string;
  username: string;
  displayName: string;
  email: string | null;
  /** Keycloak groups, minus the leading slash. Maps to a tenant in the API. */
  groups: readonly string[];
  tenantKey: string | null;
  tenantLabel: string | null;
}

type Status = "loading" | "authenticated" | "anonymous" | "error";

interface SessionValue {
  status: Status;
  user: SessionUser | null;
  error: string | null;
  /** True only for the deliberately sign-in-free investor presentation build. */
  isPublicDemo: boolean;
  signIn: (returnTo?: string, options?: { force?: boolean }) => void;
  signOut: () => void;
  /** Completes the redirect. Called only by the /callback route. */
  completeSignIn: (code: string, state: string | null) => Promise<string>;
}

const SessionContext = createContext<SessionValue | null>(null);

const TOKEN_KEY = "aikyantra.session";
const ROOT_ENTRY_HANDOFF_KEY = "aikyantra.auth.root-entry-handoff";

const PUBLIC_DEMO_USER: SessionUser = {
  subject: "public-demo-presenter",
  username: "investor.demo",
  displayName: "Investor Demo",
  email: null,
  groups: ["trishul", "public-demo"],
  tenantKey: "trishul",
  tenantLabel: TENANT_LABELS.trishul ?? "3S Precision Parts",
};

/**
 * React development mode can mount an entry layout twice. Starting PKCE twice is not merely
 * wasteful: the second attempt replaces the verifier in sessionStorage while the browser may
 * already be following the first redirect, so correct credentials fail the state check on
 * the callback. This module-level single flight survives that diagnostic remount and resets
 * naturally when navigation loads the Keycloak page.
 */
let signInRedirectStarted = false;

/**
 * The authorization code is single-use. A callback component can genuinely remount while a
 * development server warms a route, so the exchange must outlive any one component instance.
 * Every caller awaits the same promise and Keycloak sees the code exactly once.
 */
let signInCompletion:
  | {
      code: string;
      promise: Promise<{ session: StoredSession; returnTo: string }>;
    }
  | null = null;

/**
 * The callback leaves a one-use receipt when a root-entry sign-in has just succeeded.
 * Without it, the root route would immediately demand another sign-in and create a loop.
 */
export function consumeRootEntryHandoff(): boolean {
  try {
    const handoff = sessionStorage.getItem(ROOT_ENTRY_HANDOFF_KEY) === "complete";
    if (handoff) sessionStorage.removeItem(ROOT_ENTRY_HANDOFF_KEY);
    return handoff;
  } catch {
    return false;
  }
}

interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch millis at which the access token stops being accepted. */
  expiresAt: number;
}

function readStored(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return typeof s?.accessToken === "string" ? s : null;
  } catch {
    return null;
  }
}

/** Decode a JWT payload WITHOUT verifying it. */
function readClaims(token: string): Record<string, unknown> {
  // Verification is the API's job and it does it against Keycloak's public keys. Doing it
  // here would prove nothing anyway: code that decides what to trust cannot also be the
  // code an attacker controls. This is used only to draw a name in the corner.
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function userFromToken(token: string): SessionUser {
  const c = readClaims(token);
  const groups = (Array.isArray(c.groups) ? (c.groups as string[]) : []).map((g) =>
    g.replace(/^\//, ""),
  );
  const tenantKey = groups.find((g) => g in TENANT_LABELS) ?? null;
  return {
    subject: typeof c.sub === "string" ? c.sub : "",
    username: typeof c.preferred_username === "string" ? c.preferred_username : "",
    displayName:
      (typeof c.name === "string" && c.name) ||
      (typeof c.preferred_username === "string" ? c.preferred_username : "Signed in"),
    email: typeof c.email === "string" ? c.email : null,
    groups,
    tenantKey,
    tenantLabel: tenantKey ? (TENANT_LABELS[tenantKey] ?? tenantKey) : null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A ref, not state: the API client reads the token on every request and must never see a
  // stale closure. A render-cycle behind is an unexplainable 401.
  const sessionRef = useRef<StoredSession | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    sessionRef.current = null;
    sessionStorage.removeItem(TOKEN_KEY);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (publicDemoEnabled) {
      setUser(PUBLIC_DEMO_USER);
      setStatus("authenticated");
      return;
    }
    setUser(null);
    setStatus("anonymous");
  }, []);

  const apply = useCallback(
    (s: StoredSession) => {
      sessionRef.current = s;
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s));
      setUser(userFromToken(s.accessToken));
      setStatus("authenticated");
      scheduleRefresh(s);
    },
    // Empty deps deliberately: `scheduleRefresh` is a plain function declaration in this
    // component body and the setters are stable, so `apply` never needs to be re-created.
    // Recreating it would restart the refresh timer on every render.
    [],
  );

  const refresh = useCallback(async (): Promise<void> => {
    const current = sessionRef.current;
    if (!current?.refreshToken) {
      clear();
      return;
    }
    try {
      const res = await fetch(endpoints.token(), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: authConfig.clientId,
          refresh_token: current.refreshToken,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };
      apply({
        accessToken: j.access_token,
        refreshToken: j.refresh_token ?? current.refreshToken,
        expiresAt: Date.now() + j.expires_in * 1000,
      });
    } catch {
      // A refresh that fails means the session is genuinely over — the refresh token was
      // revoked, expired, or the realm restarted. Signing the user out is the honest
      // outcome; retrying in a loop just produces a screen that never loads.
      clear();
    }
  }, [apply, clear]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  function scheduleRefresh(s: StoredSession): void {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    // 60 seconds of headroom: enough for a slow office connection to complete the refresh
    // before the old token is refused mid-action.
    const delay = Math.max(5_000, s.expiresAt - Date.now() - 60_000);
    refreshTimer.current = setTimeout(() => void refreshRef.current(), delay);
  }

  const signIn = useCallback(
    (returnTo?: string, options?: { force?: boolean }) => {
      if (publicDemoEnabled) {
        setError(null);
        setUser(PUBLIC_DEMO_USER);
        setStatus("authenticated");
        return;
      }
      if (signInRedirectStarted) return;
      signInRedirectStarted = true;
      signInCompletion = null;
      if (options?.force) {
        // Root entry is intentionally a fresh authentication ceremony. Clear the local
        // token as well as asking Keycloak to ignore its SSO shortcut.
        clear();
      }
      void (async () => {
        const target = returnTo ?? window.location.pathname + window.location.search;
        const { challenge, state } = await beginPkce(target);
        const url = new URL(endpoints.authorize());
        url.searchParams.set("client_id", authConfig.clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", authConfig.scope);
        url.searchParams.set("redirect_uri", window.location.origin + authConfig.redirectPath);
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "S256");
        url.searchParams.set("state", state);
        if (options?.force) url.searchParams.set("prompt", "login");
        window.location.assign(url.toString());
      })().catch(() => {
        // A browser or crypto failure happens before navigation, so allow an explicit retry
        // and show a useful state instead of leaving the gateway saying "Signing you in".
        signInRedirectStarted = false;
        setError("Sign-in could not start. Please try again.");
        setStatus("error");
      });
    },
    [clear],
  );

  const signOut = useCallback(() => {
    if (publicDemoEnabled) {
      window.location.assign("/");
      return;
    }
    const refreshToken = sessionRef.current?.refreshToken;
    clear();
    const url = new URL(endpoints.logout());
    url.searchParams.set("client_id", authConfig.clientId);
    url.searchParams.set("post_logout_redirect_uri", window.location.origin);
    // Ending the Keycloak session too, not just ours. Otherwise "sign out" followed by
    // "sign in" silently returns the same person without asking — which looks like the
    // sign-out did nothing, and on a shared factory-office machine, it effectively didn't.
    if (refreshToken) {
      void fetch(endpoints.logout(), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: authConfig.clientId,
          refresh_token: refreshToken,
        }),
      }).catch(() => {});
    }
    window.location.assign(url.toString());
  }, [clear]);

  const completeSignIn = useCallback(
    async (code: string, state: string | null): Promise<string> => {
      if (publicDemoEnabled) return "/";
      if (!signInCompletion || signInCompletion.code !== code) {
        const { verifier, returnTo } = finishPkce(state);
        signInCompletion = {
          code,
          promise: exchangeAuthorizationCode(code, verifier, returnTo),
        };
      }
      try {
        const completed = await signInCompletion.promise;
        clearPkce(state);
        apply(completed.session);
        if (completed.returnTo === "/") {
          sessionStorage.setItem(ROOT_ENTRY_HANDOFF_KEY, "complete");
        }
        return completed.returnTo;
      } catch (cause) {
        // A failed request may be retried from the same callback while its tab-scoped PKCE
        // state is still available. A fresh callback code always starts a fresh flight.
        if (signInCompletion?.code === code) signInCompletion = null;
        throw cause;
      }
    },
    [apply],
  );

  // Wire the API client once, and restore any session left by a page reload.
  useEffect(() => {
    if (publicDemoEnabled) {
      configureApi({
        getToken: () => null,
        // A public demo has no login ceremony to repeat. The API error remains visible on
        // the relevant screen without throwing the visitor back out of the product.
        onUnauthenticated: () => {},
      });
      setError(null);
      setUser(PUBLIC_DEMO_USER);
      setStatus("authenticated");
      return;
    }

    configureApi({
      getToken: () => sessionRef.current?.accessToken ?? null,
      onUnauthenticated: () => clear(),
    });

    const stored = readStored();
    if (!stored) {
      setStatus("anonymous");
      return;
    }
    if (stored.expiresAt <= Date.now()) {
      sessionRef.current = stored;
      void refreshRef.current();
      return;
    }
    apply(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      error,
      isPublicDemo: publicDemoEnabled,
      signIn,
      signOut,
      completeSignIn,
    }),
    [status, user, error, signIn, signOut, completeSignIn],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>.");
  return ctx;
}

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  returnTo: string,
): Promise<{ session: StoredSession; returnTo: string }> {
  const request = async (attempt: number): Promise<Response> => {
    try {
      const response = await fetch(endpoints.token(), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: authConfig.clientId,
          code,
          redirect_uri: window.location.origin + authConfig.redirectPath,
          code_verifier: verifier,
        }),
      });
      if (attempt === 0 && (response.status === 408 || response.status === 429 || response.status >= 500)) {
        await delay(250);
        return request(1);
      }
      return response;
    } catch (cause) {
      if (attempt === 0) {
        await delay(250);
        return request(1);
      }
      throw cause;
    }
  };

  const res = await request(0);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sign-in failed (${res.status}). ${body.slice(0, 200)}`);
  }
  const payload = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    session: {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      expiresAt: Date.now() + payload.expires_in * 1000,
    },
    returnTo,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
