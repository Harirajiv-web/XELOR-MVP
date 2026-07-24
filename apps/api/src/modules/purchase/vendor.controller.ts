import { Body, Controller, Get, Headers, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { PurchaseService } from "./purchase.service.js";

const createVendorSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  gstin: z.string().max(15).optional(),
  contactEmail: z.string().email().max(200).optional(),
  contactPhone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  paymentTerms: z.string().max(60).optional(),
  acknowledgeDuplicates: z.boolean().optional(),
});
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

@Controller("purchase/vendors")
export class VendorController {
  constructor(private readonly purchase: PurchaseService) {}

  @Post()
  @RequirePermission("purchase.vendor.create")
  async create(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
    }
    const parsed = createVendorSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    const { acknowledgeDuplicates, ...input } = parsed.data;
    const result = await this.purchase.createVendor(input, idempotencyKey, acknowledgeDuplicates);
    if (result.outcome === "duplicate_suspected") {
      res.status(409);
      return result;
    }
    res.status(201);
    return result.vendor;
  }

  @Get()
  @RequirePermission("purchase.vendor.read")
  async list(@Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    return this.purchase.listVendors(parsed.data.limit, parsed.data.cursor);
  }
}
