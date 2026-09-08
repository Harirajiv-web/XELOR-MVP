import { Injectable } from "@nestjs/common";
import type {
  AgentDefinition,
  AgentGraphNodeDefinition,
} from "@ind-core/platform";

export interface AgentReasoningRequest {
  agent: AgentDefinition;
  node: AgentGraphNodeDefinition;
  goal: string;
  missionInput: Readonly<Record<string, unknown>>;
  dependencies: Readonly<Record<string, unknown>>;
}

export interface AgentReasoningResult {
  providerMode: "deterministic";
  summary: string;
  findings: readonly string[];
  evidence: readonly {
    nodeId: string;
    kind: string;
    recordCount: number | null;
  }[];
  confidence: number;
}

/**
 * Offline provider used until a model is configured. It does not fake free-form reasoning:
 * it produces deterministic, structured summaries from actual node outputs, keeping the
 * orchestration and evidence path fully live and reproducible for the investor demo.
 */
@Injectable()
export class DeterministicAgentReasoner {
  readonly mode = "deterministic" as const;

  async complete(
    request: AgentReasoningRequest,
  ): Promise<AgentReasoningResult> {
    const evidence = Object.entries(request.dependencies).map(
      ([nodeId, value]) => ({
        nodeId,
        kind: Array.isArray(value) ? "array" : typeof value,
        recordCount: recordCount(value),
      }),
    );
    const recordTotal = evidence.reduce(
      (sum, item) => sum + (item.recordCount ?? 0),
      0,
    );
    const findings = [
      `${request.agent.key} processed ${evidence.length} upstream evidence source(s).`,
      recordTotal > 0
        ? `${recordTotal} tenant-scoped record(s) were available for this bounded step.`
        : "The step produced a structured result without copying business records into memory.",
    ];
    if (request.node.kind === "verification") {
      findings.push(
        `HEXA completed ${request.node.checks.length} declared verification check(s).`,
      );
    }
    return {
      providerMode: "deterministic",
      summary: `${request.agent.name}: ${request.goal}`,
      findings,
      evidence,
      confidence: 1,
    };
  }
}

function recordCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items.length;
  if (Array.isArray(record.data)) return record.data.length;
  return null;
}
