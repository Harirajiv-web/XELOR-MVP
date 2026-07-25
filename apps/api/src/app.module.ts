import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TenantMiddleware } from "./common/tenant.middleware.js";
import { PermissionGuard } from "./common/permission.guard.js";
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
  ],
  // Global RBAC gate — routes opt in with @RequirePermission; unguarded routes pass.
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
