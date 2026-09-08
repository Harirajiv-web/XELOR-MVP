import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { NetworkService } from "./network.service.js";
import { TenderService } from "./tender.service.js";
import { SupplierPerformanceService } from "./supplier-performance.service.js";
import { DeskService } from "./desk.service.js";

function badRequest(
  issues: { path: (string | number)[]; message: string }[],
): never {
  throw Errors.validation(
    issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  );
}
function requireKey(key?: string): string {
  if (!key) {
    throw Errors.validation([
      { field: "Idempotency-Key", message: "header is required on mutations" },
    ]);
  }
  return key;
}

const supplierSchema = z.object({
  supplierCode: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  categories: z.array(z.string().min(1).max(60)).optional(),
  city: z.string().max(80).optional(),
  stateCode: z.string().max(4).optional(),
  gstin: z.string().max(15).optional(),
  contactName: z.string().max(120).optional(),
  whatsappE164: z
    .string()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "must be an international number like +919876543210",
    )
    .optional(),
  email: z.string().email().optional(),
  vendorId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});

const broadcastSchema = z.object({
  supplierIds: z.array(z.string().uuid()).optional(),
  category: z.string().max(60).optional(),
});

/**
 * THE STAFF SIDE of the supplier network. Everything here is behind the ordinary permission
 * guard; the supplier's own routes live on a different prefix with no RBAC at all, because a
 * supplier holds a link and nothing else. Keeping them in separate controllers is the
 * security decision — a permission mistake on this side cannot reach the portal, and a
 * stranger with a token cannot address any path defined here.
 */
@Controller("purchase/network")
export class MarketplaceController {
  constructor(
    private readonly network: NetworkService,
    private readonly desk: DeskService,
    private readonly tenders: TenderService,
    private readonly performance: SupplierPerformanceService,
  ) {}

  @Get("tenders")
  @RequirePermission("purchase.rfq.read")
  async listTenders() {
    return this.tenders.list();
  }

  @Get("tenders/:id")
  @RequirePermission("purchase.rfq.read")
  async tender(@Param("id") id: string) {
    return this.tenders.view(id);
  }

  @Post("tenders")
  @RequirePermission("purchase.rfq.create")
  async createTender(
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const p = z
      .object({
        title: z.string().trim().min(1).max(200),
        quoteDeadline: z.string().date(),
        needDate: z.string().date(),
        deliveryPlant: z.string().trim().min(1).max(60),
        notes: z.string().max(2000).optional(),
        vendorIds: z.array(z.string().uuid()).min(1).max(100),
        lines: z
          .array(
            z.object({
              itemId: z.string().uuid(),
              qty: z.number().positive(),
              uom: z.string().min(1).max(20),
              drawingRev: z.string().max(60).optional(),
            }),
          )
          .min(1)
          .max(100),
      })
      .safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.tenders.create(p.data, requireKey(key));
  }

  @Post("tenders/:id/publish")
  @RequirePermission("purchase.rfq.issue")
  async publishTender(
    @Param("id") id: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.tenders.transition(id, "publish", requireKey(key));
  }

  @Post("tenders/:id/close")
  @RequirePermission("purchase.rfq.issue")
  async closeTender(
    @Param("id") id: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.tenders.transition(id, "close", requireKey(key));
  }

  @Post("tenders/:id/cancel")
  @RequirePermission("purchase.rfq.issue")
  async cancelTender(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const p = z
      .object({ reason: z.string().trim().min(3).max(1000) })
      .safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.tenders.transition(
      id,
      "cancel",
      requireKey(key),
      p.data.reason,
    );
  }

  @Post("tenders/:id/award")
  @RequirePermission("purchase.rfq.award")
  async awardTender(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const p = z
      .object({
        awards: z
          .array(
            z.object({
              rfqId: z.string().uuid(),
              quoteId: z.string().uuid(),
              awardReason: z.string().trim().min(3).max(1000),
              expectedDate: z.string().date().optional(),
            }),
          )
          .min(1)
          .max(100),
      })
      .safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.tenders.award(id, p.data.awards, requireKey(key));
  }

  @Get("suppliers/:id/performance")
  @RequirePermission("purchase.network.read")
  async supplierPerformance(@Param("id") id: string) {
    return this.performance.get(id);
  }

  /**
   * The sourcing desk in ONE read. Every figure on that dashboard is computed from the same
   * instant, which two independent calls could never guarantee.
   */
  @Get("desk")
  @RequirePermission("purchase.network.read")
  async deskOverview() {
    return this.desk.overview();
  }

  @Get("desk/requests/:id")
  @RequirePermission("purchase.network.read")
  async deskRequest(@Param("id") id: string) {
    return this.desk.request(id);
  }

  @Get("suppliers")
  @RequirePermission("purchase.network.read")
  async suppliers() {
    return { items: await this.network.listSuppliers() };
  }

  @Post("suppliers")
  @RequirePermission("purchase.network.manage")
  async addSupplier(
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const p = supplierSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.network.upsertSupplier(p.data, idk);
  }

  @Get("broadcasts")
  @RequirePermission("purchase.network.read")
  async broadcasts() {
    return { items: await this.network.listBroadcasts() };
  }

  /** Every message the system meant to send, rendered. The WhatsApp view reads this. */
  @Get("outbox")
  @RequirePermission("purchase.network.read")
  async outbox(@Query("limit") limit?: string) {
    return {
      items: await this.network.listOutbox(
        Math.min(Number(limit ?? 100) || 100, 200),
      ),
    };
  }

  @Post("rfqs/:id/broadcast")
  @RequirePermission("purchase.network.broadcast")
  async broadcast(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const p = broadcastSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.network.broadcast(id, p.data, idk);
  }

  @Get("rfqs/:id/submissions")
  @RequirePermission("purchase.network.read")
  async submissions(@Param("id") id: string) {
    return { items: await this.network.listSubmissions(id) };
  }

  /** The ranking. Arithmetic over cost and delivery, with its reasoning in words. */
  @Get("rfqs/:id/ranking")
  @RequirePermission("purchase.network.read")
  async ranking(@Param("id") id: string) {
    return this.network.rank(id);
  }

  @Post("submissions/:id/accept")
  @RequirePermission("purchase.rfq.quote")
  async accept(
    @Param("id") id: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.network.acceptSubmission(id, requireKey(key));
  }
}
