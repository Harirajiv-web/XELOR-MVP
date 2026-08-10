import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { Errors, currentTenant, newId } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DocumentEditService } from "../../common/document-edit.service.js";
import { ITEM_PROVIDER, type ItemProvider } from "../../ports/item.port.js";
import { NumberingService, fyCodeFor } from "./numbering.service.js";
import { EntitlementService } from "./entitlement.service.js";
import { TicketService } from "./ticket.service.js";

const { cspSpareRequest, cspTicket } = schema;

export interface SpareRequestInput {
  itemCode: string;
  qty: number;
  ticketNo?: string;
  productSerialNo?: string;
  shipToGstin?: string;
  shipToAddress?: string;
  customerAccountId?: string;
  at?: string;
}

/**
 * SPARE REQUESTS.
 *
 * Read the dependency arrows: this service asks ENGINEERING whether the part exists
 * (`ITEM_PROVIDER`) and asks the entitlement engine whether it is chargeable. It does not
 * read stock, does not value anything, and has no on-hand column to read. Reservation and
 * fulfilment are Inventory's, referenced here by the ids Inventory returns.
 *
 * The chargeability is the ENTITLEMENT ENGINE'S verdict copied onto the request, not a
 * checkbox the customer ticks. A customer who ticks "warranty" on a machine that is out of
 * cover has made a claim, not a decision, and the difference is a real cost.
 */
/** A correction to a spare request. Absent means "leave alone". */
export interface EditSpareRequestInput {
  qty?: number;
  uom?: string;
  shipToGstin?: string;
  shipToAddress?: string;
  reason?: string;
}

@Injectable()
export class SpareService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly edits: DocumentEditService,
    private readonly numbering: NumberingService,
    private readonly entitlement: EntitlementService,
    private readonly tickets: TicketService,
    @Inject(ITEM_PROVIDER) private readonly items: ItemProvider,
  ) {}

  async request(input: SpareRequestInput): Promise<{
    requestNo: string;
    itemCode: string;
    qty: number;
    coverage: string;
    chargeable: boolean;
    unitPrice: number | null;
    lineAmount: number | null;
    status: string;
    reasons: string[];
  }> {
    const { tenantId, actorId, customerAccountId: portalAccount, principal } = currentTenant();

    // Engineering owns the item master. A request for a part that does not exist is
    // refused here rather than becoming a row nobody can fulfil.
    const item = await this.items.getItemByCode(input.itemCode);
    if (!item) throw Errors.notFound(`item ${input.itemCode}`);

    return withTenant(async (tx) => {
      const at = input.at ? new Date(input.at) : new Date();
      const ticket = input.ticketNo ? await this.tickets.byNoInTx(tx, input.ticketNo) : null;
      const accountId =
        principal === "portal" ? portalAccount : (input.customerAccountId ?? ticket?.customerAccountId);
      if (!accountId) {
        throw Errors.validation([{ field: "customerAccountId", message: "a spare request must belong to a customer account" }]);
      }

      const serialNo = input.productSerialNo ?? ticket?.productSerialNo ?? null;
      const coverage = serialNo
        ? await this.entitlement.determineInTx(tx, {
            customerAccountId: accountId,
            serialNo,
            onDate: at.toISOString().slice(0, 10),
          })
        : null;

      // Chargeable unless cover actually includes parts. `partial` — a non-comprehensive
      // AMC — is chargeable for the part and covered for the visit, and saying anything
      // simpler would be wrong in one direction or the other.
      const verdict = coverage?.verdict ?? "not_covered";
      const chargeable = coverage ? coverage.partsChargeable : true;
      // The MVP quotes at standard cost plus a flat 40% service margin. It is a
      // placeholder for SMBD's price list and is labelled as one on the quote.
      const unitPrice = chargeable ? Math.round(item.standardCost * 1.4 * 100) / 100 : null;
      const lineAmount = unitPrice == null ? null : Math.round(unitPrice * input.qty * 100) / 100;

      const id = newId();
      const requestNo = await this.numbering.next(tx, "spare_request", fyCodeFor(at.toISOString()));
      await tx.insert(cspSpareRequest).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: accountId,
        requestNo,
        ticketId: ticket?.id ?? null,
        itemRef: item.id,
        itemCode: item.itemCode,
        qty: String(input.qty),
        uom: item.uom,
        isWarranty: verdict,
        unitPrice: unitPrice == null ? null : unitPrice.toFixed(2),
        lineAmount: lineAmount == null ? null : lineAmount.toFixed(2),
        shipToGstin: input.shipToGstin ?? null,
        shipToAddress: input.shipToAddress ?? null,
        status: chargeable ? "quoted" : "submitted",
      });

      await this.audit.appendInTx(tx, {
        action: "csp.spare_request.created",
        entityType: "csp_spare_request",
        entityId: id,
        data: { requestNo, itemCode: item.itemCode, qty: input.qty, coverage: verdict, chargeable },
      });

      return {
        requestNo,
        itemCode: item.itemCode,
        qty: input.qty,
        coverage: verdict,
        chargeable,
        unitPrice,
        lineAmount,
        status: chargeable ? "quoted" : "submitted",
        reasons: coverage?.reasons ?? ["No machine serial was given, so no coverage could be established."],
      };
    });
  }

  /** Record Inventory's reservation. The reference is Inventory's; nothing here moves
   *  stock, and this service could not if it wanted to. */
  async reserve(requestNo: string, reservationRef: string): Promise<{ requestNo: string; status: string }> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [r] = await tx.select().from(cspSpareRequest).where(eq(cspSpareRequest.requestNo, requestNo)).limit(1);
      if (!r) throw Errors.notFound(`spare request ${requestNo}`);
      await tx
        .update(cspSpareRequest)
        .set({ status: "reserved", reservationRef, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(cspSpareRequest.id, r.id));
      return { requestNo, status: "reserved" };
    });
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(cspSpareRequest).orderBy(cspSpareRequest.requestNo);
      const out: Array<Record<string, unknown>> = [];
      for (const r of rows) {
        const [t] = r.ticketId
          ? await tx.select({ ticketNo: cspTicket.ticketNo }).from(cspTicket).where(eq(cspTicket.id, r.ticketId)).limit(1)
          : [null];
        out.push({
          requestNo: r.requestNo,
          ticketNo: t?.ticketNo ?? null,
          itemCode: r.itemCode,
          qty: Number(r.qty),
          // The unit was stored at request time and was being dropped on the way out, so
          // every screen printed a bare number. A quantity without its unit is a number
          // nobody can act on — "4" of a bearing and "4" of a metre of hose are not the
          // same request.
          uom: r.uom,
          coverage: r.isWarranty,
          unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
          lineAmount: r.lineAmount == null ? null : Number(r.lineAmount),
          status: r.status,
          reservationRef: r.reservationRef,
        });
      }
      return out;
    });
  }

  /* ------------------------------ corrections ----------------------------- */

  /**
   * `itemRef` and `itemCode` are absent: the wrong part is a different request, and the
   * warranty entitlement was evaluated against THIS part. `isWarranty` and the prices are
   * absent because they are the entitlement engine's output, not free text.
   */
  private static readonly EDITABLE_SPARE_FIELDS = ["qty", "uom", "shipToGstin", "shipToAddress"] as const;

  /**
   * Correct a spare request, or amend one already quoted or reserved.
   *
   * FULFILLED is closed: the parts have physically been issued, and the correction is a
   * stock adjustment against what actually went out of the door.
   */
  async editRequest(requestNo: string, input: EditSpareRequestInput) {
    return withTenant(async (tx) => {
      const [found] = await tx
        .select({ id: cspSpareRequest.id })
        .from(cspSpareRequest)
        .where(eq(cspSpareRequest.requestNo, requestNo))
        .limit(1);
      if (!found) throw Errors.notFound(`spare request '${requestNo}'`);

      await this.edits.lock(tx, "csp_spare_request", found.id);
      const [before] = await tx
        .select()
        .from(cspSpareRequest)
        .where(eq(cspSpareRequest.id, found.id))
        .limit(1);
      if (!before) throw Errors.notFound(`spare request '${requestNo}'`);

      const patch: Record<string, unknown> = {};
      if (input.qty !== undefined) {
        if (input.qty <= 0) throw Errors.validation([{ field: "qty", message: "must be > 0" }]);
        patch.qty = input.qty.toFixed(3);
      }
      if (input.uom !== undefined) patch.uom = input.uom;
      if (input.shipToGstin !== undefined) patch.shipToGstin = input.shipToGstin;
      if (input.shipToAddress !== undefined) patch.shipToAddress = input.shipToAddress;

      const outcome = await this.edits.apply(tx, {
        docType: "csp.spare",
        id: found.id,
        before: before as unknown as Record<string, unknown>,
        status: before.status,
        patch,
        editableFields: SpareService.EDITABLE_SPARE_FIELDS,
        reason: input.reason,
      });

      if (!outcome.changed) return before;

      const columns: Record<string, unknown> = { ...outcome.columns };
      // The line amount follows the quantity. A quoted request whose quantity moved
      // without its total moving is a quote the customer would be right to dispute.
      if (input.qty !== undefined && before.unitPrice) {
        columns.lineAmount = (input.qty * Number(before.unitPrice)).toFixed(2);
      }

      await tx.update(cspSpareRequest).set(columns).where(eq(cspSpareRequest.id, found.id));
      const [after] = await tx
        .select()
        .from(cspSpareRequest)
        .where(eq(cspSpareRequest.id, found.id))
        .limit(1);
      return after;
    });
  }

  /** Whether this request may be edited right now, and what to tell the user if not. */
  async editPolicy(requestNo: string) {
    const [row] = await withTenant((tx) =>
      tx
        .select({ status: cspSpareRequest.status, revisionNo: cspSpareRequest.revisionNo })
        .from(cspSpareRequest)
        .where(eq(cspSpareRequest.requestNo, requestNo))
        .limit(1),
    );
    if (!row) throw Errors.notFound(`spare request '${requestNo}'`);
    return { ...this.edits.policy("csp.spare", row.status), status: row.status, revisionNo: row.revisionNo };
  }
}
