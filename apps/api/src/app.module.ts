import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TenantMiddleware } from "./common/tenant.middleware.js";
import { PermissionGuard } from "./common/permission.guard.js";
import { GeneralModule } from "./modules/general/general.module.js";
import { WorkflowModule } from "./modules/workflow/workflow.module.js";

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
  imports: [GeneralModule, WorkflowModule],
  // Global RBAC gate — routes opt in with @RequirePermission; unguarded routes pass.
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
