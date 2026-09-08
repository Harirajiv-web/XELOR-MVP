/**
 * The desk's read model, mirroring `apps/api/src/modules/marketplace/desk.service.ts`.
 *
 * Money and quantities are STRINGS because the columns are NUMERIC and a float would not
 * survive the trip. Anything that can be absent is explicitly nullable rather than optional,
 * so a missing delivery date has to be handled rather than silently rendering "undefined".
 */

export interface DeskQuote {
  id: string;
  /** `recorded` = a quote on the buyer's request. `network` = an outside answer, not yet accepted. */
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
  technicalGate: string | null;
  gateNote: string | null;
  supplierNote: string | null;
  onRequest: boolean;
  awarded: boolean;
  receivedAt: string;
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
    responseRate: number | null;
    savingsIdentified: string;
    urgent: number;
  };
  requests: DeskRequest[];
  suppliers: DeskSupplier[];
}
