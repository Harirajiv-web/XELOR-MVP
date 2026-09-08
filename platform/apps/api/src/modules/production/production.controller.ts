import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
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
const addOperationSchema = z
  .object({
    sequence: z.number().int().positive(),
    operationCode: z.string().trim().min(1).max(40),
    operationName: z.string().trim().min(1).max(160),
    workCenterRef: z.string().trim().min(1).max(120).optional(),
    plannedStart: z.string().datetime({ offset: true }).optional(),
    plannedEnd: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (value) => !value.plannedStart || !value.plannedEnd || value.plannedEnd >= value.plannedStart,
    { path: ["plannedEnd"], message: "must not be before plannedStart" },
  );
const startOperationSchema = z.object({
  operatorRef: z.string().trim().min(1).max(160),
  at: z.string().datetime({ offset: true }).optional(),
  inputQty: z.number().nonnegative().optional(),
});
const completeOperationSchema = z
  .object({
    outputQty: z.number().nonnegative(),
    rejectedQty: z.number().nonnegative().default(0),
    evidenceNote: z.string().trim().min(8).max(2_000),
    at: z.string().datetime({ offset: true }).optional(),
  })
  .refine((value) => value.outputQty + value.rejectedQty > 0, {
    path: ["outputQty"],
    message: "outputQty and rejectedQty cannot both be zero",
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

const editOrderSchema = z.object({
  qtyToProduce: z.number().positive().optional(),
  sourceWarehouseId: z.string().uuid().optional(),
  fgWarehouseId: z.string().uuid().optional(),
  reason: z.string().trim().min(3, "say why in a few words").optional(),
});

@Controller("production/orders")
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  /**
   * Correct or amend a production order's target and warehouses.
   *
   * Changing the target RE-EXPLODES the component requirement. It does not touch what has
   * already been issued — the gap between required and issued is the shortage the
   * supervisor needs to see, not something to paper over.
   */
  @Patch(":id")
  @RequirePermission("production.order.update")
  async edit(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = editOrderSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.production.editOrder(id, p.data, idk);
  }

  /** May this order be edited right now, and what should the user be told if not? */
  @Get(":id/edit-policy")
  @RequirePermission("production.order.read")
  async editPolicy(@Param("id") id: string) {
    return this.production.orderEditPolicy(id);
  }

  /** Every correction ever made to this order, newest first. */
  @Get(":id/history")
  @RequirePermission("production.order.read")
  async history(@Param("id") id: string) {
    return { entries: await this.production.orderHistory(id) };
  }


  @Post()
  @RequirePermission("production.order.create")
  async create(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = createSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.production.createOrder(p.data, idk);
  }

  @Post(":id/operations")
  @RequirePermission("production.order.create")
  async addOperation(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const p = addOperationSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.production.addOperation(id, p.data, idk);
  }

  @Post(":id/operations/:sequence/start")
  @RequirePermission("production.order.execute")
  async startOperation(
    @Param("id") id: string,
    @Param("sequence") sequence: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const parsedSequence = z.coerce.number().int().positive().safeParse(sequence);
    if (!parsedSequence.success) badRequest(parsedSequence.error.issues);
    const p = startOperationSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.production.startOperation(id, parsedSequence.data, p.data, idk);
  }

  @Post(":id/operations/:sequence/complete")
  @RequirePermission("production.order.execute")
  async completeOperation(
    @Param("id") id: string,
    @Param("sequence") sequence: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const parsedSequence = z.coerce.number().int().positive().safeParse(sequence);
    if (!parsedSequence.success) badRequest(parsedSequence.error.issues);
    const p = completeOperationSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.production.completeOperation(id, parsedSequence.data, p.data, idk);
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
