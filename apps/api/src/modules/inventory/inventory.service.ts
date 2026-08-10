import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  round2,
  AppError,
  Errors,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DocumentEditService } from "../../common/document-edit.service.js";
import type {
  StockPoster,
  PostStockEntryInput,
  PostStockEntryResult,
  StockMovement,
  StockEntryLineInput,
} from "../../ports/stock.port.js";
import type { StockReader, OnHandByItem, WarehouseRef } from "../../ports/planning-inputs.port.js";
import { ITEM_PROVIDER, type ItemProvider } from "../../ports/item.port.js";

const { warehouse, stockEntry, stockEntryLine, stockLedger, stockBalance } = schema;

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  warehouseType: string;
}
export interface OnHandRow {
  itemId: string;
  /** The code a person reads and quotes. Added because a stock screen keyed only by uuid
   *  is unreadable — the first screen built on this endpoint showed a column of
   *  identifiers where the operator expected part numbers. */
  itemCode: string;
  itemName: string;
  uom: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  batch: string;
  qty: string;
}

export interface BatchAvailability {
  batch: string;
  qty: number;
}

/**
 * Allocate an unnamed issue across available batches in FIFO order. The database query
 * supplies rows ordered by first receipt; keeping the arithmetic pure makes the safety
 * rules independently testable. Quantities are rounded at the inventory precision.
 */
export function allocateFifoBatches(
  available: readonly BatchAvailability[],
  requestedQty: number,
): Array<{ batch: string; qty: number }> {
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    throw Errors.validation([{ field: "qty", message: "batch allocation quantity must be positive" }]);
  }
  let remaining = Number(requestedQty.toFixed(3));
  const allocations: Array<{ batch: string; qty: number }> = [];
  for (const row of available) {
    if (remaining <= 0) break;
    const usable = Math.max(0, Number(row.qty.toFixed(3)));
    if (usable === 0) continue;
    const take = Number(Math.min(usable, remaining).toFixed(3));
    if (take > 0) allocations.push({ batch: row.batch, qty: take });
    remaining = Number((remaining - take).toFixed(3));
  }
  if (remaining > 0) {
    const total = Number(available.reduce((sum, row) => sum + Math.max(0, row.qty), 0).toFixed(3));
    throw new AppError(
      "INSUFFICIENT_STOCK",
      409,
      `Insufficient stock across batches: ${total} available, ${requestedQty} requested.`,
    );
  }
  return allocations;
}

/**
 * INVENTORY — the single write path to stock (§5.6) and the ledger-critical posting
 * engine (§5.5). Posting a stock entry is ONE synchronous transaction: for every
 * movement it locks the contended balance row FOR UPDATE, refuses to let stock go
 * negative, updates the balance, and appends an immutable ledger row. The stock.entry.
 * posted event is fired for side-effects only — the ledger write never rides the bus.
 */
@Injectable()
export class InventoryService implements StockPoster, StockReader {
  constructor(
    private readonly audit: AuditLogService,
    private readonly edits: DocumentEditService,
    @Inject(ITEM_PROVIDER) private readonly items: ItemProvider,
  ) {}

  /** Standalone post, idempotent on the key — the HTTP write path (§5.6). */
  async post(
    input: PostStockEntryInput,
    idempotencyKey: string,
  ): Promise<PostStockEntryResult> {
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await withTenant((tx) => this.postInTx(tx, input)),
    }));
    return result.body;
  }

  /** Post a stock entry inside the CALLER's transaction (ledger-critical, §5.5/§5.6),
   *  so a document like a GRN and its stock movement commit atomically. */
  async postInTx(tx: Tx, input: PostStockEntryInput): Promise<PostStockEntryResult> {
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

      // Valuation is INVENTORY's, and it happens here so that every consumer of a movement
      // — Purchase's GRN, Production, Maintenance's spare line — receives the same number
      // from the same place and none of them has a reason to compute one of its own.
      // Standard cost is the MVP basis; FIFO/moving-average lands behind this same shape.
      const itemSpecs = await this.items.getItems([...new Set(input.lines.map((l) => l.itemId))]);
      const rateOf = new Map(itemSpecs.map((s) => [s.id, s.standardCost]));

      // An issue/transfer with no nominated batch is not a request for the artificial
      // `batch=''` balance. It means "choose the stock by policy". Resolve it under an
      // advisory transaction lock so concurrent issues cannot both plan against the same
      // lot. Each split becomes an explicit entry line and ledger movement: genealogy is
      // preserved rather than hidden inside a balance update.
      const resolvedLines: StockEntryLineInput[] = [];
      for (const line of input.lines) {
        resolvedLines.push(...(await this.resolveBatches(tx, tenantId, input.entryType, line)));
      }

      const movements: StockMovement[] = [];
      for (const [i, l] of resolvedLines.entries()) {
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
          const valuationRate = rateOf.get(l.itemId) ?? 0;
          movements.push({
            itemId: l.itemId,
            warehouseId: d.whId,
            batch,
            delta: d.delta,
            balanceAfter,
            valuationRate,
            // Signed with the movement: an issue of 1 at Rs 2,840 is -2,840 to stock and
            // +2,840 of consumption for whoever asked for it.
            valuedAmount: round2(Math.abs(d.delta) * valuationRate),
            valuationBasis: "standard_cost",
          });
        }
      }

      await this.audit.appendInTx(tx, {
        action: "inventory.stock.posted",
        entityType: "stock_entry",
        entityId: entryId,
        data: {
          entryType: input.entryType,
          requestedLineCount: input.lines.length,
          postedLineCount: resolvedLines.length,
          reasonCode: input.reasonCode ?? null,
        },
      });
      // Side-effect event only — the ledger write above is the synchronous source of truth.
      await tx.insert(schema.outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("inventory", "stock", "posted"),
        payload: { entryId, entryType: input.entryType, lineCount: resolvedLines.length },
        createdAt: now,
      });

      return { entryId, entryType: input.entryType, lineCount: resolvedLines.length, movements };
  }

  /** Resolve only source-consuming, unnamed lines. Receipts and named lots stay exact. */
  private async resolveBatches(
    tx: Tx,
    tenantId: string,
    entryType: PostStockEntryInput["entryType"],
    line: StockEntryLineInput,
  ): Promise<StockEntryLineInput[]> {
    const sourceWarehouse = entryType === "issue" || entryType === "transfer"
      ? line.fromWarehouseId
      : entryType === "adjustment" && line.qty < 0
        ? line.toWarehouseId
        : undefined;
    const amount = entryType === "adjustment" ? Math.abs(line.qty) : line.qty;
    if (!sourceWarehouse || line.batch != null) return [{ ...line, batch: line.batch ?? "" }];

    await this.lockItemWarehouse(tx, tenantId, line.itemId, sourceWarehouse);
    const rows = await tx.execute<{ batch: string; qty: string }>(sql`
      select sb.batch, sb.qty
        from stock_balance sb
        left join stock_ledger sl
          on sl.tenant_id = sb.tenant_id
         and sl.item_id = sb.item_id
         and sl.warehouse_id = sb.warehouse_id
         and sl.batch = sb.batch
         and sl.qty > 0
       where sb.tenant_id = ${tenantId}
         and sb.item_id = ${line.itemId}
         and sb.warehouse_id = ${sourceWarehouse}
         and sb.qty > 0
       group by sb.batch, sb.qty
       order by min(sl.posted_at) asc nulls last, sb.batch asc
    `);
    const allocations = allocateFifoBatches(
      rows.rows.map((row) => ({ batch: row.batch, qty: Number(row.qty) })),
      amount,
    );
    return allocations.map((allocation) => ({
      ...line,
      batch: allocation.batch,
      qty: entryType === "adjustment" ? -allocation.qty : allocation.qty,
    }));
  }

  /** Serialize every withdrawal for one item/location, including explicitly named lots. */
  private async lockItemWarehouse(
    tx: Tx,
    tenantId: string,
    itemId: string,
    warehouseId: string,
  ): Promise<void> {
    await tx.execute(sql`
      select pg_advisory_xact_lock(
        hashtextextended(${`${tenantId}:${itemId}:${warehouseId}`}, 0)
      )
    `);
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
    if (delta < 0) await this.lockItemWarehouse(tx, tenantId, itemId, warehouseId);
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

  /* ------------------------------ corrections ----------------------------- */

  /**
   * `code` is absent: a warehouse code is stencilled on the building and printed on every
   * gate pass. `warehouseType` is present because a bin genuinely gets recategorised —
   * quarantine becomes accepted when the area is re-certified — and the audit change set
   * is what makes that visible rather than mysterious.
   */
  private static readonly EDITABLE_WAREHOUSE_FIELDS = ["name", "warehouseType"] as const;

  /** Correct a warehouse's details. */
  async editWarehouse(warehouseId: string, patch: { name?: string; warehouseType?: string }) {
    this.edits.requireDocumentId(warehouseId, "warehouse");
    return withTenant(async (tx) => {
      await this.edits.lock(tx, "warehouse", warehouseId);
      const [before] = await tx.select().from(warehouse).where(eq(warehouse.id, warehouseId)).limit(1);
      if (!before) throw Errors.notFound(`warehouse '${warehouseId}'`);

      const outcome = await this.edits.apply(tx, {
        docType: "inventory.warehouse",
        id: warehouseId,
        before: before as unknown as Record<string, unknown>,
        status: before.isActive ? "active" : "inactive",
        patch: patch as Record<string, unknown>,
        editableFields: InventoryService.EDITABLE_WAREHOUSE_FIELDS,
      });

      if (outcome.changed) {
        await tx.update(warehouse).set(outcome.columns).where(eq(warehouse.id, warehouseId));
      }
      const [after] = await tx.select().from(warehouse).where(eq(warehouse.id, warehouseId)).limit(1);
      return after as unknown as WarehouseRow;
    });
  }

  /**
   * A STOCK ENTRY IS NEVER EDITED, and this is the endpoint that says so out loud.
   *
   * The stock ledger is the record of what physically moved. Editing a past movement does
   * not change the shelf — it changes the story about the shelf, which is the one thing a
   * stock system must never do. §5's single write path exists so that every movement has
   * exactly one origin; an edit path would be a second one.
   *
   * Returning a considered refusal rather than a 404 matters: a 404 tells a client the
   * route is wrong, while this tells the user to post a correcting entry, which is the
   * action that actually fixes their problem.
   */
  stockEntryEditPolicy() {
    return this.edits.policy("inventory.stock", "posted");
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
        item_code: string;
        item_name: string;
        uom: string;
        warehouse_id: string;
        warehouse_code: string;
        warehouse_name: string;
        batch: string;
        qty: string;
      }>(sql`
        select sb.item_id, i.item_code, i.name as item_name, i.uom,
               sb.warehouse_id, w.code as warehouse_code, w.name as warehouse_name,
               sb.batch, sb.qty
        from stock_balance sb
        join warehouse w on w.id = sb.warehouse_id
        join item i on i.id = sb.item_id
        where ${sql.join(conds, sql` and `)}
        order by i.item_code, w.code
      `);
      return rows.rows.map((r) => ({
        itemId: r.item_id,
        itemCode: r.item_code,
        itemName: r.item_name,
        uom: r.uom,
        warehouseId: r.warehouse_id,
        warehouseCode: r.warehouse_code,
        warehouseName: r.warehouse_name,
        batch: r.batch,
        qty: r.qty,
      }));
    });
  }

  // ---- StockReader port (read by PLANNING) ----

  /**
   * Total on-hand per item across every warehouse.
   *
   * Items with no balance row come back as 0 rather than being omitted: MRP must plan for
   * an item it has none of, and a caller that has to distinguish "no stock" from "not in
   * the result set" will eventually get it wrong in the direction of not ordering.
   */
  async onHandByItem(itemIds: readonly string[]): Promise<OnHandByItem[]> {
    if (itemIds.length === 0) return [];
    return withTenant(async (tx) => {
      const rows = await tx.execute<{ item_id: string; qty: string }>(sql`
        select sb.item_id, coalesce(sum(sb.qty), 0) as qty
          from stock_balance sb
         where sb.item_id in (${sql.join(itemIds.map((i) => sql`${i}`), sql`, `)})
         group by sb.item_id
      `);
      const found = new Map(rows.rows.map((r) => [r.item_id, Number(r.qty)]));
      return itemIds.map((itemId) => ({ itemId, qty: found.get(itemId) ?? 0 }));
    });
  }

  async listWarehouseRefs(): Promise<WarehouseRef[]> {
    const rows = await this.listWarehouses();
    return rows.map((w) => ({ id: w.id, code: w.code, warehouseType: w.warehouseType }));
  }
}
