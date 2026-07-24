import { Module } from "@nestjs/common";
import { EngineeringController } from "./engineering.controller.js";
import { BomController } from "./bom.controller.js";
import { EngineeringService } from "./engineering.service.js";

/**
 * ENGINEERING (AXLE, Module 02) — item master + BOM. The second ERP-domain module,
 * built on the same platform patterns as GENERAL and reusing the shared master-dedup
 * brain (from the AI spine) for item duplicate detection. AuditLogService and
 * DedupExplainer are provided globally by the AI spine, so nothing is redeclared here.
 */
@Module({
  controllers: [EngineeringController, BomController],
  providers: [EngineeringService],
  exports: [EngineeringService],
})
export class EngineeringModule {}
