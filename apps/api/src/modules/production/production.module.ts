import { Module } from "@nestjs/common";
import { ProductionController } from "./production.controller.js";
import { ProductionService } from "./production.service.js";

/**
 * PRODUCTION (KILN, Module 05) — the make cycle. Reads BOMs via the @Global BOM_PROVIDER
 * port (ENGINEERING) and consumes/produces stock via the @Global STOCK_POSTER port
 * (INVENTORY) — no module→module imports (§1.1). Production never writes stock directly
 * (§5.6); it is gated OFF until Inventory hits its stock-accuracy target (SPAR ↔ KILN).
 */
@Module({
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
