import {
  checkGrounding,
  decideDuplicateVerdict,
  detectDuplicates,
  type DedupConclusion,
  type MasterRecord,
} from "@ind-core/platform";
import { StubProvider } from "./ai/stub.provider.js";
import { OllamaProvider } from "./ai/ollama.provider.js";
import { DedupExplainer } from "./ai/dedup-explainer.js";
import type { AiRouterService } from "./ai/ai-router.service.js";

/**
 * The GROUNDING gate for general.master_dedup (DECISIONS-V2 §4.1, §4.3).
 *
 * The F1 gate (`pnpm eval general.master_dedup`) grades the DETECTOR — does it find the
 * duplicates. This gate grades the EXPLANATION — is what we put in front of a human true.
 * It exists because a local 3B model was measured inventing an identifier and reversing a
 * conclusion (see packages/platform/src/masterdata/dedup-verdict.ts). Rules:
 *
 *   1. every conclusion must match the code-decided expectation (the model cannot move it);
 *   2. no note may contain a value that is not in the evidence;
 *   3. no note may contradict its own headline.
 *
 * Exits 1 on any violation, so CI can block a provider that is not safe to ship.
 * Runs against whatever AI_PROVIDER is set to — `stub` (offline) or `ollama` (local model).
 */

interface Scenario {
  id: string;
  candidate: MasterRecord;
  existing: MasterRecord[];
  expect: DedupConclusion;
  why: string;
}

const G_MH = "27AABCT1234F1Z5";
const G_TN = "33AABCT1234F1Z9";
const CIN_A = "U29120TN2004PTC054321";

const SCENARIOS: Scenario[] = [
  {
    id: "same-gstin-name-variant",
    candidate: { legalName: "3S Precision Parts", gstin: G_MH },
    existing: [{ id: "e1", legalName: "3S Precision Parts Pvt. Ltd.", gstin: G_MH }],
    expect: "same",
    why: "identical GSTIN — definitive",
  },
  {
    id: "different-gstin-close-name",
    candidate: { legalName: "Shree Balaji Engineering Works", gstin: G_MH },
    existing: [{ id: "e2", legalName: "Shree Balaji Engineering Work", gstin: G_TN }],
    expect: "different",
    why: "near-identical name but GSTINs disagree — the round-1 failure case",
  },
  {
    id: "same-ids-unrelated-names",
    candidate: { legalName: "Kaveri Pumps and Motors", gstin: G_TN, cin: CIN_A },
    existing: [{ id: "e3", legalName: "Kaveri ElectroFab Industries", gstin: G_TN, cin: CIN_A }],
    expect: "same",
    why: "same GSTIN and CIN, unrelated trading names",
  },
  {
    id: "no-identifiers-at-all",
    candidate: { legalName: "Sri Venkateswara Tools" },
    existing: [{ id: "e4", legalName: "Sri Venkateswara Tool" }],
    expect: "unproven",
    why: "names alone are not proof — must not over-claim",
  },
  {
    id: "one-sided-gstin",
    candidate: { legalName: "Anand Auto Parts", gstin: G_MH },
    existing: [{ id: "e5", legalName: "Anand Auto Parts Private Limited" }],
    expect: "unproven",
    why: "only one side has a GSTIN — cannot be compared",
  },
];

/** Minimal router: exercises the provider without a database or governance tables. */
function fakeRouter(provider: StubProvider | OllamaProvider): AiRouterService {
  return {
    complete: (req: { featureKey: string; input: unknown }) => provider.complete(req),
  } as unknown as AiRouterService;
}

async function main(): Promise<void> {
  const choice = (process.env.AI_PROVIDER ?? "stub").toLowerCase();
  const stub = new StubProvider();
  const ollama = new OllamaProvider(stub);
  const provider = choice === "ollama" ? ollama : stub;

  const explainer = new DedupExplainer(fakeRouter(provider), stub, ollama);
  explainer.onModuleInit();

  console.log(`\nGrounding gate — general.master_dedup   (provider: ${provider.name})`);
  console.log(`  model: ${process.env.OLLAMA_MODEL ?? (choice === "ollama" ? "qwen2.5:3b (default)" : "n/a")}\n`);

  const failures: string[] = [];
  let degradedCount = 0;

  for (const s of SCENARIOS) {
    const matches = detectDuplicates(s.candidate, s.existing);
    if (matches.length === 0) {
      failures.push(`${s.id}: detector found no match, scenario cannot be explained`);
      console.log(`  ✗ ${s.id} — detector found nothing to explain`);
      continue;
    }
    const verdict = decideDuplicateVerdict(s.candidate, matches[0]!, {});
    const started = Date.now();
    const out = await explainer.explain({ candidate: s.candidate, matches });
    const ms = Date.now() - started;
    if (out.degraded) degradedCount++;

    // 1. the conclusion is code-owned — assert it landed where it should.
    const conclusionOk = verdict.conclusion === s.expect;
    if (!conclusionOk) failures.push(`${s.id}: conclusion ${verdict.conclusion}, expected ${s.expect}`);

    // 2+3. the whole note must be grounded and non-contradictory.
    const reason = out.text.replace(verdict.headline, "").split("Suggested action:")[0] ?? "";
    const g = checkGrounding(reason, verdict);
    if (!g.ok) failures.push(`${s.id}: ungrounded text (${g.reason})`);

    const mark = conclusionOk && g.ok ? "✓" : "✗";
    console.log(`  ${mark} ${s.id}  [${verdict.conclusion}]  ${out.degraded ? "(degraded) " : ""}${ms}ms`);
    console.log(`      ${out.text.replace(/\n/g, "\n      ")}`);
    console.log("");
  }

  console.log(`  scenarios ${SCENARIOS.length}, degraded ${degradedCount}, violations ${failures.length}`);
  for (const f of failures) console.log(`    - ${f}`);
  if (choice === "ollama" && degradedCount === SCENARIOS.length) {
    console.log(`  NOTE: every call degraded — the local model was unreachable, so this run`);
    console.log(`        only proves the deterministic fallback. Start Ollama and re-run.`);
  }
  console.log(`  verdict   ${failures.length === 0 ? "PASS ✓" : "FAIL ✗"}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
