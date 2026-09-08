export interface TenderQuote { id: string; vendorName: string | null; unitPrice: string; landedCost: string; technicalGate: string; status: string; promisedDate: string | null; validUntil: string | null; moq: string | null; meetsNeedDate: boolean | null }
export interface TenderLine { lineNo: number; rfqId: string; rfq: { rfqNo: string; itemCode: string | null; itemName: string | null; qty: string; uom: string; status: string; quotes: TenderQuote[]; invitations: { vendorId: string; vendorName: string | null; responseStatus: string }[]; award: { convertedPoId: string | null; convertedPoNo: string | null; vendorName: string | null; landedCost: string } | null } }
export interface TenderSummary { id: string; tenderNo: string; title: string; status: string; quoteDeadline: string; needDate: string; lineCount: number; awardedCount: number; createdAt: string }
export interface Tender extends TenderSummary { deliveryPlant: string; notes: string | null; lines: TenderLine[] }
export const tenderPath = "/purchase/network/tenders";
export function tenderError(error: unknown): string { return error instanceof Error ? error.message : "The tender request could not be completed."; }
export function money(value: string | number): string { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value)); }
export function tenderDate(value: string): string { return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
export function eligibleQuote(quote: TenderQuote, quantity: number): boolean {
  return quote.status === "submitted" && ["pass", "conditional"].includes(quote.technicalGate) && quote.meetsNeedDate === true && (!quote.validUntil || quote.validUntil >= new Date().toISOString().slice(0, 10)) && (!quote.moq || Number(quote.moq) <= quantity);
}
