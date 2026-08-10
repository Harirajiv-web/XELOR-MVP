import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from "@nestjs/common";
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
        /**
         * When the customer wants THIS line. Optional on purpose: orders are genuinely
         * taken without a promised date, and rejecting those would push the operator into
         * inventing one — which is worse, because an invented date is indistinguishable
         * from a promise somebody actually made. PLANNING treats a null as demand in the
         * current bucket and raises a `data_warning` (migration 0033).
         */
        requestedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    )
    .min(1),
});

/**
 * A correction. Every field optional — absent means "leave alone" — so a form that edits
 * one field sends one field. `lines` is all-or-nothing (see EditOrderInput).
 *
 * `reason` is validated here as a shape only. WHETHER it is required is the edit policy's
 * decision, made against the document's actual status, because a controller cannot know
 * whether this particular order is a draft or was confirmed last Tuesday.
 */
const editCustomerSchema = customerSchema.partial().omit({ code: true, acknowledgeDuplicates: true });

const editOrderSchema = orderSchema
  .partial()
  .omit({ customerId: true, supplierGstin: true })
  .extend({ reason: z.string().trim().min(3, "say why in a few words").optional() });

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

  /**
   * Correct a customer's details.
   *
   * PATCH rather than PUT, and the difference is not pedantry: a PUT would mean "this is
   * the whole customer now", so a client that had not loaded the credit limit would blank
   * it. PATCH means "change these", which is what an edit form actually does.
   */
  @Patch("customers/:id")
  @RequirePermission("sales.customer.update")
  async editCustomer(@Param("id") id: string, @Body() body: unknown) {
    const p = editCustomerSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.sales.editCustomer(id, p.data);
  }

  /**
   * Correct or amend a sales order.
   *
   * ONE route for both, guarded by the LOWER of the two permissions. The higher one cannot
   * be enforced here — whether this is a correction or an amendment depends on the order's
   * status, which the guard cannot see — so `sales.order.amend` is checked in the service
   * against the document's actual state. A guard that refused every edit because some
   * orders are confirmed would make the common case unreachable.
   */
  @Patch("orders/:id")
  @RequirePermission("sales.order.update")
  async editOrder(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const p = editOrderSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.sales.editOrder(id, p.data, idk);
  }

  /**
   * AMEND a confirmed order — the same operation, behind the higher permission.
   *
   * Two routes rather than one, and perm-check is what made the case: a permission no
   * route enforces is a grant that confers nothing, so `sales.order.amend` had to be
   * attached to something. Splitting it turns out to be the better design anyway.
   * Correcting your own draft and changing a commitment the customer has already been
   * given are different acts, and now the RBAC wall says so — a clerk can hold
   * `sales.order.update` and still be unable to move a confirmed order.
   *
   * Both routes reach the same service method, so the edit policy remains the single
   * decision-maker about what each status actually permits.
   */
  @Patch("orders/:id/amend")
  @RequirePermission("sales.order.amend")
  async amendOrder(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const idk = requireKey(key);
    const p = editOrderSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.sales.editOrder(id, p.data, idk);
  }

  /**
   * May this order be edited, and if not, what should the user be told?
   *
   * The Edit button asks this before it lights up, so a user learns "this order shipped —
   * raise a credit note" from a disabled button with a reason on it, rather than from a
   * 409 after filling in a form.
   */
  @Get("orders/:id/edit-policy")
  @RequirePermission("sales.order.read")
  async orderEditPolicy(@Param("id") id: string) {
    return this.sales.orderEditPolicy(id);
  }

  /**
   * Every correction ever made to this order.
   *
   * Guarded by the ORDER's read permission, not the audit permission: whoever may read
   * SO-0007 may see that its quantity went from 120 to 96 and why.
   */
  @Get("orders/:id/history")
  @RequirePermission("sales.order.read")
  async orderHistory(@Param("id") id: string) {
    return { entries: await this.sales.orderHistory(id) };
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
