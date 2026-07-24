import type { EvalSpec } from "./harness.js";

/**
 * The registry of eval specs, keyed by feature_key. A feature registers its golden-set
 * gate here; the `eval` CLI runs it in CI. Populated by side-effect imports in specs.ts.
 */
const specs = new Map<string, EvalSpec<unknown>>();

export function registerEvalSpec<I>(spec: EvalSpec<I>): void {
  specs.set(spec.featureKey, spec as unknown as EvalSpec<unknown>);
}

export function getEvalSpec(key: string): EvalSpec<unknown> | undefined {
  return specs.get(key);
}

export function listEvalSpecs(): string[] {
  return [...specs.keys()];
}
