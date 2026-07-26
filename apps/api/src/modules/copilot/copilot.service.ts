import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import {
  newId,
  currentTenant,
  AppError,
  routeQuestion,
  acceptModelIntent,
  renderAnswer,
  checkNarration,
  listIntents,
  getIntent,
  type CopilotIntent,
  type QuestionRoute,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { AI_ROUTER } from "../../ai/ai.tokens.js";
import type { AiRouterService } from "../../ai/ai-router.service.js";
import { COPILOT_QUERIES } from "./queries.js";

const { copilotQuestion, userRole, rolePermission } = schema;

export interface AskResult {
  answered: boolean;
  answer: string;
  rows: readonly Record<string, unknown>[];
  citation: Record<string, unknown> | null;
  /** What the copilot understood, and how sure it was. */
  understanding: {
    outcome: QuestionRoute["outcome"];
    intentKey: string | null;
    question: string | null;
    params: Record<string, string | number>;
    confidence: number;
    routedBy: "deterministic" | "model" | "none";
    explanation: string;
  };
  /** Present when the copilot declined, so the refusal is never mysterious. */
  refusal?: { code: string; message: string };
  /** Alternatives, when the question was ambiguous. */
  didYouMean?: readonly { key: string; question: string }[];
  correlationId: string;
}

/**
 * THE COPILOT.
 *
 * The whole of it is six steps, and the order is the safety argument:
 *
 *   1. UNDERSTAND — deterministically first. A model is asked only if the rules could not
 *      decide, and its answer is checked against the closed intent list before it counts.
 *   2. AUTHORISE — the matched question declares a permission; the asker must hold it.
 *      This is the same check the equivalent screen makes, deliberately, so the copilot
 *      cannot become a side door into data a person's role does not open.
 *   3. RETRIEVE — one hand-written SELECT, on the caller's own transaction, under the
 *      caller's own tenant. The model is not in this step and cannot reach it.
 *   4. RENDER — from a template. Numbers on the screen are numbers from the rows.
 *   5. NARRATE (optional, off by default) — a model may re-word the template answer, and is
 *      held to numeric provenance. Fail, and the plain answer is shown instead.
 *   6. LOG — every question, understood or refused, with what it read and how many rows.
 *
 * There is no step that writes business data, and no code path in this file that could
 * acquire one: `COPILOT_QUERIES` is the module's entire access to the database.
 */
@Injectable()
export class CopilotService {
  private readonly log = new Logger("Copilot");

  /**
   * Narration is OFF unless explicitly switched on. A copilot that phrases things nicely
   * is worth having; a copilot that phrases things nicely on its first day in a factory,
   * before anyone has watched it for a week, is a liability. The template answer is
   * correct by construction and this default says so.
   */
  private readonly narrationEnabled = process.env.COPILOT_NARRATION === "on";

  constructor(
    private readonly audit: AuditLogService,
    // Injected by TOKEN, not by class: the @Global AiModule exports AI_ROUTER, and going
    // through the token is what keeps the provider swappable without this module knowing.
    @Inject(AI_ROUTER) private readonly ai: AiRouterService,
  ) {}

  /** What this user is allowed to ask, so the UI can offer real suggestions. */
  async capabilities(): Promise<{
    canAsk: readonly { key: string; question: string; module: string; examples: readonly string[] }[];
    cannotAsk: readonly { key: string; question: string; needs: string }[];
  }> {
    const held = await this.permissionsOf();
    const canAsk: { key: string; question: string; module: string; examples: readonly string[] }[] = [];
    const cannotAsk: { key: string; question: string; needs: string }[] = [];
    for (const i of listIntents()) {
      if (held.has(i.permission)) {
        canAsk.push({ key: i.key, question: i.question, module: i.module, examples: i.examples });
      } else {
        cannotAsk.push({ key: i.key, question: i.question, needs: i.permission });
      }
    }
    return { canAsk, cannotAsk };
  }

  async ask(question: string, requestedIntent?: string): Promise<AskResult> {
    const correlationId = newId();
    const asked = (question ?? "").trim();

    if (asked.length === 0) {
      return this.refuse(correlationId, asked, "EMPTY_QUESTION", "Ask me something.", {
        outcome: "refused",
        intentKey: null,
        question: null,
        params: {},
        confidence: 0,
        routedBy: "none",
        explanation: "Nothing was asked.",
      });
    }
    if (asked.length > 500) {
      // Not a size limit for its own sake: a 5,000-character "question" is either a paste
      // accident or an attempt to bury an instruction where a reviewer will not read it.
      return this.refuse(correlationId, asked.slice(0, 500), "QUESTION_TOO_LONG",
        "That is too long for a question. Ask something shorter.", {
          outcome: "refused", intentKey: null, question: null, params: {},
          confidence: 0, routedBy: "none", explanation: "Question exceeded 500 characters.",
        });
    }

    /* ---- 1. understand ---------------------------------------------------- */

    let route: QuestionRoute;
    let routedBy: "deterministic" | "model" | "none" = "deterministic";

    if (requestedIntent) {
      // The UI can name the intent directly when the user clicks a suggestion. It is still
      // validated against the catalogue — a client is not a trusted source of intent keys.
      route = acceptModelIntent(asked, requestedIntent, 1);
      routedBy = "deterministic";
    } else {
      route = routeQuestion(asked);
      if (route.outcome !== "matched") {
        const rescued = await this.tryModelRoute(asked, correlationId);
        if (rescued) {
          route = rescued;
          routedBy = "model";
        }
      }
    }

    if (route.outcome === "clarify") {
      const alts = route.candidates
        .map((c) => getIntent(c.key))
        .filter((i): i is CopilotIntent => Boolean(i))
        .map((i) => ({ key: i.key, question: i.question }));
      await this.record(correlationId, asked, route, null, 0, "clarify");
      return {
        answered: false,
        answer: route.explanation,
        rows: [],
        citation: null,
        understanding: this.understanding(route, routedBy),
        didYouMean: alts,
        correlationId,
      };
    }

    if (route.outcome === "refused" || !route.intent) {
      await this.record(correlationId, asked, route, null, 0, "refused");
      return this.refuse(
        correlationId,
        asked,
        "QUESTION_NOT_UNDERSTOOD",
        route.explanation,
        this.understanding(route, routedBy),
      );
    }

    const intent = route.intent;

    /* ---- 2. authorise ----------------------------------------------------- */

    const held = await this.permissionsOf();
    if (!held.has("copilot.question.ask")) {
      throw new AppError("FORBIDDEN", 403, "Missing permission: copilot.ask.");
    }
    if (!held.has(intent.permission)) {
      // Named plainly on purpose. "You do not have access" teaches nobody anything; the
      // permission is what an administrator needs in order to grant it, or to decide not to.
      await this.record(correlationId, asked, route, null, 0, "forbidden");
      return this.refuse(
        correlationId,
        asked,
        "FORBIDDEN",
        `I can answer that question, but not for you: it reads ${intent.module} data, which needs the ` +
          `'${intent.permission}' permission. The copilot never shows anything your own access would not.`,
        this.understanding(route, routedBy),
      );
    }

    /* ---- 3. retrieve ------------------------------------------------------ */

    const query = COPILOT_QUERIES[intent.key as keyof typeof COPILOT_QUERIES];
    if (!query) {
      // Unreachable while the catalogue and the query map agree — and a test asserts they
      // do. Refusing beats a confusing empty answer if they ever drift.
      await this.record(correlationId, asked, route, null, 0, "no_query");
      return this.refuse(correlationId, asked, "NO_QUERY_FOR_INTENT",
        "I understood the question but have no query registered for it.",
        this.understanding(route, routedBy));
    }

    const now = new Date();
    const result = await withTenant((tx) =>
      query({ tx, params: route.params, cap: intent.rowCap, now }),
    );

    /* ---- 4. render -------------------------------------------------------- */

    const rendered = renderAnswer({
      intent,
      rows: result.rows,
      params: route.params,
      sources: result.sources,
      truncated: result.truncated,
      asOf: now.toISOString(),
    });

    /* ---- 5. narrate, if switched on --------------------------------------- */

    let answer = rendered.text;
    let narrationNote: string | null = null;
    if (this.narrationEnabled && rendered.rows.length > 0) {
      const narrated = await this.narrate(intent, rendered.rows, asked);
      if (narrated) {
        const verdict = checkNarration({ narration: narrated, rows: rendered.rows });
        if (verdict.accepted) {
          answer = `${narrated}\n\n${rendered.text}`;
        } else {
          narrationNote = verdict.reason;
          this.log.warn(`narration rejected [${correlationId}]: ${verdict.reason}`);
        }
      }
    }

    /* ---- 6. log ----------------------------------------------------------- */

    await this.record(correlationId, asked, route, result.sources, rendered.rows.length, "answered");

    return {
      answered: true,
      answer: narrationNote ? `${answer}\n\n(${narrationNote})` : answer,
      rows: rendered.rows,
      citation: { ...rendered.citation },
      understanding: this.understanding(route, routedBy),
      correlationId,
    };
  }

  /** The question log — who asked what, and what it was answered from. */
  async history(limit = 50): Promise<readonly Record<string, unknown>[]> {
    const held = await this.permissionsOf();
    if (!held.has("copilot.log.read")) {
      throw new AppError("FORBIDDEN", 403, "Missing permission: copilot.log.read.");
    }
    return withTenant(async (tx) =>
      tx
        .select({
          askedAt: copilotQuestion.createdAt,
          question: copilotQuestion.question,
          intentKey: copilotQuestion.intentKey,
          outcome: copilotQuestion.outcome,
          rowCount: copilotQuestion.rowCount,
          sources: copilotQuestion.sources,
          confidence: copilotQuestion.confidence,
          routedBy: copilotQuestion.routedBy,
        })
        .from(copilotQuestion)
        .orderBy(desc(copilotQuestion.createdAt))
        .limit(Math.min(200, Math.max(1, limit))),
    );
  }

  /* ------------------------------- internals ------------------------------- */

  /**
   * Ask the model which question was meant — text only, never data.
   *
   * What leaves the building is the user's own sentence and a list of the questions this
   * system can answer. No row, no balance, no name. If the model is unavailable, refused by
   * governance, or over budget, the deterministic refusal already in hand stands: a
   * copilot that stops working when the AI is switched off is not one a plant can trust.
   */
  private async tryModelRoute(question: string, correlationId: string): Promise<QuestionRoute | null> {
    try {
      const catalogue = listIntents().map((i) => ({ key: i.key, asks: i.question }));
      const res = await this.ai.complete<{ intentKey?: string; confidence?: number }>({
        featureKey: "copilot.retrieval_qa",
        input: { question, catalogue, correlationId },
        system:
          "Choose the ONE catalogue entry that best matches the question. Reply with its key and a " +
          "confidence from 0 to 1. If none matches, reply with an empty key. Never invent a key.",
        tier: "small",
      });
      const decided = acceptModelIntent(question, res.output?.intentKey, res.output?.confidence);
      return decided.outcome === "matched" ? decided : null;
    } catch {
      // Governance refusal, budget, provider outage — all the same here. The rules already
      // gave an answer and it stands.
      return null;
    }
  }

  /** Re-word the answer. The model sees ROWS here, so this path is opt-in. */
  private async narrate(
    intent: CopilotIntent,
    rows: readonly Record<string, unknown>[],
    question: string,
  ): Promise<string | null> {
    try {
      const res = await this.ai.complete<{ reason?: string; text?: string }>({
        featureKey: "copilot.retrieval_qa",
        input: { question, intent: intent.key, rows: rows.slice(0, 20) },
        system:
          "Summarise these rows in two sentences of plain English. Use ONLY numbers that appear in " +
          "the rows. Do not estimate, total, or infer anything that is not present.",
        tier: "small",
      });
      const text = res.output?.text ?? res.output?.reason ?? null;
      return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
    } catch {
      return null;
    }
  }

  /** The caller's effective permissions — the same resolution the route guard performs. */
  private async permissionsOf(): Promise<Set<string>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const rows = await tx
        .select({ permission: rolePermission.permission })
        .from(userRole)
        .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
        .where(eq(userRole.subject, actorId));
      return new Set(rows.map((r) => r.permission));
    });
  }

  private understanding(route: QuestionRoute, routedBy: "deterministic" | "model" | "none"): AskResult["understanding"] {
    return {
      outcome: route.outcome,
      intentKey: route.intent?.key ?? null,
      question: route.intent?.question ?? null,
      params: route.params,
      confidence: route.confidence,
      routedBy,
      explanation: route.explanation,
    };
  }

  private refuse(
    correlationId: string,
    question: string,
    code: string,
    message: string,
    understanding: AskResult["understanding"],
  ): AskResult {
    return {
      answered: false,
      answer: message,
      rows: [],
      citation: null,
      understanding,
      refusal: { code, message },
      correlationId,
    };
  }

  /**
   * Record the question — answered, refused or misunderstood alike.
   *
   * The refusals matter more than the answers. A log of only successful questions says the
   * copilot is doing well; a log including everything it could not understand is the list
   * of what to build next, and the evidence that a question about payroll was turned away
   * rather than quietly answered.
   *
   * The QUESTION is stored; the ANSWER is not. Storing the rows would create a second copy
   * of the data outside the tables whose access rules protect it — a log that has to be
   * secured as carefully as the ledger. What is kept is enough to reconstruct: which query
   * ran, over which tables, returning how many rows, for whom.
   */
  private async record(
    correlationId: string,
    question: string,
    route: QuestionRoute,
    sources: readonly string[] | null,
    rowCount: number,
    outcome: string,
  ): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    try {
      await withTenant(async (tx) => {
        await tx.insert(copilotQuestion).values({
          id: correlationId,
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          question,
          intentKey: route.intent?.key ?? null,
          outcome,
          confidence: String(route.confidence),
          routedBy: route.candidates.length > 0 ? "deterministic" : "none",
          params: route.params,
          sources: sources ? [...sources] : [],
          rowCount,
        });
        await this.audit.appendInTx(tx, {
          action: "copilot.question.asked",
          entityType: "copilot_question",
          entityId: correlationId,
          data: { intentKey: route.intent?.key ?? null, outcome, rowCount, sources: sources ?? [] },
        });
      });
    } catch (e) {
      // A logging failure must not swallow an answer the user is entitled to. It is loud
      // in the server log and invisible to them.
      this.log.error(`failed to record copilot question ${correlationId}: ${String(e)}`);
    }
  }
}
