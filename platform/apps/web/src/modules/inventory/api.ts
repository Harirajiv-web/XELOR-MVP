/**
 * Inventory's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 */

export interface StockRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  batch: string | null;
  qty: string;
}

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  warehouseType: string;
}

export const inventoryApi = {
  stockPath: "/inventory/stock",
  warehousesPath: "/inventory/warehouses",
} as const;
