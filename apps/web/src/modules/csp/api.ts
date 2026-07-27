/**
 * Service's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * Every CSP list endpoint answers with a BARE ARRAY, not a paged envelope: the queue, the
 * spare requests and the dashboards are all unpaged today. That is fine at demo size and a
 * gap at plant size, and it is why nothing here uses `useCursorList`.
 */

/** The SLA verdict as the engine derived it — never as a screen recomputed it. */
export interface TicketSla {
  /** on_track | at_risk | paused | met | breached_response | breached_resolution. */
  state: string;
  /** The engine's own words for the state, plus its colour band. */
  chip: { label: string; tone: string };
  firstResponseDue: string | null;
  resolutionDue: string | null;
  consumedMins: number;
  reason: string;
  promise: string | null;
  policyName: string | null;
}

export interface TicketView {
  ticketNo: string;
  status: string;
  customerAccountId: string;
  subject: string;
  description: string;
  priority: string;
  categoryCode: string | null;
  channel: string;
  productSerialNo: string | null;
  sla: TicketSla;
  owner: string | null;
  teamId: string | null;
  assignedVersion: number;
  entitlement: { verdict: string | null; checkedAt: string | null };
  aiTriage: Record<string, unknown> | null;
  complaintNo: string | null;
  reopenCount: number;
  createdAt: string;
}

export interface TicketComment {
  body: string;
  /** public reaches the customer; internal never leaves the building. */
  visibility: string;
  authorType: string;
  sentAt: string | null;
  createdAt: string;
}

export interface TicketTimelineEvent {
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  actorType: string;
  occurredAt: string;
}

export interface TicketDetail extends TicketView {
  comments: TicketComment[];
  timeline: TicketTimelineEvent[];
}

export interface SpareRequestRow {
  requestNo: string;
  ticketNo: string | null;
  itemCode: string;
  qty: number;
  uom: string | null;
  /** covered_amc | covered_warranty | partial | not_covered — the entitlement engine's. */
  coverage: string;
  unitPrice: number | null;
  lineAmount: number | null;
  status: string;
  reservationRef: string | null;
}

export interface CsatSummary {
  sent: number;
  responded: number;
  responseRatePct: number;
  averageCsat: number | null;
  distribution: Record<string, number>;
  openFollowUps: number;
  negativeVerbatims: number;
}

export interface ServiceDashboard {
  tickets: {
    total: number;
    open: number;
    byStatus: Record<string, number>;
    bySlaState: Record<string, number>;
  };
  sla: {
    withVerdict: number;
    met: number;
    breached: number;
    /** null when nothing has a policy yet — not zero, which would read as "all breached". */
    compliancePct: number | null;
    note: string;
  };
  backlogAge: Record<string, number>;
  agentLoad: Record<string, number>;
  complaintPareto: Array<{ symptom: string; count: number }>;
  csat: CsatSummary;
  ai: {
    feature: string;
    suggestions: number;
    accepted: number;
    edited: number;
    dismissed: number;
    overrideRatePct: number;
    byField: { category: number; priority: number };
    driftAlert: boolean;
    evalOverrideRatePct: number;
  };
}

export const cspApi = {
  ticketsPath: "/csp/tickets",
  ticketPath: (ticketNo: string): string => `/csp/tickets/${ticketNo}`,
  ticketSlaPath: (ticketNo: string): string => `/csp/tickets/${ticketNo}/sla`,
  spareRequestsPath: "/csp/spare-requests",
  serviceDashboardPath: "/csp/dashboards/service",
  csatReportPath: "/csp/reports/csat",
} as const;
