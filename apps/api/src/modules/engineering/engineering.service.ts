import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import type { BomProvider, BomSpec } from "../../ports/bom.port.js";
import {
  newId,
  currentTenant,
  eventName,
  encodeCursor,
  decodeCursor,
  detectDuplicates,
  AppError,
  Errors,
  type DuplicateMatch,
  type MasterRecord,
  type CursorPage,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DedupExplainer } from "../../ai/dedup-explainer.js";

const { item, bom, bomLine, outboxEvent } = schema;

export type ItemType =
  | "raw_material"
  | "component"
  | "sub_assembly"
  | "finished_good"
  | "consumable";

export interface CreateItemInput {
  itemCode: string;
  name: string;
  description?: string;
  itemType: ItemType;
  uom: string;
  hsnCode?: string;
  itemGroup?: string;
  isPurchasable?: boolean;
  isManufacturable?: boolean;
  isSellable?: boolean;
  standardCost?: number;
}

export interface ItemRow {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  uom: string;
  standardCost: string | null;
  createdAt: string;
}

export type CreateItemResult =
  | { outcome: "created"; item: ItemRow }
  | {
      outcome: "duplicate_suspected";
      candidate: MasterRecord;
      matches: DuplicateMatch[];
      explanation: string;
      degraded: boolean;
    };

export interface BomLineInput {
  componentItemId: string;
  qty: number;
  uom: string;
  scrapPct?: number;
}
export interface CreateBomInput {
  itemId: string;
  version?: number;
  outputQty?: number;
  uom: string;
  notes?: string;
  lines: BomLineInput[];
}
export interface BomView {
  id: string;
  itemId: string;
  version: number;
  outputQty: string;
  uom: string;
  notes: string | null;
  lines: Array<{
    lineNo: number;
    componentItemId: string;
    componentCode: string;
    componentName: string;
    qty: string;
    uom: string;
    scrapPct: string;
  }>;
}

/**
 * ENGINEERING item master. createItem repeats the platform pattern GENERAL proved:
 * the shared dedup brain drafts a duplicate concern for a human (§4.3), then one
 * tenant-fenced transaction does the write + hash-chained audit + outbox event.
 */
@Injectable()
export class EngineeringService implements BomProvider {
  constructor(
    private readonly audit: AuditLogService,
    private readonly dedup: DedupExplainer,
  ) {}

  // ---- BomProvider port (read by PRODUCTION) ----

  async getActiveBomForItem(itemId: string): Promise<BomSpec | null> {
    return withTenant(async (tx) => {
      const [b] = await tx
        .select({ id: bom.id, itemId: bom.itemId, version: bom.version, outputQty: bom.outputQty, uom: bom.uom })
        .from(bom)
        .where(and(eq(bom.itemId, itemId), eq(bom.isActive, true)))
        .orderBy(desc(bom.version))
        .limit(1);
      return b ? this.bomSpecInTx(tx, b) : null;
    });
  }

  async getBomById(bomId: string): Promise<BomSpec | null> {
    return withTenant(async (tx) => {
      const [b] = await tx
        .select({ id: bom.id, itemId: bom.itemId, version: bom.version, outputQty: bom.outputQty, uom: bom.uom })
        .from(bom)
        .where(eq(bom.id, bomId))
        .limit(1);
      return b ? this.bomSpecInTx(tx, b) : null;
    });
  }

  private async bomSpecInTx(
    tx: Tx,
    b: { id: string; itemId: string; version: number; outputQty: string; uom: string },
  ): Promise<BomSpec> {
    const lines = await tx
      .select({
        componentItemId: bomLine.componentItemId,
        qty: bomLine.qty,
        uom: bomLine.uom,
        scrapPct: bomLine.scrapPct,
      })
      .from(bomLine)
      .where(eq(bomLine.bomId, b.id))
      .orderBy(asc(bomLine.lineNo));
    return {
      bomId: b.id,
      itemId: b.itemId,
      version: b.version,
      outputQty: Number(b.outputQty),
      uom: b.uom,
      components: lines.map((l) => ({
        componentItemId: l.componentItemId,
        qty: Number(l.qty),
        uom: l.uom,
        scrapPct: Number(l.scrapPct),
      })),
    };
  }

  async createItem(
    input: CreateItemInput,
    idempotencyKey: string,
    acknowledgeDuplicates = false,
  ): Promise<CreateItemResult> {
    if (!acknowledgeDuplicates) {
      const { candidate, matches } = await this.findDuplicates(input);
      if (matches.length > 0) {
        const { text, degraded } = await this.dedup.explain({
          candidate,
          matches,
          fieldLabels: { cin: "item code", legal_name: "name" },
        });
        return { outcome: "duplicate_suspected", candidate, matches, explanation: text, degraded };
      }
    }
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doCreateItem(input),
    }));
    return { outcome: "created", item: result.body };
  }

  /** pg_trgm name prefilter OR exact item_code; the pure detector makes the final call.
   *  An item maps onto MasterRecord as { legalName: name, cin: item_code }. */
  private async findDuplicates(
    input: CreateItemInput,
  ): Promise<{ candidate: MasterRecord; matches: DuplicateMatch[] }> {
    const candidate: MasterRecord = { legalName: input.name, cin: input.itemCode };
    const rows = await withTenant(async (tx) => {
      const res = await tx.execute<{ id: string; item_code: string; name: string }>(sql`
        select id, item_code, name from item
        where is_active = true
          and ( item_code = ${input.itemCode} or similarity(name, ${input.name}) > 0.3 )
        limit 25
      `);
      return res.rows;
    });
    const existing: MasterRecord[] = rows.map((r) => ({
      id: r.id,
      legalName: r.name,
      cin: r.item_code,
    }));
    return { candidate, matches: detectDuplicates(candidate, existing) };
  }

  private async doCreateItem(input: CreateItemInput): Promise<ItemRow> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    const standardCost = input.standardCost != null ? input.standardCost.toFixed(2) : null;

    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(item).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        itemCode: input.itemCode,
        name: input.name,
        description: input.description ?? null,
        itemType: input.itemType,
        uom: input.uom,
        hsnCode: input.hsnCode ?? null,
        itemGroup: input.itemGroup ?? null,
        isPurchasable: input.isPurchasable ?? true,
        isManufacturable: input.isManufacturable ?? false,
        isSellable: input.isSellable ?? false,
        standardCost,
      });

      await this.audit.appendInTx(tx, {
        action: "engineering.item.created",
        entityType: "item",
        entityId: id,
        data: { itemCode: input.itemCode, name: input.name, itemType: input.itemType },
      });

      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("engineering", "item", "created"),
        payload: { id, itemCode: input.itemCode, name: input.name },
        createdAt: now,
      });

      return {
        id,
        itemCode: input.itemCode,
        name: input.name,
        itemType: input.itemType,
        uom: input.uom,
        standardCost,
        createdAt: now.toISOString(),
      };
    });
  }

  // ---- Bill of Materials ----

  async createBom(input: CreateBomInput, idempotencyKey: string): Promise<BomView> {
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doCreateBom(input),
    }));
    return result.body;
  }

  private async doCreateBom(input: CreateBomInput): Promise<BomView> {
    if (input.lines.length === 0) {
      throw Errors.validation([{ field: "lines", message: "a BOM needs at least one component" }]);
    }
    // A component may not be the product itself (a direct cycle). Multi-level cycle
    // detection is deferred to Production planning — noted, not silently skipped.
    if (input.lines.some((l) => l.componentItemId === input.itemId)) {
      throw new AppError("BOM_SELF_REFERENCE", 422, "A BOM cannot contain the item it produces.");
    }

    const { tenantId, actorId } = currentTenant();
    const now = new Date();

    return withTenant(async (tx) => {
      // The produced item must exist (and belongs to this tenant via RLS).
      const [product] = await tx.select({ id: item.id }).from(item).where(eq(item.id, input.itemId)).limit(1);
      if (!product) throw Errors.notFound(`item '${input.itemId}'`);

      // Every component must exist.
      const componentIds = [...new Set(input.lines.map((l) => l.componentItemId))];
      const found = await tx.select({ id: item.id }).from(item).where(inArray(item.id, componentIds));
      const foundSet = new Set(found.map((r) => r.id));
      const missing = componentIds.filter((id) => !foundSet.has(id));
      if (missing.length > 0) {
        throw Errors.validation(missing.map((id) => ({ field: "lines", message: `component item not found: ${id}` })));
      }

      // Next version for this item.
      const [{ maxv } = { maxv: 0 }] = await tx.execute<{ maxv: number }>(sql`
        select coalesce(max(version),0)::int as maxv from bom where item_id = ${input.itemId}
      `).then((r) => r.rows);
      const version = input.version ?? maxv + 1;

      const bomId = newId();
      await tx.insert(bom).values({
        id: bomId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        itemId: input.itemId,
        version,
        outputQty: (input.outputQty ?? 1).toFixed(3),
        uom: input.uom,
        notes: input.notes ?? null,
      });

      const lines = input.lines.map((l, i) => ({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        bomId,
        lineNo: i + 1,
        componentItemId: l.componentItemId,
        qty: l.qty.toFixed(3),
        uom: l.uom,
        scrapPct: (l.scrapPct ?? 0).toFixed(2),
      }));
      await tx.insert(bomLine).values(lines);

      await this.audit.appendInTx(tx, {
        action: "engineering.bom.created",
        entityType: "bom",
        entityId: bomId,
        data: { itemId: input.itemId, version, lineCount: lines.length },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("engineering", "bom", "created"),
        payload: { id: bomId, itemId: input.itemId, version },
        createdAt: now,
      });

      return this.viewBomInTx(tx, bomId);
    });
  }

  async getBom(bomId: string): Promise<BomView> {
    return withTenant((tx) => this.viewBomInTx(tx, bomId));
  }

  private async viewBomInTx(tx: Parameters<Parameters<typeof withTenant>[0]>[0], bomId: string): Promise<BomView> {
    const [head] = await tx
      .select({ id: bom.id, itemId: bom.itemId, version: bom.version, outputQty: bom.outputQty, uom: bom.uom, notes: bom.notes })
      .from(bom)
      .where(eq(bom.id, bomId))
      .limit(1);
    if (!head) throw Errors.notFound("BOM");
    const lines = await tx
      .select({
        lineNo: bomLine.lineNo,
        componentItemId: bomLine.componentItemId,
        componentCode: item.itemCode,
        componentName: item.name,
        qty: bomLine.qty,
        uom: bomLine.uom,
        scrapPct: bomLine.scrapPct,
      })
      .from(bomLine)
      .innerJoin(item, eq(item.id, bomLine.componentItemId))
      .where(eq(bomLine.bomId, bomId))
      .orderBy(asc(bomLine.lineNo));
    return { ...head, lines };
  }

  /** List active items, cursor-paginated on (created_at, id) — §5.3. */
  async listItems(limit: number, cursor?: string): Promise<CursorPage<ItemRow>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({
          id: item.id,
          itemCode: item.itemCode,
          name: item.name,
          itemType: item.itemType,
          uom: item.uom,
          standardCost: item.standardCost,
          createdAt: item.createdAt,
        })
        .from(item)
        .where(
          keyset
            ? and(
                eq(item.isActive, true),
                or(
                  gt(item.createdAt, new Date(keyset.createdAt)),
                  and(eq(item.createdAt, new Date(keyset.createdAt)), gt(item.id, keyset.id)),
                ),
              )
            : eq(item.isActive, true),
        )
        .orderBy(item.createdAt, item.id)
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null;

      return {
        items: page.map((r) => ({
          id: r.id,
          itemCode: r.itemCode,
          name: r.name,
          itemType: r.itemType,
          uom: r.uom,
          standardCost: r.standardCost,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor,
      };
    });
  }
}
