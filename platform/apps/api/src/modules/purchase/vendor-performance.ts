import { Errors } from "@ind-core/platform";
import { summarizeSupplierEvidence } from "../../common/supplier-performance.js";
import type { ItemSpec } from "../../ports/item.port.js";
import type { VendorInspectionEvidence } from "../../ports/vendor-quality.port.js";

export interface VendorPerformanceInput {
  tenantId: string;
  vendor: { id: string; tenantId: string; code: string; name: string };
  orders: { id: string; tenantId: string; vendorId: string; poNo: string; expectedDate: Date | null; status: string }[];
  receipts: { id: string; tenantId: string; vendorId: string; poId: string; grnDate: Date; status: string }[];
  lines: { tenantId: string; grnId: string; itemId: string; qty: string }[];
  inspections: VendorInspectionEvidence[];
  items: ItemSpec[];
}

const percent = (n: number, d: number): number | null => d > 0 ? Math.round(n / d * 10000) / 100 : null;
const validQty = (n: string | null): n is string => n !== null && Number.isFinite(Number(n)) && Number(n) >= 0;

/** Boundary check also protects against a malformed adapter returning unrelated evidence. */
export function buildVendorPerformance(input: VendorPerformanceInput, asOf = new Date()) {
  const { tenantId, vendor } = input;
  if (vendor.tenantId !== tenantId) throw Errors.notFound("vendor");
  const orders = input.orders.filter((row) => row.tenantId === tenantId && row.vendorId === vendor.id);
  const orderIds = new Set(orders.map((row) => row.id));
  const receipts = input.receipts.filter((row) => row.tenantId === tenantId && row.vendorId === vendor.id && orderIds.has(row.poId) && row.status === "posted");
  const receiptIds = new Set(receipts.map((row) => row.id));
  const lines = input.lines.filter((row) => row.tenantId === tenantId && receiptIds.has(row.grnId));
  const inspections = input.inspections.filter((row) => row.tenantId === tenantId && receiptIds.has(row.receiptId));
  // Reuse the existing completed-order delivery rule. Quantities are handled per material
  // below: kilograms, litres and pieces cannot become one quality denominator.
  const delivery = summarizeSupplierEvidence(orders, receipts, [], []);
  const today = asOf.toISOString().slice(0, 10);
  const openStates = new Set(["approved", "partially_received"]);
  const open = orders.filter((row) => openStates.has(row.status));
  const usable = inspections.filter((row) => row.itemId !== null && lines.some((line) => line.grnId === row.receiptId && line.itemId === row.itemId) && validQty(row.acceptedQty) && validQty(row.rejectedQty));
  const materials = [...new Set(lines.map((row) => row.itemId))].map((itemId) => {
    const item = input.items.find((row) => row.id === itemId);
    const measured = usable.filter((row) => row.itemId === itemId);
    const acceptedQty = measured.reduce((sum, row) => sum + Number(row.acceptedQty), 0);
    const rejectedQty = measured.reduce((sum, row) => sum + Number(row.rejectedQty), 0);
    return { itemId, itemCode: item?.itemCode ?? null, itemName: item?.name ?? null, uom: item?.uom ?? null, receivedQty: lines.filter((row) => row.itemId === itemId).reduce((sum, row) => sum + Number(row.qty), 0), inspectionCount: measured.length, acceptedQty, rejectedQty, rejectionRate: percent(rejectedQty, acceptedQty + rejectedQty), inspections: measured.map((row) => ({ id: row.id, inspectionNo: row.inspectionNo })) };
  }).sort((a, b) => (a.itemCode ?? a.itemId).localeCompare(b.itemCode ?? b.itemId));
  return {
    vendor: { id: vendor.id, code: vendor.code, name: vendor.name },
    asOf: asOf.toISOString(),
    orders: { total: orders.length, completed: delivery.completedOrders, awaitingReceipt: open.length, overdue: open.filter((row) => row.expectedDate !== null && row.expectedDate.toISOString().slice(0, 10) < today).length },
    delivery: { sampleSize: delivery.deliverySampleSize, onTime: delivery.onTimeDeliveries, onTimeRate: delivery.onTimeRate, excludedCompleted: delivery.completedOrders - delivery.deliverySampleSize },
    receipts: { count: receipts.length },
    quality: { inspectionCount: inspections.length, excludedInspections: inspections.length - usable.length, materials },
    evidence: delivery.evidence.map((row) => ({ poId: orders.find((order) => order.poNo === row.poNo)!.id, poNo: row.poNo, expectedDate: row.expectedDate, lastReceiptDate: row.lastReceiptDate, status: row.status })),
    method: "Delivery uses completed purchase orders with both a promised date and posted receipts, comparing the final receipt day with the promised day. Open and partial orders stay outside this rate. Quality uses recorded accepted and rejected quantities from completed incoming inspections, separately for each material; it is not a defect estimate from sampling. Missing evidence is unknown. Records are read on request; refresh after operational changes.",
  };
}
