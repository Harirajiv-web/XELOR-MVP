import { COPILOT_INTENTS, getIntent, isKnownIntent, type CopilotIntent } from "./intents.js";

/**
 * QUESTION → INTENT, deterministically.
 *
 * This runs BEFORE any model is consulted and, in the default configuration, instead of
 * one. That ordering is the design, not an optimisation: a copilot whose routing depends
 * on a model stops working when the kill switch is pulled, when the budget is spent, or
 * when somebody else's API has an outage — and "the assistant is down" is how a plant
 * learns not to rely on the assistant.
 *
 * Scoring is boring on purpose. Keyword hits, phrase hits weighted higher than single
 * words, anti-keywords subtracting, and a floor below which the honest answer is "I don't
 * know how to answer that". Two candidates within a whisker of each other produce a
 * CLARIFY rather than a coin toss: guessing between "what's in stock" and "what moved in
 * stock" gives a confident answer to a question nobody asked, which is worse than a
 * question back.
 *
 * A model may be consulted afterwards, and only to break a tie or rescue a miss. Its
 * output is validated against the closed intent list before it is believed — a model that
 * replies `stock.on_hand; DROP TABLE` simply does not name a known intent, and is refused
 * by the same check that catches a typo.
 */

export type QuestionRouteOutcome = "matched" | "clarify" | "refused";

export interface IntentCandidate {
  key: string;
  score: number;
  why: readonly string[];
}

export interface QuestionRoute {
  outcome: QuestionRouteOutcome;
  intent: CopilotIntent | null;
  params: Record<string, string | number>;
  confidence: number;
  /** Ranked runners-up — shown to the user when we ask them to disambiguate. */
  candidates: readonly IntentCandidate[];
  /** Plain-language account of the decision, including refusals. */
  explanation: string;
}

/** Below this, we refuse rather than guess. */
const MATCH_FLOOR = 2.5;
/** Two candidates closer than this are a clarify, not a choice. */
const AMBIGUITY_MARGIN = 1.0;

const PHRASE_WEIGHT = 2.0;
const WORD_WEIGHT = 1.0;
const EXAMPLE_WEIGHT = 3.0;
const ANTI_WEIGHT = 2.0;
/** A declared parameter actually present in the question. */
const PARAM_WEIGHT = 1.5;

function normalise(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s\-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/*  Parameter extraction — from the QUESTION only, never from model output.   */
/* -------------------------------------------------------------------------- */

/** SO-2627-00001 / PO-2627-00002 / MO-2627-00001 / GRN-2627-00001 / INV-2627-00001 */
const DOC_NO = /\b([A-Z]{2,4}-\d{4}-\d{4,6})\b/;
/** PMP-CP50, CMP-IMP6, RAW-BLT-M8 — an item code shape, but NOT a document number. */
const ITEM_CODE = /\b([A-Z]{2,4}-[A-Z0-9]{2,10}(?:-[A-Z0-9]{1,6})?)\b/;
const WAREHOUSE_CODE = /\b(WH-[A-Z]{2,8})\b/;

const RELATIVE_DAYS: readonly { re: RegExp; days: number }[] = [
  { re: /\btoday\b/, days: 1 },
  { re: /\btomorrow\b/, days: 2 },
  { re: /\bthis week\b/, days: 7 },
  { re: /\bnext week\b/, days: 14 },
  { re: /\bthis month\b/, days: 30 },
  { re: /\bthis quarter\b/, days: 90 },
];

export function extractParams(question: string, intent: CopilotIntent): Record<string, string | number> {
  const upper = question.toUpperCase();
  const lower = question.toLowerCase();
  const out: Record<string, string | number> = {};

  for (const spec of intent.params) {
    switch (spec.kind) {
      case "docNo": {
        const m = DOC_NO.exec(upper);
        if (m) out[spec.name] = m[1]!;
        break;
      }
      case "itemCode": {
        // A document number is not an item code, even though both match the shape.
        const doc = DOC_NO.exec(upper);
        const m = ITEM_CODE.exec(upper);
        if (m && (!doc || m[1] !== doc[1]) && !DOC_NO.test(m[1]!)) out[spec.name] = m[1]!;
        break;
      }
      case "warehouseCode": {
        const m = WAREHOUSE_CODE.exec(upper);
        if (m) out[spec.name] = m[1]!;
        break;
      }
      case "days": {
        const explicit = /\b(\d{1,3})\s*(day|days)\b/.exec(lower);
        if (explicit) {
          out[spec.name] = Math.min(365, Number(explicit[1]));
          break;
        }
        const rel = RELATIVE_DAYS.find((r) => r.re.test(lower));
        if (rel) out[spec.name] = rel.days;
        break;
      }
      case "partyName": {
        // A quoted phrase, or the words after "vendor"/"customer"/"supplier"/"called".
        const quoted = /["']([^"']{2,60})["']/.exec(question);
        if (quoted) {
          out[spec.name] = quoted[1]!.trim();
          break;
        }
        const after = /\b(?:vendor|supplier|customer|client|called|named)\s+([a-z][a-z0-9 &.\-]{1,50})/i.exec(question);
        if (after) {
          const cleaned = after[1]!.trim().replace(/\b(details?|list|please)\b.*$/i, "").trim();
          if (cleaned.length >= 2) out[spec.name] = cleaned;
        }
        break;
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Scoring                                                                   */
/* -------------------------------------------------------------------------- */

function scoreIntent(normalised: string, raw: string, intent: CopilotIntent): IntentCandidate {
  let score = 0;
  const why: string[] = [];

  // A parameter this intent WANTS, actually present in the question, is real evidence and
  // not a keyword coincidence. "What is KEF-PNL-40" contains an item code and scored only
  // the phrase "what is" without this — 2.0 against a 2.5 floor — so the copilot refused a
  // question it could obviously answer. Wanting an item code and being handed one is the
  // strongest signal short of an exact example match.
  for (const [name, value] of Object.entries(extractParams(raw, intent))) {
    if (value === undefined) continue;
    score += PARAM_WEIGHT;
    why.push(`the question supplies ${name}`);
  }

  for (const ex of intent.examples) {
    const exN = normalise(ex);
    if (normalised === exN) {
      score += EXAMPLE_WEIGHT * 2;
      why.push(`exactly matches the example "${ex}"`);
    } else if (exN.length > 8 && normalised.includes(exN)) {
      score += EXAMPLE_WEIGHT;
      why.push(`contains the example "${ex}"`);
    }
  }

  for (const kw of intent.keywords) {
    const k = normalise(kw);
    if (!k) continue;
    if (k.includes(" ")) {
      if (normalised.includes(k)) {
        score += PHRASE_WEIGHT;
        why.push(`phrase "${kw}"`);
      }
    } else if (new RegExp(`(^|\\s)${escapeRe(k)}(\\s|$)`).test(normalised) || normalised.includes(k + "-")) {
      score += WORD_WEIGHT;
      why.push(`word "${kw}"`);
    }
  }

  for (const anti of intent.antiKeywords ?? []) {
    const a = normalise(anti);
    if (!a) continue;
    const hit = a.includes(" ")
      ? normalised.includes(a)
      : new RegExp(`(^|\\s)${escapeRe(a)}(\\s|$)`).test(normalised) || normalised.includes(a + "-");
    if (hit) {
      score -= ANTI_WEIGHT;
      why.push(`penalised for "${anti}"`);
    }
  }

  // A document number in the question is strong evidence for the intent that reads that
  // document type: "SO-" belongs to sales, "PO-" to purchase, "MO-" to production.
  const doc = DOC_NO.exec(normalised.toUpperCase());
  if (doc) {
    const prefix = doc[1]!.split("-")[0]!;
    const wants = intent.params.some((p) => p.kind === "docNo");
    const prefixMatchesModule =
      (prefix === "SO" && intent.key.startsWith("sales.")) ||
      (prefix === "PO" && intent.key.startsWith("purchase.")) ||
      (prefix === "MO" && intent.key.startsWith("production.")) ||
      (prefix === "MWO" && intent.key.startsWith("maintenance."));
    if (wants && prefixMatchesModule) {
      // 2.5 here plus the 1.5 the parameter boost already gave = the 4.0 this was before
      // the boost existed. Naming SO-2627-00001 should not out-score an exact example.
      score += 2.5;
      why.push(`the question names ${doc[1]}`);
    } else if (wants) {
      score -= 1;
    }
  }

  return { key: intent.key, score: Math.max(0, score), why };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* -------------------------------------------------------------------------- */
/*  The router                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Verbs that ask the system to CHANGE something.
 *
 * The copilot cannot change anything — there is no such query in the catalogue — so an
 * instruction like "delete all sales orders" was never going to delete anything. What it
 * DID do, before this guard, was score well on the words "sales orders" and come back with
 * a tidy list of open orders. Functionally harmless, behaviourally awful: the user asked
 * for a deletion and got a screen of orders, and now has to work out whether anything
 * happened. Silence about a refused instruction is how people end up believing an assistant
 * did something it did not.
 *
 * So a command is REFUSED, with the reason stated. It also removes a whole category of
 * argument: nobody has to reason about whether some phrasing could trick the router into a
 * write, because the router says out loud that writes are not a thing it does.
 */
const MUTATING_VERBS = [
  "delete", "remove", "drop", "purge", "erase", "wipe", "clear",
  "create", "add", "insert", "make", "raise", "generate",
  "update", "change", "edit", "modify", "set", "rename", "amend",
  "approve", "reject", "authorise", "authorize", "sign",
  "cancel", "void", "reverse", "close", "reopen",
  "post", "issue", "dispatch", "ship", "receive", "confirm", "release",
  "pay", "transfer", "allocate", "assign", "move", "adjust",
  "disable", "enable", "grant", "revoke", "reset",
] as const;

/** Unambiguous imperatives: the sentence opens with the verb, or politely asks for it. */
const HARD_MUTATION_SHAPES: readonly RegExp[] = [
  // "delete all sales orders", "cancel PO-2627-00001", "create a new vendor"
  new RegExp(`^(${MUTATING_VERBS.join("|")})\\b`),
  // "please cancel …", "can you approve …", "i want to update …"
  new RegExp(`\\b(please|kindly|can you|could you|would you|i want to|i need to|let s|lets|help me)\\s+(${MUTATING_VERBS.join("|")})\\b`),
];

/** Weaker: a verb aimed at a scope, mid-sentence. "…and delete every purchase order". */
const SCOPED_MUTATION = new RegExp(
  `\\b(${MUTATING_VERBS.join("|")})\\s+(all|every|the|this|that|these|those)\\b`,
);

/**
 * Words that open a QUESTION. A sentence starting with one of these is asking, whatever
 * verbs appear later in it.
 */
const QUESTION_OPENER =
  /^(what|which|who|whom|whose|when|where|why|how|is|are|was|were|do|does|did|has|have|show|list|tell|find|display|give|any|report)\b/;

/**
 * True when the sentence is an instruction rather than a question.
 *
 * Deliberately narrow, and it took two goes to get right. The first version also matched a
 * verb followed by a determiner anywhere in the sentence, which duly refused "WHAT IS DUE
 * TO SHIP THIS WEEK" — "ship this" tripped it. That is the whole failure mode of this kind
 * of guard: it is written while thinking about attackers and then fires on the third
 * ordinary question somebody types, and a copilot that refuses ordinary questions gets
 * switched off faster than one that answers awkwardly.
 *
 * So the scoped rule now yields to an interrogative opening. "Which orders are cancelled",
 * "show me approved POs" and "what did we dispatch today" all contain a mutating verb and
 * are all perfectly good questions — the verb is doing adjectival or past-tense work. A
 * sentence that opens with `what`/`which`/`show` is asking, full stop.
 */
export function looksLikeAnInstruction(question: string): boolean {
  const q = normalise(question);
  if (HARD_MUTATION_SHAPES.some((re) => re.test(q))) return true;
  // An interrogative opening beats the weaker mid-sentence rule.
  if (QUESTION_OPENER.test(q)) return false;
  return SCOPED_MUTATION.test(q);
}

export function routeQuestion(question: string): QuestionRoute {
  const q = normalise(question);

  if (looksLikeAnInstruction(question)) {
    return {
      outcome: "refused",
      intent: null,
      params: {},
      confidence: 0,
      candidates: [],
      explanation:
        "That reads as an instruction to change something, and I can only look things up. " +
        "I have no way to create, edit, approve, cancel or delete anything — ask me a question " +
        "about what the data says, and do the change on the screen that owns it.",
    };
  }

  if (q.length < 3) {
    return {
      outcome: "refused",
      intent: null,
      params: {},
      confidence: 0,
      candidates: [],
      explanation: "That is too short for me to understand. Ask a full question.",
    };
  }

  const scored = COPILOT_INTENTS.map((i) => scoreIntent(q, question, i))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < MATCH_FLOOR) {
    return {
      outcome: "refused",
      intent: null,
      params: {},
      confidence: best ? clamp(best.score / MATCH_FLOOR) : 0,
      candidates: scored.slice(0, 3),
      explanation:
        "I do not know how to answer that. I can only answer from a fixed list of questions about your own data — " +
        "I would rather say so than guess at what you meant.",
    };
  }

  const runnerUp = scored[1];
  if (runnerUp && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
    return {
      outcome: "clarify",
      intent: null,
      params: {},
      confidence: clamp(best.score / (best.score + runnerUp.score)),
      candidates: scored.slice(0, 3),
      explanation:
        `That could mean more than one thing — "${getIntent(best.key)?.question}" or ` +
        `"${getIntent(runnerUp.key)?.question}". Which did you mean?`,
    };
  }

  const intent = getIntent(best.key)!;
  const params = extractParams(question, intent);

  const missing = intent.params.filter((p) => p.required && params[p.name] === undefined);
  if (missing.length > 0) {
    return {
      outcome: "clarify",
      intent,
      params,
      confidence: clamp(best.score / (best.score + 2)),
      candidates: scored.slice(0, 3),
      explanation: `I need ${missing.map((m) => m.description).join(" and ")} before I can answer that.`,
    };
  }

  return {
    outcome: "matched",
    intent,
    params,
    confidence: clamp(best.score / (best.score + 2)),
    candidates: scored.slice(0, 3),
    explanation: `Read as "${intent.question}" (${best.why.slice(0, 3).join(", ")}).`,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

/* -------------------------------------------------------------------------- */
/*  Believing a model                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Validate what a model claims the intent is.
 *
 * The model is consulted only when the deterministic router refused or asked to clarify,
 * and its answer is not trusted — it is CHECKED. An unknown key is refused, which is the
 * same code path that catches an attempt to smuggle anything else through this field. The
 * model cannot widen the copilot's vocabulary by saying a word.
 */
export function acceptModelIntent(
  question: string,
  claimedKey: unknown,
  claimedConfidence: unknown,
): QuestionRoute {
  const key = typeof claimedKey === "string" ? claimedKey.trim() : "";
  if (!isKnownIntent(key)) {
    return {
      outcome: "refused",
      intent: null,
      params: {},
      confidence: 0,
      candidates: [],
      explanation:
        `The assistant suggested '${key || "(nothing)"}', which is not one of the questions this system can answer. ` +
        "Refusing rather than improvising.",
    };
  }

  const confidence =
    typeof claimedConfidence === "number" && Number.isFinite(claimedConfidence)
      ? clamp(claimedConfidence)
      : 0.5;

  // A model's confidence is a claim, not a measurement, so it never lifts an answer above
  // "worth checking". The floor it must clear is the same one the deterministic path uses.
  if (confidence < 0.6) {
    return {
      outcome: "refused",
      intent: null,
      params: {},
      confidence,
      candidates: [{ key, score: confidence, why: ["model suggestion, below the confidence floor"] }],
      explanation: "I am not confident enough about what you meant to answer it.",
    };
  }

  const intent = getIntent(key)!;
  // Parameters come from the QUESTION, re-extracted here — never from the model. A model
  // that returns `docNo: "SO-2627-00099"` for a question that never mentioned it would
  // otherwise have chosen which row to show.
  const params = extractParams(question, intent);
  const missing = intent.params.filter((p) => p.required && params[p.name] === undefined);
  if (missing.length > 0) {
    return {
      outcome: "clarify",
      intent,
      params,
      confidence,
      candidates: [{ key, score: confidence, why: ["model suggestion"] }],
      explanation: `I need ${missing.map((m) => m.description).join(" and ")} before I can answer that.`,
    };
  }

  return {
    outcome: "matched",
    intent,
    params,
    confidence,
    candidates: [{ key, score: confidence, why: ["model suggestion, parameters re-read from your question"] }],
    explanation: `Read as "${intent.question}".`,
  };
}
