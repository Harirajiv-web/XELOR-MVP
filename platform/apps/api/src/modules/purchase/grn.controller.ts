import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { PurchaseService } from "./purchase.service.js";

const grnLineSchema = z.object({
  poLineId: z.string().uuid(),
  qty: z.number().positive(),
  batch: z.string().max(60).optional(),
});
const createGrnSchema = z.object({
  poId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  grnDate: z.string().optional(),
  lines: z.array(grnLineSchema).min(1),
});

@Controller("purchase/grns")
export class GrnController {
  constructor(private readonly purchase: PurchaseService) {}

  @Post()
  @RequirePermission("purchase.grn.create")
  async create(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    if (!key) {
      throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
    }
    const p = createGrnSchema.safeParse(body);
    if (!p.success) {
      throw Errors.validation(p.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    return this.purchase.createGrn(p.data, key);
  }

  @Get(":id")
  @RequirePermission("purchase.grn.read")
  async get(@Param("id") id: string) {
    return this.purchase.getGrn(id);
  }
}
