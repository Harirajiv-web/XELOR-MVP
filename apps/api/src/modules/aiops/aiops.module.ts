import { Module } from "@nestjs/common";
import { AiOpsController } from "./aiops.controller.js";
import { AiRegistryService } from "./registry.service.js";
import { AiPromptService } from "./prompt.service.js";
import { AiOperationsService } from "./operations.service.js";

/**
 * AI OPERATIONS (ONYX, Module 16) — the control plane for the AI itself.
 *
 * The platform already had the mechanism: a router, a closed 8-feature registry, a
 * hash-chained action log, per-tenant governance. This module is the operations plane over
 * it — rollout, routing, prompts, evals, guardrails, human review, cost, drift, evidence
 * and the switch.
 *
 * One rule underlies all of it: **the AI cannot ship itself.** Every promotion, rollout and
 * rollback is a human action with a name and a reason. There is deliberately no endpoint to
 * force a promotion, none to bypass a guardrail, and none that lets this module act on
 * business data — the absence of those routes is how the rule is enforced rather than
 * merely written down.
 */
@Module({
  controllers: [AiOpsController],
  providers: [AiRegistryService, AiPromptService, AiOperationsService],
  exports: [AiRegistryService, AiOperationsService],
})
export class AiOpsModule {}
