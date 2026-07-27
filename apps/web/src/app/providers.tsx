"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@spine/auth/session";
import { AccessProvider } from "@spine/access/permissions";

/**
 * The provider order is the dependency order, and it is not interchangeable: the session
 * has to exist before anything can ask what the user may do, because the answer comes from
 * an authenticated call.
 */
export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <SessionProvider>
      <AccessProvider>{children}</AccessProvider>
    </SessionProvider>
  );
}
