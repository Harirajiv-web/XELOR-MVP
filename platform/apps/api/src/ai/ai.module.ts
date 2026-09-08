import { Global, Logger, Module } from "@nestjs/common";
import type { AiProvider } from "@ind-core/platform";
import { AI_GOVERNANCE, AI_PROVIDER, AI_ROUTER } from "./ai.tokens.js";
import { StubProvider } from "./stub.provider.js";
import { OllamaProvider } from "./ollama.provider.js";
import { AiActionLogService } from "./ai-action-log.service.js";
import { AiRouterService } from "./ai-router.service.js";
import { DbAiGovernance } from "./db.governance.js";
import { GovernanceController } from "./governance.controller.js";
import { DedupExplainer } from "./dedup-explainer.js";
import { PayslipExplainer } from "./payslip-explainer.js";
import { TicketTriage } from "./ticket-triage.js";
import { ReplyDrafter } from "./reply-drafter.js";
import { ReceiptExtractor } from "./receipt-extractor.js";
import { SodExplainer } from "./sod-explainer.js";
import { AuditLogService } from "../common/audit-log.service.js";

/**
 * Provider selection is CONFIG, not code (DECISIONS-V2 §1.4). `AI_PROVIDER=ollama` binds
 * the EDGE-tier local model; anything else (or unset) keeps the zero-spend offline stub,
 * so CI and a laptop with nothing running still behave deterministically. A hosted
 * CLOUD-tier adapter slots in here the same way — no business module changes.
 */
function selectProvider(stub: StubProvider, ollama: OllamaProvider): AiProvider {
  const choice = (process.env.AI_PROVIDER ?? "stub").toLowerCase();
  const chosen = choice === "ollama" ? ollama : stub;
  new Logger("AiModule").log(`AI provider: ${chosen.name} (AI_PROVIDER=${choice})`);
  return chosen;
}

/**
 * The shared AI spine, made GLOBAL so every business module can inject AI_ROUTER
 * without importing this module (the same way common/ infrastructure is shared).
 *
 * AI_GOVERNANCE binds to the real DB-backed kill-switch / opt-out / budget implementation
 * (A2), audited via the shared AuditLogService.
 */
@Global()
@Module({
  controllers: [GovernanceController],
  providers: [
    StubProvider,
    OllamaProvider,
    { provide: AI_PROVIDER, useFactory: selectProvider, inject: [StubProvider, OllamaProvider] },
    AuditLogService,
    DbAiGovernance,
    { provide: AI_GOVERNANCE, useExisting: DbAiGovernance },
    AiActionLogService,
    AiRouterService,
    { provide: AI_ROUTER, useExisting: AiRouterService },
    DedupExplainer,
    PayslipExplainer,
    // CSP's two: AI #3 (committed, Tier-1) and AI #6 (stretch, Tier-2). Both degrade to
    // `feature_hidden`, which is implemented literally — a suppressed suggestion and a
    // hidden button, not a guess with a lower confidence printed next to it.
    TicketTriage,
    ReplyDrafter,
    // AI #1 — the flagship. Committed, Tier-2, and the only one whose output is money,
    // which is why its arithmetic is re-derived rather than trusted.
    ReceiptExtractor,
    SodExplainer,
  ],
  exports: [
    AI_ROUTER,
    AI_PROVIDER,
    AI_GOVERNANCE,
    StubProvider,
    OllamaProvider,
    AiActionLogService,
    AuditLogService,
    DedupExplainer,
    PayslipExplainer,
    TicketTriage,
    ReplyDrafter,
    ReceiptExtractor,
    SodExplainer,
  ],
})
export class AiModule {}
