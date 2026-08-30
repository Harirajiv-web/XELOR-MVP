/**
 * The copilot's own slice of the API. Nothing outside this folder imports it, and it
 * imports nothing from another module — which is what makes the folder deletable.
 *
 * These types are transcribed from `apps/api/src/modules/copilot/copilot.controller.ts`
 * and `packages/platform/src/copilot/`, not invented here. Where a field looks redundant
 * it usually is not: `answered` and `refusal` both exist because a question can fail to be
 * answered in three different ways, and the screen renders each of them differently.
 */

/** One entry in the closed question catalogue — `GET /copilot/catalogue`. */
export interface CatalogueEntry {
  key: string;
  question: string;
  module: string;
  /** The permission the ASKER must hold. The copilot never widens access. */
  needsPermission: string;
  examples: readonly string[];
  parameters: ReadonlyArray<{ name: string; required: boolean; description: string }>;
  maxRows: number;
}

/**
 * `GET /copilot/capabilities` — the catalogue split by what THIS user may ask.
 *
 * Both halves come back on purpose. Showing only the permitted questions leaves somebody
 * hunting for a capability that exists but is not theirs; `cannotAsk` names the permission,
 * which turns a dead end into a sentence they can take to an administrator.
 */
export interface Capabilities {
  canAsk: ReadonlyArray<{ key: string; question: string; module: string; examples: readonly string[] }>;
  cannotAsk: ReadonlyArray<{ key: string; question: string; needs: string }>;
}

/**
 * What an answer was drawn from. This travels with every API response for governance and
 * auditability, even when the investor-facing result deliberately renders only the active
 * agent, department and tabular answer.
 *
 * `sources` are the database tables the hand-written query actually read — raw table names
 * rather than pretty labels, because the claim being made is checkable by somebody who can
 * open the database.
 */
export interface AnswerCitation {
  intentKey: string;
  intentQuestion: string;
  sources: readonly string[];
  rowCount: number;
  /** True when the row cap trimmed the result. Silence here would be a lie. */
  truncated: boolean;
  params: Record<string, string | number>;
  asOf: string;
}

/** What the router understood, and how it decided. Shown so a misread is visible. */
export interface Understanding {
  outcome: "matched" | "clarify" | "refused";
  intentKey: string | null;
  question: string | null;
  params: Record<string, string | number>;
  confidence: number;
  routedBy: "deterministic" | "model" | "none";
  explanation: string;
}

/**
 * `POST /copilot/ask` — the only non-GET call in either of ONYX's two modules.
 *
 * The three outcomes the screen must tell apart:
 *   ANSWERED — `answered: true`, `rows` populated, `citation` present.
 *   REFUSED  — `answered: false` and `refusal` set. A correct outcome, not an error.
 *   CLARIFY  — `answered: false`, no `refusal`, `didYouMean` listing the candidates.
 */
export interface AskResult {
  answered: boolean;
  answer: string;
  rows: ReadonlyArray<Record<string, unknown>>;
  citation: AnswerCitation | null;
  understanding: Understanding;
  refusal?: { code: string; message: string };
  didYouMean?: ReadonlyArray<{ key: string; question: string }>;
  correlationId: string;
}

/**
 * `GET /copilot/history` — the question log.
 *
 * The ANSWER is deliberately absent: storing returned rows would make a second copy of
 * business data outside the tables whose access rules protect it. What is kept is enough to
 * reconstruct any answer from the source of truth.
 */
export interface HistoryRow {
  askedAt: string;
  question: string;
  intentKey: string | null;
  outcome: string;
  rowCount: number;
  sources: readonly string[];
  /** NUMERIC(5,4) in Postgres, so it arrives as a string. */
  confidence: string;
  routedBy: string;
}

export const copilotApi = {
  capabilitiesPath: "/copilot/capabilities",
  cataloguePath: "/copilot/catalogue",
  askPath: "/copilot/ask",
  historyPath: "/copilot/history",
} as const;
