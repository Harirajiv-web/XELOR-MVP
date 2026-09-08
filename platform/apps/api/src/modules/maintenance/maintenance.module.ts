import { Module } from "@nestjs/common";
import { MaintenanceController } from "./maintenance.controller.js";
import { AssetService } from "./asset.service.js";
import { RequestService } from "./request.service.js";
import { MwoService } from "./mwo.service.js";
import { SparesService } from "./spares.service.js";
import { DowntimeService } from "./downtime.service.js";
import { PmService } from "./pm.service.js";
import { KpiService } from "./kpi.service.js";

/**
 * MAINTENANCE / CMMS (KILN, Module 10).
 *
 * The dependency arrows all point OUT of this module, and that is the design:
 *
 *   Maintenance → STOCK_POSTER      (Inventory posts and values every spare movement)
 *   Maintenance → ITEM_PROVIDER     (Engineering owns the item master)
 *   Maintenance → WORKFLOW_EXECUTOR (W1 approves a high-value or safety-related closure)
 *   Maintenance → outbox events     (Production's OEE, Planning's capacity, Expenditure's
 *                                    spend, Inspection's incident register)
 *
 * Nothing points back in. No sibling imports a Maintenance type, no sibling reads a
 * Maintenance table, and the boundary lint fails CI on either. The one piece of shared
 * vocabulary with Production — the machine — is a logical `work_center_ref`, checked by
 * `pnpm --filter @ind-core/db naming-check` rather than by memory.
 */
@Module({
  controllers: [MaintenanceController],
  providers: [AssetService, DowntimeService, MwoService, SparesService, RequestService, PmService, KpiService],
  exports: [AssetService, MwoService, DowntimeService, PmService, KpiService],
})
export class MaintenanceModule {}
