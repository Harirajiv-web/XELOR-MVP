import { Injectable } from "@nestjs/common";
import { asc, eq, inArray } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { Errors } from "@ind-core/platform";

const {
  sourcingRfq,
  sourcingRfqInvitation,
  sourcingSupplierQuote,
  sourcingAward,
  networkSupplier,
  rfqInvite,
  networkQuoteSubmission,
  vendor,
  item,
} = schema;

export interface DeskQuote {
  id: string;
  origin: "network" | "recorded";
  supplierId: string;
  supplierName: string;
  landedCost: string;
  unitPrice: string;
  toolingCost: string;
  freightCost: string;
  promisedDate: string | null;
  leadTimeDays: number | null;
  meetsNeedDate: boolean | null;
  /** pending | pass | conditional | fail — only a recorded quote has been judged. */
  technicalGate: string | null;
  gateNote: string | null;
  supplierNote: string | null;
  /** Already on the RFQ as a formal quote, or still an outside submission. */
  onRequest: boolean;
  awarded: boolean;
  receivedAt: string;
  /** Cheapest usable answer = 1. Null when nothing can be compared. */
  savingsVsHighest: string | null;
}

export interface DeskRequest {
  id: string;
  rfqNo: string;
  title: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  drawingRev: string | null;
  needDate: string;
  quoteDeadline: string;
  deliveryPlant: string;
  notes: string | null;
  originRef: string | null;
  status: string;
  createdAt: string;
  /** draft | out_to_market | evaluating | awarded | closed — the lane it belongs in. */
  stage: string;
  daysToNeed: number;
  daysToDeadline: number;
  invited: number;
  responded: number;
  quotes: DeskQuote[];
  bestUsable: { supplierName: string; landedCost: string } | null;
  cheapestAny: { supplierName: string; landedCost: string } | null;
  award: {
    supplierName: string | null;
    landedCost: string;
    awardReason: string;
    convertedPoNo: string | null;
  } | null;
}

export interface DeskSupplier {
  id: string;
  name: string;
  supplierCode: string;
  city: string | null;
  categories: string[];
  whatsappE164: string | null;
  email: string | null;
  isApprovedVendor: boolean;
  invitedCount: number;
  respondedCount: number;
  /** Whole percent. Null when they have never been invited to anything. */
  responseRate: number | null;
  wins: number;
  lastQuotedAt: string | null;
}

export interface DeskOverview {
  kpis: {
    openRequests: number;
    awaitingResponse: number;
    quotesIn: number;
    awarded: number;
    suppliers: number;
    /** Whole percent across every invitation ever sent. */
    responseRate: number | null;
    /** Highest minus best-usable, summed over decided requests. */
    savingsIdentified: string;
    /** Requests whose need date is inside a week and which are not yet awarded. */
    urgent: number;
  };
  requests: DeskRequest[];
  suppliers: DeskSupplier[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const m2 = (n: number): string => round2(n).toFixed(2);

const daysFromToday = (iso: string | null): number => {
  if (!iso) return 0;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return 0;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((t - today) / 86_400_000);
};

/**
 * THE SOURCING DESK — one read that answers the question a buyer opens the morning with.
 *
 * Deliberately ONE endpoint rather than a screen that assembles itself from nine. A dashboard
 * built from many calls is a dashboard that renders in pieces, shows a different truth in
 * each panel while they land, and costs a round trip per card — which on a page of thirty
 * cards is how a "live" screen becomes a slow one.
 *
 * It also means every figure on the page was computed from the same instant. A savings tile
 * that disagrees with the request list underneath it destroys confidence in both, and there
 * is no way to make two independent reads agree.
 *
 * TWO KINDS OF ANSWER ARE MERGED HERE, and the difference is kept visible rather than tidied
 * away. A `recorded` quote is one a buyer typed into the RFQ; a `network` quote arrived from
 * outside the building through the supplier portal and is not yet a formal quote on the
 * request. They are shown together because a buyer comparing prices does not care which door
 * a price came through — but only a recorded quote can be awarded, so `onRequest` says which
 * is which and the screen refuses to blur it.
 */
@Injectable()
export class DeskService {
  async overview(): Promise<DeskOverview> {
    return withTenant(async (tx) => {
      const rfqs = await tx.select().from(sourcingRfq).orderBy(asc(sourcingRfq.createdAt));
      const rfqIds = rfqs.map((r) => r.id);

      const [invitations, recorded, awards, netInvites, submissions, suppliers, vendors, items] =
        await Promise.all([
          rfqIds.length
            ? tx.select().from(sourcingRfqInvitation).where(inArray(sourcingRfqInvitation.rfqId, rfqIds))
            : [],
          rfqIds.length
            ? tx.select().from(sourcingSupplierQuote).where(inArray(sourcingSupplierQuote.rfqId, rfqIds))
            : [],
          rfqIds.length ? tx.select().from(sourcingAward).where(inArray(sourcingAward.rfqId, rfqIds)) : [],
          rfqIds.length ? tx.select().from(rfqInvite).where(inArray(rfqInvite.rfqId, rfqIds)) : [],
          rfqIds.length
            ? tx.select().from(networkQuoteSubmission).where(inArray(networkQuoteSubmission.rfqId, rfqIds))
            : [],
          tx.select().from(networkSupplier),
          tx.select({ id: vendor.id, name: vendor.name }).from(vendor),
          rfqIds.length
            ? tx
                .select({ id: item.id, code: item.itemCode, name: item.name })
                .from(item)
                .where(inArray(item.id, [...new Set(rfqs.map((r) => r.itemId))]))
            : [],
        ]);

      const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
      const supplierById = new Map(suppliers.map((s) => [s.id, s]));
      const itemById = new Map(items.map((i) => [i.id, i]));
      // A network supplier who is also an approved vendor answers under two ids; the desk
      // shows one name for them either way.
      const nameForVendor = (id: string): string =>
        vendorName.get(id) ??
        suppliers.find((s) => s.vendorId === id)?.name ??
        "Supplier";

      const requests: DeskRequest[] = rfqs.map((r) => {
        const it = itemById.get(r.itemId);
        const invited = invitations.filter((i) => i.rfqId === r.id);
        const netInvitedHere = netInvites.filter((i) => i.rfqId === r.id);
        const mineRecorded = recorded.filter((q) => q.rfqId === r.id && q.status === "submitted");
        const mineSubs = submissions.filter((s) => s.rfqId === r.id);
        const award = awards.find((a) => a.rfqId === r.id);

        const quotes: DeskQuote[] = [
          ...mineRecorded.map((q) => ({
            id: q.id,
            origin: "recorded" as const,
            supplierId: q.vendorId,
            supplierName: nameForVendor(q.vendorId),
            landedCost: q.landedCost,
            unitPrice: q.unitPrice,
            toolingCost: q.toolingCost,
            freightCost: q.freightCost,
            promisedDate: q.promisedDate,
            leadTimeDays: q.leadTimeDays,
            meetsNeedDate: q.promisedDate ? q.promisedDate <= r.needDate : null,
            technicalGate: q.technicalGate,
            gateNote: q.gateNote,
            supplierNote: null,
            onRequest: true,
            awarded: award?.quoteId === q.id,
            receivedAt: q.createdAt.toISOString(),
            savingsVsHighest: null,
          })),
          // A submission already copied onto the request would otherwise appear twice.
          ...mineSubs
            .filter((s) => !s.sourcingQuoteId)
            .map((s) => ({
              id: s.id,
              origin: "network" as const,
              supplierId: s.supplierId,
              supplierName: supplierById.get(s.supplierId)?.name ?? "Supplier",
              landedCost: s.landedCost,
              unitPrice: s.unitPrice,
              toolingCost: s.toolingCost,
              freightCost: s.freightCost,
              promisedDate: s.promisedDate,
              leadTimeDays: s.leadTimeDays,
              meetsNeedDate: s.promisedDate ? s.promisedDate <= r.needDate : null,
              technicalGate: null,
              gateNote: null,
              supplierNote: s.supplierNote,
              onRequest: false,
              awarded: false,
              receivedAt: s.createdAt.toISOString(),
              savingsVsHighest: null,
            })),
        ].sort((a, b) => Number(a.landedCost) - Number(b.landedCost));

        // "Best" is the cheapest answer that can ACTUALLY BE USED — on time, and not failed
        // against the specification. Reporting the cheapest full stop is how a saving gets
        // claimed against a supplier who was never going to deliver.
        const usable = quotes.filter((q) => q.meetsNeedDate !== false && q.technicalGate !== "fail");
        const best = usable[0] ?? null;
        const cheapest = quotes[0] ?? null;
        const highest = quotes.length ? quotes[quotes.length - 1]! : null;

        for (const q of quotes) {
          q.savingsVsHighest =
            highest && Number(highest.landedCost) > Number(q.landedCost)
              ? m2(Number(highest.landedCost) - Number(q.landedCost))
              : null;
        }

        const responded = new Set([
          ...mineRecorded.map((q) => q.vendorId),
          ...mineSubs.map((s) => s.supplierId),
        ]).size;

        const stage = award
          ? "awarded"
          : r.status === "draft"
            ? "draft"
            : quotes.length > 0
              ? "evaluating"
              : r.status === "closed" || r.status === "cancelled"
                ? "closed"
                : "out_to_market";

        return {
          id: r.id,
          rfqNo: r.rfqNo,
          title: r.title,
          itemCode: it?.code ?? null,
          itemName: it?.name ?? null,
          qty: r.qty,
          uom: r.uom,
          drawingRev: r.drawingRev,
          needDate: r.needDate,
          quoteDeadline: r.quoteDeadline,
          deliveryPlant: r.deliveryPlant,
          notes: r.notes,
          originRef: r.originRef,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          stage,
          daysToNeed: daysFromToday(r.needDate),
          daysToDeadline: daysFromToday(r.quoteDeadline),
          invited: Math.max(invited.length + netInvitedHere.length, responded),
          responded,
          quotes,
          bestUsable: best ? { supplierName: best.supplierName, landedCost: best.landedCost } : null,
          cheapestAny: cheapest
            ? { supplierName: cheapest.supplierName, landedCost: cheapest.landedCost }
            : null,
          award: award
            ? {
                supplierName: nameForVendor(award.vendorId),
                landedCost: award.landedCost,
                awardReason: award.awardReason,
                convertedPoNo: award.convertedPoNo,
              }
            : null,
        };
      });

      const deskSuppliers: DeskSupplier[] = suppliers.map((s) => {
        const invitedTo = netInvites.filter((i) => i.supplierId === s.id);
        const answered = submissions.filter((x) => x.supplierId === s.id);
        const wins = awards.filter((a) => a.vendorId === s.vendorId).length;
        const last = answered
          .map((a) => a.createdAt.toISOString())
          .sort()
          .pop();
        return {
          id: s.id,
          name: s.name,
          supplierCode: s.supplierCode,
          city: s.city,
          categories: (s.categories as string[]) ?? [],
          whatsappE164: s.whatsappE164,
          email: s.email,
          isApprovedVendor: Boolean(s.vendorId),
          invitedCount: invitedTo.length,
          respondedCount: answered.length,
          // Null, never zero: a supplier nobody has asked has not failed to answer.
          responseRate: invitedTo.length
            ? Math.round((answered.length / invitedTo.length) * 100)
            : null,
          wins,
          lastQuotedAt: last ?? null,
        };
      });

      const decided = requests.filter((r) => r.quotes.length > 1);
      const savings = decided.reduce((sum, r) => {
        const highest = r.quotes[r.quotes.length - 1];
        if (!highest || !r.bestUsable) return sum;
        const delta = Number(highest.landedCost) - Number(r.bestUsable.landedCost);
        return delta > 0 ? sum + delta : sum;
      }, 0);

      const totalInvites = netInvites.length;
      const totalAnswers = submissions.length;

      return {
        kpis: {
          openRequests: requests.filter((r) => r.stage !== "awarded" && r.stage !== "closed").length,
          awaitingResponse: requests.filter((r) => r.stage === "out_to_market").length,
          quotesIn: requests.reduce((n, r) => n + r.quotes.length, 0),
          awarded: requests.filter((r) => r.stage === "awarded").length,
          suppliers: suppliers.length,
          responseRate: totalInvites ? Math.round((totalAnswers / totalInvites) * 100) : null,
          savingsIdentified: m2(savings),
          urgent: requests.filter(
            (r) => r.stage !== "awarded" && r.stage !== "closed" && r.daysToNeed <= 7,
          ).length,
        },
        requests: requests.reverse(),
        suppliers: deskSuppliers,
      };
    });
  }

  /** One request, with everything the detail view needs. Same shape as a list row. */
  async request(rfqId: string): Promise<DeskRequest> {
    const all = await this.overview();
    const found = all.requests.find((r) => r.id === rfqId);
    if (!found) throw Errors.notFound(`request '${rfqId}'`);
    return found;
  }
}
