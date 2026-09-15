/** Shared, deterministic supplier evidence arithmetic. No database or product dependencies. */
const percent = (n: number, d: number): number | null =>
  d ? Math.round((n / d) * 10000) / 100 : null;
export function summarizeSupplierEvidence(
  orders: {
    id: string;
    poNo: string;
    expectedDate: Date | null;
    status: string;
  }[],
  receipts: { id: string; poId: string; grnDate: Date }[],
  receiptLines: { grnId: string; qty: string }[],
  inspections: {
    refId: string | null;
    qtyAccepted: string | null;
    qtyRejected: string | null;
  }[],
) {
  const evidence = orders.map((order) => {
    const own = receipts.filter((r) => r.poId === order.id);
    const dates = own.map((r) => r.grnDate.toISOString()).sort();
    const receiptIds = new Set(own.map((r) => r.id));
    return {
      poNo: order.poNo,
      expectedDate: order.expectedDate?.toISOString() ?? null,
      lastReceiptDate: dates.at(-1) ?? null,
      receivedQty: receiptLines
        .filter((l) => receiptIds.has(l.grnId))
        .reduce((n, l) => n + Number(l.qty), 0),
      status: order.status,
    };
  });
  const measurable = evidence.filter(
    (e) => e.status === "received" && e.expectedDate && e.lastReceiptDate,
  );
  const onTime = measurable.filter(
    (e) => e.lastReceiptDate!.slice(0, 10) <= e.expectedDate!.slice(0, 10),
  ).length;
  const receivedQty = receiptLines.reduce((n, l) => n + Number(l.qty), 0);
  const acceptedQty = inspections.reduce(
    (n, i) => n + Number(i.qtyAccepted ?? 0),
    0,
  );
  const rejectedQty = inspections.reduce(
    (n, i) => n + Number(i.qtyRejected ?? 0),
    0,
  );
  return {
    evidenceStatus:
      receipts.length || inspections.length
        ? ("measured" as const)
        : ("unknown" as const),
    orders: orders.length,
    completedOrders: orders.filter((o) => o.status === "received").length,
    deliverySampleSize: measurable.length,
    onTimeDeliveries: onTime,
    onTimeRate: percent(onTime, measurable.length),
    receivedQty,
    inspectedQty: acceptedQty + rejectedQty,
    acceptedQty,
    rejectedQty,
    rejectionRate: percent(rejectedQty, acceptedQty + rejectedQty),
    inspectionSampleSize: inspections.length,
    evidence,
    method:
      "On-time rate uses completed purchase orders with both a promised date and a posted receipt. Quality rates use completed incoming GRN inspections. Missing evidence stays unknown; receipt quantities can span different units and must not be treated as a quality denominator.",
  };
}
