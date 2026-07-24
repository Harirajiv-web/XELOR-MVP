/**
 * Provider-agnostic AI types (DECISIONS-V2 §1.4). The router is THIN by design —
 * task-level model routing, not a capability-abstracting gateway. Concrete providers
 * (an offline stub for dev; OpenAI / Gemini / Claude in prod) implement `AiProvider`;
 * everything else in the platform speaks only these interfaces.
 */

/** Small = the default cheap tier; premium = the routed Claude-class tier (§1.4). */
export type AiModelTier = "small" | "premium";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

/** One call into the router: a registered feature + its structured task input. */
export interface AiCompletionRequest {
  featureKey: string;
  /** Structured task input the provider adapter turns into a prompt. */
  input: unknown;
  /** Optional system instruction; prompt assembly is the adapter's business. */
  system?: string;
  /** Preferred tier; the router may downgrade for cost or upgrade for a hard task. */
  tier?: AiModelTier;
}

export interface AiCompletionResult<T = unknown> {
  /** The model's output, already parsed into structure by the adapter. */
  output: T;
  /** Concrete model id actually used, e.g. "stub-deterministic", "gpt-5-nano". */
  model: string;
  tier: AiModelTier;
  usage: AiUsage;
  /** True when a fallback/degraded path produced this (surfaced in the record). */
  degraded?: boolean;
}

/**
 * A completion backend. Adapters are the ONLY code that talks to a model vendor, so
 * swapping providers (or running fully offline via the stub) never touches a module.
 */
export interface AiProvider {
  readonly name: string;
  complete<T = unknown>(req: AiCompletionRequest): Promise<AiCompletionResult<T>>;
}
