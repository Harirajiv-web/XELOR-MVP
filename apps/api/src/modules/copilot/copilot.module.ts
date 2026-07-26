import { Module } from "@nestjs/common";
import { CopilotController } from "./copilot.controller.js";
import { CopilotService } from "./copilot.service.js";

/**
 * COPILOT — read-only question answering over the tenant's own data.
 *
 * It imports NOTHING from another business module, and it exports nothing. That is not
 * tidiness: the copilot reads tables directly through hand-written queries rather than
 * calling other modules' services, precisely so it cannot reach a method that writes. A
 * dependency on SalesService would put `createOrder` one typo away from a feature whose
 * entire promise is that it cannot create anything.
 *
 * Its only collaborators are the shared audit log and the @Global AI router — and the
 * router is optional at runtime: with AI off, the deterministic path answers everything.
 */
@Module({
  controllers: [CopilotController],
  providers: [CopilotService],
})
export class CopilotModule {}
