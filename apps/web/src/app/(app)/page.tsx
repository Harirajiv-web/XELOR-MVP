"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccess } from "@spine/access/permissions";
import { Empty } from "@spine/states";
import { orderedModules } from "@modules/registry";
import { moduleAvailability, visibleNav } from "@spine/registry/manifest";

/**
 * The front door. Sends the user to the first screen they can actually open.
 *
 * A dashboard would be the conventional answer and would be a worse one right now: an
 * empty dashboard is the most common way a new ERP makes a first impression of "there is
 * nothing in here". Landing on real data does not have that problem.
 *
 * The signed-in gate lives in `(app)/layout.tsx`, so by the time this renders the access
 * answer has already arrived.
 */
export default function Home(): React.JSX.Element {
  const router = useRouter();
  const { ready, can, isLicensed } = useAccess();

  useEffect(() => {
    if (!ready) return;
    for (const m of orderedModules()) {
      if (moduleAvailability(m, { isLicensed, can }) !== null) continue;
      const first = visibleNav(m, can)[0];
      if (first) {
        router.replace(`/${m.key}/${first.path}`);
        return;
      }
    }
  }, [ready, can, isLicensed, router]);

  return (
    <Empty
      title="Nothing is available to you yet"
      body="Your account is signed in, but no module is both licensed for this company and permitted for your role. Your administrator can grant you access."
    />
  );
}
