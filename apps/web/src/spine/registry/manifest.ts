import type { ComponentType } from "react";

/**
 * WHAT A MODULE DECLARES ABOUT ITSELF.
 *
 * The point of this file is that a module folder is REMOVABLE. Delete
 * `src/modules/maintenance/`, delete its line from `registry.ts`, and the application
 * still compiles and runs with one fewer item in the sidebar. Nothing else refers to it —
 * no import, no route file, no navigation array somewhere else that would now point at a
 * folder that is gone.
 *
 * Three rules make that true, and each is enforced rather than remembered:
 *
 *   1. A MODULE MAY IMPORT FROM `spine/` AND FROM ITSELF, NEVER FROM ANOTHER MODULE.
 *      `eslint-plugin-boundaries` fails the build otherwise — the same tool that already
 *      keeps the sixteen backend modules apart. Without this, removing Maintenance breaks
 *      Production, and "removable" quietly stops being true while everybody still says it.
 *   2. NAVIGATION IS ASSEMBLED, NEVER WRITTEN DOWN. The sidebar is the registry filtered by
 *      permissions and by licence. There is no menu file to forget to update.
 *   3. THE REGISTRY AND THE FOLDERS MUST AGREE. `pnpm module-check` fails if a folder has
 *      no registry entry or an entry has no folder — the same drift that let 59 backend
 *      endpoints answer 403 to everybody for weeks.
 *
 * The three gates are deliberately independent and answer different questions:
 *   INSTALLED?  — is the code here at all (registry)
 *   LICENSED?   — did this company buy it (licence_record.modules)
 *   PERMITTED?  — may this person open it (their permissions)
 * A user who cannot see Maintenance should be able to find out WHICH of those it was,
 * because the three send them to three different people.
 */

export interface NavEntry {
  /** Shown in the sidebar. */
  label: string;
  /** URL segment under the module: /inventory/<path>. */
  path: string;
  /** The permission required to see AND open this entry. */
  permission: string;
  /** Lucide icon name, resolved by the shell. */
  icon?: string;
  /** Hidden from the sidebar but still routable — for detail screens. */
  hidden?: boolean;
}

export interface ScreenProps {
  /** Path segments after the module and screen, e.g. a document number. */
  params: readonly string[];
}

export interface ModuleManifest {
  /** Stable key. Also the first URL segment: /inventory/stock. */
  key: string;
  /** Shown to users. */
  name: string;
  /** One line: what this module is for. Shown when it is locked or unlicensed. */
  summary: string;
  /** The owning department from NAME.md — HEXA, MICA, SPAR, AXLE, KILN, RASP, ONYX. */
  department: string;
  /** Lucide icon name for the sidebar group. */
  icon: string;
  /**
   * The key in `licence_record.modules` that entitles this module. Usually equal to `key`;
   * separate because a licence may bundle several modules under one sold name.
   */
  licenceKey: string;
  /** Sidebar order. Lower first. */
  order: number;
  nav: readonly NavEntry[];
  /** Screen path → the component. Lazy so an unopened module costs nothing to load. */
  screens: Readonly<Record<string, () => Promise<{ default: ComponentType<ScreenProps> }>>>;
}

/** Every permission the manifest mentions — used by the consistency check. */
export function manifestPermissions(m: ModuleManifest): readonly string[] {
  return [...new Set(m.nav.map((n) => n.permission))];
}

/** The nav entries this person can actually open. Hidden entries never appear. */
export function visibleNav(
  m: ModuleManifest,
  can: (permission: string) => boolean,
): readonly NavEntry[] {
  return m.nav.filter((n) => !n.hidden && can(n.permission));
}

/**
 * Why a module is not available to this user, or null when it is.
 *
 * Returned as a reason rather than a boolean because the reasons are not
 * interchangeable — one is fixed by an administrator, one by a salesperson, and one by an
 * engineer. "You do not have access" collapses all three and helps nobody.
 */
export type UnavailableReason =
  | { kind: "not_licensed"; moduleName: string }
  | { kind: "no_permission"; moduleName: string; needs: readonly string[] }
  | null;

export function moduleAvailability(
  m: ModuleManifest,
  opts: { isLicensed: (key: string) => boolean; can: (permission: string) => boolean },
): UnavailableReason {
  if (!opts.isLicensed(m.licenceKey)) {
    return { kind: "not_licensed", moduleName: m.name };
  }
  const openable = m.nav.filter((n) => opts.can(n.permission));
  if (openable.length === 0) {
    return { kind: "no_permission", moduleName: m.name, needs: manifestPermissions(m) };
  }
  return null;
}
