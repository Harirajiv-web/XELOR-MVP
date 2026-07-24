import { Inject, Injectable } from "@nestjs/common";
import {
  AppError,
  requireRoutableFeature,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
} from "@ind-core/platform";
import { AI_GOVERNANCE, AI_PROVIDER } from "./ai.tokens.js";
import type { AiGovernance } from "./governance.port.js";
import { AiActionLogService } from "./ai-action-log.service.js";

/**
 * The one doorway every AI call passes through (DECISIONS-V2 §1.4, §4). Thin by
 * design — it does exactly four things, in order:
 *   1. REJECT any feature not in the closed registry (§4.2).
 *   2. ASK governance (kill switch / opt-out / budget) before spending a token (§4.3).
 *   3. ROUTE to the configured provider (offline stub in dev; a real model in prod).
 *   4. LOG the call to the hash-chained ai_action_log — refusals included (§4.3).
 * It never contains business logic: what a result MEANS is the owning module's job.
 */
@Injectable()
export class AiRouterService {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    @Inject(AI_GOVERNANCE) private readonly governance: AiGovernance,
    private readonly log: AiActionLogService,
  ) {}

  async complete<T = unknown>(req: AiCompletionRequest): Promise<AiCompletionResult<T>> {
    const feature = requireRoutableFeature(req.featureKey); // throws AI_FEATURE_NOT_REGISTERED
    const tier = req.tier ?? "small";

    const gate = await this.governance.check(feature.key);
    if (!gate.allowed) {
      // A refusal is itself an auditable AI action — record it, then fail closed so the
      // caller can drop to the feature's deterministic degraded mode.
      await this.log.append({
        featureKey: feature.key,
        input: req.input,
        output: null,
        model: null,
        tier,
        usage: { inputTokens: 0, outputTokens: 0 },
        degraded: true,
        decision: { refused: gate.reason ?? "governance" },
      });
      throw new AppError(
        "AI_REFUSED",
        403,
        `AI call for '${feature.key}' was refused (${gate.reason ?? "governance"}).`,
      );
    }

    const result = await this.provider.complete<T>(req);

    await this.log.append({
      featureKey: feature.key,
      input: req.input,
      output: result.output,
      model: result.model,
      tier: result.tier,
      usage: result.usage,
      degraded: result.degraded ?? false,
    });
    await this.governance.recordUsage(feature.key, result.usage);

    return result;
  }
}
