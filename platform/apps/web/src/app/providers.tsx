"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@spine/auth/session";
import { AccessProvider } from "@spine/access/permissions";
import { ThemeProvider } from "@spine/theme/theme";

/**
 * The provider order is the dependency order, and it is not interchangeable: the session
 * has to exist before anything can ask what the user may do, because the answer comes from
 * an authenticated call.
 *
 * The theme sits OUTSIDE both, because how the page looks must not wait on who is looking
 * at it. The sign-in redirect, the loading state and any error on the way in are all
 * themed correctly this way — and those are the screens a first-time user sees first.
 */
export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <ThemeProvider>
      <SessionProvider>
        <AccessProvider>{children}</AccessProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
