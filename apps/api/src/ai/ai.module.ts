import { Global, Module } from "@nestjs/common";
import { AI_GOVERNANCE, AI_PROVIDER, AI_ROUTER } from "./ai.tokens.js";
import { StubProvider } from "./stub.provider.js";
import { AiActionLogService } from "./ai-action-log.service.js";
import { AiRouterService } from "./ai-router.service.js";
import { DbAiGovernance } from "./db.governance.js";
import { GovernanceController } from "./governance.controller.js";
import { AuditLogService } from "../common/audit-log.service.js";

/**
 * The shared AI spine, made GLOBAL so every business module can inject AI_ROUTER
 * without importing this module (the same way common/ infrastructure is shared).
 *
 * Provider selection is config, not code: AI_PROVIDER binds to the offline StubProvider
 * today (zero model spend); pointing it at an OpenAI/Gemini/Claude adapter is a one-line
 * swap here. AI_GOVERNANCE binds to the real DB-backed kill-switch / opt-out / budget
 * implementation (A2), audited via the shared AuditLogService.
 */
@Global()
@Module({
  controllers: [GovernanceController],
  providers: [
    StubProvider,
    { provide: AI_PROVIDER, useExisting: StubProvider },
    AuditLogService,
    DbAiGovernance,
    { provide: AI_GOVERNANCE, useExisting: DbAiGovernance },
    AiActionLogService,
    AiRouterService,
    { provide: AI_ROUTER, useExisting: AiRouterService },
  ],
  exports: [AI_ROUTER, AI_PROVIDER, AI_GOVERNANCE, StubProvider, AiActionLogService, AuditLogService],
})
export class AiModule {}
