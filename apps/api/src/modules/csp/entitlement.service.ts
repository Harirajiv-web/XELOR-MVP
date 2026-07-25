import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  amcRenewalStatus,
  checkEntitlement,
  currentTenant,
  eventName,
  newId,
  Errors,
  type AmcRecord,
  type EntitlementResult,
  type WarrantyRecord,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { cspWarranty, cspAmcContract, cspAmcContractAsset, cspTicket, cspTicketEvent, outboxEvent } = schema;

/**
 * ENTITLEMENT — "warranty as a gate, not a gift".
 *
 * The verdict itself is computed by the pure function in `@ind-core/platform`; this
 * service's job is to assemble the evidence honestly and to record what was decided.
 *
 * Two properties matter more than the arithmetic:
 *
 *   - **The claim is judged on the DATE OF FAILURE, not on today.** A failure that
 *     happened inside the cover period stays covered even if the customer reports it three
 *     weeks later. Defaulting to `now` would quietly deny every late-reported claim, which
 *     is a commercial decision nobody made.
 *   - **An anomaly never silently flips a verdict.** Two live warranties on one serial, or
 *     a claim dated before dispatch, are flagged for a human and the coverage answer stands
 *     on its own merits. A data-entry error is not fraud, and the software is not entitled
 *     to treat it as one.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly audit: AuditLogService) {}

  /* ------------------------------ the lookup ------------------------------- */

  async warrantiesForSerial(tx: Tx, serialNo: string): Promise<WarrantyRecord[]> {
    const rows = await tx.select().from(cspWarranty).where(eq(cspWarranty.serialNo, serialNo));
    return rows.map((r) => ({
      serialNo: r.serialNo,
      warrantyType: r.warrantyType,
      startDate: r.startDate,
      endDate: r.endDate,
      coverageTerms: r.coverageTerms ?? "",
      status: r.status as WarrantyRecord["status"],
    }));
  }

  /** The AMC covering this serial, if any, with its covered-serial list loaded — the list
   *  is what makes "this contract does not list this serial" a real, checkable answer. */
  async amcForSerial(tx: Tx, customerAccountId: string, serialNo: string): Promise<AmcRecord | null> {
    const [asset] = await tx
      .select()
      .from(cspAmcContractAsset)
      .where(eq(cspAmcContractAsset.serialNo, serialNo))
      .limit(1);
    const contractId = asset?.contractId;
    const [c] = contractId
      ? await tx.select().from(cspAmcContract).where(eq(cspAmcContract.id, contractId)).limit(1)
      : await tx
          .select()
          .from(cspAmcContract)
          .where(and(eq(cspAmcContract.customerAccountId, customerAccountId), eq(cspAmcContract.status, "active")))
          .limit(1);
    if (!c) return null;
    const serials = await tx
      .select({ serialNo: cspAmcContractAsset.serialNo })
      .from(cspAmcContractAsset)
      .where(eq(cspAmcContractAsset.contractId, c.id));
    return {
      contractNo: c.contractNo,
      coverageType: c.coverageType as AmcRecord["coverageType"],
      startDate: c.startDate,
      endDate: c.endDate,
      entitlements: (c.entitlements ?? {}) as AmcRecord["entitlements"],
      status: c.status as AmcRecord["status"],
      coveredSerials: serials.map((s) => s.serialNo),
    };
  }

  /**
   * Run a determination. `onDate` is the date of failure; the caller supplies it and the
   * default is the ticket's creation date, never `now`.
   */
  async determineInTx(
    tx: Tx,
    input: { customerAccountId: string; serialNo: string; onDate: string },
  ): Promise<EntitlementResult> {
    const all = await this.warrantiesForSerial(tx, input.serialNo);
    // The governing warranty is the one that was live on the date of failure; where none
    // was, the most recent is reported so the reason can say when it ran out.
    const governing =
      all.find((w) => w.status === "active" && input.onDate >= w.startDate && input.onDate <= w.endDate) ??
      [...all].sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ??
      null;
    const [row] = await tx.select().from(cspWarranty).where(eq(cspWarranty.serialNo, input.serialNo)).limit(1);
    const amc = await this.amcForSerial(tx, input.customerAccountId, input.serialNo);

    return checkEntitlement({
      serialNo: input.serialNo,
      onDate: input.onDate,
      warranty: governing,
      amc,
      allWarrantiesForSerial: all,
      dispatchedOn: row?.dispatchedOn ?? null,
    });
  }

  /** Portal-facing lookup (P12). RLS restricts it to the caller's own serials; the service
   *  does not have to remember to filter, and could not leak if it forgot. */
  async lookup(serialNo: string, onDate?: string): Promise<EntitlementResult & { serialNo: string }> {
    const { customerAccountId } = currentTenant();
    return withTenant(async (tx) => {
      // The account is resolved from EITHER register. A machine covered by an AMC and by
      // no warranty row is a real and ordinary case — a customer looking up their own
      // contracted machine must not be told it does not exist because the warranty table
      // happens not to mention it.
      const [w] = await tx.select().from(cspWarranty).where(eq(cspWarranty.serialNo, serialNo)).limit(1);
      const [a] = w
        ? [null]
        : await tx.select().from(cspAmcContractAsset).where(eq(cspAmcContractAsset.serialNo, serialNo)).limit(1);
      const account = customerAccountId ?? w?.customerAccountId ?? a?.customerAccountId;
      if (!account) throw Errors.notFound(`serial ${serialNo}`);
      const result = await this.determineInTx(tx, {
        customerAccountId: account,
        serialNo,
        onDate: onDate ?? new Date().toISOString().slice(0, 10),
      });
      return { ...result, serialNo };
    });
  }

  /**
   * Run the check against a ticket and CACHE the verdict on it, stamped with the moment it
   * was reached. The stamp is not decoration: a verdict without it cannot be distinguished
   * from a verdict computed a year ago against cover that has since expired, and the CHECK
   * constraint on the table refuses one without the other.
   */
  async checkForTicket(ticketNo: string, onDate?: string): Promise<EntitlementResult> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [t] = await tx.select().from(cspTicket).where(eq(cspTicket.ticketNo, ticketNo)).limit(1);
      if (!t) throw Errors.notFound(`ticket ${ticketNo}`);
      if (!t.productSerialNo) {
        throw Errors.validation([
          { field: "productSerialNo", message: "this ticket names no machine, so there is nothing to check coverage on" },
        ]);
      }
      const result = await this.determineInTx(tx, {
        customerAccountId: t.customerAccountId,
        serialNo: t.productSerialNo,
        onDate: onDate ?? t.createdAt.toISOString().slice(0, 10),
      });
      const now = new Date();
      await tx
        .update(cspTicket)
        .set({ entitlementResult: result.verdict, entitlementCheckedAt: now, updatedBy: actorId, updatedAt: now })
        .where(eq(cspTicket.id, t.id));
      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        eventType: "entitlement.checked",
        toValue: result.verdict,
        actorType: "staff",
        actorRef: actorId,
        detail: { reasons: result.reasons, anomalies: result.anomalies, serialNo: t.productSerialNo },
        occurredAt: now,
      });
      await this.audit.appendInTx(tx, {
        action: "csp.entitlement.checked",
        entityType: "csp_ticket",
        entityId: t.id,
        data: { ticketNo, verdict: result.verdict, serialNo: t.productSerialNo, anomalies: result.anomalies.length },
      });
      return result;
    });
  }

  /* ------------------------------ AMC renewal ------------------------------ */

  /**
   * The nightly renewal scan. A contract inside the T-60 window flips to `expiring` and a
   * renewal lead goes to SMBD ONCE — `renewal_lead_emitted_at` is what makes it once, and
   * the difference between a lead and sixty nightly reminders is the whole feature.
   */
  async scanRenewals(asOf?: string): Promise<Array<{ contractNo: string; status: string; daysToExpiry: number; leadEmitted: boolean }>> {
    const { tenantId, actorId } = currentTenant();
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    return withTenant(async (tx) => {
      const contracts = await tx.select().from(cspAmcContract);
      const out: Array<{ contractNo: string; status: string; daysToExpiry: number; leadEmitted: boolean }> = [];
      for (const c of contracts) {
        const r = amcRenewalStatus({ endDate: c.endDate, status: c.status as AmcRecord["status"] }, today);
        const shouldEmit = r.shouldEmitLead && c.renewalLeadEmittedAt == null;
        if (r.status !== c.status || shouldEmit) {
          await tx
            .update(cspAmcContract)
            .set({
              status: r.status,
              ...(shouldEmit ? { renewalLeadEmittedAt: new Date() } : {}),
              updatedBy: actorId,
              updatedAt: new Date(),
            })
            .where(eq(cspAmcContract.id, c.id));
        }
        if (shouldEmit) {
          await tx.insert(outboxEvent).values({
            id: newId(),
            tenantId,
            name: eventName("csp", "amc", "expiring"),
            payload: {
              contractNo: c.contractNo,
              customerAccountId: c.customerAccountId,
              endDate: c.endDate,
              daysToExpiry: r.daysToExpiry,
              annualValue: c.annualValue,
            },
            createdAt: new Date(),
          });
        }
        out.push({ contractNo: c.contractNo, status: r.status, daysToExpiry: r.daysToExpiry, leadEmitted: shouldEmit });
      }
      return out;
    });
  }
}
