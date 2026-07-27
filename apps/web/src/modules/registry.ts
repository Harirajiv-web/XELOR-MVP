import type { ModuleManifest } from "@spine/registry/manifest";
import { inventoryManifest } from "./inventory/manifest";

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
 */
export const INSTALLED_MODULES: readonly ModuleManifest[] = [inventoryManifest];

/** Sidebar order, then alphabetical — so adding a module never shuffles the others. */
export function orderedModules(): readonly ModuleManifest[] {
  return [...INSTALLED_MODULES].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function findModule(key: string): ModuleManifest | undefined {
  return INSTALLED_MODULES.find((m) => m.key === key);
}
