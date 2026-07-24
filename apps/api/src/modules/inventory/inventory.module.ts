import { Module } from "@nestjs/common";
import { StockController } from "./stock.controller.js";
import { InventoryController } from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";

/**
 * INVENTORY (SPAR, Module 03) — warehouses, the stock ledger, and the SINGLE write path
 * to stock (§5.6). AuditLogService is provided globally by the AI spine. Production is
 * gated OFF until Inventory hits its stock-accuracy target (SPAR ↔ KILN contract).
 */
@Module({
  controllers: [StockController, InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
