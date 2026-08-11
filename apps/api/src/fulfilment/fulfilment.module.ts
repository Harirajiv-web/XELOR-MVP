import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module.js";
import { EngineeringModule } from "../modules/engineering/engineering.module.js";
import { InventoryModule } from "../modules/inventory/inventory.module.js";
import { FulfilmentController } from "./fulfilment.controller.js";
import { FulfilmentMissionService } from "./mission.service.js";

/**
 * The mission runtime imports Engineering (for the released BOM) and Inventory (for
 * on-hand), and nothing else — deliberately. It does not import Sales, Purchase or
 * Production even though it reasons about all three, because it reads their tables through
 * the shared schema under RLS and writes to them only through their own ports.
 *
 * The temptation this resists is a mission service that injects every module and calls
 * their methods directly. That would work today and would make the mission the place every
 * module boundary goes to die.
 */
@Module({
  imports: [CommonModule, EngineeringModule, InventoryModule],
  controllers: [FulfilmentController],
  providers: [FulfilmentMissionService],
  exports: [FulfilmentMissionService],
})
export class FulfilmentModule {}
