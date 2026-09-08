export interface CreateRfqInput {
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
  tenderId?: string;
  tenderLineNo?: number;
  vendorIds: string[];
}

export interface RecordQuoteInput {
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

export interface SupplierQuoteView {
  id: string;
  vendorId: string;
  vendorName: string | null;
  revisionNo: number;
  unitPrice: string;
  toolingCost: string;
  freightCost: string;
  nonCreditableTax: string;
  landedCost: string;
  moq: string | null;
  leadTimeDays: number | null;
  promisedDate: string | null;
  validUntil: string | null;
  technicalGate: string;
  gateNote: string | null;
  status: string;
  /** Whether the promise actually meets the need date. Computed, never typed in. */
  meetsNeedDate: boolean | null;
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
  createdBy: string;
  invitations: {
    vendorId: string;
    vendorName: string | null;
    responseStatus: string;
  }[];
  quotes: SupplierQuoteView[];
  award: {
    id: string;
    quoteId: string;
    vendorId: string;
    vendorName: string | null;
    awardReason: string;
    landedCost: string;
    convertedPoId: string | null;
    convertedPoNo: string | null;
    status: string;
  } | null;
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
