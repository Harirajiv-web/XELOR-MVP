import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  encodeCursor,
  decodeCursor,
  decideLotVerdict,
  evaluateAttribute,
  evaluateReading,
  resolveSampling,
  AppError,
  Errors,
  type CursorPage,
  type SamplingBand,
  type SamplingPlan,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { NumberingService, fyCode } from "../../common/numbering.service.js";
import { STOCK_POSTER, type StockPoster } from "../../ports/stock.port.js";
import { ITEM_PROVIDER, type ItemProvider, type ItemSpec } from "../../ports/item.port.js";
import type {
  GateStatus,
  InspectionGate,
  InspectionRefType,
  RequestInspectionInput,
  RequestInspectionResult,
} from "../../ports/inspection.port.js";

const {
  qmsCharacteristic,
  qmsSamplingPlan,
  qmsInspectionTemplate,
  qmsTemplateCharacteristic,
  qmsInspection,
  qmsInspectionReading,
  qmsDisposition,
  outboxEvent,
} = schema;

export interface ReadingInput {
  characteristicId: string;
  sampleNo: number;
  value?: number;
  conforming?: boolean;
}
export interface DispositionInput {
  dispositionType: "accept" | "quarantine" | "rework" | "scrap" | "return_to_supplier";
  qty: number;
  reason: string;
  targetWarehouseId?: string;
}
/**
 * One reading, WITH the specification it was judged against.
 *
 * The applied limits were snapshotted onto the row at the moment of measurement precisely so
 * a later drawing revision cannot flip a past verdict — and then the projection dropped
 * them, which made the snapshot pointless to everyone outside the database. An inspector
 * reads "18.02 against 18.00 +0.05 / −0.05"; the signed deviation alone does not say what
 * the part was supposed to be.
 */
export interface InspectionReadingView {
  characteristicId: string;
  characteristicCode: string | null;
  characteristicName: string | null;
  characteristicUom: string | null;
  sampleNo: number;
  value: string | null;
  conforming: boolean | null;
  appliedUsl: string | null;
  appliedLsl: string | null;
  appliedDefectClass: string | null;
  withinSpec: boolean;
  deviation: string;
}

/** What was actually DONE with the material. A record that says a lot failed but not where
 *  it went is the half of the story an auditor came for. */
export interface DispositionView {
  dispositionNo: string;
  dispositionType: string;
  qty: string;
  reason: string;
  status: string;
  targetWarehouseRef: string | null;
  inventoryMovementRef: string | null;
  decidedAt: string;
  decidedBy: string;
}

/**
 * The inspection as this module's own tables hold it.
 *
 * Write paths return THIS. Naming the item means calling ENGINEERING through the item port,
 * which opens its own connection — doing that inside `withTenant` would hold two pool slots
 * at once against a `DB_POOL_MAX` of 10. The read paths name the item after the transaction
 * has closed. Everything else here (the characteristics, the applied limits, the
 * dispositions) is intra-module and stays in the same transaction where it belongs.
 */
export interface InspectionCore {
  id: string;
  inspectionNo: string;
  /** incoming | in_process | final | pre_dispatch | first_article — an incoming rejection
   *  and a final one mean very different things, and the list could not tell them apart. */
  inspectionType: string;
  refType: string;
  refId: string | null;
  itemRef: string | null;
  lotQty: string | null;
  sampleSize: number | null;
  acceptNumber: number | null;
  rejectNumber: number | null;
  samplingRationale: string | null;
  verdictRationale: string | null;
  status: string;
  result: string;
  qtyAccepted: string | null;
  qtyRejected: string | null;
  completedAt: string | null;
  inspectorRef: string | null;
  readings: InspectionReadingView[];
  dispositions: DispositionView[];
}

/** What a GET answers: the record, with the item named. */
export interface InspectionView extends InspectionCore {
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
}

const q3 = (n: number): string => n.toFixed(3);
const q6 = (n: number): string => n.toFixed(6);
const num = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

/**
 * INSPECTION / QMS (KILN, Module 06) — the quality system of record, and the gate provider.
 *
 * Three deliberate boundaries, each enforced here rather than merely documented:
 *  1. **The gate stays with the transaction owner.** This service never blocks a GRN or a
 *     production order; it answers `gateStatus()` and Purchase/Production decide (§1.2).
 *  2. **Quality never writes the stock ledger.** A reject disposition posts through the
 *     STOCK_POSTER port and records the entry id it gets back; `executed` without one is
 *     rejected by a CHECK constraint, not by good intentions (§1.4).
 *  3. **The verdict is arithmetic, not opinion.** Sample size, pass/fail and the lot
 *     decision all come from the pure platform brain, and the derivation is STORED in
 *     words so an OEM auditor can re-check it by hand. There is no AI here at all — the
 *     governed registry has no Quality feature (§4.2).
 */
@Injectable()
export class QualityService implements InspectionGate {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    @Inject(STOCK_POSTER) private readonly stock: StockPoster,
    // ENGINEERING owns the item master; read-only, through the shared port (§1.1).
    @Inject(ITEM_PROVIDER) private readonly items: ItemProvider,
  ) {}

  /* ------------------------------- the gate ------------------------------- */

  /**
   * Open (or return) the inspection for an owning transaction. Idempotent on
   * (refType, refId): the partial unique index makes a second gate unrepresentable, so a
   * retry returns the first inspection rather than creating a rival one.
   */
  async requestInspection(input: RequestInspectionInput): Promise<RequestInspectionResult> {
    if (input.lotQty <= 0) throw Errors.validation([{ field: "lotQty", message: "must be > 0" }]);
    const { tenantId, actorId } = currentTenant();
    const now = new Date();

    return withTenant(async (tx) => {
      const existing = await tx
        .select()
        .from(qmsInspection)
        .where(and(eq(qmsInspection.refType, input.refType), eq(qmsInspection.refId, input.refId)))
        .limit(1);
      if (existing[0]) return this.toRequestResult(existing[0]);

      const template = await this.resolveTemplate(tx, input.itemId, input.inspectionType);
      const sampling = template ? await this.resolveSamplingFor(tx, template, input.lotQty) : null;

      const id = newId();
      const inspectionNo = await this.numbering.next(tx, "inspection", fyCode(new Date().toISOString()));
      await tx.insert(qmsInspection).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        inspectionNo,
        templateId: template?.id ?? null,
        templateVersion: template?.versionNo ?? null,
        inspectionType: input.inspectionType ?? template?.inspectionType ?? "final",
        refType: input.refType,
        refId: input.refId,
        itemRef: input.itemId,
        sourceWarehouseRef: input.sourceWarehouseId ?? null,
        lotQty: q3(input.lotQty),
        samplingPlanId: template?.samplingPlanId ?? null,
        sampleSize: sampling?.sampleSize ?? null,
        acceptNumber: sampling?.acceptNumber ?? null,
        rejectNumber: sampling?.rejectNumber ?? null,
        samplingRationale: sampling?.rationale ?? null,
        status: "pending",
        result: "pending",
      });

      await this.audit.appendInTx(tx, {
        action: "quality.inspection.requested",
        entityType: "qms_inspection",
        entityId: id,
        data: { inspectionNo, refType: input.refType, refId: input.refId, lotQty: q3(input.lotQty) },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("quality", "inspection", "requested"),
        payload: { id, inspectionNo, refType: input.refType, refId: input.refId },
        createdAt: now,
      });

      const row = (await tx.select().from(qmsInspection).where(eq(qmsInspection.id, id)).limit(1))[0]!;
      return this.toRequestResult(row);
    });
  }

  /**
   * The answer Purchase/Production need. `state: 'none'` when nobody asked for an
   * inspection — so wiring this port into a module never retroactively blocks work.
   */
  async gateStatus(refType: InspectionRefType, refId: string): Promise<GateStatus> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(qmsInspection)
        .where(and(eq(qmsInspection.refType, refType), eq(qmsInspection.refId, refId)))
        .limit(1);
      const r = rows[0];
      if (!r) {
        return {
          required: false,
          state: "none",
          result: null,
          inspectionId: null,
          inspectionNo: null,
          qtyAccepted: null,
          qtyRejected: null,
        };
      }
      return {
        required: true,
        state: r.status as GateStatus["state"],
        result: r.result as GateStatus["result"],
        inspectionId: r.id,
        inspectionNo: r.inspectionNo,
        qtyAccepted: num(r.qtyAccepted),
        qtyRejected: num(r.qtyRejected),
      };
    });
  }

  /* ---------------------------- standalone open --------------------------- */

  /** Open an inspection that no other module owns (an audit, a first article, a re-check). */
  async openStandalone(
    input: { itemId: string; lotQty: number; sourceWarehouseId?: string; inspectionType?: string },
    idempotencyKey: string,
  ): Promise<InspectionCore> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ ...input, op: "open" }), async () => ({
      status: 201,
      body: await this.doOpenStandalone(input),
    }));
    return result.body;
  }

  private async doOpenStandalone(input: {
    itemId: string;
    lotQty: number;
    sourceWarehouseId?: string;
    inspectionType?: string;
  }): Promise<InspectionCore> {
    if (input.lotQty <= 0) throw Errors.validation([{ field: "lotQty", message: "must be > 0" }]);
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const template = await this.resolveTemplate(tx, input.itemId, input.inspectionType);
      const sampling = template ? await this.resolveSamplingFor(tx, template, input.lotQty) : null;
      const id = newId();
      const inspectionNo = await this.numbering.next(tx, "inspection", fyCode(new Date().toISOString()));
      await tx.insert(qmsInspection).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        inspectionNo,
        templateId: template?.id ?? null,
        templateVersion: template?.versionNo ?? null,
        inspectionType: input.inspectionType ?? template?.inspectionType ?? "final",
        refType: "standalone",
        refId: null,
        itemRef: input.itemId,
        sourceWarehouseRef: input.sourceWarehouseId ?? null,
        lotQty: q3(input.lotQty),
        samplingPlanId: template?.samplingPlanId ?? null,
        sampleSize: sampling?.sampleSize ?? null,
        acceptNumber: sampling?.acceptNumber ?? null,
        rejectNumber: sampling?.rejectNumber ?? null,
        samplingRationale: sampling?.rationale ?? null,
        status: "pending",
        result: "pending",
      });
      await this.audit.appendInTx(tx, {
        action: "quality.inspection.requested",
        entityType: "qms_inspection",
        entityId: id,
        data: { inspectionNo, refType: "standalone", lotQty: q3(input.lotQty) },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("quality", "inspection", "requested"),
        payload: { id, inspectionNo, refType: "standalone" },
        createdAt: now,
      });
      return this.viewInTx(tx, id);
    });
  }

  /* ------------------------------- readings ------------------------------- */

  /**
   * Record measurements. Each reading is judged against the limits that apply NOW and
   * those limits are SNAPSHOTTED onto the row — revising a spec tomorrow can never flip
   * today's verdict. Readings may be entered in several calls; the unique key
   * (inspection, characteristic, sample) makes a re-entry an explicit conflict.
   */
  async recordReadings(
    inspectionId: string,
    readings: ReadingInput[],
    idempotencyKey: string,
  ): Promise<InspectionCore> {
    if (readings.length === 0) {
      throw Errors.validation([{ field: "readings", message: "at least one reading is required" }]);
    }
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ inspectionId, readings, op: "readings" }),
      async () => ({ status: 201, body: await this.doRecordReadings(inspectionId, readings) }),
    );
    return result.body;
  }

  private async doRecordReadings(inspectionId: string, readings: ReadingInput[]): Promise<InspectionCore> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const insp = await this.loadInspection(tx, inspectionId);
      if (insp.status === "completed" || insp.status === "cancelled") {
        throw new AppError(
          "INSPECTION_NOT_OPEN",
          409,
          `Inspection ${insp.inspectionNo} is ${insp.status}; readings can no longer be added.`,
        );
      }
      if (insp.sampleSize != null) {
        const over = readings.filter((r) => r.sampleNo > insp.sampleSize!);
        if (over.length > 0) {
          throw new AppError(
            "SAMPLE_OUT_OF_RANGE",
            422,
            `Sample numbers must be 1..${insp.sampleSize} for this lot (${insp.samplingRationale ?? ""}).`,
          );
        }
      }

      // Resolve the specs once, then snapshot them onto every reading.
      const charIds = [...new Set(readings.map((r) => r.characteristicId))];
      const chars = await tx
        .select()
        .from(qmsCharacteristic)
        .where(inArray(qmsCharacteristic.id, charIds));
      const byId = new Map(chars.map((c) => [c.id, c]));
      const missing = charIds.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        throw new AppError("CHARACTERISTIC_NOT_FOUND", 422, `Unknown characteristic(s): ${missing.join(", ")}`);
      }

      for (const r of readings) {
        const c = byId.get(r.characteristicId)!;
        const usl = num(c.usl);
        const lsl = num(c.lsl);
        const isAttribute = c.charType === "attribute";
        if (isAttribute && r.conforming == null) {
          throw Errors.validation([
            { field: "conforming", message: `characteristic ${c.code} is an attribute check — send conforming` },
          ]);
        }
        if (!isAttribute && r.value == null) {
          throw Errors.validation([
            { field: "value", message: `characteristic ${c.code} is a variable check — send a numeric value` },
          ]);
        }
        const ev = isAttribute
          ? evaluateAttribute(r.conforming!)
          : evaluateReading(r.value!, { usl, lsl });

        await tx.insert(qmsInspectionReading).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          inspectionId,
          characteristicId: r.characteristicId,
          sampleNo: r.sampleNo,
          readingNumeric: r.value != null ? q6(r.value) : null,
          readingBool: r.conforming ?? null,
          appliedUsl: usl != null ? q6(usl) : null,
          appliedLsl: lsl != null ? q6(lsl) : null,
          appliedDefectClass: c.defectClass,
          isWithinSpec: ev.withinSpec,
          deviation: q6(ev.deviation),
        });
      }

      if (insp.status === "pending") {
        await tx
          .update(qmsInspection)
          .set({ status: "in_progress", updatedBy: actorId, updatedAt: now })
          .where(eq(qmsInspection.id, inspectionId));
      }
      await this.audit.appendInTx(tx, {
        action: "quality.inspection.readings_recorded",
        entityType: "qms_inspection",
        entityId: inspectionId,
        data: { count: readings.length },
      });
      return this.viewInTx(tx, inspectionId);
    });
  }

  /* ------------------------------- complete ------------------------------- */

  /**
   * Close the inspection. The verdict is computed from the recorded readings by the pure
   * brain — a critical characteristic out of spec rejects the lot regardless of the accept
   * number — and the derivation is stored in words next to it.
   */
  async completeInspection(inspectionId: string, idempotencyKey: string): Promise<InspectionCore> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ inspectionId, op: "complete-inspection" }),
      async () => ({ status: 201, body: await this.doCompleteInspection(inspectionId) }),
    );
    return result.body;
  }

  private async doCompleteInspection(inspectionId: string): Promise<InspectionCore> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const insp = await this.loadInspection(tx, inspectionId);
      if (insp.status === "completed") {
        throw new AppError("INSPECTION_ALREADY_COMPLETED", 409, `Inspection ${insp.inspectionNo} is closed.`);
      }
      const rows = await tx
        .select()
        .from(qmsInspectionReading)
        .where(eq(qmsInspectionReading.inspectionId, inspectionId));
      if (rows.length === 0) {
        throw new AppError(
          "NO_READINGS",
          422,
          `Inspection ${insp.inspectionNo} has no readings — nothing to judge.`,
        );
      }

      const sampleSize = insp.sampleSize ?? new Set(rows.map((r) => r.sampleNo)).size;
      const decision = decideLotVerdict({
        readings: rows.map((r) => ({
          sampleNo: r.sampleNo,
          withinSpec: r.isWithinSpec,
          defectClass: r.appliedDefectClass,
        })),
        sampleSize,
        acceptNumber: insp.acceptNumber ?? 0,
        rejectNumber: insp.rejectNumber ?? 1,
      });

      // The lot is judged whole: a rejected lot rejects every piece in it. Splitting a lot
      // is a DISPOSITION decision (sort / rework), never a side effect of the verdict.
      const lot = num(insp.lotQty) ?? 0;
      const accepted = decision.verdict === "accepted" ? lot : 0;
      const rejected = decision.verdict === "accepted" ? 0 : lot;

      await tx
        .update(qmsInspection)
        .set({
          status: "completed",
          result: decision.verdict,
          verdictRationale: decision.rationale,
          qtyAccepted: q3(accepted),
          qtyRejected: q3(rejected),
          inspectorRef: actorId,
          completedAt: now.toISOString(),
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(qmsInspection.id, inspectionId));

      await this.audit.appendInTx(tx, {
        action: "quality.inspection.completed",
        entityType: "qms_inspection",
        entityId: inspectionId,
        data: {
          inspectionNo: insp.inspectionNo,
          result: decision.verdict,
          defectiveSamples: decision.defectiveSamples,
          rationale: decision.rationale,
        },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("quality", "inspection", "completed"),
        payload: {
          id: inspectionId,
          inspectionNo: insp.inspectionNo,
          refType: insp.refType,
          refId: insp.refId,
          result: decision.verdict,
          qtyAccepted: q3(accepted),
          qtyRejected: q3(rejected),
        },
        createdAt: now,
      });
      return this.viewInTx(tx, inspectionId);
    });
  }

  /* ------------------------------ disposition ----------------------------- */

  /**
   * Decide what happens to rejected material — and MOVE it, through Inventory.
   *
   * §1.4, made structural: the stock movement is posted inside this transaction via the
   * STOCK_POSTER port, and the returned entry id is written onto the disposition. The
   * table's CHECK constraint refuses `status='executed'` without one, so a disposition can
   * never claim to have segregated material that never moved.
   */
  async decideDisposition(
    inspectionId: string,
    input: DispositionInput,
    idempotencyKey: string,
  ): Promise<{ dispositionNo: string; status: string; inventoryMovementRef: string | null; movements: unknown[] }> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ inspectionId, input, op: "disposition" }),
      async () => ({ status: 201, body: await this.doDecideDisposition(inspectionId, input) }),
    );
    return result.body;
  }

  private async doDecideDisposition(
    inspectionId: string,
    input: DispositionInput,
  ): Promise<{ dispositionNo: string; status: string; inventoryMovementRef: string | null; movements: unknown[] }> {
    if (input.qty <= 0) throw Errors.validation([{ field: "qty", message: "must be > 0" }]);
    const { tenantId, actorId } = currentTenant();
    const now = new Date();

    return withTenant(async (tx) => {
      const insp = await this.loadInspection(tx, inspectionId);
      if (insp.status !== "completed") {
        throw new AppError(
          "INSPECTION_NOT_COMPLETED",
          409,
          `Inspection ${insp.inspectionNo} is ${insp.status}; complete it before dispositioning.`,
        );
      }
      const rejected = num(insp.qtyRejected) ?? 0;
      const moving = input.dispositionType !== "accept";
      if (moving && input.qty > rejected + 1e-9) {
        throw new AppError(
          "DISPOSITION_EXCEEDS_REJECTED",
          422,
          `Cannot disposition ${input.qty} — only ${rejected} was rejected on ${insp.inspectionNo}.`,
        );
      }

      const id = newId();
      const dispositionNo = await this.numbering.next(tx, "disposition", fyCode(new Date().toISOString()));
      let movementRef: string | null = null;
      let movements: unknown[] = [];

      if (moving) {
        if (!insp.sourceWarehouseRef) {
          throw new AppError(
            "NO_SOURCE_WAREHOUSE",
            422,
            `Inspection ${insp.inspectionNo} has no source warehouse, so the rejected material cannot be moved.`,
          );
        }
        if (!input.targetWarehouseId) {
          throw Errors.validation([
            { field: "targetWarehouseId", message: "required for a disposition that moves stock" },
          ]);
        }
        // Quality does NOT write the ledger — Inventory does, inside this same transaction
        // so the disposition and the movement commit together or not at all (§5.5).
        const post = await this.stock.postInTx(tx, {
          entryType: "transfer",
          reasonCode: input.dispositionType,
          remarks: `disposition ${dispositionNo} on ${insp.inspectionNo}: ${input.reason}`,
          lines: [
            {
              itemId: insp.itemRef!,
              fromWarehouseId: insp.sourceWarehouseRef,
              toWarehouseId: input.targetWarehouseId,
              qty: input.qty,
            },
          ],
        });
        movementRef = post.entryId;
        movements = post.movements;
      }

      await tx.insert(qmsDisposition).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        dispositionNo,
        inspectionId,
        dispositionType: input.dispositionType,
        qty: q3(input.qty),
        reason: input.reason,
        fromWarehouseRef: insp.sourceWarehouseRef,
        targetWarehouseRef: input.targetWarehouseId ?? null,
        status: "executed",
        inventoryMovementRef: movementRef,
      });

      await this.audit.appendInTx(tx, {
        action: "quality.disposition.executed",
        entityType: "qms_disposition",
        entityId: id,
        data: {
          dispositionNo,
          type: input.dispositionType,
          qty: q3(input.qty),
          inventoryMovementRef: movementRef,
        },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("quality", "disposition", "executed"),
        payload: { id, dispositionNo, inspectionId, type: input.dispositionType, qty: q3(input.qty) },
        createdAt: now,
      });

      return { dispositionNo, status: "executed", inventoryMovementRef: movementRef, movements };
    });
  }

  /* --------------------------------- reads -------------------------------- */

  async getInspection(inspectionId: string): Promise<InspectionView> {
    // Read, THEN name — the item lookup crosses a module boundary onto its own connection,
    // so it happens after this transaction has released its pool slot.
    const core = await withTenant((tx) => this.viewInTx(tx, inspectionId));
    return this.nameItem(core, core.itemRef ? await this.items.getItem(core.itemRef) : null);
  }

  /** Cursor pagination only (§5) — keyset on (created_at, id), never an offset. */
  async listInspections(limit: number, cursor?: string): Promise<CursorPage<InspectionView>> {
    const page = await withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({
          id: qmsInspection.id,
          createdAt: qmsInspection.createdAt,
          itemRef: qmsInspection.itemRef,
        })
        .from(qmsInspection)
        .where(
          keyset
            ? and(
                eq(qmsInspection.isActive, true),
                or(
                  gt(qmsInspection.createdAt, new Date(keyset.createdAt)),
                  and(eq(qmsInspection.createdAt, new Date(keyset.createdAt)), gt(qmsInspection.id, keyset.id)),
                ),
              )
            : eq(qmsInspection.isActive, true),
        )
        .orderBy(asc(qmsInspection.createdAt), asc(qmsInspection.id))
        .limit(limit + 1);
      const rowsOnPage = rows.slice(0, limit);
      const items: InspectionCore[] = [];
      for (const r of rowsOnPage) items.push(await this.viewInTx(tx, r.id));
      const last = rowsOnPage[rowsOnPage.length - 1];
      return {
        items,
        nextCursor:
          rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
      };
    });

    // ONE item lookup for the whole page, outside the transaction — not one per inspection,
    // and not while holding a pool connection.
    const itemIds = [...new Set(page.items.map((r) => r.itemRef).filter((v): v is string => v !== null))];
    const specs = itemIds.length > 0 ? await this.items.getItems(itemIds) : [];
    const byItem = new Map(specs.map((s) => [s.id, s]));
    return {
      items: page.items.map((c) => this.nameItem(c, c.itemRef ? (byItem.get(c.itemRef) ?? null) : null)),
      nextCursor: page.nextCursor,
    };
  }

  /* -------------------------------- helpers ------------------------------- */

  private async loadInspection(tx: Tx, id: string) {
    const rows = await tx.select().from(qmsInspection).where(eq(qmsInspection.id, id)).limit(1);
    const r = rows[0];
    if (!r) throw new AppError("INSPECTION_NOT_FOUND", 404, `No inspection ${id}.`);
    return r;
  }

  /**
   * Which template applies to this item + type. The partial unique index guarantees at most
   * one ACTIVE template per scope, so this can never be ambiguous at the inspection bay;
   * an item with no template still gets an inspection, just without a sampling plan.
   */
  private async resolveTemplate(tx: Tx, itemId: string, inspectionType?: string) {
    const conds = [eq(qmsInspectionTemplate.itemRef, itemId), eq(qmsInspectionTemplate.status, "active")];
    if (inspectionType) conds.push(eq(qmsInspectionTemplate.inspectionType, inspectionType));
    const rows = await tx
      .select()
      .from(qmsInspectionTemplate)
      .where(and(...conds))
      .limit(1);
    return rows[0] ?? null;
  }

  private async resolveSamplingFor(
    tx: Tx,
    template: { samplingPlanId: string | null },
    lotQty: number,
  ) {
    if (!template.samplingPlanId) return null;
    const rows = await tx
      .select()
      .from(qmsSamplingPlan)
      .where(eq(qmsSamplingPlan.id, template.samplingPlanId))
      .limit(1);
    const p = rows[0];
    if (!p) return null;
    const plan: SamplingPlan = {
      code: p.code,
      standard: p.standard as SamplingPlan["standard"],
      aql: num(p.aql),
      inspectionLevel: p.inspectionLevel,
      fixedN: p.fixedN,
      percentage: num(p.percentage),
      planTable: (p.planTable as SamplingBand[]) ?? [],
    };
    try {
      return resolveSampling(plan, lotQty);
    } catch (e) {
      // A lot outside every band is a plan-configuration error, surfaced as such rather
      // than silently guessing a sample size.
      throw new AppError("SAMPLING_PLAN_GAP", 422, e instanceof Error ? e.message : String(e));
    }
  }

  private toRequestResult(r: {
    id: string;
    inspectionNo: string;
    status: string;
    sampleSize: number | null;
    acceptNumber: number | null;
    rejectNumber: number | null;
    samplingRationale: string | null;
  }): RequestInspectionResult {
    return {
      inspectionId: r.id,
      inspectionNo: r.inspectionNo,
      status: r.status,
      sampleSize: r.sampleSize,
      acceptNumber: r.acceptNumber,
      rejectNumber: r.rejectNumber,
      samplingRationale: r.samplingRationale,
    };
  }

  private async viewInTx(tx: Tx, id: string): Promise<InspectionCore> {
    const r = await this.loadInspection(tx, id);
    const readings = await tx
      .select()
      .from(qmsInspectionReading)
      .where(eq(qmsInspectionReading.inspectionId, id))
      .orderBy(asc(qmsInspectionReading.sampleNo));

    // The characteristics named, not just referenced. Intra-module join, one query for all
    // of them — `qms_characteristic` belongs to this module, so no port is involved.
    const charIds = [...new Set(readings.map((x) => x.characteristicId))];
    const chars =
      charIds.length > 0
        ? await tx.select().from(qmsCharacteristic).where(inArray(qmsCharacteristic.id, charIds))
        : [];
    const byChar = new Map(chars.map((c) => [c.id, c]));

    const dispositions = await tx
      .select()
      .from(qmsDisposition)
      .where(eq(qmsDisposition.inspectionId, id))
      .orderBy(asc(qmsDisposition.createdAt));

    return {
      id: r.id,
      inspectionNo: r.inspectionNo,
      inspectionType: r.inspectionType,
      refType: r.refType,
      refId: r.refId,
      itemRef: r.itemRef,
      lotQty: r.lotQty,
      sampleSize: r.sampleSize,
      acceptNumber: r.acceptNumber,
      rejectNumber: r.rejectNumber,
      samplingRationale: r.samplingRationale,
      verdictRationale: r.verdictRationale,
      status: r.status,
      result: r.result,
      qtyAccepted: r.qtyAccepted,
      qtyRejected: r.qtyRejected,
      completedAt: r.completedAt,
      inspectorRef: r.inspectorRef,
      readings: readings.map((x) => {
        const c = byChar.get(x.characteristicId);
        return {
          characteristicId: x.characteristicId,
          characteristicCode: c?.code ?? null,
          characteristicName: c?.name ?? null,
          // The unit comes from the characteristic, not the item: a bore is measured in mm
          // on a pump sold by the piece.
          characteristicUom: c?.uom ?? null,
          sampleNo: x.sampleNo,
          value: x.readingNumeric,
          conforming: x.readingBool,
          // The limits AS APPLIED, off the reading row — never re-read from the master,
          // which is the whole point of having snapshotted them.
          appliedUsl: x.appliedUsl,
          appliedLsl: x.appliedLsl,
          appliedDefectClass: x.appliedDefectClass,
          withinSpec: x.isWithinSpec,
          deviation: x.deviation,
        };
      }),
      dispositions: dispositions.map((d) => ({
        dispositionNo: d.dispositionNo,
        dispositionType: d.dispositionType,
        qty: d.qty,
        reason: d.reason,
        status: d.status,
        targetWarehouseRef: d.targetWarehouseRef,
        inventoryMovementRef: d.inventoryMovementRef,
        decidedAt: d.createdAt.toISOString(),
        decidedBy: d.createdBy,
      })),
    };
  }

  /**
   * Put the item's code, name and unit onto a record. Called AFTER the transaction has
   * closed, never inside one — see `InspectionCore`.
   */
  private nameItem(core: InspectionCore, spec: ItemSpec | null): InspectionView {
    return {
      ...core,
      itemCode: spec?.itemCode ?? null,
      itemName: spec?.name ?? null,
      uom: spec?.uom ?? null,
    };
  }
}
