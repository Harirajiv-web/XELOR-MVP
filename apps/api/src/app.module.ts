import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TenantMiddleware } from "./common/tenant.middleware.js";
import { PermissionGuard } from "./common/permission.guard.js";
import { CommonModule } from "./common/common.module.js";
import { AiModule } from "./ai/ai.module.js";
import { GeneralModule } from "./modules/general/general.module.js";
import { WorkflowModule } from "./modules/workflow/workflow.module.js";
import { EngineeringModule } from "./modules/engineering/engineering.module.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";
import { PurchaseModule } from "./modules/purchase/purchase.module.js";
import { ProductionModule } from "./modules/production/production.module.js";
import { QualityModule } from "./modules/quality/quality.module.js";
import { SalesModule } from "./modules/sales/sales.module.js";
import { AccountsModule } from "./modules/accounts/accounts.module.js";
import { HrmModule } from "./modules/hrm/hrm.module.js";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module.js";
import { CspModule } from "./modules/csp/csp.module.js";
import { ExpenditureModule } from "./modules/expenditure/expenditure.module.js";
import { PlanningModule } from "./modules/planning/planning.module.js";
import { AdministrationModule } from "./modules/administration/administration.module.js";
import { IntegrationModule } from "./modules/integration/integration.module.js";
import { DataImportModule } from "./modules/dataimport/dataimport.module.js";
import { AiOpsModule } from "./modules/aiops/aiops.module.js";
import { CopilotModule } from "./modules/copilot/copilot.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { FulfilmentModule } from "./fulfilment/fulfilment.module.js";
import { AgentOsModule } from "./agent-os/agent-os.module.js";
import { ManagedServicesModule } from "./modules/managed-services/managed-services.module.js";
import { PlatformHealthModule } from "./modules/platform-health/platform-health.module.js";
import { HealthController } from "./health.controller.js";
import { ServerlessWorkerController } from "./serverless-worker.controller.js";

/**
 * The single deployable modular monolith (DECISIONS-V2 §1.1). Each ERP domain is
 * one Nest module; they compose here. The tenant middleware fences EVERY route to
 * a tenant context before any handler runs.
 *
 * Build order (per the ranking): GENERAL → ADMINISTRATION → ENGINEERING → INVENTORY
 * → PURCHASE → PRODUCTION → INSPECTION → SMBD → ACCOUNTS → PLANNING → HRM →
 * MAINTENANCE → EXPENDITURE → CSP → INTEGRATION → AI-OPERATIONS.
 */
@Module({
  // AiModule is @Global — the shared AI spine (router, governance, hash-chained
  // ai_action_log) every module's "brain" injects. Listed first so it is available
  // platform-wide before the business modules load.
  imports: [
    // Cross-cutting infrastructure (document numbering). @Global, listed first so it is
    // available before any business module resolves.
    CommonModule,
    AiModule,
    GeneralModule,
    WorkflowModule,
    EngineeringModule,
    InventoryModule,
    PurchaseModule,
    QualityModule,
    ProductionModule,
    // Accounts is listed before Sales: SMBD depends on the ledger port, never the reverse.
    AccountsModule,
    SalesModule,
    // HRM likewise depends on the ledger port to post payroll — never the reverse.
    HrmModule,
    // Maintenance depends on the stock, item and workflow ports, and on nothing else.
    MaintenanceModule,
    // CSP is the only internet-facing module. It mounts TWO route prefixes with disjoint
    // guards — `/api/v1/csp` for staff and `/api/v1/portal` for customers — and depends on
    // the item port, the AI router and the outbox, and on nothing else.
    CspModule,
    // Expenditure depends on the AI router and the outbox, and writes no GL row itself —
    // it hands Accounts a posting instruction and Accounts posts it.
    ExpenditureModule,
    PlanningModule,
    AdministrationModule,
    IntegrationModule,
    // Spreadsheet import. Sits beside Integration because a factory's Excel file IS one of
    // its integrations; it imports no other module and posts every row through the entity's
    // own endpoint, so removing this line removes the feature and nothing else.
    DataImportModule,
    AiOpsModule,
    // Read-only, last: they depend on nothing and nothing depends on them.
    CopilotModule,
    // Governed execution layer above the ERP kernel. It calls domain services only through
    // registered capabilities; models never receive a database handle.
    AgentOsModule,
    FulfilmentModule,
    // RELAY's service-management control plane. The MVP endpoint is an explicitly labelled
    // operating-model snapshot; live telemetry and ITSM transports remain Integration work.
    ManagedServicesModule,
    // ACHILES private platform assurance. Deterministic, read-only probes with an hourly
    // scheduler entrypoint and tenant-fenced history; never customer-facing by default.
    PlatformHealthModule,
    // GET /me — the bootstrap every front end calls before it draws anything.
    IdentityModule,
  ],
  controllers: [HealthController, ServerlessWorkerController],
  // Global RBAC gate — routes opt in with @RequirePermission; unguarded routes pass.
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // `{*path}` is path-to-regexp v8's named catch-all. The bare `*` this used to be was
    // silently auto-converted by Nest 11 with a deprecation warning on every boot.
    consumer.apply(TenantMiddleware).forRoutes("{*path}");
  }
}
