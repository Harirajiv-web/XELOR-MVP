"use client";

import { use } from "react";
import { DepartmentView } from "@spine/shell/department-view";

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
 *
 * The signed-in gate and the shell both moved to `(app)/layout.tsx`, so this file is now
 * only the part that is genuinely about departments.
 */
export default function DepartmentRoute({
  params,
}: {
  params: Promise<{ code: string }>;
}): React.JSX.Element {
  const { code } = use(params);
  return <DepartmentView code={code} />;
}
