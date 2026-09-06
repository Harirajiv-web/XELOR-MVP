import { Global, Module } from "@nestjs/common";
import { VendorController } from "./vendor.controller.js";
import { PoController } from "./po.controller.js";
import { GrnController } from "./grn.controller.js";
import { RfqController } from "./rfq.controller.js";
import { RfqService } from "./rfq.service.js";
import { PurchaseService } from "./purchase.service.js";
import { PURCHASE_SUPPLY } from "../../ports/planning-inputs.port.js";
import { SOURCING_QUOTE_SINK } from "../../ports/sourcing.port.js";

/**
 * PURCHASE (SPAR, Module 04) — vendor master, purchase orders (approved via the W1
 * WorkflowExecutor port), and goods receipts (posting stock via the STOCK_POSTER port).
 * AuditLogService + DedupExplainer come from the @Global AI spine; WORKFLOW_EXECUTOR
 * and STOCK_POSTER from the @Global Workflow + Inventory modules — no module→module
 * imports (§1.1).
 */
@Global()
@Module({
  // Sourcing sits here because an award raises a purchase order through PurchaseService —
  // the approval route and numbering are Purchase's to apply, not sourcing's to reimplement.
  controllers: [VendorController, PoController, GrnController, RfqController],
  // PURCHASE_SUPPLY tells PLANNING what is already on order. The engine treats every row
  // as fact at the date it carries and never redates one — moving a supplier commitment
  // is a phone call, not a database write.
  providers: [
    PurchaseService,
    RfqService,
    { provide: PURCHASE_SUPPLY, useExisting: PurchaseService },
    // A supplier's answer from the network becomes an ordinary quote through RfqService,
    // so the network never learns how a quote is recorded and Purchase never learns that a
    // network exists.
    { provide: SOURCING_QUOTE_SINK, useExisting: RfqService },
  ],
  exports: [PurchaseService, RfqService, PURCHASE_SUPPLY, SOURCING_QUOTE_SINK],
})
export class PurchaseModule {}
