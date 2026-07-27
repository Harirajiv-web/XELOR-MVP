/**
 * Engineering's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * The field names below are copied from `apps/api/src/modules/engineering/engineering.service.ts`
 * rather than inferred. A guessed field name renders an em dash and looks like missing data,
 * which is the one failure mode a master-data screen must never have.
 */

/**
 * One row of the item master. `GET /engineering/items` is cursor-paged and answers the
 * platform's `CursorPage<T>` envelope — `{ items, nextCursor }` — which `useCursorList`
 * reads directly, so the screen never sees the envelope at all.
 */
export interface ItemRow {
  id: string;
  itemCode: string;
  name: string;
  description: string | null;
  itemType: string;
  uom: string;
  /** NUMERIC(18,2) over the wire as a string — never parsed into a float for display. */
  standardCost: string | null;
  /** 0 means nobody has said how this item is made, which usually means it is bought. */
  bomCount: number;
  /** The highest active version, or null. What "the BOM" means when somebody says it. */
  defaultBomId: string | null;
  createdAt: string;
}

export interface BomLineRow {
  lineNo: number;
  componentItemId: string;
  componentCode: string;
  componentName: string;
  qty: string;
  uom: string;
  scrapPct: string;
}

export interface BomView {
  id: string;
  itemId: string;
  version: number;
  /** How many of the product one run of this BOM makes. Every line qty is per THIS, not per one. */
  outputQty: string;
  uom: string;
  notes: string | null;
  lines: BomLineRow[];
}

export const engineeringApi = {
  itemsPath: "/engineering/items",
  bomPath: (bomId: string) => `/engineering/boms/${encodeURIComponent(bomId)}`,
  /** The in-app URL of the BOM screen, for linking out of the item list. */
  bomHref: (bomId: string) => `/engineering/bom/${encodeURIComponent(bomId)}`,
} as const;
