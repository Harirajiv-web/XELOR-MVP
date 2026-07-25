import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { AppError, Errors, currentTenant } from "@ind-core/platform";
import { TicketService } from "./ticket.service.js";
import { EntitlementService } from "./entitlement.service.js";
import { SpareService } from "./spare.service.js";
import { KbService } from "./kb.service.js";
import { CsatService } from "./csat.service.js";
import { PortalService } from "./portal.service.js";

const raiseSchema = z.object({
  subject: z.string().min(3).max(255),
  description: z.string().min(1),
  categoryCode: z.string().optional(),
  productSerialNo: z.string().optional(),
});

const commentSchema = z.object({ body: z.string().min(1), at: z.string().optional() });

const spareSchema = z.object({
  itemCode: z.string().min(1),
  qty: z.number().positive(),
  ticketNo: z.string().optional(),
  productSerialNo: z.string().optional(),
  shipToGstin: z.string().optional(),
  shipToAddress: z.string().optional(),
});

const csatSchema = z.object({ score: z.number().int().min(1).max(5), comment: z.string().optional(), at: z.string().optional() });

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw Errors.validation(r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }
  return r.data as z.output<S>;
}

/**
 * THE PORTAL ZONE — `/api/v1/portal`, portal-realm token, no RBAC grid.
 *
 * A separate controller with a separate prefix and DISJOINT guards, not a set of extra
 * roles bolted onto the internal routes. That separation is the security decision: a
 * permission bug on a staff route cannot expose a customer to anything, because a portal
 * token cannot address a staff path at all, and a staff token has no `customerAccountId`
 * and so is refused here.
 *
 * Three portal-specific rules, all of them structural rather than a matter of care:
 *
 *   - **Every response is a portal DTO.** These handlers return the projections built by
 *     `toPublicTicketView` and `isCustomerVisible`. There is no path here that serialises a
 *     ticket row, so an internal note, an owner name or an NCR number has nothing to leak
 *     through.
 *   - **`customerAccountId` comes from the token, never from a parameter.** It is asserted
 *     on entry; a request without one is refused before it reaches a service.
 *   - **Out of scope is 404, not 403.** A ticket belonging to another customer must be
 *     indistinguishable from a ticket that does not exist — a 403 would confirm the id was
 *     real, which is the entire enumeration attack. RLS makes this the natural outcome:
 *     the row simply is not selectable, and `Errors.notFound` is what the service raises.
 */
@Controller("api/v1/portal")
export class PortalController {
  constructor(
    private readonly tickets: TicketService,
    private readonly entitlement: EntitlementService,
    private readonly spares: SpareService,
    private readonly kb: KbService,
    private readonly csat: CsatService,
    private readonly portal: PortalService,
  ) {}

  /** Every route in this zone passes through here first. A staff token reaching a portal
   *  path is a routing mistake, and it fails closed rather than being quietly upgraded. */
  private assertPortal(): string {
    const { customerAccountId, principal } = currentTenant();
    if (principal !== "portal" || !customerAccountId) {
      throw new AppError(
        "PORTAL_PRINCIPAL_REQUIRED",
        403,
        "This endpoint is for customer-portal sessions only.",
      );
    }
    return customerAccountId;
  }

  @Get("me")
  async me() {
    const account = this.assertPortal();
    const { actorId } = currentTenant();
    return { customerAccountId: account, principal: "portal", subject: actorId };
  }

  /* --------------------------------- tickets ------------------------------- */

  @Post("tickets")
  async raise(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    this.assertPortal();
    if (!key) {
      throw Errors.validation([
        { field: "Idempotency-Key", message: "required — a replayed submit on a bad connection must not open a second request" },
      ]);
    }
    const input = parse(raiseSchema, body);
    const created = await this.tickets.create({ ...input, channel: "portal", idempotencyKey: key });
    const suggested = await this.kb.suggestFor(input.subject, input.description);
    return {
      ticketNo: created.ticketNo,
      sla: {
        firstResponseDue: created.sla.firstResponseDue,
        state: created.sla.state,
        promise: created.sla.promise,
      },
      suggestedArticles: suggested.map((a) => ({ id: a.articleCode, title: a.title })),
    };
  }

  @Get("tickets")
  async list(@Query("asOf") asOf?: string) {
    this.assertPortal();
    return this.tickets.portalList(asOf);
  }

  @Get("tickets/:ticketNo")
  async detail(@Param("ticketNo") ticketNo: string, @Query("asOf") asOf?: string) {
    this.assertPortal();
    return this.tickets.portalDetail(ticketNo, asOf);
  }

  @Post("tickets/:ticketNo/comments")
  async comment(@Param("ticketNo") ticketNo: string, @Body() body: unknown) {
    this.assertPortal();
    const input = parse(commentSchema, body);
    return this.tickets.addComment(ticketNo, { body: input.body, at: input.at, authorType: "portal" });
  }

  @Post("tickets/:ticketNo/reopen")
  async reopen(@Param("ticketNo") ticketNo: string, @Query("at") at?: string) {
    this.assertPortal();
    return this.tickets.reopen(ticketNo, { at });
  }

  @Post("tickets/:ticketNo/close")
  async close(@Param("ticketNo") ticketNo: string, @Query("at") at?: string) {
    this.assertPortal();
    // Closure belongs to the customer. An agent closing their own resolved ticket would be
    // marking their own homework, and the CSAT survey that follows is the check on that.
    return this.tickets.transition(ticketNo, "closed", { at, actorType: "portal" });
  }

  /* ---------------------------- coverage & spares -------------------------- */

  @Get("installed-base")
  async installedBase(@Query("asOf") asOf?: string) {
    this.assertPortal();
    return this.portal.installedBase(asOf);
  }

  @Get("warranty/lookup")
  async warrantyLookup(@Query("serial_no") serialNo: string, @Query("onDate") onDate?: string) {
    this.assertPortal();
    if (!serialNo) throw Errors.validation([{ field: "serial_no", message: "required" }]);
    const r = await this.entitlement.lookup(serialNo, onDate);
    // The customer gets the verdict, the reasons and the dates — not the anomaly list.
    // "Two live warranty records exist for this serial" is an instruction to a colleague,
    // not information for the customer whose claim it concerns.
    return {
      serialNo: r.serialNo,
      verdict: r.verdict,
      reasons: r.reasons.filter((x) => !x.startsWith("Anomaly:")),
      warrantyExpiresOn: r.warrantyExpiresOn,
      amcExpiresOn: r.amcExpiresOn,
      partsChargeable: r.partsChargeable,
      summary: r.summary,
    };
  }

  @Post("spare-requests")
  async requestSpare(@Body() body: unknown) {
    this.assertPortal();
    return this.spares.request(parse(spareSchema, body));
  }

  /* ------------------------------- KB & CSAT ------------------------------- */

  @Get("kb/search")
  async kbSearch(@Query("q") q: string) {
    this.assertPortal();
    return this.kb.search(q ?? "");
  }

  @Get("kb/articles/:articleCode")
  async kbRead(@Param("articleCode") articleCode: string) {
    this.assertPortal();
    return this.kb.read(articleCode);
  }

  @Post("kb/articles/:articleCode/feedback")
  async kbVote(@Param("articleCode") articleCode: string, @Body() body: unknown) {
    this.assertPortal();
    const input = parse(z.object({ helpful: z.boolean() }), body);
    return this.kb.vote(articleCode, input.helpful);
  }

  /** The survey token is the credential. It is single-use, hashed at rest, and the handler
   *  never learns which ticket it belongs to until the hash matches. */
  @Post("csat/:token")
  async submitCsat(@Param("token") token: string, @Body() body: unknown) {
    this.assertPortal();
    return this.csat.submit(token, parse(csatSchema, body));
  }
}
