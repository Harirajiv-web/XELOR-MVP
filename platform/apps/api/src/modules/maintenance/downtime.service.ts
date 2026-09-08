import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import { newId, currentTenant, eventName, AppError, Errors } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { assetDowntime, maintenanceAsset, maintenanceKpiSnapshot, outboxEvent } = schema;

export interface StartDowntimeInput {
  assetId: string;
  startedAt: string;
  /**
   * Supplied only when recording a stop that is ALREADY OVER — yesterday's breakdown
   * entered this morning, or a historical import.
   *
   * This is not a convenience. An interval opened without an end is `[start, infinity)`,
   * which the exclusion constraint reads as "this machine is down for ever" — so
   * back-filling history one open-then-close at a time collides with every interval that
   * comes after it. A past stop is recorded complete, in one insert, or not at all.
   */
  endedAt?: string;
  kind?: "unplanned" | "planned";
  productionImpacting?: boolean;
  reasonCode?: string;
  source: "request" | "mwo" | "pm_window" | "manual";
  requestId?: string;
  mwoId?: string;
  pmOccurrenceId?: string;
  idempotencyKey: string;
}

/**
 * The downtime ledger row, WITH the machine named.
 *
 * `DowntimeView` carries `assetId` alone because a mutation's caller already knows which
 * asset it just acted on. A LIST does not: a screen whose entire purpose is "which machines
 * went down and for how long" cannot answer it from a UUID. So the read path joins the asset
 * and the write paths are left exactly as they were.
 */
export interface DowntimeListRow extends DowntimeView {
  assetCode: string;
  assetName: string;
}

export interface DowntimeView {
  id: string;
  assetId: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  kind: string;
  productionImpacting: boolean;
  reasonCode: string | null;
  source: string;
  mwoId: string | null;
  corrected: boolean;
  disputed: boolean;
}

/** The Postgres SQLSTATE for an exclusion-constraint violation. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * THE DOWNTIME CLOCK (MAINTENANCE §11.4).
 *
 * Three invariants make it trustworthy, and only one of them lives in this file:
 *
 *   1. **Overlap is a database impossibility** — the btree_gist EXCLUDE constraint is the
 *      arbiter. This service's job on a collision is not to prevent it but to TRANSLATE
 *      it: catch 23P01, look up the interval that won, and hand the caller a structured
 *      `DOWNTIME_OVERLAP` naming it, so the UI can offer "join the existing job" instead
 *      of a red toast.
 *   2. **Duration is generated** from the endpoints, so it cannot drift from them.
 *   3. **Corrections are additive and re-emitted** — the original endpoints are retained
 *      in-row, the event goes out again with `corrected: true`, and any KPI snapshot that
 *      covered the affected window is flagged for recompute. Downstream OEE converges
 *      instead of silently diverging, which is the difference between a number Production
 *      argues with and a number Production trusts.
 */
@Injectable()
export class DowntimeService {
  constructor(private readonly audit: AuditLogService) {}

  async start(input: StartDowntimeInput): Promise<DowntimeView> {
    return withTenant((tx) => this.startInTx(tx, input));
  }

  async startInTx(tx: Tx, input: StartDowntimeInput): Promise<DowntimeView> {
    const { tenantId, actorId } = currentTenant();
    const id = newId();
    const startedAt = new Date(input.startedAt);
    const endedAt = input.endedAt ? new Date(input.endedAt) : null;
    const kind = input.kind ?? "unplanned";
    const productionImpacting = input.productionImpacting ?? true;

    if (endedAt && endedAt <= startedAt) {
      throw new AppError(
        "DOWNTIME_WINDOW_INVALID",
        422,
        `A downtime interval cannot end (${input.endedAt}) at or before it started (${input.startedAt}).`,
      );
    }

    let replayed: typeof assetDowntime.$inferSelect | null = null;
    try {
      // The insert runs inside a SAVEPOINT (Drizzle's nested transaction). A constraint
      // violation in Postgres aborts the whole transaction, so without this the very act of
      // looking up which interval won would fail with "current transaction is aborted" —
      // and the caller would get a database error instead of "join the existing job".
      await tx.transaction(async (t) => {
        const inserted = await t
          .insert(assetDowntime)
          .values({
            id,
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            assetId: input.assetId,
            startedAt,
            endedAt,
            downtimeKind: kind,
            productionImpacting,
            reasonCode: input.reasonCode ?? null,
            source: input.source,
            requestId: input.requestId ?? null,
            mwoId: input.mwoId ?? null,
            pmOccurrenceId: input.pmOccurrenceId ?? null,
            recordedBy: actorId,
            idempotencyKey: input.idempotencyKey,
          })
          // A retried submit is a replay, not a second stop.
          .onConflictDoNothing({ target: [assetDowntime.tenantId, assetDowntime.idempotencyKey] })
          .returning({ id: assetDowntime.id });

        if (inserted.length === 0) {
          const [existing] = await t
            .select()
            .from(assetDowntime)
            .where(eq(assetDowntime.idempotencyKey, input.idempotencyKey))
            .limit(1);
          replayed = existing ?? null;
        }
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== EXCLUSION_VIOLATION) throw e;
      // The database already decided. Find who won and say so usefully.
      const [open] = await tx
        .select()
        .from(assetDowntime)
        .where(and(eq(assetDowntime.assetId, input.assetId), isNull(assetDowntime.endedAt)))
        .orderBy(desc(assetDowntime.startedAt))
        .limit(1);
      throw new AppError(
        "DOWNTIME_OVERLAP",
        409,
        open
          ? `This asset already has an open downtime interval since ${open.startedAt.toISOString()} (source ${open.source}). Join that job instead of opening a second clock.`
          : "This asset already has a downtime interval covering that period.",
        open
          ? [
              { field: "downtime_id", message: open.id },
              { field: "started_at", message: open.startedAt.toISOString() },
              { field: "suggested_action", message: "join_existing" },
            ]
          : undefined,
      );
    }
    if (replayed) return this.toView(replayed);

    // `under_maintenance` is DERIVED from an OPEN production-impacting interval, never set
    // by hand (FR-MNT-009) — so the asset board and the downtime ledger cannot disagree.
    // A back-dated, already-closed stop therefore leaves the asset's status alone.
    if (kind === "unplanned" && productionImpacting && !endedAt) {
      await tx
        .update(maintenanceAsset)
        .set({ status: "under_maintenance", updatedBy: actorId, updatedAt: new Date() })
        .where(eq(maintenanceAsset.id, input.assetId));
    }

    const [row] = await tx.select().from(assetDowntime).where(eq(assetDowntime.id, id)).limit(1);
    await this.emit(tx, "started", id, input.assetId, { startedAt: input.startedAt, kind, reasonCode: input.reasonCode ?? null });
    // A stop recorded after the fact publishes BOTH events, so a consumer computing OEE
    // from the stream sees a complete interval rather than a machine that never came back.
    if (endedAt) {
      await this.emit(tx, "ended", id, input.assetId, {
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationMinutes: row!.durationMinutes,
        corrected: false,
        backdated: true,
      });
    }
    return this.toView(row!);
  }

  async end(downtimeId: string, endedAt: string): Promise<DowntimeView> {
    return withTenant((tx) => this.endInTx(tx, downtimeId, endedAt));
  }

  async endInTx(tx: Tx, downtimeId: string, endedAt: string): Promise<DowntimeView> {
    const { actorId } = currentTenant();
    const [row] = await tx.select().from(assetDowntime).where(eq(assetDowntime.id, downtimeId)).limit(1);
    if (!row) throw Errors.notFound("downtime interval");
    if (row.endedAt) return this.toView(row); // already closed — a replay, not an error

    const at = new Date(endedAt);
    if (at <= row.startedAt) {
      throw new AppError(
        "DOWNTIME_WINDOW_INVALID",
        422,
        `A downtime interval cannot end (${endedAt}) at or before it started (${row.startedAt.toISOString()}).`,
      );
    }
    await tx.update(assetDowntime).set({ endedAt: at, updatedBy: actorId, updatedAt: new Date() }).where(eq(assetDowntime.id, downtimeId));

    const stillOpen = await tx
      .select({ id: assetDowntime.id })
      .from(assetDowntime)
      .where(and(eq(assetDowntime.assetId, row.assetId), isNull(assetDowntime.endedAt)));
    if (stillOpen.length === 0) {
      await tx
        .update(maintenanceAsset)
        .set({ status: "operational", updatedBy: actorId, updatedAt: new Date() })
        .where(eq(maintenanceAsset.id, row.assetId));
    }

    const [updated] = await tx.select().from(assetDowntime).where(eq(assetDowntime.id, downtimeId)).limit(1);
    await this.emit(tx, "ended", downtimeId, row.assetId, {
      startedAt: row.startedAt.toISOString(),
      endedAt,
      durationMinutes: updated!.durationMinutes,
      corrected: false,
    });
    return this.toView(updated!);
  }

  /**
   * Correct an interval. Requires `mnt.downtime.adjust` at the route, a reason here, and
   * retains the originals in-row — this and the priority override are the two levers that
   * could quietly flatter every reliability KPI at once, so both are made noisy by design.
   */
  async correct(
    downtimeId: string,
    change: { startedAt?: string; endedAt?: string; reason: string },
  ): Promise<DowntimeView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(assetDowntime).where(eq(assetDowntime.id, downtimeId)).limit(1);
      if (!row) throw Errors.notFound("downtime interval");

      const newStart = change.startedAt ? new Date(change.startedAt) : row.startedAt;
      const newEnd = change.endedAt ? new Date(change.endedAt) : row.endedAt;
      if (newEnd && newEnd <= newStart) {
        throw new AppError("DOWNTIME_WINDOW_INVALID", 422, "A corrected interval must still end after it starts.");
      }

      await tx
        .update(assetDowntime)
        .set({
          startedAt: newStart,
          endedAt: newEnd,
          corrected: true,
          correctionReason: change.reason,
          // Only the FIRST correction captures the originals; a second correction must not
          // overwrite the record of what the machine actually reported.
          originalStartedAt: row.originalStartedAt ?? row.startedAt,
          originalEndedAt: row.originalEndedAt ?? row.endedAt,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(assetDowntime.id, downtimeId));

      await this.audit.appendInTx(tx, {
        action: "maintenance.downtime.corrected",
        entityType: "asset_downtime",
        entityId: downtimeId,
        data: {
          from: { startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null },
          to: { startedAt: newStart.toISOString(), endedAt: newEnd?.toISOString() ?? null },
          reason: change.reason,
        },
      });

      // Any snapshot whose window this interval touches is now stale. Flagging beats
      // silently recomputing: the dashboard shows the timestamp and a Recompute action.
      await tx
        .update(maintenanceKpiSnapshot)
        .set({ staleSinceCorrection: true })
        .where(
          and(
            lte(maintenanceKpiSnapshot.periodStart, newStart.toISOString().slice(0, 10)),
            gte(maintenanceKpiSnapshot.periodEnd, newStart.toISOString().slice(0, 10)),
          ),
        );

      const [updated] = await tx.select().from(assetDowntime).where(eq(assetDowntime.id, downtimeId)).limit(1);
      await this.emit(tx, "ended", downtimeId, row.assetId, {
        startedAt: newStart.toISOString(),
        endedAt: newEnd?.toISOString() ?? null,
        durationMinutes: updated!.durationMinutes,
        corrected: true,
      });
      return this.toView(updated!);
    });
  }

  /** A production supervisor disagreeing with a number, on the record, beats the classic
   *  "your numbers, my numbers" standoff happening in a meeting with no record at all. */
  async dispute(downtimeId: string, note: string): Promise<DowntimeView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      await tx
        .update(assetDowntime)
        .set({ disputed: true, disputeNote: note, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(assetDowntime.id, downtimeId));
      await this.audit.appendInTx(tx, {
        action: "maintenance.downtime.disputed",
        entityType: "asset_downtime",
        entityId: downtimeId,
        data: { note },
      });
      const [row] = await tx.select().from(assetDowntime).where(eq(assetDowntime.id, downtimeId)).limit(1);
      return this.toView(row!);
    });
  }

  async openFor(tx: Tx, assetId: string): Promise<DowntimeView | null> {
    const [row] = await tx
      .select()
      .from(assetDowntime)
      .where(and(eq(assetDowntime.assetId, assetId), isNull(assetDowntime.endedAt)))
      .limit(1);
    return row ? this.toView(row) : null;
  }

  async list(
    filter: { assetId?: string; from?: string; to?: string; openOnly?: boolean } = {},
  ): Promise<DowntimeListRow[]> {
    return withTenant(async (tx) => {
      const conds = [];
      if (filter.assetId) conds.push(eq(assetDowntime.assetId, filter.assetId));
      if (filter.from) conds.push(gte(assetDowntime.startedAt, new Date(`${filter.from}T00:00:00+05:30`)));
      if (filter.to) conds.push(lte(assetDowntime.startedAt, new Date(`${filter.to}T23:59:59+05:30`)));
      if (filter.openOnly) conds.push(isNull(assetDowntime.endedAt));
      // An inner join: every interval has an asset, and a stop whose machine cannot be
      // resolved is a fault worth failing loudly rather than listing anonymously.
      const rows = await tx
        .select({
          downtime: assetDowntime,
          assetCode: maintenanceAsset.assetCode,
          assetName: maintenanceAsset.name,
        })
        .from(assetDowntime)
        .innerJoin(maintenanceAsset, eq(maintenanceAsset.id, assetDowntime.assetId))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(asc(assetDowntime.startedAt));
      return rows.map((r) => ({
        ...this.toView(r.downtime),
        assetCode: r.assetCode,
        assetName: r.assetName,
      }));
    });
  }

  /** NFR-16: an interval open for more than 72 h is almost always a forgotten close, not a
   *  three-day breakdown. The watchdog NUDGES; it never auto-closes, because guessing when
   *  a machine came back is exactly the fiction this ledger exists to remove. */
  async staleOpenIntervals(hours = 72): Promise<Array<{ id: string; assetId: string; startedAt: string; openHours: number }>> {
    const cutoff = new Date(Date.now() - hours * 3_600_000);
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(assetDowntime)
        .where(and(isNull(assetDowntime.endedAt), lte(assetDowntime.startedAt, cutoff)));
      return rows.map((r) => ({
        id: r.id,
        assetId: r.assetId,
        startedAt: r.startedAt.toISOString(),
        openHours: Math.round(((Date.now() - r.startedAt.getTime()) / 3_600_000) * 10) / 10,
      }));
    });
  }

  private async emit(
    tx: Tx,
    verb: "started" | "ended",
    downtimeId: string,
    assetId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { tenantId } = currentTenant();
    const [asset] = await tx
      .select({ assetCode: maintenanceAsset.assetCode, workCenterRef: maintenanceAsset.workCenterRef })
      .from(maintenanceAsset)
      .where(eq(maintenanceAsset.id, assetId))
      .limit(1);
    await tx.insert(outboxEvent).values({
      id: newId(),
      tenantId,
      // DECISIONS-V2 §5.4 mandates kebab-case segments, so the blueprint's
      // `maintenance.asset.downtime.started.v1` ships as `maintenance.downtime.started.v1`
      // — the same event, under the naming rule that wins on conflict.
      name: eventName("maintenance", "downtime", verb),
      payload: {
        downtimeId,
        assetRef: assetId,
        assetCode: asset?.assetCode ?? null,
        workCenterRef: asset?.workCenterRef ?? null,
        ...payload,
      },
      createdAt: new Date(),
    });
  }

  private toView(r: typeof assetDowntime.$inferSelect): DowntimeView {
    return {
      id: r.id,
      assetId: r.assetId,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      durationMinutes: r.durationMinutes,
      kind: r.downtimeKind,
      productionImpacting: r.productionImpacting,
      reasonCode: r.reasonCode,
      source: r.source,
      mwoId: r.mwoId,
      corrected: r.corrected,
      disputed: r.disputed,
    };
  }
}
