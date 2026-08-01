import { Module } from "@nestjs/common";
import { PlanningController } from "./planning.controller.js";
import { MrpService } from "./mrp.service.js";
import { DemandService } from "./demand.service.js";
import { PlanningPolicyService } from "./policy.service.js";
import { PlannedOrderService } from "./planned-order.service.js";
import { PlanExceptionService } from "./exception.service.js";
import { PlanScheduleService } from "./schedule.service.js";
import { PlanNumberingService } from "./plan-numbering.service.js";

/**
 * PLANNING / MRP (AXLE, Module 13) — what to make, what to buy, and by when.
 *
 * This is the module with the widest read surface in the system and the narrowest write
 * surface. It reads demand from SMBD, stock from INVENTORY, the product structure from
 * ENGINEERING, and open supply from PURCHASE and PRODUCTION — six @Global ports, no
 * module→module imports (§1.1) — and it writes exactly one thing of its own: a plan.
 *
 * It provides no port. Nothing upstream needs to ask Planning anything: a plan is an
 * output, and the two acts that turn one into a commitment (a work order, a requisition)
 * are performed by asking the module that owns the document, not by writing its table.
 */
@Module({
  controllers: [PlanningController],
  providers: [
    PlanNumberingService,
    PlanningPolicyService,
    DemandService,
    MrpService,
    PlannedOrderService,
    PlanExceptionService,
    PlanScheduleService,
  ],
  exports: [MrpService, PlannedOrderService, PlanExceptionService],
})
export class PlanningModule {}
