import { Module } from "@nestjs/common";
import { VendorController } from "./vendor.controller.js";
import { PoController } from "./po.controller.js";
import { PurchaseService } from "./purchase.service.js";

/**
 * PURCHASE (SPAR, Module 04) — vendor master, purchase orders (approved via the W1
 * WorkflowExecutor port), and goods receipts (posting stock via the STOCK_POSTER port).
 * AuditLogService + DedupExplainer come from the @Global AI spine; WORKFLOW_EXECUTOR
 * and STOCK_POSTER from the @Global Workflow + Inventory modules — no module→module
 * imports (§1.1).
 */
@Module({
  controllers: [VendorController, PoController],
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
