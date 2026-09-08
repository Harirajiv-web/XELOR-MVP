import type { AnyEvalSpec, EvalSpec, MulticlassEvalSpec } from "./harness.js";

/**
 * The registry of eval specs, keyed by feature_key. A feature registers its golden-set
 * gate here; the `eval` CLI runs it in CI. Populated by side-effect imports in specs.ts.
 *
 * Two shapes live side by side: binary gates (is this a duplicate?) and multi-class gates
 * (which of eight categories is this?). They are registered through separate functions so
 * a feature cannot accidentally register a multi-class predictor against a binary scorer
 * and post an F1 that means nothing.
 */
const specs = new Map<string, AnyEvalSpec>();

export function registerEvalSpec<I>(spec: EvalSpec<I>): void {
  specs.set(spec.featureKey, spec as unknown as AnyEvalSpec);
}

export function registerMulticlassEvalSpec<I>(spec: MulticlassEvalSpec<I>): void {
  specs.set(spec.featureKey, spec as unknown as AnyEvalSpec);
}

export function getEvalSpec(key: string): AnyEvalSpec | undefined {
  return specs.get(key);
}

export function listEvalSpecs(): string[] {
  return [...specs.keys()];
}
