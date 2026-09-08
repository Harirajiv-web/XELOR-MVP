import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { RfqService } from "./rfq.service.js";

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}
function requireKey(key?: string): string {
  if (!key) {
    throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
  }
  return key;
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  uom: z.string().min(1).max(20),
  drawingRev: z.string().max(60).optional(),
  needDate: z.string().date(),
  quoteDeadline: z.string().date(),
  deliveryPlant: z.string().min(1).max(60),
  originRef: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  vendorIds: z.array(z.string().uuid()).min(1),
});

const quoteSchema = z.object({
  vendorId: z.string().uuid(),
  unitPrice: z.number().min(0),
  toolingCost: z.number().min(0).optional(),
  freightCost: z.number().min(0).optional(),
  nonCreditableTax: z.number().min(0).optional(),
  moq: z.number().min(0).optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  promisedDate: z.string().date().optional(),
  validUntil: z.string().date().optional(),
});

const gateSchema = z.object({
  gate: z.enum(["pass", "conditional", "fail"]),
  note: z.string().max(1000).optional(),
});

const awardSchema = z.object({
  quoteId: z.string().uuid(),
  awardReason: z.string().min(3).max(1000),
  expectedDate: z.string().date().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/**
 * Sourcing lives in PURCHASE because an award becomes a purchase order, and that order must
 * be raised by Purchase's own service — approval route, numbering and audit included. A
 * sourcing module that wrote its own purchase orders would be a second, quieter way to
 * commit the company's money.
 */
@Controller("purchase/rfqs")
export class RfqController {
  constructor(private readonly rfqs: RfqService) {}

  @Get()
  @RequirePermission("purchase.rfq.read")
  async list(@Query() query: unknown) {
    const p = listQuerySchema.safeParse(query ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.rfqs.list(p.data.limit, p.data.cursor);
  }

  @Get(":id")
  @RequirePermission("purchase.rfq.read")
  async view(@Param("id") id: string) {
    return this.rfqs.view(id);
  }

  @Post()
  @RequirePermission("purchase.rfq.create")
  async create(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = createSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.rfqs.createRfq(p.data, idk);
  }

  @Post(":id/issue")
  @RequirePermission("purchase.rfq.issue")
  async issue(@Param("id") id: string, @Headers("idempotency-key") key?: string) {
    return this.rfqs.issue(id, requireKey(key));
  }

  @Post(":id/quotes")
  @RequirePermission("purchase.rfq.quote")
  async recordQuote(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = quoteSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.rfqs.recordQuote(id, p.data, idk);
  }

  /** The specification judgement, recorded before anything is ranked on price. */
  @Post(":id/quotes/:quoteId/gate")
  @RequirePermission("purchase.rfq.quote")
  async gate(
    @Param("id") id: string,
    @Param("quoteId") quoteId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const p = gateSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.rfqs.setGate(id, quoteId, p.data.gate, p.data.note, idk);
  }

  @Post(":id/award")
  @RequirePermission("purchase.rfq.award")
  async award(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = awardSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.rfqs.award(id, p.data, idk);
  }
}
