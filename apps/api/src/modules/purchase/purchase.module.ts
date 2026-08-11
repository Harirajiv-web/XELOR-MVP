import { Global, Module } from "@nestjs/common";
import { VendorController } from "./vendor.controller.js";
import { PoController } from "./po.controller.js";
import { GrnController } from "./grn.controller.js";
import { PurchaseService } from "./purchase.service.js";
import { PURCHASE_SUPPLY } from "../../ports/planning-inputs.port.js";
import { PURCHASE_ORDER_WRITER } from "../../ports/fulfilment-docs.port.js";

/**
 * PURCHASE (SPAR, Module 04) — vendor master, purchase orders (approved via the W1
 * WorkflowExecutor port), and goods receipts (posting stock via the STOCK_POSTER port).
 * AuditLogService + DedupExplainer come from the @Global AI spine; WORKFLOW_EXECUTOR
 * and STOCK_POSTER from the @Global Workflow + Inventory modules — no module→module
 * imports (§1.1).
 */
@Global()
@Module({
  controllers: [VendorController, PoController, GrnController],
  // PURCHASE_SUPPLY tells PLANNING what is already on order. The engine treats every row
  // as fact at the date it carries and never redates one — moving a supplier commitment
  // is a phone call, not a database write.
  //
  // PURCHASE_ORDER_WRITER is how the fulfilment mission raises a real purchase order without
  // holding a reference to this service. Same trick, opposite direction: the token is
  // exported from the @Global module, so the caller injects an interface it cannot reach
  // past — and this module keeps the only entrance to `createPo` it has ever had.
  providers: [
    PurchaseService,
    { provide: PURCHASE_SUPPLY, useExisting: PurchaseService },
    { provide: PURCHASE_ORDER_WRITER, useExisting: PurchaseService },
  ],
  exports: [PurchaseService, PURCHASE_SUPPLY, PURCHASE_ORDER_WRITER],
})
export class PurchaseModule {}
