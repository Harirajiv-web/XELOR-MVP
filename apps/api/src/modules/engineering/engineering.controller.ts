import { Body, Controller, Get, Headers, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { EngineeringService } from "./engineering.service.js";

const createItemSchema = z.object({
  itemCode: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  itemType: z.enum(["raw_material", "component", "sub_assembly", "finished_good", "consumable"]),
  uom: z.string().min(1).max(20),
  hsnCode: z.string().max(10).optional(),
  itemGroup: z.string().max(100).optional(),
  isPurchasable: z.boolean().optional(),
  isManufacturable: z.boolean().optional(),
  isSellable: z.boolean().optional(),
  standardCost: z.number().nonnegative().optional(),
  acknowledgeDuplicates: z.boolean().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

@Controller("engineering/items")
export class EngineeringController {
  constructor(private readonly engineering: EngineeringService) {}

  @Post()
  @RequirePermission("engineering.item.create")
  async create(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw Errors.validation([
        { field: "Idempotency-Key", message: "header is required on mutations" },
      ]);
    }
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    const { acknowledgeDuplicates, ...input } = parsed.data;
    const result = await this.engineering.createItem(input, idempotencyKey, acknowledgeDuplicates);
    if (result.outcome === "duplicate_suspected") {
      res.status(409);
      return result;
    }
    res.status(201);
    return result.item;
  }

  @Get()
  @RequirePermission("engineering.item.read")
  async list(@Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    return this.engineering.listItems(parsed.data.limit, parsed.data.cursor);
  }
}
