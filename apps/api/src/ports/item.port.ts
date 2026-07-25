/**
 * The item-provider port. ENGINEERING owns the item master; several modules need to READ
 * one — Maintenance to show a spare's code and unit on an MWO line, Inventory to value a
 * movement at standard cost. Cross-module access goes through this shared interface
 * (§1.1), never a module→module import and never a raw SELECT against `item`.
 *
 * It is deliberately read-only and deliberately small. A port that grows write methods is
 * a module boundary dissolving one convenience at a time.
 */
export const ITEM_PROVIDER = Symbol("ItemProvider");

export interface ItemSpec {
  id: string;
  itemCode: string;
  name: string;
  uom: string;
  /** The valuation basis Inventory applies in the MVP. FIFO/moving-average is Inventory's
   *  post-MVP work and lands behind this same contract. */
  standardCost: number;
}

export interface ItemProvider {
  getItem(itemId: string): Promise<ItemSpec | null>;
  getItems(itemIds: readonly string[]): Promise<ItemSpec[]>;
  getItemByCode(itemCode: string): Promise<ItemSpec | null>;
}
