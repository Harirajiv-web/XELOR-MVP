import { Injectable, Logger } from "@nestjs/common";
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from "@ind-core/platform";
import { StubProvider } from "./stub.provider.js";

/**
 * The EDGE-tier provider: a model running ON the plant's own machine via Ollama
 * (DECISIONS-V2 §1.4 — provider-agnostic router, §3 data residency).
 *
 * Why local first: nothing leaves the site, there is no per-call cost, and it makes the
 * EDGE tier of the CLOUD / HYBRID / EDGE story demonstrable rather than aspirational.
 * The router, governance, budget and hash-chained log are identical whichever provider
 * is bound — swapping to a hosted model is a binding change in AiModule, nothing else.
 *
 * SAFETY: a feature's PromptPack does the prompt assembly AND validates the reply. If the
 * model is unreachable, slow, or returns something the pack rejects, we fall back to the
 * deterministic StubProvider and flag `degraded` — the ERP never blocks on a model.
 */

/** How one feature talks to a real model. Owned by the feature, not by the provider. */
export interface PromptPack<I = unknown, O = unknown> {
  /** The instruction. Keep it narrow — the model phrases, it never concludes. */
  system: string;
  /** Turn the structured task input into the user message. */
  buildUser(input: I): string;
  /**
   * Turn raw model text into the feature's output shape. MUST throw if the text is
   * ungrounded or malformed — the provider then degrades to the deterministic answer.
   */
  parse(text: string, input: I): O;
}

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen2.5:3b";
const DEFAULT_TIMEOUT_MS = 20_000;

@Injectable()
export class OllamaProvider implements AiProvider {
  readonly name = "ollama";
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly packs = new Map<string, PromptPack>();

  constructor(private readonly fallback: StubProvider) {}

  /** A feature contributes how it prompts and validates a real model. */
  register<I, O>(featureKey: string, pack: PromptPack<I, O>): void {
    this.packs.set(featureKey, pack as PromptPack);
  }

  private get baseUrl(): string {
    return process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
  }

  /** `premium` may point at a larger local model — the HYBRID tier lever (§1.4). */
  private modelFor(tier: string): string {
    if (tier === "premium") {
      return process.env.OLLAMA_MODEL_PREMIUM ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
    }
    return process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  }

  private get timeoutMs(): number {
    const raw = Number(process.env.OLLAMA_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
  }

  async complete<T = unknown>(req: AiCompletionRequest): Promise<AiCompletionResult<T>> {
    const tier = req.tier ?? "small";
    const pack = this.packs.get(req.featureKey);
    // No prompt pack means this feature has not been cleared for a live model yet —
    // deterministic answer, marked degraded so the log shows AI did not really run.
    if (!pack) return this.degrade<T>(req, "no_prompt_pack");

    const model = this.modelFor(tier);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          options: { temperature: 0.1 },
          messages: [
            { role: "system", content: req.system ?? pack.system },
            { role: "user", content: pack.buildUser(req.input) },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);

      const body = (await res.json()) as OllamaChatResponse;
      const text = body.message?.content ?? "";
      // parse() enforces grounding; a throw here means the model said something we will
      // not show a user, so we fall through to the deterministic answer.
      const output = pack.parse(text, req.input) as T;

      return {
        output,
        model,
        tier,
        usage: {
          inputTokens: body.prompt_eval_count ?? 0,
          outputTokens: body.eval_count ?? 0,
        },
        degraded: false,
      };
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      this.logger.warn(`local model '${model}' unusable for ${req.featureKey} (${why}) — degrading`);
      return this.degrade<T>(req, why);
    }
  }

  /** Deterministic answer + degraded flag, so the feature still works with no model. */
  private async degrade<T>(req: AiCompletionRequest, _why: string): Promise<AiCompletionResult<T>> {
    const r = await this.fallback.complete<T>(req);
    return { ...r, model: `${this.name}:degraded->${r.model}`, degraded: true };
  }
}
