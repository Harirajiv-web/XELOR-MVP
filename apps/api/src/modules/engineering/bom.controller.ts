import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { EngineeringService } from "./engineering.service.js";

const bomLineSchema = z.object({
  componentItemId: z.string().uuid(),
  qty: z.number().positive(),
  uom: z.string().min(1).max(20),
  scrapPct: z.number().min(0).max(100).optional(),
});
const createBomSchema = z.object({
  itemId: z.string().uuid(),
  version: z.number().int().positive().optional(),
  outputQty: z.number().positive().optional(),
  uom: z.string().min(1).max(20),
  notes: z.string().max(1000).optional(),
  lines: z.array(bomLineSchema).min(1),
});

@Controller("engineering/boms")
export class BomController {
  constructor(private readonly engineering: EngineeringService) {}

  @Post()
  @RequirePermission("engineering.bom.create")
  async create(@Body() body: unknown, @Headers("idempotency-key") idempotencyKey?: string) {
    if (!idempotencyKey) {
      throw Errors.validation([
        { field: "Idempotency-Key", message: "header is required on mutations" },
      ]);
    }
    const parsed = createBomSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    return this.engineering.createBom(parsed.data, idempotencyKey);
  }

  @Get(":id")
  @RequirePermission("engineering.bom.read")
  async get(@Param("id") id: string) {
    return this.engineering.getBom(id);
  }
}
