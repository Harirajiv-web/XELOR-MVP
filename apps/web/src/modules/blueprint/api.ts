"use client";

import { api } from "@spine/api/client";

/**
 * The blueprint screens read the SAME endpoints the real modules read. Nothing here is a
 * private query invented for a prototype tile — if a number appears on these screens marked
 * live, this is where it came from and the viewer can open the owning module and find it.
 */

interface Paged<T> {
  items?: readonly T[];
}

interface ReadResult<T> {
  items: readonly T[];
  available: boolean;
}

export interface SalesOrderRow {
  soNo: string;
  customerName: string | null;
  requestedDeliveryDate: string | null;
  grandTotal: string;
  status: string;
}

export interface PurchaseOrderRow {
  poNo: string;
  vendorName?: string;
  status: string;
}

export interface InspectionRow {
  inspNo?: string;
  result?: string | null;
  status?: string;
}

export interface LiveWorld {
  salesOrders: readonly SalesOrderRow[];
  purchaseOrders: readonly PurchaseOrderRow[];
  inspections: readonly InspectionRow[];
  available: {
    salesOrders: boolean;
    purchaseOrders: boolean;
    inspections: boolean;
  };
  readAt: string;
}

/**
 * One fetch per stage of the loop, in parallel. A stage that fails comes back EMPTY rather
 * than throwing: a prototype that cannot open because one endpoint is slow is worse than a
 * prototype that says "could not read" on one tile, and the screens are built to say it.
 */
export async function readLiveWorld(): Promise<LiveWorld> {
  const settle = async <T>(path: string): Promise<ReadResult<T>> => {
    try {
      const res = await api.get<Paged<T>>(path, { query: { limit: 100 } });
      return { items: res.items ?? [], available: true };
    } catch {
      return { items: [], available: false };
    }
  };

  const [salesOrders, purchaseOrders, inspections] = await Promise.all([
    settle<SalesOrderRow>("/sales/orders"),
    settle<PurchaseOrderRow>("/purchase/orders"),
    settle<InspectionRow>("/quality/inspections"),
  ]);

  return {
    salesOrders: salesOrders.items,
    purchaseOrders: purchaseOrders.items,
    inspections: inspections.items,
    available: {
      salesOrders: salesOrders.available,
      purchaseOrders: purchaseOrders.available,
      inspections: inspections.available,
    },
    readAt: new Date().toISOString(),
  };
}
