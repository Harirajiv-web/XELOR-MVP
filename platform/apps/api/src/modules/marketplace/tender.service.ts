import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, inArray } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@ind-core/db";
import { AppError, currentTenant, Errors, newId } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import {
  assertOpenDeadline,
  lockCommercialInTx,
} from "../../common/commercial-rules.js";
import {
  SOURCING_QUOTE_SINK,
  type SourcingQuoteSink,
} from "../../ports/sourcing.port.js";

const { sourcingTender, sourcingRfq, rfqBroadcast } = schema;
export interface CreateTenderInput {
  title: string;
  quoteDeadline: string;
  needDate: string;
  deliveryPlant: string;
  notes?: string;
  vendorIds: string[];
  lines: { itemId: string; qty: number; uom: string; drawingRev?: string }[];
}
@Injectable()
export class TenderService {
  constructor(
    @Inject(SOURCING_QUOTE_SINK) private readonly rfqs: SourcingQuoteSink,
    private readonly audit: AuditLogService,
  ) {}

  async list() {
    return withTenant(async (tx) => {
      const tenders = await tx
        .select()
        .from(sourcingTender)
        .orderBy(asc(sourcingTender.createdAt));
      const lines = tenders.length
        ? await tx
            .select()
            .from(sourcingRfq)
            .where(
              inArray(
                sourcingRfq.tenderId,
                tenders.map((t) => t.id),
              ),
            )
        : [];
      return {
        items: tenders
          .map((t) => ({
            ...t,
            createdAt: t.createdAt.toISOString(),
            lineCount: lines.filter((l) => l.tenderId === t.id).length,
            awardedCount: lines.filter(
              (l) => l.tenderId === t.id && l.status === "awarded",
            ).length,
          }))
          .reverse(),
      };
    });
  }
  async view(id: string) {
    return withTenant((tx) => this.viewInTx(tx, id));
  }
  private async viewInTx(tx: Tx, id: string) {
    const [tender] = await tx
      .select()
      .from(sourcingTender)
      .where(eq(sourcingTender.id, id))
      .limit(1);
    if (!tender) throw Errors.notFound(`tender '${id}'`);
    const rows = await tx
      .select()
      .from(sourcingRfq)
      .where(eq(sourcingRfq.tenderId, id))
      .orderBy(asc(sourcingRfq.tenderLineNo));
    const lines = [];
    for (const row of rows)
      lines.push({
        lineNo: row.tenderLineNo!,
        rfqId: row.id,
        rfq: await this.rfqs.viewInTx(tx, row.id),
      });
    return { ...tender, createdAt: tender.createdAt.toISOString(), lines };
  }
  async create(input: CreateTenderInput, key: string) {
    const result = await runIdempotent(
      key,
      fingerprint({ op: "create-tender", ...input }),
      async () => ({
        status: 201,
        body: await withTenant(async (tx) => {
          await lockCommercialInTx(tx);
          assertOpenDeadline(input.quoteDeadline);
          if (input.lines.length < 1 || input.lines.length > 100)
            throw Errors.validation([
              { field: "lines", message: "A tender needs 1–100 lines." },
            ]);
          const { tenantId, actorId } = currentTenant();
          const id = newId();
          const tenderNo = `TEN-${new Date().getUTCFullYear()}-${id.replaceAll("-", "").slice(-12).toUpperCase()}`;
          await tx
            .insert(sourcingTender)
            .values({
              id,
              tenantId,
              createdBy: actorId,
              updatedBy: actorId,
              tenderNo,
              title: input.title,
              quoteDeadline: input.quoteDeadline,
              needDate: input.needDate,
              deliveryPlant: input.deliveryPlant,
              notes: input.notes,
            });
          for (const [index, line] of input.lines.entries()) {
            await this.rfqs.createRfqInTx(tx, {
              ...line,
              title: `${input.title} · line ${index + 1}`,
              quoteDeadline: input.quoteDeadline,
              needDate: input.needDate,
              deliveryPlant: input.deliveryPlant,
              notes: input.notes,
              vendorIds: input.vendorIds,
              originRef: tenderNo,
              tenderId: id,
              tenderLineNo: index + 1,
            });
          }
          await this.audit.appendInTx(tx, {
            action: "purchase.tender.created",
            entityType: "sourcing_tender",
            entityId: id,
            data: { tenderNo, lines: input.lines.length },
          });
          return this.viewInTx(tx, id);
        }),
      }),
    );
    return result.body;
  }
  async transition(
    id: string,
    action: "publish" | "close" | "cancel",
    key: string,
    reason?: string,
  ) {
    const result = await runIdempotent(
      key,
      fingerprint({ op: "tender-transition", id, action, reason }),
      async () => ({
        status: 200,
        body: await withTenant(async (tx) => {
          await lockCommercialInTx(tx);
          const tender = await this.viewInTx(tx, id);
          const { actorId } = currentTenant();
          if (action === "publish") {
            if (tender.status !== "draft")
              throw new AppError(
                "TENDER_NOT_DRAFT",
                409,
                "Only a draft tender can be published.",
              );
            assertOpenDeadline(tender.quoteDeadline);
            for (const line of tender.lines)
              await this.rfqs.issueInTx(tx, line.rfqId);
          } else if (action === "close") {
            if (tender.status !== "published")
              throw new AppError(
                "TENDER_NOT_PUBLISHED",
                409,
                "Only a published tender can close for evaluation.",
              );
          } else {
            if (
              ["awarded", "cancelled"].includes(tender.status) ||
              tender.lines.some((l) => l.rfq.award)
            )
              throw new AppError(
                "TENDER_NOT_CANCELLABLE",
                409,
                "An awarded or cancelled tender cannot be cancelled.",
              );
            if (!reason?.trim())
              throw Errors.validation([
                {
                  field: "reason",
                  message: "Record why the tender is cancelled.",
                },
              ]);
          }
          const lineIds = tender.lines.map((l) => l.rfqId);
          if (action !== "publish" && lineIds.length) {
            await tx
              .update(rfqBroadcast)
              .set({
                status: "closed",
                updatedAt: new Date(),
                updatedBy: actorId,
              })
              .where(inArray(rfqBroadcast.rfqId, lineIds));
            await tx
              .update(sourcingRfq)
              .set({
                status: action === "cancel" ? "cancelled" : "evaluation",
                updatedAt: new Date(),
                updatedBy: actorId,
              })
              .where(inArray(sourcingRfq.id, lineIds));
          }
          await tx
            .update(sourcingTender)
            .set({
              status:
                action === "publish"
                  ? "published"
                  : action === "close"
                    ? "evaluation"
                    : "cancelled",
              ...(action === "publish"
                ? { publishedAt: new Date() }
                : { closedAt: new Date() }),
              cancelReason: reason ?? null,
              updatedAt: new Date(),
              updatedBy: actorId,
            })
            .where(eq(sourcingTender.id, id));
          await this.audit.appendInTx(tx, {
            action: `purchase.tender.${action}`,
            entityType: "sourcing_tender",
            entityId: id,
            data: { tenderNo: tender.tenderNo, reason },
          });
          return this.viewInTx(tx, id);
        }),
      }),
    );
    return result.body;
  }
  async award(
    id: string,
    awards: {
      rfqId: string;
      quoteId: string;
      awardReason: string;
      expectedDate?: string;
    }[],
    key: string,
  ) {
    const result = await runIdempotent(
      key,
      fingerprint({ op: "award-tender", id, awards }),
      async () => ({
        status: 201,
        body: await withTenant(async (tx) => {
          await lockCommercialInTx(tx);
          const tender = await this.viewInTx(tx, id);
          if (tender.status !== "evaluation")
            throw new AppError(
              "TENDER_NOT_EVALUATING",
              409,
              "Close bidding before awarding the tender.",
            );
          const remaining = tender.lines.filter((l) => !l.rfq.award);
          if (
            new Set(awards.map((a) => a.rfqId)).size !== awards.length ||
            awards.length !== remaining.length ||
            remaining.some((l) => !awards.some((a) => a.rfqId === l.rfqId))
          ) {
            throw Errors.validation([
              {
                field: "awards",
                message:
                  "Select exactly one approved quote for every unawarded tender line.",
              },
            ]);
          }
          for (const award of [...awards].sort((a, b) =>
            a.rfqId.localeCompare(b.rfqId),
          ))
            await this.rfqs.awardInTx(tx, award.rfqId, award, id);
          await tx
            .update(sourcingTender)
            .set({
              status: "awarded",
              updatedAt: new Date(),
              updatedBy: currentTenant().actorId,
            })
            .where(eq(sourcingTender.id, id));
          await this.audit.appendInTx(tx, {
            action: "purchase.tender.awarded",
            entityType: "sourcing_tender",
            entityId: id,
            data: { tenderNo: tender.tenderNo, awards },
          });
          return this.viewInTx(tx, id);
        }),
      }),
    );
    return result.body;
  }
}
