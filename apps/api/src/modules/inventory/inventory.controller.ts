import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { InventoryService } from "./inventory.service.js";

const onHandQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
});

const editWarehouseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  warehouseType: z.enum(["accepted", "quarantine", "wip", "finished", "scrap", "general"]).optional(),
});

@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** Correct a warehouse's details. `code` is not editable — it is stencilled on the building. */
  @Patch("warehouses/:id")
  @RequirePermission("inventory.warehouse.update")
  async editWarehouse(@Param("id") id: string, @Body() body: unknown) {
    const parsed = editWarehouseSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    return this.inventory.editWarehouse(id, parsed.data);
  }

  /**
   * Why a stock entry has no Edit button.
   *
   * Always answers `editable: false` with `correctBy: "stock_adjustment"`. Offering a route
   * that explains beats offering no route at all: a 404 tells a client its URL is wrong,
   * this tells a storekeeper what to do instead.
   */
  @Get("stock/edit-policy")
  @RequirePermission("inventory.stock.read")
  stockEditPolicy() {
    return this.inventory.stockEntryEditPolicy();
  }


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
