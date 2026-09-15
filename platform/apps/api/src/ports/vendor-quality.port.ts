/** Quality owns inspection evidence; Purchase requests a narrow read-only projection. */
export const VENDOR_QUALITY_EVIDENCE = Symbol("VendorQualityEvidence");

export interface VendorInspectionEvidence {
  tenantId: string;
  id: string;
  inspectionNo: string;
  receiptId: string;
  itemId: string | null;
  acceptedQty: string | null;
  rejectedQty: string | null;
}

export interface VendorQualityEvidence {
  completedForReceipts(receiptIds: readonly string[]): Promise<VendorInspectionEvidence[]>;
}
