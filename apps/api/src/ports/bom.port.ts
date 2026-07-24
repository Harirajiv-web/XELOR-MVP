/**
 * The BOM-provider port. ENGINEERING owns the Bill of Materials; PRODUCTION needs to
 * read it to explode component requirements. Cross-module access goes through this
 * shared interface (§1.1), never a module→module import.
 */
export const BOM_PROVIDER = Symbol("BomProvider");

export interface BomComponentSpec {
  componentItemId: string;
  qty: number; // consumed per `outputQty` of the BOM
  uom: string;
  scrapPct: number;
}
export interface BomSpec {
  bomId: string;
  itemId: string; // the produced item
  version: number;
  outputQty: number; // how many the component quantities make
  uom: string;
  components: BomComponentSpec[];
}

export interface BomProvider {
  /** The latest active BOM for an item, or null if it has none. */
  getActiveBomForItem(itemId: string): Promise<BomSpec | null>;
  /** A specific BOM by id, or null. */
  getBomById(bomId: string): Promise<BomSpec | null>;
}
