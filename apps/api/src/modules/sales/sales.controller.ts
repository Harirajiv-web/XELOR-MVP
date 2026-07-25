import { Body, Controller, Get, Headers, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { SalesService } from "./sales.service.js";

const customerSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  gstin: z.string().optional(),
  isRegistered: z.boolean().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  billingAddress: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  creditDays: z.number().int().min(0).max(365).optional(),
  acknowledgeDuplicates: z.boolean().optional(),
});

const orderSchema = z.object({
  customerId: z.string().uuid(),
  custPoNo: z.string().min(1),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supplierGstin: z.string().min(15).max(15),
  shipToStateCode: z.string().regex(/^\d{2}$/).optional(),
  shipToGstin: z.string().optional(),
  shipToAddress: z.string().optional(),
  fgWarehouseId: z.string().uuid().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        qty: z.number().positive(),
        rate: z.number().nonnegative(),
        hsn: z.string().regex(/^(\d{4}|\d{6}|\d{8})$/, "HSN must be 4, 6 or 8 digits"),
        gstRatePct: z.number().min(0).max(28),
        discountPct: z.number().min(0).max(99.99).optional(),
        uom: z.string().optional(),
      }),
    )
    .min(1),
});

const confirmSchema = z.object({ overrideReason: z.string().min(1).optional() });

const dispatchSchema = z.object({
  lines: z.array(z.object({ orderLineId: z.string().uuid(), qty: z.number().positive() })).min(1),
  transporter: z.string().optional(),
  vehicleNo: z.string().optional(),
  ewayBillNo: z.string().optional(),
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

@Controller("sales")
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  /** 409 `duplicate_suspected` mirrors GENERAL/PURCHASE: the brain explains, the human decides. */
  @Post("customers")
  @RequirePermission("sales.customer.create")
  async createCustomer(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const p = customerSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    const r = await this.sales.createCustomer(p.data, idk);
    if (r.outcome === "duplicate_suspected") {
      res.status(409);
      return r;
    }
    res.status(201);
    return r.customer;
  }

  @Get("customers")
  @RequirePermission("sales.customer.read")
  async listCustomers(@Query() query: unknown) {
    const p = listQuerySchema.safeParse(query);
    if (!p.success) badRequest(p.error.issues);
    return this.sales.listCustomers(p.data.limit, p.data.cursor);
  }

  @Post("orders")
  @RequirePermission("sales.order.create")
  async createOrder(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = orderSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.sales.createOrder(p.data, idk);
  }

  /** Overriding a credit hold needs its own permission and a reason — both audited. */
  @Post("orders/:id/confirm")
  @RequirePermission("sales.order.confirm")
  async confirm(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = confirmSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.sales.confirmOrder(id, idk, p.data.overrideReason ? { reason: p.data.overrideReason } : undefined);
  }

  @Post("orders/:id/dispatch")
  @RequirePermission("sales.dispatch.execute")
  async dispatch(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = dispatchSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.sales.dispatchOrder(id, p.data, idk);
  }

  @Get("orders/:id")
  @RequirePermission("sales.order.read")
  async getOrder(@Param("id") id: string) {
    return this.sales.getOrder(id);
  }

  @Get("orders")
  @RequirePermission("sales.order.read")
  async listOrders(@Query() query: unknown) {
    const p = listQuerySchema.safeParse(query);
    if (!p.success) badRequest(p.error.issues);
    return this.sales.listOrders(p.data.limit, p.data.cursor);
  }
}
