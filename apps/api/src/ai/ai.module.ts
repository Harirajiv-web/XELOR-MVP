import { Global, Module } from "@nestjs/common";
import { AI_GOVERNANCE, AI_PROVIDER, AI_ROUTER } from "./ai.tokens.js";
import { StubProvider } from "./stub.provider.js";
import { AllowAllGovernance } from "./allow-all.governance.js";
import { AiActionLogService } from "./ai-action-log.service.js";
import { AiRouterService } from "./ai-router.service.js";

/**
 * The shared AI spine, made GLOBAL so every business module can inject AI_ROUTER
 * without importing this module (the same way common/ infrastructure is shared).
 *
 * Provider selection is config, not code: AI_PROVIDER binds to the offline StubProvider
 * today (zero model spend); pointing it at an OpenAI/Gemini/Claude adapter is a one-line
 * swap here. AI_GOVERNANCE binds to the permissive placeholder until A2 lands the real
 * kill-switch / opt-out / budget implementation.
 */
@Global()
@Module({
  providers: [
    StubProvider,
    { provide: AI_PROVIDER, useExisting: StubProvider },
    { provide: AI_GOVERNANCE, useClass: AllowAllGovernance },
    AiActionLogService,
    AiRouterService,
    { provide: AI_ROUTER, useExisting: AiRouterService },
  ],
  // StubProvider is exported so a feature can register its offline responder; AI_ROUTER
  // is what modules actually inject.
  exports: [AI_ROUTER, AI_PROVIDER, AI_GOVERNANCE, StubProvider, AiActionLogService],
})
export class AiModule {}
