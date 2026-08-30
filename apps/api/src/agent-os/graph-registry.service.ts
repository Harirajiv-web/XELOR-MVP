import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  AppError,
  validateAgentGraph,
  type AgentGraphDefinition,
} from "@ind-core/platform";

const FOUNDATION_MISSION: AgentGraphDefinition = {
  key: "foundation.cross-functional-readiness",
  version: 1,
  name: "Cross-functional readiness review",
  description:
    "Proves durable orchestration, parallel specialist work, governed ERP reads, verification and human approval.",
  maxSteps: 14,
  timeoutSeconds: 300,
  nodes: [
    {
      id: "onyx-intake",
      name: "ONYX mission intake",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Normalize the goal and state the bounded investigation plan.",
      dependsOn: [],
    },
    {
      id: "mica-orders",
      name: "MICA reads commercial commitments",
      kind: "capability",
      agentKey: "MICA",
      capabilityKey: "sales.orders.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "spar-stock",
      name: "SPAR reads stock position",
      kind: "capability",
      agentKey: "SPAR",
      capabilityKey: "inventory.on-hand.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "mica-assessment",
      name: "MICA commercial assessment",
      kind: "agent",
      agentKey: "MICA",
      instruction:
        "Summarize the live order commitments and identify commercial evidence.",
      dependsOn: ["mica-orders"],
    },
    {
      id: "spar-assessment",
      name: "SPAR supply assessment",
      kind: "agent",
      agentKey: "SPAR",
      instruction:
        "Summarize the live stock position and identify supply evidence.",
      dependsOn: ["spar-stock"],
    },
    {
      id: "evidence-join",
      name: "Join specialist evidence",
      kind: "transform",
      operation: "collect",
      dependsOn: ["mica-assessment", "spar-assessment"],
    },
    {
      id: "hexa-verification",
      name: "HEXA verifies policy and evidence",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "all tool calls are registered",
        "all evidence is tenant-scoped",
        "no write was executed",
      ],
      dependsOn: ["evidence-join"],
    },
    {
      id: "human-approval",
      name: "Human authorizes synthesis",
      kind: "approval",
      title: "Approve the evidence-backed mission result",
      risk: "low",
      proposedAction:
        "Allow ONYX to issue the final readiness synthesis. No ERP write will occur.",
      dependsOn: ["hexa-verification"],
    },
    {
      id: "onyx-synthesis",
      name: "ONYX final synthesis",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Produce the final concise result from verified evidence and the human decision.",
      dependsOn: ["human-approval"],
      condition: {
        nodeId: "human-approval",
        path: "decision.approved",
        equals: true,
      },
    },
  ],
};

const FACTORY_FLOW_RECOVERY: AgentGraphDefinition = {
  key: "factory.flow-recovery",
  version: 2,
  name: "Factory flow recovery",
  description:
    "Explains a constrained robot cell or excessive material dwell, joins business consequences and pauses before an approval-bound simulator policy evaluation. Physical execution is unavailable.",
  maxSteps: 24,
  timeoutSeconds: 300,
  nodes: [
    {
      id: "onyx-intake", name: "ONYX bounds the factory recovery", kind: "agent", agentKey: "ONYX",
      instruction: "State the affected cell, material movement and safety boundary. Never propose bypassing a controller or safety PLC.", dependsOn: [],
    },
    {
      id: "kiln-factory", name: "KILN reads robot and dwell evidence", kind: "capability", agentKey: "KILN",
      capabilityKey: "production.factory-connect.read", input: {}, maxAttempts: 2, dependsOn: ["onyx-intake"],
    },
    {
      id: "mica-orders", name: "MICA reads customer commitments", kind: "capability", agentKey: "MICA",
      capabilityKey: "sales.orders.read", input: { limit: 20 }, maxAttempts: 2, dependsOn: ["onyx-intake"],
    },
    {
      id: "spar-stock", name: "SPAR reads material position", kind: "capability", agentKey: "SPAR",
      capabilityKey: "inventory.on-hand.read", input: {}, maxAttempts: 2, dependsOn: ["onyx-intake"],
    },
    {
      id: "axle-plan", name: "AXLE reads current plan", kind: "capability", agentKey: "AXLE",
      capabilityKey: "planning.planned-orders.read", input: {}, maxAttempts: 2, dependsOn: ["onyx-intake"],
    },
    {
      id: "rasp-finance", name: "RASP reads financial evidence", kind: "capability", agentKey: "RASP",
      capabilityKey: "accounts.vouchers.read", input: { limit: 20 }, maxAttempts: 2, dependsOn: ["onyx-intake"],
    },
    {
      id: "kiln-assessment", name: "KILN assesses safe operating recovery", kind: "agent", agentKey: "KILN",
      instruction: "Explain the robot state, material dwell, maintenance and quality boundary from evidence. Local safety remains authoritative.", dependsOn: ["kiln-factory"],
    },
    {
      id: "mica-assessment", name: "MICA assesses customer impact", kind: "agent", agentKey: "MICA",
      instruction: "Identify affected commitments without changing a promise.", dependsOn: ["mica-orders"],
    },
    {
      id: "spar-assessment", name: "SPAR assesses material recovery", kind: "agent", agentKey: "SPAR",
      instruction: "Identify available material and internal-movement evidence without claiming a dispatch.", dependsOn: ["spar-stock"],
    },
    {
      id: "axle-assessment", name: "AXLE assesses schedule recovery", kind: "agent", agentKey: "AXLE",
      instruction: "Assess capacity, sequence and alternate routing from the current plan.", dependsOn: ["axle-plan"],
    },
    {
      id: "rasp-assessment", name: "RASP assesses financial exposure", kind: "agent", agentKey: "RASP",
      instruction: "Explain evidenced downtime and working-capital consequences without inventing a cost.", dependsOn: ["rasp-finance"],
    },
    {
      id: "evidence-join", name: "Join factory and business evidence", kind: "transform", operation: "collect",
      dependsOn: ["kiln-assessment", "mica-assessment", "spar-assessment", "axle-assessment", "rasp-assessment"],
    },
    {
      id: "hexa-verification", name: "HEXA verifies connector and command boundaries", kind: "verification", agentKey: "HEXA",
      checks: [
        "the registered Factory evidence capability returned through a tenant-scoped domain-service boundary",
        "mission input contains no command or one command matching the strict closed parameter schema",
        "the Factory mission graph contains no side-effecting or physical-dispatch capability",
        "the approval proposal will bind the canonical command digest or explicitly authorize no command",
      ],
      dependsOn: ["evidence-join"],
    },
    {
      id: "human-approval", name: "Production supervisor authorizes bounded recovery", kind: "approval",
      title: "Approve the factory-flow recovery work item", risk: "high",
      proposedAction: "Authorize the exact simulator policy evaluation shown in this proposal. No edge request, controller acknowledgement or physical action is available.",
      dependsOn: ["hexa-verification"],
    },
    {
      id: "kiln-recovery", name: "KILN records the approved recovery", kind: "agent", agentKey: "KILN",
      instruction: "Record the approved simulator evaluation and verification evidence. State explicitly that no edge request, controller acknowledgement or physical action occurred.",
      dependsOn: ["human-approval"], condition: { nodeId: "human-approval", path: "decision.approved", equals: true },
    },
    {
      id: "relay-coordination", name: "RELAY coordinates customer-visible service impact", kind: "agent", agentKey: "RELAY",
      instruction: "Coordinate an update only if the XELOR service or managed-service commitment is affected; do not own factory maintenance.",
      dependsOn: ["human-approval"], condition: { nodeId: "human-approval", path: "decision.approved", equals: true },
    },
    {
      id: "achiles-boundary", name: "ACHILES preserves the platform boundary", kind: "agent", agentKey: "ACHILES",
      instruction: "Report only XELOR platform health evidence. Do not assess or command the robot cell.",
      dependsOn: ["human-approval"], condition: { nodeId: "human-approval", path: "decision.approved", equals: true },
    },
    {
      id: "onyx-synthesis", name: "ONYX publishes the recovery brief", kind: "agent", agentKey: "ONYX",
      instruction: "Publish the verified factory analysis, business impact and approval-bound simulator evaluation. State that physical execution is unavailable, not awaiting acknowledgement.",
      dependsOn: ["kiln-recovery", "relay-coordination", "achiles-boundary"],
    },
  ],
};

/**
 * The 3S Workroom-style POC is deliberately a second graph, not a new version of the
 * existing Factory Flow simulator-command review. It explains ONYX evidence, pauses for a
 * person, then creates one planning-review work item. It cannot publish a schedule or issue
 * a physical command.
 */
const FACTORY_INTELLIGENCE_RECOVERY: AgentGraphDefinition = {
  key: "factory.intelligence-recovery",
  version: 1,
  name: "3S factory intelligence recovery",
  description:
    "Recomputes and explains 3S OEE, validates ONYX at-risk work and its explicit alternate, then pauses before one governed ONYX planning-review request.",
  maxSteps: 14,
  timeoutSeconds: 300,
  nodes: [
    {
      id: "onyx-intake",
      name: "ONYX bounds the 3S recovery",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Frame the configured 3S mock scenario. ONYX Phase 1 remains the schedule source of truth; no machine or safety controller is in scope.",
      dependsOn: [],
    },
    {
      id: "kiln-factory-intelligence",
      name: "KILN validates factory intelligence",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "production.factory-intelligence.analyse",
      input: { scenarioKey: "3s-workroom-poc" },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "axle-recommendation",
      name: "AXLE explains the bounded replan",
      kind: "agent",
      agentKey: "AXLE",
      instruction:
        "Explain ONYX's supplied at-risk jobs and explicit WC-LTH01 to WC-LTH02 alternate. Treat it as a recommendation that ONYX Planning must review, never as an applied schedule.",
      dependsOn: ["kiln-factory-intelligence"],
    },
    {
      id: "hexa-verification",
      name: "HEXA verifies evidence and authority",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "factory-operations.v1 was read from the registered ONYX HTTP port with explicit mock provenance",
        "OEE was recomputed deterministically from raw Availability, Performance and Quality inputs",
        "the replan only validates ONYX's explicit alternate and does not create a second schedule source of truth",
        "no physical-command, auto-publish or schedule-apply capability exists in this graph",
      ],
      dependsOn: ["axle-recommendation"],
    },
    {
      id: "human-replan-approval",
      name: "Production planner reviews the 3S recommendation",
      kind: "approval",
      title: "Approve the 3S alternate-work-centre review request",
      risk: "medium",
      proposedAction:
        "Create one attributable ONYX Planning work item asking a planner to review the configured WC-LTH01 to WC-LTH02 alternate. This does not publish a schedule or contact a machine.",
      dependsOn: ["hexa-verification"],
    },
    {
      id: "kiln-post-approval-revalidation",
      name: "KILN revalidates current ONYX evidence after approval",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "production.factory-intelligence.analyse",
      input: { scenarioKey: "3s-workroom-poc" },
      maxAttempts: 2,
      dependsOn: ["human-replan-approval"],
      condition: {
        nodeId: "human-replan-approval",
        path: "decision.approved",
        equals: true,
      },
    },
    {
      id: "axle-dispatch-review",
      name: "AXLE dispatches the approved ONYX review request",
      kind: "capability",
      agentKey: "AXLE",
      capabilityKey: "agent.action.dispatch",
      input: {
        targetDomain: "onyx.planning",
        actionType: "factory_replan_request",
        title: "Review 3S WC-LTH01 to WC-LTH02 recovery in ONYX Planning",
        risk: "medium",
        payload: {
          schemaVersion: "factory-replan-request.v1",
          scenarioKey: "3s-workroom-poc",
          customer: "3S Precision Parts",
          jobId: "POC-REPLAY-MO-2627-00003-OP10",
          orderRef: "MO-2627-00003",
          itemCode: "CMP-PX4-SFT",
          operationCode: "OP-10",
          fromAsset: "AST-PNQ-TRN-01",
          toAsset: "AST-PNQ-LTH-02",
          fromWorkCenterCode: "WC-LTH01",
          toWorkCenterCode: "WC-LTH02",
          deterministicRule: "explicit_alternate_then_asset_code",
          requestMode: "review_only",
          autoPublish: false,
          physicalCommand: false,
          boundary:
            "ONYX Planning must re-read evidence and decide whether to apply a schedule change. XELOR did not publish or execute one.",
        },
      },
      maxAttempts: 2,
      dependsOn: ["kiln-post-approval-revalidation"],
      condition: {
        nodeId: "human-replan-approval",
        path: "decision.approved",
        equals: true,
      },
    },
    {
      id: "hexa-outcome-verification",
      name: "HEXA verifies the governed dispatch evidence",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "exactly one approval-linked factory_replan_request work item was recorded",
        "the work item targets onyx.planning in review_only mode",
        "no schedule publication, controller acknowledgement or physical execution was claimed",
      ],
      dependsOn: ["axle-dispatch-review"],
    },
    {
      id: "onyx-synthesis",
      name: "ONYX records the governed recovery outcome",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Summarize the approved planning-review request and its immutable evidence. State that ONYX has not yet accepted or applied the recommendation and no physical action occurred.",
      dependsOn: ["hexa-outcome-verification"],
    },
  ],
};

const FULL_COMMAND_REVIEW: AgentGraphDefinition = {
  key: "operations.full-command-review",
  version: 3,
  name: "Nine-agent operating review",
  description:
    "Connects ONYX to every specialist agent, including RELAY service assurance and ACHILES private platform health, for one bounded, evidence-backed operating review.",
  maxSteps: 29,
  timeoutSeconds: 300,
  nodes: [
    {
      id: "onyx-intake",
      name: "ONYX frames the mission",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Normalize the goal, define the evidence boundary and delegate to every specialist.",
      dependsOn: [],
    },
    {
      id: "hexa-context",
      name: "HEXA reads organisation context",
      kind: "capability",
      agentKey: "HEXA",
      capabilityKey: "general.companies.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "mica-orders",
      name: "MICA reads customer commitments",
      kind: "capability",
      agentKey: "MICA",
      capabilityKey: "sales.orders.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "spar-stock",
      name: "SPAR reads inventory position",
      kind: "capability",
      agentKey: "SPAR",
      capabilityKey: "inventory.on-hand.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "axle-plan",
      name: "AXLE reads the material plan",
      kind: "capability",
      agentKey: "AXLE",
      capabilityKey: "planning.planned-orders.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "kiln-production",
      name: "KILN reads production execution",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "production.orders.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "rasp-finance",
      name: "RASP reads finance postings",
      kind: "capability",
      agentKey: "RASP",
      capabilityKey: "accounts.vouchers.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "relay-services",
      name: "RELAY reads managed-service assurance",
      kind: "capability",
      agentKey: "RELAY",
      capabilityKey: "managed-services.service-assurance.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "achiles-health",
      name: "ACHILES reads private platform health",
      kind: "capability",
      agentKey: "ACHILES",
      capabilityKey: "platform-health.status.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "hexa-assessment",
      name: "HEXA control assessment",
      kind: "agent",
      agentKey: "HEXA",
      instruction:
        "Assess the live domain evidence, state material findings and preserve source references.",
      dependsOn: ["hexa-context"],
    },
    {
      id: "mica-assessment",
      name: "MICA commercial assessment",
      kind: "agent",
      agentKey: "MICA",
      instruction:
        "Assess the live domain evidence, state material findings and preserve source references.",
      dependsOn: ["mica-orders"],
    },
    {
      id: "spar-assessment",
      name: "SPAR supply assessment",
      kind: "agent",
      agentKey: "SPAR",
      instruction:
        "Assess the live domain evidence, state material findings and preserve source references.",
      dependsOn: ["spar-stock"],
    },
    {
      id: "axle-assessment",
      name: "AXLE planning assessment",
      kind: "agent",
      agentKey: "AXLE",
      instruction:
        "Assess the live domain evidence, state material findings and preserve source references.",
      dependsOn: ["axle-plan"],
    },
    {
      id: "kiln-assessment",
      name: "KILN operations assessment",
      kind: "agent",
      agentKey: "KILN",
      instruction:
        "Assess the live domain evidence, state material findings and preserve source references.",
      dependsOn: ["kiln-production"],
    },
    {
      id: "rasp-assessment",
      name: "RASP finance assessment",
      kind: "agent",
      agentKey: "RASP",
      instruction:
        "Assess the live domain evidence, state material findings and preserve source references.",
      dependsOn: ["rasp-finance"],
    },
    {
      id: "relay-assessment",
      name: "RELAY service assurance assessment",
      kind: "agent",
      agentKey: "RELAY",
      instruction:
        "Assess service health, active incidents, change risk and customer communication. Keep technical resolution with the accountable specialist.",
      dependsOn: ["relay-services"],
    },
    {
      id: "achiles-assessment",
      name: "ACHILES platform-health assessment",
      kind: "agent",
      agentKey: "ACHILES",
      instruction:
        "Report availability, freshness and failed probes from private monitoring evidence. Do not diagnose a cause, perform a repair or prepare a customer message.",
      dependsOn: ["achiles-health"],
    },
    {
      id: "evidence-join",
      name: "ONYX joins specialist evidence",
      kind: "transform",
      operation: "collect",
      dependsOn: [
        "hexa-assessment",
        "mica-assessment",
        "spar-assessment",
        "axle-assessment",
        "kiln-assessment",
        "rasp-assessment",
        "relay-assessment",
        "achiles-assessment",
      ],
    },
    {
      id: "hexa-verification",
      name: "HEXA verifies the complete evidence pack",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "every specialist used only registered capabilities",
        "every domain read stayed tenant-scoped",
        "all eight specialist assessments are present",
        "no business record was changed",
      ],
      dependsOn: ["evidence-join"],
    },
    {
      id: "human-approval",
      name: "Human authorizes the command brief",
      kind: "approval",
      title: "Approve the nine-agent operating brief",
      risk: "low",
      proposedAction:
        "Allow ONYX to publish the verified cross-functional brief. No ERP write will occur.",
      dependsOn: ["hexa-verification"],
    },
    {
      id: "onyx-synthesis",
      name: "ONYX issues the command brief",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Synthesize the eight verified specialist assessments into a concise operating brief, separating business actions, managed-service coordination and private platform-health evidence.",
      dependsOn: ["human-approval"],
      condition: {
        nodeId: "human-approval",
        path: "decision.approved",
        equals: true,
      },
    },
  ],
};

/**
 * Phase 3's controlled-autonomy contract:
 * read live evidence -> propose -> verify -> human gate -> dispatch -> verify outcome.
 *
 * Seven execution nodes create attributable domain or service-coordination work items. ACHILES remains read-only and creates no repair action. They do not give a model
 * SQL access and they do not claim an external connector ran. Each node is structurally
 * downstream of the approval, and the engine independently enforces that ancestry.
 */
const CONTROLLED_ACTION_MISSION: AgentGraphDefinition = {
  key: "operations.controlled-action-mission",
  version: 3,
  name: "Nine-agent controlled action mission",
  description:
    "Coordinates all eight specialists, including ACHILES platform assurance, pauses on a high-visibility human gate, then dispatches six domain actions plus one RELAY service-coordination action and verifies the outcome. ACHILES remains read-only.",
  maxSteps: 39,
  timeoutSeconds: 600,
  nodes: [
    {
      id: "onyx-intake",
      name: "ONYX frames the operating objective",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Define the objective, the permitted evidence boundary and the consequence boundary.",
      dependsOn: [],
    },
    {
      id: "hexa-context",
      name: "HEXA reads governed company context",
      kind: "capability",
      agentKey: "HEXA",
      capabilityKey: "general.companies.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "mica-orders",
      name: "MICA reads delivery commitments",
      kind: "capability",
      agentKey: "MICA",
      capabilityKey: "sales.orders.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "spar-stock",
      name: "SPAR reads supply exposure",
      kind: "capability",
      agentKey: "SPAR",
      capabilityKey: "inventory.on-hand.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "axle-plan",
      name: "AXLE reads the current material plan",
      kind: "capability",
      agentKey: "AXLE",
      capabilityKey: "planning.planned-orders.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "kiln-production",
      name: "KILN reads production execution",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "production.orders.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "rasp-finance",
      name: "RASP reads financial exposure",
      kind: "capability",
      agentKey: "RASP",
      capabilityKey: "accounts.vouchers.read",
      input: { limit: 20 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "relay-services",
      name: "RELAY reads service exposure",
      kind: "capability",
      agentKey: "RELAY",
      capabilityKey: "managed-services.service-assurance.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "achiles-health",
      name: "ACHILES reads private platform exposure",
      kind: "capability",
      agentKey: "ACHILES",
      capabilityKey: "platform-health.status.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    ...(
      [
        ["hexa", "HEXA", "control"],
        ["mica", "MICA", "commercial"],
        ["spar", "SPAR", "supply"],
        ["axle", "AXLE", "planning"],
        ["kiln", "KILN", "operations"],
        ["rasp", "RASP", "finance and people"],
        ["relay", "RELAY", "managed service"],
        ["achiles", "ACHILES", "private platform assurance"],
      ] as const
    ).map(([prefix, agentKey, domain]) => ({
      id: `${prefix}-assessment`,
      name: `${agentKey} prepares the ${domain} recommendation`,
      kind: "agent" as const,
      agentKey,
      instruction:
        "Produce a bounded action recommendation from the live evidence. Preserve references and do not execute anything.",
      dependsOn: [
        prefix === "hexa"
          ? "hexa-context"
          : prefix === "mica"
            ? "mica-orders"
            : prefix === "spar"
              ? "spar-stock"
              : prefix === "axle"
                ? "axle-plan"
                : prefix === "kiln"
                  ? "kiln-production"
                  : prefix === "rasp"
                    ? "rasp-finance"
                    : prefix === "relay"
                      ? "relay-services"
                      : "achiles-health",
      ],
    })),
    {
      id: "recommendation-join",
      name: "ONYX joins eight specialist recommendations",
      kind: "transform",
      operation: "collect",
      dependsOn: [
        "hexa-assessment",
        "mica-assessment",
        "spar-assessment",
        "axle-assessment",
        "kiln-assessment",
        "rasp-assessment",
        "relay-assessment",
        "achiles-assessment",
      ],
    },
    {
      id: "onyx-action-plan",
      name: "ONYX prepares the controlled action plan",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Produce one coordinated plan across six business domains, managed-service assurance and private platform health. Separate evidence, recommendation, technical ownership and proposed execution. ACHILES must remain read-only.",
      dependsOn: ["recommendation-join"],
    },
    {
      id: "hexa-preflight",
      name: "HEXA verifies evidence and consequence boundaries",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "all evidence calls are registered and tenant-scoped",
        "all eight specialist recommendations are present",
        "no action has executed before approval",
        "each future action is a governed work item",
      ],
      dependsOn: ["onyx-action-plan"],
    },
    {
      id: "human-action-approval",
      name: "Human authorizes seven governed actions",
      kind: "approval",
      title: "Authorize the Phase 3 controlled action plan",
      risk: "medium",
      proposedAction:
        "Dispatch six attributable domain work items plus one RELAY service-coordination item. No external API or unrestricted database action will run.",
      dependsOn: ["hexa-preflight"],
    },
    {
      id: "hexa-dispatch",
      name: "HEXA dispatches the governance guardrail",
      kind: "capability",
      agentKey: "HEXA",
      capabilityKey: "agent.action.dispatch",
      input: {
        targetDomain: "governance",
        actionType: "control_review",
        title: "Verify permissions, evidence and approval compliance",
        risk: "medium",
        payload: { owner: "HEXA", outcome: "control_evidence_pack" },
      },
      dependsOn: ["human-action-approval"],
    },
    {
      id: "mica-dispatch",
      name: "MICA dispatches the customer commitment action",
      kind: "capability",
      agentKey: "MICA",
      capabilityKey: "agent.action.dispatch",
      input: {
        targetDomain: "sales",
        actionType: "commitment_recovery",
        title: "Prepare the customer delivery commitment recovery",
        risk: "medium",
        payload: { owner: "MICA", outcome: "customer_commitment_brief" },
      },
      dependsOn: ["human-action-approval"],
    },
    {
      id: "spar-dispatch",
      name: "SPAR dispatches the supply recovery action",
      kind: "capability",
      agentKey: "SPAR",
      capabilityKey: "agent.action.dispatch",
      input: {
        targetDomain: "supply",
        actionType: "shortage_recovery",
        title: "Prepare material shortage recovery work",
        risk: "medium",
        payload: { owner: "SPAR", outcome: "supply_recovery_queue" },
      },
      dependsOn: ["human-action-approval"],
    },
    {
      id: "axle-dispatch",
      name: "AXLE dispatches the planning scenario",
      kind: "capability",
      agentKey: "AXLE",
      capabilityKey: "agent.action.dispatch",
      input: {
        targetDomain: "planning",
        actionType: "capacity_scenario",
        title: "Prepare a capacity and material recovery scenario",
        risk: "medium",
        payload: { owner: "AXLE", outcome: "bounded_replan_scenario" },
      },
      dependsOn: ["human-action-approval"],
    },
    {
      id: "kiln-dispatch",
      name: "KILN dispatches the execution priority",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "agent.action.dispatch",
      input: {
        targetDomain: "operations",
        actionType: "execution_priority",
        title: "Prepare the governed production execution priority",
        risk: "medium",
        payload: { owner: "KILN", outcome: "shop_floor_priority" },
      },
      dependsOn: ["human-action-approval"],
    },
    {
      id: "rasp-dispatch",
      name: "RASP dispatches the financial guardrail",
      kind: "capability",
      agentKey: "RASP",
      capabilityKey: "agent.action.dispatch",
      input: {
        targetDomain: "finance_people",
        actionType: "margin_and_workforce_guardrail",
        title: "Prepare margin, cash and workforce guardrails",
        risk: "medium",
        payload: { owner: "RASP", outcome: "financial_guardrail" },
      },
      dependsOn: ["human-action-approval"],
    },
    {
      id: "relay-dispatch",
      name: "RELAY dispatches the service assurance action",
      kind: "capability",
      agentKey: "RELAY",
      capabilityKey: "agent.action.dispatch",
      input: {
        targetDomain: "managed_services",
        actionType: "service_assurance_coordination",
        title: "Coordinate SLA, customer update and verified service outcome",
        risk: "medium",
        payload: { owner: "RELAY", outcome: "service_assurance_record" },
      },
      dependsOn: ["human-action-approval"],
    },
    {
      id: "action-outcome-join",
      name: "ONYX collects seven dispatch outcomes",
      kind: "transform",
      operation: "collect",
      dependsOn: [
        "hexa-dispatch",
        "mica-dispatch",
        "spar-dispatch",
        "axle-dispatch",
        "kiln-dispatch",
        "rasp-dispatch",
        "relay-dispatch",
      ],
    },
    {
      id: "hexa-outcome-verification",
      name: "HEXA verifies approval-bound execution",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "every dispatched action has an approved ancestor",
        "every action is attributable to one registered specialist",
        "all execution stayed inside the governed work-item boundary",
        "all seven outcomes are present",
      ],
      dependsOn: ["action-outcome-join"],
    },
    {
      id: "onyx-outcome",
      name: "ONYX publishes the action outcome",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Publish the approved action ledger, verification result and next human checkpoints.",
      dependsOn: ["hexa-outcome-verification"],
    },
  ],
};

const WORKING_CAPITAL_REVIEW: AgentGraphDefinition = {
  key: "finance.working-capital-review",
  version: 1,
  name: "Working Capital Review",
  description:
    "RASP combines finance, customer and stock evidence into a cash outlook, then HEXA verifies the boundary before ONYX issues a human-approved brief.",
  maxSteps: 18,
  timeoutSeconds: 300,
  nodes: [
    {
      id: "onyx-intake",
      name: "ONYX frames the working capital question",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "State the time horizon, evidence boundary and the decisions this review must support.",
      dependsOn: [],
    },
    {
      id: "rasp-cash",
      name: "RASP reads the verified finance position",
      kind: "capability",
      agentKey: "RASP",
      capabilityKey: "finance.cash-position.read",
      input: { asOf: "2026-07-20" },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "mica-customers",
      name: "MICA reads customer commitments",
      kind: "capability",
      agentKey: "MICA",
      capabilityKey: "sales.orders.read",
      input: { limit: 50 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "spar-stock",
      name: "SPAR reads stock holding cash",
      kind: "capability",
      agentKey: "SPAR",
      capabilityKey: "inventory.on-hand.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "rasp-forecast",
      name: "RASP simulates the 13-week outlook",
      kind: "capability",
      agentKey: "RASP",
      capabilityKey: "finance.forecast.simulate",
      input: { horizonWeeks: 13, scenario: "base case" },
      maxAttempts: 2,
      dependsOn: ["rasp-cash"],
    },
    {
      id: "rasp-analysis",
      name: "RASP explains the cash risks and choices",
      kind: "agent",
      agentKey: "RASP",
      instruction:
        "Separate calculated facts, assumptions and suggested actions. Do not propose an automatic payment, posting or customer contact.",
      dependsOn: ["rasp-forecast", "mica-customers", "spar-stock"],
    },
    {
      id: "hexa-verification",
      name: "HEXA verifies the finance evidence",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "every figure is tied to tenant-scoped source evidence",
        "assumptions are labelled separately from recorded facts",
        "the scenario changed no source record",
        "no payment, posting or customer message was executed",
      ],
      dependsOn: ["rasp-analysis"],
    },
    {
      id: "human-review",
      name: "Human approves the working capital brief",
      kind: "approval",
      title: "Approve the Working Capital Review",
      risk: "low",
      proposedAction:
        "Allow ONYX to publish the verified cash brief. This approval does not authorize a payment, ledger posting or customer contact.",
      dependsOn: ["hexa-verification"],
    },
    {
      id: "onyx-brief",
      name: "ONYX publishes the working capital brief",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Write a concise brief with current position, next risk, safest options, owners and dates.",
      dependsOn: ["human-review"],
      condition: {
        nodeId: "human-review",
        path: "decision.approved",
        equals: true,
      },
    },
  ],
};

const QMS_AUDIT_READINESS: AgentGraphDefinition = {
  key: "quality.qms-audit-readiness",
  version: 1,
  name: "QMS & Audit Readiness",
  description:
    "KILN collects traceable quality evidence, identifies explicit gaps and prepares a review pack that HEXA verifies before a human-approved summary.",
  maxSteps: 18,
  timeoutSeconds: 300,
  nodes: [
    {
      id: "onyx-intake",
      name: "ONYX frames the audit scope",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "State the audit scope, required proof and the decisions reserved for authorised quality people.",
      dependsOn: [],
    },
    {
      id: "kiln-inspections",
      name: "KILN reads inspection evidence",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "quality.inspections.read",
      input: { limit: 100 },
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "kiln-evidence",
      name: "KILN collects the QMS evidence view",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "quality.evidence.collect",
      input: { scope: "current QMS and internal audit readiness", limit: 100 },
      maxAttempts: 2,
      dependsOn: ["kiln-inspections"],
    },
    {
      id: "kiln-pack",
      name: "KILN drafts the evidence pack",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "quality.audit-pack.draft",
      input: { scope: "current QMS and internal audit readiness" },
      maxAttempts: 2,
      dependsOn: ["kiln-evidence"],
    },
    {
      id: "kiln-analysis",
      name: "KILN explains readiness and gaps",
      kind: "agent",
      agentKey: "KILN",
      instruction:
        "Separate verified evidence, missing links and human decisions. Never declare compliance, confirm root cause or close CAPA.",
      dependsOn: ["kiln-pack"],
    },
    {
      id: "hexa-verification",
      name: "HEXA verifies traceability and access",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "every evidence item preserves its source reference",
        "document or inspection versions are not silently replaced",
        "all gaps and missing evidence are explicit",
        "no audit result, root cause or CAPA closure was decided by AI",
      ],
      dependsOn: ["kiln-analysis"],
    },
    {
      id: "human-review",
      name: "Quality owner approves the readiness summary",
      kind: "approval",
      title: "Approve the QMS & Audit Readiness summary",
      risk: "low",
      proposedAction:
        "Allow ONYX to publish the verified readiness summary. This does not declare compliance or close a finding.",
      dependsOn: ["hexa-verification"],
    },
    {
      id: "onyx-brief",
      name: "ONYX publishes the audit readiness brief",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "Write a concise readiness brief with evidence present, gaps, owners, dates and the decisions still reserved for people.",
      dependsOn: ["human-review"],
      condition: {
        nodeId: "human-review",
        path: "decision.approved",
        equals: true,
      },
    },
  ],
};

/**
 * A service-assurance mission is intentionally separate from technical remediation.
 * RELAY owns the clock, handoffs and customer-facing outcome; HEXA verifies that the
 * evidence and responsibility boundaries were preserved; an authorised person decides
 * whether the service brief may be published. No node claims to repair a connector,
 * release the AI kill switch, close a security incident or change a customer contract.
 */
const MANAGED_SERVICE_ASSURANCE: AgentGraphDefinition = {
  key: "managed-services.assurance-review",
  version: 1,
  name: "Managed Service Assurance Review",
  description:
    "RELAY evaluates service health, incident clocks, change exposure and customer updates without duplicating specialist technical ownership.",
  maxSteps: 12,
  timeoutSeconds: 180,
  nodes: [
    {
      id: "onyx-intake",
      name: "ONYX frames the service question",
      kind: "agent",
      agentKey: "ONYX",
      instruction:
        "State the customer outcome to protect, the review period and the decisions that remain with authorised people.",
      dependsOn: [],
    },
    {
      id: "relay-service-view",
      name: "RELAY reads the service-assurance view",
      kind: "capability",
      agentKey: "RELAY",
      capabilityKey: "managed-services.service-assurance.read",
      input: {},
      maxAttempts: 2,
      dependsOn: ["onyx-intake"],
    },
    {
      id: "relay-assessment",
      name: "RELAY assesses the managed service",
      kind: "agent",
      agentKey: "RELAY",
      instruction:
        "Separate measured service outcomes, active coordination, specialist technical ownership, next customer updates and improvements. Do not claim a technical fix or contractual entitlement.",
      dependsOn: ["relay-service-view"],
    },
    {
      id: "hexa-verification",
      name: "HEXA verifies evidence and control boundaries",
      kind: "verification",
      agentKey: "HEXA",
      checks: [
        "every service statement preserves its evidence mode and source",
        "each technical issue has exactly one accountable specialist owner",
        "RELAY owns coordination rather than specialist remediation",
        "no security determination, AI control change or contractual credit was made",
      ],
      dependsOn: ["relay-assessment"],
    },
    {
      id: "human-review",
      name: "Service owner approves the customer brief",
      kind: "approval",
      title: "Approve the managed-service assurance brief",
      risk: "low",
      proposedAction:
        "Allow RELAY to publish the verified service brief. This does not approve a technical change, SLA credit or contract amendment.",
      dependsOn: ["hexa-verification"],
    },
    {
      id: "relay-brief",
      name: "RELAY publishes the service assurance brief",
      kind: "agent",
      agentKey: "RELAY",
      instruction:
        "Publish a concise service brief with outcomes, incidents, accountable technical owners, update times, planned changes, risks and owned improvements.",
      dependsOn: ["human-review"],
      condition: {
        nodeId: "human-review",
        path: "decision.approved",
        equals: true,
      },
    },
  ],
};

@Injectable()
export class GraphRegistryService {
  private readonly graphs = new Map<string, AgentGraphDefinition>();

  constructor() {
    for (const graph of [
      FACTORY_FLOW_RECOVERY,
      FACTORY_INTELLIGENCE_RECOVERY,
      WORKING_CAPITAL_REVIEW,
      QMS_AUDIT_READINESS,
      MANAGED_SERVICE_ASSURANCE,
      CONTROLLED_ACTION_MISSION,
      FULL_COMMAND_REVIEW,
      FOUNDATION_MISSION,
    ]) {
      const validation = validateAgentGraph(graph);
      if (!validation.valid) {
        throw new Error(
          `Invalid Agent OS graph '${graph.key}': ${validation.errors.join("; ")}`,
        );
      }
      this.graphs.set(`${graph.key}@${graph.version}`, graph);
    }
  }

  list(): readonly AgentGraphDefinition[] {
    return [...this.graphs.values()];
  }

  get(key: string, version?: number): AgentGraphDefinition {
    const candidates = [...this.graphs.values()].filter((g) => g.key === key);
    const graph = version
      ? this.graphs.get(`${key}@${version}`)
      : candidates.sort((a, b) => b.version - a.version)[0];
    if (!graph)
      throw new AppError(
        "AGENT_GRAPH_NOT_FOUND",
        404,
        `Agent graph '${key}' was not found.`,
      );
    return graph;
  }

  contentHash(graph: AgentGraphDefinition): string {
    return createHash("sha256").update(JSON.stringify(graph)).digest("hex");
  }
}
