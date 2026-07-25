/**
 * The inspection-gate port (INSPECTION §1.2). The most important boundary in the module,
 * and deliberately NOT a land grab:
 *
 *   "The transactional gate belongs to the module that owns the transaction;
 *    the inspection definition and the inspection record belong to Quality."
 *
 * So Purchase keeps deciding whether a GRN may submit, and Production keeps deciding
 * whether finished goods may leave the floor — but neither writes an inspection row any
 * more. They ask through this port, exactly as they post stock through STOCK_POSTER.
 */
export const INSPECTION_GATE = Symbol("InspectionGate");

/** The owning transaction types that can be gated. Quality's own types (standalone,
 *  pre_dispatch, …) are never gate anchors, so the original four keep their semantics. */
export type InspectionRefType =
  | "grn"
  | "manufacture"
  | "subcontract_receipt"
  | "job_card";

export interface RequestInspectionInput {
  refType: InspectionRefType;
  /** The logical id of the row in the OWNING module (a GRN id, a production order id). */
  refId: string;
  itemId: string;
  lotQty: number;
  /** Where the lot physically sits, so a reject disposition knows what to move. */
  sourceWarehouseId?: string;
  inspectionType?: string;
}

export interface RequestInspectionResult {
  inspectionId: string;
  inspectionNo: string;
  status: string;
  sampleSize: number | null;
  acceptNumber: number | null;
  rejectNumber: number | null;
  samplingRationale: string | null;
}

/**
 * `state: 'none'` means no inspection was ever requested for this transaction — the caller
 * proceeds unhindered. That keeps the gate OPT-IN: wiring the port into a module does not
 * retroactively block transactions nobody asked to inspect.
 */
export interface GateStatus {
  required: boolean;
  state: "none" | "pending" | "in_progress" | "completed" | "cancelled";
  result: "pending" | "accepted" | "rejected" | "cancelled" | null;
  inspectionId: string | null;
  inspectionNo: string | null;
  qtyAccepted: number | null;
  qtyRejected: number | null;
}

export interface InspectionGate {
  /** Open (or return the existing) inspection for an owning transaction. Idempotent on
   *  (refType, refId) — the unique gate index makes double-gating unrepresentable. */
  requestInspection(input: RequestInspectionInput): Promise<RequestInspectionResult>;
  /** What the owning module needs to decide whether its transaction may proceed. */
  gateStatus(refType: InspectionRefType, refId: string): Promise<GateStatus>;
}
