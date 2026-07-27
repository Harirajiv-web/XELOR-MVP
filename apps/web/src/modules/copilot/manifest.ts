import type { ModuleManifest } from "@spine/registry/manifest";

/* --------------------------------------------------------------------------
   READING A RESPONSE WE REFUSE TO ASSUME THE SHAPE OF.

   `reduce` is handed `unknown` and runs on a page this module does not own. Everything below
   narrows before it reads and returns null on anything unexpected: a dropped tile is a
   missing decoration, a thrown one would be a blank department page. `/copilot/history`
   answers a bare array today; `{data}` and `{items}` are tolerated anyway, because a
   dashboard tile is not the place to discover that an envelope changed.
   -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rowsOf(data: unknown): readonly Record<string, unknown>[] | null {
  let list: unknown = data;
  if (isRecord(data)) list = data["data"] ?? data["items"];
  if (!Array.isArray(list)) return null;
  return list.filter(isRecord);
}

/** The length of an array held under `key`, or null when it is not an array. */
function countAt(data: unknown, key: string): number | null {
  if (!isRecord(data)) return null;
  const v = data[key];
  return Array.isArray(v) ? v.length : null;
}

/** How many logged questions ended each way. Outcomes are a closed set in the database. */
function outcomeCounts(data: unknown): { total: number; by: Map<string, number> } | null {
  const rows = rowsOf(data);
  if (rows === null || rows.length === 0) return null;
  const by = new Map<string, number>();
  for (const r of rows) {
    const outcome = r["outcome"];
    const key = typeof outcome === "string" && outcome.length > 0 ? outcome : "unknown";
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  return { total: rows.length, by };
}

/**
 * The order the log's outcomes are read in, with the wording used on the Question log screen.
 * `ck_copilot_outcome` in migration 0048 fixes the set; anything outside it is ignored here
 * rather than guessed at.
 */
const OUTCOMES: readonly { code: string; label: string }[] = [
  { code: "answered", label: "Answered" },
  { code: "clarify", label: "Asked back" },
  { code: "refused", label: "Refused" },
  { code: "forbidden", label: "Not permitted" },
  { code: "no_query", label: "No question" },
];

/**
 * COPILOT (ONYX, cross-cutting).
 *
 * Two screens: the place a question is asked, and the log of every question that was ever
 * asked. The second is not an afterthought — it is what makes the first auditable, and for
 * a compliance officer it is the more important of the two.
 */
export const copilotManifest: ModuleManifest = {
  key: "copilot",
  name: "Copilot",
  summary: "Ask questions about your own data. It reads, cites what it read, and cannot change anything.",
  department: "ONYX",
  icon: "Sparkles",
  licenceKey: "copilot",
  order: 5,
  nav: [
    {
      label: "Ask",
      path: "ask",
      permission: "copilot.question.ask",
      icon: "MessageSquare",
    },
    {
      label: "Question log",
      path: "log",
      permission: "copilot.log.read",
      icon: "History",
    },
  ],
  screens: {
    ask: () => import("./screens/ask"),
    log: () => import("./screens/log"),
  },
  /**
   * THE FIGURES THIS MODULE IS WILLING TO PUT ON A DASHBOARD.
   *
   * The honest headline for an assistant with a CLOSED catalogue is its own size, and the
   * second honest number is the refusal rate. Neither is hidden here. A copilot that refuses
   * is a copilot that only answers what it can cite, and a dashboard that showed answers
   * without refusals would be advertising the half of the behaviour that is easy to like.
   *
   * The two log tiles disappear entirely — not as zeroes — when nobody has asked anything
   * yet, and both are gated on `copilot.log.read`, which is a privileged permission: a viewer
   * who may ask questions but may not read the log sees only the first tile.
   */
  signals: [
    {
      // How much this assistant can do, and how much of it is YOURS. Both halves come from
      // one call, and the fraction is the real one: the copilot never widens access, so what
      // you may ask is bounded by permissions you already hold elsewhere.
      label: "You may ask",
      permission: "copilot.question.ask",
      path: "/copilot/capabilities",
      reduce: (data) => {
        const can = countAt(data, "canAsk");
        const cannot = countAt(data, "cannotAsk");
        if (can === null || cannot === null) return null;
        const total = can + cannot;
        if (total === 0) return null;
        return {
          value: `${can} of ${total}`,
          fraction: can / total,
          hint:
            cannot > 0
              ? `${cannot} need a permission you do not hold. The catalogue is closed at ${total}.`
              : `The whole closed catalogue. Nothing outside these ${total} can be asked.`,
          tone: can > 0 ? "ok" : "warn",
        };
      },
    },
    {
      // Neutral tone on purpose. Everywhere else in this product a refusal is a rejection;
      // here it is the design working, and colouring it red would teach a reader to distrust
      // the one behaviour that deserves the most trust.
      label: "Refused or unclear",
      permission: "copilot.log.read",
      path: "/copilot/history",
      query: { limit: 200 },
      reduce: (data) => {
        const counts = outcomeCounts(data);
        if (counts === null) return null;
        const answered = counts.by.get("answered") ?? 0;
        const refused = counts.total - answered;
        return {
          value: `${refused} of ${counts.total}`,
          fraction: refused / counts.total,
          hint: "A refusal is the copilot working: it answers only what it can cite.",
          tone: "neutral",
        };
      },
    },
    {
      // The one chart on this card. Every outcome the log records, including the ones nobody
      // enjoys showing — a question turned away for lack of permission is evidence that the
      // asker's own access, not the assistant's, decides what can be seen.
      label: "How questions ended",
      permission: "copilot.log.read",
      path: "/copilot/history",
      query: { limit: 200 },
      reduce: (data) => {
        const counts = outcomeCounts(data);
        if (counts === null) return null;
        const series = OUTCOMES.filter((o) => (counts.by.get(o.code) ?? 0) > 0).map((o) => ({
          label: o.label,
          value: counts.by.get(o.code) ?? 0,
        }));
        if (series.length < 2) return null;
        return {
          value: String(counts.total),
          hint: "Logged",
          tone: "neutral",
          series,
        };
      },
    },
  ],
};
