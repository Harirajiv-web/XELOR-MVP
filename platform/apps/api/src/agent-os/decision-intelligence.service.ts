import { Injectable } from "@nestjs/common";
import { assessDecisionConfidence, type DecisionConfidence } from "@ind-core/platform";
import {
  SalesService,
  type SalesOrderSummary,
  type SalesOrderView,
} from "../modules/sales/sales.service.js";
import { PlanExceptionService } from "../modules/planning/exception.service.js";
import { PurchaseService, type PoSummary } from "../modules/purchase/purchase.service.js";
import { QualityService, type InspectionView } from "../modules/quality/quality.service.js";
import { DowntimeService, type DowntimeListRow } from "../modules/maintenance/downtime.service.js";
import {
  DecisionIntelligenceRepository,
  type EvidenceLinkInput,
  type OutcomeInput,
} from "./decision-intelligence.repository.js";

export type RiskSeverity = "critical" | "high" | "medium" | "low";
export type RiskKind = "delivery" | "supply" | "planning" | "quality" | "maintenance";

export interface CommanderEvidence {
  domain: string;
  entityType: string;
  entityId: string;
  reference: string;
  label: string;
  detail: string;
  observedAt: string;
}

export interface RecoveryOption {
  id: string;
  title: string;
  plainSummary: string;
  actionType: string;
  approvalRequired: boolean;
  reversible: boolean;
  cost: { amount: number | null; currency: "INR"; basis: string };
}

export interface CommanderRisk {
  key: string;
  kind: RiskKind;
  severity: RiskSeverity;
  title: string;
  plainSummary: string;
  ownerAgent: "MICA" | "SPAR" | "AXLE" | "KILN";
  status: "needs_decision";
  commitmentDate: string | null;
  daysToCommitment: number | null;
  exposure: { amount: number | null; currency: "INR"; basis: string };
  causes: string[];
  recoveryOptions: RecoveryOption[];
  evidence: CommanderEvidence[];
  confidence: DecisionConfidence;
}

type UnscoredCommanderRisk = Omit<CommanderRisk, "confidence">;

@Injectable()
export class DecisionIntelligenceService {
  constructor(
    private readonly sales: SalesService,
    private readonly planning: PlanExceptionService,
    private readonly purchase: PurchaseService,
    private readonly quality: QualityService,
    private readonly downtime: DowntimeService,
    private readonly repository: DecisionIntelligenceRepository,
  ) {}

  async commander() {
    const [orderPage, exceptions, poPage, inspectionPage, downtimeRows, value] =
      await Promise.all([
        this.sales.listOrders(100),
        this.planning.list({ status: "open" }),
        this.purchase.listPos(100),
        this.quality.listInspections(100),
        this.downtime.list({ openOnly: true }),
        this.repository.valueSummary(),
      ]);

    const now = new Date();
    // A delivery card must be able to name quality evidence for the exact item on the
    // order. The list endpoint intentionally omits lines, so enrich the small active-order
    // set once here rather than either guessing from names or making the browser join
    // records across module boundaries.
    const orderDetails = await Promise.all(
      orderPage.items
        .filter((order) => ["confirmed", "partially_dispatched", "credit_hold"].includes(order.status))
        .map((order) => this.sales.getOrder(order.id)),
    );
    const unscoredRisks = [
      ...this.deliveryRisks(orderPage.items, orderDetails, exceptions, inspectionPage.items, now),
      ...this.unlinkedPlanningRisks(exceptions),
      ...this.supplyRisks(poPage.items, now),
      ...this.qualityRisks(inspectionPage.items),
      ...this.maintenanceRisks(downtimeRows, now),
    ]
      .sort(compareRisks)
      .slice(0, 40);

    const [history, persistentGraph, memory] = await Promise.all([
      this.repository.decisionHistory(unscoredRisks.map((risk) => risk.key)),
      this.repository.knowledgeGraph(),
      this.repository.organizationalMemory(6),
    ]);
    const risks: CommanderRisk[] = unscoredRisks.map((risk) => {
      const previous = history[risk.key];
      return {
        ...risk,
        confidence: assessDecisionConfidence({
          evidence: risk.evidence,
          causeCount: risk.causes.length,
          recoveryOptionCount: risk.recoveryOptions.length,
          hasCommitmentDate: risk.commitmentDate !== null,
          hasDefensibleExposure: risk.exposure.amount !== null,
          previousDecisionCount: previous?.previousDecisionCount ?? 0,
          verifiedOutcomeCount: previous?.verifiedOutcomeCount ?? 0,
          now: now.toISOString(),
        }),
      };
    });

    const exposedValue = risks.reduce(
      (sum, risk) => sum + (risk.exposure.amount ?? 0),
      0,
    );
    const critical = risks.filter((risk) => risk.severity === "critical").length;
    const high = risks.filter((risk) => risk.severity === "high").length;
    return {
      asOf: now.toISOString(),
      method: "deterministic_current_data_analysis",
      disclosure:
        "This view applies explicit business rules to current ERP records. It is not a hidden prediction and does not execute changes.",
      headline:
        critical > 0
          ? `${critical} critical decision${critical === 1 ? "" : "s"} need attention now.`
          : high > 0
            ? `${high} important decision${high === 1 ? "" : "s"} need attention.`
            : risks.length > 0
              ? "No critical issue is visible; routine risks remain to review."
              : "No current cross-module risk needs a decision.",
      summary: {
        totalRisks: risks.length,
        critical,
        high,
        commitmentsAtRisk: risks.filter((risk) => risk.kind === "delivery").length,
        exposedValue,
        exposureBasis: "Gross business value connected to open risks; it is not predicted loss.",
        sourcesChecked: 5,
        averageConfidence: risks.length === 0
          ? 100
          : Math.round(risks.reduce((sum, risk) => sum + risk.confidence.score, 0) / risks.length),
      },
      confidence: {
        high: risks.filter((risk) => risk.confidence.band === "high").length,
        medium: risks.filter((risk) => risk.confidence.band === "medium").length,
        low: risks.filter((risk) => risk.confidence.band === "low").length,
        disclosure: "Confidence measures the quality of the available evidence, not the chance that an action will succeed.",
      },
      value,
      risks,
      graph: mergeGraphs(buildGraph(risks), persistentGraph),
      memory,
    };
  }

  async risk(key: string): Promise<CommanderRisk | null> {
    const view = await this.commander();
    return view.risks.find((risk) => risk.key === key) ?? null;
  }

  async persistRiskEvidence(risk: CommanderRisk, missionRunId?: string): Promise<void> {
    const primary = risk.evidence[0];
    if (!primary) return;
    const links: EvidenceLinkInput[] = risk.evidence.slice(1).map((item) => ({
      relationType: "contributes_to_risk",
      sourceDomain: item.domain,
      sourceType: item.entityType,
      sourceId: item.entityId,
      sourceRef: item.reference,
      targetDomain: primary.domain,
      targetType: primary.entityType,
      targetId: primary.entityId,
      targetRef: primary.reference,
      observedAt: item.observedAt,
      confidence: 1,
      evidence: { riskKey: risk.key, detail: item.detail },
    }));
    if (links.length === 0) {
      links.push({
        relationType: "defines_risk",
        sourceDomain: primary.domain,
        sourceType: primary.entityType,
        sourceId: primary.entityId,
        sourceRef: primary.reference,
        targetDomain: "agentos",
        targetType: "decision_risk",
        targetId: risk.key,
        targetRef: risk.title,
        observedAt: primary.observedAt,
        confidence: 1,
        evidence: { riskKey: risk.key, detail: primary.detail },
      });
    }
    await this.repository.upsertEvidence(risk.key, missionRunId, links);
  }

  recordOutcome(input: OutcomeInput) {
    return this.repository.recordOutcome(input);
  }

  outcomes(limit?: number) {
    return this.repository.listOutcomes(limit);
  }

  memory(limit?: number) {
    return this.repository.organizationalMemory(limit);
  }

  knowledgeGraph(limit?: number) {
    return this.repository.knowledgeGraph(limit);
  }

  private deliveryRisks(
    orders: readonly SalesOrderSummary[],
    orderDetails: readonly SalesOrderView[],
    exceptions: readonly Record<string, unknown>[],
    inspections: readonly InspectionView[],
    now: Date,
  ): UnscoredCommanderRisk[] {
    return orders.flatMap((order) => {
      if (!["confirmed", "partially_dispatched", "credit_hold"].includes(order.status)) return [];
      const days = order.requestedDeliveryDate
        ? daysFrom(now, order.requestedDeliveryDate)
        : null;
      const creditHeld = order.creditStatus === "held" || order.status === "credit_hold";
      const linked = exceptions.filter((item) =>
        [item.pegRef, item.ref, item.message]
          .filter(Boolean)
          .some((value) => String(value).includes(order.soNo)),
      );
      const detail = orderDetails.find((item) => item.id === order.id);
      const orderItemIds = new Set(detail?.lines.map((line) => line.itemId) ?? []);
      const linkedQuality = inspections.filter(
        (inspection) =>
          inspection.result === "rejected" &&
          inspection.itemRef !== null &&
          orderItemIds.has(inspection.itemRef),
      );
      // A partially dispatched order still has a live customer commitment. Keep it in the
      // decision room even outside the 14-day horizon: the first shipment is evidence of
      // progress, not evidence that the remaining promise has a feasible supply plan.
      const partiallyDispatched = order.status === "partially_dispatched";
      if (!creditHeld && !partiallyDispatched && (days === null || days > 14)) return [];
      const severity: RiskSeverity =
        linkedQuality.length > 0 || creditHeld || (days !== null && days < 0)
          ? "critical"
          : days !== null && days <= 3
            ? "critical"
            : days !== null && days <= 7
              ? "high"
              : "medium";
      const linkedCauses = [
        ...linked.map((item) => simple(String(item.message ?? item.suggestion))),
        ...linkedQuality.map((inspection) =>
          simple(
            `${inspection.inspectionNo} rejected ${containedQuantity(inspection)} ${inspection.itemCode ?? inspection.itemName ?? "units"} into controlled disposition. ${inspection.verdictRationale ?? "The recorded result is rejected."}`,
          ),
        ),
      ];
      const causes = linkedCauses.length > 0
        ? [...new Set(linkedCauses)].slice(0, 4)
        : [
            creditHeld
              ? "The order is blocked by a credit decision."
              : partiallyDispatched
                ? "The order has shipped only in part; the remaining commitment still needs a feasible plan."
                : "The promised date is close and needs confirmation.",
          ];
      const observedAt = now.toISOString();
      return [{
        key: `delivery:${order.id}`,
        kind: "delivery" as const,
        severity,
        title: `${order.soNo} · ${order.customerName ?? "Customer delivery"}`,
        plainSummary:
          linkedQuality.length > 0
            ? `${containedQuantity(linkedQuality[0]!)} ${linkedQuality[0]!.itemCode ?? "units"} are held by a failed quality result while the customer commitment remains open.`
            : days === null
            ? "This order is blocked and needs a decision before work can continue."
            : days < 0
              ? `The open customer promise is ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late.`
              : `The next customer promise is due in ${days} day${days === 1 ? "" : "s"}.`,
        ownerAgent: "MICA" as const,
        status: "needs_decision" as const,
        commitmentDate: order.requestedDeliveryDate,
        daysToCommitment: days,
        exposure: {
          amount: Number(order.grandTotal),
          currency: "INR" as const,
          basis: "Gross order value exposed; this is not a forecast loss.",
        },
        causes,
        recoveryOptions: deliveryOptions(order.soNo),
        evidence: [
          evidence("sales", "sales_order", order.id, order.soNo, "Customer commitment", `Status ${order.status}; next promise ${order.requestedDeliveryDate ?? "not set"}.`, observedAt),
          ...linked.map((item) => evidence("planning", "plan_exception", String(item.id), String(item.ref), "Planning exception", simple(String(item.message)), observedAt)),
          ...linkedQuality.map((inspection) => evidence(
            "quality",
            "inspection",
            inspection.id,
            inspection.inspectionNo,
            "Rejected inspection on the ordered item",
            `${containedQuantity(inspection)} ${inspection.itemCode ?? "units"} remain under controlled disposition. ${inspection.verdictRationale ?? "Result rejected."}`,
            inspection.completedAt ?? observedAt,
          )),
        ],
      }];
    });
  }

  private unlinkedPlanningRisks(exceptions: readonly Record<string, unknown>[]): UnscoredCommanderRisk[] {
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const item of exceptions) {
      const severity = String(item.severity) as RiskSeverity;
      if (!["critical", "high"].includes(severity) || item.pegRef) continue;
      const id = String(item.id);
      const ref = String(item.ref ?? item.itemCode ?? id);
      const group = grouped.get(ref) ?? [];
      group.push(item);
      grouped.set(ref, group);
    }

    return [...grouped.entries()].map(([ref, items]) => {
      const first = items[0]!;
      const severity = items.some((item) => String(item.severity) === "critical")
        ? "critical" as const
        : "high" as const;
      const causes = [...new Set(items.map((item) => simple(String(item.message ?? "Plan exception"))))];
      const commitmentDates = items
        .map((item) => item.currentBucket)
        .filter((value): value is string => typeof value === "string")
        .sort();
      return {
        key: `planning:${String(first.id)}`,
        kind: "planning" as const,
        severity,
        title: `${ref} · Plan needs attention`,
        plainSummary:
          items.length === 1
            ? causes[0]!
            : `${items.length} related planning exceptions affect the same requirement. ${causes[0]}`,
        ownerAgent: "AXLE" as const,
        status: "needs_decision" as const,
        commitmentDate: commitmentDates[0] ?? null,
        daysToCommitment: null,
        exposure: { amount: null, currency: "INR" as const, basis: "No defensible monetary exposure is available for this record." },
        causes: causes.slice(0, 4),
        recoveryOptions: planningOptions(ref),
        evidence: items.map((item) => evidence(
          "planning",
          "plan_exception",
          String(item.id),
          String(item.ref ?? ref),
          "Open plan exception",
          simple(String(item.message ?? item.suggestion)),
          dateString(item.updatedAt ?? item.createdAt),
        )),
      };
    });
  }

  private supplyRisks(orders: readonly PoSummary[], now: Date): UnscoredCommanderRisk[] {
    return orders.flatMap((order) => {
      if (["received", "cancelled", "closed"].includes(order.status) || !order.expectedDate) return [];
      const days = daysFrom(now, order.expectedDate);
      if (days > 7) return [];
      const severity: RiskSeverity = days < 0 ? "critical" : days <= 3 ? "high" : "medium";
      const observedAt = now.toISOString();
      return [{
        key: `supply:${order.id}`,
        kind: "supply" as const,
        severity,
        title: `${order.poNo} · ${order.vendorName}`,
        plainSummary: days < 0 ? `This supply promise is ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late.` : `The supply promise is due in ${days} day${days === 1 ? "" : "s"}.`,
        ownerAgent: "SPAR" as const,
        status: "needs_decision" as const,
        commitmentDate: order.expectedDate,
        daysToCommitment: days,
        exposure: { amount: Number(order.totalAmount), currency: "INR" as const, basis: "Open purchase value; it is not customer revenue or predicted loss." },
        causes: ["The recorded supplier date is near or has passed without receipt."],
        recoveryOptions: supplyOptions(order.poNo),
        evidence: [evidence("purchase", "purchase_order", order.id, order.poNo, "Supplier commitment", `Status ${order.status}; expected ${order.expectedDate}.`, observedAt)],
      }];
    });
  }

  private qualityRisks(inspections: readonly InspectionView[]): UnscoredCommanderRisk[] {
    return inspections.flatMap((inspection) => {
      if (inspection.result !== "rejected") return [];
      const observedAt = inspection.completedAt ?? new Date().toISOString();
      return [{
        key: `quality:${inspection.id}`,
        kind: "quality" as const,
        severity: inspection.inspectionType === "final" || inspection.inspectionType === "pre_dispatch" ? "critical" as const : "high" as const,
        title: `${inspection.inspectionNo} · Quality hold`,
        plainSummary: `${inspection.itemCode ?? inspection.itemName ?? "Material"} failed inspection and must stay out of usable supply until a person decides its disposition.`,
        ownerAgent: "KILN" as const,
        status: "needs_decision" as const,
        commitmentDate: null,
        daysToCommitment: null,
        exposure: { amount: null, currency: "INR" as const, basis: "A monetary impact is not inferred from inspection quantity alone." },
        causes: [inspection.verdictRationale ?? "The recorded inspection result is rejected."],
        recoveryOptions: qualityOptions(inspection.inspectionNo),
        evidence: [evidence("quality", "inspection", inspection.id, inspection.inspectionNo, "Rejected inspection", inspection.verdictRationale ?? `Result ${inspection.result}.`, observedAt)],
      }];
    });
  }

  private maintenanceRisks(rows: readonly DowntimeListRow[], now: Date): UnscoredCommanderRisk[] {
    return rows.flatMap((row) => {
      // A completed historical outage is useful context on the maintenance screen, but it
      // is not a machine that is "production stopped" now. Keep the live decision room
      // literal even if an upstream caller accidentally returns closed intervals.
      if (!row.productionImpacting || row.endedAt !== null) return [];
      const hours = Math.max(0, (now.getTime() - new Date(row.startedAt).getTime()) / 3_600_000);
      const observedAt = now.toISOString();
      return [{
        key: `maintenance:${row.id}`,
        kind: "maintenance" as const,
        severity: hours >= 4 ? "critical" as const : "high" as const,
        title: `${row.assetCode} · Production stopped`,
        plainSummary: `${row.assetName} has been unavailable for ${hours.toFixed(1)} hours and is affecting production.`,
        ownerAgent: "AXLE" as const,
        status: "needs_decision" as const,
        commitmentDate: null,
        daysToCommitment: null,
        exposure: { amount: null, currency: "INR" as const, basis: "No hourly loss rate is configured, so monetary exposure is intentionally not shown." },
        causes: [row.reasonCode ? `Recorded reason: ${simple(row.reasonCode)}.` : "The cause has not yet been recorded."],
        recoveryOptions: maintenanceOptions(row.assetCode),
        evidence: [evidence("maintenance", "asset_downtime", row.id, row.assetCode, "Open production downtime", `Started ${row.startedAt}; reason ${row.reasonCode ?? "not recorded"}.`, observedAt)],
      }];
    });
  }
}

function evidence(domain: string, entityType: string, entityId: string, reference: string, label: string, detail: string, observedAt: string): CommanderEvidence {
  return { domain, entityType, entityId, reference, label, detail, observedAt };
}

function option(id: string, title: string, plainSummary: string, actionType: string, reversible: boolean, costBasis: string): RecoveryOption {
  return { id, title, plainSummary, actionType, approvalRequired: true, reversible, cost: { amount: null, currency: "INR", basis: costBasis } };
}

function deliveryOptions(ref: string): RecoveryOption[] {
  return [
    option("confirm-feasible-date", "Confirm a feasible date", `Recalculate ${ref} from usable supply and available capacity before making a new promise.`, "recalculate_commitment", true, "Calculated after evidence review; no cost is invented."),
    option("prepare-partial-delivery", "Prepare a partial delivery", "Show what can ship safely now and what remains, then ask the authorised owner to approve the split.", "prepare_partial_delivery", true, "Freight and margin impact require a calculated proposal."),
    option("escalate-customer-plan", "Prepare a customer recovery plan", "Draft one honest update from verified facts for a person to review and send.", "prepare_customer_update", true, "Drafting does not send or change the order."),
  ];
}

function supplyOptions(ref: string): RecoveryOption[] {
  return [option("confirm-supplier", "Request a confirmed supplier date", `Prepare a confirmation task for ${ref} and attach the response to the risk.`, "request_supplier_confirmation", true, "No cost until a supplier response is recorded."), option("compare-alternate", "Compare approved alternatives", "Check approved sources and substitutes, including price, quality, lead time and required authority.", "compare_alternate_supply", true, "Alternative cost must come from a quoted source." )];
}

function planningOptions(ref: string): RecoveryOption[] {
  return [option("review-plan", "Review the suggested plan", `Put ${ref}, its demand, supply and suggested date in one approval-ready work item.`, "review_plan_exception", true, "No monetary value is claimed without connected demand."), option("snooze-with-date", "Snooze with a return date", "Hide it only until a named date; it automatically returns to the worklist.", "snooze_plan_exception", true, "No direct cost." )];
}

function qualityOptions(ref: string): RecoveryOption[] {
  return [option("contain", "Confirm containment", `Locate and keep material linked to ${ref} out of usable supply.`, "confirm_quality_containment", true, "Containment value is not guessed."), option("prepare-disposition", "Prepare a disposition decision", "Compare release, rework, return and scrap using the recorded inspection evidence.", "prepare_quality_disposition", true, "Disposition cost is calculated before approval." )];
}

function maintenanceOptions(ref: string): RecoveryOption[] {
  return [option("repair-plan", "Prepare the repair plan", `Confirm safety, owner, spares and expected restoration for ${ref}.`, "prepare_repair_plan", true, "Repair cost needs a work estimate."), option("alternate-capacity", "Check alternate capacity", "Show feasible work-centre or schedule alternatives without changing the live plan.", "compare_alternate_capacity", true, "Schedule impact is calculated before approval." )];
}

function buildGraph(risks: readonly CommanderRisk[]) {
  const nodes = new Map<string, { id: string; kind: string; label: string; domain: string }>();
  const edges: Array<{ id: string; source: string; target: string; relation: string }> = [];
  for (const risk of risks) {
    const riskId = `risk:${risk.key}`;
    nodes.set(riskId, { id: riskId, kind: "risk", label: risk.title, domain: "agentos" });
    for (const item of risk.evidence) {
      const evidenceId = `${item.domain}:${item.entityType}:${item.entityId}`;
      nodes.set(evidenceId, { id: evidenceId, kind: "evidence", label: item.reference, domain: item.domain });
      edges.push({ id: `${evidenceId}->${riskId}`, source: evidenceId, target: riskId, relation: "supports" });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

function mergeGraphs(
  current: ReturnType<typeof buildGraph>,
  remembered: Awaited<ReturnType<DecisionIntelligenceRepository["knowledgeGraph"]>>,
) {
  const nodes = new Map(current.nodes.map((node) => [node.id, node]));
  const edges = new Map(current.edges.map((edge) => [edge.id, edge]));
  for (const node of remembered.nodes) {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  }
  for (const edge of remembered.edges) {
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  }
  const currentDomains = new Set(
    current.nodes.map((node) => node.domain).filter((domain) => domain !== "agentos"),
  );
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    summary: {
      currentDecisions: current.nodes.filter((node) => node.kind === "risk").length,
      rememberedDecisions: remembered.summary.rememberedDecisions,
      relationships: edges.size,
      businessAreas: new Set([
        ...currentDomains,
        ...remembered.nodes.map((node) => node.domain).filter((domain) => domain !== "agentos"),
      ]).size,
    },
    disclosure: "Current facts and persisted evidence links are joined by stable source references; source modules remain the owners of their records.",
  };
}

function daysFrom(now: Date, iso: string): number {
  const target = new Date(iso.length === 10 ? `${iso}T23:59:59.999Z` : iso);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function severityRank(severity: RiskSeverity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}

function compareRisks(a: UnscoredCommanderRisk, b: UnscoredCommanderRisk): number {
  return severityRank(a.severity) - severityRank(b.severity) ||
    b.evidence.length - a.evidence.length ||
    (b.exposure.amount ?? -1) - (a.exposure.amount ?? -1) ||
    (a.commitmentDate ?? "9999").localeCompare(b.commitmentDate ?? "9999") ||
    a.title.localeCompare(b.title);
}

function containedQuantity(inspection: InspectionView): number {
  const quarantined = inspection.dispositions
    .filter((item) => ["quarantine", "rework", "scrap", "return_to_supplier"].includes(item.dispositionType))
    .reduce((sum, item) => sum + Number(item.qty), 0);
  return quarantined > 0 ? quarantined : Number(inspection.qtyRejected ?? 0);
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function simple(value: string): string {
  const cleaned = value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "The source record needs review.";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
