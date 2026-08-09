import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  AppError,
  type AgentKey,
  type CapabilityMode,
  type PermissionKey,
  managedServiceDemoSnapshot,
} from "@ind-core/platform";
import { GeneralService } from "../modules/general/general.service.js";
import { InventoryService } from "../modules/inventory/inventory.service.js";
import { SalesService } from "../modules/sales/sales.service.js";
import { PlannedOrderService } from "../modules/planning/planned-order.service.js";
import { ProductionService } from "../modules/production/production.service.js";
import { AccountsService } from "../modules/accounts/accounts.service.js";
import { QualityService } from "../modules/quality/quality.service.js";
import { AgentAuthorizationService } from "./agent-authorization.service.js";
import { AgentRegistryService } from "./agent-registry.service.js";
import { AgentActionService } from "./agent-action.service.js";
import { PlatformHealthService } from "../modules/platform-health/platform-health.service.js";
import { FactoryConnectService } from "../modules/integration/factory-connect.service.js";

export interface CapabilityDescriptor {
  key: string;
  name: string;
  description: string;
  mode: CapabilityMode;
  requiredPermission: PermissionKey;
  allowedAgents: readonly AgentKey[];
  executionBoundary: "domain_service";
  sideEffecting: boolean;
  approvalRequired: boolean;
}

interface RegisteredCapability extends CapabilityDescriptor {
  parse(input: unknown): Record<string, unknown>;
  execute(
    input: Record<string, unknown>,
    context: CapabilityExecutionContext | undefined,
  ): Promise<unknown>;
}

export interface CapabilityExecutionContext {
  agentKey: AgentKey;
  runId: string;
  nodeId: string;
  approvalNodeId?: string;
  executionToken?: string;
}

@Injectable()
export class CapabilityRegistryService {
  private readonly capabilities: Map<string, RegisteredCapability>;

  constructor(
    private readonly authorization: AgentAuthorizationService,
    private readonly agents: AgentRegistryService,
    private readonly general: GeneralService,
    private readonly inventory: InventoryService,
    private readonly sales: SalesService,
    private readonly planning: PlannedOrderService,
    private readonly production: ProductionService,
    private readonly accounts: AccountsService,
    private readonly quality: QualityService,
    private readonly platformHealth: PlatformHealthService,
    private readonly factoryConnect: FactoryConnectService,
    private readonly actions: AgentActionService,
  ) {
    const registered: RegisteredCapability[] = [
      {
        key: "general.companies.read",
        name: "Read companies and operating registrations",
        description:
          "Returns tenant-scoped company masters through GeneralService.",
        mode: "read",
        requiredPermission: "general.company.read",
        allowedAgents: ["HEXA", "ONYX"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({ limit: z.number().int().min(1).max(100).default(20) })
            .parse(input),
        execute: async (input: Record<string, unknown>) =>
          this.general.listCompanies(input.limit as number),
      },
      {
        key: "sales.orders.read",
        name: "Read sales commitments",
        description:
          "Returns tenant-scoped sales-order summaries through SalesService.",
        mode: "read",
        requiredPermission: "sales.order.read",
        allowedAgents: ["MICA"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({ limit: z.number().int().min(1).max(100).default(20) })
            .parse(input),
        execute: async (input: Record<string, unknown>) =>
          this.sales.listOrders(input.limit as number),
      },
      {
        key: "inventory.on-hand.read",
        name: "Read on-hand inventory",
        description:
          "Returns tenant-scoped non-zero stock balances through InventoryService.",
        mode: "read",
        requiredPermission: "inventory.stock.read",
        allowedAgents: ["SPAR"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({
              itemId: z.string().uuid().optional(),
              warehouseId: z.string().uuid().optional(),
            })
            .parse(input),
        execute: async (input: Record<string, unknown>) =>
          this.inventory.onHand({
            itemId: input.itemId as string | undefined,
            warehouseId: input.warehouseId as string | undefined,
          }),
      },
      {
        key: "planning.planned-orders.read",
        name: "Read current material plan",
        description:
          "Returns the tenant's latest planned orders through PlannedOrderService.",
        mode: "read",
        requiredPermission: "planning.mrp.read",
        allowedAgents: ["AXLE"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({
              status: z.string().min(1).optional(),
              sourceType: z.string().min(1).optional(),
            })
            .parse(input),
        execute: async (input: Record<string, unknown>) =>
          this.planning.list({
            status: input.status as string | undefined,
            sourceType: input.sourceType as string | undefined,
          }),
      },
      {
        key: "production.orders.read",
        name: "Read production execution",
        description:
          "Returns tenant-scoped production orders through ProductionService.",
        mode: "read",
        requiredPermission: "production.order.read",
        allowedAgents: ["KILN"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({ limit: z.number().int().min(1).max(100).default(20) })
            .parse(input),
        execute: async (input: Record<string, unknown>) =>
          this.production.listOrders(input.limit as number),
      },
      {
        key: "production.factory-connect.read",
        name: "Read connected factory operations",
        description:
          "Returns the tenant-scoped Production Factory projection: gateways, bound assets, summary and recovery mission evidence.",
        mode: "read",
        requiredPermission: "production.factory-connect.read",
        allowedAgents: ["KILN"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) => z.object({}).parse(input),
        execute: async () => this.factoryConnect.productionView(),
      },
      {
        key: "accounts.vouchers.read",
        name: "Read finance postings",
        description:
          "Returns tenant-scoped journal voucher summaries through AccountsService.",
        mode: "read",
        requiredPermission: "accounts.ledger.read",
        allowedAgents: ["RASP"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({ limit: z.number().int().min(1).max(100).default(20) })
            .parse(input),
        execute: async (input: Record<string, unknown>) =>
          this.accounts.listVouchers(input.limit as number),
      },
      {
        key: "finance.cash-position.read",
        name: "Read the verified cash and ledger position",
        description:
          "Returns the tenant-scoped trial balance used as the deterministic financial starting point.",
        mode: "read",
        requiredPermission: "accounts.ledger.read",
        allowedAgents: ["RASP"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({
              asOf: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .default("2026-07-20"),
            })
            .parse(input),
        execute: async (input: Record<string, unknown>) =>
          this.accounts.trialBalance(input.asOf as string),
      },
      {
        key: "finance.forecast.simulate",
        name: "Simulate a bounded cash forecast",
        description:
          "Reads posted finance evidence and returns a clearly labelled scenario boundary without changing any source record.",
        mode: "simulate",
        requiredPermission: "accounts.ledger.read",
        allowedAgents: ["RASP"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({
              horizonWeeks: z.number().int().min(1).max(13).default(13),
              scenario: z.string().min(2).max(120).default("base case"),
            })
            .parse(input),
        execute: async (input: Record<string, unknown>) => ({
          scenario: input.scenario,
          horizonWeeks: input.horizonWeeks,
          evidence: await this.accounts.listVouchers(100),
          boundary:
            "Simulation only. No voucher, payment, invoice, purchase order or bank instruction was changed.",
        }),
      },
      {
        key: "finance.collections.prioritise",
        name: "Prioritise customer collection review",
        description:
          "Reads finance postings and prepares a review queue. It cannot contact a customer or alter a receivable.",
        mode: "analyse",
        requiredPermission: "accounts.ledger.read",
        allowedAgents: ["RASP"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({ limit: z.number().int().min(1).max(100).default(50) })
            .parse(input),
        execute: async (input: Record<string, unknown>) => ({
          evidence: await this.accounts.listVouchers(input.limit as number),
          boundary: "Review queue only. Customer contact needs human approval.",
        }),
      },
      {
        key: "finance.funding-pack.draft",
        name: "Draft a finance readiness pack",
        description:
          "Collects ledger evidence into a draft manifest and marks missing review items; it cannot certify or export the pack.",
        mode: "draft",
        requiredPermission: "accounts.ledger.read",
        allowedAgents: ["RASP"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({
              asOf: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .default("2026-07-20"),
            })
            .parse(input),
        execute: async (input: Record<string, unknown>) => ({
          asOf: input.asOf,
          trialBalance: await this.accounts.trialBalance(input.asOf as string),
          vouchers: await this.accounts.listVouchers(100),
          status: "draft_requires_human_review",
        }),
      },
      {
        key: "quality.inspections.read",
        name: "Read inspection and disposition evidence",
        description:
          "Returns tenant-scoped measured inspection evidence through QualityService.",
        mode: "read",
        requiredPermission: "quality.inspection.read",
        allowedAgents: ["KILN"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({ limit: z.number().int().min(1).max(100).default(50) })
            .parse(input),
        execute: async (input: Record<string, unknown>) =>
          this.quality.listInspections(input.limit as number),
      },
      {
        key: "quality.evidence.collect",
        name: "Collect traceable QMS evidence",
        description:
          "Collects inspection evidence into a draft audit view while preserving its source references.",
        mode: "analyse",
        requiredPermission: "quality.inspection.read",
        allowedAgents: ["KILN"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z
            .object({
              scope: z
                .string()
                .min(2)
                .max(160)
                .default("current QMS readiness"),
              limit: z.number().int().min(1).max(100).default(100),
            })
            .parse(input),
        execute: async (input: Record<string, unknown>) => ({
          scope: input.scope,
          evidence: await this.quality.listInspections(input.limit as number),
          boundary:
            "Evidence collection only. KILN cannot declare conformity or close a finding.",
        }),
      },
      {
        key: "quality.audit-plan.draft",
        name: "Draft an evidence-linked audit plan",
        description:
          "Uses recorded quality evidence to prepare a draft checklist for an auditor to review.",
        mode: "draft",
        requiredPermission: "quality.inspection.read",
        allowedAgents: ["KILN"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z.object({ scope: z.string().min(2).max(160) }).parse(input),
        execute: async (input: Record<string, unknown>) => ({
          scope: input.scope,
          inspectionEvidence: await this.quality.listInspections(100),
          status: "draft_requires_auditor_review",
        }),
      },
      {
        key: "quality.capa-plan.draft",
        name: "Draft a corrective-action investigation",
        description:
          "Finds relevant inspection evidence and prepares questions for human root-cause and action review.",
        mode: "draft",
        requiredPermission: "quality.inspection.read",
        allowedAgents: ["KILN"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z.object({ finding: z.string().min(2).max(240) }).parse(input),
        execute: async (input: Record<string, unknown>) => ({
          finding: input.finding,
          inspectionEvidence: await this.quality.listInspections(100),
          boundary:
            "Investigation draft only. A human confirms root cause, approves actions and decides closure.",
        }),
      },
      {
        key: "quality.audit-pack.draft",
        name: "Draft a versioned audit evidence pack",
        description:
          "Creates a draft evidence manifest with explicit gaps for human review and HEXA verification.",
        mode: "draft",
        requiredPermission: "quality.inspection.read",
        allowedAgents: ["KILN"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) =>
          z.object({ scope: z.string().min(2).max(160) }).parse(input),
        execute: async (input: Record<string, unknown>) => ({
          scope: input.scope,
          evidence: await this.quality.listInspections(100),
          status: "draft_requires_quality_approval_and_hexa_verification",
        }),
      },
      {
        key: "managed-services.service-assurance.read",
        name: "Read the managed-service assurance view",
        description:
          "Returns RELAY's service catalogue, lifecycle, incidents, changes, service review and non-overlapping responsibility map.",
        mode: "read",
        requiredPermission: "managed_services.overview.read",
        allowedAgents: ["RELAY"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) => z.object({}).parse(input),
        execute: async () => managedServiceDemoSnapshot(),
      },
      {
        key: "platform-health.status.read",
        name: "Read private platform-health evidence",
        description:
          "Returns ACHILES' latest deterministic checks and tenant-fenced history. It does not expose customer data or perform a repair.",
        mode: "read",
        requiredPermission: "platform_health.overview.read",
        allowedAgents: ["ACHILES"],
        executionBoundary: "domain_service",
        sideEffecting: false,
        approvalRequired: false,
        parse: (input: unknown) => z.object({}).parse(input),
        execute: async () => this.platformHealth.overview(),
      },
      {
        key: "agent.action.dispatch",
        name: "Dispatch an approved governed action",
        description:
          "Creates an immutable, attributable domain work item after a human approval gate. It does not call an external connector or grant a model direct database access.",
        mode: "execute",
        requiredPermission: "agentos.run.operate",
        allowedAgents: [
          "HEXA",
          "MICA",
          "SPAR",
          "AXLE",
          "KILN",
          "RASP",
          "RELAY",
        ],
        executionBoundary: "domain_service",
        sideEffecting: true,
        approvalRequired: true,
        parse: (input: unknown) =>
          z
            .object({
              targetDomain: z.string().min(2).max(80),
              actionType: z.string().min(2).max(100),
              title: z.string().min(5).max(240),
              risk: z.enum(["low", "medium", "high"]),
              payload: z.record(z.unknown()).default({}),
            })
            .parse(input),
        execute: async (
          input: Record<string, unknown>,
          context: CapabilityExecutionContext | undefined,
        ) => {
          if (!context?.approvalNodeId || !context.executionToken) {
            throw new AppError(
              "AGENT_ACTION_APPROVAL_REQUIRED",
              409,
              "A side-effecting agent action cannot execute without an approved graph ancestor.",
            );
          }
          return this.actions.dispatch({
            runId: context.runId,
            nodeId: context.nodeId,
            approvalNodeId: context.approvalNodeId,
            executionToken: context.executionToken,
            agentKey: context.agentKey,
            targetDomain: input.targetDomain as string,
            actionType: input.actionType as string,
            title: input.title as string,
            risk: input.risk as "low" | "medium" | "high",
            payload: input.payload as Record<string, unknown>,
          });
        },
      },
    ];
    this.capabilities = new Map(
      registered.map((capability) => [capability.key, capability]),
    );
  }

  list(): readonly CapabilityDescriptor[] {
    return [...this.capabilities.values()].map(
      ({ parse: _parse, execute: _execute, ...descriptor }) => descriptor,
    );
  }

  get(key: string): CapabilityDescriptor {
    const capability = this.capabilities.get(key);
    if (!capability) {
      throw new AppError(
        "CAPABILITY_NOT_REGISTERED",
        404,
        `Capability '${key}' is not registered.`,
      );
    }
    const { parse: _parse, execute: _execute, ...descriptor } = capability;
    return descriptor;
  }

  permissionByCapability(): ReadonlyMap<string, string> {
    return new Map(
      [...this.capabilities.values()].map((capability) => [
        capability.key,
        capability.requiredPermission,
      ]),
    );
  }

  currentActorPermissions(): Promise<ReadonlySet<string>> {
    return this.authorization.permissions();
  }

  async invoke(
    agentKey: AgentKey,
    key: string,
    rawInput: unknown,
    context?: Omit<CapabilityExecutionContext, "agentKey">,
  ): Promise<unknown> {
    const capability = this.capabilities.get(key);
    if (!capability) {
      throw new AppError(
        "CAPABILITY_NOT_REGISTERED",
        404,
        `Capability '${key}' is not registered.`,
      );
    }
    this.agents.assertCapabilityAllowed(agentKey, key);
    if (!capability.allowedAgents.includes(agentKey)) {
      throw new AppError(
        "AGENT_CAPABILITY_FORBIDDEN",
        403,
        `${agentKey} cannot invoke '${key}'.`,
      );
    }
    if (capability.sideEffecting && !capability.approvalRequired) {
      throw new AppError(
        "UNSAFE_CAPABILITY_CONFIGURATION",
        500,
        `Side-effecting capability '${key}' has no approval requirement.`,
      );
    }
    if (capability.sideEffecting && !context?.approvalNodeId) {
      throw new AppError(
        "AGENT_ACTION_APPROVAL_REQUIRED",
        409,
        `Side-effecting capability '${key}' has no approved graph ancestor.`,
      );
    }
    await this.authorization.require(capability.requiredPermission);
    const input = capability.parse(rawInput);
    return capability.execute(
      input,
      context ? { ...context, agentKey } : undefined,
    );
  }
}
