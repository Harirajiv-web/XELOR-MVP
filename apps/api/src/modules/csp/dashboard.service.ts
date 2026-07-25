import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import { overrideRate, type TriageOutcome, type TriageSuggestion } from "@ind-core/platform";
import { CsatService } from "./csat.service.js";

const { cspTicket, cspComplaint, cspTicketEvent } = schema;

/**
 * THE SERVICE MANAGER'S DASHBOARD.
 *
 * Four numbers, and one of them is about the software rather than the desk:
 *
 *  - **SLA compliance** counts tickets that MET both clocks against tickets with a verdict.
 *    Tickets that have not been triaged carry no policy and therefore no verdict, and they
 *    are excluded rather than counted as compliant — an untriaged backlog inflating a
 *    compliance percentage is exactly how the number stops meaning anything.
 *  - **Backlog age** is reported as a distribution, not an average. One ticket sitting for
 *    forty days and thirty fresh ones average out to something reassuring and false.
 *  - **Complaint Pareto** by failure symptom: what actually keeps breaking.
 *  - **AI override rate** — the honesty metric for AI #3. It is on the manager's dashboard
 *    rather than in an ops console on purpose: the person who sees the suggestions being
 *    corrected is the person who should see the number.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly csat: CsatService) {}

  async service(): Promise<Record<string, unknown>> {
    const csat = await this.csat.summary();
    return withTenant(async (tx) => {
      const tickets = await tx.select().from(cspTicket);
      const complaints = await tx.select().from(cspComplaint);
      const now = Date.now();

      const withVerdict = tickets.filter((t) => t.responseAllowanceMins != null);
      const met = withVerdict.filter((t) => t.slaState === "met").length;
      const breached = withVerdict.filter((t) => t.slaState.startsWith("breached")).length;

      const open = tickets.filter((t) => !["closed", "resolved"].includes(t.status));
      const ageBuckets = { "0-1d": 0, "1-3d": 0, "3-7d": 0, "7d+": 0 };
      for (const t of open) {
        const days = (now - t.createdAt.getTime()) / 86_400_000;
        if (days <= 1) ageBuckets["0-1d"] += 1;
        else if (days <= 3) ageBuckets["1-3d"] += 1;
        else if (days <= 7) ageBuckets["3-7d"] += 1;
        else ageBuckets["7d+"] += 1;
      }

      const byOwner = new Map<string, number>();
      for (const t of open) {
        const key = t.ownerEmployeeRef ?? "unassigned";
        byOwner.set(key, (byOwner.get(key) ?? 0) + 1);
      }

      const pareto = new Map<string, number>();
      for (const c of complaints) pareto.set(c.failureSymptom, (pareto.get(c.failureSymptom) ?? 0) + 1);

      return {
        tickets: {
          total: tickets.length,
          open: open.length,
          byStatus: countBy(tickets.map((t) => t.status)),
          bySlaState: countBy(tickets.map((t) => t.slaState)),
        },
        sla: {
          withVerdict: withVerdict.length,
          met,
          breached,
          compliancePct: withVerdict.length === 0 ? null : Math.round((met / withVerdict.length) * 1000) / 10,
          note: "Untriaged tickets carry no policy and are excluded — counting them as compliant would flatter the number.",
        },
        backlogAge: ageBuckets,
        agentLoad: Object.fromEntries(byOwner),
        complaintPareto: [...pareto.entries()].sort((a, b) => b[1] - a[1]).map(([symptom, count]) => ({ symptom, count })),
        csat,
        ai: await this.triageOverrideRate(tx),
      };
    });
  }

  /**
   * The override rate, computed from the timeline rather than from a counter.
   *
   * `evalOverrideRatePct` is the rate the feature passed its gate at; drifting more than
   * ten points worse than that raises `driftAlert`, which is the signal to re-run the
   * golden set before a customer notices the classifier has gone stale.
   */
  private async triageOverrideRate(tx: Tx, evalOverrideRatePct = 0): Promise<Record<string, unknown>> {
    const events = await tx.select().from(cspTicketEvent).where(eq(cspTicketEvent.eventType, "ai.triage_outcome"));
    const outcomes: TriageOutcome[] = events.map((e) => {
      const d = (e.detail ?? {}) as { action?: string; overriddenFields?: string[] };
      return {
        ticketId: e.ticketId,
        suggestion: {} as TriageSuggestion,
        action: (d.action ?? "accepted") as TriageOutcome["action"],
        overriddenFields: (d.overriddenFields ?? []) as TriageOutcome["overriddenFields"],
      };
    });
    const report = overrideRate(outcomes, evalOverrideRatePct);
    return { feature: "csp.ticket_triage", ...report, evalOverrideRatePct };
  }
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
