/**
 * Sourcing's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * Every field below was read off `apps/api/src/modules/purchase/rfq.service.ts` rather than
 * inferred from the table names. Money and quantities arrive as STRINGS: the columns are
 * `NUMERIC` and a float would not survive the trip.
 */

import { AppError } from "@spine/api/errors";

/** pass | conditional | fail — and `pending` until a person has judged it. */
export type TechnicalGate = "pending" | "pass" | "conditional" | "fail";

export interface SupplierQuoteView {
  id: string;
  vendorId: string;
  vendorName: string | null;
  revisionNo: number;
  unitPrice: string;
  toolingCost: string;
  freightCost: string;
  nonCreditableTax: string;
  /**
   * What the company actually pays to have the material on the floor. STORED at the moment
   * the quote was recorded, never recomputed on read — the number a buyer compared has to be
   * the number the award is judged against later.
   */
  landedCost: string;
  moq: string | null;
  leadTimeDays: number | null;
  promisedDate: string | null;
  validUntil: string | null;
  technicalGate: TechnicalGate;
  gateNote: string | null;
  /** submitted | superseded | withdrawn. A re-quote supersedes; it never overwrites. */
  status: string;
  /** Computed by the server against the RFQ's need date. Null when nothing was promised. */
  meetsNeedDate: boolean | null;
}

export interface RfqInvitationView {
  vendorId: string;
  vendorName: string | null;
  responseStatus: string;
}

export interface RfqAwardView {
  id: string;
  quoteId: string;
  vendorId: string;
  vendorName: string | null;
  awardReason: string;
  landedCost: string;
  convertedPoId: string | null;
  convertedPoNo: string | null;
  status: string;
}

export interface RfqView {
  id: string;
  rfqNo: string;
  title: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  qty: string;
  uom: string;
  drawingRev: string | null;
  needDate: string;
  quoteDeadline: string;
  deliveryPlant: string;
  originRef: string | null;
  notes: string | null;
  status: string;
  /** Who raised it. The award refuses this same person — separation of duties. */
  createdBy: string;
  invitations: RfqInvitationView[];
  quotes: SupplierQuoteView[];
  award: RfqAwardView | null;
}

export interface RfqSummary {
  id: string;
  rfqNo: string;
  title: string;
  qty: string;
  uom: string;
  needDate: string;
  quoteDeadline: string;
  status: string;
  invitedCount: number;
  quotedCount: number;
  awardedVendorName: string | null;
}

export interface VendorRow {
  id: string;
  name: string;
  vendorCode?: string;
}

export interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  uom: string;
}

export interface CreateRfqBody {
  title: string;
  itemId: string;
  qty: number;
  uom: string;
  drawingRev?: string;
  needDate: string;
  quoteDeadline: string;
  deliveryPlant: string;
  originRef?: string;
  notes?: string;
  vendorIds: string[];
}

export interface RecordQuoteBody {
  vendorId: string;
  unitPrice: number;
  toolingCost?: number;
  freightCost?: number;
  nonCreditableTax?: number;
  moq?: number;
  leadTimeDays?: number;
  promisedDate?: string;
}

export interface FailureNotice {
  title: string;
  body: string;
}

export const sourcingApi = {
  listPath: "/purchase/rfqs",
  rfqPath: (id: string): string => `/purchase/rfqs/${id}`,
  issuePath: (id: string): string => `/purchase/rfqs/${id}/issue`,
  quotesPath: (id: string): string => `/purchase/rfqs/${id}/quotes`,
  gatePath: (id: string, quoteId: string): string => `/purchase/rfqs/${id}/quotes/${quoteId}/gate`,
  awardPath: (id: string): string => `/purchase/rfqs/${id}/award`,
  vendorsPath: "/purchase/vendors",
  itemsPath: "/engineering/items",
  pageSize: 50,
  pickerPageSize: 100,
} as const;

/** The live revision of each supplier's answer. Superseded rows stay readable, but not here. */
export function liveQuotes(quotes: readonly SupplierQuoteView[]): SupplierQuoteView[] {
  return quotes.filter((q) => q.status === "submitted");
}

/**
 * Cheapest landed cost first — the order a buyer reads in, and the order that makes the
 * point: on a well-run RFQ the top row is often the one that cannot be used.
 */
export function byLandedCost(quotes: readonly SupplierQuoteView[]): SupplierQuoteView[] {
  return [...quotes].sort((a, b) => Number(a.landedCost) - Number(b.landedCost));
}

/** A failed quote can never be awarded, whatever it costs. Pending has not been judged yet. */
export function isAwardable(q: SupplierQuoteView): boolean {
  return q.status === "submitted" && (q.technicalGate === "pass" || q.technicalGate === "conditional");
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Turn a refusal into something a buyer can act on.
 *
 * The two that matter most are deliberate refusals, not faults, and saying so is the
 * difference between "the software is broken" and "the software just stopped me doing
 * something I should not do".
 */
export function describeFailure(error: unknown): FailureNotice {
  if (error instanceof AppError) {
    switch (error.code) {
      case "QUOTE_FAILED_TECHNICAL_GATE":
        return {
          title: "That quote failed the specification",
          body: "It cannot be awarded whatever it costs. Re-gate it only if the specification judgement itself was wrong.",
        };
      case "QUOTE_NOT_GATED":
        return {
          title: "This quote has not been judged yet",
          body: "Mark it Pass, Conditional or Fail against the released drawing before awarding it.",
        };
      case "SEGREGATION_OF_DUTIES":
        return {
          title: "You raised this RFQ, so you cannot award it",
          body: "A second person has to sign the award. That is the control, not a fault.",
        };
      case "RFQ_ALREADY_AWARDED":
        return { title: "This RFQ has already been awarded", body: "Reload to see the award and its purchase order." };
      case "VENDOR_NOT_INVITED":
        return {
          title: "That supplier was not invited",
          body: "Only a supplier on the invitation list can have a quote recorded against this RFQ.",
        };
      case "VALIDATION_FAILED":
        return { title: "Some details need correcting", body: error.message };
      default:
        return { title: "The request was refused", body: error.message };
    }
  }
  return {
    title: "The request could not be sent",
    body: error instanceof Error ? error.message : "Something went wrong. Try again.",
  };
}
