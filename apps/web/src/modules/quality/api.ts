/**
 * Quality's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * The list route is cursor-paged under the platform's `{items, nextCursor}` envelope, read
 * directly by `useCursorList`.
 */

/**
 * One measured or judged sample, with the specification it was judged against.
 *
 * `withinSpec` is the server's verdict, computed against `appliedUsl` / `appliedLsl` at the
 * moment of measurement and snapshotted onto the row. The screen never re-judges a reading
 * and never re-reads the limits from the characteristic master — a revised drawing must not
 * flip a past result, and showing today's limits beside yesterday's reading would do exactly
 * that while looking correct.
 */
export interface InspectionReading {
  characteristicId: string;
  characteristicCode: string | null;
  characteristicName: string | null;
  characteristicUom: string | null;
  sampleNo: number;
  /** Set on a variable (measured) characteristic; null on an attribute go/no-go. */
  value: string | null;
  /** Set on an attribute characteristic; null on a measured one. */
  conforming: boolean | null;
  appliedUsl: string | null;
  appliedLsl: string | null;
  /** critical | major | minor. A critical defect rejects the lot whatever the accept number. */
  appliedDefectClass: string | null;
  withinSpec: boolean;
  /** How far outside the applied limit the reading fell. "0.000000" when inside. */
  deviation: string;
}

/** What was actually done with the material once it failed. */
export interface Disposition {
  dispositionNo: string;
  /** accept | quarantine | rework | scrap | return_to_supplier. */
  dispositionType: string;
  qty: string;
  reason: string;
  status: string;
  targetWarehouseRef: string | null;
  /** The stock entry Inventory posted. Absent means nothing physically moved. */
  inventoryMovementRef: string | null;
  decidedAt: string;
  decidedBy: string;
}

export interface InspectionRow {
  id: string;
  inspectionNo: string;
  /** incoming | in_process | final | pre_dispatch | first_article. */
  inspectionType: string;
  /** What opened it: `grn`, `manufacture`, `standalone`. */
  refType: string;
  refId: string | null;
  itemRef: string | null;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  lotQty: string | null;
  sampleSize: number | null;
  acceptNumber: number | null;
  rejectNumber: number | null;
  samplingRationale: string | null;
  verdictRationale: string | null;
  status: string;
  result: string;
  qtyAccepted: string | null;
  qtyRejected: string | null;
  completedAt: string | null;
  inspectorRef: string | null;
  readings: InspectionReading[];
  dispositions: Disposition[];
}

export const qualityApi = {
  inspectionsPath: "/quality/inspections",
  inspectionPath: (id: string): string => `/quality/inspections/${id}`,
} as const;

/** How a reading reads to a person: the measurement, or the go/no-go, or nothing recorded. */
export function readingText(r: InspectionReading): string {
  if (r.value !== null) return trimZeros(r.value);
  if (r.conforming !== null) return r.conforming ? "OK" : "NOT OK";
  return "—";
}

/**
 * The specification in the form a fitter reads it off a drawing: "18.00 +0.05 / −0.05" when
 * both limits are set, "max 0.80" or "min 12.00" when only one is, and a plain go/no-go
 * where the characteristic has no limits at all.
 */
export function specText(r: InspectionReading): string {
  const usl = r.appliedUsl === null ? null : trimZeros(r.appliedUsl);
  const lsl = r.appliedLsl === null ? null : trimZeros(r.appliedLsl);
  if (usl !== null && lsl !== null) return `${lsl} to ${usl}`;
  if (usl !== null) return `${usl} max`;
  if (lsl !== null) return `${lsl} min`;
  return "go / no-go";
}

/** Six stored decimals is instrument precision, not display precision. */
function trimZeros(v: string): string {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}
