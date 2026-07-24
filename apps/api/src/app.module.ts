import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { TenantMiddleware } from "./common/tenant.middleware.js";
import { GeneralModule } from "./modules/general/general.module.js";

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
  imports: [GeneralModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
