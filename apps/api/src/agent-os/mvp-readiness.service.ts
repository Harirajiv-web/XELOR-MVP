import { Injectable } from "@nestjs/common";
import { AttachmentService } from "../modules/expenditure/attachment.service.js";
import { AiOperationsService } from "../modules/aiops/operations.service.js";
import { AiRegistryService } from "../modules/aiops/registry.service.js";
import { PipelineService } from "../modules/integration/pipeline.service.js";
import { DecisionIntelligenceRepository } from "./decision-intelligence.repository.js";

@Injectable()
export class MvpReadinessService {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly attachments: AttachmentService,
    private readonly aiRegistry: AiRegistryService,
    private readonly aiOperations: AiOperationsService,
    private readonly decisions: DecisionIntelligenceRepository,
  ) {}

  async snapshot() {
    const [connectors, connections, flows, documentAcceptance, aiFeatures, incidents, operations] =
      await Promise.all([
        this.pipeline.connectors(),
        this.pipeline.connections(),
        this.pipeline.flows(),
        this.attachments.acceptance(),
        this.aiRegistry.registry(),
        this.aiOperations.incidents(),
        this.decisions.operationalSnapshot(),
      ]);
    const connectionRows = connections.map(record);
    const flowRows = flows.map(record);
    const featureRows = aiFeatures.map(record);
    const incidentRows = incidents.map(record);
    const documents = record(documentAcceptance);
    const healthyConnections = connectionRows.filter((row) => row.healthStatus === "healthy").length;
    const simulatedConnections = connectionRows.filter((row) => row.adapterMode === "fake").length;
    const activeFlows = flowRows.filter((row) => row.status === "active").length;
    const openIncidents = incidentRows.filter((row) => row.status === "open").length;

    return {
      checkedAt: new Date().toISOString(),
      integrations: {
        status: connectionRows.length === 0
          ? "not_configured"
          : healthyConnections === connectionRows.length
            ? "ready"
            : "attention",
        connectors: connectors.length,
        connections: connectionRows.length,
        healthyConnections,
        simulatedConnections,
        liveConnections: connectionRows.length - simulatedConnections,
        activeFlows,
        totalFlows: flowRows.length,
        disclosure:
          simulatedConnections > 0
            ? "Simulated adapters exercise mapping, retry and outage handling without sending data outside the demo."
            : "Configured connections use the registered integration pipeline and circuit breaker.",
      },
      documents: {
        status: Number(documents.drafts ?? 0) > 0 ? "measured" : "ready_to_trial",
        drafts: number(documents.drafts),
        confirmed: number(documents.confirmed),
        acceptanceRatePct: number(documents.acceptanceRatePct),
        fieldEditRatePct: number(documents.fieldEditRatePct),
        fallbackRatePct: number(documents.fallbackRatePct),
        humanConfirmationRequired: true,
        disclosure: "AI may prepare receipt fields; deterministic checks and a person decide what becomes a business record.",
      },
      aiGovernance: {
        registeredFeatures: featureRows.length,
        enabledFeatures: featureRows.filter((row) => !["off", "rolled_back"].includes(String(row.rolloutStage))).length,
        openIncidents,
        status: openIncidents === 0 ? "healthy" : "attention",
      },
      operations,
      upgrades: [
        { key: "api_integration", label: "API & Integration Platform", status: "live_mvp", proof: `${connectors.length} connector type${connectors.length === 1 ? "" : "s"} and ${flowRows.length} governed flow${flowRows.length === 1 ? "" : "s"}.` },
        { key: "decision_confidence", label: "Decision Confidence Engine", status: "live_mvp", proof: "Every risk is scored from visible evidence, freshness, completeness and verified history." },
        { key: "knowledge_graph", label: "Enterprise Knowledge Graph", status: "live_mvp", proof: "Cross-domain evidence relationships persist with tenant fencing and provenance." },
        { key: "document_intelligence", label: "Document Intelligence Platform", status: "live_mvp", proof: "Receipt extraction, confidence, duplicate flags, deterministic validation and human confirmation are connected." },
        { key: "command_center", label: "Unified Command Center", status: "live_mvp", proof: "Risks, evidence, confidence, memory, platform readiness and governed recovery share one view." },
        { key: "organizational_memory", label: "Organizational Memory", status: "live_mvp", proof: "Missions, approvals, actions, evidence and verified outcomes are recalled together." },
        { key: "enterprise_observability", label: "Enterprise Observability", status: "mvp_operations", proof: "Database, agent runtime, approvals, event backlog and AI incidents are measured; distributed tracing remains production work." },
      ],
    };
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
