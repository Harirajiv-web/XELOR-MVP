import { scanValue, type PiiFinding } from "../aiops/pii.js";
import { numbersIn } from "../aiops/guardrails.js";
import type { CopilotIntent } from "./intents.js";

/**
 * TURNING ROWS INTO AN ANSWER — and the checks that answer must survive.
 *
 * The default renderer is a TEMPLATE. Not because prose is hard, but because a template
 * cannot invent: it prints the rows it was handed and nothing else, so the number a user
 * reads is the number the database returned, with no step in between where a plausible
 * alternative could appear.
 *
 * A model may re-phrase the template's output when narration is switched on. It is then
 * held to the rule that matters in a finance product: EVERY NUMBER IN THE SENTENCE MUST
 * APPEAR IN THE ROWS. Fail that and the template answer is shown instead — the user still
 * gets their answer, just in plainer words. Degrading to correct-and-plain rather than
 * refusing outright is deliberate; an assistant that goes silent when its optional layer
 * misbehaves teaches people to stop asking.
 *
 * Every answer carries its CITATION: which question was understood, which tables were
 * read, how many rows matched, and when. An answer a user cannot check is a rumour.
 */

export interface AnswerCitation {
  /** The catalogue question that was run — not a paraphrase of it. */
  intentKey: string;
  intentQuestion: string;
  /** The database tables the query actually read. */
  sources: readonly string[];
  rowCount: number;
  /** True when the row cap trimmed the result — silence here would be a lie. */
  truncated: boolean;
  /** Parameters as they were understood, so a misread is visible. */
  params: Record<string, string | number>;
  asOf: string;
}

export interface RenderedAnswer {
  text: string;
  rows: readonly Record<string, unknown>[];
  citation: AnswerCitation;
}

/** Fields that are always dropped from a copilot answer, whatever the query selected. */
const NEVER_SHOW = new Set([
  "id",
  "tenantId",
  "tenant_id",
  "createdBy",
  "updatedBy",
  "created_by",
  "updated_by",
  "passwordHash",
  "secret",
  "token",
]);

/**
 * Strip identifiers and internal columns before an answer leaves the building.
 *
 * Row ids are removed for a specific reason rather than tidiness: a uuid in an answer is
 * an invitation to paste it into another endpoint, and the copilot's promise is that it
 * shows what a screen would show. Documents are identified by their number, which is what
 * a person would quote anyway.
 */
export function presentableRows(
  rows: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (NEVER_SHOW.has(k)) continue;
      if (v === null || v === undefined) continue;
      out[k] = v;
    }
    return out;
  });
}

/* -------------------------------------------------------------------------- */
/*  The template renderer                                                     */
/* -------------------------------------------------------------------------- */

export function renderAnswer(input: {
  intent: CopilotIntent;
  rows: readonly Record<string, unknown>[];
  params: Record<string, string | number>;
  sources: readonly string[];
  truncated: boolean;
  asOf: string;
}): RenderedAnswer {
  const rows = presentableRows(input.rows);
  const citation: AnswerCitation = {
    intentKey: input.intent.key,
    intentQuestion: input.intent.question,
    sources: input.sources,
    rowCount: rows.length,
    truncated: input.truncated,
    params: input.params,
    asOf: input.asOf,
  };

  if (rows.length === 0) {
    return {
      text:
        `Nothing matched. I read ${input.sources.join(" and ")} for "${input.intent.question}"` +
        `${describeParams(input.params)} and found no rows. ` +
        "That is an answer, not a failure — but if you expected something, check the filter above.",
      rows,
      citation,
    };
  }

  const head = rows.length === 1 ? "1 result" : `${rows.length} results`;
  const capped = input.truncated ? ` (showing the first ${rows.length}; there are more)` : "";
  const lines = rows.slice(0, 20).map((r) => "  • " + describeRow(r));
  const more = rows.length > 20 ? `\n  … and ${rows.length - 20} more` : "";

  return {
    text: `${head}${capped}${describeParams(input.params)}:\n${lines.join("\n")}${more}`,
    rows,
    citation,
  };
}

function describeParams(params: Record<string, string | number>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "";
  return ` for ${entries.map(([k, v]) => `${k} = ${String(v)}`).join(", ")}`;
}

function describeRow(row: Record<string, unknown>): string {
  return Object.entries(row)
    .map(([k, v]) => `${humanise(k)}: ${format(v)}`)
    .join("  ·  ");
}

function humanise(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function format(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return String(v);
  return String(v);
}

/* -------------------------------------------------------------------------- */
/*  Checking a narrated answer                                                */
/* -------------------------------------------------------------------------- */

export interface NarrationVerdict {
  accepted: boolean;
  /** Numbers in the narration that are in none of the rows. */
  invented: number[];
  pii: PiiFinding[];
  reason: string;
}

/**
 * Hold a model's prose to the rows it was given.
 *
 * Two refusals, and they are the two ways a helpful sentence does real damage:
 *
 *   - A NUMBER NOBODY RETURNED. The characteristic failure of this technology is not
 *     refusing to answer, it is producing a total that reads perfectly and came from
 *     nowhere. Once it is on a screen next to real figures it is indistinguishable from
 *     them.
 *   - A PERSONAL IDENTIFIER. Rows are masked before they reach the model, so a PAN or an
 *     Aadhaar appearing in the OUTPUT means something reconstructed or hallucinated one.
 *     Either way it does not leave.
 *
 * Small integers are exempt from the numeric check — counts, list positions and years are
 * not invented money, and flagging them buries the finding that matters.
 */
export function checkNarration(input: {
  narration: string;
  rows: readonly Record<string, unknown>[];
  /** Numbers the CODE computed (a total, a count) — legitimate even if no row holds them. */
  derived?: readonly number[];
}): NarrationVerdict {
  const allowed = numbersIn(input.rows);
  for (const d of input.derived ?? []) {
    allowed.add((Math.round(d * 100) / 100).toString());
  }

  const produced = numbersIn(input.narration);
  const invented = [...produced]
    .filter((n) => !allowed.has(n))
    .map(Number)
    .filter((n) => Math.abs(n) > 100);

  const pii = scanValue(input.narration).filter((f) => f.confidence === "certain");

  if (invented.length > 0) {
    return {
      accepted: false,
      invented,
      pii,
      reason:
        `The phrasing contained ${invented.length} number(s) that appear in none of the rows ` +
        `(${invented.slice(0, 5).join(", ")}). Showing the plain answer instead.`,
    };
  }
  if (pii.length > 0) {
    return {
      accepted: false,
      invented,
      pii,
      reason: `The phrasing contained ${pii.map((p) => p.kind).join(", ")}. Showing the plain answer instead.`,
    };
  }
  return { accepted: true, invented: [], pii: [], reason: "Every number in the phrasing came from the rows." };
}

/* -------------------------------------------------------------------------- */
/*  The read-only assertion                                                   */
/* -------------------------------------------------------------------------- */

const FORBIDDEN_SQL =
  /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy|merge|call|do|vacuum|reindex|refresh)\b/i;

/**
 * A belt-and-braces check that a catalogue query is a read.
 *
 * The queries are hand-written and reviewed, so in principle this can never fire. It runs
 * anyway, on every call, because "in principle" is what everyone says about the query that
 * eventually ships with a CTE nobody read to the end. It costs a regex per request and it
 * turns a catastrophic class of mistake into a refused one.
 */
export function assertReadOnly(sql: string): void {
  const stripped = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (FORBIDDEN_SQL.test(stripped)) {
    const verb = FORBIDDEN_SQL.exec(stripped)?.[1] ?? "a write";
    throw new Error(
      `Copilot query contains '${verb}'. The copilot is read-only; this query must never run.`,
    );
  }
  if (!/^\s*(with|select)\b/i.test(stripped)) {
    throw new Error("Copilot query does not begin with SELECT or WITH — refusing to run it.");
  }
}
