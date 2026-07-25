import { Module } from "@nestjs/common";
import { ExpenditureController } from "./expenditure.controller.js";
import { ExpNumberingService } from "./exp-numbering.service.js";
import { BudgetService } from "./budget.service.js";
import { ClaimService } from "./claim.service.js";
import { AdvanceService } from "./advance.service.js";
import { IndirectExpenseService } from "./indirect.service.js";
import { AttachmentService } from "./attachment.service.js";
import { PostingService } from "./posting.service.js";

/**
 * EXPENDITURE (RASP, Module 12) — money out that is not a purchase order.
 *
 * The dependency arrows all point OUT:
 *
 *   Expenditure → posting_instruction → ACCOUNTS  (the ledger has one writer; not this)
 *   Expenditure → AI_ROUTER                        (AI #1 extraction, AI #4 duplicates)
 *   Expenditure → outbox events                    (budget warnings, approvals, postings)
 *
 * Nothing points back in. Purchase's PO commitment supersedes an indirect PR's reservation
 * keyed by the origin document, so nothing double-counts; that supersession arrives as an
 * event rather than as a call into this module.
 */
@Module({
  controllers: [ExpenditureController],
  providers: [
    ExpNumberingService,
    BudgetService,
    PostingService,
    ClaimService,
    AdvanceService,
    IndirectExpenseService,
    AttachmentService,
  ],
  exports: [BudgetService, ClaimService, IndirectExpenseService, PostingService, AttachmentService],
})
export class ExpenditureModule {}
