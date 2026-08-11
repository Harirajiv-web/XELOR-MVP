import type { ModuleManifest } from "@spine/registry/manifest";

import { copilotManifest } from "./copilot/manifest";
import { generalManifest } from "./general/manifest";
import { engineeringManifest } from "./engineering/manifest";
import { purchaseManifest } from "./purchase/manifest";
import { inventoryManifest } from "./inventory/manifest";
import { planningManifest } from "./planning/manifest";
import { salesManifest } from "./sales/manifest";
import { productionManifest } from "./production/manifest";
import { cspManifest } from "./csp/manifest";
import { qualityManifest } from "./quality/manifest";
import { maintenanceManifest } from "./maintenance/manifest";
import { hrmManifest } from "./hrm/manifest";
import { accountsManifest } from "./accounts/manifest";
import { expenditureManifest } from "./expenditure/manifest";
import { workingCapitalManifest } from "./working-capital/manifest";
import { aiopsManifest } from "./aiops/manifest";
import { administrationManifest } from "./administration/manifest";
import { integrationManifest } from "./integration/manifest";
import { agentosManifest } from "./agentos/manifest";
import { fulfilmentManifest } from "./fulfilment/manifest";
import { aiControlManifest } from "./aicontrol/manifest";
import { managedServicesManifest } from "./managed-services/manifest";
import { platformHealthManifest } from "./platform-health/manifest";

/**
 * THE INSTALLED MODULES. This list is the whole of "which modules does this build contain".
 *
 * TO REMOVE A MODULE: delete its folder under `src/modules/`, delete its import and its
 * entry below. That is the complete procedure. `pnpm module-check` fails the build if a
 * folder exists without an entry or an entry without a folder, so the two cannot drift
 * apart quietly — which is exactly what happened on the backend, where three separate
 * lists of permissions disagreed for weeks and 59 endpoints answered 403 to everybody.
 *
 * An explicit list rather than a directory scan, on purpose. A glob would let you delete
 * the folder alone, and costs the thing that makes this maintainable: with an import, a
 * missing or misspelled module is a COMPILE error naming the file. With a glob it is a
 * runtime surprise, and the sidebar simply has one fewer item than somebody expected.
 *
 * Being in this list means the code is HERE. It does not mean anybody can see it — the
 * licence decides whether the company bought it, and permissions decide whether this
 * person may open it. Three independent gates, three different people who can change them.
 *
 * Twenty-three installed modules span the departmental systems of record plus the shared
 * intelligence, service-assurance and platform-health surfaces. The array below is the
 * executable inventory; keep this explanation deliberately free of a second hand-written
 * module list so adding a module cannot make the architecture comment lie again.
 *
 * Listed in sidebar order for readability only; `orderedModules()` is what actually sorts.
 */
export const INSTALLED_MODULES: readonly ModuleManifest[] = [
  copilotManifest,
  generalManifest,
  engineeringManifest,
  purchaseManifest,
  inventoryManifest,
  planningManifest,
  salesManifest,
  productionManifest,
  cspManifest,
  qualityManifest,
  maintenanceManifest,
  hrmManifest,
  accountsManifest,
  expenditureManifest,
  workingCapitalManifest,
  agentosManifest,
  fulfilmentManifest,
  aiopsManifest,
  aiControlManifest,
  managedServicesManifest,
  platformHealthManifest,
  administrationManifest,
  integrationManifest,
];

/** Sidebar order, then alphabetical — so adding a module never shuffles the others. */
export function orderedModules(): readonly ModuleManifest[] {
  return [...INSTALLED_MODULES].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  );
}

export function findModule(key: string): ModuleManifest | undefined {
  return INSTALLED_MODULES.find((m) => m.key === key);
}
