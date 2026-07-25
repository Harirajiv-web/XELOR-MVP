import { Global, Module } from "@nestjs/common";
import { EngineeringController } from "./engineering.controller.js";
import { BomController } from "./bom.controller.js";
import { EngineeringService } from "./engineering.service.js";
import { BOM_PROVIDER } from "../../ports/bom.port.js";
import { ITEM_PROVIDER } from "../../ports/item.port.js";

/**
 * ENGINEERING (AXLE, Module 02) — item master + BOM. Made @Global and exposes the
 * BOM_PROVIDER port so PRODUCTION can read a BOM to explode component requirements
 * without importing this module (§1.1). Reuses the shared master-dedup brain for items.
 */
@Global()
@Module({
  controllers: [EngineeringController, BomController],
  providers: [
    EngineeringService,
    { provide: BOM_PROVIDER, useExisting: EngineeringService },
    // ITEM_PROVIDER is read by INVENTORY (to value a movement at standard cost) and by
    // MAINTENANCE (to show a spare's code and unit) — neither imports this module.
    { provide: ITEM_PROVIDER, useExisting: EngineeringService },
  ],
  exports: [EngineeringService, BOM_PROVIDER, ITEM_PROVIDER],
})
export class EngineeringModule {}
