"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@spine/auth/session";
import { ErrorState, Loading } from "@spine/states";

/**
 * Where Keycloak sends the browser back after sign-in.
 *
 * The exchange runs exactly once. React's strict mode deliberately double-invokes effects
 * in development, and an authorisation code is single-use — without the guard the second
 * attempt fails and the user sees "sign-in failed" on a sign-in that actually worked.
 */
function Callback(): React.JSX.Element {
  const router = useRouter();
  const { completeSignIn } = useSession();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Read the callback URL only after hydration. `useSearchParams` forces this otherwise
    // deterministic page through Next's client-render bailout boundary; a fast local token
    // exchange can replace that boundary while React is still hydrating it, intermittently
    // producing a root-level hydration mismatch. The first server and client renders now
    // both contain the same loading state, and the one-shot effect owns the browser-only URL.
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      setError(params.get("error_description") ?? errorParam);
      return;
    }
    const code = params.get("code");
    if (!code) {
      setError("Sign-in did not return an authorisation code.");
      return;
    }

    void completeSignIn(code, params.get("state"))
      .then((returnTo) => router.replace(returnTo || "/"))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [completeSignIn, router]);

  if (error) {
    return (
      <ErrorState
        error={new Error(error)}
        onRetry={() => {
          window.location.assign("/");
        }}
      />
    );
  }
  return <Loading label="Completing sign-in…" />;
}

export default function CallbackPage(): React.JSX.Element {
  return <Callback />;
}
