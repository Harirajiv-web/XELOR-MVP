import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { QuotationService } from "./quotation.service.js";

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}
function requireKey(key?: string): string {
  if (!key) {
    throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
  }
  return key;
}

const lineSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  rate: z.number().min(0),
  hsn: z.string().min(1),
  gstRatePct: z.number().min(0).max(100),
  uom: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  requestedDeliveryDate: z.string().date().optional(),
});

const createSchema = z.object({
  customerId: z.string().uuid(),
  enquiryRef: z.string().max(120).optional(),
  quoteDate: z.string().date().optional(),
  validUntil: z.string().date(),
  paymentTerms: z.string().max(240).optional(),
  deliveryTerms: z.string().max(240).optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(lineSchema).min(1),
});

const decideSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  lostReason: z.string().max(500).optional(),
});

const convertSchema = z.object({
  custPoNo: z.string().min(1).max(60),
  supplierGstin: z.string().min(15).max(15),
  fgWarehouseId: z.string().uuid().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/**
 * The quotation half of the sell side. Lives in SALES because a quotation becomes a sales
 * order, and the conversion must run through Sales' own service rather than writing an
 * order behind its back — the GST treatment, the credit gate and the numbering are Sales'
 * to apply, and an order that skipped them would be a different kind of document wearing
 * the same name.
 */
@Controller("sales/quotations")
export class QuotationController {
  constructor(private readonly quotations: QuotationService) {}

  @Get()
  @RequirePermission("sales.quotation.read")
  async list(@Query() query: unknown) {
    const p = listQuerySchema.safeParse(query ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.quotations.list(p.data.limit, p.data.cursor);
  }

  @Get(":id")
  @RequirePermission("sales.quotation.read")
  async view(@Param("id") id: string) {
    return this.quotations.view(id);
  }

  @Post()
  @RequirePermission("sales.quotation.create")
  async create(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = createSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.quotations.create(p.data, idk);
  }

  /** Re-pricing supersedes rather than overwrites, so the revision they saw stays readable. */
  @Post(":id/revise")
  @RequirePermission("sales.quotation.create")
  async revise(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = createSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.quotations.revise(id, p.data, idk);
  }

  @Post(":id/send")
  @RequirePermission("sales.quotation.send")
  async send(@Param("id") id: string, @Headers("idempotency-key") key?: string) {
    return this.quotations.send(id, requireKey(key));
  }

  @Post(":id/decide")
  @RequirePermission("sales.quotation.decide")
  async decide(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = decideSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.quotations.decide(id, p.data.decision, idk, p.data.lostReason);
  }

  @Post(":id/convert")
  @RequirePermission("sales.quotation.convert")
  async convert(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = convertSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.quotations.convert(id, p.data, idk);
  }
}
