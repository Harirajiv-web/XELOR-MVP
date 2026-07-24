import { Body, Controller, Headers, Post } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { InventoryService } from "./inventory.service.js";

const lineSchema = z.object({
  itemId: z.string().uuid(),
  fromWarehouseId: z.string().uuid().optional(),
  toWarehouseId: z.string().uuid().optional(),
  batch: z.string().max(60).optional(),
  qty: z.number().refine((v) => v !== 0, "qty must be non-zero"),
});
const postSchema = z.object({
  entryType: z.enum(["receipt", "issue", "transfer", "adjustment"]),
  reasonCode: z.string().max(60).optional(),
  remarks: z.string().max(500).optional(),
  lines: z.array(lineSchema).min(1),
});

/**
 * THE single write path to stock (DECISIONS-V2 §5.6): POST /api/v1/stock/entries.
 * Owned by Inventory; Production and every other module post here — nothing writes the
 * stock tables directly. Ledger-critical + race-safe inside the service.
 */
@Controller("stock/entries")
export class StockController {
  constructor(private readonly inventory: InventoryService) {}

  @Post()
  @RequirePermission("inventory.stock.post")
  async post(@Body() body: unknown, @Headers("idempotency-key") idempotencyKey?: string) {
    if (!idempotencyKey) {
      throw Errors.validation([
        { field: "Idempotency-Key", message: "header is required on mutations" },
      ]);
    }
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    return this.inventory.post(parsed.data, idempotencyKey);
  }
}
