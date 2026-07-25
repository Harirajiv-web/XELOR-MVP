import { Module } from "@nestjs/common";
import { CspController } from "./csp.controller.js";
import { PortalController } from "./portal.controller.js";
import { NumberingService } from "./numbering.service.js";
import { SlaService } from "./sla.service.js";
import { TicketService } from "./ticket.service.js";
import { ComplaintService } from "./complaint.service.js";
import { EntitlementService } from "./entitlement.service.js";
import { SpareService } from "./spare.service.js";
import { KbService } from "./kb.service.js";
import { CsatService } from "./csat.service.js";
import { PortalService } from "./portal.service.js";
import { ReplyService } from "./reply.service.js";
import { DashboardService } from "./dashboard.service.js";

/**
 * CSP — CUSTOMER SERVICE PORTAL (MICA, Module 11).
 *
 * Two controllers, two route prefixes, two trust zones, disjoint guards. That is the
 * module's defining shape and the reason it is one Nest module rather than two: the
 * customer and the agent share ONE record, and a second module would mean a second copy
 * of the ticket that could drift from the first.
 *
 * The dependency arrows all point OUT:
 *
 *   CSP → ITEM_PROVIDER   (Engineering owns the item master; a spare request checks it)
 *   CSP → AI_ROUTER       (AI #3 triage and AI #6 reply drafting, through the one doorway)
 *   CSP → outbox events   (Quality's NCR intake, SMBD's renewal leads, the CSAT feed)
 *
 * Nothing points back in. Inventory is reached only through reservation references it
 * returns; no stock is read and none could be written. The QMS hand-off is an event, so
 * raising a complaint and telling Quality about it are one transaction or neither.
 */
@Module({
  controllers: [CspController, PortalController],
  providers: [
    NumberingService,
    SlaService,
    TicketService,
    ComplaintService,
    EntitlementService,
    SpareService,
    KbService,
    CsatService,
    PortalService,
    ReplyService,
    DashboardService,
  ],
  exports: [TicketService, SlaService, EntitlementService, KbService, CsatService, DashboardService],
})
export class CspModule {}
