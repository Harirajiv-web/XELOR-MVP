"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const params = useSearchParams();
  const router = useRouter();
  const { completeSignIn } = useSession();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

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
  }, [params, completeSignIn, router]);

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
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<Loading label="Completing sign-in…" />}>
      <Callback />
    </Suspense>
  );
}
