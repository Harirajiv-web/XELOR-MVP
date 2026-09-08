import { Module } from "@nestjs/common";
import { GeneralController } from "./general.controller.js";
import { GeneralService } from "./general.service.js";

/**
 * GENERAL (HEXA) — the platform foundation + master data module. This is the first
 * of the sixteen ERP-domain modules; siblings will follow the same shape and be
 * wired in AppModule. Cross-module access to GENERAL is only ever via this module's
 * exported providers (public surface) or its outbox events — never a deep import
 * (enforced by the boundary lint in eslint.config.js).
 */
@Module({
  controllers: [GeneralController],
  providers: [GeneralService],
  exports: [GeneralService],
})
export class GeneralModule {}
