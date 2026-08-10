import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { PurchaseService } from "./purchase.service.js";

const poLineSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
});
const createPoSchema = z.object({
  vendorId: z.string().uuid(),
  expectedDate: z.string().optional(),
  currency: z.string().max(3).optional(),
  remarks: z.string().max(500).optional(),
  lines: z.array(poLineSchema).min(1),
});
/**
 * A correction. `reason` is shape-validated here; WHETHER it is required is the edit
 * policy's call against the PO's actual status, which a controller cannot know.
 */
const editPoSchema = z.object({
  expectedDate: z.string().nullable().optional(),
  currency: z.string().max(3).optional(),
  remarks: z.string().max(500).nullable().optional(),
  lines: z.array(poLineSchema).min(1).optional(),
  reason: z.string().trim().min(3, "say why in a few words").optional(),
});
const actSchema = z.object({ comment: z.string().max(500).optional() });
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

@Controller("purchase/orders")
export class PoController {
  constructor(private readonly purchase: PurchaseService) {}

  @Post()
  @RequirePermission("purchase.po.create")
  async create(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = createPoSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.purchase.createPo(p.data, idk);
  }

  /**
   * Correct or amend a purchase order.
   *
   * Guarded by the LOWER permission. Whether this particular PO needs `purchase.po.amend`
   * depends on its status, which the guard cannot see, so the service checks it against the
   * document's actual state — a guard that demanded the higher right for every edit would
   * make correcting a draft impossible for the buyer who wrote it.
   *
   * An amendment past approval WITHDRAWS the PO from approval and returns it to draft.
   */
  @Patch(":id")
  @RequirePermission("purchase.po.update")
  async edit(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = editPoSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.purchase.editPo(id, p.data, idk);
  }

  /**
   * AMEND an approved PO — the same operation, behind the higher permission.
   *
   * A buyer who may fix their own draft is not automatically someone who may change a
   * commitment the vendor is already holding. Separating the routes is what makes that
   * distinction real in the permission wall rather than only in the policy table.
   */
  @Patch(":id/amend")
  @RequirePermission("purchase.po.amend")
  async amend(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = editPoSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.purchase.editPo(id, p.data, idk);
  }

  /** May this PO be edited right now, and what should the user be told if not? */
  @Get(":id/edit-policy")
  @RequirePermission("purchase.po.read")
  async editPolicy(@Param("id") id: string) {
    return this.purchase.poEditPolicy(id);
  }

  /** Every correction ever made to this PO, newest first. */
  @Get(":id/history")
  @RequirePermission("purchase.po.read")
  async history(@Param("id") id: string) {
    return { entries: await this.purchase.poHistory(id) };
  }

  @Post(":id/submit")
  @RequirePermission("purchase.po.submit")
  async submit(@Param("id") id: string, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    return this.purchase.submitPo(id, idk);
  }

  // approve / reject carry NO static permission — the W1 engine enforces that the actor
  // is the correct approver for the PO's current step.
  @Post(":id/approve")
  async approve(@Param("id") id: string, @Body() body: unknown) {
    const p = actSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.purchase.actOnPo(id, "approve", p.data.comment);
  }

  @Post(":id/reject")
  async reject(@Param("id") id: string, @Body() body: unknown) {
    const p = actSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.purchase.actOnPo(id, "reject", p.data.comment);
  }

  @Get(":id")
  @RequirePermission("purchase.po.read")
  async get(@Param("id") id: string) {
    return this.purchase.getPo(id);
  }

  @Get()
  @RequirePermission("purchase.po.read")
  async list(@Query() query: unknown) {
    const p = listQuerySchema.safeParse(query);
    if (!p.success) badRequest(p.error.issues);
    return this.purchase.listPos(p.data.limit, p.data.cursor);
  }
}
