"use client";

import { useEffect, type ReactNode } from "react";
import { useSession } from "@spine/auth/session";

/**
 * THE VOID HAS NO SHELL.
 *
 * Its own route group precisely so that it does not inherit `(app)/layout.tsx` — no
 * sidebar, no topbar, no copilot rail, no menus, nothing. The brief forbids all of it on
 * the arrival stance, and the reliable way to honour that is structural: this branch of
 * the tree cannot accidentally grow chrome later, because there is none above it to
 * inherit.
 *
 * It gates on being SIGNED IN and nothing else. The permission call is deliberately not
 * awaited here — see `Gateway` for why the first frame after sign-in must not wait on a
 * round trip.
 *
 * The loading state is the void itself rather than the product's spinner. A white panel
 * flashing before a near-black scene is the single cheapest way to spoil the arrival, and
 * it would happen on every sign-in.
 */
export default function VoidLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const { status, signIn } = useSession();

  useEffect(() => {
    if (status === "anonymous") signIn("/");
  }, [status, signIn]);

  if (status !== "authenticated") {
    return (
      <div className="grid h-screen w-screen place-items-center bg-[#04060c]" style={{ colorScheme: "dark" }}>
        <p className="text-[11px] tracking-[0.3em] text-[#48607a] uppercase">
          {status === "anonymous" ? "Signing you in" : "Waking"}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
