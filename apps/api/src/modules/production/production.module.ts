import { Global, Module } from "@nestjs/common";
import { ProductionController } from "./production.controller.js";
import { ProductionService } from "./production.service.js";
import { PRODUCTION_SUPPLY, PRODUCTION_ORDER_CREATOR } from "../../ports/planning-inputs.port.js";
import { PRODUCTION_ORDER_WRITER } from "../../ports/fulfilment-docs.port.js";

/**
 * PRODUCTION (KILN, Module 05) — the make cycle. Reads BOMs via the @Global BOM_PROVIDER
 * port and item codes via ITEM_PROVIDER (both ENGINEERING), and consumes/produces stock via
 * the @Global STOCK_POSTER port (INVENTORY) — no module→module imports (§1.1). Production
 * never writes stock directly (§5.6); it is gated OFF until Inventory hits its
 * stock-accuracy target (SPAR ↔ KILN).
 */
@Global()
@Module({
  controllers: [ProductionController],
  // PRODUCTION_SUPPLY is what is already on the floor. PRODUCTION_ORDER_CREATOR is how a
  // planned order becomes a real one — PLANNING asks, this module decides the BOM version,
  // snapshots the components and owns the stock path.
  //
  // PRODUCTION_ORDER_WRITER is the same act asked for by a different caller: the fulfilment
  // mission, which has no planned order to convert but has decided to build all the same.
  // Two tokens rather than one because they are two different requests with two different
  // inputs, and collapsing them would force whichever caller lost the argument to invent a
  // planned order it does not have.
  providers: [
    ProductionService,
    { provide: PRODUCTION_SUPPLY, useExisting: ProductionService },
    { provide: PRODUCTION_ORDER_CREATOR, useExisting: ProductionService },
    { provide: PRODUCTION_ORDER_WRITER, useExisting: ProductionService },
  ],
  exports: [ProductionService, PRODUCTION_SUPPLY, PRODUCTION_ORDER_CREATOR, PRODUCTION_ORDER_WRITER],
})
export class ProductionModule {}
