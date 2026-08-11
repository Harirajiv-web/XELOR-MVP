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
 *
 * THE PORTS ARE WHERE THAT RULE IS ACTUALLY KEPT, so they are worth naming here rather than
 * leaving to be discovered in the service's constructor:
 *
 *   BOM_PROVIDER            ENGINEERING — the released structure, for the explosion
 *   STOCK_READER            INVENTORY   — on-hand, for the netting
 *   PURCHASE_ORDER_WRITER   PURCHASE    — raises the real purchase orders (one per vendor)
 *   PRODUCTION_ORDER_WRITER PRODUCTION  — releases the real work order
 *
 * The two writers are what turned the execute steps from narration into documents. Before
 * them `procure` and `workorder` wrote a `fulfilment_action` describing a purchase that had
 * never happened; now they raise a PO and a work order, record the real numbers, and re-read
 * both to prove they exist. They are declared in `ports/fulfilment-docs.port.ts` and bound
 * to their owning services in `purchase.module.ts` / `production.module.ts`.
 *
 * There is deliberately no `imports: [PurchaseModule, ProductionModule]` line below. Both
 * are @Global and export their tokens, so the mission resolves an INTERFACE it cannot reach
 * past — which is the entire boundary. Importing the modules to get at the same tokens would
 * hand this file a reference to `PurchaseService` and quietly reopen the door.
 */
@Module({
  imports: [CommonModule, EngineeringModule, InventoryModule],
  controllers: [FulfilmentController],
  providers: [FulfilmentMissionService],
  exports: [FulfilmentMissionService],
})
export class FulfilmentModule {}
