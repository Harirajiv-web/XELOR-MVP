import { Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import {
  AppError,
  Errors,
  cancelWindow,
  choosePortal,
  currentTenant,
  eventName,
  ewbValidity,
  irnIdempotencyKey,
  newId,
  recoveryPlan,
  reportingWindow,
  type IrnStatus,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { einvoiceIrnLog, ewaybillLog, outboxEvent } = schema;

const iso = (d: Date): string => d.toISOString();

/**
 * THE STATUTORY PIPELINES — e-invoice (IRN) and e-way bill.
 *
 * This is the one integration where a retry costs real money and a duplicate is visible to
 * a regulator. Three rules carry the module:
 *
 *  - **GET before you retry.** A timeout is not a failure. The portal may hold an IRN for
 *    this document already, and re-POSTing either duplicates it or burns the 24-hour
 *    cancellation window.
 *  - **The 30-day reporting window is a cliff.** Past it the portal refuses the invoice
 *    permanently and the only remedy is a credit note. So the alerts escalate at day 20,
 *    25 and 28 rather than arriving once at the end.
 *  - **An e-way bill remembers which portal made it.** A bill generated on the secondary
 *    portal must be cancelled on the secondary portal; losing that fact is how a
 *    cancellation silently fails while the truck is already moving.
 */
@Injectable()
export class StatutoryService {
  constructor(private readonly audit: AuditLogService) {}

  /* ------------------------------- e-invoice ------------------------------ */

  /**
   * Register an invoice for IRN generation.
   *
   * The idempotency key is derived from the DOCUMENT, never the attempt — attempt two must
   * present the same key or the gateway sees a second invoice.
   */
  async submitInvoice(input: {
    invoiceRef: string;
    gstin: string;
    buyerGstin?: string;
    shipToGstin?: string;
    docType?: "INV" | "CRN" | "DBN";
    docDate: string;
    fy: string;
    taxableValue: number;
    totalValue: number;
    aato: number;
    /** Fake-adapter failure injection. */
    simulate?: { timedOut?: boolean; httpStatus?: number; errorCode?: string };
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const docType = input.docType ?? "INV";
    const correlationId = `irn-${newId().slice(-12)}`;
    const idempotencyKey = irnIdempotencyKey({ gstin: input.gstin, docType, invoiceRef: input.invoiceRef, fy: input.fy });
    const window = reportingWindow({ docDate: input.docDate, aato: input.aato, asOf: new Date().toISOString() });

    // The window is checked BEFORE submitting. Past the cliff the portal refuses, and
    // discovering that from a rejection wastes the one thing that is short: time.
    if (window.blocked) {
      throw new AppError("INT_IRN_WINDOW_CLOSED", 422, window.message);
    }

    return withTenant(async (tx) => {
      const existing = await tx.select().from(einvoiceIrnLog).where(eq(einvoiceIrnLog.invoiceRef, input.invoiceRef)).limit(1);
      if (existing.length > 0 && existing[0]!.status === "generated") {
        return { invoiceRef: input.invoiceRef, status: "generated", irn: existing[0]!.irn, replay: true, note: "This document already has an IRN. Nothing was sent." };
      }

      const sim = input.simulate ?? {};
      const succeeded = !sim.timedOut && !sim.errorCode && (sim.httpStatus ?? 200) < 400;
      const now = new Date();
      const id = existing[0]?.id ?? newId();
      const attempts = (existing[0]?.attempts ?? 0) + 1;

      const base = {
        tenantId, createdBy: actorId, updatedBy: actorId,
        invoiceRef: input.invoiceRef,
        gstin: input.gstin,
        buyerGstin: input.buyerGstin ?? null,
        // From 1 Aug 2026 the IRP requires ship-to; 'URP' is valid for an unregistered one.
        shipToGstin: input.shipToGstin ?? null,
        docType,
        docDate: input.docDate,
        fy: input.fy,
        taxableValue: input.taxableValue.toFixed(2),
        totalValue: input.totalValue.toFixed(2),
        windowApplicable: window.applicable,
        windowDeadlineAt: window.deadlineAt,
        windowAlertLevel: window.alertLevel,
        attempts,
        lastIdempotencyKey: idempotencyKey,
        correlationId,
      };

      if (succeeded) {
        const irn = `IRN${input.gstin}${input.invoiceRef}`.replace(/[^A-Za-z0-9]/g, "").padEnd(64, "0").slice(0, 64);
        const values = {
          ...base,
          status: "generated" as const,
          irn,
          ackNo: `ACK${Date.now()}`.slice(0, 18),
          ackDate: now,
          signedInvoiceRef: `s3://irn/${input.invoiceRef}.jwt`,
          signedQrRef: `s3://irn/${input.invoiceRef}.qr`,
          reportedAt: now,
          reportedWithinWindow: !window.applicable || (window.deadlineAt != null && input.docDate <= window.deadlineAt),
          errorCode: null,
          errorMessage: null,
        };
        if (existing.length > 0) await tx.update(einvoiceIrnLog).set(values).where(eq(einvoiceIrnLog.id, id));
        else await tx.insert(einvoiceIrnLog).values({ id, ...values });

        await tx.insert(outboxEvent).values({
          id: newId(), tenantId,
          name: eventName("integration", "irn", "generated"),
          payload: { invoiceRef: input.invoiceRef, irn, gstin: input.gstin },
          createdAt: now,
        });
        await this.audit.appendInTx(tx, {
          action: "integration.irn.generated",
          entityType: "einvoice_irn_log",
          entityId: id,
          data: { invoiceRef: input.invoiceRef, irn, idempotencyKey },
        });
        return { invoiceRef: input.invoiceRef, status: "generated", irn, ackNo: values.ackNo, window, idempotencyKey };
      }

      const values = {
        ...base,
        status: "failed" as const,
        errorCode: sim.errorCode ?? (sim.timedOut ? "TIMEOUT" : String(sim.httpStatus ?? 500)),
        errorMessage: sim.timedOut ? "The request timed out." : `Portal returned ${sim.errorCode ?? sim.httpStatus ?? 500}.`,
      };
      if (existing.length > 0) await tx.update(einvoiceIrnLog).set(values).where(eq(einvoiceIrnLog.id, id));
      else await tx.insert(einvoiceIrnLog).values({ id, ...values });

      const plan = recoveryPlan({
        status: "pending" as IrnStatus,
        timedOut: Boolean(sim.timedOut),
        httpStatus: sim.httpStatus ?? null,
        errorCode: sim.errorCode ?? null,
        attempts,
      });
      return { invoiceRef: input.invoiceRef, status: "failed", attempts, window, idempotencyKey, recovery: plan };
    });
  }

  /**
   * The Get-before-retry step.
   *
   * Called after a timeout. In the fake adapter the portal is treated as having registered
   * the document, which is the case the rule exists for — and it is the case a blind retry
   * would turn into a duplicate filing.
   */
  async fetchByDocument(invoiceRef: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(einvoiceIrnLog).where(eq(einvoiceIrnLog.invoiceRef, invoiceRef)).limit(1);
      if (!row) throw Errors.notFound(`invoice ${invoiceRef}`);
      if (row.status === "generated") {
        return { invoiceRef, status: "generated", irn: row.irn, note: "Already recorded here — nothing was fetched." };
      }

      const now = new Date();
      const irn = `IRN${row.gstin}${invoiceRef}`.replace(/[^A-Za-z0-9]/g, "").padEnd(64, "0").slice(0, 64);
      await tx
        .update(einvoiceIrnLog)
        .set({
          status: "generated", irn, ackNo: `ACK${Date.now()}`.slice(0, 18), ackDate: now,
          signedInvoiceRef: `s3://irn/${invoiceRef}.jwt`, signedQrRef: `s3://irn/${invoiceRef}.qr`,
          reportedAt: now,
          reportedWithinWindow: !row.windowApplicable || (row.windowDeadlineAt != null && row.docDate <= row.windowDeadlineAt),
          errorCode: null, errorMessage: null, updatedBy: actorId, updatedAt: now,
        })
        .where(eq(einvoiceIrnLog.id, row.id));

      await this.audit.appendInTx(tx, {
        action: "integration.irn.recovered_by_get",
        entityType: "einvoice_irn_log",
        entityId: row.id,
        data: { invoiceRef, irn, note: "Recovered by fetching the document rather than resubmitting it." },
      });
      return {
        invoiceRef, status: "generated", irn, recoveredByGet: true,
        note: "The portal DID have it. A blind retry here would have produced a second filing that cannot be withdrawn.",
      };
    });
  }

  async cancelIrn(invoiceRef: string, reason: string, asOf?: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(einvoiceIrnLog).where(eq(einvoiceIrnLog.invoiceRef, invoiceRef)).limit(1);
      if (!row) throw Errors.notFound(`invoice ${invoiceRef}`);
      if (row.status !== "generated" || !row.ackDate) {
        throw new AppError("INT_IRN_NOT_GENERATED", 409, `${invoiceRef} has no IRN to cancel.`);
      }
      const w = cancelWindow(iso(row.ackDate), now);
      if (!w.cancellable) throw new AppError("INT_IRN_CANCEL_WINDOW_CLOSED", 422, w.message);

      await tx
        .update(einvoiceIrnLog)
        .set({ status: "cancelled", cancelledAt: new Date(now), cancelReason: reason, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(einvoiceIrnLog.id, row.id));
      return { invoiceRef, status: "cancelled", reason, ...w };
    });
  }

  /** Every unreported invoice with its window position — the compliance dashboard. */
  async windowWatch(asOf?: string): Promise<Record<string, unknown>> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const rows = await tx.select().from(einvoiceIrnLog).orderBy(asc(einvoiceIrnLog.docDate));
      const watch = rows
        .filter((r) => r.status !== "generated" && r.status !== "cancelled" && r.windowApplicable)
        .map((r) => ({
          invoiceRef: r.invoiceRef,
          docDate: r.docDate,
          status: r.status,
          ...reportingWindow({ docDate: r.docDate, aato: 150_000_000, asOf: now }),
        }));
      const blocked = watch.filter((w) => w.blocked);
      const critical = watch.filter((w) => w.alertLevel === 3 && !w.blocked);
      return {
        asOf: now,
        watching: watch.length,
        blocked: blocked.length,
        critical: critical.length,
        rows: watch,
        headline:
          blocked.length > 0
            ? `${blocked.length} invoice(s) are PAST the 30-day window and can never be reported. They need credit notes and re-issue.`
            : critical.length > 0
              ? `${critical.length} invoice(s) are inside the last two days of their reporting window.`
              : watch.length > 0
                ? `${watch.length} invoice(s) awaiting an IRN, none urgent.`
                : "Every invoice in scope has an IRN.",
      };
    });
  }

  /* ------------------------------ e-way bill ------------------------------ */

  async generateEwayBill(input: {
    shipmentRef: string;
    invoiceRef?: string;
    irn?: string;
    consignmentValue: number;
    distanceKm: number;
    vehicleNo?: string;
    transporterGstin?: string;
    shipToGstin?: string;
    billToState?: string;
    shipToState?: string;
    portalHealth?: { ewb1Healthy: boolean; ewb2Healthy: boolean };
    asOf?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const now = input.asOf ?? new Date().toISOString();
    const health = input.portalHealth ?? { ewb1Healthy: true, ewb2Healthy: true };
    const choice = choosePortal(health);

    if (!health.ewb1Healthy && !health.ewb2Healthy) {
      throw new AppError("INT_EWB_BOTH_PORTALS_DOWN", 503, choice.message);
    }

    return withTenant(async (tx) => {
      const validity = ewbValidity({ generatedAt: now, distanceKm: input.distanceKm, asOf: now });
      const id = newId();
      await tx.insert(ewaybillLog).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        shipmentRef: input.shipmentRef,
        invoiceRef: input.invoiceRef ?? null,
        irn: input.irn ?? null,
        ewbNo: `EWB${Date.now()}`.slice(0, 12),
        consignmentValue: input.consignmentValue.toFixed(2),
        distanceKm: input.distanceKm,
        validUpto: new Date(validity.validUpto),
        vehicleNo: input.vehicleNo ?? null,
        transporterGstin: input.transporterGstin ?? null,
        shipToGstin: input.shipToGstin ?? null,
        billToState: input.billToState ?? null,
        shipToState: input.shipToState ?? null,
        portalUsed: choice.portal,
        status: "generated",
        correlationId: `ewb-${newId().slice(-12)}`,
      });

      await this.audit.appendInTx(tx, {
        action: "integration.ewb.generated",
        entityType: "ewaybill_log",
        entityId: id,
        data: { shipmentRef: input.shipmentRef, portal: choice.portal, failedOver: choice.failedOver, validUpto: validity.validUpto },
      });

      return {
        shipmentRef: input.shipmentRef,
        status: "generated",
        portalUsed: choice.portal,
        failedOver: choice.failedOver,
        portalNote: choice.message,
        ...validity,
      };
    });
  }

  /**
   * Close an e-way bill.
   *
   * Closure must go to the SAME portal that generated it. Sending it to the primary because
   * that is the default is how a closure silently fails on a bill the secondary portal owns.
   */
  async closeEwayBill(shipmentRef: string, remarks: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(ewaybillLog).where(eq(ewaybillLog.shipmentRef, shipmentRef)).limit(1);
      if (!row) throw Errors.notFound(`shipment ${shipmentRef}`);
      if (row.status === "cancelled") throw new AppError("INT_EWB_CANCELLED", 409, "A cancelled e-way bill cannot be closed.");
      if (row.closureStatus === "closed") return { shipmentRef, closureStatus: "closed", replay: true };

      await tx
        .update(ewaybillLog)
        .set({ closureStatus: "closed", closedAt: new Date(), closureRemarks: remarks, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(ewaybillLog.id, row.id));

      return {
        shipmentRef,
        closureStatus: "closed",
        portalUsed: row.portalUsed,
        note: `Closed on ${row.portalUsed} — the same portal that generated it. Closing on the other one silently does nothing.`,
      };
    });
  }

  async ewayBills(asOf?: string): Promise<Record<string, unknown>[]> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const rows = await tx.select().from(ewaybillLog).orderBy(desc(ewaybillLog.createdAt));
      return rows.map((r) => ({
        shipmentRef: r.shipmentRef,
        ewbNo: r.ewbNo,
        portalUsed: r.portalUsed,
        status: r.status,
        closureStatus: r.closureStatus,
        distanceKm: r.distanceKm,
        ...(r.validUpto
          ? ewbValidity({ generatedAt: iso(r.createdAt), distanceKm: r.distanceKm, asOf: now })
          : { validUpto: null, daysValid: 0, expired: false, message: "Not generated." }),
      }));
    });
  }
}
