import { minimise, redactionRecord, scanValue, type PiiFinding, type RedactionRecord } from "./pii.js";

/**
 * THE GUARDRAIL PIPELINE (AI-OPERATIONS §11, FR-AIO-030..040).
 *
 * Every AI call in the system passes through here, in both directions. Eight modules cannot
 * each get this right; one pipeline, tested once.
 *
 * The two checks worth defending:
 *
 *  - **Numeric provenance.** Any number in a model's output must appear in the input it was
 *    given. This is the single highest-value guardrail in a finance product, because the
 *    characteristic LLM failure is not refusing to answer — it is producing a plausible
 *    total that nobody typed. A number the model invented is indistinguishable from a
 *    number it read, unless you check.
 *
 *  - **Injection is MARKED, not stripped.** Removing "ignore previous instructions" from a
 *    vendor's remarks field silently changes the document, and the next attacker phrases it
 *    differently anyway. Marking it means the call proceeds with the content quarantined as
 *    data, and the reviewer sees why the confidence dropped.
 */

export type GuardrailStage = "pre" | "post";

export type GuardrailCode =
  | "pii_minimised"
  | "pii_leak_refused"
  | "injection_marked"
  | "schema_invalid"
  | "numeric_unprovenanced"
  | "confidence_low"
  | "output_too_long";

export interface GuardrailEvent {
  stage: GuardrailStage;
  code: GuardrailCode;
  severity: "block" | "degrade" | "note";
  message: string;
  detail?: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*  Pre-call                                                                  */
/* -------------------------------------------------------------------------- */

export interface PreCallResult {
  allowed: boolean;
  payload: Record<string, unknown>;
  redaction: RedactionRecord;
  events: GuardrailEvent[];
  /** Text quarantined as data rather than instruction. */
  quarantined: string[];
}

const INJECTION_PATTERNS: readonly { re: RegExp; label: string }[] = [
  { re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, label: "instruction override" },
  { re: /disregard\s+(the\s+)?(system|previous)/i, label: "instruction override" },
  { re: /you\s+are\s+now\s+(a|an)\s+/i, label: "role reassignment" },
  { re: /\bsystem\s*:\s*/i, label: "fake system turn" },
  { re: /reveal\s+(your\s+)?(system\s+)?prompt/i, label: "prompt extraction" },
  { re: /print\s+(the\s+)?(secret|key|token|password)/i, label: "secret extraction" },
  { re: /<\|?(im_start|im_end|endoftext)\|?>/i, label: "control token" },
];

/**
 * Minimise, verify, and mark injection attempts.
 *
 * Returns `allowed: false` only when personal data survived minimisation. An injection
 * attempt does NOT block: the content is marked, the confidence is lowered, and the call
 * proceeds with the text treated as data — which is what it always was.
 */
export function preCall(input: {
  source: Record<string, unknown>;
  allowList: readonly string[];
}): PreCallResult {
  const events: GuardrailEvent[] = [];
  const min = minimise(input.source, input.allowList);
  const redaction = redactionRecord(min);

  events.push({
    stage: "pre",
    code: "pii_minimised",
    severity: "note",
    message: redaction.assertion,
    detail: { sent: redaction.fieldsSent, dropped: redaction.fieldsDropped },
  });

  if (!min.safe) {
    events.push({
      stage: "pre",
      code: "pii_leak_refused",
      severity: "block",
      message: min.reason,
      detail: { findings: min.leaked },
    });
    return { allowed: false, payload: {}, redaction, events, quarantined: [] };
  }

  const quarantined: string[] = [];
  for (const [k, v] of Object.entries(min.payload)) {
    if (typeof v !== "string") continue;
    for (const p of INJECTION_PATTERNS) {
      if (!p.re.test(v)) continue;
      quarantined.push(k);
      events.push({
        stage: "pre",
        code: "injection_marked",
        severity: "degrade",
        message: `'${k}' contains what looks like an ${p.label}. It is being sent as quarantined DATA, not as instruction — stripping it would silently change the document, and the next attempt would be phrased differently anyway.`,
        detail: { field: k, pattern: p.label },
      });
      break;
    }
  }

  return { allowed: true, payload: min.payload, redaction, events, quarantined: [...new Set(quarantined)] };
}

/* -------------------------------------------------------------------------- */
/*  Post-call                                                                 */
/* -------------------------------------------------------------------------- */

export interface PostCallResult {
  accepted: boolean;
  /** Numbers the model produced that were NOT present in its input. */
  unprovenanced: number[];
  piiInOutput: PiiFinding[];
  events: GuardrailEvent[];
  route: "accept" | "review" | "reject";
  reason: string;
}

/** Every number appearing anywhere in a value, as a set of normalised strings. */
export function numbersIn(value: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 8) return out;
  if (typeof value === "number" && Number.isFinite(value)) out.add(normaliseNumber(value));
  else if (typeof value === "string") {
    for (const m of value.match(/-?\d[\d,]*\.?\d*/g) ?? []) {
      const n = Number(m.replace(/,/g, ""));
      if (Number.isFinite(n)) out.add(normaliseNumber(n));
    }
  } else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out, depth + 1));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((v) => numbersIn(v, out, depth + 1));
  return out;
}

function normaliseNumber(n: number): string {
  // Compare at paise precision. Otherwise 1234.5 and 1234.50 look like different numbers,
  // and every currency field in the system fails provenance.
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Check the output.
 *
 * Numeric provenance is the heart of it: every number in the output must appear in the
 * input. Derived numbers are permitted only when the caller says so explicitly, because
 * "the model may compute" and "the model may invent" are the same permission from here.
 */
export function postCall(input: {
  modelInput: unknown;
  modelOutput: unknown;
  /** Numbers the CODE derived and handed to the model — legitimate additions. */
  derivedNumbers?: readonly number[];
  confidence?: number | null;
  confidenceFloor?: number;
  schemaValid: boolean;
  maxOutputChars?: number;
}): PostCallResult {
  const events: GuardrailEvent[] = [];

  if (!input.schemaValid) {
    events.push({ stage: "post", code: "schema_invalid", severity: "block", message: "The model's output did not match the requested schema. A partially-parsed answer is worse than none — it looks like an answer." });
    return { accepted: false, unprovenanced: [], piiInOutput: [], events, route: "reject", reason: "Output failed schema validation." };
  }

  const allowed = numbersIn(input.modelInput);
  for (const d of input.derivedNumbers ?? []) allowed.add(normaliseNumber(d));

  const produced = numbersIn(input.modelOutput);
  const unprovenanced = [...produced]
    .filter((n) => !allowed.has(n))
    .map(Number)
    // Small integers are almost always list indices, counts or line numbers rather than
    // invented money. Flagging them buries the finding that matters.
    .filter((n) => Math.abs(n) > 100);

  if (unprovenanced.length > 0) {
    events.push({
      stage: "post",
      code: "numeric_unprovenanced",
      severity: "block",
      message: `The model produced ${unprovenanced.length} number(s) that were not in its input: ${unprovenanced.slice(0, 5).join(", ")}. A plausible total nobody typed is the characteristic failure of this technology in a finance product.`,
      detail: { unprovenanced },
    });
  }

  const piiInOutput = scanValue(input.modelOutput).filter((f) => f.confidence === "certain");
  if (piiInOutput.length > 0) {
    events.push({
      stage: "post",
      code: "pii_leak_refused",
      severity: "block",
      message: `The output contains ${piiInOutput.map((p) => p.kind).join(", ")}. Personal identifiers must not come back out either.`,
    });
  }

  const text = JSON.stringify(input.modelOutput ?? "");
  const maxChars = input.maxOutputChars ?? 20_000;
  if (text.length > maxChars) {
    events.push({ stage: "post", code: "output_too_long", severity: "degrade", message: `Output is ${text.length} characters against a ${maxChars} limit.` });
  }

  const floor = input.confidenceFloor ?? 0.6;
  const lowConfidence = input.confidence != null && input.confidence < floor;
  if (lowConfidence) {
    events.push({
      stage: "post",
      code: "confidence_low",
      severity: "degrade",
      message: `Confidence ${input.confidence} is below the ${floor} floor — routed to a human rather than shown as an answer.`,
    });
  }

  const blocked = events.some((e) => e.severity === "block");
  const route: PostCallResult["route"] = blocked ? "reject" : lowConfidence ? "review" : "accept";
  return {
    accepted: !blocked,
    unprovenanced,
    piiInOutput,
    events,
    route,
    reason: blocked
      ? events.find((e) => e.severity === "block")!.message
      : lowConfidence
        ? "Accepted but routed for human review."
        : "Accepted.",
  };
}
