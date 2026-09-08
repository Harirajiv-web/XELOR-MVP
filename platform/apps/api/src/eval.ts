import { getEvalSpec, listEvalSpecs } from "./ai/eval/registry.js";
import { runAnyEval, type AnyScorecard } from "./ai/eval/harness.js";
import "./ai/eval/specs.js"; // side-effect: register all feature eval specs

/**
 * The ship-gate CLI (DECISIONS-V2 §4.1). Runs a feature's golden set and exits 0 on
 * PASS, 1 on FAIL — so CI blocks promotion of a feature that doesn't beat its
 * deterministic baseline (or regresses a must-pass assertion).
 *
 *   node dist/src/eval.js <feature_key>     (pnpm --filter @ind-core/api eval <key>)
 */
function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function report(sc: AnyScorecard): void {
  console.log(`\nEval gate — ${sc.featureKey}  (dataset ${sc.datasetVersion}, ${sc.cases} cases)`);
  if (sc.kind === "multiclass") {
    console.log(`  baseline   macro-F1=${sc.baseline.macroF1.toFixed(3)}  accuracy=${pct(sc.baseline.accuracy)}`);
    console.log(`  candidate  macro-F1=${sc.candidate.macroF1.toFixed(3)}  accuracy=${pct(sc.candidate.accuracy)}`);
    // Per-class, because a headline macro-F1 hides WHICH class the classifier is bad at,
    // and that is the only part of the number an engineer can act on.
    for (const c of sc.candidate.perClass) {
      console.log(
        `             ${c.label.padEnd(16)} P=${pct(c.precision)} R=${pct(c.recall)} F1=${c.f1.toFixed(3)} (n=${c.support})`,
      );
    }
  } else {
    console.log(
      `  baseline   P=${pct(sc.baseline.precision)} R=${pct(sc.baseline.recall)} F1=${sc.baseline.f1.toFixed(3)}  conf=${JSON.stringify(sc.baseline.confusion)}`,
    );
    console.log(
      `  candidate  F1=${sc.candidate.f1.toFixed(3)} (P=${pct(sc.candidate.precision)} R=${pct(sc.candidate.recall)})  conf=${JSON.stringify(sc.candidate.confusion)}`,
    );
  }
  console.log(`  delta      ${sc.verdict.delta >= 0 ? "+" : ""}${sc.verdict.delta.toFixed(3)}`);
  if (sc.mustPassFailures.length) console.log(`  must-pass  FAILED: ${sc.mustPassFailures.join(", ")}`);
  console.log(`  verdict    ${sc.verdict.pass ? "PASS ✓" : "FAIL ✗"}`);
  for (const r of sc.verdict.reasons) console.log(`             - ${r}`);
}

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

  const sc = await runAnyEval(spec);
  report(sc);
  process.exit(sc.verdict.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
