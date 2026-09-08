"use client";

import { ClipboardCheck, TrendingUp } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { Modal } from "@spine/ui/modal";
import type { NetworkSupplier } from "../api";

interface Performance { evidenceStatus: string; orders: number; completedOrders: number; deliverySampleSize: number; onTimeRate: number | null; rejectionRate: number | null; inspectionSampleSize: number; method: string; evidence: { poNo: string; expectedDate: string | null; lastReceiptDate: string | null; receivedQty: number; status: string }[] }
const date = (value: string | null): string => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "No evidence";

export function SupplierPerformance({ supplier, onClose }: { supplier: NetworkSupplier; onClose: () => void }): React.JSX.Element {
  const query = useQuery<Performance>(`/purchase/network/suppliers/${supplier.id}/performance`); const data = query.data;
  return <Modal title="Supplier performance" subtitle={supplier.name} onClose={onClose}>{query.error ? <div className="x-notice" data-tone="error">{query.error instanceof Error ? query.error.message : "Unable to load supplier evidence."}</div> : !data ? <p className="x-empty-copy">Reading purchase and inspection evidence…</p> : <div className="space-y-5"><div className="grid grid-cols-2 gap-4"><div className="x-stat-card"><span className="x-stat-top">On-time delivery<TrendingUp className="h-4 w-4" aria-hidden /></span><strong className="x-stat-value">{data.onTimeRate === null ? "—" : `${data.onTimeRate}%`}</strong><p className="x-stat-hint">{data.deliverySampleSize} completed orders with dated receipts</p></div><div className="x-stat-card"><span className="x-stat-top">Rejection rate<ClipboardCheck className="h-4 w-4" aria-hidden /></span><strong className="x-stat-value">{data.rejectionRate === null ? "—" : `${data.rejectionRate}%`}</strong><p className="x-stat-hint">{data.inspectionSampleSize} completed incoming inspections</p></div></div>{data.evidenceStatus === "unknown" ? <div className="x-notice">No posted receipts or completed incoming inspections are available yet. The supplier has no measured score.</div> : null}<p className="text-[11px] leading-6 text-[var(--text-muted)]">{data.method}</p>{data.evidence.length ? <div className="overflow-x-auto"><table className="x-data-table"><thead><tr><th>Purchase order</th><th>Expected</th><th>Last receipt</th><th>Status</th></tr></thead><tbody>{data.evidence.map((row) => <tr key={row.poNo}><td>{row.poNo}</td><td>{date(row.expectedDate)}</td><td>{date(row.lastReceiptDate)}</td><td>{row.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div> : <p className="x-empty-copy">No purchase-order history for this supplier.</p>}</div>}</Modal>;
}
