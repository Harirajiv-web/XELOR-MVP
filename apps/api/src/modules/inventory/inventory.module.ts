import { Global, Module } from "@nestjs/common";
import { StockController } from "./stock.controller.js";
import { InventoryController } from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";
import { STOCK_POSTER } from "../../ports/stock.port.js";

/**
 * INVENTORY (SPAR, Module 03) — warehouses, the stock ledger, and the SINGLE write path
 * to stock (§5.6). Made @Global and exposes the STOCK_POSTER port so other modules
 * (Purchase's GRN, Production) post stock without importing this module (§1.1).
 * Production is gated OFF until Inventory hits its stock-accuracy target.
 */
@Global()
@Module({
  controllers: [StockController, InventoryController],
  providers: [InventoryService, { provide: STOCK_POSTER, useExisting: InventoryService }],
  exports: [InventoryService, STOCK_POSTER],
})
export class InventoryModule {}
