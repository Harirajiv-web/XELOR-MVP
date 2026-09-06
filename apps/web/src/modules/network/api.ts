/**
 * The supplier network's own slice of the API. Nothing outside this folder imports it, and it
 * imports nothing from another module — which is what makes the folder deletable.
 */

export interface NetworkSupplier {
  id: string;
  supplierCode: string;
  name: string;
  categories: string[];
  city: string | null;
  contactName: string | null;
  whatsappE164: string | null;
  email: string | null;
  vendorId: string | null;
  status: string;
}

export interface OutboxMessage {
  id: string;
  channel: "whatsapp" | "email";
  recipient: string;
  recipientName: string | null;
  template: string;
  subject: string | null;
  /** The card, exactly as it was rendered. WhatsApp's *bold* markers included. */
  body: string;
  linkUrl: string | null;
  provider: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
}

export interface BroadcastRow {
  id: string;
  rfqId: string;
  rfqNo: string;
  supplierCount: number;
  opened: number;
  quoted: number;
  status: string;
  publishedAt: string;
  card: Record<string, unknown>;
}

export interface Submission {
  id: string;
  supplierId: string;
  supplierName: string | null;
  supplierIsVendor: boolean;
  unitPrice: string;
  toolingCost: string;
  freightCost: string;
  landedCost: string;
  promisedDate: string | null;
  leadTimeDays: number | null;
  supplierNote: string | null;
  status: string;
  sourcingQuoteId: string | null;
  receivedAt: string;
}

export interface RankedQuote {
  submissionId: string;
  supplierId: string;
  supplierName: string;
  landedCost: string;
  promisedDate: string | null;
  leadTimeDays: number | null;
  meetsNeedDate: boolean | null;
  costScore: number;
  speedScore: number;
  score: number;
  rank: number;
  explanation: string;
  disqualified: string | null;
}

export const networkApi = {
  suppliersPath: "/purchase/network/suppliers",
  broadcastsPath: "/purchase/network/broadcasts",
  outboxPath: "/purchase/network/outbox",
  broadcastRfqPath: (id: string): string => `/purchase/network/rfqs/${id}/broadcast`,
  submissionsPath: (id: string): string => `/purchase/network/rfqs/${id}/submissions`,
  rankingPath: (id: string): string => `/purchase/network/rfqs/${id}/ranking`,
  acceptPath: (id: string): string => `/purchase/network/submissions/${id}/accept`,
} as const;

/**
 * WhatsApp's entire formatting vocabulary is *bold*, and line breaks. Rendering it faithfully
 * matters more than rendering it prettily: this preview exists so somebody can check what a
 * supplier will actually read, and a preview that improves on the original is not a preview.
 */
export function whatsappToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s]+)/g, '<span class="wa-link">$1</span>')
    .replace(/\n/g, "<br/>");
}

/** "10:42" — WhatsApp shows no date on a message from today, and neither does this. */
export function clockOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}
