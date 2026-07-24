import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  AppError,
  Errors,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";

const { warehouse, stockEntry, stockEntryLine, stockLedger, stockBalance } = schema;

export type StockEntryType = "receipt" | "issue" | "transfer" | "adjustment";

export interface StockEntryLineInput {
  itemId: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  batch?: string;
  qty: number;
}
export interface PostStockEntryInput {
  entryType: StockEntryType;
  reasonCode?: string;
  remarks?: string;
  lines: StockEntryLineInput[];
}

interface Movement {
  itemId: string;
  warehouseId: string;
  batch: string;
  delta: number;
  balanceAfter: number;
}
export interface PostStockEntryResult {
  entryId: string;
  entryType: StockEntryType;
  lineCount: number;
  movements: Movement[];
}

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  warehouseType: string;
}
export interface OnHandRow {
  itemId: string;
  warehouseId: string;
  warehouseCode: string;
  batch: string;
  qty: string;
}

/**
 * INVENTORY — the single write path to stock (§5.6) and the ledger-critical posting
 * engine (§5.5). Posting a stock entry is ONE synchronous transaction: for every
 * movement it locks the contended balance row FOR UPDATE, refuses to let stock go
 * negative, updates the balance, and appends an immutable ledger row. The stock.entry.
 * posted event is fired for side-effects only — the ledger write never rides the bus.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly audit: AuditLogService) {}

  async postStockEntry(
    input: PostStockEntryInput,
    idempotencyKey: string,
  ): Promise<PostStockEntryResult> {
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doPost(input),
    }));
    return result.body;
  }

  private async doPost(input: PostStockEntryInput): Promise<PostStockEntryResult> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "at least one line is required" }]);
    }
    if (input.entryType === "adjustment" && !input.reasonCode) {
      throw Errors.validation([{ field: "reasonCode", message: "required for an adjustment" }]);
    }
    // Per-type line shape + collect the referenced warehouses.
    const whIds = new Set<string>();
    for (const [i, l] of input.lines.entries()) {
      const where = (m: string): AppError =>
        new AppError("STOCK_LINE_INVALID", 422, `line ${i + 1}: ${m}`);
      if (input.entryType !== "adjustment" && l.qty <= 0) throw where("qty must be > 0");
      if (input.entryType === "adjustment" && l.qty === 0) throw where("adjustment qty must be non-zero");
      switch (input.entryType) {
        case "receipt":
          if (!l.toWarehouseId || l.fromWarehouseId) throw where("receipt needs toWarehouseId only");
          whIds.add(l.toWarehouseId);
          break;
        case "issue":
          if (!l.fromWarehouseId || l.toWarehouseId) throw where("issue needs fromWarehouseId only");
          whIds.add(l.fromWarehouseId);
          break;
        case "transfer":
          if (!l.fromWarehouseId || !l.toWarehouseId) throw where("transfer needs both warehouses");
          if (l.fromWarehouseId === l.toWarehouseId) throw where("transfer warehouses must differ");
          whIds.add(l.fromWarehouseId);
          whIds.add(l.toWarehouseId);
          break;
        case "adjustment":
          if (!l.toWarehouseId || l.fromWarehouseId) throw where("adjustment needs toWarehouseId only");
          whIds.add(l.toWarehouseId);
          break;
      }
    }

    const { tenantId, actorId } = currentTenant();
    const now = new Date();

    return withTenant(async (tx) => {
      // Every referenced warehouse must exist (intra-module, so we validate directly).
      const found = await tx
        .select({ id: warehouse.id })
        .from(warehouse)
        .where(inArray(warehouse.id, [...whIds]));
      const foundSet = new Set(found.map((r) => r.id));
      const missing = [...whIds].filter((id) => !foundSet.has(id));
      if (missing.length > 0) throw Errors.notFound(`warehouse(s) ${missing.join(", ")}`);

      const entryId = newId();
      await tx.insert(stockEntry).values({
        id: entryId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        entryType: input.entryType,
        reasonCode: input.reasonCode ?? null,
        remarks: input.remarks ?? null,
      });

      const movements: Movement[] = [];
      for (const [i, l] of input.lines.entries()) {
        const batch = l.batch ?? "";
        await tx.insert(stockEntryLine).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          entryId,
          lineNo: i + 1,
          itemId: l.itemId,
          fromWarehouseId: l.fromWarehouseId ?? null,
          toWarehouseId: l.toWarehouseId ?? null,
          batch,
          qty: l.qty.toFixed(3),
        });

        const deltas: Array<{ whId: string; delta: number }> = [];
        if (input.entryType === "receipt") deltas.push({ whId: l.toWarehouseId!, delta: l.qty });
        else if (input.entryType === "issue") deltas.push({ whId: l.fromWarehouseId!, delta: -l.qty });
        else if (input.entryType === "transfer") {
          deltas.push({ whId: l.fromWarehouseId!, delta: -l.qty });
          deltas.push({ whId: l.toWarehouseId!, delta: l.qty });
        } else deltas.push({ whId: l.toWarehouseId!, delta: l.qty }); // adjustment (signed)

        for (const d of deltas) {
          const balanceAfter = await this.applyMovement(
            tx, tenantId, actorId, l.itemId, d.whId, batch, d.delta, entryId, input.entryType, input.reasonCode ?? null, now,
          );
          movements.push({ itemId: l.itemId, warehouseId: d.whId, batch, delta: d.delta, balanceAfter });
        }
      }

      await this.audit.appendInTx(tx, {
        action: "inventory.stock.posted",
        entityType: "stock_entry",
        entityId: entryId,
        data: { entryType: input.entryType, lineCount: input.lines.length, reasonCode: input.reasonCode ?? null },
      });
      // Side-effect event only — the ledger write above is the synchronous source of truth.
      await tx.insert(schema.outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("inventory", "stock", "posted"),
        payload: { entryId, entryType: input.entryType, lineCount: input.lines.length },
        createdAt: now,
      });

      return { entryId, entryType: input.entryType, lineCount: input.lines.length, movements };
    });
  }

  /** Lock the (item, warehouse, batch) balance FOR UPDATE, apply delta, refuse negative,
   *  and append the immutable ledger row. Returns the resulting balance. */
  private async applyMovement(
    tx: Tx,
    tenantId: string,
    actorId: string,
    itemId: string,
    warehouseId: string,
    batch: string,
    delta: number,
    entryId: string,
    entryType: string,
    reasonCode: string | null,
    now: Date,
  ): Promise<number> {
    // Ensure the row exists, then lock it — concurrent postings serialise here.
    await tx.execute(sql`
      insert into stock_balance (id, tenant_id, item_id, warehouse_id, batch, qty)
      values (${newId()}, ${tenantId}, ${itemId}, ${warehouseId}, ${batch}, 0)
      on conflict (tenant_id, item_id, warehouse_id, batch) do nothing
    `);
    const locked = await tx.execute<{ qty: string }>(sql`
      select qty from stock_balance
      where tenant_id = ${tenantId} and item_id = ${itemId}
        and warehouse_id = ${warehouseId} and batch = ${batch}
      for update
    `);
    const current = Number(locked.rows[0]?.qty ?? 0);
    const next = current + delta;
    if (next < 0) {
      throw new AppError(
        "INSUFFICIENT_STOCK",
        409,
        `Insufficient stock: ${current} available, ${-delta} requested (warehouse ${warehouseId}${batch ? `, batch ${batch}` : ""}).`,
      );
    }
    await tx.execute(sql`
      update stock_balance set qty = ${next.toFixed(3)}, updated_at = now()
      where tenant_id = ${tenantId} and item_id = ${itemId}
        and warehouse_id = ${warehouseId} and batch = ${batch}
    `);
    await tx.insert(stockLedger).values({
      id: newId(),
      tenantId,
      itemId,
      warehouseId,
      batch,
      qty: delta.toFixed(3),
      entryId,
      entryType,
      reasonCode,
      postedAt: now,
      createdBy: actorId,
    });
    return next;
  }

  async listWarehouses(): Promise<WarehouseRow[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({ id: warehouse.id, code: warehouse.code, name: warehouse.name, warehouseType: warehouse.warehouseType })
        .from(warehouse)
        .where(eq(warehouse.isActive, true))
        .orderBy(asc(warehouse.code));
      return rows;
    });
  }

  /** Current on-hand balances (non-zero), optionally filtered by item and/or warehouse. */
  async onHand(filter: { itemId?: string; warehouseId?: string }): Promise<OnHandRow[]> {
    return withTenant(async (tx) => {
      const conds: SQL[] = [sql`sb.qty <> 0`];
      if (filter.itemId) conds.push(sql`sb.item_id = ${filter.itemId}`);
      if (filter.warehouseId) conds.push(sql`sb.warehouse_id = ${filter.warehouseId}`);
      const rows = await tx.execute<{
        item_id: string;
        warehouse_id: string;
        warehouse_code: string;
        batch: string;
        qty: string;
      }>(sql`
        select sb.item_id, sb.warehouse_id, w.code as warehouse_code, sb.batch, sb.qty
        from stock_balance sb
        join warehouse w on w.id = sb.warehouse_id
        where ${sql.join(conds, sql` and `)}
        order by w.code, sb.item_id
      `);
      return rows.rows.map((r) => ({
        itemId: r.item_id,
        warehouseId: r.warehouse_id,
        warehouseCode: r.warehouse_code,
        batch: r.batch,
        qty: r.qty,
      }));
    });
  }
}
