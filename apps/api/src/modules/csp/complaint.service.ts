import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { AppError, Errors, currentTenant, eventName, newId } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { NumberingService, fyCodeFor } from "./numbering.service.js";
import { TicketService } from "./ticket.service.js";

const { cspComplaint, cspTicket, cspTicketEvent, outboxEvent } = schema;

export interface RaiseComplaintInput {
  ticketNo: string;
  failureSymptom: string;
  productSerialNo?: string;
  batchRef?: string;
  severity?: "minor" | "major" | "critical";
  inServiceDate?: string;
  at?: string;
}

/**
 * COMPLAINTS — the hand-off to Quality.
 *
 * The hand-off is a transactional outbox write, in the same transaction as the complaint
 * row. Either the complaint exists and Quality has been told, or neither happened. A
 * complaint that exists in CSP and never reached QMS is the failure mode this pattern is
 * for: nobody notices until an auditor asks why a customer defect has no NCR.
 *
 * The customer-facing status is a LABEL, never the record. `investigation` reads as "Under
 * investigation by Quality" — true, useful, and revealing neither the NCR number nor the
 * engineer handling it.
 */
@Injectable()
export class ComplaintService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly tickets: TicketService,
  ) {}

  async raise(input: RaiseComplaintInput): Promise<{ complaintNo: string; ticketNo: string; status: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const t = await this.tickets.byNoInTx(tx, input.ticketNo);
      const at = input.at ? new Date(input.at) : new Date();

      // One complaint per ticket, enforced by a unique key. A second "raise" returns the
      // first — pressing the button twice must not open two investigations into one defect.
      const [existing] = await tx.select().from(cspComplaint).where(eq(cspComplaint.ticketId, t.id)).limit(1);
      if (existing) {
        return { complaintNo: existing.complaintNo, ticketNo: t.ticketNo, status: existing.status };
      }

      const id = newId();
      const complaintNo = await this.numbering.next(tx, "complaint", fyCodeFor(at.toISOString()));
      await tx.insert(cspComplaint).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        complaintNo,
        ticketId: t.id,
        productSerialNo: input.productSerialNo ?? t.productSerialNo ?? null,
        batchRef: input.batchRef ?? null,
        itemRef: t.itemRef,
        failureSymptom: input.failureSymptom,
        inServiceDate: input.inServiceDate ?? null,
        severity: input.severity ?? "major",
        status: "open",
        qmsSyncStatus: "pending",
      });
      await tx.update(cspTicket).set({ complaintId: id, updatedBy: actorId, updatedAt: at }).where(eq(cspTicket.id, t.id));

      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: t.customerAccountId,
        ticketId: t.id,
        eventType: "complaint.raised",
        toValue: complaintNo,
        actorType: "staff",
        actorRef: actorId,
        detail: { severity: input.severity ?? "major", serialNo: input.productSerialNo ?? t.productSerialNo },
        occurredAt: at,
      });
      await this.audit.appendInTx(tx, {
        action: "csp.complaint.created",
        entityType: "csp_complaint",
        entityId: id,
        data: { complaintNo, ticketNo: t.ticketNo, serialNo: input.productSerialNo ?? t.productSerialNo },
      });
      // Same transaction as the row above. This is the whole point of the outbox.
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("csp", "complaint", "created"),
        payload: {
          complaintNo,
          ticketNo: t.ticketNo,
          customerAccountId: t.customerAccountId,
          serialNo: input.productSerialNo ?? t.productSerialNo,
          batchRef: input.batchRef ?? null,
          failureSymptom: input.failureSymptom,
          severity: input.severity ?? "major",
        },
        createdAt: at,
      });

      return { complaintNo, ticketNo: t.ticketNo, status: "open" };
    });
  }

  /**
   * Apply what Quality sent back. In production this is an inbound `qms.ncr.created.v1` /
   * `qms.capa.status_changed.v1` consumer; the shape is identical either way.
   *
   * The containment note is the one thing that crosses back to the customer, and it
   * crosses as a plain-language comment written by a human — never as the NCR text, which
   * names the operator and the machine.
   */
  async applyQmsUpdate(
    complaintNo: string,
    update: { ncrRef?: string; capaRef?: string; capaProgressPct?: number; status?: string; disposition?: string; at?: string },
  ): Promise<{ complaintNo: string; status: string; customerVisibleStatus: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [c] = await tx.select().from(cspComplaint).where(eq(cspComplaint.complaintNo, complaintNo)).limit(1);
      if (!c) throw Errors.notFound(`complaint ${complaintNo}`);
      const at = update.at ? new Date(update.at) : new Date();

      await tx
        .update(cspComplaint)
        .set({
          ...(update.ncrRef ? { ncrRef: update.ncrRef } : {}),
          ...(update.capaRef ? { capaRef: update.capaRef } : {}),
          ...(update.capaProgressPct != null ? { capaProgressPct: update.capaProgressPct } : {}),
          ...(update.status ? { status: update.status } : {}),
          ...(update.disposition ? { disposition: update.disposition } : {}),
          qmsSyncStatus: "acknowledged",
          updatedBy: actorId,
          updatedAt: at,
        })
        .where(eq(cspComplaint.id, c.id));

      await tx.insert(cspTicketEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: c.customerAccountId,
        ticketId: c.ticketId,
        eventType: "complaint.updated",
        fromValue: c.status,
        toValue: update.status ?? c.status,
        actorType: "system",
        // The NCR reference lives on the INTERNAL timeline only. The portal never reads
        // this table; it reads the label map.
        detail: { ncrRef: update.ncrRef ?? c.ncrRef, capaRef: update.capaRef ?? c.capaRef, capaProgressPct: update.capaProgressPct },
        occurredAt: at,
      });

      const status = update.status ?? c.status;
      const label: Record<string, string> = {
        open: "Logged with Quality",
        investigation: "Under investigation by Quality",
        corrective_action: "Corrective action in progress",
        closed: "Quality investigation closed",
      };
      return { complaintNo, status, customerVisibleStatus: label[status] ?? "With Quality" };
    });
  }

  /**
   * Close a complaint. The database refuses this while a CAPA is below 100% unless a
   * manager override with a recorded reason is supplied — the trigger is the arbiter, and
   * this method exists to turn its refusal into a sentence a person can act on.
   */
  async close(
    complaintNo: string,
    opts: { disposition: string; overrideBy?: string; overrideReason?: string; at?: string },
  ): Promise<{ complaintNo: string; status: string; overridden: boolean }> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [c] = await tx.select().from(cspComplaint).where(eq(cspComplaint.complaintNo, complaintNo)).limit(1);
      if (!c) throw Errors.notFound(`complaint ${complaintNo}`);
      const at = opts.at ? new Date(opts.at) : new Date();
      try {
        await tx
          .update(cspComplaint)
          .set({
            status: "closed",
            disposition: opts.disposition,
            closedAt: at,
            ...(opts.overrideBy ? { closureOverrideBy: opts.overrideBy, closureOverrideReason: opts.overrideReason ?? null } : {}),
            updatedBy: actorId,
            updatedAt: at,
          })
          .where(eq(cspComplaint.id, c.id));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("cannot close while CAPA")) {
          throw new AppError(
            "COMPLAINT_CAPA_OPEN",
            422,
            `${complaintNo} cannot be closed while ${c.capaRef} is at ${c.capaProgressPct ?? 0}%. A service manager may override, and the reason is recorded on the complaint.`,
          );
        }
        throw e;
      }
      return { complaintNo, status: "closed", overridden: Boolean(opts.overrideBy) };
    });
  }
}
