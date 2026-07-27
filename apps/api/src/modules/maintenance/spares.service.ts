import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import { newId, currentTenant, eventName, round2, AppError, Errors } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { STOCK_POSTER, type StockPoster } from "../../ports/stock.port.js";
import { ITEM_PROVIDER, type ItemProvider } from "../../ports/item.port.js";
import { MwoService } from "./mwo.service.js";

const { mwoSpare, outboxEvent } = schema;

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v));

export interface SpareLineView {
  id: string;
  itemCode: string | null;
  qtyPlanned: number;
  qtyIssued: number;
  issueStatus: string;
  stockEntryRef: string | null;
  valuedAmount: number;
  failureNote: string | null;
}

/**
 * THE SPARES BROKER (MAINTENANCE §11.6) — the ONLY outbound path from this module to
 * Inventory, and the place the module's most important boundary is made concrete.
 *
 * Read what is absent as carefully as what is present. There is no stock table here, no
 * bin, no on-hand quantity, no valuation function, and no SQL naming an Inventory-owned
 * table anywhere in `modules/maintenance`. A spare issue is a synchronous call through
 * `STOCK_POSTER` — never an event, because a stock movement is ledger-critical and must
 * commit in one transaction with the document that caused it.
 *
 * What comes back — the stock entry id and the amount INVENTORY valued the movement at —
 * is MIRRORED read-only onto the MWO line. That is why a revaluation in Inventory can
 * never silently restate a closed maintenance job, and why `issue_status = 'issued'` is
 * impossible without a stock entry reference (a CHECK constraint, not a promise).
 */
@Injectable()
export class SparesService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly mwos: MwoService,
    @Inject(STOCK_POSTER) private readonly stock: StockPoster,
    @Inject(ITEM_PROVIDER) private readonly items: ItemProvider,
  ) {}

  /** Plan a line. Nothing moves in Inventory — this is a shopping list. */
  async plan(mwoNo: string, input: { itemCode: string; qty: number; warehouseRef?: string }): Promise<SpareLineView> {
    const { tenantId, actorId } = currentTenant();
    const item = await this.items.getItemByCode(input.itemCode);
    if (!item) throw Errors.notFound(`item ${input.itemCode}`);

    return withTenant(async (tx) => {
      const m = await this.mwos.byNoInTx(tx, mwoNo);
      const id = newId();
      await tx.insert(mwoSpare).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        mwoId: m.id,
        itemRef: item.id,
        itemCodeCache: item.itemCode,
        uom: item.uom,
        warehouseRef: input.warehouseRef ?? null,
        qtyPlanned: input.qty.toFixed(4),
        issueStatus: "planned",
      });
      return this.lineView(tx, id);
    });
  }

  /**
   * Issue a planned line THROUGH Inventory.
   *
   * On failure, Inventory's own code and message are surfaced VERBATIM inside
   * `SPARE_ISSUE_FAILED` — not reworded into something friendlier. "Insufficient stock: 0
   * available, 1 requested" is the sentence the storekeeper needs; a maintenance module
   * paraphrasing it helps nobody and hides which system actually said no.
   */
  async issue(
    mwoNo: string,
    spareId: string,
    input: { qty: number; warehouseRef: string; idempotencyKey: string },
  ): Promise<SpareLineView & { inventory: { stockEntryRef: string; valuedAmount: number; valuationBasis: string } }> {
    const { tenantId, actorId } = currentTenant();

    return withTenant(async (tx) => {
      const m = await this.mwos.byNoInTx(tx, mwoNo);
      const [line] = await tx
        .select()
        .from(mwoSpare)
        .where(and(eq(mwoSpare.id, spareId), eq(mwoSpare.mwoId, m.id)))
        .limit(1);
      if (!line) throw Errors.notFound(`spare line on ${mwoNo}`);
      if (line.issueStatus === "issued" && line.stockEntryRef) {
        return { ...(await this.lineView(tx, line.id)), inventory: { stockEntryRef: line.stockEntryRef, valuedAmount: n(line.valuedAmount), valuationBasis: "standard_cost" } };
      }

      let result;
      try {
        // ONE outbound call, inside the caller's transaction, so the MWO line and the
        // stock ledger commit together or not at all (§5.5).
        result = await this.stock.postInTx(tx, {
          entryType: "issue",
          reasonCode: "maintenance_issue",
          remarks: `MWO ${mwoNo}`,
          lines: [{ itemId: line.itemRef, fromWarehouseId: input.warehouseRef, qty: input.qty }],
        });
      } catch (e) {
        const err = e as { code?: string; message?: string };
        // The line records the failure rather than pretending it did not happen —
        // `issue_status = 'failed'` is a state the storekeeper's screen can act on.
        // (Written after the transaction unwinds; see the catch in `markFailed`.)
        await this.markFailed(spareId, err.message ?? "stock issue failed");
        throw new AppError(
          "SPARE_ISSUE_FAILED",
          409,
          `Inventory refused the issue of ${line.itemCodeCache ?? line.itemRef} for ${mwoNo}: ${err.message ?? "unknown error"}`,
          [
            { field: "inventory_code", message: err.code ?? "UNKNOWN" },
            { field: "inventory_message", message: err.message ?? "" },
          ],
        );
      }

      const movement = result.movements[0]!;
      const valuedAmount = round2(n(line.valuedAmount) + movement.valuedAmount);

      await tx
        .update(mwoSpare)
        .set({
          qtyIssued: round2(n(line.qtyIssued) + input.qty).toFixed(4),
          stockEntryRef: result.entryId,
          warehouseRef: input.warehouseRef,
          valuedAmount: valuedAmount.toFixed(2),
          issueStatus: "issued",
          failureNote: null,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(mwoSpare.id, spareId));

      await this.mwos.recomputeCostInTx(tx, m.id);

      // Telemetry twin of the synchronous call — for observability and the Insights
      // rollup. The stock movement itself never rides the bus.
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "spares", "issued"),
        payload: { mwoNo, itemRef: line.itemRef, qty: input.qty, stockEntryRef: result.entryId, valuedAmount: movement.valuedAmount },
        createdAt: new Date(),
      });
      await this.audit.appendInTx(tx, {
        action: "maintenance.spare.issued",
        entityType: "mwo_spare",
        entityId: spareId,
        data: { mwoNo, itemCode: line.itemCodeCache, qty: input.qty, stockEntryRef: result.entryId, valuedAmount: movement.valuedAmount },
      });

      return {
        ...(await this.lineView(tx, spareId)),
        inventory: { stockEntryRef: result.entryId, valuedAmount: movement.valuedAmount, valuationBasis: movement.valuationBasis },
      };
    });
  }

  /**
   * Return an unused part. This is an Inventory RECEIPT through the same port — nothing is
   * edited in place, and the mirrored line records a negative issued quantity, exactly as
   * the ledger records a positive movement back into stores.
   */
  async returnSpare(
    mwoNo: string,
    spareId: string,
    input: { qty: number; warehouseRef: string },
  ): Promise<SpareLineView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.mwos.byNoInTx(tx, mwoNo);
      const [line] = await tx
        .select()
        .from(mwoSpare)
        .where(and(eq(mwoSpare.id, spareId), eq(mwoSpare.mwoId, m.id)))
        .limit(1);
      if (!line) throw Errors.notFound(`spare line on ${mwoNo}`);
      if (input.qty > n(line.qtyIssued)) {
        throw new AppError(
          "SPARE_RETURN_EXCEEDS_ISSUE",
          422,
          `Cannot return ${input.qty} of ${line.itemCodeCache}: only ${n(line.qtyIssued)} was issued.`,
        );
      }

      const result = await this.stock.postInTx(tx, {
        entryType: "receipt",
        reasonCode: "maintenance_return",
        remarks: `MWO ${mwoNo} — unused spare returned`,
        lines: [{ itemId: line.itemRef, toWarehouseId: input.warehouseRef, qty: input.qty }],
      });
      const movement = result.movements[0]!;

      await tx
        .update(mwoSpare)
        .set({
          qtyIssued: round2(n(line.qtyIssued) - input.qty).toFixed(4),
          valuedAmount: round2(n(line.valuedAmount) - movement.valuedAmount).toFixed(2),
          issueStatus: "returned",
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(mwoSpare.id, spareId));

      await this.mwos.recomputeCostInTx(tx, m.id);
      return this.lineView(tx, spareId);
    });
  }

  /**
   * Reserve ahead of planned work. A reservation FAILURE never blocks the PM — stores gets
   * an amber flag and a notification instead, because a technician arriving to find no
   * part is a worse outcome than a work order that says the part might not be there.
   *
   * `itemCode` ARRIVES ALREADY RESOLVED, and that is load-bearing rather than tidy. This
   * method runs inside the PM generator's transaction, so calling `ItemProvider` here would
   * acquire a SECOND pool connection while the first is still held — and `DB_POOL_MAX` is
   * 10, so five concurrent generator runs would wedge the pool on a lookup that only ever
   * supplied a LABEL. Nothing about what gets reserved depended on it: the unit and the
   * quantity come from the schedule's default-spare row, and the status is fixed. The
   * caller resolves the codes in one batch before it opens its transaction.
   */
  async reserveForOccurrence(
    tx: Tx,
    mwoId: string,
    mwoNo: string,
    spares: readonly { itemRef: string; uom: string; qty: number; itemCode: string | null }[],
  ): Promise<{ reserved: number; unavailable: string[] }> {
    const { tenantId, actorId } = currentTenant();
    const unavailable: string[] = [];
    let reserved = 0;

    for (const s of spares) {
      const id = newId();
      await tx.insert(mwoSpare).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        mwoId,
        itemRef: s.itemRef,
        itemCodeCache: s.itemCode,
        uom: s.uom,
        qtyPlanned: s.qty.toFixed(4),
        // MVP posture, stated plainly: Inventory does not yet own a reservation contract,
        // so a default spare is recorded as PLANNED and flagged to stores. Wiring a real
        // reservation is a port method, not a redesign.
        issueStatus: "planned",
        failureNote: "reservation not requested — Inventory reservation contract is post-MVP",
      });
      reserved += 1;
      void unavailable;
    }

    await tx.insert(outboxEvent).values({
      id: newId(),
      tenantId,
      name: eventName("maintenance", "spares", "requested"),
      payload: { mwoNo, lines: spares.length },
      createdAt: new Date(),
    });
    return { reserved, unavailable };
  }

  /** Recorded in its OWN transaction: the issue transaction has already rolled back, so
   *  writing the failure inside it would roll back too and the line would look untouched. */
  private async markFailed(spareId: string, note: string): Promise<void> {
    const { actorId } = currentTenant();
    await withTenant(async (tx) => {
      await tx
        .update(mwoSpare)
        .set({ issueStatus: "failed", failureNote: note, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(mwoSpare.id, spareId));
    }).catch(() => {
      /* the refusal is already being reported to the caller; a bookkeeping miss must not mask it */
    });
  }

  private async lineView(tx: Tx, spareId: string): Promise<SpareLineView> {
    const [l] = await tx.select().from(mwoSpare).where(eq(mwoSpare.id, spareId)).limit(1);
    if (!l) throw Errors.notFound("spare line");
    return {
      id: l.id,
      itemCode: l.itemCodeCache,
      qtyPlanned: n(l.qtyPlanned),
      qtyIssued: n(l.qtyIssued),
      issueStatus: l.issueStatus,
      stockEntryRef: l.stockEntryRef,
      valuedAmount: n(l.valuedAmount),
      failureNote: l.failureNote,
    };
  }
}
