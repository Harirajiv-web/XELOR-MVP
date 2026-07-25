import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { QualityService } from "./quality.service.js";

const openSchema = z.object({
  itemId: z.string().uuid(),
  lotQty: z.number().positive(),
  sourceWarehouseId: z.string().uuid().optional(),
  inspectionType: z
    .enum(["incoming", "in_process", "final", "pre_dispatch", "first_article"])
    .optional(),
});

/** A reading is EITHER a measurement (variable) OR a go/no-go (attribute) — never both. */
const readingsSchema = z.object({
  readings: z
    .array(
      z
        .object({
          characteristicId: z.string().uuid(),
          sampleNo: z.number().int().positive(),
          value: z.number().optional(),
          conforming: z.boolean().optional(),
        })
        .refine((r) => r.value != null || r.conforming != null, {
          message: "send either a numeric value or a conforming flag",
        }),
    )
    .min(1),
});

const dispositionSchema = z.object({
  dispositionType: z.enum(["accept", "quarantine", "rework", "scrap", "return_to_supplier"]),
  qty: z.number().positive(),
  reason: z.string().min(1),
  targetWarehouseId: z.string().uuid().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}
function requireKey(key?: string): string {
  if (!key) throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
  return key;
}

/**
 * INSPECTION (Module 06). Note what is NOT here: no endpoint releases a GRN or a
 * production order. The gate belongs to the module that owns the transaction; Quality
 * only answers through the INSPECTION_GATE port (INSPECTION §1.2).
 */
@Controller("quality/inspections")
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Post()
  @RequirePermission("quality.inspection.execute")
  async open(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = openSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.quality.openStandalone(p.data, idk);
  }

  @Post(":id/readings")
  @RequirePermission("quality.inspection.execute")
  async readings(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = readingsSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.quality.recordReadings(id, p.data.readings, idk);
  }

  @Post(":id/complete")
  @RequirePermission("quality.inspection.execute")
  async complete(@Param("id") id: string, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    return this.quality.completeInspection(id, idk);
  }

  @Post(":id/disposition")
  @RequirePermission("quality.disposition.decide")
  async disposition(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = dispositionSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.quality.decideDisposition(id, p.data, idk);
  }

  @Get(":id")
  @RequirePermission("quality.inspection.read")
  async get(@Param("id") id: string) {
    return this.quality.getInspection(id);
  }

  @Get()
  @RequirePermission("quality.inspection.read")
  async list(@Query() query: unknown) {
    const p = listQuerySchema.safeParse(query);
    if (!p.success) badRequest(p.error.issues);
    return this.quality.listInspections(p.data.limit, p.data.cursor);
  }
}
