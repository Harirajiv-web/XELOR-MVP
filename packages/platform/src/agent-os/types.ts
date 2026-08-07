/**
 * Agent OS contracts are deliberately provider-neutral. A graph is an auditable execution
 * plan, not a prompt: models may supply a node's structured output, but they cannot invent
 * capabilities, edges, permissions or side effects at runtime.
 */

export const AGENT_KEYS = [
  "ONYX",
  "HEXA",
  "MICA",
  "SPAR",
  "AXLE",
  "KILN",
  "RASP",
  "RELAY",
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export type CapabilityMode =
  "read" | "analyse" | "simulate" | "draft" | "execute";

export interface AgentDefinition {
  key: AgentKey;
  name: string;
  department: string;
  purpose: string;
  allowedCapabilityPrefixes: readonly string[];
  delegatesTo: readonly AgentKey[];
}

export const AGENT_REGISTRY: readonly AgentDefinition[] = [
  {
    key: "ONYX",
    name: "ONYX Supervisor",
    department: "Mission Control",
    purpose:
      "Accept goals, coordinate specialists and synthesize evidence-backed outcomes.",
    allowedCapabilityPrefixes: ["agent.", "workflow.", "general."],
    delegatesTo: ["HEXA", "MICA", "SPAR", "AXLE", "KILN", "RASP", "RELAY"],
  },
  {
    key: "HEXA",
    name: "HEXA Governance",
    department: "Platform and Governance",
    purpose:
      "Enforce policy, authorization, budgets, approvals and auditability.",
    allowedCapabilityPrefixes: [
      "agent.",
      "workflow.",
      "governance.",
      "general.",
    ],
    delegatesTo: [],
  },
  {
    key: "MICA",
    name: "MICA Sales & Product Care",
    department: "Sales and Manufactured-Product Care",
    purpose:
      "Analyse customers, quotations, orders, delivery commitments, product complaints, warranty and after-sales care. XELOR technology incidents belong to RELAY.",
    allowedCapabilityPrefixes: ["sales.", "customer.", "agent."],
    delegatesTo: [],
  },
  {
    key: "SPAR",
    name: "SPAR Supply",
    department: "Inventory and Procurement",
    purpose: "Analyse stock, shortages, suppliers and procurement options.",
    allowedCapabilityPrefixes: [
      "inventory.",
      "purchase.",
      "supplier.",
      "agent.",
    ],
    delegatesTo: [],
  },
  {
    key: "AXLE",
    name: "AXLE Planning",
    department: "Engineering and Planning",
    purpose: "Analyse BOMs, routings, material plans, capacity and schedules.",
    allowedCapabilityPrefixes: ["engineering.", "planning.", "agent."],
    delegatesTo: [],
  },
  {
    key: "KILN",
    name: "KILN Operations & Quality",
    department: "Production, QMS & Audit and Maintenance",
    purpose:
      "Analyse execution, quality evidence, audit readiness, corrective actions, maintenance and shop-floor risk.",
    allowedCapabilityPrefixes: [
      "production.",
      "quality.",
      "maintenance.",
      "agent.",
    ],
    delegatesTo: [],
  },
  {
    key: "RASP",
    name: "RASP Finance & Working Capital",
    department: "Finance, Working Capital, Expenditure and People",
    purpose:
      "Analyse cash, collections, supplier commitments, stock holding cash, margin, controls, workforce and payroll impact.",
    allowedCapabilityPrefixes: [
      "accounts.",
      "finance.",
      "expenditure.",
      "hrm.",
      "agent.",
    ],
    delegatesTo: [],
  },
  {
    key: "RELAY",
    name: "RELAY Managed Services",
    department: "Managed Service Operations",
    purpose:
      "Own the service lifecycle, event triage, incident coordination, change calendar, service levels, customer updates and continual improvement around XELOR.",
    allowedCapabilityPrefixes: ["managed-services.", "agent."],
    delegatesTo: [],
  },
] as const;

export type AgentNodeKind =
  "agent" | "capability" | "transform" | "branch" | "approval" | "verification";

export type AgentNodeStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";

export interface GraphCondition {
  nodeId: string;
  /** Dot-separated output path, such as `decision.approved`. Empty means the whole output. */
  path?: string;
  equals: unknown;
}

interface GraphNodeBase {
  id: string;
  name: string;
  kind: AgentNodeKind;
  dependsOn: readonly string[];
  /** Total attempts, including the first. Graph validation bounds this to five. */
  maxAttempts?: number;
  condition?: GraphCondition;
}

export interface AgentGraphNode extends GraphNodeBase {
  kind: "agent";
  agentKey: AgentKey;
  instruction: string;
}

export interface CapabilityGraphNode extends GraphNodeBase {
  kind: "capability";
  agentKey: AgentKey;
  capabilityKey: string;
  input?: Readonly<Record<string, unknown>>;
}

export interface TransformGraphNode extends GraphNodeBase {
  kind: "transform";
  operation: "merge" | "collect";
}

export interface BranchGraphNode extends GraphNodeBase {
  kind: "branch";
  sourceNodeId: string;
  path?: string;
  cases: Readonly<Record<string, string>>;
  defaultCase?: string;
}

export interface ApprovalGraphNode extends GraphNodeBase {
  kind: "approval";
  title: string;
  risk: "low" | "medium" | "high";
  proposedAction: string;
}

export interface VerificationGraphNode extends GraphNodeBase {
  kind: "verification";
  agentKey: "HEXA";
  checks: readonly string[];
}

export type AgentGraphNodeDefinition =
  | AgentGraphNode
  | CapabilityGraphNode
  | TransformGraphNode
  | BranchGraphNode
  | ApprovalGraphNode
  | VerificationGraphNode;

export interface AgentGraphDefinition {
  key: string;
  version: number;
  name: string;
  description: string;
  maxSteps: number;
  timeoutSeconds: number;
  nodes: readonly AgentGraphNodeDefinition[];
}

export interface GraphValidationResult {
  valid: boolean;
  errors: readonly string[];
}
