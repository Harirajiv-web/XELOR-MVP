import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { ProductionService } from "./production.service.js";

const createSchema = z.object({
  itemId: z.string().uuid(),
  qtyToProduce: z.number().positive(),
  bomId: z.string().uuid().optional(),
  sourceWarehouseId: z.string().uuid(),
  fgWarehouseId: z.string().uuid(),
});
const completeSchema = z.object({ producedQty: z.number().positive() });
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

@Controller("production/orders")
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Post()
  @RequirePermission("production.order.create")
  async create(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = createSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.production.createOrder(p.data, idk);
  }

  @Post(":id/issue")
  @RequirePermission("production.order.execute")
  async issue(@Param("id") id: string, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    return this.production.issueComponents(id, idk);
  }

  @Post(":id/complete")
  @RequirePermission("production.order.execute")
  async complete(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = completeSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.production.complete(id, p.data.producedQty, idk);
  }

  @Get(":id")
  @RequirePermission("production.order.read")
  async get(@Param("id") id: string) {
    return this.production.getOrder(id);
  }

  @Get()
  @RequirePermission("production.order.read")
  async list(@Query() query: unknown) {
    const p = listQuerySchema.safeParse(query);
    if (!p.success) badRequest(p.error.issues);
    return this.production.listOrders(p.data.limit, p.data.cursor);
  }
}
