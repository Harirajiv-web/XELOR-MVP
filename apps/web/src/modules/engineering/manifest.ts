import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";

/**
 * How many BOM versions this row has, read defensively.
 *
 * `reduce` receives `unknown` — the response is whatever the network actually returned, not
 * whatever the type says it should have. Every access is guarded and anything unexpected
 * counts as zero rather than throwing, because a tile that throws takes its own card's
 * figures down with it.
 */
function bomCountOf(row: unknown): number {
  if (row === null || typeof row !== "object") return 0;
  const n = (row as { bomCount?: unknown }).bomCount;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * The item page, narrowed. `GET /engineering/items` answers the platform's `CursorPage<T>`
 * envelope — `{ items, nextCursor }` — but a bare array is accepted too so a shape change
 * degrades to a slightly different number rather than to a missing tile.
 *
 * Returns null on anything else, which drops the tile silently. That is the correct
 * outcome: a decorative figure must never be able to break the page it decorates.
 */
function itemPage(data: unknown): { rows: readonly unknown[]; truncated: boolean } | null {
  if (data === null || typeof data !== "object") return null;
  if (Array.isArray(data)) return { rows: data, truncated: false };
  const envelope = data as { items?: unknown; nextCursor?: unknown };
  if (!Array.isArray(envelope.items)) return null;
  return {
    rows: envelope.items,
    truncated: typeof envelope.nextCursor === "string" && envelope.nextCursor.length > 0,
  };
}

/**
 * ENGINEERING (AXLE, Module 12).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 */
export const engineeringManifest: ModuleManifest = {
  key: "engineering",
  name: "Engineering",
  summary: "The item master and the bills of material every other module hangs off.",
  department: "AXLE",
  icon: "Component",
  licenceKey: "engineering",
  order: 15,
  nav: [
    {
      label: "Items",
      path: "items",
      permission: "engineering.item.read",
      icon: "Package",
    },
    {
      // There is no list endpoint for bills of material — only `GET /engineering/boms/:id` —
      // so a sidebar entry would open a screen with nothing to ask for. Registered as a
      // hidden route so the URL works when something hands over a BOM id; a route nobody
      // declared 404s in a way indistinguishable from a route that was deleted.
      label: "Bill of material",
      path: "bom",
      permission: "engineering.bom.read",
      icon: "ListTree",
      hidden: true,
    },
  ],
  screens: {
    items: () => import("./screens/items"),
    bom: () => import("./screens/bom"),
  },
  /**
   * TWO FIGURES, BOTH OFF THE ITEM MASTER — the only list endpoint this module has.
   *
   * The second one is the interesting one. "12 of 18 items have a bill of material" says
   * what kind of factory this is in a single line: a job shop that machines most of what it
   * ships reads very differently from an assembler that buys nearly everything in. Both come
   * from `GET /engineering/items`, which is the same request the Items screen makes, so the
   * dashboard cannot show a number the screen would disagree with.
   *
   * One page of a hundred, deliberately: the endpoint is keyset-paged and there is no count
   * endpoint, so the honest thing is to read one page and SAY when there are more rather
   * than walk the cursor to make a headline look complete.
   */
  signals: [
    {
      label: "Items",
      permission: "engineering.item.read",
      path: "/engineering/items",
      query: { limit: 100 },
      reduce: (data): SignalValue | null => {
        const page = itemPage(data);
        if (!page) return null;
        return {
          value: String(page.rows.length),
          hint: page.truncated
            ? "first 100 loaded — there are more"
            : page.rows.length === 0
              ? "the item master is empty"
              : "registered in the item master",
          tone: "neutral",
        };
      },
    },
    {
      label: "Made here",
      permission: "engineering.item.read",
      path: "/engineering/items",
      query: { limit: 100 },
      reduce: (data): SignalValue | null => {
        const page = itemPage(data);
        // A proportion of nothing is not a small proportion, it is not a proportion. No
        // items means no tile rather than a bar sitting at zero.
        if (!page || page.rows.length === 0) return null;
        const withBom = page.rows.filter((r) => bomCountOf(r) > 0).length;
        return {
          value: String(withBom),
          hint: `of ${page.rows.length} items have a bill of material — the rest are bought`,
          tone: "neutral",
          fraction: withBom / page.rows.length,
        };
      },
    },
  ],
};
