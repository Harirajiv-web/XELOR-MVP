import { Module } from "@nestjs/common";
import { AdministrationController } from "./administration.controller.js";
import { AccessService } from "./access.service.js";
import { SodService } from "./sod.service.js";
import { ComplianceService } from "./compliance.service.js";
import { PlatformOpsService } from "./platform-ops.service.js";

/**
 * ADMINISTRATION (HEXA, Module 14) — the control plane.
 *
 * It provides no port, and that is the point. Every other module consumes the control
 * plane through primitives that already exist — the `PermissionGuard`, the tenant
 * middleware, `AuditLogService` — rather than by calling this module. A control plane other
 * modules can call is a control plane other modules can be persuaded to call differently.
 *
 * The AI spine is @Global, which is where `SodExplainer` (AI #8) comes from.
 */
@Module({
  controllers: [AdministrationController],
  providers: [AccessService, SodService, ComplianceService, PlatformOpsService],
  exports: [AccessService, ComplianceService],
})
export class AdministrationModule {}
