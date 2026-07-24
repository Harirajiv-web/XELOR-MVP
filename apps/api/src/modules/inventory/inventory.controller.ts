import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { InventoryService } from "./inventory.service.js";

const onHandQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
});

@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("warehouses")
  @RequirePermission("inventory.warehouse.read")
  async warehouses() {
    return this.inventory.listWarehouses();
  }

  /** Current on-hand balances (non-zero), optionally filtered by item and/or warehouse. */
  @Get("stock")
  @RequirePermission("inventory.stock.read")
  async stock(@Query() query: unknown) {
    const parsed = onHandQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    return this.inventory.onHand(parsed.data);
  }
}
