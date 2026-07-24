import { Injectable } from "@nestjs/common";
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from "@ind-core/platform";

/** Rough token estimate — deterministic, good enough for budget accounting in dev. */
function approxTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? "").length / 4);
}

/**
 * The OFFLINE provider (DECISIONS-V2 §1.4). Runs with ZERO model spend so the whole
 * platform works on a laptop with no API keys — the user's cost constraint. Each
 * feature registers a DETERMINISTIC responder that turns its structured evidence into
 * the shape a real model would return (for our first brain, a plain-language
 * explanation). Swap `AI_PROVIDER` for an OpenAI/Gemini/Claude adapter in prod; not a
 * single module changes, because everyone talks to the router, not the provider.
 */
@Injectable()
export class StubProvider implements AiProvider {
  readonly name = "stub-deterministic";
  private readonly responders = new Map<string, (input: unknown) => unknown>();

  /** A feature contributes how the offline brain "answers" for its key. */
  register(featureKey: string, responder: (input: unknown) => unknown): void {
    this.responders.set(featureKey, responder);
  }

  async complete<T = unknown>(req: AiCompletionRequest): Promise<AiCompletionResult<T>> {
    const responder = this.responders.get(req.featureKey);
    const output = responder
      ? responder(req.input)
      : { note: `stub: no responder registered for ${req.featureKey}`, echo: req.input };
    return {
      output: output as T,
      model: this.name,
      tier: req.tier ?? "small",
      usage: { inputTokens: approxTokens(req.input), outputTokens: approxTokens(output) },
      degraded: false,
    };
  }
}
