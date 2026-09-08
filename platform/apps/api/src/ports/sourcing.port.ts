import type { Tx } from "@ind-core/db";
import type { CreateRfqInput, RfqView } from "./sourcing-types.js";
/**
 * The sourcing-quote port (DECISIONS-V2 §1.1 / §5.6).
 *
 * PURCHASE owns requests for quotation and the quotes recorded against them. The supplier
 * network reaches people outside the building and brings their answers back, and those
 * answers have to land as ordinary sourcing quotes — through Purchase's own code, so the
 * invitation check, the revisioning, the landed-cost arithmetic and the audit entry are the
 * same ones a typed quote gets.
 *
 * A port rather than an import for the usual reason: the network must be deletable without
 * touching Purchase, and Purchase must never learn that a network exists. It provides this
 * symbol; whoever wants it asks for the symbol.
 */
export const SOURCING_QUOTE_SINK = Symbol("SourcingQuoteSink");

export interface SourcingQuoteInput {
  vendorId: string;
  unitPrice: number;
  toolingCost?: number;
  freightCost?: number;
  nonCreditableTax?: number;
  moq?: number;
  leadTimeDays?: number;
  promisedDate?: string;
  validUntil?: string;
}

/** Only what a caller needs to find the quote it just caused. Not the whole RFQ view. */
export interface RecordedQuote {
  id: string;
  vendorId: string;
  status: string;
  landedCost: string;
}

export interface SourcingQuoteSink {
  createRfqInTx(tx: Tx, input: CreateRfqInput): Promise<RfqView>;
  issueInTx(tx: Tx, rfqId: string): Promise<RfqView>;
  viewInTx(tx: Tx, rfqId: string): Promise<RfqView>;
  awardInTx(
    tx: Tx,
    rfqId: string,
    input: { quoteId: string; awardReason: string; expectedDate?: string },
    parentTenderId?: string,
  ): Promise<RfqView>;
  recordQuoteInTx(
    tx: Tx,
    rfqId: string,
    input: SourcingQuoteInput,
    receivedOn?: string,
  ): Promise<{ quotes: readonly RecordedQuote[] }>;
  /**
   * Record a supplier's price against an RFQ, idempotent on the key. Returns every quote on
   * the request afterwards, so the caller can identify the revision it created without
   * Purchase having to know why it was asked.
   */
  recordQuote(
    rfqId: string,
    input: SourcingQuoteInput,
    idempotencyKey: string,
  ): Promise<{ quotes: readonly RecordedQuote[] }>;
}
