import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { TicketService } from "./ticket.service.js";
import { SlaService } from "./sla.service.js";
import { ComplaintService } from "./complaint.service.js";
import { EntitlementService } from "./entitlement.service.js";
import { SpareService } from "./spare.service.js";
import { KbService } from "./kb.service.js";
import { CsatService } from "./csat.service.js";
import { PortalService } from "./portal.service.js";
import { ReplyService } from "./reply.service.js";
import { DashboardService } from "./dashboard.service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITY = z.enum(["low", "medium", "high", "urgent"]);

const createTicketSchema = z.object({
  customerAccountId: z.string().uuid(),
  subject: z.string().min(3).max(255),
  description: z.string().min(1),
  categoryCode: z.string().optional(),
  priority: PRIORITY.optional(),
  productSerialNo: z.string().optional(),
  itemRef: z.string().uuid().optional(),
  contactRef: z.string().uuid().optional(),
  portalUserId: z.string().uuid().optional(),
  channel: z.enum(["portal", "phone", "email", "whatsapp"]).optional(),
});

const commentSchema = z.object({
  body: z.string().min(1),
  visibility: z.enum(["public", "internal"]).default("public"),
  at: z.string().optional(),
});

const transitionSchema = z.object({
  status: z.enum(["new", "triaged", "in_progress", "pending_customer", "resolved", "closed", "reopened"]),
  reason: z.string().optional(),
  at: z.string().optional(),
});

const assignSchema = z.object({
  ownerEmployeeRef: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
});

const triageDecisionSchema = z.object({
  action: z.enum(["accepted", "edited", "dismissed"]),
  categoryCode: z.string().optional(),
  priority: PRIORITY.optional(),
  at: z.string().optional(),
});

const complaintSchema = z.object({
  failureSymptom: z.string().min(1),
  productSerialNo: z.string().optional(),
  batchRef: z.string().optional(),
  severity: z.enum(["minor", "major", "critical"]).optional(),
  inServiceDate: z.string().regex(DATE).optional(),
  at: z.string().optional(),
});

const qmsUpdateSchema = z.object({
  ncrRef: z.string().optional(),
  capaRef: z.string().optional(),
  capaProgressPct: z.number().int().min(0).max(100).optional(),
  status: z.enum(["open", "investigation", "corrective_action", "closed"]).optional(),
  disposition: z.string().optional(),
  at: z.string().optional(),
});

const spareSchema = z.object({
  itemCode: z.string().min(1),
  qty: z.number().positive(),
  ticketNo: z.string().optional(),
  productSerialNo: z.string().optional(),
  customerAccountId: z.string().uuid().optional(),
  shipToGstin: z.string().optional(),
  shipToAddress: z.string().optional(),
  at: z.string().optional(),
});

const draftSchema = z.object({
  template: z.enum(["acknowledge", "awaiting_info", "resolved", "under_quality_review"]).default("acknowledge"),
});

const sendDraftSchema = z.object({ commentId: z.string().uuid(), body: z.string().optional() });

const inviteSchema = z.object({
  customerAccountId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  invitedRole: z.enum(["customer_user", "customer_admin"]).optional(),
  invitedByRef: z.string().uuid(),
});

// Typed on the schema's OUTPUT: with `.default()` in play, input and output differ, and
// inferring the input is what makes a defaulted field look optional downstream.
function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw Errors.validation(r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }
  return r.data as z.output<S>;
}

function requireIdempotencyKey(key: string | undefined): string {
  if (!key) {
    throw Errors.validation([
      { field: "Idempotency-Key", message: "required on ticket creation — a replayed submit must not open a second case" },
    ]);
  }
  return key;
}

/**
 * THE INTERNAL ZONE — `/api/v1/csp`, staff-realm token, RBAC-gated.
 *
 * The portal zone is a SEPARATE controller with a separate prefix and disjoint guards
 * (§10). They are not two roles on one route table: a permission bug on a staff route
 * cannot reach a customer, because the customer's token cannot address these paths at all.
 */
// The `api/v1` prefix is applied globally in main.ts — repeating it here served this
// controller at /api/v1/api/v1/csp. Controller prefixes are relative, always.
const editSpareSchema = z.object({
  qty: z.number().positive().optional(),
  uom: z.string().max(20).optional(),
  shipToGstin: z.string().max(15).optional(),
  shipToAddress: z.string().max(500).optional(),
  reason: z.string().trim().min(3, "say why in a few words").optional(),
});

@Controller("csp")
export class CspController {
  constructor(
    private readonly tickets: TicketService,
    private readonly sla: SlaService,
    private readonly complaints: ComplaintService,
    private readonly entitlement: EntitlementService,
    private readonly spares: SpareService,
    private readonly kb: KbService,
    private readonly csat: CsatService,
    private readonly portal: PortalService,
    private readonly replies: ReplyService,
    private readonly dashboards: DashboardService,
  ) {}

  /* --------------------------------- tickets ------------------------------- */

  @Get("tickets")
  @RequirePermission("csp.ticket.read")
  async queue(
    @Query("status") status?: string,
    @Query("teamId") teamId?: string,
    @Query("slaState") slaState?: string,
  ) {
    return this.tickets.queue({
      ...(status ? { status: status.split(",") as never } : {}),
      ...(teamId ? { teamId } : {}),
      ...(slaState ? { slaState } : {}),
    });
  }

  @Post("tickets")
  @RequirePermission("csp.ticket.create")
  async create(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const input = parse(createTicketSchema, body);
    return this.tickets.create({ ...input, idempotencyKey: requireIdempotencyKey(key) });
  }

  @Get("tickets/:ticketNo")
  @RequirePermission("csp.ticket.read")
  async detail(@Param("ticketNo") ticketNo: string) {
    return this.tickets.detail(ticketNo);
  }

  @Patch("tickets/:ticketNo/status")
  @RequirePermission("csp.ticket.update")
  async transition(@Param("ticketNo") ticketNo: string, @Body() body: unknown) {
    const input = parse(transitionSchema, body);
    return this.tickets.transition(ticketNo, input.status, { reason: input.reason, at: input.at });
  }

  @Post("tickets/:ticketNo/comments")
  @RequirePermission("csp.ticket.update")
  async comment(@Param("ticketNo") ticketNo: string, @Body() body: unknown) {
    const input = parse(commentSchema, body);
    return this.tickets.addComment(ticketNo, input);
  }

  @Post("tickets/:ticketNo/assign")
  @RequirePermission("csp.ticket.update")
  async assign(@Param("ticketNo") ticketNo: string, @Body() body: unknown) {
    return this.tickets.assign(ticketNo, parse(assignSchema, body));
  }

  /** Accept, edit or dismiss the AI suggestion. The outcome is what the override-rate
   *  metric is computed from, so a dismissal is recorded as carefully as an acceptance. */
  @Post("tickets/:ticketNo/triage")
  @RequirePermission("csp.ticket.update")
  async triage(@Param("ticketNo") ticketNo: string, @Body() body: unknown) {
    return this.tickets.applyTriage(ticketNo, parse(triageDecisionSchema, body));
  }

  /** The clock alone — no comments, no timeline. See `TicketService.slaOf`. */
  @Get("tickets/:ticketNo/sla")
  @RequirePermission("csp.ticket.read")
  async slaState(@Param("ticketNo") ticketNo: string, @Query("asOf") asOf?: string) {
    return this.tickets.slaOf(ticketNo, asOf);
  }

  /* ------------------------------ AI #6 drafting --------------------------- */

  @Post("tickets/:ticketNo/ai/suggest-reply")
  @RequirePermission("csp.ticket.update")
  async suggestReply(@Param("ticketNo") ticketNo: string, @Body() body: unknown) {
    const input = parse(draftSchema, body ?? {});
    return this.replies.suggest(ticketNo, input.template);
  }

  /** The human act. Until this is called the draft is not a message. */
  @Post("tickets/:ticketNo/ai/send-draft")
  @RequirePermission("csp.ticket.update")
  async sendDraft(@Param("ticketNo") _ticketNo: string, @Body() body: unknown) {
    const input = parse(sendDraftSchema, body);
    return this.replies.send(input.commentId, input.body);
  }

  /* ------------------------------- complaints ------------------------------ */

  @Post("tickets/:ticketNo/complaints")
  @RequirePermission("csp.complaint.create")
  async raiseComplaint(@Param("ticketNo") ticketNo: string, @Body() body: unknown) {
    return this.complaints.raise({ ticketNo, ...parse(complaintSchema, body) });
  }

  @Patch("complaints/:complaintNo")
  @RequirePermission("csp.complaint.update")
  async updateComplaint(@Param("complaintNo") complaintNo: string, @Body() body: unknown) {
    return this.complaints.applyQmsUpdate(complaintNo, parse(qmsUpdateSchema, body));
  }

  @Post("complaints/:complaintNo/close")
  @RequirePermission("csp.complaint.update")
  async closeComplaint(@Param("complaintNo") complaintNo: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        disposition: z.string().min(1),
        overrideBy: z.string().uuid().optional(),
        overrideReason: z.string().optional(),
        at: z.string().optional(),
      }),
      body,
    );
    return this.complaints.close(complaintNo, input);
  }

  /* ------------------------------ entitlement ------------------------------ */

  @Post("tickets/:ticketNo/entitlement-check")
  @RequirePermission("csp.ticket.update")
  async entitlementCheck(@Param("ticketNo") ticketNo: string, @Query("onDate") onDate?: string) {
    return this.entitlement.checkForTicket(ticketNo, onDate);
  }

  @Post("amc/scan-renewals")
  @RequirePermission("csp.contract.update")
  async scanRenewals(@Query("asOf") asOf?: string) {
    return this.entitlement.scanRenewals(asOf);
  }

  /* --------------------------------- spares -------------------------------- */

  @Get("spare-requests")
  @RequirePermission("csp.ticket.read")
  async spareList() {
    return this.spares.list();
  }

  @Post("spare-requests")
  @RequirePermission("csp.ticket.update")
  async spareCreate(@Body() body: unknown) {
    return this.spares.request(parse(spareSchema, body));
  }

  /**
   * Correct a spare request that has not yet been issued.
   *
   * Its own permission rather than `csp.ticket.update`: a spare request moves parts and
   * money, and the person who may retitle a ticket is not automatically the person who may
   * change what gets shipped.
   */
  @Patch("spare-requests/:requestNo")
  @RequirePermission("csp.spare.update")
  async spareEdit(@Param("requestNo") requestNo: string, @Body() body: unknown) {
    return this.spares.editRequest(requestNo, parse(editSpareSchema, body ?? {}));
  }

  /** May this spare request be edited right now, and what should the user be told if not? */
  @Get("spare-requests/:requestNo/edit-policy")
  @RequirePermission("csp.ticket.read")
  async spareEditPolicy(@Param("requestNo") requestNo: string) {
    return this.spares.editPolicy(requestNo);
  }

  @Patch("spare-requests/:requestNo/reserve")
  @RequirePermission("csp.ticket.update")
  async spareReserve(@Param("requestNo") requestNo: string, @Body() body: unknown) {
    const input = parse(z.object({ reservationRef: z.string().min(1) }), body);
    return this.spares.reserve(requestNo, input.reservationRef);
  }

  /* ----------------------------- KB, CSAT, portal -------------------------- */

  @Get("kb/search")
  @RequirePermission("csp.ticket.read")
  async kbSearch(@Query("q") q: string) {
    return this.kb.search(q ?? "");
  }

  @Post("tickets/:ticketNo/csat")
  @RequirePermission("csp.ticket.update")
  async issueCsat(@Param("ticketNo") ticketNo: string, @Query("at") at?: string) {
    return this.csat.issue(ticketNo, { at });
  }

  @Post("portal-users")
  @RequirePermission("csp.portal_user.manage")
  async invite(@Body() body: unknown) {
    return this.portal.invite(parse(inviteSchema, body));
  }

  @Patch("portal-users/:email/suspend")
  @RequirePermission("csp.portal_user.manage")
  async suspend(@Param("email") email: string, @Body() body: unknown) {
    const input = parse(z.object({ reason: z.string().min(1) }), body);
    return this.portal.suspend(email, input.reason);
  }

  /* ------------------------------- dashboards ------------------------------ */

  @Get("dashboards/service")
  @RequirePermission("csp.dashboard.read")
  async dashboard() {
    return this.dashboards.service();
  }

  @Get("reports/csat")
  @RequirePermission("csp.dashboard.read")
  async csatReport() {
    return this.csat.summary();
  }

  /** The SLA scanner's endpoint. In production this is a BullMQ worker on the same image;
   *  exposing it lets the demo advance the clock explicitly instead of waiting for one. */
  @Post("sla/scan")
  @RequirePermission("csp.dashboard.read")
  async slaScan(@Query("asOf") asOf?: string) {
    return this.sla.scanOpen(asOf ?? new Date().toISOString());
  }
}
