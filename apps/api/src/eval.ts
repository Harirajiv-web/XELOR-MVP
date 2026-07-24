import { getEvalSpec, listEvalSpecs } from "./ai/eval/registry.js";
import { runEval } from "./ai/eval/harness.js";
import "./ai/eval/specs.js"; // side-effect: register all feature eval specs

/**
 * The ship-gate CLI (DECISIONS-V2 §4.1). Runs a feature's golden set and exits 0 on
 * PASS, 1 on FAIL — so CI blocks promotion of a feature that doesn't beat its
 * deterministic baseline (or regresses a must-pass assertion).
 *
 *   node dist/src/eval.js <feature_key>     (pnpm --filter @ind-core/api eval <key>)
 */
async function main(): Promise<void> {
  const key = process.argv[2];
  const known = listEvalSpecs();
  if (!key) {
    console.error(`usage: eval <feature_key>\nknown gates: ${known.join(", ") || "(none registered yet)"}`);
    process.exit(2);
  }
  const spec = getEvalSpec(key);
  if (!spec) {
    console.error(`no eval gate registered for '${key}'.\nknown gates: ${known.join(", ") || "(none)"}`);
    process.exit(2);
  }

  const sc = await runEval(spec);
  const pct = (n: number): string => (n * 100).toFixed(1) + "%";
  console.log(`\nEval gate — ${sc.featureKey}  (dataset ${sc.datasetVersion}, ${sc.cases} cases)`);
  console.log(
    `  baseline   P=${pct(sc.baseline.precision)} R=${pct(sc.baseline.recall)} F1=${sc.baseline.f1.toFixed(3)}  conf=${JSON.stringify(sc.baseline.confusion)}`,
  );
  console.log(
    `  candidate  F1=${sc.candidate.f1.toFixed(3)} (P=${pct(sc.candidate.precision)} R=${pct(sc.candidate.recall)})  conf=${JSON.stringify(sc.candidate.confusion)}`,
  );
  console.log(`  delta      ${sc.verdict.delta >= 0 ? "+" : ""}${sc.verdict.delta.toFixed(3)}`);
  if (sc.mustPassFailures.length) console.log(`  must-pass  FAILED: ${sc.mustPassFailures.join(", ")}`);
  console.log(`  verdict    ${sc.verdict.pass ? "PASS ✓" : "FAIL ✗"}`);
  for (const r of sc.verdict.reasons) console.log(`             - ${r}`);
  process.exit(sc.verdict.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
