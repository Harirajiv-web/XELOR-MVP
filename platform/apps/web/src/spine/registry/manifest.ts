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
  /** Every permission required to see AND open this entry. */
  permission: string | readonly string[];
  /** Lucide icon name, resolved by the shell. */
  icon?: string;
  /** Hidden from the sidebar but still routable — for detail screens. */
  hidden?: boolean;
  /**
   * WHAT THIS SCREEN SHOWS, in plain language, for somebody who has never seen it.
   *
   * Required on every visible entry and checked by `pnpm module-check`, because the screen
   * that gets forgotten will be somebody's first. Most people arriving here have run this
   * factory on paper and Tally; two sentences saying what a screen actually contains
   * prevents the most expensive category of misunderstanding, which is a confident person
   * reading the wrong thing.
   *
   * The house style, learned from what went wrong in review:
   *   - Say what is IN it, then where the numbers CAME FROM. "Live balances, calculated
   *     from the stock ledger" tells a storekeeper more than any description of features.
   *   - Say what it will NOT let you do, when that is the surprising part. "You cannot
   *     type a stock figure here; stock only moves through a receipt or an issue."
   *   - No feature words. Not "a comprehensive view of inventory across the enterprise".
   *   - Never a promise the screen does not keep.
   */
  description?: string;
}

export interface ScreenProps {
  /** Path segments after the module and screen, e.g. a document number. */
  params: readonly string[];
}

/**
 * ONE HEADLINE NUMBER A MODULE IS WILLING TO STAND BEHIND.
 *
 * The department dashboard shows live figures from every module underneath it, which means
 * something has to know that Inventory's headline is a count of stock lines and Accounts'
 * is whether the ledger foots. That knowledge belongs to the MODULE — the spine must not
 * grow a table of sixteen endpoints, because then removing a module would leave a dead
 * entry in the shell and "removable" would quietly stop being true.
 *
 * So a module declares its own signals and the dashboard renders whatever it is given. A
 * module with none simply shows its screens; a module that is deleted takes its signals
 * with it and nothing else changes.
 *
 * `permission` is checked BEFORE the request is made. A tile the viewer may not see is
 * never fetched and never drawn — no empty card, no 403 in the console, no advertisement
 * for something they cannot open.
 */
export interface ModuleSignal {
  /** Short label for the tile. "Stock lines", "Open orders", "Debits = credits". */
  label: string;
  /** The permission the viewer must hold. Unheld → the tile is not fetched at all. */
  permission: string;
  /** API path, relative to `/api/v1`. */
  path: string;
  /** Query parameters, if the endpoint needs them. */
  query?: Record<string, string | number | boolean>;
  /**
   * Turn the response into something displayable. Runs in a try/catch — a signal that
   * throws is dropped rather than taking the dashboard down with it, because a decorative
   * tile must never be able to break the page it decorates.
   */
  reduce: (data: unknown) => SignalValue | null;
}

export interface SignalValue {
  /** The number or short string to show large. Already formatted. */
  value: string;
  /** One short line under it: what the number means, or what it is out of. */
  hint?: string;
  /** Colour intent. Follows the status vocabulary, never invents a new one. */
  tone?: "neutral" | "ok" | "warn" | "bad";
  /** 0–1. Draws a proportion bar under the value when present. */
  fraction?: number;
  /**
   * A handful of values to draw as a chart.
   *
   * `tone` is the MODULE's to set, never the chart's to guess. A severity breakdown whose
   * colours were assigned by array position would paint "High" green the moment a bucket
   * was empty — colour would then be carrying meaning the data never gave it, which is
   * worse than no colour at all. A series with no tones is drawn in a neutral ramp.
   */
  series?: readonly {
    label: string;
    value: number;
    display?: string;
    tone?: "neutral" | "ok" | "warn" | "bad";
  }[];
}

/* ==========================================================================
   THINGS SOMEBODY NEEDS TO KNOW ABOUT NOW.
   ==========================================================================

   A machine that has stopped. A purchase order that will not arrive before the line runs
   out. A dispatch promised for today that has not moved. These are the facts a plant
   manager currently learns from a phone call, and the whole pitch of this product is that
   the system notices first.

   Two rules make this trustworthy rather than noisy, and both are structural:

   1. THE VERDICT IS COMPUTED IN CODE; ONLY THE WORDING IS WRITTEN DOWN.
      `reduce` runs over the module's own rows and decides — with arithmetic, against a
      date, over a real status column — whether there is a problem. No model is asked
      whether something is late. A language model asked to judge will sometimes say a thing
      is fine because the sentence flowed better, and an alert that is wrong in the
      reassuring direction is worse than no alert at all. The model's job in this product is
      to phrase and to explain, never to decide, and DECISIONS-V2 §4 says exactly that.

   2. EVERY ALERT CARRIES ITS EVIDENCE AND SOMEWHERE TO GO.
      `evidence` is the row that caused it, named. `href` is the screen where a person can
      act. An alert that cannot be checked and cannot be acted on is an interruption
      wearing a warning's clothes.

   As with signals, the KNOWLEDGE LIVES IN THE MODULE. The spine holds no table of "things
   that go wrong in a factory" — Maintenance knows what a breakdown is, Purchase knows what
   late means for a delivery, and deleting either takes its alerts with it.
   ========================================================================== */

export interface ModuleAlert {
  /**
   * Stable across polls for the SAME underlying fact — usually the document number.
   * This is what lets "I have seen this" survive a refresh. An id containing a timestamp
   * would make every poll produce brand-new alerts, and a bell that re-announces the same
   * stopped machine every sixty seconds gets muted within a day, taking the real ones with
   * it.
   */
  id: string;
  /**
   * Three levels, because a person can hold three in their head:
   *   critical  — production is stopped or a statutory deadline has passed
   *   urgent    — it will stop, or become late, within the working day
   *   attention — worth knowing before it becomes one of the other two
   */
  severity: "critical" | "urgent" | "attention";
  /** The fact, in one line. "CNC-04 has been down for 3 h 20 m." */
  title: string;
  /** The consequence, in one line. Why this is on screen rather than in a report. */
  body: string;
  /** Where to go and deal with it, e.g. `/maintenance/breakdowns`. */
  href?: string;
  /** ISO timestamp of the underlying event, not of the poll. */
  at?: string;
  /**
   * The rows this was read from, named so it can be checked.
   * "Breakdown BRK-2026-0041, reported 20-Jul-2026 06:12."
   */
  evidence?: string;
}

export interface ModuleAlertSource {
  /** Checked BEFORE the request. Never poll on behalf of someone who may not look. */
  permission: string;
  /** API path, relative to `/api/v1`. */
  path: string;
  query?: Record<string, string | number | boolean>;
  /**
   * Zero or more alerts from this response. Runs in a try/catch: a source that throws is
   * dropped, because a warning system that can take the application down with it is a
   * larger hazard than the thing it was watching for.
   */
  reduce: (data: unknown) => readonly ModuleAlert[];
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
  /**
   * Live figures for the department dashboard. Optional — a module without them still
   * appears, showing what it is and what screens it has.
   */
  signals?: readonly ModuleSignal[];
  /**
   * What this module watches for on everybody's behalf. Optional — a module with nothing
   * time-critical to say should say nothing.
   */
  alerts?: readonly ModuleAlertSource[];
}

/** Every permission the manifest mentions — used by the consistency check. */
export function manifestPermissions(m: ModuleManifest): readonly string[] {
  return [
    ...new Set(
      m.nav.flatMap((entry) =>
        Array.isArray(entry.permission)
          ? [...entry.permission]
          : [entry.permission as string],
      ),
    ),
  ];
}

export function navEntryPermissions(entry: NavEntry): readonly string[] {
  return Array.isArray(entry.permission)
    ? entry.permission
    : [entry.permission as string];
}

export function canOpenNavEntry(
  entry: NavEntry,
  can: (permission: string) => boolean,
): boolean {
  return navEntryPermissions(entry).every(can);
}

/** The nav entries this person can actually open. Hidden entries never appear. */
export function visibleNav(
  m: ModuleManifest,
  can: (permission: string) => boolean,
): readonly NavEntry[] {
  return m.nav.filter((entry) => !entry.hidden && canOpenNavEntry(entry, can));
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
  const openable = m.nav.filter((entry) => canOpenNavEntry(entry, opts.can));
  if (openable.length === 0) {
    return { kind: "no_permission", moduleName: m.name, needs: manifestPermissions(m) };
  }
  return null;
}
